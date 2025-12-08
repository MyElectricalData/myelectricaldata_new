---
sidebar_position: 1
title: Client Local
---

# Client Local MyElectricalData

Le **Client Local** est une application complète conçue pour être installée directement chez vous. Elle récupère vos données de consommation et production électrique via la passerelle MyElectricalData, propose une interface web identique à la passerelle, et expose vos données vers vos solutions domotiques préférées.

## Cas d'usage

- **Interface web locale** : Consultez vos données directement depuis votre réseau local
- **Suivi énergétique** : Visualisez votre consommation/production dans Home Assistant, Jeedom, etc.
- **Historisation locale** : Stockez vos données chez vous, en toute autonomie
- **Intégration domotique** : Automatisez en fonction de votre consommation réelle
- **Métriques avancées** : Exportez vers Prometheus/VictoriaMetrics pour des dashboards personnalisés

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Votre Réseau Local                       │
│                                                             │
│  ┌──────────────┐     ┌─────────────────────────────────┐  │
│  │   Client     │────▶│     Passerelle                  │  │
│  │   Local      │◀────│   MyElectricalData (cloud)      │  │
│  │              │     └─────────────────────────────────┘  │
│  │  SQLite/     │                                          │
│  │  PostgreSQL/ │     ┌─────────────────────────────────┐  │
│  │  MySQL       │────▶│  Home Assistant / Jeedom        │  │
│  │              │     └─────────────────────────────────┘  │
│  │              │                                          │
│  │              │     ┌─────────────────────────────────┐  │
│  │              │────▶│  MQTT Broker (Mosquitto, etc.)  │  │
│  │              │     └─────────────────────────────────┘  │
│  │              │                                          │
│  │              │     ┌─────────────────────────────────┐  │
│  │              │────▶│  VictoriaMetrics / Prometheus   │  │
│  └──────────────┘     └─────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Architecture modulaire

Le client local est conçu avec une **architecture modulaire en Python**. Chaque exporteur est un module indépendant qui peut être activé/désactivé et qui implémente une interface commune.

```
src/
├── __init__.py
├── main.py                    # Point d'entrée
├── config.py                  # Gestion de la configuration
├── database/                  # Couche base de données
│   ├── __init__.py
│   ├── models.py
│   └── repository.py
├── gateway/                   # Client API passerelle
│   ├── __init__.py
│   └── client.py
├── exporters/                 # Modules exporteurs
│   ├── __init__.py
│   ├── base.py               # Classe abstraite BaseExporter
│   ├── home_assistant.py     # Module Home Assistant
│   ├── mqtt.py               # Module MQTT
│   ├── victoriametrics.py    # Module VictoriaMetrics
│   ├── prometheus.py         # Module Prometheus
│   ├── jeedom.py             # Module Jeedom
│   └── manager.py            # Gestionnaire des exporteurs
├── web/                       # Interface web (FastAPI)
│   ├── __init__.py
│   ├── app.py
│   └── routers/
└── services/                  # Services métier
    ├── __init__.py
    └── sync.py
```

### Classe de base des exporteurs

Tous les exporteurs héritent de `BaseExporter` :

```python
# src/exporters/base.py
from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel

class ExporterConfig(BaseModel):
    """Configuration de base d'un exporteur."""
    enabled: bool = False

class BaseExporter(ABC):
    """Classe abstraite pour tous les exporteurs."""

    name: str = "base"
    description: str = "Base exporter"

    def __init__(self, config: ExporterConfig):
        self.config = config
        self._is_connected = False

    @abstractmethod
    async def connect(self) -> bool:
        """Établit la connexion avec le système cible."""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Ferme la connexion."""
        pass

    @abstractmethod
    async def export_consumption(self, pdl: str, data: dict) -> bool:
        """Exporte les données de consommation."""
        pass

    @abstractmethod
    async def export_production(self, pdl: str, data: dict) -> bool:
        """Exporte les données de production."""
        pass

    @abstractmethod
    async def test_connection(self) -> dict:
        """Teste la connexion et retourne le résultat."""
        pass

    @abstractmethod
    def get_config_schema(self) -> dict:
        """Retourne le schéma JSON de configuration."""
        pass

    @property
    def is_enabled(self) -> bool:
        return self.config.enabled

    @property
    def is_connected(self) -> bool:
        return self._is_connected
```

### Gestionnaire des exporteurs (chargement dynamique)

Le `ExporterManager` découvre et charge automatiquement tous les modules exporteurs présents dans le dossier `exporters/` :

```python
# src/exporters/manager.py
from typing import Dict, Type, Any, Optional
from pathlib import Path
import importlib
import importlib.util
import inspect
import logging

from .base import BaseExporter

logger = logging.getLogger(__name__)


class ExporterManager:
    """
    Gestionnaire des exporteurs avec découverte automatique.

    Scanne le dossier exporters/ et charge automatiquement tous les modules
    contenant une classe héritant de BaseExporter.
    """

    # Fichiers à ignorer lors du scan
    IGNORED_FILES = {"__init__.py", "base.py", "manager.py"}

    def __init__(self, config: dict):
        self.config = config
        self.exporters: Dict[str, BaseExporter] = {}
        self._registry: Dict[str, Type[BaseExporter]] = {}
        self._discover_exporters()
        self._load_exporters()

    def _discover_exporters(self) -> None:
        """
        Découvre automatiquement les exporteurs dans le dossier exporters/.

        Scanne tous les fichiers .py et recherche les classes héritant de BaseExporter.
        """
        exporters_dir = Path(__file__).parent

        for file_path in exporters_dir.glob("*.py"):
            # Ignorer les fichiers système
            if file_path.name in self.IGNORED_FILES:
                continue

            try:
                # Charger le module dynamiquement
                module_name = file_path.stem  # nom sans .py
                spec = importlib.util.spec_from_file_location(
                    f"exporters.{module_name}",
                    file_path
                )
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                # Rechercher les classes BaseExporter dans le module
                for name, obj in inspect.getmembers(module, inspect.isclass):
                    if (
                        issubclass(obj, BaseExporter)
                        and obj is not BaseExporter
                        and hasattr(obj, 'name')
                    ):
                        exporter_name = obj.name
                        self._registry[exporter_name] = obj
                        logger.info(
                            f"Exporteur découvert: {exporter_name} "
                            f"({file_path.name})"
                        )

            except Exception as e:
                logger.error(f"Erreur chargement {file_path.name}: {e}")

        logger.info(f"{len(self._registry)} exporteur(s) découvert(s)")

    def _load_exporters(self) -> None:
        """Instancie tous les exporteurs découverts."""
        for name, exporter_class in self._registry.items():
            try:
                exporter_config = self.config.get(name, {})
                exporter = exporter_class(exporter_config)
                self.exporters[name] = exporter
                logger.debug(f"Exporteur '{name}' chargé")
            except Exception as e:
                logger.error(f"Erreur instanciation '{name}': {e}")

    @property
    def registry(self) -> Dict[str, Type[BaseExporter]]:
        """Retourne le registre des exporteurs découverts."""
        return self._registry.copy()

    async def start_all(self) -> Dict[str, bool]:
        """Démarre tous les exporteurs activés."""
        results = {}
        for name, exporter in self.exporters.items():
            if exporter.is_enabled:
                try:
                    await exporter.connect()
                    results[name] = True
                    logger.info(f"Exporteur '{name}' démarré")
                except Exception as e:
                    results[name] = False
                    logger.error(f"Échec démarrage '{name}': {e}")
        return results

    async def stop_all(self) -> None:
        """Arrête tous les exporteurs."""
        for name, exporter in self.exporters.items():
            if exporter.is_connected:
                try:
                    await exporter.disconnect()
                    logger.info(f"Exporteur '{name}' arrêté")
                except Exception as e:
                    logger.warning(f"Erreur arrêt '{name}': {e}")

    async def export_data(self, pdl: str, data: dict) -> dict:
        """Exporte les données vers tous les exporteurs actifs."""
        results = {}
        for name, exporter in self.exporters.items():
            if exporter.is_enabled and exporter.is_connected:
                try:
                    await exporter.export_consumption(pdl, data)
                    results[name] = {"status": "success"}
                except Exception as e:
                    results[name] = {"status": "error", "error": str(e)}
        return results

    def get_exporter(self, name: str) -> Optional[BaseExporter]:
        """Récupère un exporteur par son nom."""
        return self.exporters.get(name)

    def list_exporters(self) -> list:
        """Liste tous les exporteurs avec leur statut."""
        return [
            {
                "name": name,
                "description": exp.description,
                "enabled": exp.is_enabled,
                "connected": exp.is_connected,
            }
            for name, exp in self.exporters.items()
        ]

    def reload(self) -> None:
        """Recharge tous les exporteurs (hot reload)."""
        self._registry.clear()
        self.exporters.clear()
        self._discover_exporters()
        self._load_exporters()
```

### Créer un nouvel exporteur

Grâce au chargement dynamique, il suffit de créer un fichier Python dans `exporters/` :

```python
# src/exporters/influxdb.py
from .base import BaseExporter, ExporterConfig
from pydantic import Field
from typing import Dict, Any, Optional

class InfluxDBConfig(ExporterConfig):
    """Configuration InfluxDB."""
    url: str = Field(default="http://localhost:8086", description="URL InfluxDB")
    token: str = Field(default="", description="Token d'authentification")
    org: str = Field(default="myorg", description="Organisation")
    bucket: str = Field(default="myelectricaldata", description="Bucket")


class InfluxDBExporter(BaseExporter):
    """Exporteur InfluxDB - Détecté automatiquement."""

    # Ces attributs sont utilisés pour l'auto-découverte
    name = "influxdb"  # Identifiant unique
    description = "Export vers InfluxDB 2.x"
    version = "1.0.0"

    def __init__(self, config: dict):
        super().__init__(config)
        self.client = None

    def _validate_config(self, config: Dict[str, Any]) -> InfluxDBConfig:
        return InfluxDBConfig(**config)

    async def connect(self) -> bool:
        from influxdb_client.client.influxdb_client_async import InfluxDBClientAsync
        self.client = InfluxDBClientAsync(
            url=self._config.url,
            token=self._config.token,
            org=self._config.org
        )
        self._status = "connected"
        return True

    async def disconnect(self) -> None:
        if self.client:
            await self.client.close()
        self._status = "disconnected"

    async def export_consumption(
        self, pdl: str, data: dict, metadata: Optional[dict] = None
    ) -> bool:
        from influxdb_client import Point
        point = Point("consumption") \
            .tag("pdl", pdl) \
            .field("daily", data.get("daily", 0)) \
            .field("hc", data.get("hc", 0)) \
            .field("hp", data.get("hp", 0))

        write_api = self.client.write_api()
        await write_api.write(bucket=self._config.bucket, record=point)
        return True

    async def export_production(
        self, pdl: str, data: dict, metadata: Optional[dict] = None
    ) -> bool:
        from influxdb_client import Point
        point = Point("production") \
            .tag("pdl", pdl) \
            .field("daily", data.get("daily", 0))

        write_api = self.client.write_api()
        await write_api.write(bucket=self._config.bucket, record=point)
        return True

    async def test_connection(self) -> dict:
        try:
            from influxdb_client.client.influxdb_client_async import InfluxDBClientAsync
            async with InfluxDBClientAsync(
                url=self._config.url,
                token=self._config.token,
                org=self._config.org
            ) as client:
                ready = await client.ping()
                return {
                    "success": ready,
                    "message": "Connecté à InfluxDB" if ready else "Échec ping",
                    "details": {"url": self._config.url, "org": self._config.org}
                }
        except Exception as e:
            return {"success": False, "message": str(e), "details": {}}

    def get_config_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "title": "Activer", "default": False},
                "url": {"type": "string", "title": "URL", "default": "http://localhost:8086"},
                "token": {"type": "string", "title": "Token", "format": "password"},
                "org": {"type": "string", "title": "Organisation", "default": "myorg"},
                "bucket": {"type": "string", "title": "Bucket", "default": "myelectricaldata"},
            },
            "required": ["url", "token", "org", "bucket"]
        }
```

**C'est tout !** Le fichier `influxdb.py` sera automatiquement détecté au démarrage. Aucune modification du manager n'est nécessaire.

#### Logs au démarrage

```
INFO - Exporteur découvert: home_assistant (home_assistant.py)
INFO - Exporteur découvert: mqtt (mqtt.py)
INFO - Exporteur découvert: victoriametrics (victoriametrics.py)
INFO - Exporteur découvert: prometheus (prometheus.py)
INFO - Exporteur découvert: jeedom (jeedom.py)
INFO - Exporteur découvert: influxdb (influxdb.py)
INFO - 6 exporteur(s) découvert(s)
```

## Prérequis

1. **Compte MyElectricalData** avec consentement Enedis validé
2. **Identifiants API** : `client_id` et `client_secret` fournis par la passerelle
3. **Environnement d'exécution** : Docker (recommandé) ou Python 3.11+

## Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Interface web complète** | Toutes les pages de la passerelle disponibles localement |
| **Synchronisation automatique** | Récupération périodique des données via la passerelle |
| **Stockage local** | SQLite (défaut), PostgreSQL ou MySQL |
| **Home Assistant** | Entités sensor pour Energy Dashboard + cartes Lovelace |
| **MQTT** | Publication des données sur topics configurables |
| **VictoriaMetrics** | Export Prometheus metrics pour historisation longue durée |
| **Jeedom** | Plugin dédié avec widgets |
| **API REST locale** | Endpoints pour intégrations personnalisées |

## Interface Web

Le client local embarque une interface web complète, identique à celle de la passerelle MyElectricalData :

### Pages disponibles

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Liste des points de livraison (PDL) récupérés via l'API |
| **Consommation kWh** | `/consumption_kwh` | Graphiques de consommation en kilowattheures |
| **Consommation Euro** | `/consumption_euro` | Consommation convertie en euros selon votre tarif |
| **Production** | `/production` | Suivi de la production (panneaux solaires) |
| **Bilan** | `/bilan` | Synthèse énergétique et comparatifs |
| **Ecowatt** | `/ecowatt` | Alertes et prévisions Ecowatt RTE |
| **Tempo** | `/tempo` | Couleurs des jours Tempo et historique |
| **Simulation** | `/simulation` | Simulateur de tarifs et comparaison d'offres |
| **Exporteurs** | `/exporters` | Configuration des exports domotiques |

### Page Exporteurs

La page **Exporteurs** (`/exporters`) est une nouveauté du client local. Elle permet de configurer visuellement tous les exports vers vos systèmes domotiques :

```
┌─────────────────────────────────────────────────────────────────┐
│  Exporteurs                                                      │
├─────────────────────────────────────────────────────────────────┤
│  [Home Assistant] [MQTT] [VictoriaMetrics] [Prometheus] [Jeedom]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Home Assistant                                    [Activé ✓]   │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  MQTT Discovery         [✓]     Préfixe: homeassistant          │
│  Energy Dashboard       [✓]     Statistiques long terme: [✓]   │
│                                                                  │
│  Broker MQTT                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Hôte: core-mosquitto        Port: 1883                  │   │
│  │ Utilisateur: ________       Mot de passe: ________      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Tester la connexion]                    [Sauvegarder]         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Sous-menus disponibles

- **Home Assistant** : Configuration MQTT Discovery, Energy Dashboard, statistiques
- **MQTT** : Broker, topics, format des messages, QoS
- **VictoriaMetrics** : Endpoint push, intervalle, labels
- **Prometheus** : Port d'exposition, métriques personnalisées
- **Jeedom** : URL API, clé API, mapping des commandes

Chaque exporteur peut être activé/désactivé indépendamment et testé avant sauvegarde.

## Démarrage rapide

```bash
# Via Docker (recommandé)
docker run -d \
  --name myelectricaldata-client \
  -e CLIENT_ID=votre_client_id \
  -e CLIENT_SECRET=votre_client_secret \
  -e GATEWAY_URL=https://api.myelectricaldata.fr \
  -v myelectricaldata_data:/data \
  -p 8080:8080 \
  myelectricaldata/local-client:latest
```

## Documentation

| Section | Description |
|---------|-------------|
| [**Installation**](./installation) | Installation Docker et manuelle |
| [**Configuration**](./configuration) | Fichier de configuration détaillé |
| [**Interface Web**](./interface) | Pages et navigation |
| [**Exporteurs**](./exporters) | Configuration des exports domotiques |
| [**Architecture**](./architecture) | Architecture modulaire et système de plugins |
| [**Home Assistant**](./integrations/home-assistant) | Intégration Energy Dashboard |
| [**MQTT**](./integrations/mqtt) | Publication vers broker MQTT |
| [**VictoriaMetrics**](./integrations/victoriametrics) | Export métriques Prometheus |
| [**Jeedom**](./integrations/jeedom) | Plugin et configuration |
| [**Autres intégrations**](./integrations/autres) | Domoticz, OpenHAB, etc. |

## Données exposées

Le client local récupère et expose les données suivantes :

### Consommation
- Consommation journalière (kWh)
- Consommation par tranche horaire (30 min)
- Puissance maximale quotidienne (kVA)

### Production (si applicable)
- Production journalière (kWh)
- Production par tranche horaire (30 min)

### Métadonnées
- Informations du PDL (adresse, puissance souscrite)
- Statut du contrat
- Dernière synchronisation
