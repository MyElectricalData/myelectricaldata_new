"""Calendrier EDF Zen Week-End Option Flex : jours Éco, Sobriété et Bonus (MED-27)

Source : API EDF non documentée `getOPMStatut` (celle du site particulier.edf.fr), interrogée
jour par jour : `dateRelevant=YYYY-MM-DD` rend le type du jour J et celui de J+1
(`{"couleurJourJ": "RAS", "couleurJourJ1": "ZENF_PM"}`). L'historique est disponible depuis le
lancement de l'offre (novembre 2023).

Le pare-feu EDF répond parfois une page HTML (403, ou 200) au lieu du JSON : seule une réponse
`application/json` est acceptée, et le rattrapage de l'historique se fait par petits lots.
"""

import logging
from datetime import date, datetime, timedelta
from typing import Any, cast
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.zen_flex_day import ZenFlexDay, ZenFlexDayType

logger = logging.getLogger(__name__)

OPM_URL = "https://particulier.edf.fr/services/rest/opm/getOPMStatut"
# Sans ce paramètre, EDF sert sa page d'erreur
PLAASMA_COMMERCE_URL = "https://api-commerce.edf.fr"
USER_AGENT = "MyElectricalData (+https://github.com/MyElectricalData/myelectricaldata_new)"

# Lancement de l'offre : premier jour Sobriété le 29/11/2023
OFFER_START = date(2023, 11, 1)
# Appels de rattrapage par passage (une passe toutes les 10 minutes : ~700 jours en ~2 h)
BACKFILL_LIMIT = 30

# Valeurs EDF → type de jour. NON_DETERMINE (J+1 pas encore publié) et toute valeur inconnue
# ne donnent aucun type : un jour inconnu n'est jamais supposé Éco
OPM_VALUES: dict[str, ZenFlexDayType] = {
    "RAS": ZenFlexDayType.ECO,
    "ZENF_PM": ZenFlexDayType.SOBRIETE,
    "ZENF_BONIF": ZenFlexDayType.BONUS,  # valeur relevée sur les jours bonus de 2023 et 2025
    "ZENF_BONUS": ZenFlexDayType.BONUS,  # variante citée par jarthod/tempo-api
}


class EDFZenFlexError(Exception):
    """Réponse EDF inexploitable (erreur HTTP, page HTML du pare-feu, JSON invalide)"""


def parse_opm_value(raw: str | None) -> ZenFlexDayType | None:
    """Type de jour d'une valeur `couleurJourJ` / `couleurJourJ1`, None si indéterminé ou inconnu"""
    if not raw:
        return None
    value = raw.strip().upper()
    day_type = OPM_VALUES.get(value)
    if day_type is None and value != "NON_DETERMINE":
        logger.warning(f"[ZEN_FLEX] Valeur EDF inconnue ignorée : {raw!r}")
    return day_type


def paris_today() -> date:
    return datetime.now(ZoneInfo("Europe/Paris")).date()


class EDFZenFlexService:
    """Lecture du calendrier Zen Flex chez EDF et cache en base (table zen_flex_days)"""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport  # injecté par les tests

    async def fetch_status(self, day: date) -> tuple[ZenFlexDayType | None, ZenFlexDayType | None]:
        """Types du jour `day` et du lendemain selon EDF"""
        raw_today, raw_tomorrow = await self._fetch_raw(day)
        return parse_opm_value(raw_today), parse_opm_value(raw_tomorrow)

    async def _fetch_raw(self, day: date) -> tuple[str | None, str | None]:
        """Valeurs EDF brutes du jour `day` et du lendemain"""
        params = {"dateRelevant": day.isoformat(), "urlPlaasmaCommerce": PLAASMA_COMMERCE_URL}
        headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=10.0) as client:
                response = await client.get(OPM_URL, params=params, headers=headers)
        except httpx.HTTPError as e:
            raise EDFZenFlexError(f"EDF injoignable pour le {day} : {e}") from e

        content_type = response.headers.get("content-type", "")
        if response.status_code != 200 or "application/json" not in content_type:
            raise EDFZenFlexError(f"Réponse EDF refusée pour le {day} : HTTP {response.status_code} ({content_type})")
        try:
            payload = response.json()
        except ValueError as e:
            raise EDFZenFlexError(f"JSON EDF invalide pour le {day} : {e}") from e

        if not isinstance(payload, dict):
            raise EDFZenFlexError(f"Réponse EDF inattendue pour le {day} : {payload!r}")
        return payload.get("couleurJourJ"), payload.get("couleurJourJ1")

    async def update_zen_flex_cache(
        self, db: AsyncSession, today: date | None = None, backfill_limit: int = BACKFILL_LIMIT
    ) -> dict[str, Any]:
        """Rafraîchit aujourd'hui et demain, puis rattrape au plus `backfill_limit` jours manquants

        Le rattrapage part de la veille et remonte vers le lancement de l'offre : la saison en cours
        est complète en premier. Une erreur EDF arrête la passe (pas d'insistance face au pare-feu),
        la suivante reprend où celle-ci s'est arrêtée.
        """
        today = today or paris_today()
        result: dict[str, Any] = {"updated": 0, "backfilled": 0, "errors": []}

        rows = (await db.execute(select(ZenFlexDay).where(ZenFlexDay.date >= OFFER_START))).scalars().all()
        known: dict[date, ZenFlexDay] = {cast(date, row.date): row for row in rows}

        def store(day: date, raw: str | None) -> int:
            day_type = parse_opm_value(raw)
            if day_type is None:
                return 0
            row = known.get(day)
            if row is None:
                row = ZenFlexDay(id=day.isoformat(), date=day, day_type=day_type, raw_value=raw)
                db.add(row)
                known[day] = row
                return 1
            if row.day_type != day_type or row.raw_value != raw:
                row.day_type = day_type  # type: ignore[assignment]
                row.raw_value = raw  # type: ignore[assignment]
                return 1
            return 0

        # 1. Aujourd'hui et demain : toujours relus (J+1 publié en cours de journée)
        try:
            raw_today, raw_tomorrow = await self._fetch_raw(today)
        except EDFZenFlexError as e:
            logger.error(f"[ZEN_FLEX] {e}")
            result["errors"].append(str(e))
            return result
        result["updated"] += store(today, raw_today) + store(today + timedelta(days=1), raw_tomorrow)
        await db.commit()

        # 2. Rattrapage : un appel sur la veille d'un jour manquant renseigne les deux jours
        missing = (today - timedelta(days=n) for n in range(1, (today - OFFER_START).days + 1))
        calls = 0
        for day in missing:
            if calls >= backfill_limit:
                break
            if day in known:
                continue
            relevant = max(day - timedelta(days=1), OFFER_START)
            calls += 1
            try:
                raw_day, raw_next = await self._fetch_raw(relevant)
            except EDFZenFlexError as e:
                logger.warning(f"[ZEN_FLEX] Rattrapage interrompu : {e}")
                result["errors"].append(str(e))
                break
            result["backfilled"] += store(relevant, raw_day) + store(relevant + timedelta(days=1), raw_next)

        if calls:
            await db.commit()
            logger.info(f"[ZEN_FLEX] Rattrapage : {result['backfilled']} jours en {calls} appels EDF")
        return result

    async def get_days(self, db: AsyncSession, start: date, end: date) -> list[ZenFlexDay]:
        """Jours connus entre `start` et `end` inclus, triés par date"""
        query = select(ZenFlexDay).where(ZenFlexDay.date >= start, ZenFlexDay.date <= end).order_by(ZenFlexDay.date)
        return list((await db.execute(query)).scalars().all())


edf_zen_flex_service = EDFZenFlexService()
