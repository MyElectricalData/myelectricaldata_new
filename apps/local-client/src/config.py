"""Configuration management for the local client.

Supports both YAML configuration files and environment variables.
Environment variables take precedence over YAML configuration.
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


class GatewayConfig(BaseModel):
    """Gateway API configuration."""

    url: str = Field(default="https://api.myelectricaldata.fr", description="Gateway URL")
    client_id: str = Field(default="", description="API Client ID")
    client_secret: str = Field(default="", description="API Client Secret")


class DatabaseConfig(BaseModel):
    """Database configuration."""

    url: str = Field(default="sqlite+aiosqlite:////data/myelectricaldata.db", description="Database URL")


class SyncConfig(BaseModel):
    """Synchronization configuration."""

    interval: int = Field(default=3600, ge=300, description="Sync interval in seconds")
    days_back: int = Field(default=7, ge=1, le=365, description="Days to fetch back")
    full_sync_time: str = Field(default="04:00", description="Time for full sync (HH:MM)")
    retry_count: int = Field(default=3, ge=1, description="Retry count on failure")
    retry_delay: int = Field(default=300, ge=60, description="Retry delay in seconds")


class DataConfig(BaseModel):
    """Data fetching configuration."""

    class ConsumptionConfig(BaseModel):
        enabled: bool = True
        daily: bool = True
        detailed: bool = True
        max_power: bool = True

    class ProductionConfig(BaseModel):
        enabled: bool = True
        daily: bool = True
        detailed: bool = True

    consumption: ConsumptionConfig = Field(default_factory=ConsumptionConfig)
    production: ProductionConfig = Field(default_factory=ProductionConfig)


class HomeAssistantConfig(BaseModel):
    """Home Assistant integration configuration."""

    enabled: bool = Field(default=True, description="Enable Home Assistant integration")
    discovery: bool = Field(default=True, description="Enable MQTT Discovery")
    discovery_prefix: str = Field(default="homeassistant", description="Discovery prefix")
    entity_prefix: str = Field(default="myelectricaldata", description="Entity prefix")
    energy_dashboard: bool = Field(default=True, description="Enable Energy Dashboard compatibility")
    statistics: bool = Field(default=True, description="Enable long-term statistics")


class MQTTConfig(BaseModel):
    """MQTT configuration."""

    enabled: bool = Field(default=False, description="Enable MQTT")
    host: str = Field(default="localhost", description="MQTT broker host")
    port: int = Field(default=1883, ge=1, le=65535, description="MQTT broker port")
    username: str = Field(default="", description="MQTT username")
    password: str = Field(default="", description="MQTT password")
    tls: bool = Field(default=False, description="Enable TLS")
    ca_cert: str = Field(default="", description="CA certificate path")
    client_cert: str = Field(default="", description="Client certificate path")
    client_key: str = Field(default="", description="Client key path")
    topic_prefix: str = Field(default="myelectricaldata", description="Topic prefix")
    qos: int = Field(default=1, ge=0, le=2, description="QoS level")
    retain: bool = Field(default=True, description="Retain messages")
    format: str = Field(default="json", pattern="^(json|simple)$", description="Message format")


class MetricsPushConfig(BaseModel):
    """Metrics push configuration."""

    enabled: bool = Field(default=False, description="Enable push mode")
    url: str = Field(default="", description="Push endpoint URL")
    interval: int = Field(default=60, ge=10, description="Push interval in seconds")
    username: str = Field(default="", description="Auth username")
    password: str = Field(default="", description="Auth password")
    headers: Dict[str, str] = Field(default_factory=dict, description="Custom headers")


class MetricsConfig(BaseModel):
    """Prometheus/VictoriaMetrics configuration."""

    enabled: bool = Field(default=False, description="Enable metrics")
    port: int = Field(default=9090, ge=1, le=65535, description="Metrics port")
    path: str = Field(default="/metrics", description="Metrics path")
    labels: Dict[str, str] = Field(default_factory=dict, description="Custom labels")
    push: MetricsPushConfig = Field(default_factory=MetricsPushConfig)


class JeedomConfig(BaseModel):
    """Jeedom integration configuration."""

    enabled: bool = Field(default=False, description="Enable Jeedom")
    url: str = Field(default="", description="Jeedom URL")
    api_key: str = Field(default="", description="Jeedom API key")
    method: str = Field(default="virtual", pattern="^(virtual|api|mqtt)$", description="Integration method")
    virtual_equipment_id: str = Field(default="", description="Virtual equipment ID")
    commands: Dict[str, str] = Field(default_factory=dict, description="Command mappings")


class APIConfig(BaseModel):
    """Local API configuration."""

    port: int = Field(default=8080, ge=1, le=65535, description="API port")

    class AuthConfig(BaseModel):
        enabled: bool = False
        token: str = ""

    class CORSConfig(BaseModel):
        enabled: bool = True
        origins: List[str] = Field(default_factory=lambda: ["http://localhost:*"])

    auth: AuthConfig = Field(default_factory=AuthConfig)
    cors: CORSConfig = Field(default_factory=CORSConfig)


class LoggingConfig(BaseModel):
    """Logging configuration."""

    level: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR)$", description="Log level")
    format: str = Field(default="text", pattern="^(text|json)$", description="Log format")
    file: str = Field(default="", description="Log file path")
    max_size: str = Field(default="10MB", description="Max log file size")
    max_files: int = Field(default=5, ge=1, description="Max log files")


class NotificationsConfig(BaseModel):
    """Notifications configuration."""

    on_error: bool = Field(default=True, description="Notify on error")
    on_success: bool = Field(default=False, description="Notify on success")

    class ChannelsConfig(BaseModel):
        class HomeAssistantChannel(BaseModel):
            enabled: bool = True
            service: str = "notify.notify"

        class MQTTChannel(BaseModel):
            enabled: bool = False
            topic: str = "myelectricaldata/notifications"

        class WebhookChannel(BaseModel):
            enabled: bool = False
            url: str = ""

        home_assistant: HomeAssistantChannel = Field(default_factory=HomeAssistantChannel)
        mqtt: MQTTChannel = Field(default_factory=MQTTChannel)
        webhook: WebhookChannel = Field(default_factory=WebhookChannel)

    channels: ChannelsConfig = Field(default_factory=ChannelsConfig)


class Settings(BaseSettings):
    """Main settings class combining all configurations."""

    gateway: GatewayConfig = Field(default_factory=GatewayConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    sync: SyncConfig = Field(default_factory=SyncConfig)
    data: DataConfig = Field(default_factory=DataConfig)
    home_assistant: HomeAssistantConfig = Field(default_factory=HomeAssistantConfig)
    mqtt: MQTTConfig = Field(default_factory=MQTTConfig)
    metrics: MetricsConfig = Field(default_factory=MetricsConfig)
    jeedom: JeedomConfig = Field(default_factory=JeedomConfig)
    api: APIConfig = Field(default_factory=APIConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    notifications: NotificationsConfig = Field(default_factory=NotificationsConfig)

    model_config = {
        "env_prefix": "",
        "env_nested_delimiter": "_",
        "case_sensitive": False,
    }


def load_yaml_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """Load configuration from YAML file.

    Args:
        config_path: Path to config file. If not provided, searches default locations.

    Returns:
        Configuration dictionary from YAML file.
    """
    search_paths = [
        config_path,
        os.environ.get("CONFIG_FILE"),
        "/config/config.yaml",
        "/config/config.yml",
        "./config.yaml",
        "./config.yml",
    ]

    for path in search_paths:
        if path and Path(path).exists():
            with open(path, "r") as f:
                return yaml.safe_load(f) or {}

    return {}


def load_env_overrides() -> Dict[str, Any]:
    """Load configuration overrides from environment variables.

    Environment variable mapping:
    - CLIENT_ID -> gateway.client_id
    - CLIENT_SECRET -> gateway.client_secret
    - GATEWAY_URL -> gateway.url
    - DATABASE_URL -> database.url
    - SYNC_INTERVAL -> sync.interval
    - MQTT_* -> mqtt.*
    - etc.
    """
    env_mapping = {
        "CLIENT_ID": ("gateway", "client_id"),
        "CLIENT_SECRET": ("gateway", "client_secret"),
        "GATEWAY_URL": ("gateway", "url"),
        "DATABASE_URL": ("database", "url"),
        "SYNC_INTERVAL": ("sync", "interval"),
        "SYNC_DAYS_BACK": ("sync", "days_back"),
        "HA_ENABLED": ("home_assistant", "enabled"),
        "HA_DISCOVERY": ("home_assistant", "discovery"),
        "MQTT_ENABLED": ("mqtt", "enabled"),
        "MQTT_HOST": ("mqtt", "host"),
        "MQTT_PORT": ("mqtt", "port"),
        "MQTT_USERNAME": ("mqtt", "username"),
        "MQTT_PASSWORD": ("mqtt", "password"),
        "MQTT_TOPIC_PREFIX": ("mqtt", "topic_prefix"),
        "MQTT_QOS": ("mqtt", "qos"),
        "MQTT_RETAIN": ("mqtt", "retain"),
        "MQTT_TLS": ("mqtt", "tls"),
        "METRICS_ENABLED": ("metrics", "enabled"),
        "METRICS_PORT": ("metrics", "port"),
        "JEEDOM_ENABLED": ("jeedom", "enabled"),
        "JEEDOM_URL": ("jeedom", "url"),
        "JEEDOM_API_KEY": ("jeedom", "api_key"),
        "JEEDOM_METHOD": ("jeedom", "method"),
        "LOG_LEVEL": ("logging", "level"),
        "API_PORT": ("api", "port"),
    }

    overrides: Dict[str, Any] = {}

    for env_var, (section, key) in env_mapping.items():
        value = os.environ.get(env_var)
        if value is not None:
            if section not in overrides:
                overrides[section] = {}
            # Convert types as needed
            if key in ("port", "interval", "days_back", "qos"):
                value = int(value)
            elif key in ("enabled", "discovery", "retain", "tls"):
                value = value.lower() in ("true", "1", "yes")
            overrides[section][key] = value

    return overrides


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Deep merge two dictionaries.

    Args:
        base: Base dictionary.
        override: Override dictionary (takes precedence).

    Returns:
        Merged dictionary.
    """
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def get_settings(config_path: Optional[str] = None) -> Settings:
    """Get application settings.

    Priority order (highest to lowest):
    1. Environment variables
    2. YAML configuration file
    3. Default values

    Args:
        config_path: Optional path to YAML config file.

    Returns:
        Settings instance with merged configuration.
    """
    # Load YAML config
    yaml_config = load_yaml_config(config_path)

    # Load environment overrides
    env_overrides = load_env_overrides()

    # Merge configurations
    merged_config = deep_merge(yaml_config, env_overrides)

    # Create settings from merged config
    return Settings(**merged_config)


# Global settings instance
_settings: Optional[Settings] = None


def get_current_settings() -> Settings:
    """Get the current settings instance.

    Returns:
        Current Settings instance.
    """
    global _settings
    if _settings is None:
        _settings = get_settings()
    return _settings


def reload_settings(config_path: Optional[str] = None) -> Settings:
    """Reload settings from configuration sources.

    Args:
        config_path: Optional path to YAML config file.

    Returns:
        New Settings instance.
    """
    global _settings
    _settings = get_settings(config_path)
    return _settings
