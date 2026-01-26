"""Export Router for Client Mode

CRUD endpoints for export configurations (Home Assistant, MQTT, VictoriaMetrics).
Only available when CLIENT_MODE is enabled.
"""

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.client_mode import ExportConfig, ExportType
from ..models.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])


# =============================================================================
# Pydantic Schemas
# =============================================================================


class HomeAssistantConfig(BaseModel):
    """Home Assistant export configuration

    Supports two modes:
    - MQTT Discovery: Creates entities via MQTT auto-discovery
    - WebSocket API: Sends statistics to Home Assistant Energy Dashboard

    Can use one or both modes simultaneously.
    """

    # MQTT Discovery mode
    mqtt_broker: Optional[str] = Field(default=None, description="MQTT broker hostname (e.g., homeassistant.local or core-mosquitto)")
    mqtt_port: int = Field(default=1883, description="MQTT broker port")
    mqtt_username: Optional[str] = Field(default=None, description="MQTT username")
    mqtt_password: Optional[str] = Field(default=None, description="MQTT password")
    mqtt_use_tls: bool = Field(default=False, description="Use TLS for MQTT connection")
    entity_prefix: str = Field(default="myelectricaldata", description="Entity ID prefix (e.g., myelectricaldata → sensor.myelectricaldata_tempo_today)")
    discovery_prefix: str = Field(default="homeassistant", description="Home Assistant discovery topic prefix")

    # WebSocket API mode (Energy Dashboard statistics)
    ha_url: Optional[str] = Field(default=None, description="Home Assistant URL (e.g., http://homeassistant.local:8123)")
    ha_token: Optional[str] = Field(default=None, description="Long-lived access token for Home Assistant API")
    statistic_id_prefix: str = Field(default="myelectricaldata", description="Statistic ID prefix for Energy Dashboard")


class MQTTConfig(BaseModel):
    """MQTT export configuration (generic broker with custom topics)"""

    broker: str = Field(..., description="MQTT broker hostname")
    port: int = Field(default=1883, description="MQTT broker port")
    username: Optional[str] = Field(default=None, description="MQTT username")
    password: Optional[str] = Field(default=None, description="MQTT password")
    use_tls: bool = Field(default=False, description="Use TLS for MQTT connection")
    topic_prefix: str = Field(default="myelectricaldata", description="Topic prefix (e.g., myelectricaldata/<pdl>/consumption)")
    qos: int = Field(default=0, ge=0, le=2, description="Quality of Service level (0, 1, or 2)")
    retain: bool = Field(default=True, description="Retain messages on broker")


class VictoriaMetricsConfig(BaseModel):
    """VictoriaMetrics export configuration"""

    url: str = Field(..., description="VictoriaMetrics URL (e.g., http://vm:8428)")
    database: str = Field(default="myelectricaldata", description="Database/tenant name")
    username: Optional[str] = Field(default=None, description="Basic auth username")
    password: Optional[str] = Field(default=None, description="Basic auth password")


class ExportConfigCreate(BaseModel):
    """Schema for creating an export configuration"""

    name: str = Field(..., min_length=1, max_length=100, description="Configuration name")
    export_type: ExportType = Field(..., description="Export type")
    config: dict[str, Any] = Field(..., description="Type-specific configuration")
    usage_point_ids: Optional[list[str]] = Field(default=None, description="PDLs to export (null = all)")
    is_enabled: bool = Field(default=True, description="Enable export")
    export_consumption: bool = Field(default=True, description="Export consumption data")
    export_production: bool = Field(default=True, description="Export production data")
    export_detailed: bool = Field(default=False, description="Export detailed (30-min) data")
    export_interval_minutes: Optional[int] = Field(default=None, description="Auto-export interval (null = manual only)")


class ExportConfigUpdate(BaseModel):
    """Schema for updating an export configuration"""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    config: Optional[dict[str, Any]] = None
    usage_point_ids: Optional[list[str]] = None
    is_enabled: Optional[bool] = None
    export_consumption: Optional[bool] = None
    export_production: Optional[bool] = None
    export_detailed: Optional[bool] = None
    export_interval_minutes: Optional[int] = Field(default=None, description="Auto-export interval (null = manual only)")


class ExportConfigResponse(BaseModel):
    """Schema for export configuration response"""

    id: str
    name: str
    export_type: str
    config: dict[str, Any]
    usage_point_ids: Optional[list[str]]
    is_enabled: bool
    export_consumption: bool
    export_production: bool
    export_detailed: bool
    export_interval_minutes: Optional[int]
    next_export_at: Optional[str]
    last_export_at: Optional[str]
    last_export_status: Optional[str]
    last_export_error: Optional[str]
    export_count: int

    class Config:
        from_attributes = True


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/configs")
async def list_export_configs(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List all export configurations

    Returns:
        Dict with list of export configurations wrapped in APIResponse format
    """
    stmt = select(ExportConfig).order_by(ExportConfig.name)
    result = await db.execute(stmt)
    configs = result.scalars().all()

    return {
        "success": True,
        "data": {
            "configs": [
                {
                    "id": c.id,
                    "name": c.name,
                    "export_type": c.export_type.value,
                    "is_enabled": c.is_enabled,
                    "usage_point_ids": c.usage_point_ids,
                    "export_consumption": c.export_consumption,
                    "export_production": c.export_production,
                    "export_detailed": c.export_detailed,
                    "export_interval_minutes": c.export_interval_minutes,
                    "next_export_at": c.next_export_at.isoformat() if c.next_export_at else None,
                    "last_export_at": c.last_export_at.isoformat() if c.last_export_at else None,
                    "last_export_status": c.last_export_status,
                    "last_export_error": c.last_export_error,
                    "export_count": c.export_count,
                }
                for c in configs
            ],
            "count": len(configs),
        },
    }


@router.get("/configs/{config_id}")
async def get_export_config(
    config_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get a specific export configuration

    Args:
        config_id: Export configuration ID

    Returns:
        Export configuration details
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    return {
        "success": True,
        "data": {
            "id": config.id,
            "name": config.name,
            "export_type": config.export_type.value,
            "config": config.config,
            "usage_point_ids": config.usage_point_ids,
            "is_enabled": config.is_enabled,
            "export_consumption": config.export_consumption,
            "export_production": config.export_production,
            "export_detailed": config.export_detailed,
            "last_export_at": config.last_export_at.isoformat() if config.last_export_at else None,
            "last_export_status": config.last_export_status,
            "last_export_error": config.last_export_error,
            "export_count": config.export_count,
        },
    }


@router.post("/configs")
async def create_export_config(
    data: ExportConfigCreate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new export configuration

    Args:
        data: Export configuration data

    Returns:
        Created export configuration
    """
    # Validate config based on export type
    _validate_export_config(data.export_type, data.config)

    config = ExportConfig(
        name=data.name,
        export_type=data.export_type,
        config=data.config,
        usage_point_ids=data.usage_point_ids,
        is_enabled=data.is_enabled,
        export_consumption=data.export_consumption,
        export_production=data.export_production,
        export_detailed=data.export_detailed,
        export_interval_minutes=data.export_interval_minutes,
    )

    db.add(config)
    await db.commit()
    await db.refresh(config)

    logger.info(f"[EXPORT] Created export config: {config.name} ({config.export_type.value})")

    return {
        "success": True,
        "data": {
            "id": config.id,
            "name": config.name,
            "export_type": config.export_type.value,
            "is_enabled": config.is_enabled,
            "message": "Export configuration created successfully",
        },
    }


@router.put("/configs/{config_id}")
async def update_export_config(
    config_id: str,
    data: ExportConfigUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update an export configuration

    Args:
        config_id: Export configuration ID
        data: Fields to update

    Returns:
        Updated export configuration
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    # Update fields if provided
    # Debug log pour tracer les valeurs reçues
    logger.info(
        f"[EXPORT] Update request for {config.name}: "
        f"export_interval_minutes received={data.export_interval_minutes!r}, "
        f"current={config.export_interval_minutes}"
    )

    if data.name is not None:
        config.name = data.name
    if data.config is not None:
        _validate_export_config(config.export_type, data.config)
        config.config = data.config
    if data.usage_point_ids is not None:
        config.usage_point_ids = data.usage_point_ids
    if data.is_enabled is not None:
        config.is_enabled = data.is_enabled
    if data.export_consumption is not None:
        config.export_consumption = data.export_consumption
    if data.export_production is not None:
        config.export_production = data.export_production
    if data.export_detailed is not None:
        config.export_detailed = data.export_detailed
    # Gestion de export_interval_minutes :
    # - Si non fourni (None) : on ne modifie pas
    # - Si fourni avec valeur > 0 : on applique
    # - Si fourni avec valeur <= 0 : on met à null (désactive la planification)
    if data.export_interval_minutes is not None:
        if data.export_interval_minutes > 0:
            logger.info(f"[EXPORT] Setting export_interval_minutes: {config.export_interval_minutes} -> {data.export_interval_minutes}")
            config.export_interval_minutes = data.export_interval_minutes
        else:
            # 0 ou négatif = désactiver la planification
            logger.warning(
                f"[EXPORT] Disabling scheduled export (received {data.export_interval_minutes}): "
                f"{config.export_interval_minutes} -> None"
            )
            config.export_interval_minutes = None

    await db.commit()
    await db.refresh(config)

    logger.info(f"[EXPORT] Updated export config: {config.name}")

    return {
        "success": True,
        "data": {
            "id": config.id,
            "name": config.name,
            "export_type": config.export_type.value,
            "is_enabled": config.is_enabled,
            "message": "Export configuration updated successfully",
        },
    }


@router.delete("/configs/{config_id}")
async def delete_export_config(
    config_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete an export configuration

    Args:
        config_id: Export configuration ID

    Returns:
        Deletion confirmation
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    name = config.name
    await db.delete(config)
    await db.commit()

    logger.info(f"[EXPORT] Deleted export config: {name}")

    return {
        "success": True,
        "data": {
            "message": f"Export configuration '{name}' deleted successfully",
        },
    }


@router.post("/configs/{config_id}/test")
async def test_export_config(
    config_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Test an export configuration

    Attempts to connect to the export target and verify the configuration.

    Args:
        config_id: Export configuration ID

    Returns:
        Test result with success/failure details
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    # Import the appropriate exporter and test
    try:
        if config.export_type == ExportType.HOME_ASSISTANT:
            from ..services.exporters.home_assistant import HomeAssistantExporter

            exporter = HomeAssistantExporter(config.config)
            await exporter.test_connection()

        elif config.export_type == ExportType.MQTT:
            from ..services.exporters.mqtt import MQTTExporter

            exporter = MQTTExporter(config.config)
            await exporter.test_connection()

        elif config.export_type == ExportType.VICTORIAMETRICS:
            from ..services.exporters.victoriametrics import VictoriaMetricsExporter

            exporter = VictoriaMetricsExporter(config.config)
            await exporter.test_connection()

        return {
            "success": True,
            "data": {
                "success": True,
                "message": f"Connection to {config.export_type.value} successful",
            },
        }

    except Exception as e:
        logger.warning(f"[EXPORT] Test failed for {config.name}: {e}")
        return {
            "success": True,
            "data": {
                "success": False,
                "message": f"Connection test failed: {str(e)}",
            },
        }


@router.get("/configs/{config_id}/metrics")
async def read_export_metrics(
    config_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Read metrics from the export destination

    Retrieves the current state of metrics stored at the export target.
    This allows users to see what data has been sent and verify it's correct.

    Args:
        config_id: Export configuration ID

    Returns:
        Metrics currently stored at the destination
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    # Get PDLs for filtering
    from ..models.pdl import PDL

    if config.usage_point_ids:
        pdl_stmt = select(PDL.usage_point_id).where(PDL.usage_point_id.in_(config.usage_point_ids))
    else:
        pdl_stmt = select(PDL.usage_point_id).where(PDL.is_active == True)  # noqa: E712

    pdl_result = await db.execute(pdl_stmt)
    usage_point_ids = [row[0] for row in pdl_result.all()]

    # Import and initialize the appropriate exporter
    try:
        if config.export_type == ExportType.HOME_ASSISTANT:
            from ..services.exporters.home_assistant import HomeAssistantExporter
            exporter = HomeAssistantExporter(config.config)

        elif config.export_type == ExportType.MQTT:
            from ..services.exporters.mqtt import MQTTExporter
            exporter = MQTTExporter(config.config)

        elif config.export_type == ExportType.VICTORIAMETRICS:
            from ..services.exporters.victoriametrics import VictoriaMetricsExporter
            exporter = VictoriaMetricsExporter(config.config)

        else:
            return {
                "success": True,
                "data": {
                    "success": False,
                    "message": f"Type d'export non supporté: {config.export_type}",
                    "metrics": [],
                    "errors": [],
                },
            }

        # Read metrics from the destination
        metrics_data = await exporter.read_metrics(usage_point_ids)

        return {
            "success": True,
            "data": metrics_data,
        }

    except Exception as e:
        logger.error(f"[EXPORT] Failed to read metrics for {config.name}: {e}")
        return {
            "success": True,
            "data": {
                "success": False,
                "message": f"Erreur de lecture: {str(e)}",
                "metrics": [],
                "errors": [str(e)],
            },
        }


@router.post("/configs/{config_id}/run")
async def run_export(
    config_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Manually run an export

    Reads data from local PostgreSQL cache and exports to the configured target.
    Data is synced to PostgreSQL by the scheduled sync service.

    For MQTT exports, this uses the full legacy-compatible export with:
    - Status, Contract, Address
    - Annual statistics (thisYear, thisMonth, thisWeek, by month, by day)
    - Linear statistics (sliding year windows)
    - HP/HC detailed statistics
    - EcoWatt signals
    - Tempo data and consumption by color

    Args:
        config_id: Export configuration ID

    Returns:
        Export result with statistics
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    if not config.is_enabled:
        raise HTTPException(status_code=400, detail="Export configuration is disabled")

    # Get PDLs to export
    from ..models.pdl import PDL

    if config.usage_point_ids:
        pdl_stmt = select(PDL).where(PDL.usage_point_id.in_(config.usage_point_ids))
    else:
        pdl_stmt = select(PDL).where(PDL.is_active == True)  # noqa: E712

    pdl_result = await db.execute(pdl_stmt)
    pdls = pdl_result.scalars().all()

    if not pdls:
        return {
            "success": True,
            "data": {
                "message": "No PDLs to export",
                "status": "completed",
                "consumption_records": 0,
                "production_records": 0,
            },
        }

    usage_point_ids = [pdl.usage_point_id for pdl in pdls]

    # Each export type has its own full export method with comprehensive data
    if config.export_type == ExportType.HOME_ASSISTANT:
        return await _run_home_assistant_full_export(config, db, usage_point_ids)

    if config.export_type == ExportType.MQTT:
        return await _run_mqtt_full_export(config, db, usage_point_ids)

    if config.export_type == ExportType.VICTORIAMETRICS:
        return await _run_victoriametrics_full_export(config, db, usage_point_ids)

    # Fallback for unknown types
    return {
        "success": False,
        "data": {
            "message": f"Unknown export type: {config.export_type}",
            "status": "failed",
        },
    }


# =============================================================================
# Helpers
# =============================================================================


async def _run_home_assistant_full_export(
    config: ExportConfig,
    db: AsyncSession,
    usage_point_ids: list[str],
) -> dict[str, Any]:
    """Run full Home Assistant export with comprehensive data

    Uses the HomeAssistantExporter.run_full_export() method which exports:
    - Consumption/Production statistics (daily, monthly, yearly)
    - Tempo information (colors, remaining days)
    - EcoWatt signals (current level, next hour, alert)
    """
    from datetime import datetime

    from ..services.exporters.home_assistant import HomeAssistantExporter

    try:
        exporter = HomeAssistantExporter(config.config)
        export_results = await exporter.run_full_export(db, usage_point_ids)

        # Update export status
        config.last_export_at = datetime.now()
        config.export_count += 1

        if export_results.get("errors"):
            if export_results["consumption"] == 0 and export_results["tempo"] == 0:
                config.last_export_status = "failed"
            else:
                config.last_export_status = "partial"
            config.last_export_error = "; ".join(export_results["errors"][:3])
        else:
            config.last_export_status = "success"
            config.last_export_error = None

        await db.commit()

        logger.info(f"[EXPORT] Completed Home Assistant full export '{config.name}': {export_results}")

        return {
            "success": True,
            "data": {
                "message": f"Home Assistant export '{config.name}' completed",
                "status": config.last_export_status,
                "details": {
                    "consumption_sensors": export_results.get("consumption", 0),
                    "production_sensors": export_results.get("production", 0),
                    "tempo_sensors": export_results.get("tempo", 0),
                    "ecowatt_sensors": export_results.get("ecowatt", 0),
                },
                "errors": export_results.get("errors") if export_results.get("errors") else None,
            },
        }

    except Exception as e:
        logger.error(f"[EXPORT] Home Assistant full export failed: {e}")
        config.last_export_at = datetime.now()
        config.last_export_status = "failed"
        config.last_export_error = str(e)
        await db.commit()

        return {
            "success": False,
            "data": {
                "message": f"Home Assistant export failed: {str(e)}",
                "status": "failed",
            },
        }


async def _run_mqtt_full_export(
    config: ExportConfig,
    db: AsyncSession,
    usage_point_ids: list[str],
) -> dict[str, Any]:
    """Run full MQTT export with comprehensive data

    Uses the MQTTExporter.run_full_export() method which exports:
    - Consumption/Production statistics (daily, monthly, yearly)
    - Tempo information (colors, remaining days)
    - EcoWatt signals (current level, next hour, alert)
    """
    from datetime import datetime

    from ..services.exporters.mqtt import MQTTExporter

    try:
        exporter = MQTTExporter(config.config)
        export_results = await exporter.run_full_export(db, usage_point_ids)

        # Update export status
        config.last_export_at = datetime.now()
        config.export_count += 1

        if export_results.get("errors"):
            if export_results.get("consumption", 0) == 0 and export_results.get("tempo", 0) == 0:
                config.last_export_status = "failed"
            else:
                config.last_export_status = "partial"
            config.last_export_error = "; ".join(export_results["errors"][:3])
        else:
            config.last_export_status = "success"
            config.last_export_error = None

        await db.commit()

        logger.info(f"[EXPORT] Completed MQTT full export '{config.name}': {export_results}")

        return {
            "success": True,
            "data": {
                "message": f"MQTT export '{config.name}' completed",
                "status": config.last_export_status,
                "details": {
                    "consumption_messages": export_results.get("consumption", 0),
                    "production_messages": export_results.get("production", 0),
                    "tempo_messages": export_results.get("tempo", 0),
                    "ecowatt_messages": export_results.get("ecowatt", 0),
                },
                "errors": export_results.get("errors") if export_results.get("errors") else None,
            },
        }

    except Exception as e:
        logger.error(f"[EXPORT] MQTT full export failed: {e}")
        config.last_export_at = datetime.now()
        config.last_export_status = "failed"
        config.last_export_error = str(e)
        await db.commit()

        return {
            "success": False,
            "data": {
                "message": f"MQTT export failed: {str(e)}",
                "status": "failed",
            },
        }


async def _run_victoriametrics_full_export(
    config: ExportConfig,
    db: AsyncSession,
    usage_point_ids: list[str],
) -> dict[str, Any]:
    """Run full VictoriaMetrics export with comprehensive data

    Uses the VictoriaMetricsExporter.run_full_export() method which exports:
    - Raw consumption/production data (with timestamps)
    - Aggregated statistics (year, month, week totals)
    - Tempo information (colors, days used/remaining by color)
    - EcoWatt signals (j0, j1, j2 levels)
    """
    from datetime import datetime

    from ..services.exporters.victoriametrics import VictoriaMetricsExporter

    try:
        exporter = VictoriaMetricsExporter(config.config)
        export_results = await exporter.run_full_export(db, usage_point_ids)

        # Update export status
        config.last_export_at = datetime.now()
        config.export_count += 1

        if export_results.get("errors"):
            if export_results["consumption"] == 0 and export_results["stats"] == 0:
                config.last_export_status = "failed"
            else:
                config.last_export_status = "partial"
            config.last_export_error = "; ".join(export_results["errors"][:3])
        else:
            config.last_export_status = "success"
            config.last_export_error = None

        await db.commit()

        logger.info(f"[EXPORT] Completed VictoriaMetrics full export '{config.name}': {export_results}")

        return {
            "success": True,
            "data": {
                "message": f"VictoriaMetrics export '{config.name}' completed",
                "status": config.last_export_status,
                "details": {
                    "consumption_metrics": export_results.get("consumption", 0),
                    "production_metrics": export_results.get("production", 0),
                    "stats_metrics": export_results.get("stats", 0),
                    "tempo_metrics": export_results.get("tempo", 0),
                    "ecowatt_metrics": export_results.get("ecowatt", 0),
                },
                "errors": export_results.get("errors") if export_results.get("errors") else None,
            },
        }

    except Exception as e:
        logger.error(f"[EXPORT] VictoriaMetrics full export failed: {e}")
        config.last_export_at = datetime.now()
        config.last_export_status = "failed"
        config.last_export_error = str(e)
        await db.commit()

        return {
            "success": False,
            "data": {
                "message": f"VictoriaMetrics export failed: {str(e)}",
                "status": "failed",
            },
        }


def _validate_export_config(export_type: ExportType, config: dict[str, Any]) -> None:
    """Validate export configuration based on type

    Args:
        export_type: Type of export
        config: Configuration dict

    Raises:
        HTTPException if configuration is invalid
    """
    try:
        if export_type == ExportType.HOME_ASSISTANT:
            HomeAssistantConfig(**config)
        elif export_type == ExportType.MQTT:
            MQTTConfig(**config)
        elif export_type == ExportType.VICTORIAMETRICS:
            VictoriaMetricsConfig(**config)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid configuration for {export_type.value}: {str(e)}",
        ) from e


# =============================================================================
# Home Assistant Statistics WebSocket Endpoints
# =============================================================================


@router.get("/configs/{config_id}/ha-statistics")
async def list_ha_statistics(
    config_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List Home Assistant statistics matching the configured prefix

    Uses WebSocket API to query recorder/list_statistic_ids

    Args:
        config_id: Export configuration ID (must be HOME_ASSISTANT type)

    Returns:
        List of statistic_ids found in Home Assistant
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    if config.export_type != ExportType.HOME_ASSISTANT:
        raise HTTPException(status_code=400, detail="This endpoint is only for Home Assistant exports")

    from ..services.exporters.home_assistant import HomeAssistantExporter

    try:
        exporter = HomeAssistantExporter(config.config)
        prefix = config.config.get("statistic_id_prefix", "myelectricaldata")
        result = await exporter.list_statistics(prefix)

        return {
            "success": True,
            "data": result,
        }

    except Exception as e:
        logger.error(f"[EXPORT] Failed to list HA statistics: {e}")
        return {
            "success": False,
            "data": {
                "success": False,
                "message": f"Erreur: {str(e)}",
                "statistic_ids": [],
            },
        }


@router.post("/configs/{config_id}/ha-statistics/clear")
async def clear_ha_statistics(
    config_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Clear all Home Assistant statistics matching the configured prefix

    Uses WebSocket API to:
    1. List all statistics with the prefix
    2. Delete them via recorder/clear_statistics

    Args:
        config_id: Export configuration ID (must be HOME_ASSISTANT type)

    Returns:
        Number of statistics cleared
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    if config.export_type != ExportType.HOME_ASSISTANT:
        raise HTTPException(status_code=400, detail="This endpoint is only for Home Assistant exports")

    from ..services.exporters.home_assistant import HomeAssistantExporter

    try:
        exporter = HomeAssistantExporter(config.config)
        result = await exporter.clear_statistics()

        return {
            "success": True,
            "data": result,
        }

    except Exception as e:
        logger.error(f"[EXPORT] Failed to clear HA statistics: {e}")
        return {
            "success": False,
            "data": {
                "success": False,
                "message": f"Erreur: {str(e)}",
            },
        }


@router.post("/configs/{config_id}/ha-statistics/import")
async def import_ha_statistics(
    config_id: str,
    clear_first: bool = True,
    incremental: bool = False,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Import consumption/production statistics to Home Assistant Energy Dashboard

    Uses WebSocket API to inject statistics via recorder/import_statistics.
    This is the ONLY way to populate the Energy Dashboard with external data.

    Args:
        config_id: Export configuration ID (must be HOME_ASSISTANT type)
        clear_first: Clear existing statistics before import (default: True)
        incremental: If True, only import new data since last import (faster, default: False)

    Returns:
        Import results with counts
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Export configuration not found")

    if config.export_type != ExportType.HOME_ASSISTANT:
        raise HTTPException(status_code=400, detail="This endpoint is only for Home Assistant exports")

    # Get PDLs to export
    from ..models.pdl import PDL

    if config.usage_point_ids:
        pdl_stmt = select(PDL).where(PDL.usage_point_id.in_(config.usage_point_ids))
    else:
        pdl_stmt = select(PDL).where(PDL.is_active == True)  # noqa: E712

    pdl_result = await db.execute(pdl_stmt)
    pdls = pdl_result.scalars().all()

    if not pdls:
        return {
            "success": True,
            "data": {
                "success": True,
                "message": "Aucun PDL à exporter",
                "consumption": 0,
                "production": 0,
            },
        }

    usage_point_ids = [pdl.usage_point_id for pdl in pdls]

    from ..services.exporters.home_assistant import HomeAssistantExporter

    try:
        exporter = HomeAssistantExporter(config.config)
        result = await exporter.import_statistics(db, usage_point_ids, clear_first, incremental=incremental)

        return {
            "success": True,
            "data": result,
        }

    except Exception as e:
        logger.error(f"[EXPORT] Failed to import HA statistics: {e}")
        return {
            "success": False,
            "data": {
                "success": False,
                "message": f"Erreur: {str(e)}",
                "consumption": 0,
                "production": 0,
            },
        }


@router.get("/configs/{config_id}/ha-statistics/import/stream")
async def import_ha_statistics_stream(
    config_id: str,
    clear_first: bool = True,
    sync_delay_ms: int = 10000,
    chunk_size: int = 500,
    incremental: bool = False,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Import HA statistics with Server-Sent Events for progress tracking

    Streams progress events as SSE (Server-Sent Events).
    Event types:
    - progress: {step, total_steps, message, percent, consumption, cost, production}
    - complete: Final result with totals
    - error: Error message

    Args:
        config_id: Export configuration ID (must be HOME_ASSISTANT type)
        clear_first: Clear existing statistics before import (default: True)
        sync_delay_ms: Delay in ms between imports to let HA ingest data (default: 10s)
        chunk_size: Number of statistics records per WebSocket message (default: 500)
        incremental: If True, only import new data since last import (faster, default: False)
    """
    stmt = select(ExportConfig).where(ExportConfig.id == config_id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        async def error_stream() -> AsyncGenerator[str, None]:
            yield f"event: error\ndata: {json.dumps({'message': 'Export configuration not found'})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    if config.export_type != ExportType.HOME_ASSISTANT:
        async def error_stream() -> AsyncGenerator[str, None]:
            yield f"event: error\ndata: {json.dumps({'message': 'This endpoint is only for Home Assistant exports'})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    # Get PDLs to export
    from ..models.pdl import PDL

    if config.usage_point_ids:
        pdl_stmt = select(PDL).where(PDL.usage_point_id.in_(config.usage_point_ids))
    else:
        pdl_stmt = select(PDL).where(PDL.is_active == True)  # noqa: E712

    pdl_result = await db.execute(pdl_stmt)
    pdls = pdl_result.scalars().all()

    if not pdls:
        async def empty_stream() -> AsyncGenerator[str, None]:
            yield f"event: complete\ndata: {json.dumps({'success': True, 'message': 'Aucun PDL à exporter', 'consumption': 0, 'cost': 0, 'production': 0})}\n\n"
        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    usage_point_ids = [pdl.usage_point_id for pdl in pdls]
    config_data = config.config

    async def generate_events() -> AsyncGenerator[str, None]:
        """Generate SSE events for import progress"""
        from ..services.exporters.home_assistant import HomeAssistantExporter

        # Queue pour recevoir les événements de progression
        progress_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        async def progress_callback(event: dict[str, Any]) -> None:
            """Callback appelé par l'exporter pour signaler la progression"""
            await progress_queue.put(event)

        try:
            exporter = HomeAssistantExporter(config_data)

            # Lancer l'import en tâche de fond
            import_task = asyncio.create_task(
                exporter.import_statistics_with_progress(
                    db, usage_point_ids, clear_first, progress_callback, sync_delay_ms, chunk_size, incremental
                )
            )

            # Envoyer les événements de progression au fur et à mesure
            while not import_task.done():
                try:
                    # Attendre un événement avec timeout
                    event = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    event_type = event.pop("event_type", "progress")
                    yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Pas d'événement, vérifier si la tâche est terminée
                    continue

            # Vider la queue des événements restants
            while not progress_queue.empty():
                event = await progress_queue.get()
                event_type = event.pop("event_type", "progress")
                yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"

            # Récupérer le résultat final
            result = await import_task
            yield f"event: complete\ndata: {json.dumps(result)}\n\n"

        except Exception as e:
            logger.error(f"[EXPORT] SSE import failed: {e}")
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Désactiver le buffering nginx
        },
    )
