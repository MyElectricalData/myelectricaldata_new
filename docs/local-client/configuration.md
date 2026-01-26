# Configuration Mode Client

## Variables d'environnement

Le mode client utilise le fichier `.env.local-client` à la racine du projet.

---

## Configuration obligatoire

### Credentials API MyElectricalData

```bash
# Client ID de votre compte (format: cli_xxxxxxxxx)
MED_CLIENT_ID=cli_xxxxxxxxxxxxxxxxxxxxxxxxx

# Client Secret de votre compte
MED_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Où trouver ces valeurs ?**

1. Connectez-vous à [www.v2.myelectricaldata.fr](https://www.v2.myelectricaldata.fr)
2. Allez dans **Paramètres** > **API**
3. Copiez les valeurs **Client ID** et **Client Secret**

---

## Configuration optionnelle

### Réseau et ports

```bash
# Port du frontend (défaut: 8100)
CLIENT_FRONTEND_PORT=8100

# Port du backend API (défaut: 8181)
CLIENT_BACKEND_PORT=8181

# Port PostgreSQL interne (défaut: 5433)
CLIENT_POSTGRES_PORT=5433
```

### Timezone

```bash
# Timezone pour les dates et le scheduler (défaut: Europe/Paris)
TZ=Europe/Paris
```

### Base de données

```bash
# Credentials PostgreSQL local (défaut: client/client)
POSTGRES_USER=client
POSTGRES_PASSWORD=client
POSTGRES_DB=client

# Tuning PostgreSQL (pour Raspberry Pi)
POSTGRES_SHARED_BUFFERS=128MB
POSTGRES_WORK_MEM=8MB
```

### Scheduler

```bash
# Heure de synchronisation quotidienne (format 24h, défaut: 06:00)
SYNC_HOUR=6
SYNC_MINUTE=0

# Activer/désactiver le scheduler (défaut: true)
SCHEDULER_ENABLED=true
```

### Mode debug

```bash
# Activer les logs détaillés (défaut: false)
DEBUG=true

# Logs SQL (défaut: false)
DEBUG_SQL=true
```

---

## Configuration des exports

### Home Assistant

```bash
# URL de votre instance Home Assistant
HOMEASSISTANT_URL=http://homeassistant.local:8123

# Token d'accès longue durée
# Créer dans : Profil > Tokens d'accès longue durée
HOMEASSISTANT_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...

# Activer l'export automatique (défaut: false)
HOMEASSISTANT_ENABLED=false

# Intervalle d'export en minutes (défaut: 60)
HOMEASSISTANT_INTERVAL=60
```

### MQTT

```bash
# URL du broker MQTT
MQTT_BROKER=mqtt://localhost:1883

# Ou avec authentification
MQTT_BROKER=mqtt://user:password@localhost:1883

# Topic de base (défaut: myelectricaldata)
MQTT_TOPIC_PREFIX=myelectricaldata

# Activer l'export automatique (défaut: false)
MQTT_ENABLED=false

# QoS level (défaut: 1)
MQTT_QOS=1

# Retain messages (défaut: true)
MQTT_RETAIN=true
```

### VictoriaMetrics

```bash
# URL de l'API d'import
VICTORIAMETRICS_URL=http://localhost:8428

# Headers additionnels (format JSON)
VICTORIAMETRICS_HEADERS={"Authorization": "Bearer token123"}

# Activer l'export automatique (défaut: false)
VICTORIAMETRICS_ENABLED=false
```

### Jeedom

```bash
# URL de votre instance Jeedom
JEEDOM_URL=http://jeedom.local

# Clé API Jeedom
# Trouver dans : Réglages > Système > Configuration > API
JEEDOM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Activer l'export automatique (défaut: false)
JEEDOM_ENABLED=false
```

---

## Exemple complet

```bash
# === OBLIGATOIRE ===
MED_CLIENT_ID=cli_abc123def456ghi789
MED_CLIENT_SECRET=jkl012mno345pqr678stu901vwx234yz

# === RÉSEAU ===
CLIENT_FRONTEND_PORT=8100
CLIENT_BACKEND_PORT=8181
TZ=Europe/Paris

# === SCHEDULER ===
SYNC_HOUR=6
SYNC_MINUTE=0
SCHEDULER_ENABLED=true

# === EXPORTS ===

# Home Assistant
HOMEASSISTANT_URL=http://192.168.1.100:8123
HOMEASSISTANT_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
HOMEASSISTANT_ENABLED=true
HOMEASSISTANT_INTERVAL=60

# MQTT
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_TOPIC_PREFIX=energy
MQTT_ENABLED=true

# VictoriaMetrics (désactivé)
VICTORIAMETRICS_URL=http://victoriametrics:8428
VICTORIAMETRICS_ENABLED=false

# Jeedom (désactivé)
JEEDOM_URL=http://jeedom.local
JEEDOM_API_KEY=xxx
JEEDOM_ENABLED=false

# === DEBUG ===
DEBUG=false
DEBUG_SQL=false
```

---

## Configuration via l'interface

La plupart des paramètres d'export peuvent également être configurés depuis l'interface web :

1. Accéder à http://localhost:8100/export
2. Configurer chaque destination dans les onglets dédiés
3. Tester la connexion avant d'activer

Les configurations sauvegardées via l'interface sont stockées dans la table `export_configs` de PostgreSQL et **prennent le pas** sur les variables d'environnement.

---

## Priorité des configurations

```
1. Interface web (export_configs)     ← Priorité haute
2. Variables d'environnement (.env.local-client)
3. Valeurs par défaut                 ← Priorité basse
```

---

## Validation de la configuration

### Vérifier les variables chargées

```bash
docker compose -f docker-compose.yml exec backend \
  python -c "from config.settings import settings; print(settings.model_dump())"
```

### Tester la connexion à l'API

```bash
docker compose -f docker-compose.yml exec backend \
  python -c "
import asyncio
from adapters.myelectricaldata import MyElectricalDataAdapter

async def test():
    adapter = MyElectricalDataAdapter()
    pdls = await adapter.get_pdls()
    print(f'PDLs trouvés: {len(pdls)}')
    for pdl in pdls:
        print(f'  - {pdl.usage_point_id}')

asyncio.run(test())
"
```

### Tester les exports

```bash
# Test Home Assistant
docker compose -f docker-compose.yml exec backend \
  python -c "
import asyncio
from services.exporters.home_assistant import HomeAssistantExporter

async def test():
    exporter = HomeAssistantExporter()
    result = await exporter.test_connection()
    print(f'Connexion: {\"OK\" if result.success else \"ERREUR\"}')
    if not result.success:
        print(f'Message: {result.error}')

asyncio.run(test())
"
```

---

## Rechargement de la configuration

Après modification de `.env.local-client`, redémarrer le backend :

```bash
docker compose -f docker-compose.yml restart backend
```

Les modifications de configuration via l'interface web sont prises en compte immédiatement, sans redémarrage.
