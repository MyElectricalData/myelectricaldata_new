"""Repository for database operations."""

import json
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base, ConsumptionData, PDL, ProductionData, SyncStatus


class Repository:
    """Repository for database operations.

    Provides CRUD operations for all models with async support.
    """

    def __init__(self, database_url: str):
        """Initialize the repository.

        Args:
            database_url: Database connection URL.
        """
        self.database_url = database_url
        self.engine = create_async_engine(database_url, echo=False)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def init_db(self) -> None:
        """Initialize the database, creating all tables."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def close(self) -> None:
        """Close the database connection."""
        await self.engine.dispose()

    # PDL Operations
    async def get_pdl(self, usage_point_id: str) -> Optional[PDL]:
        """Get a PDL by usage point ID.

        Args:
            usage_point_id: The PDL identifier.

        Returns:
            PDL instance or None if not found.
        """
        async with self.session_factory() as session:
            result = await session.execute(select(PDL).where(PDL.usage_point_id == usage_point_id))
            return result.scalar_one_or_none()

    async def get_all_pdls(self) -> List[PDL]:
        """Get all PDLs.

        Returns:
            List of all PDL instances.
        """
        async with self.session_factory() as session:
            result = await session.execute(select(PDL).order_by(PDL.usage_point_id))
            return list(result.scalars().all())

    async def upsert_pdl(self, pdl_data: Dict[str, Any]) -> PDL:
        """Insert or update a PDL.

        Args:
            pdl_data: PDL data dictionary.

        Returns:
            The upserted PDL instance.
        """
        async with self.session_factory() as session:
            usage_point_id = pdl_data["usage_point_id"]

            # Check if PDL exists
            result = await session.execute(select(PDL).where(PDL.usage_point_id == usage_point_id))
            existing = result.scalar_one_or_none()

            if existing:
                # Update existing PDL
                for key, value in pdl_data.items():
                    if key != "usage_point_id" and hasattr(existing, key):
                        setattr(existing, key, value)
                existing.updated_at = datetime.utcnow()
                pdl = existing
            else:
                # Create new PDL
                pdl = PDL(**pdl_data)
                session.add(pdl)

            await session.commit()
            await session.refresh(pdl)
            return pdl

    async def delete_pdl(self, usage_point_id: str) -> bool:
        """Delete a PDL and all associated data.

        Args:
            usage_point_id: The PDL identifier.

        Returns:
            True if deleted, False if not found.
        """
        async with self.session_factory() as session:
            result = await session.execute(delete(PDL).where(PDL.usage_point_id == usage_point_id))
            await session.commit()
            return result.rowcount > 0

    # Consumption Data Operations
    async def get_consumption(
        self,
        usage_point_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> List[ConsumptionData]:
        """Get consumption data for a PDL.

        Args:
            usage_point_id: The PDL identifier.
            start_date: Optional start date filter.
            end_date: Optional end date filter.

        Returns:
            List of consumption data records.
        """
        async with self.session_factory() as session:
            query = (
                select(ConsumptionData)
                .join(PDL)
                .where(PDL.usage_point_id == usage_point_id)
                .order_by(ConsumptionData.date.desc())
            )

            if start_date:
                query = query.where(ConsumptionData.date >= start_date)
            if end_date:
                query = query.where(ConsumptionData.date <= end_date)

            result = await session.execute(query)
            return list(result.scalars().all())

    async def get_latest_consumption(self, usage_point_id: str) -> Optional[ConsumptionData]:
        """Get the latest consumption data for a PDL.

        Args:
            usage_point_id: The PDL identifier.

        Returns:
            Latest consumption data or None.
        """
        async with self.session_factory() as session:
            result = await session.execute(
                select(ConsumptionData)
                .join(PDL)
                .where(PDL.usage_point_id == usage_point_id)
                .order_by(ConsumptionData.date.desc())
                .limit(1)
            )
            return result.scalar_one_or_none()

    async def upsert_consumption(self, usage_point_id: str, consumption_list: List[Dict[str, Any]]) -> int:
        """Insert or update consumption data.

        Args:
            usage_point_id: The PDL identifier.
            consumption_list: List of consumption data dictionaries.

        Returns:
            Number of records upserted.
        """
        if not consumption_list:
            return 0

        async with self.session_factory() as session:
            # Get PDL ID
            result = await session.execute(select(PDL.id).where(PDL.usage_point_id == usage_point_id))
            pdl_id = result.scalar_one_or_none()
            if pdl_id is None:
                return 0

            count = 0
            for data in consumption_list:
                # Check if record exists
                result = await session.execute(
                    select(ConsumptionData).where(
                        ConsumptionData.pdl_id == pdl_id, ConsumptionData.date == data["date"]
                    )
                )
                existing = result.scalar_one_or_none()

                if existing:
                    # Update
                    for key, value in data.items():
                        if key != "date" and hasattr(existing, key):
                            setattr(existing, key, value)
                else:
                    # Insert
                    record = ConsumptionData(pdl_id=pdl_id, **data)
                    session.add(record)
                count += 1

            await session.commit()
            return count

    # Production Data Operations
    async def get_production(
        self,
        usage_point_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> List[ProductionData]:
        """Get production data for a PDL.

        Args:
            usage_point_id: The PDL identifier.
            start_date: Optional start date filter.
            end_date: Optional end date filter.

        Returns:
            List of production data records.
        """
        async with self.session_factory() as session:
            query = (
                select(ProductionData)
                .join(PDL)
                .where(PDL.usage_point_id == usage_point_id)
                .order_by(ProductionData.date.desc())
            )

            if start_date:
                query = query.where(ProductionData.date >= start_date)
            if end_date:
                query = query.where(ProductionData.date <= end_date)

            result = await session.execute(query)
            return list(result.scalars().all())

    async def get_latest_production(self, usage_point_id: str) -> Optional[ProductionData]:
        """Get the latest production data for a PDL.

        Args:
            usage_point_id: The PDL identifier.

        Returns:
            Latest production data or None.
        """
        async with self.session_factory() as session:
            result = await session.execute(
                select(ProductionData)
                .join(PDL)
                .where(PDL.usage_point_id == usage_point_id)
                .order_by(ProductionData.date.desc())
                .limit(1)
            )
            return result.scalar_one_or_none()

    async def upsert_production(self, usage_point_id: str, production_list: List[Dict[str, Any]]) -> int:
        """Insert or update production data.

        Args:
            usage_point_id: The PDL identifier.
            production_list: List of production data dictionaries.

        Returns:
            Number of records upserted.
        """
        if not production_list:
            return 0

        async with self.session_factory() as session:
            # Get PDL ID
            result = await session.execute(select(PDL.id).where(PDL.usage_point_id == usage_point_id))
            pdl_id = result.scalar_one_or_none()
            if pdl_id is None:
                return 0

            count = 0
            for data in production_list:
                # Check if record exists
                result = await session.execute(
                    select(ProductionData).where(ProductionData.pdl_id == pdl_id, ProductionData.date == data["date"])
                )
                existing = result.scalar_one_or_none()

                if existing:
                    # Update
                    for key, value in data.items():
                        if key != "date" and hasattr(existing, key):
                            setattr(existing, key, value)
                else:
                    # Insert
                    record = ProductionData(pdl_id=pdl_id, **data)
                    session.add(record)
                count += 1

            await session.commit()
            return count

    # Sync Status Operations
    async def get_sync_status(self, usage_point_id: str) -> Optional[SyncStatus]:
        """Get sync status for a PDL.

        Args:
            usage_point_id: The PDL identifier.

        Returns:
            Sync status or None.
        """
        async with self.session_factory() as session:
            result = await session.execute(
                select(SyncStatus).join(PDL).where(PDL.usage_point_id == usage_point_id)
            )
            return result.scalar_one_or_none()

    async def update_sync_status(
        self,
        usage_point_id: str,
        success: bool,
        error_message: Optional[str] = None,
        consumption_last_date: Optional[date] = None,
        production_last_date: Optional[date] = None,
    ) -> Optional[SyncStatus]:
        """Update sync status for a PDL.

        Args:
            usage_point_id: The PDL identifier.
            success: Whether sync was successful.
            error_message: Optional error message if failed.
            consumption_last_date: Last consumption date synced.
            production_last_date: Last production date synced.

        Returns:
            Updated sync status or None.
        """
        async with self.session_factory() as session:
            # Get PDL ID
            result = await session.execute(select(PDL.id).where(PDL.usage_point_id == usage_point_id))
            pdl_id = result.scalar_one_or_none()
            if pdl_id is None:
                return None

            # Get or create sync status
            result = await session.execute(select(SyncStatus).where(SyncStatus.pdl_id == pdl_id))
            sync_status = result.scalar_one_or_none()

            now = datetime.utcnow()

            if sync_status is None:
                sync_status = SyncStatus(pdl_id=pdl_id, sync_count=0, error_count=0)
                session.add(sync_status)

            sync_status.last_sync = now
            sync_status.sync_count = (sync_status.sync_count or 0) + 1

            if success:
                sync_status.last_success = now
                sync_status.last_error = None
                if consumption_last_date:
                    sync_status.consumption_last_date = consumption_last_date
                if production_last_date:
                    sync_status.production_last_date = production_last_date
            else:
                sync_status.error_count = (sync_status.error_count or 0) + 1
                sync_status.last_error = error_message

            await session.commit()
            await session.refresh(sync_status)
            return sync_status

    # Statistics
    async def get_consumption_stats(
        self, usage_point_id: str, start_date: date, end_date: date
    ) -> Dict[str, Any]:
        """Get consumption statistics for a period.

        Args:
            usage_point_id: The PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Dictionary with statistics.
        """
        data = await self.get_consumption(usage_point_id, start_date, end_date)

        if not data:
            return {"total": 0, "average": 0, "max": 0, "min": 0, "days": 0}

        total = sum(d.daily_kwh for d in data)
        return {
            "total": round(total, 3),
            "average": round(total / len(data), 3),
            "max": round(max(d.daily_kwh for d in data), 3),
            "min": round(min(d.daily_kwh for d in data), 3),
            "days": len(data),
            "hc_total": round(sum(d.hc_kwh or 0 for d in data), 3),
            "hp_total": round(sum(d.hp_kwh or 0 for d in data), 3),
        }

    async def get_production_stats(
        self, usage_point_id: str, start_date: date, end_date: date
    ) -> Dict[str, Any]:
        """Get production statistics for a period.

        Args:
            usage_point_id: The PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Dictionary with statistics.
        """
        data = await self.get_production(usage_point_id, start_date, end_date)

        if not data:
            return {"total": 0, "average": 0, "max": 0, "min": 0, "days": 0}

        total = sum(d.daily_kwh for d in data)
        return {
            "total": round(total, 3),
            "average": round(total / len(data), 3),
            "max": round(max(d.daily_kwh for d in data), 3),
            "min": round(min(d.daily_kwh for d in data), 3),
            "days": len(data),
        }
