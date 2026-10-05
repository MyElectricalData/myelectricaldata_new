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

Dans l'interface web : **Exporter** > **MQTT**, puis **Tester la connexion** et **Sauvegarder**.
L'export se lance depuis cette page (les exports MQTT ne sont pas encore planifiés).

| Champ | Défaut | Description |
|-------|--------|-------------|
| `broker` | | Nom d'hôte ou IP du broker (ex. `mosquitto`, `192.168.1.10`), sans `mqtt://` |
| `port` | `1883` | Port du broker (8883 en TLS en général) |
| `username`, `password` | | Identifiants (facultatifs) |
| `use_tls` | `false` | Connexion TLS |
| `topic_prefix` | `myelectricaldata` | Préfixe des topics |
| `qos` | `0` | Niveau de QoS (0, 1 ou 2) |
| `retain` | `true` | Messages retenus par le broker |

---

## Topics publiés

### Structure des topics

```
{prefix}/{pdl}/consumption/stats
{prefix}/{pdl}/production/stats
{prefix}/tempo/today
{prefix}/tempo/tomorrow
{prefix}/tempo/remaining
{prefix}/ecowatt/today
{prefix}/status
```

### Totaux et ventilation HP/HC

Le topic `{prefix}/{pdl}/consumption/stats` publie les totaux de consommation en kWh :
`yesterday_kwh`, `this_week_kwh`, `this_month_kwh` et `this_year_kwh`.

Pour un contrat à heures creuses disposant de données détaillées (30 min), il contient aussi
`{periode}_hp_kwh` et `{periode}_hc_kwh`, avec `{periode}` valant `yesterday`, `this_week`,
`this_month` ou `this_year` (par exemple `this_month_hp_kwh`).

`{prefix}/{pdl}/production/stats` publie `yesterday_kwh`, `this_month_kwh` et `this_year_kwh` pour la production.

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
    "topic": "myelectricaldata/+/consumption/stats",
    "qos": "0",
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
// Coût approximatif de la veille (topic {prefix}/{pdl}/consumption/stats)
const consumption = msg.payload.yesterday_kwh;
const tempoColor = global.get('tempo_color') || 'BLUE'; // payload.color de {prefix}/tempo/today

const prices = {
  BLUE: { hp: 0.1609, hc: 0.1296 },
  WHITE: { hp: 0.1894, hc: 0.1486 },
  RED: { hp: 0.7324, hc: 0.1568 }
};

const price = prices[tempoColor].hp; // Simplification
msg.payload.cost = consumption * price;

return msg;
```

---

## QoS et Retain

| QoS | Description |
|-----|-------------|
| **0** | Au plus une fois (défaut) |
| 1 | Au moins une fois |
| 2 | Exactement une fois |

Avec `retain` activé (défaut), le broker conserve le dernier message de chaque topic : un nouvel
abonné reçoit immédiatement la dernière valeur connue.

---

## Sécurité

- **Authentification** : renseigner `username` et `password`.
- **TLS** : activer `use_tls` et utiliser le port TLS du broker (souvent 8883). Les certificats
  clients ne sont pas pris en charge.

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
