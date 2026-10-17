"""Statistics Service

Calculates aggregated statistics for consumption and production data.
Used primarily by MQTT exporter for legacy-compatible exports.

Statistics types:
- Annual: thisYear, thisMonth, thisWeek, by month (1-12), by day of week
- Linear: year sliding windows (year, year-1, year-2...)
- HP/HC: Peak/Off-peak separation based on contract offpeak hours
- Tempo: Consumption by tempo day color (BLUE, WHITE, RED)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.enedis_format import iso_duration_to_minutes
from ..models.client_mode import ConsumptionData, DataGranularity, MaxPowerData, ProductionData
from ..models.tempo_day import TempoDay
from .exporters.tariff import is_offpeak_slot
from .local_data import _interval_of

logger = logging.getLogger(__name__)

# Day names in French (Monday=0) for MQTT topics
DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


class StatisticsService:
    """Calculate aggregated statistics from local PostgreSQL data"""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _get_model(self, direction: str) -> type[ConsumptionData] | type[ProductionData]:
        """Get the appropriate model based on direction"""
        if direction == "production":
            return ProductionData
        return ConsumptionData

    # =========================================================================
    # ANNUAL STATISTICS (Calendar-based)
    # =========================================================================

    async def get_year_total(
        self, usage_point_id: str, year: int, direction: str = "consumption"
    ) -> int:
        """Get total Wh for a calendar year

        Args:
            usage_point_id: PDL number
            year: Calendar year (e.g., 2024)
            direction: 'consumption' or 'production'

        Returns:
            Total Wh for the year
        """
        model = self._get_model(direction)
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

        result = await self.db.execute(
            select(func.coalesce(func.sum(model.value), 0))
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )
        return int(result.scalar() or 0)

    async def get_month_total(
        self, usage_point_id: str, year: int, month: int, direction: str = "consumption"
    ) -> int:
        """Get total Wh for a specific month

        Args:
            usage_point_id: PDL number
            year: Calendar year
            month: Month number (1-12)
            direction: 'consumption' or 'production'

        Returns:
            Total Wh for the month
        """
        model = self._get_model(direction)

        # Calculate month boundaries
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)

        result = await self.db.execute(
            select(func.coalesce(func.sum(model.value), 0))
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )
        return int(result.scalar() or 0)

    async def get_week_total(
        self, usage_point_id: str, year: int, week: int, direction: str = "consumption"
    ) -> int:
        """Get total Wh for a specific ISO week

        Args:
            usage_point_id: PDL number
            year: ISO year
            week: ISO week number (1-53)
            direction: 'consumption' or 'production'

        Returns:
            Total Wh for the week
        """
        model = self._get_model(direction)

        # Get the Monday of the ISO week
        jan4 = date(year, 1, 4)  # Jan 4 is always in week 1
        start_of_week1 = jan4 - timedelta(days=jan4.weekday())
        start_date = start_of_week1 + timedelta(weeks=week - 1)
        end_date = start_date + timedelta(days=6)

        result = await self.db.execute(
            select(func.coalesce(func.sum(model.value), 0))
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )
        return int(result.scalar() or 0)

    async def get_day_total(
        self, usage_point_id: str, target_date: date, direction: str = "consumption"
    ) -> int:
        """Get total Wh for a specific day

        Args:
            usage_point_id: PDL number
            target_date: The date to query
            direction: 'consumption' or 'production'

        Returns:
            Total Wh for the day
        """
        model = self._get_model(direction)

        result = await self.db.execute(
            select(func.sum(model.value))
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date == target_date)
        )
        daily = result.scalar()
        if daily is not None:
            return int(daily)

        # Pas de valeur quotidienne : somme des points détaillés (W moyens sur leur pas) convertis en Wh
        detail = await self.db.execute(
            select(model.value, model.raw_data)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DETAILED)
            .where(model.date == target_date)
        )
        return round(
            sum(row.value * iso_duration_to_minutes(_interval_of(row.raw_data)) / 60 for row in detail.all())
        )

    async def get_current_year_by_month(
        self, usage_point_id: str, direction: str = "consumption"
    ) -> dict[int, int]:
        """Get totals for each month of the current year

        Returns:
            Dict mapping month number (1-12) to Wh total
        """
        current_year = datetime.now().year
        result = {}

        for month in range(1, 13):
            result[month] = await self.get_month_total(
                usage_point_id, current_year, month, direction
            )

        return result

    async def get_current_week_by_day(
        self, usage_point_id: str, direction: str = "consumption"
    ) -> dict[str, int]:
        """Get totals for each day of the current week

        Returns:
            Dict mapping day name (French) to Wh total
        """
        today = date.today()
        # Get Monday of current week
        monday = today - timedelta(days=today.weekday())

        result = {}
        for i, day_name in enumerate(DAY_NAMES):
            day_date = monday + timedelta(days=i)
            result[day_name] = await self.get_day_total(usage_point_id, day_date, direction)

        return result

    # =========================================================================
    # LINEAR STATISTICS (Sliding windows)
    # =========================================================================

    async def get_linear_year_total(
        self, usage_point_id: str, years_back: int = 0, direction: str = "consumption"
    ) -> int:
        """Get total Wh for a sliding year window

        Args:
            usage_point_id: PDL number
            years_back: 0 = current year, 1 = year-1, 2 = year-2, etc.
            direction: 'consumption' or 'production'

        Returns:
            Total Wh for the sliding year
        """
        today = date.today()
        end_date = today - timedelta(days=365 * years_back)
        start_date = end_date - timedelta(days=364)

        model = self._get_model(direction)
        result = await self.db.execute(
            select(func.coalesce(func.sum(model.value), 0))
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )
        return int(result.scalar() or 0)

    async def get_linear_month_total(
        self, usage_point_id: str, years_back: int = 0, direction: str = "consumption"
    ) -> int:
        """Get total Wh for current month in a sliding year

        Args:
            usage_point_id: PDL number
            years_back: 0 = current year, 1 = year-1, etc.
            direction: 'consumption' or 'production'

        Returns:
            Total Wh for the month
        """
        today = date.today()
        target_year = today.year - years_back

        return await self.get_month_total(usage_point_id, target_year, today.month, direction)

    async def get_linear_week_total(
        self, usage_point_id: str, years_back: int = 0, direction: str = "consumption"
    ) -> int:
        """Get total Wh for current week in a sliding year

        Args:
            usage_point_id: PDL number
            years_back: 0 = current year, 1 = year-1, etc.
            direction: 'consumption' or 'production'

        Returns:
            Total Wh for the week
        """
        today = date.today()
        iso_year, iso_week, _ = today.isocalendar()
        target_year = iso_year - years_back

        return await self.get_week_total(usage_point_id, target_year, iso_week, direction)

    # =========================================================================
    # HP/HC STATISTICS (Peak/Off-peak based on detailed data)
    # =========================================================================

    def _is_offpeak_hour(
        self,
        day: date,
        interval_start: str | None,
        offpeak_ranges: list[tuple[int, int]],
        weekend_offpeak: bool = False,
    ) -> bool:
        """Check if a detailed interval is during off-peak hours

        Args:
            day: Date of the interval
            interval_start: Time string like "00:00", "00:30", etc.
            offpeak_ranges: Off-peak ranges in minutes (cf. exporters.tariff.parse_offpeak_ranges)
            weekend_offpeak: Saturday and Sunday fully off-peak (HC_WEEKEND offers)
        """
        return bool(is_offpeak_slot(day, interval_start, offpeak_ranges, weekend_offpeak))

    async def get_hp_hc_year_total(
        self,
        usage_point_id: str,
        year: int,
        offpeak_ranges: list[tuple[int, int]],
        direction: str = "consumption",
        weekend_offpeak: bool = False,
    ) -> tuple[int, int]:
        """Get HP/HC totals for a calendar year

        Args:
            usage_point_id: PDL number
            year: Calendar year
            offpeak_ranges: Off-peak ranges in minutes (cf. exporters.tariff)
            weekend_offpeak: Saturday and Sunday fully off-peak
            direction: 'consumption' or 'production'

        Returns:
            Tuple of (HP Wh, HC Wh)
        """
        model = self._get_model(direction)
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

        result = await self.db.execute(
            select(model.date, model.interval_start, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DETAILED)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )

        hp_total = 0
        hc_total = 0

        for row in result.all():
            if self._is_offpeak_hour(row.date, row.interval_start, offpeak_ranges, weekend_offpeak):
                hc_total += row.value
            else:
                hp_total += row.value

        return hp_total, hc_total

    async def get_hp_hc_month_total(
        self,
        usage_point_id: str,
        year: int,
        month: int,
        offpeak_ranges: list[tuple[int, int]],
        direction: str = "consumption",
        weekend_offpeak: bool = False,
    ) -> tuple[int, int]:
        """Get HP/HC totals for a specific month

        Args:
            usage_point_id: PDL number
            year: Calendar year
            month: Month number (1-12)
            offpeak_ranges: Off-peak ranges in minutes (cf. exporters.tariff)
            weekend_offpeak: Saturday and Sunday fully off-peak
            direction: 'consumption' or 'production'

        Returns:
            Tuple of (HP Wh, HC Wh)
        """
        model = self._get_model(direction)

        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)

        result = await self.db.execute(
            select(model.date, model.interval_start, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DETAILED)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )

        hp_total = 0
        hc_total = 0

        for row in result.all():
            if self._is_offpeak_hour(row.date, row.interval_start, offpeak_ranges, weekend_offpeak):
                hc_total += row.value
            else:
                hp_total += row.value

        return hp_total, hc_total

    async def get_hp_hc_week_total(
        self,
        usage_point_id: str,
        year: int,
        week: int,
        offpeak_ranges: list[tuple[int, int]],
        direction: str = "consumption",
        weekend_offpeak: bool = False,
    ) -> tuple[int, int]:
        """Get HP/HC totals for a specific ISO week

        Returns:
            Tuple of (HP Wh, HC Wh)
        """
        model = self._get_model(direction)

        jan4 = date(year, 1, 4)
        start_of_week1 = jan4 - timedelta(days=jan4.weekday())
        start_date = start_of_week1 + timedelta(weeks=week - 1)
        end_date = start_date + timedelta(days=6)

        result = await self.db.execute(
            select(model.date, model.interval_start, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DETAILED)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )

        hp_total = 0
        hc_total = 0

        for row in result.all():
            if self._is_offpeak_hour(row.date, row.interval_start, offpeak_ranges, weekend_offpeak):
                hc_total += row.value
            else:
                hp_total += row.value

        return hp_total, hc_total

    async def get_hp_hc_current_week_by_day(
        self,
        usage_point_id: str,
        offpeak_ranges: list[tuple[int, int]],
        direction: str = "consumption",
        weekend_offpeak: bool = False,
    ) -> dict[str, tuple[int, int]]:
        """Get HP/HC totals for each day of the current week

        Returns:
            Dict mapping day name to (HP Wh, HC Wh)
        """
        model = self._get_model(direction)
        today = date.today()
        monday = today - timedelta(days=today.weekday())

        result = {}
        for i, day_name in enumerate(DAY_NAMES):
            day_date = monday + timedelta(days=i)

            query_result = await self.db.execute(
                select(model.date, model.interval_start, model.value)
                .where(model.usage_point_id == usage_point_id)
                .where(model.granularity == DataGranularity.DETAILED)
                .where(model.date == day_date)
            )

            hp_total = 0
            hc_total = 0

            for row in query_result.all():
                if self._is_offpeak_hour(row.date, row.interval_start, offpeak_ranges, weekend_offpeak):
                    hc_total += row.value
                else:
                    hp_total += row.value

            result[day_name] = (hp_total, hc_total)

        return result

    # =========================================================================
    # TEMPO STATISTICS (Consumption by Tempo color)
    # =========================================================================

    async def get_tempo_year_totals(
        self, usage_point_id: str, year: int, direction: str = "consumption"
    ) -> dict[str, int]:
        """Get consumption totals by Tempo color for a year

        Args:
            usage_point_id: PDL number
            year: Calendar year
            direction: 'consumption' or 'production'

        Returns:
            Dict mapping color (BLUE, WHITE, RED) to Wh total
        """
        model = self._get_model(direction)
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

        # Get all Tempo days for the year (use ID for comparison - YYYY-MM-DD format)
        tempo_result = await self.db.execute(
            select(TempoDay.id, TempoDay.color)
            .where(TempoDay.id >= start_date.isoformat())
            .where(TempoDay.id <= end_date.isoformat())
        )
        # Map date string (YYYY-MM-DD) to color
        tempo_days = {row.id: row.color.value if hasattr(row.color, 'value') else row.color for row in tempo_result.all()}

        # Get all consumption for the year
        consumption_result = await self.db.execute(
            select(model.date, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )

        totals = {"BLUE": 0, "WHITE": 0, "RED": 0}

        for row in consumption_result.all():
            # Convert date to ISO format to match tempo_days keys
            date_str = row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date)
            color = tempo_days.get(date_str)
            if color and color in totals:
                totals[color] += row.value

        return totals

    async def get_tempo_month_totals(
        self, usage_point_id: str, year: int, month: int, direction: str = "consumption"
    ) -> dict[str, int]:
        """Get consumption totals by Tempo color for a month

        Returns:
            Dict mapping color (BLUE, WHITE, RED) to Wh total
        """
        model = self._get_model(direction)
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)

        # Get Tempo days (use ID for comparison - YYYY-MM-DD format)
        tempo_result = await self.db.execute(
            select(TempoDay.id, TempoDay.color)
            .where(TempoDay.id >= start_date.isoformat())
            .where(TempoDay.id <= end_date.isoformat())
        )
        # Map date string (YYYY-MM-DD) to color
        tempo_days = {row.id: row.color.value if hasattr(row.color, 'value') else row.color for row in tempo_result.all()}

        # Get consumption
        consumption_result = await self.db.execute(
            select(model.date, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )

        totals = {"BLUE": 0, "WHITE": 0, "RED": 0}

        for row in consumption_result.all():
            # Convert date to ISO format to match tempo_days keys
            date_str = row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date)
            color = tempo_days.get(date_str)
            if color and color in totals:
                totals[color] += row.value

        return totals

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    async def get_all_annual_stats(
        self,
        usage_point_id: str,
        direction: str = "consumption",
        prices: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        """Get all annual statistics for MQTT export

        Args:
            usage_point_id: PDL number
            direction: 'consumption' or 'production'
            prices: Optional dict with keys: base, hp, hc (€/kWh)

        Returns:
            Complete stats dict for annual export
        """
        today = date.today()
        current_year = today.year
        iso_year, iso_week, _ = today.isocalendar()

        # Get base values
        this_year = await self.get_year_total(usage_point_id, current_year, direction)
        this_month = await self.get_month_total(usage_point_id, current_year, today.month, direction)
        this_week = await self.get_week_total(usage_point_id, iso_year, iso_week, direction)

        # Monthly breakdown
        by_month = await self.get_current_year_by_month(usage_point_id, direction)

        # Daily breakdown for current week
        by_day = await self.get_current_week_by_day(usage_point_id, direction)

        stats = {
            "thisYear": {
                "Wh": this_year,
                "kWh": round(this_year / 1000, 2),
            },
            "thisMonth": {
                "Wh": this_month,
                "kWh": round(this_month / 1000, 2),
            },
            "thisWeek": {
                "Wh": this_week,
                "kWh": round(this_week / 1000, 2),
            },
            "byMonth": {m: {"Wh": v, "kWh": round(v / 1000, 2)} for m, v in by_month.items()},
            "byDay": {d: {"Wh": v, "kWh": round(v / 1000, 2)} for d, v in by_day.items()},
        }

        # Add euro values if prices provided
        if prices and prices.get("base"):
            price = prices["base"]
            stats["thisYear"]["euro"] = round(this_year / 1000 * price, 2)
            stats["thisMonth"]["euro"] = round(this_month / 1000 * price, 2)
            stats["thisWeek"]["euro"] = round(this_week / 1000 * price, 2)

            for m, v in stats["byMonth"].items():
                stats["byMonth"][m]["euro"] = round(v["kWh"] * price, 2)

            for d, v in stats["byDay"].items():
                stats["byDay"][d]["euro"] = round(v["kWh"] * price, 2)

        return stats

    async def get_all_linear_stats(
        self,
        usage_point_id: str,
        direction: str = "consumption",
        years_back: int = 3,
        prices: dict[str, float] | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Get all linear (sliding window) statistics for MQTT export

        Args:
            usage_point_id: PDL number
            direction: 'consumption' or 'production'
            years_back: Number of years to go back
            prices: Optional price dict

        Returns:
            Dict mapping year label to stats
        """
        stats = {}

        for i in range(years_back + 1):
            year_label = "year" if i == 0 else f"year-{i}"

            year_total = await self.get_linear_year_total(usage_point_id, i, direction)
            month_total = await self.get_linear_month_total(usage_point_id, i, direction)
            week_total = await self.get_linear_week_total(usage_point_id, i, direction)

            year_stats = {
                "thisYear": {"Wh": year_total, "kWh": round(year_total / 1000, 2)},
                "thisMonth": {"Wh": month_total, "kWh": round(month_total / 1000, 2)},
                "thisWeek": {"Wh": week_total, "kWh": round(week_total / 1000, 2)},
            }

            if prices and prices.get("base"):
                price = prices["base"]
                year_stats["thisYear"]["euro"] = round(year_total / 1000 * price, 2)
                year_stats["thisMonth"]["euro"] = round(month_total / 1000 * price, 2)
                year_stats["thisWeek"]["euro"] = round(week_total / 1000 * price, 2)

            stats[year_label] = year_stats

        return stats

    # =========================================================================
    # BATCH METHODS (optimisées pour l'export content-card-linky)
    # =========================================================================

    async def get_date_range_total(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
        direction: str = "consumption",
    ) -> int:
        """Total Wh pour une plage de dates arbitraire (inclusive)

        Utile pour : current_week (lundi→hier), current_month (1er→hier),
        current_year (1er janvier→hier), etc.
        """
        model = self._get_model(direction)

        result = await self.db.execute(
            select(func.coalesce(func.sum(model.value), 0))
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )
        return int(result.scalar() or 0)

    async def get_daily_totals_range(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
        direction: str = "consumption",
    ) -> dict[date, int]:
        """Totaux journaliers pour une plage de dates en une seule requête

        Remplace N appels individuels à get_day_total.

        Returns:
            Dict {date: Wh}. Les jours sans données ne sont pas inclus.
        """
        model = self._get_model(direction)

        result = await self.db.execute(
            select(model.date, func.sum(model.value))
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DAILY)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
            .group_by(model.date)
        )
        return {row[0]: int(row[1]) for row in result.all()}

    async def get_detailed_range(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
        direction: str = "consumption",
    ) -> list[tuple[date, str | None, int]]:
        """Toutes les données DETAILED (30min) pour une plage de dates

        Permet de calculer HP/HC et puissance max par jour en mémoire.

        Returns:
            Liste de (date, interval_start, value_Wh).
        """
        model = self._get_model(direction)

        result = await self.db.execute(
            select(model.date, model.interval_start, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DETAILED)
            .where(model.date >= start_date)
            .where(model.date <= end_date)
        )
        return [(row[0], row[1], int(row[2])) for row in result.all()]

    async def get_hp_hc_day_total(
        self,
        usage_point_id: str,
        target_date: date,
        offpeak_ranges: list[tuple[int, int]],
        direction: str = "consumption",
        weekend_offpeak: bool = False,
    ) -> tuple[int, int]:
        """HP/HC pour un jour spécifique (données DETAILED requises)

        Returns:
            Tuple (HP_Wh, HC_Wh). Retourne (0, 0) si pas de données DETAILED.
        """
        model = self._get_model(direction)

        result = await self.db.execute(
            select(model.date, model.interval_start, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DETAILED)
            .where(model.date == target_date)
        )

        hp_total = 0
        hc_total = 0

        for row in result.all():
            if self._is_offpeak_hour(row.date, row.interval_start, offpeak_ranges, weekend_offpeak):
                hc_total += row.value
            else:
                hp_total += row.value

        return hp_total, hc_total

    async def get_max_power_day(
        self,
        usage_point_id: str,
        target_date: date,
        direction: str = "consumption",
    ) -> tuple[float, str | None]:
        """Puissance max pour un jour.

        Vérifie d'abord MaxPowerData (valeur Enedis réelle en VA).
        Si absent, calcule à partir des données DETAILED (30min).
        Puissance = value_Wh * 2 / 1000 (conversion en kW / kVA).

        Returns:
            Tuple (max_power_kVA, heure_du_max). Retourne (0.0, None) si pas de données.
        """
        if direction == "consumption":
            mp_result = await self.db.execute(
                select(MaxPowerData.value, MaxPowerData.interval_start)
                .where(MaxPowerData.usage_point_id == usage_point_id)
                .where(MaxPowerData.date == target_date)
            )
            mp_row = mp_result.first()
            if mp_row and mp_row[0] is not None:
                power_kva = round(mp_row[0] / 1000, 2)
                return power_kva, mp_row[1]

        model = self._get_model(direction)

        result = await self.db.execute(
            select(model.interval_start, model.value)
            .where(model.usage_point_id == usage_point_id)
            .where(model.granularity == DataGranularity.DETAILED)
            .where(model.date == target_date)
        )

        max_power = 0.0
        max_time: str | None = None

        for row in result.all():
            power_kw = row.value * 2 / 1000
            if power_kw > max_power:
                max_power = power_kw
                max_time = row.interval_start

        return round(max_power, 2), max_time

    async def get_max_power_history(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> dict[date, dict[str, Any]]:
        """Get daily max power history between start_date and end_date.

        Returns:
            Dict mapping date -> {"va": int, "kva": float, "time": str | None}
        """
        result = await self.db.execute(
            select(MaxPowerData)
            .where(
                MaxPowerData.usage_point_id == usage_point_id,
                MaxPowerData.date >= start_date,
                MaxPowerData.date <= end_date,
            )
            .order_by(MaxPowerData.date)
        )
        return {
            row.date: {
                "va": row.value,
                "kva": round(row.value / 1000, 2),
                "time": row.interval_start,
            }
            for row in result.scalars().all()
        }
