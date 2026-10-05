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
│  │ ecowatt     │                  │  med/ecowatt/current    │               │
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
{prefix}/{pdl}/consumption/monthly
{prefix}/{pdl}/production/daily
{prefix}/tempo/today
{prefix}/tempo/tomorrow
{prefix}/ecowatt/current
{prefix}/ecowatt/forecast
```

### Consommation

| Topic | Payload | Description |
|-------|---------|-------------|
| `med/{pdl}/consumption/daily` | `{"value": 15.2, "unit": "kWh", "date": "2024-01-15"}` | Conso journalière |
| `med/{pdl}/consumption/yesterday` | `{"value": 14.8, "unit": "kWh", "date": "2024-01-14"}` | Conso veille |
| `med/{pdl}/consumption/monthly` | `{"value": 245.6, "unit": "kWh", "month": "2024-01"}` | Conso mensuelle |

### Totaux et ventilation HP/HC

Le topic `{prefix}/{pdl}/consumption/stats` publie les totaux de consommation en kWh :
`yesterday_kwh`, `this_week_kwh`, `this_month_kwh` et `this_year_kwh`.

Pour un contrat à heures creuses disposant de données détaillées (30 min), il contient aussi
`{periode}_hp_kwh` et `{periode}_hc_kwh`, avec `{periode}` valant `yesterday`, `this_week`,
`this_month` ou `this_year` (par exemple `this_month_hp_kwh`).

### Production

| Topic | Payload | Description |
|-------|---------|-------------|
| `med/{pdl}/production/daily` | `{"value": 8.5, "unit": "kWh", "date": "2024-01-15"}` | Prod journalière |
| `med/{pdl}/production/monthly` | `{"value": 120.3, "unit": "kWh", "month": "2024-01"}` | Prod mensuelle |

### Tempo

| Topic | Payload | Description |
|-------|---------|-------------|
| `med/tempo/today` | `{"color": "BLEU", "date": "2024-01-15"}` | Couleur du jour |
| `med/tempo/tomorrow` | `{"color": "BLANC", "date": "2024-01-16"}` | Couleur demain |
| `med/tempo/remaining` | `{"blue": 280, "white": 40, "red": 20}` | Jours restants |

### EcoWatt

| Topic | Payload | Description |
|-------|---------|-------------|
| `med/ecowatt/current` | `{"level": 1, "message": "Consommation normale"}` | Niveau actuel |
| `med/ecowatt/forecast` | `[{"hour": 0, "level": 1}, ...]` | Prévisions 24h |

---

## Format des messages

### Payload JSON

Tous les messages sont publiés en JSON :

```json
{
  "value": 15.2,
  "unit": "kWh",
  "date": "2024-01-15",
  "pdl": "12345678901234",
  "quality": "CORRIGE",
  "timestamp": "2024-01-15T06:00:00+01:00"
}
```

### Home Assistant Discovery

L'exportateur supporte MQTT Discovery pour Home Assistant :

```json
// Topic: homeassistant/sensor/med_12345678901234_consumption/config
{
  "name": "Consommation journalière",
  "unique_id": "med_12345678901234_consumption_daily",
  "state_topic": "myelectricaldata/12345678901234/consumption/daily",
  "value_template": "{{ value_json.value }}",
  "unit_of_measurement": "kWh",
  "device_class": "energy",
  "state_class": "total_increasing",
  "device": {
    "identifiers": ["med_12345678901234"],
    "name": "MyElectricalData - Maison",
    "manufacturer": "MyElectricalData"
  }
}
```

Activer dans la configuration :

```bash
MQTT_HA_DISCOVERY=true
MQTT_HA_DISCOVERY_PREFIX=homeassistant
```

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
