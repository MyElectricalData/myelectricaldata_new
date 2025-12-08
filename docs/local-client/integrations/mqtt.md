---
sidebar_position: 2
title: MQTT
---

# Intégration MQTT

Le client local peut publier vos données de consommation et production sur un broker MQTT, permettant l'intégration avec n'importe quel système domotique compatible.

## Configuration

### Configuration de base

```yaml
mqtt:
  enabled: true
  host: "localhost"
  port: 1883
  username: "mqtt_user"
  password: "mqtt_password"
  topic_prefix: "myelectricaldata"
  qos: 1
  retain: true
```

### Avec TLS/SSL

```yaml
mqtt:
  enabled: true
  host: "mqtt.example.com"
  port: 8883
  username: "mqtt_user"
  password: "mqtt_password"

  tls: true
  ca_cert: "/config/certs/ca.crt"
  client_cert: "/config/certs/client.crt"
  client_key: "/config/certs/client.key"
```

### Variables d'environnement

```bash
MQTT_ENABLED=true
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USERNAME=mqtt_user
MQTT_PASSWORD=mqtt_password
MQTT_TOPIC_PREFIX=myelectricaldata
MQTT_QOS=1
MQTT_RETAIN=true
MQTT_TLS=false
```

## Structure des topics

### Topics de données

```
{prefix}/{pdl}/consumption/daily           # Consommation journalière
{prefix}/{pdl}/consumption/daily/hc        # Heures creuses
{prefix}/{pdl}/consumption/daily/hp        # Heures pleines
{prefix}/{pdl}/consumption/month           # Consommation mensuelle
{prefix}/{pdl}/consumption/year            # Consommation annuelle
{prefix}/{pdl}/consumption/detailed        # Données 30 min (JSON)
{prefix}/{pdl}/max_power                   # Puissance max quotidienne
{prefix}/{pdl}/production/daily            # Production journalière
{prefix}/{pdl}/production/month            # Production mensuelle
{prefix}/{pdl}/production/year             # Production annuelle
{prefix}/{pdl}/production/detailed         # Données 30 min (JSON)
{prefix}/status                            # Statut du client
```

### Exemple avec le préfixe par défaut

```
myelectricaldata/12345678901234/consumption/daily
myelectricaldata/12345678901234/production/daily
myelectricaldata/status
```

## Formats de messages

### Format simple (valeur uniquement)

```yaml
mqtt:
  format: "simple"
```

Messages publiés :

```
myelectricaldata/12345678901234/consumption/daily → 15.234
myelectricaldata/12345678901234/max_power → 6.5
```

### Format JSON (recommandé)

```yaml
mqtt:
  format: "json"
```

Messages publiés :

```json
// Topic: myelectricaldata/12345678901234/consumption/daily
{
  "value": 15.234,
  "unit": "kWh",
  "timestamp": "2024-01-15T10:30:00Z",
  "pdl": "12345678901234",
  "date": "2024-01-15",
  "tariff": "HC/HP",
  "hc": 8.5,
  "hp": 6.734
}
```

```json
// Topic: myelectricaldata/12345678901234/consumption/detailed
{
  "date": "2024-01-15",
  "pdl": "12345678901234",
  "interval": "30min",
  "data": [
    {"time": "00:00", "value": 0.234},
    {"time": "00:30", "value": 0.198},
    {"time": "01:00", "value": 0.187},
    // ... 48 valeurs pour la journée
  ]
}
```

```json
// Topic: myelectricaldata/status
{
  "status": "ok",
  "last_sync": "2024-01-15T10:30:00Z",
  "next_sync": "2024-01-15T11:30:00Z",
  "pdl_count": 1,
  "errors": []
}
```

## Topics de commande

Le client écoute également des topics pour recevoir des commandes :

```
{prefix}/command/sync          # Forcer une synchronisation
{prefix}/command/reload        # Recharger la configuration
```

### Forcer une synchronisation

```bash
mosquitto_pub -h localhost -t "myelectricaldata/command/sync" -m ""
```

## Exemples d'utilisation

### Mosquitto (ligne de commande)

```bash
# S'abonner à toutes les données
mosquitto_sub -h localhost -u user -P password -t "myelectricaldata/#" -v

# S'abonner à la consommation d'un PDL
mosquitto_sub -h localhost -t "myelectricaldata/12345678901234/consumption/#" -v

# Publier une commande de sync
mosquitto_pub -h localhost -t "myelectricaldata/command/sync" -m ""
```

### Node-RED

```json
[
  {
    "id": "mqtt_linky",
    "type": "mqtt in",
    "topic": "myelectricaldata/+/consumption/daily",
    "qos": "1",
    "datatype": "json",
    "broker": "mqtt_broker"
  },
  {
    "id": "process_data",
    "type": "function",
    "func": "msg.payload = {\n  pdl: msg.topic.split('/')[1],\n  consumption: msg.payload.value,\n  timestamp: msg.payload.timestamp\n};\nreturn msg;",
    "wires": [["output"]]
  }
]
```

### Python (paho-mqtt)

```python
import json
import paho.mqtt.client as mqtt

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = json.loads(msg.payload.decode())

    if "consumption/daily" in topic:
        pdl = topic.split("/")[1]
        print(f"PDL {pdl}: {payload['value']} kWh")

client = mqtt.Client()
client.username_pw_set("user", "password")
client.on_message = on_message

client.connect("localhost", 1883)
client.subscribe("myelectricaldata/#")
client.loop_forever()
```

### Home Assistant (configuration manuelle)

Si vous n'utilisez pas MQTT Discovery :

```yaml
# configuration.yaml
mqtt:
  sensor:
    - name: "Consommation Linky"
      state_topic: "myelectricaldata/12345678901234/consumption/daily"
      value_template: "{{ value_json.value }}"
      unit_of_measurement: "kWh"
      device_class: energy
      state_class: total_increasing

    - name: "Production Solaire"
      state_topic: "myelectricaldata/12345678901234/production/daily"
      value_template: "{{ value_json.value }}"
      unit_of_measurement: "kWh"
      device_class: energy
      state_class: total_increasing
```

## Brokers MQTT populaires

### Mosquitto (Docker)

```yaml
# docker-compose.yml
services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
      - ./mosquitto/log:/mosquitto/log
```

```conf
# mosquitto/config/mosquitto.conf
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
```

### EMQX

```yaml
services:
  emqx:
    image: emqx/emqx:latest
    ports:
      - "1883:1883"
      - "8083:8083"
      - "18083:18083"
    environment:
      - EMQX_ALLOW_ANONYMOUS=false
```

### Home Assistant Mosquitto Add-on

1. **Paramètres** → **Modules complémentaires**
2. Installez **Mosquitto broker**
3. Configurez un utilisateur dans **Configuration**
4. Utilisez `core-mosquitto` comme hôte dans le client local

## Qualité de Service (QoS)

| QoS | Description | Recommandation |
|-----|-------------|----------------|
| 0 | Au plus une fois (fire and forget) | Non recommandé |
| 1 | Au moins une fois (confirmé) | **Recommandé** |
| 2 | Exactement une fois (garanti) | Overhead important |

## Rétention des messages

Avec `retain: true`, le broker conserve le dernier message de chaque topic. Les nouveaux abonnés reçoivent immédiatement les dernières valeurs.

```yaml
mqtt:
  retain: true  # Recommandé pour les valeurs de consommation
```

## Dépannage

### Impossible de se connecter

```bash
# Tester la connexion
mosquitto_pub -h localhost -p 1883 -u user -P password -t "test" -m "hello"

# Vérifier les logs du broker
docker logs mosquitto
```

### Messages non reçus

1. Vérifiez que le topic correspond exactement
2. Vérifiez le QoS des abonnements
3. Activez les logs debug :
   ```yaml
   logging:
     level: DEBUG
   ```

### Authentification échouée

```bash
# Créer un utilisateur Mosquitto
docker exec mosquitto mosquitto_passwd -c /mosquitto/config/passwd username
```

## Ressources

- [Mosquitto Documentation](https://mosquitto.org/documentation/)
- [MQTT Specification](https://mqtt.org/mqtt-specification/)
- [Home Assistant MQTT](https://www.home-assistant.io/integrations/mqtt/)
