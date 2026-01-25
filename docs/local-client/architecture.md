# Architecture Mode Client

## Vue d'ensemble

Le mode client adopte une architecture simplifiée par rapport au mode serveur, avec un focus sur le stockage local et les exports.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           MODE CLIENT - ARCHITECTURE                          │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│                        ┌─────────────────────────┐                            │
│                        │      FRONTEND           │                            │
│                        │   React / Vite          │                            │
│                        │   :8100 (dev)           │                            │
│                        └───────────┬─────────────┘                            │
│                                    │                                          │
│                                    ▼                                          │
│                        ┌─────────────────────────┐                            │
│                        │      BACKEND            │                            │
│                        │   FastAPI               │                            │
│                        │   :8181                 │                            │
│                        └───────────┬─────────────┘                            │
│                                    │                                          │
│              ┌─────────────────────┼─────────────────────┐                    │
│              │                     │                     │                    │
│              ▼                     ▼                     ▼                    │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐             │
│   │ API Adapter     │   │ PostgreSQL      │   │ Exporter        │             │
│   │ v2.myelectrical │   │ (stockage local)│   │ Service         │             │
│   │ data.fr         │   │ :5433           │   │                 │             │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘             │
│            │                     │                     │                      │
│            │                     │         ┌───────────┴───────────┐          │
│            │                     │         │           │           │          │
│            ▼                     │         ▼           ▼           ▼          │
│   ┌─────────────────┐            │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│   │ API Gateway     │            │  │ Home     │ │ MQTT     │ │ Victoria │    │
│   │ MyElectricalData│            │  │ Assistant│ │ Broker   │ │ Metrics  │    │
│   │ (distant)       │            │  └──────────┘ └──────────┘ └──────────┘    │
│   └─────────────────┘            │                                            │
│                                  │                       ┌──────────┐         │
│                                  │                       │ Jeedom   │         │
│                                  │                       └──────────┘         │
│                                  │                                            │
│   Scheduler (APScheduler)        │                                            │
│   ━━━━━━━━━━━━━━━━━━━━━━━        │                                            │
│   • Sync quotidien des données   │                                            │
│   • Export automatique           │                                            │
│   • Nettoyage cache              │                                            │
│                                  │                                            │
└──────────────────────────────────┴────────────────────────────────────────────┘
```

---

## Composants

### Frontend (React/Vite)

Mode client spécifique :

- **Pas de page d'accueil** : Redirection directe vers `/dashboard`
- **Pas de routes admin** : Supprimées du routeur
- **Pas d'authentification locale** : Utilise le token API stocké
- **Nouvelle page `/export`** : Configuration des destinations d'export

```typescript
// Routes mode client
const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: Dashboard },
  { path: '/consumption', component: ConsumptionKwh },
  { path: '/consumption/euro', component: ConsumptionEuro },
  { path: '/production', component: Production },
  { path: '/bilan', component: Bilan },
  { path: '/contribute', component: Contribute },
  { path: '/tempo', component: Tempo },
  { path: '/ecowatt', component: Ecowatt },
  { path: '/export', component: Export },  // Nouveau
];
```

### Backend (FastAPI)

#### Structure des routers

```python
# Mode client - routers inclus
from routers import (
    pdl,           # Lecture PDL via API distante
    consumption,   # Sync + lecture données locales
    production,    # Sync + lecture données locales
    tempo,         # Sync + lecture données locales
    ecowatt,       # Sync + lecture données locales
    contribute,    # Envoi contributions vers API distante
    export,        # Configuration et exécution exports
    sync,          # Synchronisation manuelle
)

# Mode client - routers EXCLUS
# - accounts (pas de gestion users locale)
# - admin (pas d'administration)
# - enedis (pas d'accès direct Enedis)
```

#### API Adapter

Nouveau service pour communiquer avec l'API MyElectricalData :

```python
# apps/api/src/adapters/myelectricaldata.py

class MyElectricalDataAdapter:
    """Client pour l'API MyElectricalData v2"""

    BASE_URL = "https://www.v2.myelectricaldata.fr/api"

    async def get_pdls(self) -> list[PDL]:
        """Récupère les PDL autorisés pour ce client"""

    async def get_consumption_daily(
        self, pdl: str, start: date, end: date
    ) -> list[ConsumptionReading]:
        """Récupère la consommation journalière"""

    async def get_production_daily(
        self, pdl: str, start: date, end: date
    ) -> list[ProductionReading]:
        """Récupère la production journalière"""

    async def get_tempo(self, start: date, end: date) -> list[TempoDay]:
        """Récupère le calendrier Tempo"""

    async def get_ecowatt(self, start: date, end: date) -> list[EcowattSignal]:
        """Récupère les signaux EcoWatt"""

    async def post_contribution(self, contribution: Contribution) -> bool:
        """Envoie une contribution"""
```

### Base de données PostgreSQL

#### Schéma mode client

```sql
-- Configuration locale
CREATE TABLE config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Données de consommation (stockage indéfini)
CREATE TABLE consumption_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usage_point_id VARCHAR(14) NOT NULL,
    date DATE NOT NULL,
    value_wh INTEGER NOT NULL,
    quality VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(usage_point_id, date)
);

-- Données de production (stockage indéfini)
CREATE TABLE production_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usage_point_id VARCHAR(14) NOT NULL,
    date DATE NOT NULL,
    value_wh INTEGER NOT NULL,
    quality VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(usage_point_id, date)
);

-- Calendrier Tempo
CREATE TABLE tempo_calendar (
    date DATE PRIMARY KEY,
    color VARCHAR(10) NOT NULL,  -- BLEU, BLANC, ROUGE
    created_at TIMESTAMP DEFAULT NOW()
);

-- Signaux EcoWatt
CREATE TABLE ecowatt_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    hour INTEGER NOT NULL,  -- 0-23
    level INTEGER NOT NULL,  -- 1, 2, 3
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(date, hour)
);

-- Configuration exports
CREATE TABLE export_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,  -- home_assistant, mqtt, victoriametrics, jeedom
    enabled BOOLEAN DEFAULT false,
    config JSONB NOT NULL,
    last_export_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Historique exports
CREATE TABLE export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_config_id UUID REFERENCES export_configs(id),
    status VARCHAR(20) NOT NULL,  -- success, error
    records_exported INTEGER,
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_consumption_pdl_date ON consumption_daily(usage_point_id, date);
CREATE INDEX idx_production_pdl_date ON production_daily(usage_point_id, date);
CREATE INDEX idx_tempo_date ON tempo_calendar(date);
CREATE INDEX idx_ecowatt_date ON ecowatt_signals(date);
```

---

## Flux de données

### Stratégie "Local-First"

Le mode client utilise une stratégie **local-first** pour minimiser les appels API :

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STRATÉGIE LOCAL-FIRST                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Frontend demande données (ex: consommation 01/01 → 31/01)                  │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. VÉRIFIER POSTGRESQL LOCAL                                       │    │
│  │     - Chercher données existantes dans la plage demandée            │    │
│  │     - Identifier les "trous" (plages manquantes)                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  2. FETCH UNIQUEMENT LES TROUS                                      │    │
│  │     - Si données complètes : retourner directement                  │    │
│  │     - Si trous : appeler gateway pour chaque plage manquante        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  3. COMBINER ET RETOURNER                                           │    │
│  │     - Fusionner données locales + données gateway                   │    │
│  │     - Trier par date                                                │    │
│  │     - Retourner au frontend                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Exemple concret :                                                          │
│  - Demande : 01/01 → 31/01                                                  │
│  - Local : 01/01 → 15/01 (15 jours)                                         │
│  - Trous : 16/01 → 31/01 (16 jours)                                         │
│  - Gateway appelé UNIQUEMENT pour 16/01 → 31/01                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Synchronisation des données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUX DE SYNCHRONISATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. DÉMARRAGE / SYNC MANUEL                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━                                                 │
│                                                                             │
│  Client                  Backend                 API Distante               │
│    │                        │                        │                      │
│    │  POST /sync            │                        │                      │
│    │───────────────────────>│                        │                      │
│    │                        │  GET /pdl              │                      │
│    │                        │───────────────────────>│                      │
│    │                        │<───────────────────────│                      │
│    │                        │                        │                      │
│    │                        │  Pour chaque PDL :     │                      │
│    │                        │  ✓ Vérifier has_production                    │
│    │                        │  GET /consumption      │                      │
│    │                        │───────────────────────>│                      │
│    │                        │<───────────────────────│                      │
│    │                        │  GET /production       │                      │
│    │                        │  (seulement si         │                      │
│    │                        │   has_production=true) │                      │
│    │                        │───────────────────────>│                      │
│    │                        │<───────────────────────│                      │
│    │                        │                        │                      │
│    │                        │  INSERT/UPDATE         │                      │
│    │                        │  PostgreSQL local      │                      │
│    │                        │                        │                      │
│    │  200 OK (summary)      │                        │                      │
│    │<───────────────────────│                        │                      │
│                                                                             │
│                                                                             │
│  2. SYNC AUTOMATIQUE (Scheduler)                                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                            │
│                                                                             │
│  APScheduler:                                                               │
│    • Sync données : toutes les 30 min                                       │
│    • Sync Tempo : toutes les 15 min (6h-23h) si J+1 inconnu                 │
│    • Sync EcoWatt : 17h (quotidien), 12h15 (vendredi), fallback horaire     │
│    • Exports : selon configuration utilisateur                              │
│                                                                             │
│  IMPORTANT : En mode client, le scheduler utilise SyncService               │
│  pour récupérer Tempo/EcoWatt depuis la gateway (pas d'appel RTE direct)    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Export des données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUX D'EXPORT                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CONFIGURATION (UI)                                                      │
│                                                                             │
│  Page /export                                                               │
│    │                                                                        │
│    │  Configurer Home Assistant                                             │
│    │  • URL: http://homeassistant.local:8123                                │
│    │  • Token: eyJ...                                                       │
│    │  • Entités à créer                                                     │
│    │                                                                        │
│    │  POST /export/config                                                   │
│    │────────────────────────>│                                              │
│    │                         │  Valider config                              │
│    │                         │  Sauvegarder en BDD                          │
│    │  200 OK                 │                                              │
│    │<────────────────────────│                                              │
│                                                                             │
│                                                                             │
│  2. EXPORT AUTOMATIQUE (post-sync)                                          │
│                                                                             │
│  Sync Job termine                                                           │
│    │                                                                        │
│    │  Pour chaque export_config enabled:                                    │
│    │    │                                                                   │
│    │    │  ExporterService.export(config)                                   │
│    │    │                                                                   │
│    │    │  ┌─ HomeAssistantExporter                                         │
│    │    │  │   POST /api/states/sensor.{pdl}_consumption                    │
│    │    │  │                                                                │
│    │    │  ├─ MQTTExporter                                                  │
│    │    │  │   PUBLISH myelectricaldata/{pdl}/consumption                   │
│    │    │  │                                                                │
│    │    │  ├─ VictoriaMetricsExporter                                       │
│    │    │  │   POST /api/v1/import                                          │
│    │    │  │                                                                │
│    │    │  └─ JeedomExporter                                                │
│    │    │      POST /core/api/jeeApi.php                                    │
│    │    │                                                                   │
│    │  Log résultat dans export_logs                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Différences clés avec le mode serveur

| Aspect | Mode Serveur | Mode Client |
|--------|--------------|-------------|
| **Source données** | Enedis API direct | API MyElectricalData |
| **Authentification** | JWT + OAuth2 Enedis | Token API pré-configuré |
| **Stockage** | Cache Valkey (24h) | PostgreSQL (indéfini) |
| **Users** | Multi-utilisateurs | Mono-utilisateur |
| **Administration** | Complète (UI admin) | Aucune |
| **Rate limiting** | 5 req/s + quotas | Géré par API distante |
| **Exports** | Non | Home Assistant, MQTT, etc. |
| **Page d'accueil** | Landing page | Redirection /dashboard |

---

## Services

### Exporter Service

```python
# apps/api/src/services/exporter.py

class ExporterService:
    """Orchestrateur des exports"""

    exporters = {
        'home_assistant': HomeAssistantExporter,
        'mqtt': MQTTExporter,
        'victoriametrics': VictoriaMetricsExporter,
        'jeedom': JeedomExporter,
    }

    async def export_all(self, data: ExportData) -> list[ExportResult]:
        """Exporte vers toutes les destinations activées"""

    async def export_to(
        self, destination: str, data: ExportData
    ) -> ExportResult:
        """Exporte vers une destination spécifique"""

    async def test_connection(
        self, destination: str, config: dict
    ) -> ConnectionTestResult:
        """Teste la connexion à une destination"""
```

### Sync Service

```python
# apps/api/src/services/sync.py

class SyncService:
    """Service de synchronisation avec l'API distante"""

    async def sync_all(self) -> SyncResult:
        """Synchronise toutes les données"""

    async def sync_consumption(
        self, pdl: str, start: date, end: date
    ) -> int:
        """Synchronise la consommation et retourne le nombre de jours"""

    async def sync_production(
        self, pdl: str, start: date, end: date
    ) -> int:
        """Synchronise la production"""

    async def sync_tempo(self) -> int:
        """Synchronise le calendrier Tempo"""

    async def sync_ecowatt(self) -> int:
        """Synchronise les signaux EcoWatt"""
```

---

## Scheduler

Le mode client utilise APScheduler pour les tâches planifiées. **Important** : le scheduler client utilise exclusivement `SyncService` pour récupérer les données depuis la gateway (pas d'appel direct aux APIs RTE).

```python
# apps/api/src/scheduler.py

class SyncScheduler:
    """Scheduler pour le mode client uniquement"""

    def start(self):
        # Sync données PDL : toutes les 30 minutes
        self._scheduler.add_job(
            self._run_sync,
            trigger=IntervalTrigger(minutes=30),
            next_run_time=datetime.now(UTC),  # Exécution immédiate au démarrage
        )

        # Sync Tempo : toutes les 15 min (6h-23h)
        # Sync uniquement si la couleur de demain est inconnue
        self._scheduler.add_job(
            self._run_tempo_sync,
            trigger=CronTrigger(minute="*/15", hour="6-23"),
        )

        # Sync EcoWatt :
        # - 17h00 quotidien (publication RTE)
        # - 12h15 vendredi (publication anticipée)
        # - Fallback horaire si J+3 incomplet
        self._scheduler.add_job(self._run_ecowatt_sync, trigger=CronTrigger(hour=17, minute=0))
        self._scheduler.add_job(self._run_ecowatt_sync, trigger=CronTrigger(day_of_week="fri", hour=12, minute=15))
        self._scheduler.add_job(self._run_ecowatt_sync_if_incomplete, trigger=IntervalTrigger(hours=1))

        # Exports planifiés : vérification chaque minute
        self._scheduler.add_job(
            self._run_scheduled_exports,
            trigger=IntervalTrigger(minutes=1),
        )

    async def _run_tempo_sync(self):
        """Sync Tempo via SyncService (gateway, pas RTE direct)"""
        sync_service = SyncService(db)
        await sync_service.sync_tempo()

    async def _run_ecowatt_sync(self):
        """Sync EcoWatt via SyncService (gateway, pas RTE direct)"""
        sync_service = SyncService(db)
        await sync_service.sync_ecowatt()
```

### Différence Serveur vs Client

| Job | Mode Serveur | Mode Client |
|-----|--------------|-------------|
| Tempo sync | `rte_service.update_tempo_cache()` (API RTE) | `sync_service.sync_tempo()` (gateway) |
| EcoWatt sync | `rte_service.update_ecowatt_cache()` (API RTE) | `sync_service.sync_ecowatt()` (gateway) |
| PDL sync | N/A | `sync_service.sync_all()` (gateway) |
| Exports | N/A | `_run_scheduled_exports()` |

---

## Variables d'environnement spécifiques

```bash
# Le mode client est le défaut (pas de variable à définir)
# Pour le mode serveur, il faut définir SERVER_MODE=true

# Credentials API MyElectricalData
MED_API_URL=https://www.v2.myelectricaldata.fr/api
MED_CLIENT_ID=cli_xxxxxxxxxxxxx
MED_CLIENT_SECRET=xxxxxxxxxxxxxxxx

# Base de données locale (port différent du mode serveur)
DATABASE_URL=postgresql+asyncpg://client:password@postgres-client:5432/client

# Pas de Valkey nécessaire (stockage PostgreSQL)
# REDIS_URL non défini

# Exports (optionnel)
HOMEASSISTANT_URL=http://homeassistant.local:8123
MQTT_BROKER=mqtt://localhost:1883
VICTORIAMETRICS_URL=http://localhost:8428
JEEDOM_URL=http://jeedom.local
```
