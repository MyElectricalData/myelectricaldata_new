"""Sync Service for Client Mode

This service synchronizes data from MyElectricalData API to local PostgreSQL.
It runs every 30 minutes and fetches:
- Up to 2 years of detailed data (30-min intervals)
- Up to 3 years of daily data

Data is stored permanently in PostgreSQL for local analysis and export.
"""

import asyncio
import logging
import httpx
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select, and_, func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.myelectricaldata import get_med_adapter
from ..models import PDL, EnergyProvider, EnergyOffer
from ..models.ecowatt import EcoWatt
from ..models.tempo_day import TempoDay, TempoColor
from ..models.zen_flex_day import ZenFlexDay, ZenFlexDayType
from .edf_zen_flex import OFFER_START, paris_today
from ..models.client_mode import (
    AddressData,
    ConsumptionData,
    ContractData,
    DataGranularity,
    MaxPowerData,
    ProductionData,
    SyncStatus,
    SyncStatusType,
)
from ..adapters.enedis_format import address_v5_to_2026, contract_v5_to_2026, extract_points
from ..services.enedis_contract import parse_address, parse_contract
from ..services.local_data import LocalDataService, _missing_ranges, _unwrap, parse_max_power_points

logger = logging.getLogger(__name__)

# Maximum history to fetch
MAX_DETAILED_DAYS = 730  # 2 years
MAX_DAILY_DAYS = 1095  # 3 years

# Contrat et adresse changent rarement : un rafraîchissement par jour suffit
METADATA_REFRESH_HOURS = 24
# Enedis peut publier ou corriger J-1 et J-2 avec retard : on les redemande toutes les 6 h
DAILY_REFRESH_WINDOW_DAYS = 2
DAILY_REFRESH_INTERVAL = timedelta(hours=6)


def _normalize_utc(ts: datetime | None) -> datetime | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        return ts.replace(tzinfo=UTC)
    return ts.astimezone(UTC)


# Verrous globaux pour éviter les syncs concurrentes
_energy_sync_lock = asyncio.Lock()

# Contrainte quotidienne en NULLS NOT DISTINCT (migration c3d4e5f6g7h8, ignorée sous PostgreSQL < 15),
# lue une fois par process
_daily_upsert_effective: bool | None = None


class SyncService:
    """Service to sync data from MyElectricalData API to local PostgreSQL"""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.adapter = get_med_adapter()

    async def sync_pdl_list(self, user_id: str) -> list[dict[str, Any]]:
        """Sync PDL list from remote API to local database

        This creates PDL records in the local database for each PDL
        returned by the remote API.

        Args:
            user_id: The local user ID to associate PDLs with

        Returns:
            List of synced PDL dicts
        """
        logger.info("[SYNC] Syncing PDL list from remote API...")

        try:
            # Get all usage points from API
            usage_points_response = await self.adapter.get_usage_points()
            remote_pdls = usage_points_response.get("usage_points", [])

            logger.info(f"[SYNC] Found {len(remote_pdls)} PDLs in remote API")

            synced_pdls = []
            for remote_pdl in remote_pdls:
                usage_point_id = remote_pdl.get("usage_point_id")
                if not usage_point_id:
                    continue

                # Check if PDL already exists locally
                result = await self.db.execute(
                    select(PDL).where(PDL.usage_point_id == usage_point_id)
                )
                existing_pdl = result.scalar_one_or_none()

                if existing_pdl:
                    # Update existing PDL with remote data
                    existing_pdl.name = remote_pdl.get("name", existing_pdl.name)
                    existing_pdl.subscribed_power = remote_pdl.get("subscribed_power")
                    existing_pdl.pricing_option = remote_pdl.get("pricing_option")
                    existing_pdl.has_consumption = remote_pdl.get("has_consumption", True)
                    existing_pdl.has_production = remote_pdl.get("has_production", False)
                    existing_pdl.is_active = remote_pdl.get("is_active", True)
                    # Parse offpeak_hours
                    offpeak = remote_pdl.get("offpeak_hours")
                    if isinstance(offpeak, dict):
                        existing_pdl.offpeak_hours = offpeak
                    elif isinstance(offpeak, list):
                        existing_pdl.offpeak_hours = {"ranges": offpeak}

                    logger.debug(f"[SYNC] Updated existing PDL: {usage_point_id}")
                    synced_pdls.append({"usage_point_id": usage_point_id, "action": "updated"})
                else:
                    # Create new PDL
                    # Parse offpeak_hours
                    offpeak = remote_pdl.get("offpeak_hours")
                    offpeak_dict = None
                    if isinstance(offpeak, dict):
                        offpeak_dict = offpeak
                    elif isinstance(offpeak, list):
                        offpeak_dict = {"ranges": offpeak}

                    new_pdl = PDL(
                        user_id=user_id,
                        usage_point_id=usage_point_id,
                        name=remote_pdl.get("name", f"PDL {usage_point_id[-4:]}"),
                        subscribed_power=remote_pdl.get("subscribed_power"),
                        pricing_option=remote_pdl.get("pricing_option"),
                        offpeak_hours=offpeak_dict,
                        has_consumption=remote_pdl.get("has_consumption", True),
                        has_production=remote_pdl.get("has_production", False),
                        is_active=remote_pdl.get("is_active", True),
                    )
                    self.db.add(new_pdl)
                    logger.info(f"[SYNC] Created new PDL: {usage_point_id} ({remote_pdl.get('name')})")
                    synced_pdls.append({"usage_point_id": usage_point_id, "action": "created"})

            await self.db.commit()
            logger.info(f"[SYNC] PDL list sync complete: {len(synced_pdls)} PDLs")
            return synced_pdls

        except Exception as e:
            logger.error(f"[SYNC] Failed to sync PDL list: {e}")
            raise

    async def sync_all(self) -> dict[str, Any]:
        """Sync all data for all PDLs

        Returns:
            Dict with sync results for each PDL
        """
        logger.info("[SYNC] Starting full sync...")
        results: dict[str, Any] = {"pdls": {}, "errors": [], "started_at": datetime.now(UTC).isoformat()}

        try:
            # Get all usage points from API
            usage_points_response = await self.adapter.get_usage_points()
            usage_points = usage_points_response.get("usage_points", [])

            logger.info(f"[SYNC] Found {len(usage_points)} usage points to sync")

            for up in usage_points:
                usage_point_id = up.get("usage_point_id")
                if not usage_point_id:
                    continue

                try:
                    result = await self.sync_pdl(usage_point_id)
                    results["pdls"][usage_point_id] = result
                except Exception as e:
                    logger.error(f"[SYNC] Error syncing PDL {usage_point_id}: {e}")
                    results["pdls"][usage_point_id] = {"error": str(e)}
                    results["errors"].append({"pdl": usage_point_id, "error": str(e)})

        except Exception as e:
            logger.error(f"[SYNC] Failed to get usage points: {e}")
            results["errors"].append({"pdl": None, "error": str(e)})

        results["completed_at"] = datetime.now(UTC).isoformat()
        results["success"] = len(results["errors"]) == 0

        logger.info(f"[SYNC] Sync completed. Success: {results['success']}")
        return results

    async def sync_pdl(self, usage_point_id: str) -> dict[str, Any]:
        """Sync all data for a specific PDL

        Args:
            usage_point_id: 14-digit PDL number

        Returns:
            Dict with sync results
        """
        logger.info(f"[SYNC] Syncing PDL {usage_point_id}...")

        # Check if PDL is active before syncing
        pdl_check = await self.db.execute(
            select(PDL).where(PDL.usage_point_id == usage_point_id)
        )
        pdl_check_result = pdl_check.scalar_one_or_none()

        if pdl_check_result and not pdl_check_result.is_active:
            logger.info(f"[SYNC] Skipping PDL {usage_point_id} (is_active=False)")
            return {
                "usage_point_id": usage_point_id,
                "consumption_daily": "skipped (inactive PDL)",
                "consumption_detail": "skipped (inactive PDL)",
                "max_power": "skipped (inactive PDL)",
                "production_daily": "skipped (inactive PDL)",
                "production_detail": "skipped (inactive PDL)",
                "contract": "skipped (inactive PDL)",
                "address": "skipped (inactive PDL)",
            }

        result: dict[str, Any] = {
            "usage_point_id": usage_point_id,
            "consumption_daily": None,
            "consumption_detail": None,
            "max_power": None,
            "production_daily": None,
            "production_detail": None,
            "contract": None,
            "address": None,
        }

        # Sync contract and address first (they're small), at most once a day to spare the API quota
        try:
            if await self._should_refresh_metadata(ContractData, usage_point_id):
                await self._sync_contract(usage_point_id)
                result["contract"] = "success"
            else:
                result["contract"] = "skipped (recent)"
        except Exception as e:
            logger.warning(f"[SYNC] Failed to sync contract for {usage_point_id}: {e}")
            result["contract"] = f"error: {e}"

        try:
            if await self._should_refresh_metadata(AddressData, usage_point_id):
                await self._sync_address(usage_point_id)
                result["address"] = "success"
            else:
                result["address"] = "skipped (recent)"
        except Exception as e:
            logger.warning(f"[SYNC] Failed to sync address for {usage_point_id}: {e}")
            result["address"] = f"error: {e}"

        # Sync consumption data
        try:
            daily_count = await self._sync_consumption_daily(usage_point_id)
            result["consumption_daily"] = f"synced {daily_count} days"
        except Exception as e:
            logger.warning(f"[SYNC] Failed to sync consumption daily for {usage_point_id}: {e}")
            result["consumption_daily"] = f"error: {e}"

        try:
            detail_count = await self._sync_consumption_detail(usage_point_id)
            result["consumption_detail"] = f"synced {detail_count} intervals"
        except Exception as e:
            logger.warning(f"[SYNC] Failed to sync consumption detail for {usage_point_id}: {e}")
            result["consumption_detail"] = f"error: {e}"

        try:
            max_power_count = await self._sync_consumption_max_power(usage_point_id)
            result["max_power"] = f"synced {max_power_count} days"
        except Exception as e:
            logger.warning(f"[SYNC] Failed to sync max power for {usage_point_id}: {e}")
            result["max_power"] = f"error: {e}"

        # Sync production data only if PDL has production
        pdl_result = await self.db.execute(
            select(PDL).where(PDL.usage_point_id == usage_point_id)
        )
        pdl = pdl_result.scalar_one_or_none()

        if pdl and pdl.has_production:
            try:
                daily_count = await self._sync_production_daily(usage_point_id)
                result["production_daily"] = f"synced {daily_count} days"
            except Exception as e:
                logger.warning(f"[SYNC] Failed to sync production daily for {usage_point_id}: {e}")
                result["production_daily"] = f"error: {e}"

            try:
                detail_count = await self._sync_production_detail(usage_point_id)
                result["production_detail"] = f"synced {detail_count} intervals"
            except Exception as e:
                logger.warning(f"[SYNC] Failed to sync production detail for {usage_point_id}: {e}")
                result["production_detail"] = f"error: {e}"
        else:
            logger.debug(f"[SYNC] Skipping production sync for {usage_point_id} (has_production=False)")
            result["production_daily"] = "skipped (no production)"
            result["production_detail"] = "skipped (no production)"

        return result

    async def _should_refresh_metadata(
        self, model_class: type[ContractData | AddressData], usage_point_id: str
    ) -> bool:
        """True si le contrat ou l'adresse n'ont pas été rafraîchis depuis METADATA_REFRESH_HOURS."""
        result = await self.db.execute(
            select(model_class.last_sync_at).where(model_class.usage_point_id == usage_point_id)
        )
        last_sync_at = _normalize_utc(result.scalar_one_or_none())
        if last_sync_at is None:
            return True
        return datetime.now(UTC) - last_sync_at >= timedelta(hours=METADATA_REFRESH_HOURS)

    async def _daily_upsert_is_effective(self) -> bool:
        """True si ON CONFLICT joue pour les lignes quotidiennes (interval_start NULL).

        Sans NULLS NOT DISTINCT, redemander un jour déjà en base l'insère une seconde fois :
        le rafraîchissement forcé de J-2/J-1 multiplierait alors les totaux quotidiens.
        """
        global _daily_upsert_effective
        if _daily_upsert_effective is None:
            result = await self.db.execute(
                text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'uq_consumption_data'")
            )
            definition = result.scalar() or ""
            _daily_upsert_effective = "NULLS NOT DISTINCT" in definition
            if not _daily_upsert_effective:
                logger.warning(
                    "[SYNC] Contrainte quotidienne sans NULLS NOT DISTINCT (PostgreSQL < 15) : "
                    "pas de rafraîchissement forcé de J-2/J-1"
                )
        return _daily_upsert_effective

    def _force_refresh_from(self, sync_status: SyncStatus, start_date: date, end_date: date) -> date | None:
        """Début de la fenêtre à redemander (J-2, J-1) si le dernier passage date de plus de 6 h."""
        last_sync_at = _normalize_utc(sync_status.last_sync_at)
        if last_sync_at is not None and datetime.now(UTC) - last_sync_at < DAILY_REFRESH_INTERVAL:
            return None
        return max(start_date, end_date - timedelta(days=DAILY_REFRESH_WINDOW_DAYS))

    async def _sync_contract(self, usage_point_id: str) -> None:
        """Sync contract data for a PDL"""
        response = await self.adapter.get_contract(usage_point_id)
        # Enveloppe {success, data} de la passerelle ; contrat Data Connect 2026 (ou v5 converti)
        contract = contract_v5_to_2026(_unwrap(response))
        if not isinstance(contract, dict) or "situation_contrat" not in contract:
            logger.warning(f"[SYNC] Contrat illisible pour {usage_point_id}, valeurs en base conservées")
            return
        parsed = parse_contract(contract)

        # Check if contract already exists
        result = await self.db.execute(
            select(ContractData).where(ContractData.usage_point_id == usage_point_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing contract : un champ absent (comptage indisponible…) ne remplace pas la valeur en base
            for field in ("subscribed_power", "offpeak_hours", "segment"):
                if parsed.get(field) is not None:
                    setattr(existing, field, parsed[field])
            existing.raw_data = contract
            existing.last_sync_at = datetime.now(UTC)
        else:
            # Create new contract
            new_contract = ContractData(
                usage_point_id=usage_point_id,
                subscribed_power=parsed.get("subscribed_power"),
                offpeak_hours=parsed.get("offpeak_hours"),
                segment=parsed.get("segment"),
                raw_data=contract,
                last_sync_at=datetime.now(UTC),
            )
            self.db.add(new_contract)

        await self.db.commit()
        logger.debug(f"[SYNC] Contract synced for {usage_point_id}")

    async def _sync_address(self, usage_point_id: str) -> None:
        """Sync address data for a PDL"""
        response = await self.adapter.get_address(usage_point_id)
        # Enveloppe {success, data} de la passerelle ; adresse donnees_generales_auto (ou v5 convertie)
        address_data = address_v5_to_2026(_unwrap(response))
        fields = parse_address(address_data) if "address" in address_data else {}

        # Check if address already exists
        result = await self.db.execute(
            select(AddressData).where(AddressData.usage_point_id == usage_point_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing address
            existing.street = fields.get("street")
            existing.postal_code = fields.get("postal_code")
            existing.city = fields.get("city")
            existing.country = fields.get("country")
            existing.insee_code = fields.get("insee_code")
            existing.raw_data = address_data
            existing.last_sync_at = datetime.now(UTC)
        else:
            # Create new address
            address = AddressData(
                usage_point_id=usage_point_id,
                street=fields.get("street"),
                postal_code=fields.get("postal_code"),
                city=fields.get("city"),
                country=fields.get("country"),
                insee_code=fields.get("insee_code"),
                raw_data=address_data,
                last_sync_at=datetime.now(UTC),
            )
            self.db.add(address)

        await self.db.commit()
        logger.debug(f"[SYNC] Address synced for {usage_point_id}")

    async def _sync_consumption_daily(self, usage_point_id: str) -> int:
        """Sync daily consumption data

        Returns:
            Number of records synced
        """
        return await self._sync_energy_data(
            usage_point_id=usage_point_id,
            data_type="consumption",
            granularity=DataGranularity.DAILY,
            max_days=MAX_DAILY_DAYS,
            fetch_func=self.adapter.get_consumption_daily,
            model_class=ConsumptionData,
        )

    async def _sync_consumption_detail(self, usage_point_id: str) -> int:
        """Sync detailed consumption data (30-min intervals)

        Returns:
            Number of records synced
        """
        return await self._sync_energy_data(
            usage_point_id=usage_point_id,
            data_type="consumption",
            granularity=DataGranularity.DETAILED,
            max_days=MAX_DETAILED_DAYS,
            fetch_func=self.adapter.get_consumption_detail,
            model_class=ConsumptionData,
        )

    async def _sync_production_daily(self, usage_point_id: str) -> int:
        """Sync daily production data"""
        return await self._sync_energy_data(
            usage_point_id=usage_point_id,
            data_type="production",
            granularity=DataGranularity.DAILY,
            max_days=MAX_DAILY_DAYS,
            fetch_func=self.adapter.get_production_daily,
            model_class=ProductionData,
        )

    async def _sync_production_detail(self, usage_point_id: str) -> int:
        """Sync detailed production data"""
        return await self._sync_energy_data(
            usage_point_id=usage_point_id,
            data_type="production",
            granularity=DataGranularity.DETAILED,
            max_days=MAX_DETAILED_DAYS,
            fetch_func=self.adapter.get_production_detail,
            model_class=ProductionData,
        )

    async def _find_missing_ranges(
        self,
        model_class: type[ConsumptionData | ProductionData],
        usage_point_id: str,
        start_date: date,
        end_date: date,
        granularity: DataGranularity,
        force_refresh_from: date | None = None,
    ) -> list[tuple[date, date]]:
        """Détecte les dates manquantes dans la base locale et les regroupe en plages.

        Interroge les dates distinctes existantes, puis identifie les trous.
        Retourne des tuples (start, end) avec end exclusif.
        """
        result = await self.db.execute(
            select(func.distinct(model_class.date)).where(
                and_(
                    model_class.usage_point_id == usage_point_id,
                    model_class.granularity == granularity,
                    model_class.date >= start_date,
                    model_class.date < end_date,
                )
            )
        )
        existing_dates = {row[0] for row in result.fetchall()}
        return _missing_ranges(start_date, end_date, existing_dates, force_refresh_from)

    async def _sync_consumption_max_power(self, usage_point_id: str) -> int:
        """Sync daily max power (value in VA + time of the peak), same window as daily data."""
        sync_status = await self._get_or_create_sync_status(
            usage_point_id, "max_power", DataGranularity.DAILY
        )

        # [start_date, end_date[ avec end_date = today : J-1 inclus (Enedis refuse une fin à demain)
        end_date = date.today()
        start_date = end_date - timedelta(days=MAX_DAILY_DAYS)

        result = await self.db.execute(
            select(func.distinct(MaxPowerData.date)).where(
                and_(
                    MaxPowerData.usage_point_id == usage_point_id,
                    MaxPowerData.date >= start_date,
                    MaxPowerData.date < end_date,
                )
            )
        )
        existing_dates = {row[0] for row in result.fetchall()}
        missing_ranges = _missing_ranges(
            start_date, end_date, existing_dates, self._force_refresh_from(sync_status, start_date, end_date)
        )

        if not missing_ranges:
            logger.debug(f"[SYNC] max_power pour {usage_point_id}: aucune donnée manquante")
            return 0

        sync_status.status = SyncStatusType.RUNNING
        sync_status.last_sync_at = datetime.now(UTC)
        await self.db.commit()

        total_synced = 0
        errors: list[str] = []

        for range_start, range_end in missing_ranges:
            current_start = range_start
            while current_start < range_end:
                current_end = min(current_start + timedelta(days=365), range_end)
                try:
                    response = await self.adapter.get_consumption_max_power(
                        usage_point_id, current_start.isoformat(), current_end.isoformat()
                    )
                    records = parse_max_power_points(response, usage_point_id)
                    if records:
                        await LocalDataService(self.db).save_max_power(records)
                        total_synced += len(records)
                except Exception as e:
                    await self.db.rollback()
                    await self.db.refresh(sync_status)
                    logger.warning(
                        f"[SYNC] Erreur fetch max_power pour {usage_point_id} "
                        f"({current_start} - {current_end}): {e}"
                    )
                    errors.append(str(e))
                current_start = current_end

        sync_status.status = SyncStatusType.PARTIAL if errors else SyncStatusType.SUCCESS
        sync_status.error_message = "; ".join(errors[:5]) if errors else None
        sync_status.error_count += len(errors)
        sync_status.records_synced_last_run = total_synced
        sync_status.total_records += total_synced
        if total_synced > 0:
            bounds = await self.db.execute(
                select(func.min(MaxPowerData.date), func.max(MaxPowerData.date)).where(
                    MaxPowerData.usage_point_id == usage_point_id
                )
            )
            sync_status.oldest_data_date, sync_status.newest_data_date = bounds.one()
        sync_status.next_sync_at = datetime.now(UTC) + timedelta(minutes=30)
        await self.db.commit()

        logger.info(f"[SYNC] max_power pour {usage_point_id}: {total_synced} jours synchronisés")
        return total_synced

    async def _sync_energy_data(
        self,
        usage_point_id: str,
        data_type: str,
        granularity: DataGranularity,
        max_days: int,
        fetch_func: Any,
        model_class: type[ConsumptionData | ProductionData],
    ) -> int:
        """Generic method to sync energy data (consumption or production)

        Stratégie local-first : détecte les trous dans la base locale
        et ne fetch que les plages manquantes depuis la passerelle.

        Args:
            usage_point_id: PDL number
            data_type: 'consumption' or 'production'
            granularity: DAILY or DETAILED
            max_days: Maximum number of days to fetch
            fetch_func: API function to call
            model_class: SQLAlchemy model class

        Returns:
            Number of records synced
        """
        # Get or create sync status
        sync_status = await self._get_or_create_sync_status(
            usage_point_id, data_type, granularity
        )

        # Plage totale [start_date, end_date[ avec end_date = today : J-1 inclus
        end_date = date.today()
        start_date = end_date - timedelta(days=max_days)

        # Détecter les trous dans la base locale (et redemander J-2/J-1 en quotidien, corrigés par Enedis)
        force_refresh_from = (
            self._force_refresh_from(sync_status, start_date, end_date)
            if granularity == DataGranularity.DAILY and await self._daily_upsert_is_effective()
            else None
        )
        missing_ranges = await self._find_missing_ranges(
            model_class, usage_point_id, start_date, end_date, granularity, force_refresh_from
        )

        if not missing_ranges:
            logger.debug(
                f"[SYNC] {data_type}/{granularity.value} complet pour {usage_point_id}, "
                f"aucune donnée manquante"
            )
            return 0

        logger.info(
            f"[SYNC] {data_type}/{granularity.value} pour {usage_point_id}: "
            f"{len(missing_ranges)} plage(s) manquante(s) détectée(s)"
        )

        # Update sync status to running
        sync_status.status = SyncStatusType.RUNNING
        sync_status.last_sync_at = datetime.now(UTC)
        await self.db.commit()

        total_synced = 0
        errors = []

        try:
            chunk_size = 7 if granularity == DataGranularity.DETAILED else 365

            for range_start, range_end in missing_ranges:
                # Découper chaque plage manquante en chunks compatibles API
                current_start = range_start
                while current_start < range_end:
                    current_end = min(
                        current_start + timedelta(days=chunk_size),
                        range_end,
                    )

                    try:
                        response = await fetch_func(
                            usage_point_id,
                            current_start.isoformat(),
                            current_end.isoformat(),
                        )

                        if isinstance(response, dict) and (
                            response.get("success") is False or response.get("data") is None
                        ):
                            logger.warning(
                                f"[SYNC] Passerelle sans données pour {usage_point_id} "
                                f"({current_start} - {current_end}): error={response.get('error')}"
                            )

                        # Parse and store data
                        records = self._parse_meter_reading(
                            response, usage_point_id, granularity
                        )
                        if records:
                            await self._upsert_energy_records(records, model_class)
                            total_synced += len(records)

                    except Exception as e:
                        await self.db.rollback()
                        logger.warning(
                            f"[SYNC] Erreur fetch {data_type}/{granularity.value} "
                            f"pour {usage_point_id} ({current_start} - {current_end}): {e}"
                        )
                        errors.append(str(e))

                    current_start = current_end

            # Update sync status
            if errors:
                sync_status.status = SyncStatusType.PARTIAL
                sync_status.error_message = "; ".join(errors[:5])
                sync_status.error_count += len(errors)
            else:
                sync_status.status = SyncStatusType.SUCCESS
                sync_status.error_message = None

            sync_status.records_synced_last_run = total_synced
            sync_status.total_records += total_synced

            if total_synced > 0:
                # Bornes réelles en base, pas la plage demandée
                bounds = await self.db.execute(
                    select(func.min(model_class.date), func.max(model_class.date)).where(
                        and_(
                            model_class.usage_point_id == usage_point_id,
                            model_class.granularity == granularity,
                        )
                    )
                )
                sync_status.oldest_data_date, sync_status.newest_data_date = bounds.one()

            sync_status.next_sync_at = datetime.now(UTC) + timedelta(minutes=30)
            await self.db.commit()

            logger.info(
                f"[SYNC] {data_type}/{granularity.value} pour {usage_point_id}: "
                f"{total_synced} enregistrements synchronisés"
            )

        except Exception as e:
            await self.db.rollback()
            sync_status.status = SyncStatusType.FAILED
            sync_status.error_message = str(e)
            sync_status.error_count += 1
            sync_status.last_error_at = datetime.now(UTC)
            await self.db.commit()
            raise

        return total_synced

    def _parse_meter_reading(
        self,
        response: dict[str, Any],
        usage_point_id: str,
        granularity: DataGranularity,
    ) -> list[dict[str, Any]]:
        """Parse meter reading response into records

        Args:
            response: API response, Data Connect 2026 or v5 (may be wrapped in APIResponse format)
            usage_point_id: PDL number
            granularity: DAILY or DETAILED

        Returns:
            List of record dicts ready for insert
        """
        records = []

        # Points Data Connect 2026 (une passerelle encore en v5 est convertie), enveloppe {success, data} ou non
        for reading in extract_points(_unwrap(response)):
            date_str = reading.get("d", "")
            value = reading.get("v")

            if not date_str or value is None:
                continue

            # Parse date (handle various formats)
            try:
                if "T" in date_str or " " in date_str:
                    # Datetime format
                    if "T" in date_str:
                        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    else:
                        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")

                    record_date = dt.date()
                    interval_start = dt.strftime("%H:%M") if granularity == DataGranularity.DETAILED else None
                else:
                    # Date only
                    record_date = date.fromisoformat(date_str)
                    interval_start = None
            except ValueError as e:
                logger.warning(f"[SYNC] Failed to parse date '{date_str}': {e}")
                continue

            try:
                value_int = int(float(value))
            except (TypeError, ValueError):
                logger.warning(f"[SYNC] Failed to parse value '{value}' for date '{date_str}'")
                continue

            records.append({
                "usage_point_id": usage_point_id,
                "date": record_date,
                "granularity": granularity,
                "interval_start": interval_start,
                "value": value_int,
                "source": "myelectricaldata",
                "raw_data": reading,
            })

        return records

    async def _upsert_energy_records(
        self,
        records: list[dict[str, Any]],
        model_class: type[ConsumptionData | ProductionData],
    ) -> None:
        """Upsert energy records using PostgreSQL ON CONFLICT

        Args:
            records: List of record dicts
            model_class: SQLAlchemy model class
        """
        if not records:
            return

        # Dédupliquer les records par clé naturelle avant l'INSERT.
        # Nécessaire car l'API peut renvoyer des doublons (ex: changement d'heure d'hiver,
        # l'heure 01:30 existe deux fois le jour du passage). PostgreSQL refuse un
        # ON CONFLICT DO UPDATE si le même batch contient deux lignes en conflit.
        seen: dict[tuple, int] = {}
        for idx, record in enumerate(records):
            key = (
                record["usage_point_id"],
                record["date"],
                record["granularity"],
                record.get("interval_start"),
            )
            seen[key] = idx  # Le dernier doublon gagne
        if len(seen) < len(records):
            logger.debug(
                f"[SYNC] Dédupliqué {len(records) - len(seen)} enregistrements en double dans le batch"
            )
            records = [records[i] for i in sorted(seen.values())]

        # Use PostgreSQL upsert (INSERT ... ON CONFLICT UPDATE)
        stmt = pg_insert(model_class).values(records)

        # On conflict, update value and raw_data
        stmt = stmt.on_conflict_do_update(
            constraint=f"uq_{model_class.__tablename__}",
            set_={
                "value": stmt.excluded.value,
                "raw_data": stmt.excluded.raw_data,
                "updated_at": datetime.now(UTC),
            },
        )

        await self.db.execute(stmt)
        await self.db.commit()

    async def _get_or_create_sync_status(
        self,
        usage_point_id: str,
        data_type: str,
        granularity: DataGranularity,
    ) -> SyncStatus:
        """Get or create sync status for a PDL/data type/granularity combo"""
        stmt = select(SyncStatus).where(
            SyncStatus.usage_point_id == usage_point_id,
            SyncStatus.data_type == data_type,
            SyncStatus.granularity == granularity,
        )
        result = await self.db.execute(stmt)
        sync_status = result.scalar_one_or_none()

        if not sync_status:
            sync_status = SyncStatus(
                usage_point_id=usage_point_id,
                data_type=data_type,
                granularity=granularity,
                status=SyncStatusType.PENDING,
            )
            self.db.add(sync_status)
            await self.db.commit()
            await self.db.refresh(sync_status)

        return sync_status

    async def get_sync_status_all(self) -> list[dict[str, Any]]:
        """Get sync status for all PDLs

        Returns:
            List of sync status dicts grouped by PDL
        """
        stmt = select(SyncStatus).order_by(SyncStatus.usage_point_id)
        result = await self.db.execute(stmt)
        statuses = result.scalars().all()

        # Group by PDL
        by_pdl: dict[str, dict[str, Any]] = {}
        for status in statuses:
            if status.usage_point_id not in by_pdl:
                by_pdl[status.usage_point_id] = {
                    "usage_point_id": status.usage_point_id,
                    "sync_types": {},
                }

            key = f"{status.data_type}_{status.granularity.value}"
            by_pdl[status.usage_point_id]["sync_types"][key] = {
                "status": status.status.value,
                "last_sync_at": status.last_sync_at.isoformat() if status.last_sync_at else None,
                "next_sync_at": status.next_sync_at.isoformat() if status.next_sync_at else None,
                "oldest_data_date": status.oldest_data_date.isoformat() if status.oldest_data_date else None,
                "newest_data_date": status.newest_data_date.isoformat() if status.newest_data_date else None,
                "total_records": status.total_records,
                "error_message": status.error_message,
            }

        return list(by_pdl.values())

    # =========================================================================
    # Energy Providers & Offers Sync
    # =========================================================================

    async def sync_energy_providers(self) -> dict[str, Any]:
        """Sync energy providers from remote MyElectricalData gateway

        Full mirror sync: creates, updates, and DELETES local providers to match remote.

        Returns:
            Dict with sync results (created, updated, unchanged, deleted counts)
        """
        logger.info("[SYNC] Syncing energy providers from remote gateway...")
        result: dict[str, Any] = {
            "created": 0,
            "updated": 0,
            "unchanged": 0,
            "deleted": 0,
            "errors": [],
        }

        try:
            response = await self.adapter.get_energy_providers()
            remote_providers = response.get("data", [])

            if not remote_providers and response.get("success") is False:
                logger.warning("[SYNC] Failed to get providers from remote gateway")
                result["errors"].append("Failed to get providers from remote gateway")
                return result

            logger.info(f"[SYNC] Found {len(remote_providers)} providers in remote gateway")

            # Track synced provider names to detect deletions
            synced_provider_names: set[str] = set()

            for remote_provider in remote_providers:
                provider_name = remote_provider.get("name", "?")
                try:
                    provider_id = remote_provider.get("id")

                    if not provider_id or not provider_name:
                        continue

                    synced_provider_names.add(provider_name)

                    # Check if provider exists locally by NAME (unique constraint)
                    existing = await self.db.execute(
                        select(EnergyProvider).where(EnergyProvider.name == provider_name)
                    )
                    existing_provider = existing.scalar_one_or_none()

                    if existing_provider:
                        # Update existing provider (keep local ID)
                        changed = False
                        if existing_provider.logo_url != remote_provider.get("logo_url"):
                            existing_provider.logo_url = remote_provider.get("logo_url")
                            changed = True
                        if existing_provider.website != remote_provider.get("website"):
                            existing_provider.website = remote_provider.get("website")
                            changed = True

                        if changed:
                            result["updated"] += 1
                            logger.debug(f"[SYNC] Updated provider: {provider_name}")
                        else:
                            result["unchanged"] += 1
                    else:
                        # Savepoint pour isoler l'insertion
                        async with self.db.begin_nested():
                            new_provider = EnergyProvider(
                                id=provider_id,
                                name=provider_name,
                                logo_url=remote_provider.get("logo_url"),
                                website=remote_provider.get("website"),
                                is_active=True,
                            )
                            self.db.add(new_provider)
                        result["created"] += 1
                        logger.info(f"[SYNC] Created provider: {provider_name}")

                except Exception as e:
                    logger.warning(f"[SYNC] Error syncing provider {provider_name}: {e}")
                    result["errors"].append(str(e))

            # Delete local providers that no longer exist on remote
            local_providers_result = await self.db.execute(select(EnergyProvider))
            local_providers = local_providers_result.scalars().all()

            for local_provider in local_providers:
                if local_provider.name not in synced_provider_names:
                    # Delete associated offers first (cascade)
                    await self.db.execute(
                        EnergyOffer.__table__.delete().where(
                            EnergyOffer.provider_id == local_provider.id
                        )
                    )
                    await self.db.delete(local_provider)
                    result["deleted"] += 1
                    logger.info(f"[SYNC] Deleted provider: {local_provider.name}")

            await self.db.commit()
            logger.info(
                f"[SYNC] Providers sync complete: "
                f"{result['created']} created, {result['updated']} updated, "
                f"{result['unchanged']} unchanged, {result['deleted']} deleted"
            )

        except Exception as e:
            await self.db.rollback()
            logger.error(f"[SYNC] Failed to sync providers: {e}")
            result["errors"].append(str(e))

        return result

    async def sync_energy_offers(self) -> dict[str, Any]:
        """Sync energy offers from remote MyElectricalData gateway

        Full mirror sync: creates, updates, and DELETES local offers to match remote.

        Returns:
            Dict with sync results (created, updated, unchanged, deleted counts)
        """
        logger.info("[SYNC] Syncing energy offers from remote gateway...")
        result: dict[str, Any] = {
            "created": 0,
            "updated": 0,
            "unchanged": 0,
            "deleted": 0,
            "errors": [],
        }

        try:
            response = await self.adapter.get_energy_offers()
            remote_offers = response.get("data", [])

            if not remote_offers and response.get("success") is False:
                logger.warning("[SYNC] Failed to get offers from remote gateway")
                result["errors"].append("Failed to get offers from remote gateway")
                return result

            logger.info(f"[SYNC] Found {len(remote_offers)} offers in remote gateway")

            # Build mapping from remote provider_id to local provider_id via provider name
            # This is needed because local providers have different IDs than remote ones
            remote_to_local_provider: dict[str, str] = {}
            remote_providers_response = await self.adapter.get_energy_providers()
            remote_providers = remote_providers_response.get("data", [])
            for rp in remote_providers:
                remote_id = rp.get("id")
                remote_name = rp.get("name")
                if remote_id and remote_name:
                    # Find local provider with same name
                    local_result = await self.db.execute(
                        select(EnergyProvider.id).where(EnergyProvider.name == remote_name)
                    )
                    local_id = local_result.scalar_one_or_none()
                    if local_id:
                        remote_to_local_provider[remote_id] = local_id

            # Get ALL existing offer IDs (not just active) to detect deletions
            existing_result = await self.db.execute(select(EnergyOffer.id))
            existing_offer_ids = set(row[0] for row in existing_result.all())
            synced_offer_ids: set[str] = set()

            for remote_offer in remote_offers:
                offer_name = remote_offer.get("name", "?")
                try:
                    offer_id = remote_offer.get("id")
                    remote_provider_id = remote_offer.get("provider_id")

                    if not offer_id or not offer_name or not remote_provider_id:
                        continue

                    # Map remote provider_id to local provider_id
                    local_provider_id = remote_to_local_provider.get(remote_provider_id)
                    if not local_provider_id:
                        logger.warning(f"[SYNC] No local provider found for offer {offer_name}, skipping")
                        continue

                    synced_offer_ids.add(offer_id)

                    # Check if offer exists locally
                    existing = await self.db.execute(
                        select(EnergyOffer).where(EnergyOffer.id == offer_id)
                    )
                    existing_offer = existing.scalar_one_or_none()

                    if existing_offer:
                        # Update existing offer (including provider_id mapping)
                        existing_offer.provider_id = local_provider_id
                        changed = self._update_offer_fields(existing_offer, remote_offer)
                        if changed:
                            result["updated"] += 1
                            logger.debug(f"[SYNC] Updated offer: {offer_name}")
                        else:
                            result["unchanged"] += 1
                    else:
                        # Savepoint pour isoler l'insertion et permettre un rollback partiel
                        async with self.db.begin_nested():
                            new_offer = self._create_offer_from_remote(remote_offer, local_provider_id)
                            self.db.add(new_offer)
                        result["created"] += 1
                        logger.info(f"[SYNC] Created offer: {offer_name}")

                except Exception as e:
                    logger.warning(f"[SYNC] Error syncing offer {offer_name}: {e}")
                    result["errors"].append(str(e))

            # DELETE offers that no longer exist in remote (full mirror)
            offers_to_delete = existing_offer_ids - synced_offer_ids
            for offer_id in offers_to_delete:
                try:
                    offer_result = await self.db.execute(
                        select(EnergyOffer).where(EnergyOffer.id == offer_id)
                    )
                    offer = offer_result.scalar_one_or_none()
                    if offer:
                        await self.db.delete(offer)
                        result["deleted"] += 1
                        logger.info(f"[SYNC] Deleted offer: {offer.name}")
                except Exception as e:
                    logger.error(f"[SYNC] Error deleting offer {offer_id}: {e}")

            await self.db.commit()
            logger.info(
                f"[SYNC] Offers sync complete: "
                f"{result['created']} created, {result['updated']} updated, "
                f"{result['unchanged']} unchanged, {result['deleted']} deleted"
            )

        except Exception as e:
            await self.db.rollback()
            logger.error(f"[SYNC] Failed to sync offers: {e}")
            result["errors"].append(str(e))

        return result

    def _update_offer_fields(self, offer: EnergyOffer, remote_data: dict[str, Any]) -> bool:
        """Update offer fields from remote data

        Args:
            offer: Existing EnergyOffer object
            remote_data: Remote offer data

        Returns:
            True if any field was changed
        """
        changed = False

        # Text fields
        if offer.name != remote_data.get("name"):
            offer.name = remote_data.get("name", offer.name)
            changed = True
        if offer.offer_type != remote_data.get("offer_type"):
            offer.offer_type = remote_data.get("offer_type", offer.offer_type)
            changed = True
        if offer.description != remote_data.get("description"):
            offer.description = remote_data.get("description")
            changed = True
        if offer.offer_url != remote_data.get("offer_url"):
            offer.offer_url = remote_data.get("offer_url")
            changed = True

        # Numeric fields (convert to Decimal for comparison)
        price_fields = [
            "subscription_price", "base_price", "hc_price", "hp_price",
            "base_price_weekend", "hp_price_weekend", "hc_price_weekend",
            "tempo_blue_hc", "tempo_blue_hp", "tempo_white_hc", "tempo_white_hp",
            "tempo_red_hc", "tempo_red_hp", "ejp_normal", "ejp_peak",
            "hc_price_winter", "hp_price_winter", "hc_price_summer", "hp_price_summer",
            "peak_day_price",
        ]
        for field in price_fields:
            remote_value = remote_data.get(field)
            current_value = getattr(offer, field)
            # Compare as floats to handle Decimal vs float
            if remote_value is not None:
                if current_value is None or float(current_value) != float(remote_value):
                    setattr(offer, field, remote_value)
                    changed = True
            elif current_value is not None:
                setattr(offer, field, None)
                changed = True

        # Integer fields
        if offer.power_kva != remote_data.get("power_kva"):
            offer.power_kva = remote_data.get("power_kva")
            changed = True

        # JSON fields
        if offer.hc_schedules != remote_data.get("hc_schedules"):
            offer.hc_schedules = remote_data.get("hc_schedules")
            changed = True

        # Boolean fields
        remote_is_active = remote_data.get("is_active", True)
        if offer.is_active != remote_is_active:
            offer.is_active = remote_is_active
            changed = True

        # Datetime fields
        if remote_data.get("price_updated_at"):
            try:
                remote_date = datetime.fromisoformat(remote_data["price_updated_at"].replace("Z", "+00:00"))
                if offer.price_updated_at != remote_date:
                    offer.price_updated_at = remote_date
                    changed = True
            except (ValueError, TypeError):
                pass

        if remote_data.get("valid_from"):
            try:
                remote_date = datetime.fromisoformat(remote_data["valid_from"].replace("Z", "+00:00"))
                if offer.valid_from != remote_date:
                    offer.valid_from = remote_date
                    changed = True
            except (ValueError, TypeError):
                pass

        if remote_data.get("valid_to"):
            try:
                remote_date = datetime.fromisoformat(remote_data["valid_to"].replace("Z", "+00:00"))
                if offer.valid_to != remote_date:
                    offer.valid_to = remote_date
                    changed = True
            except (ValueError, TypeError):
                pass

        return changed

    def _create_offer_from_remote(
        self, remote_data: dict[str, Any], local_provider_id: str | None = None
    ) -> EnergyOffer:
        """Create a new EnergyOffer from remote data

        Args:
            remote_data: Remote offer data
            local_provider_id: Local provider ID (if different from remote)

        Returns:
            New EnergyOffer object
        """
        # Parse datetime fields
        price_updated_at = None
        if remote_data.get("price_updated_at"):
            try:
                price_updated_at = datetime.fromisoformat(
                    remote_data["price_updated_at"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

        valid_from = None
        if remote_data.get("valid_from"):
            try:
                valid_from = datetime.fromisoformat(
                    remote_data["valid_from"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

        valid_to = None
        if remote_data.get("valid_to"):
            try:
                valid_to = datetime.fromisoformat(
                    remote_data["valid_to"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

        return EnergyOffer(
            id=remote_data["id"],
            provider_id=local_provider_id or remote_data["provider_id"],
            name=remote_data["name"],
            offer_type=remote_data["offer_type"],
            description=remote_data.get("description"),
            subscription_price=remote_data.get("subscription_price", 0),
            base_price=remote_data.get("base_price"),
            hc_price=remote_data.get("hc_price"),
            hp_price=remote_data.get("hp_price"),
            base_price_weekend=remote_data.get("base_price_weekend"),
            hp_price_weekend=remote_data.get("hp_price_weekend"),
            hc_price_weekend=remote_data.get("hc_price_weekend"),
            tempo_blue_hc=remote_data.get("tempo_blue_hc"),
            tempo_blue_hp=remote_data.get("tempo_blue_hp"),
            tempo_white_hc=remote_data.get("tempo_white_hc"),
            tempo_white_hp=remote_data.get("tempo_white_hp"),
            tempo_red_hc=remote_data.get("tempo_red_hc"),
            tempo_red_hp=remote_data.get("tempo_red_hp"),
            ejp_normal=remote_data.get("ejp_normal"),
            ejp_peak=remote_data.get("ejp_peak"),
            hc_price_winter=remote_data.get("hc_price_winter"),
            hp_price_winter=remote_data.get("hp_price_winter"),
            hc_price_summer=remote_data.get("hc_price_summer"),
            hp_price_summer=remote_data.get("hp_price_summer"),
            peak_day_price=remote_data.get("peak_day_price"),
            hc_schedules=remote_data.get("hc_schedules"),
            power_kva=remote_data.get("power_kva"),
            price_updated_at=price_updated_at,
            valid_from=valid_from,
            valid_to=valid_to,
            offer_url=remote_data.get("offer_url"),
            is_active=remote_data.get("is_active", True),
        )

    # =========================================================================
    # EcoWatt Sync
    # =========================================================================

    async def sync_ecowatt(self) -> dict[str, Any]:
        """Sync EcoWatt data from remote MyElectricalData gateway

        Fetches current and forecast EcoWatt signals and stores them
        in the local PostgreSQL database.

        Returns:
            Dict with sync results (created, updated counts)
        """
        logger.info("[SYNC] Syncing EcoWatt data from remote gateway...")
        result: dict[str, Any] = {
            "created": 0,
            "updated": 0,
            "errors": [],
        }

        try:
            # Update sync tracker
            await self._update_sync_tracker("ecowatt_client")
            # Fetch EcoWatt forecast (includes current day + future days)
            response = await self.adapter.get_ecowatt_forecast()

            # Handle different response formats
            if response.get("success") and response.get("data"):
                signals = response["data"]
            elif isinstance(response.get("data"), list):
                signals = response["data"]
            else:
                # Try to get from root if it's a list directly
                signals = response if isinstance(response, list) else []

            if not signals:
                logger.warning("[SYNC] No EcoWatt data received from remote gateway")
                result["errors"].append("No EcoWatt data received")
                return result

            logger.info(f"[SYNC] Received {len(signals)} EcoWatt signals from remote gateway")

            for signal in signals:
                try:
                    # Parse the periode (date) from the signal
                    periode_str = signal.get("periode")
                    if not periode_str:
                        continue

                    # Parse datetime and convert to naive UTC
                    if isinstance(periode_str, str):
                        periode_aware = datetime.fromisoformat(periode_str.replace("Z", "+00:00"))
                        # Convert to naive UTC datetime
                        periode = periode_aware.replace(tzinfo=None)
                    else:
                        periode = periode_str.replace(tzinfo=None) if hasattr(periode_str, 'replace') else periode_str

                    # Check if signal exists for this date
                    existing_result = await self.db.execute(
                        select(EcoWatt).where(EcoWatt.periode == periode)
                    )
                    existing = existing_result.scalar_one_or_none()

                    # Parse generation datetime and convert to naive UTC
                    gen_dt_str = signal.get("generation_datetime")
                    if isinstance(gen_dt_str, str):
                        gen_aware = datetime.fromisoformat(
                            gen_dt_str.replace("Z", "+00:00")
                        )
                        generation_datetime = gen_aware.replace(tzinfo=None)
                    else:
                        generation_datetime = gen_dt_str.replace(tzinfo=None) if gen_dt_str and hasattr(gen_dt_str, 'replace') else datetime.utcnow()

                    # Get values array (24 hourly values)
                    values = signal.get("values", [])
                    if not values or len(values) < 24:
                        # Pad with zeros if needed
                        values = values + [0] * (24 - len(values))

                    if existing:
                        # Update existing signal
                        existing.generation_datetime = generation_datetime
                        existing.dvalue = signal.get("dvalue", 1)
                        existing.message = signal.get("message")
                        existing.values = values[:24]
                        existing.hdebut = signal.get("hdebut", 0)
                        existing.hfin = signal.get("hfin", 23)
                        existing.updated_at = datetime.utcnow()  # Use naive UTC
                        result["updated"] += 1
                        logger.debug(f"[SYNC] Updated EcoWatt signal for {periode.date()}")
                    else:
                        # Create new signal
                        new_signal = EcoWatt(
                            generation_datetime=generation_datetime,
                            periode=periode,
                            hdebut=signal.get("hdebut", 0),
                            hfin=signal.get("hfin", 23),
                            pas=signal.get("pas", 60),
                            dvalue=signal.get("dvalue", 1),
                            message=signal.get("message"),
                            values=values[:24],
                        )
                        self.db.add(new_signal)
                        result["created"] += 1
                        logger.info(f"[SYNC] Created EcoWatt signal for {periode.date()}")

                except Exception as e:
                    logger.error(f"[SYNC] Error processing EcoWatt signal: {e}")
                    result["errors"].append(str(e))

            await self.db.commit()
            logger.info(
                f"[SYNC] EcoWatt sync complete: "
                f"{result['created']} created, {result['updated']} updated"
            )

        except Exception as e:
            logger.error(f"[SYNC] Failed to sync EcoWatt: {e}")
            result["errors"].append(str(e))

        return result

    # =========================================================================
    # Tempo Sync
    # =========================================================================

    async def sync_tempo(self) -> dict[str, Any]:
        """Sync Tempo calendar data from remote MyElectricalData gateway

        Fetches Tempo calendar days and stores them in the local PostgreSQL database.

        Returns:
            Dict with sync results (created, updated counts)
        """
        logger.info("[SYNC] Syncing Tempo data from remote gateway...")
        result: dict[str, Any] = {
            "created": 0,
            "updated": 0,
            "errors": [],
        }

        try:
            # Update sync tracker
            await self._update_sync_tracker("tempo_client")

            # Fetch Tempo calendar (current season)
            response = await self.adapter.get_tempo_calendar()

            # Handle different response formats
            if response.get("success") and response.get("data"):
                calendar_data = response["data"]
            elif isinstance(response.get("data"), list):
                calendar_data = response["data"]
            else:
                calendar_data = response.get("calendar", [])

            if not calendar_data:
                logger.warning("[SYNC] No Tempo data received from remote gateway")
                result["errors"].append("No Tempo data received")
                return result

            logger.info(f"[SYNC] Received {len(calendar_data)} Tempo days from remote gateway")

            for day_data in calendar_data:
                try:
                    # Parse the date
                    date_str = day_data.get("date") or day_data.get("id")
                    if not date_str:
                        continue

                    # Parse date string
                    if isinstance(date_str, str):
                        if "T" in date_str:
                            # ISO format with time
                            day_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                        else:
                            # Just date
                            day_date = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=UTC)
                    else:
                        day_date = date_str

                    # Get color
                    color_str = day_data.get("color", "").upper()
                    if color_str not in ["BLUE", "WHITE", "RED"]:
                        logger.warning(f"[SYNC] Invalid Tempo color: {color_str}")
                        continue

                    color = TempoColor(color_str)
                    day_id = day_date.strftime("%Y-%m-%d")

                    # Check if day exists
                    existing_result = await self.db.execute(
                        select(TempoDay).where(TempoDay.id == day_id)
                    )
                    existing = existing_result.scalar_one_or_none()

                    # Parse RTE update date if present
                    rte_updated = day_data.get("rte_updated_date") or day_data.get("updated_date")
                    rte_updated_date = None
                    if rte_updated and isinstance(rte_updated, str):
                        rte_updated_date = datetime.fromisoformat(rte_updated.replace("Z", "+00:00"))

                    if existing:
                        # Update existing day
                        existing.color = color
                        existing.updated_at = datetime.now(UTC)
                        if rte_updated_date:
                            existing.rte_updated_date = rte_updated_date
                        result["updated"] += 1
                    else:
                        # Create new day
                        new_day = TempoDay(
                            id=day_id,
                            date=day_date,
                            color=color,
                            rte_updated_date=rte_updated_date,
                        )
                        self.db.add(new_day)
                        result["created"] += 1

                except Exception as e:
                    logger.error(f"[SYNC] Error processing Tempo day: {e}")
                    result["errors"].append(str(e))

            await self.db.commit()
            logger.info(
                f"[SYNC] Tempo sync complete: "
                f"{result['created']} created, {result['updated']} updated"
            )

        except Exception as e:
            logger.error(f"[SYNC] Failed to sync Tempo: {e}")
            result["errors"].append(str(e))

        return result

    async def sync_zen_flex(self) -> dict[str, Any]:
        """Synchronise le calendrier EDF Zen Flex depuis la passerelle

        Historique local incomplet (premier passage, ou passerelle encore en rattrapage) : tout le
        calendrier est redemandé ; sinon seuls les derniers jours.
        """
        logger.info("[SYNC] Syncing Zen Flex calendar from remote gateway...")
        result: dict[str, Any] = {"created": 0, "updated": 0, "errors": []}

        try:
            await self._update_sync_tracker("zen_flex_client")

            today = paris_today()
            rows = (await self.db.execute(select(ZenFlexDay))).scalars().all()
            known: dict[str, ZenFlexDay] = {str(row.id): row for row in rows}
            past_days = sum(1 for row in rows if OFFER_START <= row.date <= today)
            complete = past_days >= (today - OFFER_START).days + 1
            start = (today - timedelta(days=7)).isoformat() if complete else None

            response = await self.adapter.get_zen_flex_calendar(start=start)
            calendar_data = response.get("data") if isinstance(response, dict) else None
            if not response.get("success") or not isinstance(calendar_data, list):
                error = response.get("error") if isinstance(response, dict) else None
                result["errors"].append(f"Réponse de la passerelle invalide : {error or response}")
                return result

            if not calendar_data and start is None:
                logger.warning("[SYNC] Calendrier Zen Flex vide sur la passerelle (rattrapage pas encore commencé ?)")

            for day_data in calendar_data:
                day_id = str(day_data.get("date") or "")[:10]
                try:
                    day = date.fromisoformat(day_id)
                    day_type = ZenFlexDayType(str(day_data.get("day_type", "")).upper())
                except ValueError:
                    logger.warning(f"[SYNC] Jour Zen Flex invalide ignoré : {day_data}")
                    continue

                existing = known.get(day_id)
                if existing is None:
                    self.db.add(ZenFlexDay(id=day_id, date=day, day_type=day_type))
                    result["created"] += 1
                elif existing.day_type != day_type:
                    existing.day_type = day_type  # type: ignore[assignment]
                    result["updated"] += 1

            await self.db.commit()
            logger.info(f"[SYNC] Zen Flex sync complete: {result['created']} created, {result['updated']} updated")

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.info("[SYNC] Zen Flex calendar not available on remote gateway (404 Not Found), skipping")
            else:
                logger.error(f"[SYNC] Failed to sync Zen Flex: {e}")
                result["errors"].append(str(e))
        except Exception as e:
            logger.error(f"[SYNC] Failed to sync Zen Flex: {e}")
            result["errors"].append(str(e))

        return result

    async def sync_all_energy_data(self) -> dict[str, Any]:
        """Sync all energy providers and offers from remote gateway

        Protégé par un verrou pour éviter les exécutions concurrentes.

        Returns:
            Dict with combined sync results
        """
        if _energy_sync_lock.locked():
            logger.info("[SYNC] Sync énergie déjà en cours, requête ignorée")
            return {
                "providers": {},
                "offers": {},
                "success": True,
                "skipped": True,
            }

        async with _energy_sync_lock:
            return await self._sync_all_energy_data_impl()

    async def _sync_all_energy_data_impl(self) -> dict[str, Any]:
        """Implémentation interne de la sync énergie (protégée par verrou)."""
        logger.info("[SYNC] Starting full energy data sync...")
        result: dict[str, Any] = {
            "providers": {},
            "offers": {},
            "success": False,
        }

        try:
            # Sync providers first (offers depend on them)
            result["providers"] = await self.sync_energy_providers()

            # Then sync offers
            result["offers"] = await self.sync_energy_offers()

            result["success"] = (
                len(result["providers"].get("errors", [])) == 0 and
                len(result["offers"].get("errors", [])) == 0
            )

            logger.info(f"[SYNC] Energy data sync complete. Success: {result['success']}")

        except Exception as e:
            logger.error(f"[SYNC] Failed to sync energy data: {e}")
            result["error"] = str(e)

        return result

    async def _update_sync_tracker(self, cache_type: str) -> None:
        """Update the last sync time for a cache type

        Args:
            cache_type: The cache type key (e.g., 'tempo_client', 'ecowatt_client')
        """
        from ..models.refresh_tracker import RefreshTracker

        result = await self.db.execute(
            select(RefreshTracker).where(RefreshTracker.cache_type == cache_type)
        )
        tracker = result.scalar_one_or_none()

        if tracker:
            tracker.last_refresh = datetime.now(UTC)
        else:
            new_tracker = RefreshTracker(cache_type=cache_type, last_refresh=datetime.now(UTC))
            self.db.add(new_tracker)

        await self.db.commit()

    async def _synced_recently(self, cache_type: str, min_interval: timedelta) -> bool:
        last_sync = _normalize_utc(await self.get_sync_tracker(cache_type))
        return last_sync is not None and datetime.now(UTC) - last_sync < min_interval

    async def get_sync_tracker(self, cache_type: str) -> datetime | None:
        """Get the last sync time for a cache type

        Args:
            cache_type: The cache type key (e.g., 'tempo_client', 'ecowatt_client')

        Returns:
            Last sync datetime or None if never synced
        """
        from ..models.refresh_tracker import RefreshTracker

        result = await self.db.execute(
            select(RefreshTracker.last_refresh).where(RefreshTracker.cache_type == cache_type)
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # Consumption France Sync (national data)
    # =========================================================================

    async def sync_consumption_france(self, min_interval: timedelta | None = None) -> dict[str, Any]:
        """Sync French national consumption data from remote gateway

        Fetches consumption data (REALISED, ID, D-1, D-2) and stores them
        in the local PostgreSQL database.

        Args:
            min_interval: skip the call if the last sync attempt is more recent (scheduler startup)

        Returns:
            Dict with sync results (created, updated counts)
        """
        logger.info("[SYNC] Syncing Consumption France data from remote gateway...")
        result: dict[str, Any] = {
            "created": 0,
            "updated": 0,
            "errors": [],
        }

        if min_interval is not None and await self._synced_recently("consumption_france_client", min_interval):
            logger.info(f"[SYNC] consumption_france_client synchronisé il y a moins de {min_interval}, appel ignoré")
            result["skipped"] = True
            return result

        try:
            # Update sync tracker
            await self._update_sync_tracker("consumption_france_client")

            # Fetch consumption data from gateway
            response = await self.adapter.get_consumption_france()

            # Handle response format
            if response.get("success") and response.get("data"):
                data = response["data"]
            else:
                data = response

            short_term = data.get("short_term", [])
            if not short_term:
                logger.warning("[SYNC] No Consumption France data received from remote gateway")
                result["errors"].append("No Consumption France data received")
                return result

            logger.info(f"[SYNC] Received {len(short_term)} consumption types from remote gateway")

            # Import model
            from ..models.consumption_france import ConsumptionFrance

            for type_data in short_term:
                consumption_type = type_data.get("type")
                values = type_data.get("values", [])

                for value in values:
                    try:
                        start_date_str = value.get("start_date")
                        if not start_date_str:
                            continue

                        # Parse datetime
                        if isinstance(start_date_str, str):
                            start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
                        else:
                            start_date = start_date_str

                        end_date_str = value.get("end_date")
                        end_date = None
                        if end_date_str:
                            if isinstance(end_date_str, str):
                                end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                            else:
                                end_date = end_date_str

                        updated_date_str = value.get("updated_date")
                        updated_date = None
                        if updated_date_str:
                            if isinstance(updated_date_str, str):
                                updated_date = datetime.fromisoformat(updated_date_str.replace("Z", "+00:00"))
                            else:
                                updated_date = updated_date_str

                        # Check if record exists
                        existing_result = await self.db.execute(
                            select(ConsumptionFrance).where(
                                ConsumptionFrance.type == consumption_type,
                                ConsumptionFrance.start_date == start_date,
                            )
                        )
                        existing = existing_result.scalar_one_or_none()

                        if existing:
                            # Update existing record
                            existing.end_date = end_date
                            existing.value = value.get("value", 0)
                            existing.updated_date = updated_date
                            result["updated"] += 1
                        else:
                            # Create new record
                            new_record = ConsumptionFrance(
                                type=consumption_type,
                                start_date=start_date,
                                end_date=end_date,
                                value=value.get("value", 0),
                                updated_date=updated_date,
                            )
                            self.db.add(new_record)
                            result["created"] += 1

                    except Exception as e:
                        logger.error(f"[SYNC] Error processing consumption record: {e}")
                        result["errors"].append(str(e))

            await self.db.commit()
            logger.info(
                f"[SYNC] Consumption France sync complete: "
                f"{result['created']} created, {result['updated']} updated"
            )

        except Exception as e:
            logger.error(f"[SYNC] Failed to sync Consumption France: {e}")
            result["errors"].append(str(e))

        return result

    # =========================================================================
    # Generation Forecast Sync (renewable production)
    # =========================================================================

    async def sync_generation_forecast(self, min_interval: timedelta | None = None) -> dict[str, Any]:
        """Sync French renewable generation forecast from remote gateway

        Fetches solar and wind forecast data and stores them
        in the local PostgreSQL database.

        Args:
            min_interval: skip the call if the last sync attempt is more recent (scheduler startup)

        Returns:
            Dict with sync results (created, updated counts)
        """
        logger.info("[SYNC] Syncing Generation Forecast data from remote gateway...")
        result: dict[str, Any] = {
            "created": 0,
            "updated": 0,
            "errors": [],
        }

        if min_interval is not None and await self._synced_recently("generation_forecast_client", min_interval):
            logger.info(f"[SYNC] generation_forecast_client synchronisé il y a moins de {min_interval}, appel ignoré")
            result["skipped"] = True
            return result

        try:
            # Update sync tracker
            await self._update_sync_tracker("generation_forecast_client")

            # Fetch generation forecast from gateway
            response = await self.adapter.get_generation_forecast()

            # Handle response format
            if response.get("success") and response.get("data"):
                data = response["data"]
            else:
                data = response

            forecasts = data.get("forecasts", [])
            if not forecasts:
                logger.warning("[SYNC] No Generation Forecast data received from remote gateway")
                result["errors"].append("No Generation Forecast data received")
                return result

            logger.info(f"[SYNC] Received {len(forecasts)} forecast types from remote gateway")

            # Import model
            from ..models.generation_forecast import GenerationForecast

            # Structure: forecasts = [{production_type, forecast_type, values: [{start_date, end_date, value, updated_date}]}]
            for forecast_group in forecasts:
                production_type = forecast_group.get("production_type", "SOLAR")
                forecast_type = forecast_group.get("forecast_type", "CURRENT")
                values = forecast_group.get("values", [])

                for value_data in values:
                    try:
                        start_date_str = value_data.get("start_date")
                        if not start_date_str:
                            continue

                        # Parse datetime
                        if isinstance(start_date_str, str):
                            start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
                        else:
                            start_date = start_date_str

                        end_date_str = value_data.get("end_date")
                        end_date = None
                        if end_date_str:
                            if isinstance(end_date_str, str):
                                end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                            else:
                                end_date = end_date_str

                        updated_date_str = value_data.get("updated_date")
                        updated_date = None
                        if updated_date_str:
                            if isinstance(updated_date_str, str):
                                updated_date = datetime.fromisoformat(updated_date_str.replace("Z", "+00:00"))
                            else:
                                updated_date = updated_date_str

                        # Check if record exists
                        existing_result = await self.db.execute(
                            select(GenerationForecast).where(
                                GenerationForecast.production_type == production_type,
                                GenerationForecast.forecast_type == forecast_type,
                                GenerationForecast.start_date == start_date,
                            )
                        )
                        existing = existing_result.scalar_one_or_none()

                        if existing:
                            # Update existing record
                            existing.end_date = end_date
                            existing.value = value_data.get("value", 0)
                            existing.updated_date = updated_date
                            result["updated"] += 1
                        else:
                            # Create new record
                            new_record = GenerationForecast(
                                production_type=production_type,
                                forecast_type=forecast_type,
                                start_date=start_date,
                                end_date=end_date,
                                value=value_data.get("value", 0),
                                updated_date=updated_date,
                            )
                            self.db.add(new_record)
                            result["created"] += 1

                    except Exception as e:
                        logger.error(f"[SYNC] Error processing generation forecast: {e}")
                        result["errors"].append(str(e))

            await self.db.commit()
            logger.info(
                f"[SYNC] Generation Forecast sync complete: "
                f"{result['created']} created, {result['updated']} updated"
            )

        except Exception as e:
            logger.error(f"[SYNC] Failed to sync Generation Forecast: {e}")
            result["errors"].append(str(e))

        return result
