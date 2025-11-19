"""RTE API Service for Tempo Calendar and EcoWatt data"""

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import TempoColor, TempoDay
from ..models.ecowatt import EcoWatt

logger = logging.getLogger(__name__)


class RTEService:
    """Service to fetch and cache Tempo Calendar and EcoWatt data from RTE API"""

    def __init__(self):
        self.base_url = settings.RTE_BASE_URL
        self.client_id = settings.RTE_CLIENT_ID
        self.client_secret = settings.RTE_CLIENT_SECRET
        self.token_url = f"{self.base_url}/token/oauth/"
        self.tempo_url = f"{self.base_url}/open_api/tempo_like_supply_contract/v1/tempo_like_calendars"
        self.ecowatt_url = f"{self.base_url}/open_api/ecowatt/v5/signals"
        self._access_token: str | None = None
        self._token_expires_at: datetime | None = None
        self._last_ecowatt_fetch: datetime | None = None
        self._ecowatt_fetch_min_interval = timedelta(minutes=15)  # Min 15 minutes between API calls

    async def _get_access_token(self) -> str:
        """Get OAuth2 access token for RTE API"""
        # Return cached token if still valid
        if self._access_token and self._token_expires_at:
            if datetime.now(UTC) < self._token_expires_at:
                return self._access_token

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                data={
                    "grant_type": "client_credentials",
                },
                auth=(self.client_id, self.client_secret),
            )
            response.raise_for_status()
            data = response.json()

            self._access_token = data["access_token"]
            # Token expires in 'expires_in' seconds, refresh 5 minutes before
            expires_in = data.get("expires_in", 3600)
            self._token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in - 300)

            return self._access_token

    async def fetch_tempo_calendar(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """
        Fetch Tempo Calendar from RTE API

        Args:
            start_date: Start date (timezone aware)
            end_date: End date (timezone aware)

        Returns:
            List of tempo day dictionaries with date, color, and update info
        """
        token = await self._get_access_token()

        # Convert to Paris timezone for RTE API (required format: YYYY-MM-DDThh:mm:ss+zz:zz)
        paris_tz = ZoneInfo("Europe/Paris")
        start_paris = start_date.astimezone(paris_tz)
        end_paris = end_date.astimezone(paris_tz)

        # Format dates in ISO 8601 with timezone (e.g., 2015-06-08T00:00:00+02:00)
        start_str = start_paris.isoformat()
        end_str = end_paris.isoformat()

        logger.debug(f"[RTE API] Requesting TEMPO data from {start_str} to {end_str}")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.tempo_url,
                params={"start_date": start_str, "end_date": end_str},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            )
            logger.debug(f"[RTE API] Response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"[RTE API] Error response body: {response.text}")

            response.raise_for_status()
            data = response.json()

            logger.debug(f"[RTE API] Raw response: {data}")
            logger.info(f"[RTE API] Received {len(data.get('tempo_like_calendars', {}).get('values', []))} TEMPO days")
            return data.get("tempo_like_calendars", {}).get("values", [])

    async def update_tempo_cache(self, db: AsyncSession, days: int = 7) -> int:
        """
        Update Tempo Calendar cache in database

        Args:
            db: Database session
            days: Number of days to fetch (ignored - RTE API limitation)

        Returns:
            Number of days updated
        """
        # Fetch data from RTE API - use Paris timezone
        paris_tz = ZoneInfo("Europe/Paris")
        now_paris = datetime.now(paris_tz)

        updated_count = 0

        # 1. Fetch today and tomorrow (if available after 7am)
        # Note: With start_date interpretation, we need end_date to be +2 days to get tomorrow's data
        # Use 00:00:00 instead of 23:59:59 to avoid API errors
        start_date = now_paris.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
        if now_paris.hour >= 7:
            end_date = now_paris.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=2)
        else:
            end_date = now_paris.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

        logger.info("[RTE] Fetching today/tomorrow data...")
        tempo_values = await self.fetch_tempo_calendar(start_date, end_date)
        updated_count += await self._process_tempo_values(db, tempo_values)

        # 2. Fetch historical data (last 10 years) split by 366-day periods
        logger.info("[RTE] Fetching historical data (last 10 years)...")
        years_to_fetch = 10
        for year_offset in range(years_to_fetch):
            try:
                # Each period is 366 days to cover leap years
                period_end = now_paris.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
                    days=366 * year_offset
                )
                period_start = period_end - timedelta(days=366)

                logger.info(
                    f"[RTE] Fetching year {year_offset + 1}/10 ({period_start.date()} to {period_end.date()})..."
                )
                historical_values = await self.fetch_tempo_calendar(period_start, period_end)
                logger.info(f"[RTE] Received {len(historical_values)} values for year {year_offset + 1}")
                count = await self._process_tempo_values(db, historical_values)
                await db.commit()  # Commit after each year to avoid losing data
                updated_count += count
                logger.info(f"[RTE] Year {year_offset + 1}/10: {count} days processed and committed")
            except Exception as e:
                logger.warning(f"[RTE] Warning: Could not fetch year {year_offset + 1}: {e}")
                import traceback

                traceback.print_exc()

        logger.info(f"[RTE] Total updated: {updated_count} days")
        return updated_count

    async def _process_tempo_values(self, db: AsyncSession, tempo_values: List[Dict[str, Any]]) -> int:
        """Process and store tempo values in database"""
        updated_count = 0
        for value in tempo_values:
            try:
                # Parse dates from RTE response
                # RTE API: start_date represents the day the color applies to
                # Example: start_date=2025-11-19 00:00 + end_date=2025-11-20 00:00 means color for Nov 19
                day_start = datetime.fromisoformat(value["start_date"])
                day_end = datetime.fromisoformat(value["end_date"])
                color_str = value["value"]
                updated_date_str = value.get("updated_date")

                # Use start_date as the reference date (this is the actual day the color applies to)
                date_id = day_start.strftime("%Y-%m-%d")

                # Parse RTE update date if provided
                rte_updated = None
                if updated_date_str:
                    rte_updated = datetime.fromisoformat(updated_date_str)

                # Check if day already exists
                result = await db.execute(select(TempoDay).where(TempoDay.id == date_id))
                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing record
                    existing.color = TempoColor(color_str)
                    existing.rte_updated_date = rte_updated
                    existing.updated_at = datetime.now(UTC)
                else:
                    # Create new record (use start_date as the actual day)
                    tempo_day = TempoDay(
                        id=date_id,
                        date=day_start,
                        color=TempoColor(color_str),
                        rte_updated_date=rte_updated,
                    )
                    db.add(tempo_day)

                updated_count += 1

            except Exception as e:
                logger.error(f"Error processing TEMPO day {value}: {e}")
                continue

        return updated_count

    async def get_tempo_days(
        self, db: AsyncSession, start_date: datetime | None = None, end_date: datetime | None = None
    ) -> List[TempoDay]:
        """
        Get TEMPO days from database cache

        Args:
            db: Database session
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            List of TempoDay objects
        """
        query = select(TempoDay).order_by(TempoDay.date)

        if start_date:
            query = query.where(TempoDay.date >= start_date)
        if end_date:
            query = query.where(TempoDay.date <= end_date)

        result = await db.execute(query)
        return result.scalars().all()

    async def get_tempo_day(self, db: AsyncSession, date: datetime) -> TempoDay | None:
        """
        Get TEMPO color for a specific date

        Args:
            db: Database session
            date: Date to query

        Returns:
            TempoDay object or None
        """
        date_id = date.strftime("%Y-%m-%d")
        result = await db.execute(select(TempoDay).where(TempoDay.id == date_id))
        return result.scalar_one_or_none()

    async def clear_old_data(self, db: AsyncSession, days_to_keep: int = 30) -> int:
        """
        Remove old TEMPO data from cache

        Args:
            db: Database session
            days_to_keep: Keep data from last N days (default: 30)

        Returns:
            Number of records deleted
        """
        cutoff_date = datetime.now(UTC) - timedelta(days=days_to_keep)
        result = await db.execute(delete(TempoDay).where(TempoDay.date < cutoff_date))
        await db.commit()
        return result.rowcount

    # ========== EcoWatt Methods ==========

    async def fetch_ecowatt_signals(self) -> Dict[str, Any]:
        """
        Fetch EcoWatt signals from RTE API

        Returns:
            Dictionary containing EcoWatt signals
        """
        token = await self._get_access_token()

        logger.debug("[RTE API] Requesting EcoWatt data...")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.ecowatt_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            )
            logger.debug(f"[RTE API] EcoWatt response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"[RTE API] EcoWatt error response: {response.text}")

            response.raise_for_status()
            data = response.json()

            logger.info("[RTE API] Received EcoWatt signals")
            return data

    async def update_ecowatt_cache(self, db: AsyncSession) -> int:
        """
        Update EcoWatt signals cache in database

        Args:
            db: Database session

        Returns:
            Number of signals updated
        """
        try:
            # Check if we need to wait before making another API call (rate limiting)
            now = datetime.now(UTC)
            if self._last_ecowatt_fetch:
                time_since_last_fetch = now - self._last_ecowatt_fetch
                if time_since_last_fetch < self._ecowatt_fetch_min_interval:
                    remaining = self._ecowatt_fetch_min_interval - time_since_last_fetch
                    logger.warning(
                        f"[RTE] EcoWatt API rate limit: last fetch was {time_since_last_fetch.total_seconds():.0f}s ago, need to wait {remaining.total_seconds():.0f}s more"
                    )
                    return 0

            # Fetch EcoWatt data from RTE API
            ecowatt_data = await self.fetch_ecowatt_signals()

            # Update last fetch timestamp
            self._last_ecowatt_fetch = now

            if not ecowatt_data or "signals" not in ecowatt_data:
                logger.info("[RTE] No EcoWatt signals received")
                return 0

            signals = ecowatt_data["signals"]
            updated_count = 0

            for signal in signals:
                try:
                    # Extract signal data and convert to UTC naive datetime
                    generation_datetime = (
                        datetime.fromisoformat(signal["GenerationFichier"]).astimezone(UTC).replace(tzinfo=None)
                    )
                    periode = datetime.fromisoformat(signal["jour"]).astimezone(UTC).replace(tzinfo=None)

                    # Extract hourly values and map them to hours (pas = hour)
                    # Initialize with 24 hours, default value 0
                    hourly_values = [0] * 24
                    for hour_data in signal.get("values", []):
                        pas = hour_data["pas"]  # pas 0 = minuit, pas 1 = 1h, etc.
                        hvalue = hour_data["hvalue"]
                        if 0 <= pas <= 23:
                            hourly_values[pas] = hvalue

                    # Determine hdebut and hfin from actual data
                    signal_values = signal.get("values", [])
                    hdebut = min((v["pas"] for v in signal_values), default=0)
                    hfin = max((v["pas"] for v in signal_values), default=23)

                    # Prepare data for database
                    ecowatt_create = {
                        "generation_datetime": generation_datetime,
                        "periode": periode,
                        "hdebut": hdebut,
                        "hfin": hfin,
                        "pas": 60,  # Always 60 minutes (1 hour step)
                        "dvalue": signal["dvalue"],
                        "message": signal.get("message", ""),
                        "values": hourly_values,  # Array of 24 values indexed by hour
                    }

                    # Check if signal for this day already exists
                    result = await db.execute(select(EcoWatt).where(EcoWatt.periode == periode))
                    existing = result.scalar_one_or_none()

                    if existing:
                        # Update existing record
                        for key, value in ecowatt_create.items():
                            setattr(existing, key, value)
                        existing.updated_at = datetime.now(UTC).replace(tzinfo=None)
                    else:
                        # Create new record
                        ecowatt = EcoWatt(**ecowatt_create)
                        db.add(ecowatt)

                    updated_count += 1

                except Exception as e:
                    logger.error(f"Error processing EcoWatt signal {signal}: {e}")
                    continue

            await db.commit()
            logger.info(f"[RTE] Updated {updated_count} EcoWatt signals")
            return updated_count

        except Exception as e:
            await db.rollback()
            logger.error(f"[RTE] Error updating EcoWatt cache: {e}")
            import traceback

            traceback.print_exc()
            return 0

    async def get_ecowatt_signals(
        self, db: AsyncSession, start_date: Optional[date] = None, end_date: Optional[date] = None
    ) -> List[EcoWatt]:
        """
        Get EcoWatt signals from database cache

        Args:
            db: Database session
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            List of EcoWatt objects
        """
        query = select(EcoWatt).order_by(EcoWatt.periode)

        if start_date:
            query = query.where(EcoWatt.periode >= start_date)
        if end_date:
            query = query.where(EcoWatt.periode <= end_date)

        result = await db.execute(query)
        return result.scalars().all()

    async def get_ecowatt_signal(self, db: AsyncSession, target_date: date) -> Optional[EcoWatt]:
        """
        Get EcoWatt signal for a specific date

        Args:
            db: Database session
            target_date: Date to query

        Returns:
            EcoWatt object or None
        """
        # Convert date to datetime for comparison
        target_datetime = datetime.combine(target_date, datetime.min.time())

        result = await db.execute(
            select(EcoWatt).where(
                EcoWatt.periode >= target_datetime, EcoWatt.periode < target_datetime + timedelta(days=1)
            )
        )
        return result.scalar_one_or_none()


# Singleton instance
rte_service = RTEService()
