"""
Demo Adapter - Provides mock data for demo accounts

This adapter intercepts Enedis API calls for demo users and returns
pre-generated mock data from Redis cache instead of making real API calls.
"""
import logging
from typing import Any, Optional
from datetime import datetime
from ..services.cache import cache_service

logger = logging.getLogger(__name__)


class DemoAdapter:
    """Adapter that provides mock data for demo accounts"""

    DEMO_EMAIL = "demo@myelectricaldata.fr"

    def __init__(self):
        self.cache_service = cache_service

    async def is_demo_user(self, user_email: str) -> bool:
        """Check if user is a demo account"""
        return user_email == self.DEMO_EMAIL

    async def get_consumption_daily(
        self,
        usage_point_id: str,
        start: str,
        end: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """
        Generate mock daily consumption data dynamically (no cache).

        Args:
            usage_point_id: PDL number
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD)
            client_secret: User's client secret for decryption

        Returns:
            Mock consumption data in Enedis format
        """
        logger.debug(f"[DEMO] Generating dynamic consumption data for {usage_point_id} from {start} to {end}")

        # Generate daily consumption data dynamically
        from datetime import datetime, timedelta
        import math

        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")

        # Define consumption profiles based on PDL
        if usage_point_id == "04004253849200":  # Résidence principale
            base_daily_kwh = 20  # 6 kVA - typical residential consumption
        elif usage_point_id == "04004253849201":  # Maison avec panneaux solaires
            base_daily_kwh = 25  # 9 kVA - higher consumption
        elif usage_point_id == "04004253849202":  # Résidence secondaire
            base_daily_kwh = 8  # 3 kVA - seasonal usage
        else:
            base_daily_kwh = 15  # Default

        interval_reading = []
        current_date = start_date

        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            day_of_year = current_date.timetuple().tm_yday

            # Seasonal variation (winter: higher, summer: lower)
            season_factor = 1 + 0.3 * math.cos(2 * math.pi * (day_of_year - 30) / 365)

            # Weekly variation (weekend: lower)
            weekday = current_date.weekday()
            week_factor = 0.8 if weekday >= 5 else 1.0

            # Résidence secondaire: only significant consumption in summer and winter holidays
            if usage_point_id == "04004253849202":
                month = current_date.month
                # High usage in July-August (summer) and December-January (winter holidays)
                if month in [7, 8] or month in [12, 1]:
                    occupancy_factor = 1.0
                else:
                    occupancy_factor = 0.1  # Very low when unoccupied
            else:
                occupancy_factor = 1.0

            # Calculate daily value with variations
            daily_value = base_daily_kwh * season_factor * week_factor * occupancy_factor

            # Add some randomness (±10%)
            import random
            random.seed(hash(date_str + usage_point_id))  # Deterministic randomness
            daily_value *= (0.9 + random.random() * 0.2)

            interval_reading.append({
                "value": f"{daily_value:.3f}",
                "date": date_str,
                "interval_length": "PT1D",
                "measure_type": "B",
            })

            current_date += timedelta(days=1)

        logger.debug(f"[DEMO] Generated {len(interval_reading)} consumption records")

        return {
            "meter_reading": {
                "usage_point_id": usage_point_id,
                "start": start,
                "end": end,
                "quality": "CORRIGE",
                "reading_type": {
                    "unit": "kWh",
                    "measurement_kind": "energy",
                    "aggregate": "sum"
                },
                "interval_reading": interval_reading
            }
        }

    async def get_consumption_detail(
        self,
        usage_point_id: str,
        start: str,
        end: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """
        Get mock detailed consumption data (30-minute intervals).

        For demo purposes, we generate 30-minute intervals from daily data.
        """
        logger.debug(f"[DEMO] Fetching mock detailed consumption data for {usage_point_id}")

        # Get daily data first
        daily_data = await self.get_consumption_daily(usage_point_id, start, end, client_secret)

        # Convert daily to 30-minute intervals (simplified version)
        interval_reading = []
        for daily_record in daily_data.get("meter_reading", {}).get("interval_reading", []):
            date_str = daily_record["date"]
            daily_value = float(daily_record["value"])

            # Define consumption patterns by hour (48 half-hour intervals per day)
            # Pattern represents relative consumption by time of day
            hourly_factors = []
            for hour in range(24):
                # Create consumption pattern: lower at night (0-6h), higher during day
                if 0 <= hour < 6:
                    factor = 0.5  # Low at night
                elif 6 <= hour < 9:
                    factor = 1.3  # Morning peak
                elif 9 <= hour < 18:
                    factor = 1.0  # Normal day
                elif 18 <= hour < 22:
                    factor = 1.4  # Evening peak
                else:
                    factor = 0.7  # Late night

                # Each hour has 2 half-hour intervals
                hourly_factors.extend([factor, factor])

            # Normalize factors so they sum to 48 (total intervals per day)
            factor_sum = sum(hourly_factors)
            normalized_factors = [f * 48 / factor_sum for f in hourly_factors]

            # Generate intervals
            interval_idx = 0
            for hour in range(24):
                for half in [0, 30]:
                    interval_value = (daily_value / 48) * normalized_factors[interval_idx]

                    timestamp = f"{date_str}T{hour:02d}:{half:02d}:00+01:00"
                    interval_reading.append({
                        "value": f"{interval_value:.3f}",
                        "date": timestamp,
                        "interval_length": "PT30M",
                        "measure_type": "B",
                    })
                    interval_idx += 1

        return {
            "meter_reading": {
                "usage_point_id": usage_point_id,
                "start": start,
                "end": end,
                "quality": "CORRIGE",
                "reading_type": {
                    "unit": "kWh",
                    "measurement_kind": "energy",
                    "aggregate": "sum"
                },
                "interval_reading": interval_reading
            }
        }

    async def get_production_daily(
        self,
        usage_point_id: str,
        start: str,
        end: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """Generate mock daily production data dynamically (no cache)"""
        logger.debug(f"[DEMO] Generating dynamic production data for {usage_point_id} from {start} to {end}")

        # Only PDL 04004253849201 (Maison avec panneaux solaires) has production
        if usage_point_id != "04004253849201":
            return {
                "meter_reading": {
                    "usage_point_id": usage_point_id,
                    "start": start,
                    "end": end,
                    "reading_type": {"unit": "kWh", "measurement_kind": "energy", "aggregate": "sum"},
                    "interval_reading": []
                }
            }

        # Generate daily production data dynamically
        from datetime import datetime, timedelta
        import math

        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")

        base_daily_kwh = 15  # Average daily solar production (9 kVA installation)

        interval_reading = []
        current_date = start_date

        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            day_of_year = current_date.timetuple().tm_yday

            # Seasonal variation (higher in summer, lower in winter)
            # Peak in June (day ~172), minimum in December (day ~355)
            season_factor = 1 + 0.5 * math.sin(2 * math.pi * (day_of_year - 80) / 365)

            # Weather variation (simulate cloudy/sunny days)
            import random
            random.seed(hash(date_str + usage_point_id + "prod"))  # Deterministic randomness
            weather_factor = 0.3 + random.random() * 0.7  # 30% to 100% of potential

            # Calculate daily value with variations
            daily_value = base_daily_kwh * season_factor * weather_factor

            interval_reading.append({
                "value": f"{daily_value:.3f}",
                "date": date_str,
                "interval_length": "PT1D",
                "measure_type": "B",
            })

            current_date += timedelta(days=1)

        logger.debug(f"[DEMO] Generated {len(interval_reading)} production records")

        return {
            "meter_reading": {
                "usage_point_id": usage_point_id,
                "start": start,
                "end": end,
                "quality": "CORRIGE",
                "reading_type": {
                    "unit": "kWh",
                    "measurement_kind": "energy",
                    "aggregate": "sum"
                },
                "interval_reading": interval_reading
            }
        }

    async def get_production_detail(
        self,
        usage_point_id: str,
        start: str,
        end: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """Get mock detailed production data (30-minute intervals)"""
        logger.debug(f"[DEMO] Fetching mock detailed production data for {usage_point_id}")

        # Get daily data first
        daily_data = await self.get_production_daily(usage_point_id, start, end, client_secret)

        # Convert daily to 30-minute intervals
        interval_reading = []
        for daily_record in daily_data.get("meter_reading", {}).get("interval_reading", []):
            date_str = daily_record["date"]
            daily_value = float(daily_record["value"])

            # Define solar production pattern (bell curve during daylight)
            hourly_factors = []
            for hour in range(24):
                # Solar production only during daylight (6h-20h)
                if 6 <= hour < 20:
                    # Bell curve: peak at noon (12h)
                    distance_from_noon = abs(hour - 12)
                    factor = max(0, 1 - (distance_from_noon / 7))  # Softer curve
                else:
                    factor = 0.0

                # Each hour has 2 half-hour intervals
                hourly_factors.extend([factor, factor])

            # Normalize factors so they sum to 48 (total intervals per day)
            factor_sum = sum(hourly_factors)
            if factor_sum > 0:
                normalized_factors = [f * 48 / factor_sum for f in hourly_factors]
            else:
                normalized_factors = [0] * 48

            # Generate intervals
            interval_idx = 0
            for hour in range(24):
                for half in [0, 30]:
                    interval_value = (daily_value / 48) * normalized_factors[interval_idx]

                    timestamp = f"{date_str}T{hour:02d}:{half:02d}:00+01:00"
                    interval_reading.append({
                        "value": f"{interval_value:.3f}",
                        "date": timestamp,
                        "interval_length": "PT30M",
                        "measure_type": "B",
                    })
                    interval_idx += 1

        return {
            "meter_reading": {
                "usage_point_id": usage_point_id,
                "start": start,
                "end": end,
                "quality": "CORRIGE",
                "reading_type": {
                    "unit": "kWh",
                    "measurement_kind": "energy",
                    "aggregate": "sum"
                },
                "interval_reading": interval_reading
            }
        }

    async def get_max_power(
        self,
        usage_point_id: str,
        start: str,
        end: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """
        Get mock max power data.
        Generate realistic daily max power data based on consumption patterns.
        """
        logger.debug(f"[DEMO] Fetching mock max power data for {usage_point_id} from {start} to {end}")

        # Get consumption data to derive max power
        cache_key = f"demo:consumption:daily:{usage_point_id}"
        cached_data = await self.cache_service.get(cache_key, client_secret)

        if not cached_data:
            logger.warning(f"[DEMO] No cached consumption data found for {usage_point_id}")
            return {
                "meter_reading": {
                    "usage_point_id": usage_point_id,
                    "start": start,
                    "end": end,
                    "reading_type": {"unit": "kVA", "measurement_kind": "power", "aggregate": "maximum"},
                    "interval_reading": []
                }
            }

        # Filter data by date range
        all_data = cached_data.get("data", [])
        filtered_data = [
            item for item in all_data
            if start <= item["date"] <= end
        ]

        # Calculate max power (roughly 1.5-2x average hourly consumption)
        # If daily consumption is 20 kWh, average per hour is ~0.83 kW, peaks can be 2-3 kVA
        interval_reading = []
        for item in filtered_data:
            daily_kwh = float(item["value"])
            # Estimate max power as daily_kwh / 12 (assuming 12 hours of active use)
            # Then add some variation for realistic peaks
            import random
            base_power = daily_kwh / 12
            max_power = base_power * random.uniform(2.0, 3.5)  # Peak is 2-3.5x average

            interval_reading.append({
                "value": f"{max_power:.3f}",
                "date": item["date"],
                "interval_length": "PT1D",
                "measure_type": "B",
            })

        logger.debug(f"[DEMO] Returning {len(interval_reading)} max power records")

        return {
            "meter_reading": {
                "usage_point_id": usage_point_id,
                "start": start,
                "end": end,
                "quality": "CORRIGE",
                "reading_type": {
                    "unit": "kVA",
                    "measurement_kind": "power",
                    "aggregate": "maximum"
                },
                "interval_reading": interval_reading
            }
        }

    async def get_contract(
        self,
        usage_point_id: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """Get mock contract information"""
        logger.debug(f"[DEMO] Fetching mock contract for {usage_point_id}")

        cache_key = f"demo:contract:{usage_point_id}"
        cached_data = await self.cache_service.get(cache_key, client_secret)

        if not cached_data:
            # Return default contract if not cached
            return {
                "customer": {
                    "usage_point_id": usage_point_id,
                    "usage_point_status": "com",
                    "meter_type": "AMM"
                }
            }

        return {
            "customer": {
                "usage_point_id": usage_point_id,
                "usage_point_status": "com",
                "meter_type": "AMM",
                "subscribed_power": str(cached_data.get("subscribed_power", "6")),
                "offpeak_hours": cached_data.get("offpeak_hours"),
                "last_activation_date": cached_data.get("activation_date"),
            }
        }

    async def get_address(
        self,
        usage_point_id: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """Get mock address information"""
        logger.debug(f"[DEMO] Fetching mock address for {usage_point_id}")

        cache_key = f"demo:address:{usage_point_id}"
        cached_data = await self.cache_service.get(cache_key, client_secret)

        if not cached_data:
            # Return default address
            return {
                "customer": {
                    "usage_point_id": usage_point_id,
                    "usage_point_addresses": {
                        "street": "123 Rue de la Démo",
                        "locality": "Paris",
                        "postal_code": "75001",
                        "insee_code": "75101",
                        "city": "Paris",
                        "country": "France"
                    }
                }
            }

        return {
            "customer": {
                "usage_point_id": usage_point_id,
                "usage_point_addresses": {
                    "street": cached_data.get("street", "123 Rue de la Démo"),
                    "locality": cached_data.get("city", "Paris"),
                    "postal_code": cached_data.get("postal_code", "75001"),
                    "insee_code": "75101",
                    "city": cached_data.get("city", "Paris"),
                    "country": "France"
                }
            }
        }

    async def get_customer(
        self,
        usage_point_id: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """Get mock customer information"""
        logger.debug(f"[DEMO] Fetching mock customer for {usage_point_id}")

        return {
            "customer": {
                "customer_id": "demo_customer_123",
                "usage_point_id": usage_point_id,
                "civil_title": "MR",
                "first_name": "Demo",
                "last_name": "User"
            }
        }

    async def get_contact(
        self,
        usage_point_id: str,
        client_secret: str,
    ) -> dict[str, Any]:
        """Get mock contact information"""
        logger.debug(f"[DEMO] Fetching mock contact for {usage_point_id}")

        return {
            "customer": {
                "usage_point_id": usage_point_id,
                "email": "demo@myelectricaldata.fr",
                "phone_number": "+33123456789"
            }
        }


# Global instance
demo_adapter = DemoAdapter()
