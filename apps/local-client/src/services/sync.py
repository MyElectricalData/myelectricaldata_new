"""Synchronization service for fetching data from the gateway."""

import json
import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from ..config import Settings
from ..database import Repository
from ..exporters import ExporterManager
from ..gateway import GatewayClient

logger = logging.getLogger(__name__)


class SyncService:
    """Service for synchronizing data from the gateway.

    Handles:
    - Fetching PDL information
    - Fetching consumption and production data
    - Storing data in the local database
    - Exporting data to configured exporters
    """

    def __init__(
        self,
        settings: Settings,
        repository: Repository,
        gateway: GatewayClient,
        exporter_manager: ExporterManager,
    ):
        """Initialize the sync service.

        Args:
            settings: Application settings.
            repository: Database repository.
            gateway: Gateway API client.
            exporter_manager: Exporter manager.
        """
        self.settings = settings
        self.repository = repository
        self.gateway = gateway
        self.exporter_manager = exporter_manager

    async def sync_all(self) -> Dict[str, Any]:
        """Synchronize all PDLs.

        Returns:
            Summary of sync results.
        """
        logger.info("Starting full synchronization")

        results = {
            "pdls": [],
            "success_count": 0,
            "error_count": 0,
            "errors": [],
        }

        try:
            # Get all PDLs from gateway
            all_pdls = await self.gateway.get_pdls()
            # Filter only active PDLs
            active_pdls = [p for p in all_pdls if getattr(p, "is_active", True)]
            inactive_pdls = [p for p in all_pdls if not getattr(p, "is_active", True)]

            # Build maps for resolving linked PDLs
            id_to_pdl = {getattr(p, "id", None): p for p in all_pdls if getattr(p, "id", None)}
            usage_point_to_pdl = {p.usage_point_id: p for p in all_pdls}

            # Find which production PDLs are linked to consumption PDLs
            linked_production_pdls = set()
            for p in active_pdls:
                linked_id = getattr(p, "linked_production_pdl_id", None)
                if linked_id and linked_id in id_to_pdl:
                    linked_pdl = id_to_pdl[linked_id]
                    linked_production_pdls.add(linked_pdl.usage_point_id)
                    logger.info(f"PDL {p.usage_point_id} ({p.name}) is linked to production PDL {linked_pdl.usage_point_id} ({linked_pdl.name})")

            # Filter out production PDLs that are linked (they will be merged)
            pdls_to_sync = [p for p in active_pdls if p.usage_point_id not in linked_production_pdls]
            logger.info(f"Found {len(pdls_to_sync)} PDL(s) to sync (out of {len(active_pdls)} active, {len(linked_production_pdls)} merged)")

            # Remove inactive PDLs from local database
            for inactive_pdl in inactive_pdls:
                existing = await self.repository.get_pdl(inactive_pdl.usage_point_id)
                if existing:
                    logger.info(f"Removing inactive PDL {inactive_pdl.usage_point_id} from local database")
                    await self.repository.delete_pdl(inactive_pdl.usage_point_id)

            # Remove linked production PDLs from local database (they are merged with consumption PDL)
            for linked_usage_point_id in linked_production_pdls:
                existing = await self.repository.get_pdl(linked_usage_point_id)
                if existing:
                    logger.info(f"Removing linked production PDL {linked_usage_point_id} from local database (merged)")
                    await self.repository.delete_pdl(linked_usage_point_id)

            for pdl_info in pdls_to_sync:
                # Resolve linked production PDL usage_point_id
                linked_production_usage_point_id = None
                linked_id = getattr(pdl_info, "linked_production_pdl_id", None)
                if linked_id and linked_id in id_to_pdl:
                    linked_production_usage_point_id = id_to_pdl[linked_id].usage_point_id

                pdl_result = await self.sync_pdl(
                    pdl_info.usage_point_id,
                    pdl_info=pdl_info,
                    linked_production_usage_point_id=linked_production_usage_point_id
                )
                results["pdls"].append(pdl_result)

                if pdl_result["success"]:
                    results["success_count"] += 1
                else:
                    results["error_count"] += 1
                    results["errors"].append({
                        "pdl": pdl_info.usage_point_id,
                        "error": pdl_result.get("error"),
                    })

        except Exception as e:
            logger.error(f"Sync failed: {e}")
            results["errors"].append({"error": str(e)})
            results["error_count"] += 1

        logger.info(
            f"Sync completed: {results['success_count']} success, "
            f"{results['error_count']} errors"
        )

        return results

    async def sync_pdl(
        self,
        usage_point_id: str,
        pdl_info: Optional[Any] = None,
        linked_production_usage_point_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Synchronize a single PDL.

        Args:
            usage_point_id: PDL identifier.
            pdl_info: Optional PDL info object already fetched.
            linked_production_usage_point_id: Optional linked production PDL usage_point_id.

        Returns:
            Sync result for this PDL.
        """
        logger.info(f"Syncing PDL {usage_point_id}" + (f" (with linked production {linked_production_usage_point_id})" if linked_production_usage_point_id else ""))

        result = {
            "pdl": usage_point_id,
            "success": False,
            "consumption_days": 0,
            "production_days": 0,
        }

        try:
            # Notify exporters
            await self.exporter_manager.notify_sync_start(usage_point_id)

            # Sync PDL info from already fetched data or fetch it
            if pdl_info:
                await self._sync_pdl_info_from_data(pdl_info, linked_production_usage_point_id)
            else:
                # Try to get PDL info from the list endpoint
                pdls = await self.gateway.get_pdls()
                for p in pdls:
                    if p.usage_point_id == usage_point_id:
                        await self._sync_pdl_info_from_data(p, linked_production_usage_point_id)
                        pdl_info = p
                        break

            # Calculate date range
            end_date = date.today() - timedelta(days=1)  # Yesterday
            start_date = end_date - timedelta(days=self.settings.sync.days_back)

            # Sync consumption data
            if self.settings.data.consumption.enabled:
                consumption_result = await self._sync_consumption(
                    usage_point_id, start_date, end_date
                )
                result["consumption_days"] = consumption_result["days"]

            # Sync production data if enabled - use linked production PDL if available
            pdl = await self.repository.get_pdl(usage_point_id)
            has_production = (pdl and pdl.has_production) or linked_production_usage_point_id
            if has_production and self.settings.data.production.enabled:
                production_pdl = linked_production_usage_point_id or usage_point_id
                production_result = await self._sync_production(
                    production_pdl, start_date, end_date, store_as_pdl=usage_point_id
                )
                result["production_days"] = production_result["days"]

            # Update sync status
            await self.repository.update_sync_status(
                usage_point_id,
                success=True,
                consumption_last_date=end_date if result["consumption_days"] > 0 else None,
                production_last_date=end_date if result["production_days"] > 0 else None,
            )

            result["success"] = True

            # Notify exporters
            await self.exporter_manager.notify_sync_complete(usage_point_id, True)

            logger.info(
                f"PDL {usage_point_id} synced: "
                f"{result['consumption_days']} consumption days, "
                f"{result['production_days']} production days"
            )

        except Exception as e:
            logger.error(f"Error syncing PDL {usage_point_id}: {e}")
            result["error"] = str(e)

            await self.repository.update_sync_status(
                usage_point_id,
                success=False,
                error_message=str(e),
            )

            await self.exporter_manager.notify_sync_complete(usage_point_id, False)

        return result

    async def _sync_pdl_info_from_data(self, pdl_info: Any, linked_production_usage_point_id: Optional[str] = None) -> None:
        """Sync PDL information from already fetched data.

        Args:
            pdl_info: PDL info object.
            linked_production_usage_point_id: Optional linked production PDL usage_point_id.
        """
        # If there's a linked production PDL, mark has_production as True
        has_production = getattr(pdl_info, "has_production", False) or bool(linked_production_usage_point_id)

        await self.repository.upsert_pdl({
            "usage_point_id": pdl_info.usage_point_id,
            "name": getattr(pdl_info, "name", None),
            "address": getattr(pdl_info, "address", None),
            "postal_code": getattr(pdl_info, "postal_code", None),
            "city": getattr(pdl_info, "city", None),
            "subscribed_power": getattr(pdl_info, "subscribed_power", None),
            "tariff_option": getattr(pdl_info, "tariff_option", None) or getattr(pdl_info, "pricing_option", None),
            "has_production": has_production,
            "has_consumption": getattr(pdl_info, "has_consumption", True),
            "linked_production_usage_point_id": linked_production_usage_point_id,
            "contract_status": getattr(pdl_info, "contract_status", None),
        })

    async def _sync_consumption(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> Dict[str, Any]:
        """Sync consumption data.

        Args:
            usage_point_id: PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Sync result with number of days synced.
        """
        result = {"days": 0}

        try:
            # Get daily consumption
            response = await self.gateway.get_consumption_daily(
                usage_point_id, start_date, end_date
            )

            # Get max power if enabled
            max_power_data = {}
            if self.settings.data.consumption.max_power:
                try:
                    max_power_response = await self.gateway.get_max_power(
                        usage_point_id, start_date, end_date
                    )
                    max_power_data = {
                        item.date: item.value for item in max_power_response.data
                    }
                except Exception as e:
                    logger.warning(f"Failed to get max power: {e}")

            # Prepare data for storage
            consumption_list = []
            for item in response.data:
                data = {
                    "date": item.date,
                    "daily_kwh": item.value,
                    "hc_kwh": item.hc,
                    "hp_kwh": item.hp,
                    "max_power_kva": max_power_data.get(item.date),
                }
                consumption_list.append(data)

                # Export to exporters
                export_data = {
                    "daily": item.value,
                    "hc": item.hc,
                    "hp": item.hp,
                    "max_power": max_power_data.get(item.date),
                }
                await self.exporter_manager.export_consumption(
                    usage_point_id,
                    export_data,
                    metadata={"date": item.date.isoformat()},
                )

            # Store in database
            result["days"] = await self.repository.upsert_consumption(
                usage_point_id, consumption_list
            )

        except Exception as e:
            logger.error(f"Error syncing consumption for {usage_point_id}: {e}")
            raise

        return result

    async def _sync_production(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
        store_as_pdl: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Sync production data.

        Args:
            usage_point_id: PDL identifier to fetch from gateway.
            start_date: Start date.
            end_date: End date.
            store_as_pdl: Optional PDL to store data under (for linked production PDLs).

        Returns:
            Sync result with number of days synced.
        """
        result = {"days": 0}
        storage_pdl = store_as_pdl or usage_point_id

        try:
            response = await self.gateway.get_production_daily(
                usage_point_id, start_date, end_date
            )

            # Prepare data for storage
            production_list = []
            for item in response.data:
                data = {
                    "date": item.date,
                    "daily_kwh": item.value,
                }
                production_list.append(data)

                # Export to exporters (use storage PDL for consistency)
                export_data = {"daily": item.value}
                await self.exporter_manager.export_production(
                    storage_pdl,
                    export_data,
                    metadata={"date": item.date.isoformat()},
                )

            # Store in database under the storage PDL
            result["days"] = await self.repository.upsert_production(
                storage_pdl, production_list
            )

        except Exception as e:
            logger.error(f"Error syncing production for {usage_point_id}: {e}")
            raise

        return result

    async def get_status(self) -> Dict[str, Any]:
        """Get current sync status.

        Returns:
            Status information.
        """
        pdls = await self.repository.get_all_pdls()

        pdl_status = []
        for pdl in pdls:
            sync_status = await self.repository.get_sync_status(pdl.usage_point_id)
            pdl_status.append({
                "pdl": pdl.usage_point_id,
                "last_sync": sync_status.last_sync.isoformat() if sync_status and sync_status.last_sync else None,
                "last_success": sync_status.last_success.isoformat() if sync_status and sync_status.last_success else None,
                "last_error": sync_status.last_error if sync_status else None,
                "sync_count": sync_status.sync_count if sync_status else 0,
            })

        return {
            "status": "ok",
            "pdl_count": len(pdls),
            "pdls": pdl_status,
        }
