"""Base Exporter Class

Abstract base class for all exporters.
"""

import logging
from abc import ABC, abstractmethod
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .tariff import (
    ZEN_FLEX_OFFPEAK_RANGES,
    TariffProfile,
    hp_hc_window_start,
    is_zen_flex_offer,
    parse_offpeak_ranges,
    summarize_hp_hc_kwh,
    tariff_profile,
)

logger = logging.getLogger(__name__)


class BaseExporter(ABC):
    """Abstract base class for data exporters

    All exporters must implement:
    - test_connection(): Verify the connection to the target
    - export_consumption(): Export consumption data
    - export_production(): Export production data
    """

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialize exporter with configuration

        Args:
            config: Type-specific configuration dict
        """
        self.config = config
        self._validate_config()

    @abstractmethod
    def _validate_config(self) -> None:
        """Validate the configuration

        Raises:
            ValueError if configuration is invalid
        """
        pass

    @abstractmethod
    async def test_connection(self) -> bool:
        """Test the connection to the export target

        Returns:
            True if connection successful

        Raises:
            Exception if connection fails
        """
        pass

    @abstractmethod
    async def export_consumption(
        self,
        usage_point_id: str,
        data: list[dict[str, Any]],
        granularity: str,
    ) -> int:
        """Export consumption data

        Args:
            usage_point_id: PDL number
            data: List of consumption records
            granularity: 'daily' or 'detailed'

        Returns:
            Number of records exported
        """
        pass

    @abstractmethod
    async def export_production(
        self,
        usage_point_id: str,
        data: list[dict[str, Any]],
        granularity: str,
    ) -> int:
        """Export production data

        Args:
            usage_point_id: PDL number
            data: List of production records
            granularity: 'daily' or 'detailed'

        Returns:
            Number of records exported
        """
        pass

    async def _get_pdl_contract_info(
        self, db: AsyncSession, pdl: str
    ) -> tuple[TariffProfile, list[tuple[int, int]], int | None]:
        """Récupère le profil tarifaire, les plages HC et la puissance souscrite d'un PDL

        - Profil : PDL.pricing_option (option fournisseur canonique, synchronisée depuis le serveur)
          en priorité. ContractData.pricing_option n'est qu'un repli : en mode client, il porte le
          code d'acheminement Enedis (distribution_tariff, ex. BTINFMUDT), pas l'option fournisseur.
        - Plages HC et puissance : ContractData (cache contrat Enedis du mode client), sinon PDL.
          Plages lues quel que soit leur format de stockage (cf. tariff.parse_offpeak_ranges).
        - Offre choisie EDF Zen Flex : plages HC de la grille fournisseur (hc_schedules de l'offre,
          sinon 13h-18h et 20h-8h), pas celles du contrat Enedis, et profil HC/HP quelle que soit
          l'option du PDL (le week-end Zen Flex a aussi ses heures pleines).

        Returns:
            Tuple (profil tarifaire, plages HC en minutes, subscribed_power_kva)
        """
        from ...models.client_mode import ContractData
        from ...models.energy_provider import EnergyOffer
        from ...models.pdl import PDL

        result = await db.execute(
            select(PDL.pricing_option, PDL.offpeak_hours, PDL.subscribed_power, PDL.selected_offer_id).where(
                PDL.usage_point_id == pdl
            )
        )
        pdl_data = result.first()
        result = await db.execute(
            select(ContractData.pricing_option, ContractData.offpeak_hours, ContractData.subscribed_power).where(
                ContractData.usage_point_id == pdl
            )
        )
        contract = result.first()

        pricing_option = (pdl_data and pdl_data.pricing_option) or (contract and contract.pricing_option) or None
        offpeak_ranges = parse_offpeak_ranges(contract.offpeak_hours) if contract else []
        if not offpeak_ranges and pdl_data:
            offpeak_ranges = parse_offpeak_ranges(pdl_data.offpeak_hours)
        subscribed_power = (contract and contract.subscribed_power) or (pdl_data and pdl_data.subscribed_power) or None
        profile = tariff_profile(pricing_option)

        selected_offer_id = getattr(pdl_data, "selected_offer_id", None) if pdl_data else None
        if selected_offer_id:
            result = await db.execute(
                select(EnergyOffer.offer_type, EnergyOffer.name, EnergyOffer.hc_schedules).where(
                    EnergyOffer.id == selected_offer_id
                )
            )
            offer = result.first()
            if offer and is_zen_flex_offer(offer.offer_type, offer.name):
                offpeak_ranges = parse_offpeak_ranges(offer.hc_schedules)
                if not offpeak_ranges:
                    if offer.hc_schedules:
                        logger.warning(f"[EXPORT] PDL {pdl} : hc_schedules illisible ({offer.hc_schedules!r}), grille Zen Flex EDF")
                    offpeak_ranges = ZEN_FLEX_OFFPEAK_RANGES
                profile = tariff_profile("ZEN_FLEX")

        return profile, offpeak_ranges, subscribed_power

    async def _get_hp_hc_summary(self, db: AsyncSession, pdl: str, today: date) -> dict[str, float] | None:
        """Totaux HP/HC (kWh) d'hier, de la semaine, du mois et de l'année d'un PDL

        None pour un contrat BASE, sans plage HC (ni week-end creux), ou sans donnée détaillée
        (30 min) : la ventilation HP/HC n'est pas calculable à partir des seuls totaux journaliers.
        """
        from ...models.client_mode import ConsumptionData, DataGranularity

        profile, offpeak_ranges, _ = await self._get_pdl_contract_info(db, pdl)
        if profile.family == "BASE" or (not offpeak_ranges and not profile.weekend_offpeak):
            return None

        result = await db.execute(
            select(
                ConsumptionData.date,
                ConsumptionData.interval_start,
                ConsumptionData.value,
                ConsumptionData.raw_data,
            ).where(
                ConsumptionData.usage_point_id == pdl,
                ConsumptionData.date >= hp_hc_window_start(today),
                ConsumptionData.granularity == DataGranularity.DETAILED,
            )
        )
        detailed = result.all()
        if not detailed:
            return None
        return summarize_hp_hc_kwh(detailed, today, offpeak_ranges, profile.weekend_offpeak)

    async def close(self) -> None:
        """Close any open connections"""
        pass

    async def read_metrics(self, usage_point_ids: list[str] | None = None) -> dict[str, Any]:
        """Read metrics from the export destination

        Retrieves the current state of exported metrics from the target system.
        This allows users to verify what data has been sent and is currently stored.

        Args:
            usage_point_ids: Optional list of PDL numbers to filter metrics

        Returns:
            Dict containing:
            - success: bool indicating if read was successful
            - metrics: list of metric objects with name, value, timestamp, etc.
            - errors: list of any errors encountered
            - timestamp: when the read was performed

        Note:
            Not all exporters support reading back metrics. Those that don't
            should return success=False with an appropriate message.
        """
        return {
            "success": False,
            "message": "La lecture des métriques n'est pas supportée pour cet exporteur",
            "metrics": [],
            "errors": [],
        }
