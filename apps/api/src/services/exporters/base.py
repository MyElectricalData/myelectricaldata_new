"""Base Exporter Class

Abstract base class for all exporters.
"""

import logging
from abc import ABC, abstractmethod
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .tariff import parse_offpeak_ranges, summarize_hp_hc_kwh, tariff_profile

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
    ) -> tuple[list[tuple[int, int]], int | None, bool]:
        """Récupère les plages HC, la puissance souscrite et le régime week-end d'un PDL

        Essaie ContractData (mode client) puis PDL (mode serveur).
        Les plages sont lues quel que soit leur format de stockage (cf. tariff.parse_offpeak_ranges).

        Returns:
            Tuple (plages HC en minutes, subscribed_power_kva, week-end entièrement creux)
        """
        from ...models.client_mode import ContractData
        from ...models.pdl import PDL

        # Mode client : ContractData
        result = await db.execute(
            select(ContractData.offpeak_hours, ContractData.subscribed_power, ContractData.pricing_option)
            .where(ContractData.usage_point_id == pdl)
        )
        contract = result.first()
        if contract and contract.offpeak_hours:
            return (
                parse_offpeak_ranges(contract.offpeak_hours),
                contract.subscribed_power,
                tariff_profile(contract.pricing_option).weekend_offpeak,
            )

        # Mode serveur : PDL
        result = await db.execute(
            select(PDL.offpeak_hours, PDL.subscribed_power, PDL.pricing_option)
            .where(PDL.usage_point_id == pdl)
        )
        pdl_data = result.first()
        if pdl_data:
            return (
                parse_offpeak_ranges(pdl_data.offpeak_hours),
                pdl_data.subscribed_power,
                tariff_profile(pdl_data.pricing_option).weekend_offpeak,
            )

        return [], None, False

    async def _get_hp_hc_summary(self, db: AsyncSession, pdl: str, today: date) -> dict[str, float] | None:
        """Totaux HP/HC (kWh) d'hier, de la semaine, du mois et de l'année d'un PDL

        None si le contrat n'a pas d'heures creuses ou s'il n'y a aucune donnée détaillée (30 min) :
        la ventilation HP/HC n'est pas calculable à partir des seuls totaux journaliers.
        """
        from ...models.client_mode import ConsumptionData, DataGranularity

        offpeak_ranges, _, weekend_offpeak = await self._get_pdl_contract_info(db, pdl)
        if not offpeak_ranges and not weekend_offpeak:
            return None

        result = await db.execute(
            select(
                ConsumptionData.date,
                ConsumptionData.interval_start,
                ConsumptionData.value,
                ConsumptionData.raw_data,
            ).where(
                ConsumptionData.usage_point_id == pdl,
                ConsumptionData.date >= today.replace(month=1, day=1),
                ConsumptionData.granularity == DataGranularity.DETAILED,
            )
        )
        detailed = result.all()
        if not detailed:
            return None
        return summarize_hp_hc_kwh(detailed, today, offpeak_ranges, weekend_offpeak)

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
