---
sidebar_position: 6
title: Architecture
---

# Architecture technique

Le client local est conçu avec une architecture modulaire permettant d'ajouter facilement de nouveaux exporteurs et de maintenir le code de manière indépendante.

## Structure du projet

```
myelectricaldata-local-client/
├── src/
│   ├── __init__.py
│   ├── main.py                    # Point d'entrée de l'application
│   ├── config.py                  # Chargement et validation de la config
│   │
│   ├── database/                  # Couche persistance
│   │   ├── __init__.py
│   │   ├── models.py              # Modèles SQLAlchemy
│   │   ├── repository.py          # Opérations CRUD
│   │   └── migrations/            # Alembic migrations
│   │
│   ├── gateway/                   # Client API passerelle
│   │   ├── __init__.py
│   │   ├── client.py              # Client HTTP async
│   │   └── schemas.py             # Schémas de réponse API
│   │
│   ├── exporters/                 # Modules exporteurs (plugin system)
│   │   ├── __init__.py
│   │   ├── base.py                # Classe abstraite BaseExporter
│   │   ├── manager.py             # Gestionnaire et registre
│   │   ├── home_assistant.py      # Exporteur Home Assistant
│   │   ├── mqtt.py                # Exporteur MQTT générique
│   │   ├── victoriametrics.py     # Exporteur VictoriaMetrics
│   │   ├── prometheus.py          # Exporteur Prometheus
│   │   └── jeedom.py              # Exporteur Jeedom
│   │
│   ├── web/                       # Interface web (FastAPI + React)
│   │   ├── __init__.py
│   │   ├── app.py                 # Application FastAPI
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── api.py             # Endpoints API REST
│   │   │   ├── exporters.py       # Endpoints configuration exporteurs
│   │   │   └── pages.py           # Endpoints pages web
│   │   └── static/                # Frontend React compilé
│   │
│   └── services/                  # Services métier
│       ├── __init__.py
│       ├── sync.py                # Synchronisation avec la passerelle
│       ├── scheduler.py           # Planification des tâches
│       └── notifications.py       # Notifications (erreurs, etc.)
│
├── tests/                         # Tests unitaires et intégration
│   ├── __init__.py
│   ├── test_exporters/
│   ├── test_gateway/
│   └── test_services/
│
├── config.example.yaml            # Configuration exemple
├── pyproject.toml                 # Dépendances (uv/pip)
├── Dockerfile
└── docker-compose.yml
```

## Système de plugins (Exporteurs)

### Principe

Chaque exporteur est un module Python indépendant qui :
1. Hérite de la classe abstraite `BaseExporter`
2. Implémente les méthodes requises
3. S'enregistre automatiquement dans le registre

### Classe de base : `BaseExporter`

```python
# src/exporters/base.py
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from pydantic import BaseModel
import logging

class ExporterConfig(BaseModel):
    """Configuration de base partagée par tous les exporteurs."""
    enabled: bool = False

    class Config:
        extra = "allow"  # Permet les champs supplémentaires


class ExporterStatus:
    """Status d'un exporteur."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class BaseExporter(ABC):
    """
    Classe abstraite définissant l'interface de tous les exporteurs.

    Chaque exporteur doit implémenter toutes les méthodes abstraites
    et peut optionnellement surcharger les méthodes de hook.
    """

    # Métadonnées de l'exporteur (à surcharger)
    name: str = "base"
    description: str = "Base exporter"
    version: str = "1.0.0"
    author: str = "MyElectricalData"

    def __init__(self, config: Dict[str, Any]):
        """
        Initialise l'exporteur avec sa configuration.

        Args:
            config: Dictionnaire de configuration
        """
        self.logger = logging.getLogger(f"exporter.{self.name}")
        self._config = self._validate_config(config)
        self._status = ExporterStatus.DISCONNECTED
        self._last_error: Optional[str] = None

    @abstractmethod
    def _validate_config(self, config: Dict[str, Any]) -> ExporterConfig:
        """
        Valide et parse la configuration.

        Args:
            config: Configuration brute

        Returns:
            Configuration validée (instance de ExporterConfig ou sous-classe)
        """
        pass

    @abstractmethod
    async def connect(self) -> bool:
        """
        Établit la connexion avec le système cible.

        Returns:
            True si la connexion a réussi

        Raises:
            ConnectionError: Si la connexion échoue
        """
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Ferme proprement la connexion."""
        pass

    @abstractmethod
    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Exporte les données de consommation.

        Args:
            pdl: Identifiant du point de livraison
            data: Données de consommation
            metadata: Métadonnées optionnelles (date, tarif, etc.)

        Returns:
            True si l'export a réussi
        """
        pass

    @abstractmethod
    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Exporte les données de production.

        Args:
            pdl: Identifiant du point de livraison
            data: Données de production
            metadata: Métadonnées optionnelles

        Returns:
            True si l'export a réussi
        """
        pass

    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """
        Teste la connexion et retourne le résultat détaillé.

        Returns:
            {
                "success": bool,
                "latency_ms": float,
                "message": str,
                "details": dict
            }
        """
        pass

    @abstractmethod
    def get_config_schema(self) -> Dict[str, Any]:
        """
        Retourne le schéma JSON de configuration pour l'UI.

        Returns:
            JSON Schema décrivant les options de configuration
        """
        pass

    # ─────────────────────────────────────────────────────────────
    # Méthodes optionnelles (hooks)
    # ─────────────────────────────────────────────────────────────

    async def on_sync_start(self, pdl: str) -> None:
        """Hook appelé avant le début d'une synchronisation."""
        pass

    async def on_sync_complete(self, pdl: str, success: bool) -> None:
        """Hook appelé après une synchronisation."""
        pass

    async def on_config_change(self, new_config: Dict[str, Any]) -> None:
        """Hook appelé lors d'un changement de configuration."""
        self._config = self._validate_config(new_config)

    # ─────────────────────────────────────────────────────────────
    # Propriétés
    # ─────────────────────────────────────────────────────────────

    @property
    def config(self) -> ExporterConfig:
        """Configuration actuelle."""
        return self._config

    @property
    def is_enabled(self) -> bool:
        """L'exporteur est-il activé ?"""
        return self._config.enabled

    @property
    def status(self) -> str:
        """Statut actuel de la connexion."""
        return self._status

    @property
    def is_connected(self) -> bool:
        """L'exporteur est-il connecté ?"""
        return self._status == ExporterStatus.CONNECTED

    @property
    def last_error(self) -> Optional[str]:
        """Dernière erreur rencontrée."""
        return self._last_error

    def get_info(self) -> Dict[str, Any]:
        """Retourne les informations de l'exporteur."""
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "enabled": self.is_enabled,
            "status": self.status,
            "last_error": self.last_error,
        }
```

### Exemple complet : Exporteur MQTT

```python
# src/exporters/mqtt.py
from typing import Any, Dict, Optional
import json
import asyncio
from pydantic import Field
import aiomqtt

from .base import BaseExporter, ExporterConfig, ExporterStatus


class MQTTConfig(ExporterConfig):
    """Configuration de l'exporteur MQTT."""

    # Connexion
    host: str = Field(default="localhost", description="Hôte du broker MQTT")
    port: int = Field(default=1883, ge=1, le=65535, description="Port du broker")
    username: str = Field(default="", description="Nom d'utilisateur")
    password: str = Field(default="", description="Mot de passe")

    # TLS
    tls: bool = Field(default=False, description="Activer TLS/SSL")
    ca_cert: str = Field(default="", description="Chemin du certificat CA")

    # Topics
    topic_prefix: str = Field(
        default="myelectricaldata",
        description="Préfixe des topics"
    )

    # Options
    qos: int = Field(default=1, ge=0, le=2, description="Qualité de service")
    retain: bool = Field(default=True, description="Retenir les messages")
    format: str = Field(
        default="json",
        pattern="^(json|simple)$",
        description="Format des messages"
    )


class MQTTExporter(BaseExporter):
    """
    Exporteur MQTT générique.

    Publie les données de consommation et production sur un broker MQTT
    avec des topics configurables.
    """

    name = "mqtt"
    description = "Publication vers broker MQTT"
    version = "1.0.0"

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._client: Optional[aiomqtt.Client] = None

    def _validate_config(self, config: Dict[str, Any]) -> MQTTConfig:
        return MQTTConfig(**config)

    async def connect(self) -> bool:
        """Connecte au broker MQTT."""
        try:
            self._status = ExporterStatus.CONNECTING
            self.logger.info(f"Connexion à {self._config.host}:{self._config.port}")

            self._client = aiomqtt.Client(
                hostname=self._config.host,
                port=self._config.port,
                username=self._config.username or None,
                password=self._config.password or None,
            )

            await self._client.__aenter__()
            self._status = ExporterStatus.CONNECTED
            self.logger.info("Connecté au broker MQTT")
            return True

        except Exception as e:
            self._status = ExporterStatus.ERROR
            self._last_error = str(e)
            self.logger.error(f"Erreur de connexion: {e}")
            raise ConnectionError(f"Impossible de se connecter à MQTT: {e}")

    async def disconnect(self) -> None:
        """Déconnecte du broker MQTT."""
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception as e:
                self.logger.warning(f"Erreur lors de la déconnexion: {e}")
            finally:
                self._client = None
                self._status = ExporterStatus.DISCONNECTED

    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Publie les données de consommation."""
        if not self.is_connected:
            raise RuntimeError("Non connecté au broker MQTT")

        topics_data = self._build_consumption_topics(pdl, data, metadata)

        for topic, payload in topics_data.items():
            await self._publish(topic, payload)

        return True

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Publie les données de production."""
        if not self.is_connected:
            raise RuntimeError("Non connecté au broker MQTT")

        topic = f"{self._config.topic_prefix}/{pdl}/production/daily"
        payload = self._format_payload(data, metadata)
        await self._publish(topic, payload)

        return True

    async def test_connection(self) -> Dict[str, Any]:
        """Teste la connexion au broker MQTT."""
        import time
        start = time.time()

        try:
            # Tente une connexion temporaire
            async with aiomqtt.Client(
                hostname=self._config.host,
                port=self._config.port,
                username=self._config.username or None,
                password=self._config.password or None,
            ):
                latency = (time.time() - start) * 1000
                return {
                    "success": True,
                    "latency_ms": round(latency, 2),
                    "message": f"Connecté à {self._config.host}:{self._config.port}",
                    "details": {
                        "broker": self._config.host,
                        "port": self._config.port,
                    }
                }
        except Exception as e:
            return {
                "success": False,
                "latency_ms": 0,
                "message": f"Échec de connexion: {str(e)}",
                "details": {"error": str(e)}
            }

    def get_config_schema(self) -> Dict[str, Any]:
        """Retourne le schéma JSON pour l'interface de configuration."""
        return {
            "type": "object",
            "properties": {
                "enabled": {
                    "type": "boolean",
                    "title": "Activer",
                    "default": False
                },
                "host": {
                    "type": "string",
                    "title": "Hôte",
                    "default": "localhost"
                },
                "port": {
                    "type": "integer",
                    "title": "Port",
                    "default": 1883,
                    "minimum": 1,
                    "maximum": 65535
                },
                "username": {
                    "type": "string",
                    "title": "Utilisateur"
                },
                "password": {
                    "type": "string",
                    "title": "Mot de passe",
                    "format": "password"
                },
                "tls": {
                    "type": "boolean",
                    "title": "TLS/SSL",
                    "default": False
                },
                "topic_prefix": {
                    "type": "string",
                    "title": "Préfixe des topics",
                    "default": "myelectricaldata"
                },
                "qos": {
                    "type": "integer",
                    "title": "QoS",
                    "enum": [0, 1, 2],
                    "default": 1
                },
                "retain": {
                    "type": "boolean",
                    "title": "Retain",
                    "default": True
                },
                "format": {
                    "type": "string",
                    "title": "Format",
                    "enum": ["json", "simple"],
                    "default": "json"
                }
            },
            "required": ["host", "port"]
        }

    # ─────────────────────────────────────────────────────────────
    # Méthodes privées
    # ─────────────────────────────────────────────────────────────

    def _build_consumption_topics(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]]
    ) -> Dict[str, str]:
        """Construit les topics et payloads pour la consommation."""
        prefix = f"{self._config.topic_prefix}/{pdl}/consumption"

        topics = {}

        # Topic principal
        topics[f"{prefix}/daily"] = self._format_payload(
            {"value": data.get("daily", 0), **data},
            metadata
        )

        # Topics HC/HP si disponibles
        if "hc" in data:
            topics[f"{prefix}/hc"] = self._format_payload(
                {"value": data["hc"]},
                metadata
            )
        if "hp" in data:
            topics[f"{prefix}/hp"] = self._format_payload(
                {"value": data["hp"]},
                metadata
            )

        return topics

    def _format_payload(
        self,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]]
    ) -> str:
        """Formate le payload selon le format configuré."""
        if self._config.format == "simple":
            return str(data.get("value", 0))

        # Format JSON
        payload = {**data}
        if metadata:
            payload.update(metadata)
        return json.dumps(payload)

    async def _publish(self, topic: str, payload: str) -> None:
        """Publie un message sur un topic."""
        await self._client.publish(
            topic,
            payload=payload,
            qos=self._config.qos,
            retain=self._config.retain
        )
        self.logger.debug(f"Publié sur {topic}: {payload[:100]}...")
```

### Gestionnaire d'exporteurs (découverte automatique)

Le gestionnaire utilise la découverte automatique pour charger dynamiquement tous les exporteurs présents dans le dossier `exporters/` :

```python
# src/exporters/manager.py
from typing import Dict, List, Type, Any, Optional
from pathlib import Path
import importlib
import importlib.util
import inspect
import asyncio
import logging

from .base import BaseExporter

logger = logging.getLogger(__name__)


class ExporterManager:
    """
    Gestionnaire centralisé des exporteurs avec découverte automatique.

    Fonctionnement:
    1. Scanne le dossier exporters/ au démarrage
    2. Charge dynamiquement tous les fichiers .py (sauf base.py, manager.py, __init__.py)
    3. Détecte les classes héritant de BaseExporter
    4. Enregistre et instancie automatiquement les exporteurs

    Avantages:
    - Aucune modification du manager pour ajouter un exporteur
    - Hot reload possible via la méthode reload()
    - Architecture plug-and-play
    """

    # Fichiers à ignorer lors du scan
    IGNORED_FILES = {"__init__.py", "base.py", "manager.py"}

    def __init__(self, config: Dict[str, Any]):
        """
        Initialise le gestionnaire.

        Args:
            config: Configuration globale contenant les configs de chaque exporteur
        """
        self._config = config
        self._exporters: Dict[str, BaseExporter] = {}
        self._registry: Dict[str, Type[BaseExporter]] = {}
        self._discover_exporters()
        self._instantiate_exporters()

    def _discover_exporters(self) -> None:
        """
        Découvre automatiquement les exporteurs dans le dossier exporters/.

        Pour chaque fichier .py:
        1. Charge le module dynamiquement avec importlib
        2. Inspecte les classes du module
        3. Enregistre celles qui héritent de BaseExporter
        """
        exporters_dir = Path(__file__).parent
        logger.info(f"Scan du dossier: {exporters_dir}")

        for file_path in sorted(exporters_dir.glob("*.py")):
            # Ignorer les fichiers système
            if file_path.name in self.IGNORED_FILES:
                continue

            self._load_module(file_path)

        logger.info(f"{len(self._registry)} exporteur(s) découvert(s): "
                   f"{', '.join(self._registry.keys())}")

    def _load_module(self, file_path: Path) -> None:
        """Charge un module et enregistre ses exporteurs."""
        try:
            module_name = file_path.stem
            spec = importlib.util.spec_from_file_location(
                f"exporters.{module_name}",
                file_path
            )
            if spec is None or spec.loader is None:
                return

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Rechercher les classes BaseExporter
            for attr_name, obj in inspect.getmembers(module, inspect.isclass):
                if self._is_valid_exporter(obj):
                    exporter_name = getattr(obj, 'name', module_name)
                    self._registry[exporter_name] = obj
                    logger.debug(f"  → {exporter_name} ({file_path.name})")

        except Exception as e:
            logger.error(f"Erreur chargement {file_path.name}: {e}")

    def _is_valid_exporter(self, cls: type) -> bool:
        """Vérifie si une classe est un exporteur valide."""
        return (
            inspect.isclass(cls)
            and issubclass(cls, BaseExporter)
            and cls is not BaseExporter
            and hasattr(cls, 'name')
            and not inspect.isabstract(cls)
        )

    def _instantiate_exporters(self) -> None:
        """Instancie tous les exporteurs découverts."""
        for name, exporter_class in self._registry.items():
            try:
                exporter_config = self._config.get(name, {})
                exporter = exporter_class(exporter_config)
                self._exporters[name] = exporter
            except Exception as e:
                logger.error(f"Erreur instanciation '{name}': {e}")

    # ─────────────────────────────────────────────────────────────
    # Hot Reload
    # ─────────────────────────────────────────────────────────────

    async def reload(self) -> Dict[str, str]:
        """
        Recharge tous les exporteurs (hot reload).

        Utile pour:
        - Ajouter un nouvel exporteur sans redémarrer
        - Recharger après modification d'un exporteur

        Returns:
            {"added": [...], "removed": [...], "reloaded": [...]}
        """
        old_names = set(self._registry.keys())

        # Arrêter les exporteurs connectés
        await self.stop()

        # Nettoyer et redécouvrir
        self._registry.clear()
        self._exporters.clear()
        self._discover_exporters()
        self._instantiate_exporters()

        new_names = set(self._registry.keys())

        return {
            "added": list(new_names - old_names),
            "removed": list(old_names - new_names),
            "reloaded": list(old_names & new_names)
        }

    # ─────────────────────────────────────────────────────────────
    # Gestion du cycle de vie
    # ─────────────────────────────────────────────────────────────

    async def start(self) -> Dict[str, bool]:
        """Démarre tous les exporteurs activés."""
        results = {}

        for name, exporter in self._exporters.items():
            if exporter.is_enabled:
                try:
                    await exporter.connect()
                    results[name] = True
                    logger.info(f"Exporteur '{name}' démarré")
                except Exception as e:
                    results[name] = False
                    logger.error(f"Échec démarrage '{name}': {e}")

        return results

    async def stop(self) -> None:
        """Arrête tous les exporteurs connectés."""
        for name, exporter in self._exporters.items():
            if exporter.is_connected:
                try:
                    await exporter.disconnect()
                    logger.info(f"Exporteur '{name}' arrêté")
                except Exception as e:
                    logger.warning(f"Erreur arrêt '{name}': {e}")

    # ─────────────────────────────────────────────────────────────
    # Export des données
    # ─────────────────────────────────────────────────────────────

    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Exporte les données de consommation vers tous les exporteurs actifs."""
        return await self._export_to_all(
            lambda exp: exp.export_consumption(pdl, data, metadata)
        )

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Exporte les données de production vers tous les exporteurs actifs."""
        return await self._export_to_all(
            lambda exp: exp.export_production(pdl, data, metadata)
        )

    async def _export_to_all(self, export_fn) -> Dict[str, Dict[str, Any]]:
        """Helper pour exporter vers tous les exporteurs actifs."""
        results = {}

        for name, exporter in self._exporters.items():
            if exporter.is_enabled and exporter.is_connected:
                try:
                    await export_fn(exporter)
                    results[name] = {"success": True}
                except Exception as e:
                    results[name] = {"success": False, "error": str(e)}
                    logger.error(f"Export '{name}' échoué: {e}")

        return results

    # ─────────────────────────────────────────────────────────────
    # Accesseurs
    # ─────────────────────────────────────────────────────────────

    @property
    def registry(self) -> Dict[str, Type[BaseExporter]]:
        """Retourne le registre des exporteurs découverts."""
        return self._registry.copy()

    def get(self, name: str) -> Optional[BaseExporter]:
        """Récupère un exporteur par son nom."""
        return self._exporters.get(name)

    def list(self) -> List[Dict[str, Any]]:
        """Liste tous les exporteurs avec leur statut."""
        return [exp.get_info() for exp in self._exporters.values()]

    def get_config_schemas(self) -> Dict[str, Dict[str, Any]]:
        """Retourne les schémas de configuration de tous les exporteurs."""
        return {
            name: exp.get_config_schema()
            for name, exp in self._exporters.items()
        }

    async def test_exporter(self, name: str) -> Dict[str, Any]:
        """Teste la connexion d'un exporteur spécifique."""
        exporter = self._exporters.get(name)
        if not exporter:
            return {"success": False, "error": f"Exporteur '{name}' non trouvé"}
        return await exporter.test_connection()

    async def update_config(self, name: str, new_config: Dict[str, Any]) -> bool:
        """Met à jour la configuration d'un exporteur."""
        exporter = self._exporters.get(name)
        if not exporter:
            raise ValueError(f"Exporteur '{name}' non trouvé")

        was_connected = exporter.is_connected
        if was_connected:
            await exporter.disconnect()

        await exporter.on_config_change(new_config)

        if exporter.is_enabled and was_connected:
            await exporter.connect()

        return True
```

## API REST pour les exporteurs

```python
# src/web/routers/exporters.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List

from ...exporters.manager import ExporterManager

router = APIRouter(prefix="/api/exporters", tags=["exporters"])


def get_manager() -> ExporterManager:
    """Dépendance pour obtenir le manager (à implémenter avec DI)."""
    from ...main import app
    return app.state.exporter_manager


@router.get("")
async def list_exporters(
    manager: ExporterManager = Depends(get_manager)
) -> List[Dict[str, Any]]:
    """Liste tous les exporteurs avec leur statut."""
    return manager.list()


@router.get("/{name}")
async def get_exporter(
    name: str,
    manager: ExporterManager = Depends(get_manager)
) -> Dict[str, Any]:
    """Récupère les informations d'un exporteur."""
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(404, f"Exporteur '{name}' non trouvé")
    return exporter.get_info()


@router.get("/{name}/schema")
async def get_config_schema(
    name: str,
    manager: ExporterManager = Depends(get_manager)
) -> Dict[str, Any]:
    """Récupère le schéma de configuration d'un exporteur."""
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(404, f"Exporteur '{name}' non trouvé")
    return exporter.get_config_schema()


@router.post("/{name}/test")
async def test_connection(
    name: str,
    manager: ExporterManager = Depends(get_manager)
) -> Dict[str, Any]:
    """Teste la connexion d'un exporteur."""
    return await manager.test_exporter(name)


@router.put("/{name}/config")
async def update_config(
    name: str,
    config: Dict[str, Any],
    manager: ExporterManager = Depends(get_manager)
) -> Dict[str, Any]:
    """Met à jour la configuration d'un exporteur."""
    try:
        await manager.update_config(name, config)
        return {"success": True, "message": "Configuration mise à jour"}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/{name}/start")
async def start_exporter(
    name: str,
    manager: ExporterManager = Depends(get_manager)
) -> Dict[str, Any]:
    """Démarre un exporteur."""
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(404, f"Exporteur '{name}' non trouvé")

    try:
        await exporter.connect()
        return {"success": True, "status": exporter.status}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/{name}/stop")
async def stop_exporter(
    name: str,
    manager: ExporterManager = Depends(get_manager)
) -> Dict[str, Any]:
    """Arrête un exporteur."""
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(404, f"Exporteur '{name}' non trouvé")

    await exporter.disconnect()
    return {"success": True, "status": exporter.status}


@router.post("/reload")
async def reload_exporters(
    manager: ExporterManager = Depends(get_manager)
) -> Dict[str, Any]:
    """
    Recharge tous les exporteurs (hot reload).

    Utile pour détecter de nouveaux exporteurs ajoutés
    sans redémarrer l'application.
    """
    result = await manager.reload()
    return {
        "success": True,
        "added": result["added"],
        "removed": result["removed"],
        "reloaded": result["reloaded"],
        "total": len(manager.list())
    }
```

## Ajouter un nouvel exporteur

Grâce à la découverte automatique, il suffit de :

1. **Créer un fichier** `mon_exporteur.py` dans `src/exporters/`
2. **Implémenter la classe** héritant de `BaseExporter` avec l'attribut `name`
3. **C'est tout !** L'exporteur sera détecté automatiquement au démarrage

### Convention de nommage

| Fichier | Attribut `name` | Clé config |
|---------|-----------------|------------|
| `home_assistant.py` | `home_assistant` | `home_assistant:` |
| `mqtt.py` | `mqtt` | `mqtt:` |
| `influxdb.py` | `influxdb` | `influxdb:` |
| `mon_super_exporteur.py` | `mon_super_exporteur` | `mon_super_exporteur:` |

### Critères de détection

Pour qu'une classe soit détectée comme exporteur valide :

```python
def _is_valid_exporter(self, cls: type) -> bool:
    return (
        inspect.isclass(cls)                    # Est une classe
        and issubclass(cls, BaseExporter)       # Hérite de BaseExporter
        and cls is not BaseExporter             # N'est pas la classe de base
        and hasattr(cls, 'name')                # A un attribut 'name'
        and not inspect.isabstract(cls)         # N'est pas abstraite
    )
```

### Hot Reload

Vous pouvez recharger les exporteurs à chaud (sans redémarrer l'application) :

```bash
# Via API
curl -X POST http://localhost:8080/api/exporters/reload

# Réponse
{
  "added": ["influxdb"],
  "removed": [],
  "reloaded": ["mqtt", "home_assistant", "prometheus"]
}
```

Cela permet d'ajouter un nouvel exporteur en déposant simplement le fichier `.py` dans le dossier.

### Exemple minimal

```python
# src/exporters/webhook.py
from .base import BaseExporter, ExporterConfig
from typing import Dict, Any, Optional
import httpx

class WebhookConfig(ExporterConfig):
    url: str = ""
    headers: Dict[str, str] = {}

class WebhookExporter(BaseExporter):
    """Exporteur Webhook - Envoie les données à une URL."""

    name = "webhook"  # ← Obligatoire pour la détection
    description = "Export vers webhook HTTP"

    def _validate_config(self, config: Dict[str, Any]) -> WebhookConfig:
        return WebhookConfig(**config)

    async def connect(self) -> bool:
        self._status = "connected"
        return True

    async def disconnect(self) -> None:
        self._status = "disconnected"

    async def export_consumption(self, pdl: str, data: dict, metadata: Optional[dict] = None) -> bool:
        async with httpx.AsyncClient() as client:
            await client.post(
                self._config.url,
                json={"pdl": pdl, "consumption": data, "metadata": metadata},
                headers=self._config.headers
            )
        return True

    async def export_production(self, pdl: str, data: dict, metadata: Optional[dict] = None) -> bool:
        async with httpx.AsyncClient() as client:
            await client.post(
                self._config.url,
                json={"pdl": pdl, "production": data, "metadata": metadata},
                headers=self._config.headers
            )
        return True

    async def test_connection(self) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.head(self._config.url, timeout=5)
                return {"success": r.status_code < 400, "message": f"HTTP {r.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "default": False},
                "url": {"type": "string", "format": "uri"},
                "headers": {"type": "object", "additionalProperties": {"type": "string"}}
            }
        }
```

Voir l'exemple complet InfluxDB dans la page d'[Introduction](./index.md#créer-un-nouvel-exporteur).
