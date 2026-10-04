import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from json import JSONDecodeError
from typing import Any, Optional, cast

import httpx

from ..config import settings
from .enedis_format import (
    address_v5_to_2026,
    contract_v5_to_2026,
    customer_v5_to_2026,
    shift_points_to_interval_start,
    v5_to_2026,
)

logger = logging.getLogger(__name__)


class RateLimiter:
    """Rate limiter for Enedis API calls (5 req/sec)"""

    def __init__(self, max_calls: int = 5, time_frame: float = 1.0):
        self.max_calls = max_calls
        self.time_frame = time_frame
        self.calls: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait if necessary to respect rate limit"""
        async with self._lock:
            now = datetime.now(UTC).timestamp()

            # Remove calls outside the time frame
            self.calls = [call for call in self.calls if now - call < self.time_frame]

            if len(self.calls) >= self.max_calls:
                # Wait until the oldest call is outside the time frame
                sleep_time = self.time_frame - (now - self.calls[0])
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                    # Refresh calls list after sleeping
                    now = datetime.now(UTC).timestamp()
                    self.calls = [call for call in self.calls if now - call < self.time_frame]

            self.calls.append(now)


# Données personnelles de situation_contrat_auto : servies par get_customer / get_contact
# uniquement, jamais recopiées dans le contrat (cache Redis, raw_data du client, admin)
IDENTITY_KEYS = ("customer", "contact_data", "person")
# États d'un service souscrit retenus au callback (défaut du Swagger subscribed_services)
ACTIVE_SERVICE_STATES = ("ACTIF", "DEMANDE")


def _without_identity(situations: Any) -> Any:
    if not isinstance(situations, list):
        return situations
    return [
        {k: v for k, v in s.items() if k not in IDENTITY_KEYS} if isinstance(s, dict) else s for s in situations
    ]


class EnedisAdapter:
    """Adapter for Enedis API with rate limiting"""

    def __init__(self) -> None:
        self.base_url = settings.enedis_base_url
        self.client_id = settings.ENEDIS_CLIENT_ID
        self.client_secret = settings.ENEDIS_CLIENT_SECRET
        self.rate_limiter = RateLimiter(max_calls=settings.ENEDIS_RATE_LIMIT)
        self.api_mode = settings.ENEDIS_API_MODE
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self) -> None:
        """Close HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None

    def _get_headers(self, access_token: str) -> dict[str, str]:
        """Get common headers for Enedis API requests including required Host header"""
        from urllib.parse import urlparse

        parsed = urlparse(self.base_url)

        return {
            "Authorization": f"Bearer {access_token}",
            "accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "software",
            "Host": parsed.netloc,
        }

    async def _make_request(
        self,
        method: str,
        url: str,
        headers: Optional[dict[str, str]] = None,
        data: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
        json: Optional[dict[str, Any]] = None,
    ) -> Any:
        """Make rate-limited request to Enedis API"""
        from ..config import settings

        await self.rate_limiter.acquire()

        if settings.DEBUG:
            logger.debug("=" * 80)
            logger.debug(f"[ENEDIS API REQUEST] {method} {url}")
            logger.debug("[ENEDIS API REQUEST] Headers:")
            if headers:
                for key, value in headers.items():
                    if key.lower() == "authorization":
                        # Mask token but show format
                        if value.startswith("Bearer "):
                            logger.debug(f"  {key}: Bearer {value[7:27]}...")
                        elif value.startswith("Basic "):
                            logger.debug(f"  {key}: Basic {value[6:26]}...")
                        else:
                            logger.debug(f"  {key}: {value[:20]}...")
                    else:
                        logger.debug(f"  {key}: {value}")
            else:
                logger.debug("  (no headers)")

            if params:
                logger.debug(f"[ENEDIS API REQUEST] Query params: {params}")

            if data:
                logger.debug(f"[ENEDIS API REQUEST] Body data: {data}")
            if json:
                logger.debug(f"[ENEDIS API REQUEST] Body JSON: {json}")
            logger.debug("=" * 80)

        client = await self.get_client()
        try:
            response = await client.request(
                method=method, url=url, headers=headers, data=data, params=params, json=json
            )

            if settings.DEBUG:
                logger.debug(f"[ENEDIS API RESPONSE] Status: {response.status_code}")

            response.raise_for_status()
            response_json = response.json()

            if settings.DEBUG:
                logger.debug(
                    f"[ENEDIS API RESPONSE] Success - keys: {list(response_json.keys()) if isinstance(response_json, dict) else 'not a dict'}"
                )
                logger.debug("=" * 80)

            return response_json
        except httpx.HTTPStatusError as e:
            if settings.DEBUG:
                logger.error(f"[ENEDIS API ERROR] HTTP {e.response.status_code}")
                logger.debug(f"[ENEDIS API ERROR] Response headers: {dict(e.response.headers)}")
                logger.debug(f"[ENEDIS API ERROR] Response body: {e.response.text}")
                logger.debug("=" * 80)

            # Parse JSON error from Enedis (e.g., ADAM-ERR0123)
            try:
                error_json = e.response.json()
                if "error" in error_json:
                    # Return the error JSON so the router can handle it
                    # Special case for ADAM-ERR0123 (data older than meter activation)
                    if error_json.get("error") == "ADAM-ERR0123":
                        logger.warning("[ENEDIS] Data requested is anterior to meter activation date")
                        return cast(dict[str, Any], error_json)  # Return error as dict for router to handle
                    # For other errors, raise exception
                    error_msg = f"{error_json.get('error')}: {error_json.get('error_description', 'Unknown error')}"
                    raise ValueError(error_msg) from e
            except (JSONDecodeError, KeyError, TypeError):
                # Failed to parse JSON (empty response, invalid JSON, etc.)
                # Continue with original exception
                pass

            raise
        except Exception as e:
            if settings.DEBUG:
                logger.error(f"[ENEDIS API ERROR] {type(e).__name__}: {str(e)}")
                logger.info("=" * 80)
            raise

    async def exchange_authorization_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for access token"""
        url = f"{self.base_url}/oauth2/v3/token"

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": redirect_uri,
        }

        logger.info("[ENEDIS] ===== REQUETE TOKEN EXCHANGE =====")
        logger.info(f"[ENEDIS] URL: {url}")
        logger.debug(f"[ENEDIS] client_id: {self.client_id}")
        logger.info(f"[ENEDIS] client_secret: {self.client_secret[:10]}...")
        logger.info(f"[ENEDIS] redirect_uri: {redirect_uri}")
        logger.info(f"[ENEDIS] code: {code[:20]}...")
        logger.info("=" * 60)

        return await self._make_request("POST", url, headers=headers, data=data)

    async def get_client_credentials_token(self) -> dict[str, Any]:
        """Get access token using client credentials flow (machine-to-machine)"""
        import base64

        url = f"{self.base_url}/oauth2/v3/token"

        # Create Basic Auth header
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        from urllib.parse import urlparse

        parsed = urlparse(self.base_url)

        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {encoded_credentials}",
            "Host": parsed.netloc,
        }

        data = {"grant_type": "client_credentials"}

        logger.info(f"[ENEDIS] Getting client credentials token from {url}")
        return await self._make_request("POST", url, headers=headers, data=data)

    async def refresh_access_token(self, refresh_token: str) -> dict[str, Any]:
        """Refresh access token"""
        url = f"{self.base_url}/oauth2/v3/token"

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }

        return await self._make_request("POST", url, headers=headers, data=data)

    # ------------------------------------------------------------------
    # Data Connect 2026 : routage selon ENEDIS_API_MODE
    # ------------------------------------------------------------------

    async def _by_mode(
        self,
        label: str,
        new: Callable[[], Awaitable[Any]],
        legacy: Callable[[], Awaitable[Any]],
    ) -> Any:
        """Appelle l'API 2026 (`new`) ou la v5 (`legacy`) selon le mode.

        En mode auto, un échec HTTP de l'API 2026 retombe sur la v5, sauf 404 (pas de
        mesure). Les erreurs métier rendues en dict (ADAM-ERR0123) ne déclenchent pas
        de repli : la v5 répondrait la même chose.
        """
        if self.api_mode == "legacy":
            return await legacy()
        if self.api_mode == "new":
            return await new()
        try:
            return await new()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # « Pas de mesure trouvée pour ce point » : la v5 n'en aurait pas davantage (quota)
                raise
            logger.warning(f"[ENEDIS] {label} : API 2026 en échec ({e}), repli sur la v5")
            return await legacy()
        except httpx.TransportError as e:
            logger.warning(f"[ENEDIS] {label} : API 2026 injoignable ({e}), repli sur la v5")
            return await legacy()

    async def _get_measure(
        self,
        usage_point_id: str,
        start: str,
        end: str,
        access_token: str,
        *,
        resource: str,
        v5_path: str,
        grandeur_metier: str,
        grandeur_physique: str,
        pas: Optional[str] = None,
        extra_params: Optional[dict[str, str]] = None,
        load_curve: bool = False,
    ) -> dict[str, Any]:
        headers = self._get_headers(access_token)

        async def new() -> dict[str, Any]:
            params = {"pointId": usage_point_id, "dateDebut": start, "dateFin": end, **(extra_params or {})}
            url = f"{self.base_url}/mesure_synchrone_auto/v2/{resource}"
            return cast(dict[str, Any], await self._make_request("GET", url, headers=headers, params=params))

        async def legacy() -> dict[str, Any]:
            params = {"usage_point_id": usage_point_id, "start": start, "end": end}
            response = await self._make_request("GET", f"{self.base_url}{v5_path}", headers=headers, params=params)
            return v5_to_2026(response, grandeur_metier=grandeur_metier, grandeur_physique=grandeur_physique, pas=pas)

        response = await self._by_mode(resource, new, legacy)
        # Enedis horodate la fin de l'intervalle : on le ramène au début (cf. enedis_format)
        return shift_points_to_interval_start(response) if load_curve else response

    async def get_consumption_daily(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Consommation quotidienne (Wh)"""
        return await self._get_measure(
            usage_point_id,
            start,
            end,
            access_token,
            resource="consommation_quotidienne",
            v5_path="/metering_data_dc/v5/daily_consumption",
            grandeur_metier="CONS",
            grandeur_physique="EA",
            pas="P1D",
        )

    async def get_consumption_detail(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Courbe de charge de consommation (W), horodatée en début d'intervalle"""
        return await self._get_measure(
            usage_point_id,
            start,
            end,
            access_token,
            resource="courbe_de_charge_consommation",
            v5_path="/metering_data_clc/v5/consumption_load_curve",
            grandeur_metier="CONS",
            grandeur_physique="PA",
            load_curve=True,
        )

    async def get_max_power(self, usage_point_id: str, start: str, end: str, access_token: str) -> dict[str, Any]:
        """Puissance maximale quotidienne (VA)"""
        return await self._get_measure(
            usage_point_id,
            start,
            end,
            access_token,
            resource="puissance_conso_max_quotidienne",
            v5_path="/metering_data_dcmp/v5/daily_consumption_max_power",
            grandeur_metier="CONS",
            grandeur_physique="PMA",
            pas="P1D",
            extra_params={"mesuresPas": "P1D", "grandeurPhysique": "PMA"},
        )

    async def get_production_daily(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Production quotidienne (Wh)"""
        return await self._get_measure(
            usage_point_id,
            start,
            end,
            access_token,
            resource="production_quotidienne",
            v5_path="/metering_data_dp/v5/daily_production",
            grandeur_metier="PROD",
            grandeur_physique="EA",
            pas="P1D",
        )

    async def get_production_detail(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Courbe de charge de production (W), horodatée en début d'intervalle"""
        return await self._get_measure(
            usage_point_id,
            start,
            end,
            access_token,
            resource="courbe_de_charge_production",
            v5_path="/metering_data_plc/v5/production_load_curve",
            grandeur_metier="PROD",
            grandeur_physique="PA",
            load_curve=True,
        )

    async def _get_v5_customer(self, path: str, usage_point_id: str, access_token: str) -> dict[str, Any]:
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id}
        return cast(
            dict[str, Any], await self._make_request("GET", f"{self.base_url}{path}", headers=headers, params=params)
        )

    async def _get_itc(self, api: str, usage_point_id: str, access_token: str) -> Any:
        """API ITC Data Connect 2026 : le PRM est dans le CHEMIN (en query, Enedis répond 500)"""
        url = f"{self.base_url}/{api}/v1/{usage_point_id}"
        return await self._make_request("GET", url, headers=self._get_headers(access_token))

    async def get_contract(self, usage_point_id: str, access_token: str) -> dict[str, Any]:
        """Contrat agrégé : {"situation_contrat": [...], "synthese_contrat": {...}, "comptage": {...} | None}

        `comptage` (plages heures creuses) vaut None si l'API répond en erreur, par exemple
        tant que comptage_auto n'est pas souscrite pour l'application (403 au 04/10/2026).
        """

        async def new() -> dict[str, Any]:
            situation = await self._get_itc("situation_contrat_auto", usage_point_id, access_token)
            synthese = await self._get_itc("synth_contrat_auto", usage_point_id, access_token)
            try:
                comptage = await self._get_itc("comptage_auto", usage_point_id, access_token)
            except (httpx.HTTPStatusError, httpx.TransportError, ValueError) as e:
                logger.warning(f"[ENEDIS] comptage_auto indisponible, contrat sans heures creuses : {e}")
                comptage = None
            if comptage is None and self.api_mode == "auto":
                comptage = await self._offpeak_from_v5(usage_point_id, access_token)
            return {"situation_contrat": _without_identity(situation), "synthese_contrat": synthese, "comptage": comptage}

        async def legacy() -> dict[str, Any]:
            response = await self._get_v5_customer(
                "/customers_upc/v5/usage_points/contracts", usage_point_id, access_token
            )
            return contract_v5_to_2026(response)

        return cast(dict[str, Any], await self._by_mode("contrat", new, legacy))

    async def _offpeak_from_v5(self, usage_point_id: str, access_token: str) -> Optional[dict[str, Any]]:
        """Mode auto : plages heures creuses lues en v5 tant que comptage_auto est indisponible"""
        try:
            response = await self._get_v5_customer(
                "/customers_upc/v5/usage_points/contracts", usage_point_id, access_token
            )
        except (httpx.HTTPStatusError, httpx.TransportError, ValueError) as e:
            logger.warning(f"[ENEDIS] Heures creuses v5 indisponibles : {e}")
            return None
        return cast(Optional[dict[str, Any]], contract_v5_to_2026(response).get("comptage"))

    async def get_address(self, usage_point_id: str, access_token: str) -> dict[str, Any]:
        """Adresse du point : {"address": {...}} (donnees_generales_auto)"""

        async def new() -> dict[str, Any]:
            return cast(dict[str, Any], await self._get_itc("donnees_generales_auto", usage_point_id, access_token))

        async def legacy() -> dict[str, Any]:
            response = await self._get_v5_customer(
                "/customers_upa/v5/usage_points/addresses", usage_point_id, access_token
            )
            return address_v5_to_2026(response)

        return cast(dict[str, Any], await self._by_mode("adresse", new, legacy))

    async def _get_situation_contrat(self, v5_path: str, usage_point_id: str, access_token: str) -> Any:
        async def new() -> Any:
            return await self._get_itc("situation_contrat_auto", usage_point_id, access_token)

        async def legacy() -> Any:
            return customer_v5_to_2026(await self._get_v5_customer(v5_path, usage_point_id, access_token))

        return await self._by_mode("client", new, legacy)

    async def get_customer(self, usage_point_id: str, access_token: str) -> Any:
        """Identité du titulaire : situation_contrat_auto (`person`, `customer`)"""
        return await self._get_situation_contrat("/customers_i/v5/identity", usage_point_id, access_token)

    async def get_contact(self, usage_point_id: str, access_token: str) -> Any:
        """Coordonnées du titulaire : situation_contrat_auto (`contact_data`)"""
        return await self._get_situation_contrat("/customers_cd/v5/contact_data", usage_point_id, access_token)

    async def get_usage_points_from_authorization(self, autorisation_id: int, access_token: str) -> list[str]:
        """PRM d'un consentement Data Connect v2 (callback `autorisation_id`), via POST /subscribed_services/v1

        Seuls les services ACTIF ou DEMANDE sont retenus ; un PRM en autoconsommation porte deux
        services (soutirage et injection) mais n'est rendu qu'une fois.
        """
        url = f"{self.base_url}/subscribed_services/v1"
        body = {"autorisationId": autorisation_id, "comptage": False}
        response = await self._make_request("POST", url, headers=self._get_headers(access_token), json=body)
        prms: list[str] = []
        for service in response.get("serviceSouscrit", []):
            prm = service.get("pointId")
            if prm and service.get("etatCode") in ACTIVE_SERVICE_STATES and prm not in prms:
                prms.append(prm)
        return prms


enedis_adapter = EnedisAdapter()
