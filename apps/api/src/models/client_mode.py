"""Client Mode Models

These models are used exclusively in CLIENT_MODE to store data permanently in PostgreSQL.
In server mode, data is cached temporarily in Valkey.

Models:
- ConsumptionData: Daily and detailed (30-min) consumption data
- ProductionData: Daily and detailed production data
- SyncStatus: Sync status and history per PDL
- ExportConfig: Export configurations (Home Assistant, MQTT, VictoriaMetrics)
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class DataGranularity(str, enum.Enum):
    """Data granularity levels"""

    DAILY = "daily"  # 1 point per day
    DETAILED = "detailed"  # 1 point per 30 minutes


class ConsumptionData(Base, TimestampMixin):
    """Store consumption data from MyElectricalData API

    Stores both daily and detailed (30-min interval) consumption data.
    Daily data can be stored for up to 3 years.
    Detailed data can be stored for up to 2 years.
    """

    __tablename__ = "consumption_data"
    __table_args__ = (
        UniqueConstraint("usage_point_id", "date", "granularity", "interval_start", name="uq_consumption_data"),
        Index("ix_consumption_usage_point_date", "usage_point_id", "date"),
        Index("ix_consumption_granularity_date", "granularity", "date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usage_point_id: Mapped[str] = mapped_column(String(14), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    granularity: Mapped[DataGranularity] = mapped_column(
        SQLEnum(DataGranularity, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )

    # For detailed data: start time of the 30-min interval (e.g., "00:00", "00:30")
    # For daily data: NULL
    interval_start: Mapped[str | None] = mapped_column(String(5), nullable=True)

    # Energy value in Wh
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    # Source metadata
    source: Mapped[str] = mapped_column(String(50), default="myelectricaldata")
    raw_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<ConsumptionData({self.usage_point_id}, {self.date}, {self.granularity.value}, {self.value}Wh)>"


class ProductionData(Base, TimestampMixin):
    """Store production data from MyElectricalData API

    Similar structure to ConsumptionData for solar panel production.
    """

    __tablename__ = "production_data"
    __table_args__ = (
        UniqueConstraint("usage_point_id", "date", "granularity", "interval_start", name="uq_production_data"),
        Index("ix_production_usage_point_date", "usage_point_id", "date"),
        Index("ix_production_granularity_date", "granularity", "date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usage_point_id: Mapped[str] = mapped_column(String(14), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    granularity: Mapped[DataGranularity] = mapped_column(
        SQLEnum(DataGranularity, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )

    # For detailed data: start time of the 30-min interval
    interval_start: Mapped[str | None] = mapped_column(String(5), nullable=True)

    # Energy value in Wh
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    # Source metadata
    source: Mapped[str] = mapped_column(String(50), default="myelectricaldata")
    raw_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<ProductionData({self.usage_point_id}, {self.date}, {self.granularity.value}, {self.value}Wh)>"


class SyncStatusType(str, enum.Enum):
    """Sync operation status"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"  # Some data synced, some failed


class SyncStatus(Base, TimestampMixin):
    """Track sync status for each PDL

    Records the last sync attempt, status, and any errors.
    Also tracks the date range of available data.
    """

    __tablename__ = "sync_status"
    __table_args__ = (
        UniqueConstraint("usage_point_id", "data_type", "granularity", name="uq_sync_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usage_point_id: Mapped[str] = mapped_column(String(14), nullable=False, index=True)

    # What type of data: consumption, production
    data_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Granularity: daily or detailed
    granularity: Mapped[DataGranularity] = mapped_column(
        SQLEnum(DataGranularity, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )

    # Current sync status
    status: Mapped[SyncStatusType] = mapped_column(
        SQLEnum(SyncStatusType, values_callable=lambda x: [e.value for e in x]),
        default=SyncStatusType.PENDING,
    )

    # Sync progress
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Data range available
    oldest_data_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    newest_data_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Sync statistics
    total_records: Mapped[int] = mapped_column(Integer, default=0)
    records_synced_last_run: Mapped[int] = mapped_column(Integer, default=0)

    # Error tracking
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<SyncStatus({self.usage_point_id}, {self.data_type}, {self.granularity.value}, {self.status.value})>"


class ExportType(str, enum.Enum):
    """Supported export types"""

    HOME_ASSISTANT = "home_assistant"
    MQTT = "mqtt"
    VICTORIAMETRICS = "victoriametrics"


class ExportConfig(Base, TimestampMixin):
    """Store export configurations

    Each export type has its own configuration stored as JSON.
    Multiple exports of the same type can be configured.
    """

    __tablename__ = "export_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Export type
    export_type: Mapped[ExportType] = mapped_column(
        SQLEnum(ExportType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )

    # Type-specific configuration stored as JSON
    # Home Assistant: {mqtt_broker, mqtt_port, mqtt_username, mqtt_password, mqtt_use_tls,
    #                  entity_prefix, discovery_prefix, ha_url, ha_token, statistic_id_prefix}
    # MQTT: {broker, port, username, password, use_tls, topic_prefix, qos, retain}
    # VictoriaMetrics: {url, database, username, password}
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Which PDLs to export (NULL = all)
    usage_point_ids: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Export settings
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    export_consumption: Mapped[bool] = mapped_column(Boolean, default=True)
    export_production: Mapped[bool] = mapped_column(Boolean, default=True)
    export_detailed: Mapped[bool] = mapped_column(Boolean, default=False)  # Export 30-min data

    # Scheduling (NULL = manual only, 0 = disabled)
    export_interval_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    next_export_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status tracking
    last_export_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_export_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_export_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    export_count: Mapped[int] = mapped_column(Integer, default=0)

    def __repr__(self) -> str:
        return f"<ExportConfig({self.name}, {self.export_type.value}, enabled={self.is_enabled})>"


class ContractData(Base, TimestampMixin):
    """Store contract data from MyElectricalData API

    Caches contract information locally for client mode.
    """

    __tablename__ = "contract_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usage_point_id: Mapped[str] = mapped_column(String(14), nullable=False, unique=True, index=True)

    # Contract details
    subscribed_power: Mapped[int | None] = mapped_column(Integer, nullable=True)  # kVA
    pricing_option: Mapped[str | None] = mapped_column(String(50), nullable=True)
    offpeak_hours: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Meter info
    segment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reading_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Address
    address: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Full raw data from API
    raw_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Sync tracking
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<ContractData({self.usage_point_id}, {self.subscribed_power}kVA)>"


class AddressData(Base, TimestampMixin):
    """Store address data from MyElectricalData API

    Caches address information locally for client mode.
    """

    __tablename__ = "address_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usage_point_id: Mapped[str] = mapped_column(String(14), nullable=False, unique=True, index=True)

    # Address fields
    street: Mapped[str | None] = mapped_column(String(200), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(50), nullable=True)
    insee_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # GPS coordinates
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Full raw data from API
    raw_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Sync tracking
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<AddressData({self.usage_point_id}, {self.city})>"
