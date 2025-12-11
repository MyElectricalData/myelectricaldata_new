"""Exporter manager with automatic discovery and hot reload support."""

import importlib.util
import inspect
import logging
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Type

from .base import BaseExporter

logger = logging.getLogger(__name__)


class ExporterManager:
    """Manager for all exporters with automatic discovery.

    Scans the exporters/ directory and automatically loads all classes
    that inherit from BaseExporter.

    Features:
    - Automatic discovery of exporters
    - Hot reload support
    - Centralized lifecycle management
    - Parallel export to all active exporters
    """

    # Files to ignore during scanning
    IGNORED_FILES = {"__init__.py", "base.py", "manager.py"}

    def __init__(self, config: Dict[str, Any]):
        """Initialize the manager.

        Args:
            config: Global configuration with exporter-specific sections.
        """
        self._config = config
        self._exporters: Dict[str, BaseExporter] = {}
        self._registry: Dict[str, Type[BaseExporter]] = {}
        self._discover_exporters()
        self._instantiate_exporters()

    def _discover_exporters(self) -> None:
        """Discover exporters in the exporters/ directory.

        Scans all .py files and registers classes that:
        - Inherit from BaseExporter
        - Are not BaseExporter itself
        - Have a 'name' attribute
        - Are not abstract
        """
        exporters_dir = Path(__file__).parent
        logger.info(f"Scanning for exporters in: {exporters_dir}")

        for file_path in sorted(exporters_dir.glob("*.py")):
            if file_path.name in self.IGNORED_FILES:
                continue

            self._load_module(file_path)

        logger.info(f"Discovered {len(self._registry)} exporter(s): {', '.join(self._registry.keys())}")

    def _load_module(self, file_path: Path) -> None:
        """Load a module and register its exporters.

        Args:
            file_path: Path to the Python file.
        """
        try:
            module_name = file_path.stem

            # Use importlib to import the module properly with relative imports support
            import sys
            full_module_name = f"src.exporters.{module_name}"

            # Check if already imported
            if full_module_name in sys.modules:
                module = sys.modules[full_module_name]
            else:
                # Import using importlib
                module = importlib.import_module(f".{module_name}", package="src.exporters")

            # Find BaseExporter subclasses
            for attr_name, obj in inspect.getmembers(module, inspect.isclass):
                if self._is_valid_exporter(obj):
                    exporter_name = getattr(obj, "name", module_name)
                    self._registry[exporter_name] = obj
                    logger.debug(f"  -> {exporter_name} ({file_path.name})")

        except Exception as e:
            logger.error(f"Error loading {file_path.name}: {e}")

    def _is_valid_exporter(self, cls: type) -> bool:
        """Check if a class is a valid exporter.

        Args:
            cls: Class to check.

        Returns:
            True if the class is a valid exporter.
        """
        return (
            inspect.isclass(cls)
            and issubclass(cls, BaseExporter)
            and cls is not BaseExporter
            and hasattr(cls, "name")
            and not inspect.isabstract(cls)
        )

    def _instantiate_exporters(self) -> None:
        """Instantiate all discovered exporters."""
        for name, exporter_class in self._registry.items():
            try:
                exporter_config = self._config.get(name, {})
                exporter = exporter_class(exporter_config)
                self._exporters[name] = exporter
                logger.debug(f"Instantiated exporter: {name}")
            except Exception as e:
                logger.error(f"Error instantiating '{name}': {e}")

    # Hot Reload
    async def reload(self) -> Dict[str, List[str]]:
        """Reload all exporters (hot reload).

        Useful for:
        - Adding new exporters without restart
        - Reloading modified exporters

        Returns:
            Dictionary with added, removed, and reloaded exporters.
        """
        old_names = set(self._registry.keys())

        # Stop connected exporters
        await self.stop()

        # Clear and rediscover
        self._registry.clear()
        self._exporters.clear()
        self._discover_exporters()
        self._instantiate_exporters()

        new_names = set(self._registry.keys())

        return {
            "added": list(new_names - old_names),
            "removed": list(old_names - new_names),
            "reloaded": list(old_names & new_names),
        }

    # Lifecycle Management
    async def start(self) -> Dict[str, bool]:
        """Start all enabled exporters.

        Returns:
            Dictionary mapping exporter name to success status.
        """
        results = {}

        for name, exporter in self._exporters.items():
            if exporter.is_enabled:
                try:
                    await exporter.connect()
                    results[name] = True
                    logger.info(f"Exporter '{name}' started")
                except Exception as e:
                    results[name] = False
                    logger.error(f"Failed to start '{name}': {e}")

        return results

    async def stop(self) -> None:
        """Stop all connected exporters."""
        for name, exporter in self._exporters.items():
            if exporter.is_connected:
                try:
                    await exporter.disconnect()
                    logger.info(f"Exporter '{name}' stopped")
                except Exception as e:
                    logger.warning(f"Error stopping '{name}': {e}")

    # Data Export
    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Export consumption data to all active exporters.

        Args:
            pdl: PDL identifier.
            data: Consumption data.
            metadata: Optional metadata.

        Returns:
            Dictionary mapping exporter name to result.
        """
        return await self._export_to_all(lambda exp: exp.export_consumption(pdl, data, metadata))

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Export production data to all active exporters.

        Args:
            pdl: PDL identifier.
            data: Production data.
            metadata: Optional metadata.

        Returns:
            Dictionary mapping exporter name to result.
        """
        return await self._export_to_all(lambda exp: exp.export_production(pdl, data, metadata))

    async def _export_to_all(self, export_fn: Callable) -> Dict[str, Dict[str, Any]]:
        """Export to all active exporters.

        Args:
            export_fn: Async function to call on each exporter.

        Returns:
            Dictionary mapping exporter name to result.
        """
        results = {}

        for name, exporter in self._exporters.items():
            if exporter.is_enabled and exporter.is_connected:
                try:
                    await export_fn(exporter)
                    results[name] = {"success": True}
                except Exception as e:
                    results[name] = {"success": False, "error": str(e)}
                    logger.error(f"Export to '{name}' failed: {e}")

        return results

    # Sync Hooks
    async def notify_sync_start(self, pdl: str) -> None:
        """Notify all exporters that sync is starting.

        Args:
            pdl: PDL identifier.
        """
        for exporter in self._exporters.values():
            if exporter.is_enabled:
                try:
                    await exporter.on_sync_start(pdl)
                except Exception as e:
                    logger.warning(f"Error in on_sync_start for '{exporter.name}': {e}")

    async def notify_sync_complete(self, pdl: str, success: bool) -> None:
        """Notify all exporters that sync is complete.

        Args:
            pdl: PDL identifier.
            success: Whether sync was successful.
        """
        for exporter in self._exporters.values():
            if exporter.is_enabled:
                try:
                    await exporter.on_sync_complete(pdl, success)
                except Exception as e:
                    logger.warning(f"Error in on_sync_complete for '{exporter.name}': {e}")

    # Accessors
    @property
    def registry(self) -> Dict[str, Type[BaseExporter]]:
        """Get the registry of discovered exporters."""
        return self._registry.copy()

    def get(self, name: str) -> Optional[BaseExporter]:
        """Get an exporter by name.

        Args:
            name: Exporter name.

        Returns:
            Exporter instance or None.
        """
        return self._exporters.get(name)

    def list(self) -> List[Dict[str, Any]]:
        """List all exporters with their status.

        Returns:
            List of exporter info dictionaries.
        """
        return [exp.get_info() for exp in self._exporters.values()]

    def get_config_schemas(self) -> Dict[str, Dict[str, Any]]:
        """Get configuration schemas for all exporters.

        Returns:
            Dictionary mapping exporter name to JSON Schema.
        """
        return {name: exp.get_config_schema() for name, exp in self._exporters.items()}

    async def test_exporter(self, name: str) -> Dict[str, Any]:
        """Test a specific exporter's connection.

        Args:
            name: Exporter name.

        Returns:
            Test result dictionary.
        """
        exporter = self._exporters.get(name)
        if not exporter:
            return {"success": False, "error": f"Exporter '{name}' not found"}
        return await exporter.test_connection()

    async def update_config(self, name: str, new_config: Dict[str, Any]) -> bool:
        """Update an exporter's configuration.

        Args:
            name: Exporter name.
            new_config: New configuration dictionary.

        Returns:
            True if update was successful.

        Raises:
            ValueError: If exporter not found.
        """
        exporter = self._exporters.get(name)
        if not exporter:
            raise ValueError(f"Exporter '{name}' not found")

        was_connected = exporter.is_connected
        if was_connected:
            await exporter.disconnect()

        await exporter.on_config_change(new_config)

        # Reconnect if was connected and still enabled
        if exporter.is_enabled and was_connected:
            await exporter.connect()

        return True
