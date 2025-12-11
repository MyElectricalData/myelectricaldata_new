"""Base class for all exporters.

All exporters must inherit from BaseExporter and implement the abstract methods.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from pydantic import BaseModel


class ExporterConfig(BaseModel):
    """Base configuration for all exporters."""

    enabled: bool = False

    model_config = {"extra": "allow"}


class ExporterStatus:
    """Status constants for exporters."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class BaseExporter(ABC):
    """Abstract base class for all exporters.

    Each exporter must implement all abstract methods and can optionally
    override the hook methods for custom behavior.

    Attributes:
        name: Unique identifier for the exporter (required for auto-discovery).
        description: Human-readable description.
        version: Exporter version.
        author: Exporter author.
    """

    # Metadata - must be overridden by subclasses
    name: str = "base"
    description: str = "Base exporter"
    version: str = "1.0.0"
    author: str = "MyElectricalData"

    def __init__(self, config: Dict[str, Any]):
        """Initialize the exporter.

        Args:
            config: Configuration dictionary.
        """
        self.logger = logging.getLogger(f"exporter.{self.name}")
        self._config = self._validate_config(config)
        self._status = ExporterStatus.DISCONNECTED
        self._last_error: Optional[str] = None

    @abstractmethod
    def _validate_config(self, config: Dict[str, Any]) -> ExporterConfig:
        """Validate and parse the configuration.

        Args:
            config: Raw configuration dictionary.

        Returns:
            Validated configuration instance.
        """
        pass

    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection with the target system.

        Returns:
            True if connection was successful.

        Raises:
            ConnectionError: If connection fails.
        """
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Close the connection gracefully."""
        pass

    @abstractmethod
    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export consumption data.

        Args:
            pdl: PDL identifier.
            data: Consumption data dictionary.
            metadata: Optional metadata (date, tariff, etc.).

        Returns:
            True if export was successful.
        """
        pass

    @abstractmethod
    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export production data.

        Args:
            pdl: PDL identifier.
            data: Production data dictionary.
            metadata: Optional metadata.

        Returns:
            True if export was successful.
        """
        pass

    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """Test the connection and return detailed result.

        Returns:
            Dictionary with:
                - success: bool
                - latency_ms: float
                - message: str
                - details: dict
        """
        pass

    @abstractmethod
    def get_config_schema(self) -> Dict[str, Any]:
        """Return the JSON Schema for the configuration UI.

        Returns:
            JSON Schema describing configuration options.
        """
        pass

    # Optional hooks that subclasses can override
    async def on_sync_start(self, pdl: str) -> None:
        """Hook called before starting a sync."""
        pass

    async def on_sync_complete(self, pdl: str, success: bool) -> None:
        """Hook called after a sync completes."""
        pass

    async def on_config_change(self, new_config: Dict[str, Any]) -> None:
        """Hook called when configuration changes.

        Args:
            new_config: New configuration dictionary.
        """
        self._config = self._validate_config(new_config)

    # Properties
    @property
    def config(self) -> ExporterConfig:
        """Get current configuration."""
        return self._config

    @property
    def is_enabled(self) -> bool:
        """Check if exporter is enabled."""
        return self._config.enabled

    @property
    def status(self) -> str:
        """Get current connection status."""
        return self._status

    @property
    def is_connected(self) -> bool:
        """Check if exporter is connected."""
        return self._status == ExporterStatus.CONNECTED

    @property
    def last_error(self) -> Optional[str]:
        """Get last error message."""
        return self._last_error

    def get_info(self) -> Dict[str, Any]:
        """Get exporter information.

        Returns:
            Dictionary with exporter metadata and status.
        """
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "enabled": self.is_enabled,
            "status": self.status,
            "last_error": self.last_error,
        }
