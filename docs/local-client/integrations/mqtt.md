# Intégration MQTT

## Vue d'ensemble

L'intégration MQTT permet de publier vos données vers n'importe quel broker MQTT compatible. Idéal pour l'intégration avec des systèmes domotiques, Node-RED, ou d'autres applications IoT.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INTÉGRATION MQTT                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MyElectricalData Client          Broker MQTT                               │
│  ━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━                              │
│                                                                             │
│  ┌─────────────┐                  ┌─────────────────────────┐               │
│  │ PostgreSQL  │                  │  Topics                 │               │
│  │             │                  │                         │               │
│  │ consumption │───────────────▶  │  med/pdl/consumption    │               │
│  │ production  │  PUBLISH         │  med/pdl/production     │               │
│  │ tempo       │                  │  med/tempo/today        │               │
│  │ ecowatt     │                  │  med/ecowatt/today      │               │
│  └─────────────┘                  └─────────────────────────┘               │
│                                          │                                  │
│                                          ▼                                  │
│                                   ┌─────────────┐                           │
│                                   │ Subscribers │                           │
│                                   │ HA/NR/...   │                           │
│                                   └─────────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prérequis

1. Broker MQTT accessible (Mosquitto, EMQX, HiveMQ, etc.)
2. Accès réseau entre le client MyElectricalData et le broker

### Brokers recommandés

| Broker | Type | Notes |
|--------|------|-------|
| **Mosquitto** | Open-source | Léger, idéal pour Raspberry Pi |
| **EMQX** | Open-source | Scalable, UI admin |
| **HiveMQ** | Commercial | Cloud ou self-hosted |

---

## Configuration

### Via l'interface web

1. Aller dans **Exporter** > **MQTT**
2. Renseigner :
   - **Broker** : `mqtt://localhost:1883` ou `mqtt://user:pass@host:1883`
   - **Topic prefix** : `myelectricaldata` (optionnel)
   - **QoS** : 1 (recommandé)
   - **Retain** : Activé (recommandé)
3. Cliquer sur **Tester la connexion**
4. Si OK, activer l'export et **Sauvegarder**

### Via variables d'environnement

```bash
# .env.client

# Broker sans authentification
MQTT_BROKER=mqtt://localhost:1883

# Broker avec authentification
MQTT_BROKER=mqtt://user:password@mosquitto:1883

# Broker TLS
MQTT_BROKER=mqtts://broker.example.com:8883

# Configuration
MQTT_TOPIC_PREFIX=myelectricaldata
MQTT_QOS=1
MQTT_RETAIN=true
MQTT_ENABLED=true
```

---

## Topics publiés

### Structure des topics

```
{prefix}/{pdl}/consumption/daily
{prefix}/{pdl}/consumption/detailed
{prefix}/{pdl}/consumption/stats
{prefix}/{pdl}/production/daily
{prefix}/{pdl}/production/detailed
{prefix}/{pdl}/production/stats
{prefix}/tempo/today
{prefix}/tempo/tomorrow
{prefix}/tempo/remaining
{prefix}/ecowatt/today
{prefix}/status
```

### Consommation et production

`{prefix}/{pdl}/consumption/daily` (et `detailed`, `production/daily`, `production/detailed`) publie le
lot de relevés exporté :

```json
{"pdl": "12345678901234", "granularity": "daily", "records": 31, "data": [...], "timestamp": "2026-10-05T06:00:00"}
```

### Totaux et ventilation HP/HC

Le topic `{prefix}/{pdl}/consumption/stats` publie les totaux de consommation en kWh :
`yesterday_kwh`, `this_week_kwh`, `this_month_kwh` et `this_year_kwh`.

Pour un contrat à heures creuses disposant de données détaillées (30 min), il contient aussi
`{periode}_hp_kwh` et `{periode}_hc_kwh`, avec `{periode}` valant `yesterday`, `this_week`,
`this_month` ou `this_year` (par exemple `this_month_hp_kwh`).

`{prefix}/{pdl}/production/stats` publie les mêmes totaux pour la production.

### Tempo

| Topic | Payload | Description |
|-------|---------|-------------|
| `{prefix}/tempo/today` | `{"color": "BLUE", "date": "2026-10-05"}` | Couleur du jour (`BLUE`, `WHITE`, `RED` ou `UNKNOWN`) |
| `{prefix}/tempo/tomorrow` | `{"color": "WHITE", "date": "2026-10-06"}` | Couleur du lendemain |
| `{prefix}/tempo/remaining` | `{"blue": 280, "white": 43, "red": 22}` | Jours restants dans la saison (1er septembre au 31 août) |

### EcoWatt

| Topic | Payload | Description |
|-------|---------|-------------|
| `{prefix}/ecowatt/today` | `{"date": "2026-10-05", "level": 1, "level_label": "Vert", "next_hour_level": 1, "message": "...", "timestamp": "..."}` | Niveau de l'heure courante et de l'heure suivante (1 vert, 2 orange, 3 rouge) |

### Statut

`{prefix}/status` publie `{"status": "online", "last_export": "...", "pdls_exported": 2}` à chaque export.

---

## Home Assistant

Cet exporteur publie des topics bruts, sans MQTT Discovery. Pour que les capteurs soient créés
automatiquement dans Home Assistant, utiliser l'exporteur
[Home Assistant](home-assistant.md), qui publie la discovery sur le même broker.

---

## Intégration Node-RED

### Exemple de flow

```json
[
  {
    "id": "mqtt-in",
    "type": "mqtt in",
    "topic": "myelectricaldata/+/consumption/daily",
    "qos": "1",
    "datatype": "json"
  },
  {
    "id": "function",
    "type": "function",
    "func": "msg.payload.pdl = msg.topic.split('/')[1];\nreturn msg;"
  },
  {
    "id": "influxdb-out",
    "type": "influxdb out",
    "measurement": "consumption"
  }
]
```

### Monitoring avec Node-RED

```javascript
// Fonction pour calculer le coût
const consumption = msg.payload.value;
const tempoColor = global.get('tempo_color') || 'BLEU';

const prices = {
  BLEU: { hp: 0.1609, hc: 0.1296 },
  BLANC: { hp: 0.1894, hc: 0.1486 },
  ROUGE: { hp: 0.7324, hc: 0.1568 }
};

const price = prices[tempoColor].hp; // Simplification
msg.payload.cost = consumption * price;

return msg;
```

---

## QoS et Retain

### Niveaux de QoS

| QoS | Description | Recommandation |
|-----|-------------|----------------|
| 0 | At most once | Non recommandé (perte possible) |
| **1** | At least once | **Recommandé** (défaut) |
| 2 | Exactly once | Surcharge réseau |

### Retain

Avec `retain=true`, le dernier message est conservé par le broker. Les nouveaux subscribers reçoivent immédiatement la dernière valeur connue.

```bash
# Recommandé pour MyElectricalData
MQTT_RETAIN=true
```

---

## Sécurité

### Authentification

```bash
# Utilisateur/mot de passe
MQTT_BROKER=mqtt://user:password@broker:1883
```

### TLS/SSL

```bash
# Connexion chiffrée
MQTT_BROKER=mqtts://broker.example.com:8883

# Avec certificat client (optionnel)
MQTT_CA_CERT=/path/to/ca.crt
MQTT_CLIENT_CERT=/path/to/client.crt
MQTT_CLIENT_KEY=/path/to/client.key
```

---

## Dépannage

### Erreur "Connection refused"

- Vérifier que le broker est démarré : `docker logs mosquitto`
- Vérifier le port (1883 par défaut, 8883 pour TLS)
- Si le broker est sur l'hôte Docker, utiliser `host.docker.internal`

### Erreur "Not authorized"

- Vérifier les credentials dans l'URL
- Vérifier les ACL du broker (permissions par topic)
- Consulter les logs du broker

### Messages non reçus

- Vérifier le topic exact (attention aux `/` en début/fin)
- Utiliser un client MQTT pour débugger :
  ```bash
  mosquitto_sub -h localhost -t "myelectricaldata/#" -v
  ```

### Test avec Mosquitto

```bash
# Écouter tous les messages MyElectricalData
mosquitto_sub -h localhost -t "myelectricaldata/#" -v

# Publier un message de test
mosquitto_pub -h localhost -t "myelectricaldata/test" -m "Hello"
```

---

## Code source

L'exportateur MQTT est implémenté dans :

```
apps/api/src/services/exporters/mqtt.py
```

### Exemple de publication

```python
import aiomqtt

class MQTTExporter:
    async def publish(self, topic: str, payload: dict):
        async with aiomqtt.Client(
            hostname=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
        ) as client:
            await client.publish(
                topic=f"{self.prefix}/{topic}",
                payload=json.dumps(payload),
                qos=self.qos,
                retain=self.retain,
            )
```
