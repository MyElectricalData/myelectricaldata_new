---
sidebar_position: 3
title: Configuration
---

# Configuration du Client Local

Le client local peut être configuré via un fichier YAML ou des variables d'environnement.

## Fichier de configuration

Créez un fichier `config.yaml` dans le dossier `/config` (ou à la racine pour une installation manuelle) :

```yaml
# =============================================================================
# Configuration MyElectricalData Local Client
# =============================================================================

# -----------------------------------------------------------------------------
# Identifiants API (obligatoires)
# -----------------------------------------------------------------------------
gateway:
  url: "https://api.myelectricaldata.fr"
  client_id: "votre_client_id"
  client_secret: "votre_client_secret"

# -----------------------------------------------------------------------------
# Base de données
# -----------------------------------------------------------------------------
database:
  # SQLite (par défaut)
  url: "sqlite:///data/myelectricaldata.db"

  # PostgreSQL
  # url: "postgresql://user:password@localhost:5432/myelectricaldata"

  # MySQL/MariaDB
  # url: "mysql://user:password@localhost:3306/myelectricaldata"

# -----------------------------------------------------------------------------
# Synchronisation
# -----------------------------------------------------------------------------
sync:
  # Intervalle entre les synchronisations (en secondes)
  interval: 3600  # 1 heure

  # Nombre de jours à récupérer en arrière
  days_back: 7

  # Heure de synchronisation complète (format HH:MM)
  # Récupère l'historique complet une fois par jour
  full_sync_time: "04:00"

  # Réessayer en cas d'échec
  retry_count: 3
  retry_delay: 300  # 5 minutes

# -----------------------------------------------------------------------------
# Données à récupérer
# -----------------------------------------------------------------------------
data:
  # Consommation
  consumption:
    enabled: true
    daily: true      # Consommation journalière
    detailed: true   # Consommation par tranche de 30 min
    max_power: true  # Puissance maximale quotidienne

  # Production (si vous avez des panneaux solaires)
  production:
    enabled: true
    daily: true
    detailed: true

# -----------------------------------------------------------------------------
# Home Assistant
# -----------------------------------------------------------------------------
home_assistant:
  enabled: true

  # Découverte automatique via MQTT Discovery
  discovery: true
  discovery_prefix: "homeassistant"

  # Préfixe des entités
  entity_prefix: "myelectricaldata"

  # Créer les entités pour le Energy Dashboard
  energy_dashboard: true

  # Long-term statistics
  statistics: true

# -----------------------------------------------------------------------------
# MQTT
# -----------------------------------------------------------------------------
mqtt:
  enabled: false

  # Broker MQTT
  host: "localhost"
  port: 1883
  username: ""
  password: ""

  # TLS/SSL
  tls: false
  ca_cert: ""
  client_cert: ""
  client_key: ""

  # Topics
  topic_prefix: "myelectricaldata"

  # Qualité de service (0, 1 ou 2)
  qos: 1

  # Retenir les messages
  retain: true

  # Format des messages (json ou simple)
  format: "json"

# -----------------------------------------------------------------------------
# VictoriaMetrics / Prometheus
# -----------------------------------------------------------------------------
metrics:
  enabled: false

  # Port d'exposition des métriques
  port: 9090

  # Chemin des métriques
  path: "/metrics"

  # Labels personnalisés
  labels:
    instance: "home"

  # Push vers VictoriaMetrics (optionnel)
  push:
    enabled: false
    url: "http://victoriametrics:8428/api/v1/import/prometheus"
    interval: 60

# -----------------------------------------------------------------------------
# Jeedom
# -----------------------------------------------------------------------------
jeedom:
  enabled: false

  # URL de l'API Jeedom
  url: "http://jeedom.local/core/api/jeeApi.php"
  api_key: "votre_api_key"

  # ID du plugin virtuel (si utilisé)
  virtual_id: ""

# -----------------------------------------------------------------------------
# API REST locale
# -----------------------------------------------------------------------------
api:
  # Port de l'API
  port: 8080

  # Authentification (optionnel)
  auth:
    enabled: false
    token: ""

  # CORS
  cors:
    enabled: true
    origins:
      - "http://localhost:*"
      - "http://homeassistant.local:*"

# -----------------------------------------------------------------------------
# Logs
# -----------------------------------------------------------------------------
logging:
  # Niveau: DEBUG, INFO, WARNING, ERROR
  level: "INFO"

  # Format: text ou json
  format: "text"

  # Fichier de log (optionnel)
  file: "/data/logs/client.log"

  # Rotation
  max_size: "10MB"
  max_files: 5

# -----------------------------------------------------------------------------
# Notifications (optionnel)
# -----------------------------------------------------------------------------
notifications:
  # Notifier en cas d'erreur de synchronisation
  on_error: true

  # Notifier après synchronisation réussie
  on_success: false

  # Canaux de notification
  channels:
    # Notification Home Assistant
    home_assistant:
      enabled: true
      service: "notify.notify"

    # Notification MQTT
    mqtt:
      enabled: false
      topic: "myelectricaldata/notifications"

    # Webhook
    webhook:
      enabled: false
      url: ""
```

## Variables d'environnement

Toutes les options peuvent être définies via des variables d'environnement. Le format est `SECTION_OPTION` en majuscules :

| Variable | Description | Défaut |
|----------|-------------|--------|
| `CLIENT_ID` | Identifiant API | - |
| `CLIENT_SECRET` | Secret API | - |
| `GATEWAY_URL` | URL de la passerelle | `https://api.myelectricaldata.fr` |
| `DATABASE_URL` | URL de connexion à la BDD | `sqlite:///data/myelectricaldata.db` |
| `SYNC_INTERVAL` | Intervalle de sync (secondes) | `3600` |
| `SYNC_DAYS_BACK` | Jours à récupérer | `7` |
| `HA_ENABLED` | Activer Home Assistant | `true` |
| `HA_DISCOVERY` | MQTT Discovery | `true` |
| `MQTT_ENABLED` | Activer MQTT | `false` |
| `MQTT_HOST` | Hôte MQTT | `localhost` |
| `MQTT_PORT` | Port MQTT | `1883` |
| `MQTT_USERNAME` | Utilisateur MQTT | - |
| `MQTT_PASSWORD` | Mot de passe MQTT | - |
| `METRICS_ENABLED` | Activer métriques Prometheus | `false` |
| `METRICS_PORT` | Port métriques | `9090` |
| `JEEDOM_ENABLED` | Activer Jeedom | `false` |
| `JEEDOM_URL` | URL API Jeedom | - |
| `JEEDOM_API_KEY` | Clé API Jeedom | - |
| `LOG_LEVEL` | Niveau de log | `INFO` |

## Priorité de configuration

1. Variables d'environnement (priorité haute)
2. Fichier `config.yaml`
3. Valeurs par défaut (priorité basse)

## Exemples de configuration

### Configuration minimale

```yaml
gateway:
  client_id: "abc123"
  client_secret: "secret456"
```

### Home Assistant uniquement

```yaml
gateway:
  client_id: "abc123"
  client_secret: "secret456"

home_assistant:
  enabled: true
  discovery: true
  energy_dashboard: true

mqtt:
  enabled: true
  host: "core-mosquitto"  # Add-on Mosquitto
```

### Export métriques vers VictoriaMetrics

```yaml
gateway:
  client_id: "abc123"
  client_secret: "secret456"

home_assistant:
  enabled: false

metrics:
  enabled: true
  port: 9090
  push:
    enabled: true
    url: "http://victoriametrics:8428/api/v1/import/prometheus"
    interval: 60
```

### Multi-intégrations

```yaml
gateway:
  client_id: "abc123"
  client_secret: "secret456"

database:
  url: "postgresql://user:pass@postgres:5432/med"

home_assistant:
  enabled: true
  discovery: true

mqtt:
  enabled: true
  host: "mosquitto"
  topic_prefix: "energy/linky"

metrics:
  enabled: true
  port: 9090

notifications:
  on_error: true
  channels:
    home_assistant:
      enabled: true
```

## Validation de la configuration

Vérifiez votre configuration avec :

```bash
# Via Docker
docker exec myelectricaldata-client med-client config validate

# Installation manuelle
python -m myelectricaldata_client config validate
```

## Recharger la configuration

Le client surveille le fichier de configuration et recharge automatiquement les changements.

Pour forcer un rechargement :

```bash
# Via API
curl -X POST http://localhost:8080/api/config/reload

# Via Docker
docker exec myelectricaldata-client med-client config reload
```
