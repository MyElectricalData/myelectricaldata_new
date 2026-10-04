# Intégration Home Assistant

## Vue d'ensemble

L'intégration Home Assistant permet d'exporter vos données de consommation et production directement vers votre instance Home Assistant via l'API REST.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     INTÉGRATION HOME ASSISTANT                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MyElectricalData Client          Home Assistant                            │
│  ━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━                            │
│                                                                             │
│  ┌─────────────┐                  ┌─────────────────────────┐               │
│  │ PostgreSQL  │                  │  Entities               │               │
│  │             │                  │                         │               │
│  │ consumption │───────────────▶  │  sensor.med_xxx_conso   │               │
│  │ production  │  POST /api/      │  sensor.med_xxx_prod    │               │
│  │ tempo       │  states/...      │  sensor.med_tempo       │               │
│  │ ecowatt     │                  │  sensor.med_ecowatt     │               │
│  └─────────────┘                  └─────────────────────────┘               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prérequis

1. Home Assistant 2023.1 ou supérieur
2. Token d'accès longue durée (Long-Lived Access Token)
3. Accès réseau entre le client MyElectricalData et Home Assistant

### Créer un token d'accès

1. Dans Home Assistant, aller dans votre **Profil** (clic sur votre nom en bas à gauche)
2. Scroller jusqu'à **Tokens d'accès longue durée**
3. Cliquer sur **Créer un token**
4. Nommer le token (ex: "MyElectricalData")
5. **Copier immédiatement** le token (il ne sera plus affiché)

---

## Configuration

### Via l'interface web

1. Aller dans **Exporter** > **Home Assistant**
2. Renseigner :
   - **URL** : `http://homeassistant.local:8123` (ou IP)
   - **Token** : Le token longue durée créé précédemment
3. Cliquer sur **Tester la connexion**
4. Si OK, activer l'export et **Sauvegarder**

### Via variables d'environnement

```bash
# .env.client
HOMEASSISTANT_URL=http://192.168.1.100:8123
HOMEASSISTANT_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
HOMEASSISTANT_ENABLED=true
HOMEASSISTANT_INTERVAL=60
```

---

## Entités créées

### Consommation

| Entity ID | Nom | Unité | Description |
|-----------|-----|-------|-------------|
| `sensor.med_{pdl}_consumption_daily` | Conso journalière | kWh | Consommation du jour |
| `sensor.med_{pdl}_consumption_yesterday` | Conso hier | kWh | Consommation de la veille |
| `sensor.med_{pdl}_consumption_monthly` | Conso mensuelle | kWh | Consommation du mois en cours |
| `sensor.med_{pdl}_consumption_yearly` | Conso annuelle | kWh | Consommation de l'année |

### Heures pleines / heures creuses

Pour un contrat à heures creuses, l'export publie en plus 8 capteurs (`kWh`, classe `energy`, `total`),
calculés à partir des données détaillées (30 min) :

| Entity ID (nom HA) | Description |
|--------------------|-------------|
| `sensor.linky_{pdl}_consumption_{periode}_hp` | Consommation en heures pleines |
| `sensor.linky_{pdl}_consumption_{periode}_hc` | Consommation en heures creuses |

`{periode}` vaut `yesterday`, `this_week`, `this_month` ou `this_year`. Le nom exact de l'entité est
construit par Home Assistant à partir de l'appareil (`Linky {pdl}`) et du nom du capteur.

Les offres suivantes sont ventilées en heures pleines / heures creuses : `HC_HP`, `HC_WEEKEND`,
`HC_NUIT_WEEKEND`, `WEEKEND`, `EJP`, `SEASONAL`, `ZEN_FLEX`. `HC_NUIT_WEEKEND` compte le samedi et le
dimanche entièrement en heures creuses. `TEMPO` garde ses 6 séries (couleur x période) et `BASE` une
seule série. Les plages d'heures creuses sont celles du contrat Enedis. À défaut, le panneau Énergie
utilise 22h-6h. Aucun capteur HP/HC n'est publié pour une offre BASE.

> **Mise à jour depuis une version antérieure.** Un contrat à heures creuses était auparavant exporté
> en une seule série (`<prefix>:consumption_<pdl>_base`). Il l'est désormais en deux séries
> (`<prefix>:consumption_<pdl>_hc` et `_hp`). Lancez un import complet des statistiques, puis
> reconfigurez le panneau Énergie avec ces deux séries : l'ancienne série `_base` n'est plus alimentée.

### Production

| Entity ID | Nom | Unité | Description |
|-----------|-----|-------|-------------|
| `sensor.med_{pdl}_production_daily` | Prod journalière | kWh | Production du jour |
| `sensor.med_{pdl}_production_yesterday` | Prod hier | kWh | Production de la veille |
| `sensor.med_{pdl}_production_monthly` | Prod mensuelle | kWh | Production du mois |

### Tempo

| Entity ID | Nom | Valeurs | Description |
|-----------|-----|---------|-------------|
| `sensor.med_tempo_today` | Tempo aujourd'hui | BLEU/BLANC/ROUGE | Couleur du jour |
| `sensor.med_tempo_tomorrow` | Tempo demain | BLEU/BLANC/ROUGE/INCONNU | Couleur de demain |
| `sensor.med_tempo_remaining_blue` | Jours bleus restants | 0-300 | Compteur saison |
| `sensor.med_tempo_remaining_white` | Jours blancs restants | 0-43 | Compteur saison |
| `sensor.med_tempo_remaining_red` | Jours rouges restants | 0-22 | Compteur saison |

### EcoWatt

| Entity ID | Nom | Valeurs | Description |
|-----------|-----|---------|-------------|
| `sensor.med_ecowatt_current` | EcoWatt actuel | 1/2/3 | Niveau actuel |
| `sensor.med_ecowatt_next_hour` | EcoWatt +1h | 1/2/3 | Prévision |
| `binary_sensor.med_ecowatt_alert` | Alerte EcoWatt | on/off | Alerte niveau 2+ |

---

## Attributs des entités

Chaque entité inclut des attributs supplémentaires :

```yaml
# sensor.med_12345678901234_consumption_daily
state: 15.2
attributes:
  unit_of_measurement: kWh
  device_class: energy
  state_class: total_increasing
  last_updated: "2024-01-15T06:00:00+01:00"
  pdl: "12345678901234"
  quality: "CORRIGE"
  source: "myelectricaldata"
  friendly_name: "Consommation journalière - Maison"
```

---

## Dashboard Lovelace

### Carte énergie native

L'intégration est compatible avec le dashboard Énergie de Home Assistant :

```yaml
# configuration.yaml
energy:
  solar_panels:
    - entity_id: sensor.med_12345678901234_production_daily
  grid_consumption:
    - entity_id: sensor.med_12345678901234_consumption_daily
```

### Carte personnalisée

```yaml
# Exemple de carte Lovelace
type: entities
title: MyElectricalData
entities:
  - entity: sensor.med_12345678901234_consumption_daily
    name: Consommation aujourd'hui
  - entity: sensor.med_12345678901234_production_daily
    name: Production aujourd'hui
  - entity: sensor.med_tempo_today
    name: Tempo
  - entity: sensor.med_ecowatt_current
    name: EcoWatt
```

### Carte Tempo colorée

```yaml
type: custom:mushroom-template-card
primary: Tempo
secondary: >
  {{ states('sensor.med_tempo_today') }}
icon: mdi:calendar-today
icon_color: >
  {% set color = states('sensor.med_tempo_today') %}
  {% if color == 'BLEU' %}blue
  {% elif color == 'BLANC' %}white
  {% elif color == 'ROUGE' %}red
  {% else %}grey{% endif %}
```

---

## Automatisations

### Notification Tempo Rouge

```yaml
automation:
  - alias: "Alerte Tempo Rouge"
    trigger:
      - platform: state
        entity_id: sensor.med_tempo_tomorrow
        to: "ROUGE"
    action:
      - service: notify.mobile_app
        data:
          title: "⚠️ Tempo Rouge demain"
          message: "Pensez à réduire votre consommation !"
```

### Coupure chauffage EcoWatt

```yaml
automation:
  - alias: "EcoWatt Alerte - Réduire chauffage"
    trigger:
      - platform: state
        entity_id: sensor.med_ecowatt_current
        to: "3"
    action:
      - service: climate.set_temperature
        target:
          entity_id: climate.chauffage_salon
        data:
          temperature: 18
```

---

## Dépannage

### Erreur "401 Unauthorized"

- Vérifier que le token est valide et non expiré
- Créer un nouveau token si nécessaire
- Vérifier que l'utilisateur Home Assistant a les droits administrateur

### Erreur "Connection refused"

- Vérifier que l'URL est correcte
- Si Home Assistant est sur l'hôte Docker, utiliser `host.docker.internal:8123`
- Vérifier les règles firewall

### Entités non créées

- Vérifier les logs Home Assistant : Paramètres > Système > Journaux
- Les entités apparaissent après le premier export réussi
- Chercher "myelectricaldata" dans les logs

### Données non mises à jour

- Vérifier que l'export est activé
- Consulter l'historique des exports dans l'interface
- Forcer un export manuel : bouton "Exporter maintenant"

---

## Code source

L'exportateur Home Assistant est implémenté dans :

```
apps/api/src/services/exporters/home_assistant.py
```

### Exemple d'appel API

```python
# POST vers Home Assistant
async def export_sensor(self, entity_id: str, state: Any, attributes: dict):
    url = f"{self.base_url}/api/states/{entity_id}"
    headers = {
        "Authorization": f"Bearer {self.token}",
        "Content-Type": "application/json",
    }
    payload = {
        "state": state,
        "attributes": attributes,
    }
    async with self.session.post(url, json=payload, headers=headers) as resp:
        return resp.status == 200 or resp.status == 201
```
