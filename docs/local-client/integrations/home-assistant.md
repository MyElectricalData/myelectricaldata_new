# Intégration Home Assistant

## Vue d'ensemble

L'exporteur Home Assistant du mode client fonctionne selon deux modes, utilisables ensemble :

- **MQTT Discovery** : les capteurs (Linky, Tempo, EcoWatt) sont publiés sur un broker MQTT et créés
  automatiquement par l'intégration MQTT de Home Assistant.
- **Statistiques (API WebSocket)** : l'historique de consommation, de coût et de production est
  importé dans le recorder de Home Assistant pour le **panneau Énergie**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     INTÉGRATION HOME ASSISTANT                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MyElectricalData Client          Home Assistant                            │
│  ━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━                            │
│                                                                             │
│  ┌─────────────┐   MQTT Discovery   ┌─────────────────────────────────┐     │
│  │ PostgreSQL  │──── (broker) ────▶ │ sensor.myelectricaldata_linky_* │     │
│  │             │                    │ sensor.myelectricaldata_tempo_* │     │
│  │ consumption │                    │ sensor.myelectricaldata_ecowatt*│     │
│  │ production  │   API WebSocket    ├─────────────────────────────────┤     │
│  │ tempo       │──────────────────▶ │ Panneau Énergie (statistiques)  │     │
│  │ ecowatt     │                    │ myelectricaldata:consumption_*  │     │
│  └─────────────┘                    └─────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prérequis

- **MQTT Discovery** : un broker MQTT (par exemple l'add-on Mosquitto) et l'intégration MQTT de Home
  Assistant configurée sur ce broker.
- **Statistiques** : un token d'accès longue durée et un accès réseau à Home Assistant.

### Créer un token d'accès

1. Dans Home Assistant, aller dans votre **Profil** (clic sur votre nom en bas à gauche)
2. Onglet **Sécurité**, section **Tokens d'accès longue durée**
3. Cliquer sur **Créer un token**, le nommer (ex. « MyElectricalData »)
4. **Copier immédiatement** le token (il ne sera plus affiché)

---

## Configuration

Dans l'interface web : **Exporter** > **Home Assistant**.

| Champ | Défaut | Description |
|-------|--------|-------------|
| `mqtt_broker`, `mqtt_port` | `1883` | Broker MQTT (ex. `core-mosquitto`) |
| `mqtt_username`, `mqtt_password` | | Identifiants du broker (facultatifs) |
| `mqtt_use_tls` | `false` | Connexion TLS au broker |
| `discovery_prefix` | `homeassistant` | Préfixe de discovery de **votre** intégration MQTT |
| `entity_prefix` | `myelectricaldata` | Préfixe d'identifiant. Les capteurs publiés gardent pour l'instant le préfixe `myelectricaldata` |
| `ha_url`, `ha_token` | | Home Assistant et token, pour les statistiques |
| `statistic_id_prefix` | `myelectricaldata` | Préfixe des statistiques du panneau Énergie |

### Préfixe de discovery personnalisé

`discovery_prefix` doit être celui de l'intégration MQTT de Home Assistant (Paramètres > Appareils et
services > MQTT > Configurer > Options). S'il ne correspond pas, les messages sont bien publiés mais
Home Assistant ne crée aucune entité.

Avec un préfixe autre que `homeassistant`, les versions précédentes publiaient aussi une copie de chaque
configuration sous `homeassistant/`. Cette copie n'est plus publiée, et l'export vide celle qui était
restée retenue sur le broker.

> **Avant la mise à jour**, si vous avez changé `discovery_prefix` : vérifiez qu'il est bien celui de
> l'intégration MQTT de Home Assistant. Si Home Assistant écoute encore `homeassistant/`, ses entités
> MyElectricalData n'existaient que grâce à la copie : le premier export les supprime (avec leurs
> personnalisations). Alignez `discovery_prefix` sur Home Assistant, et elles sont recréées.

---

## Entités créées

### Identifiant des entités (`entity_id`)

Chaque entité est créée avec l'`entity_id` `sensor.<unique_id>`, par exemple
`sensor.myelectricaldata_linky_12345678901234_consumption`. Ce sont les identifiants listés ci-dessous
et affichés par la page Home Assistant de l'interface.

> **Installation antérieure.** Home Assistant ne fixe l'`entity_id` qu'à la première découverte.
> Les entités créées avant cette version gardent l'identifiant que Home Assistant avait dérivé du nom
> de l'appareil et du capteur, par exemple `sensor.linky_12345678901234_consumption`. Pour les aligner,
> renommez-les dans Paramètres > Entités (l'historique est conservé), ou supprimez-les puis relancez
> un export.

L'identifiant suggéré passe par `default_entity_id` (Home Assistant 2025.10 et plus) et par
`object_id` (versions antérieures).

### Linky (appareil « Linky {pdl} »)

| Entity ID | Unité | Description |
|-----------|-------|-------------|
| `sensor.myelectricaldata_linky_{pdl}_consumption` | kWh | Consommation de la veille, historique en attributs (compatible content-card-linky) |
| `sensor.myelectricaldata_linky_{pdl}_consumption_last7day` | kWh | Total des 7 derniers jours |
| `sensor.myelectricaldata_linky_{pdl}_consumption_last14day` | kWh | Total des 14 derniers jours |
| `sensor.myelectricaldata_linky_{pdl}_consumption_last30day` | kWh | Total des 30 derniers jours |
| `sensor.myelectricaldata_linky_{pdl}_production` | kWh | Production de la veille, historique en attributs |
| `sensor.myelectricaldata_linky_{pdl}_production_last{7,14,30}day` | kWh | Totaux de production |

### Heures pleines / heures creuses

Pour un contrat à heures creuses, l'export publie en plus 8 capteurs (`kWh`, classe `energy`, `total`),
calculés à partir des données détaillées (30 min) :

| Entity ID | Description |
|-----------|-------------|
| `sensor.myelectricaldata_linky_{pdl}_consumption_{periode}_hp` | Consommation en heures pleines |
| `sensor.myelectricaldata_linky_{pdl}_consumption_{periode}_hc` | Consommation en heures creuses |

`{periode}` vaut `yesterday`, `this_week`, `this_month` ou `this_year`.

Les offres suivantes sont ventilées en heures pleines / heures creuses : `HC_HP`, `HC_WEEKEND`,
`HC_NUIT_WEEKEND`, `WEEKEND`, `EJP`, `SEASONAL`, `ZEN_FLEX`. `HC_NUIT_WEEKEND` compte le samedi et le
dimanche entièrement en heures creuses. `TEMPO` garde ses 6 séries (couleur x période) et `BASE` une
seule série. Les plages d'heures creuses sont celles du contrat Enedis. À défaut, le panneau Énergie
utilise 22h-6h. Aucun capteur HP/HC n'est publié pour une offre BASE.

Exception : avec l'offre EDF Zen Flex sélectionnée sur le PDL, les heures creuses suivent la grille
du fournisseur, 17 h par jour, tous les jours (13h-18h et 20h-6h), et non les plages du contrat
Enedis. Si l'offre définit ses propres plages (`hc_schedules`), ce sont elles qui s'appliquent.

> **Mise à jour depuis une version antérieure.** Un contrat à heures creuses était auparavant exporté
> en une seule série (`<prefix>:consumption_<pdl>_base`). Il l'est désormais en deux séries
> (`<prefix>:consumption_<pdl>_hc` et `_hp`). Lancez un import complet des statistiques, puis
> reconfigurez le panneau Énergie avec ces deux séries : l'ancienne série `_base` n'est plus alimentée.

### Tempo (appareils « RTE Tempo » et « EDF Tempo »)

| Entity ID | Valeurs | Description |
|-----------|---------|-------------|
| `sensor.myelectricaldata_tempo_today` | `BLUE` / `WHITE` / `RED` / `Inconnu` | Couleur du jour (`color_fr` en attribut) |
| `sensor.myelectricaldata_tempo_tomorrow` | `BLUE` / `WHITE` / `RED` / `Inconnu` | Couleur du lendemain |
| `sensor.myelectricaldata_tempo_days_{blue,white,red}` | jours | Jours consommés dans la saison |
| `sensor.myelectricaldata_tempo_info` | | Synthèse de la saison en attributs |
| `sensor.myelectricaldata_tempo_price_{couleur}_{hc,hp}` | EUR/kWh | Prix Tempo (ex. `price_red_hp`) |

### Zen Flex (appareil « EDF Zen Flex »)

Calendrier de l'offre EDF Zen Week-End Option Flex, publié pour tous (comme Tempo), que le PDL ait
cette offre ou non.

| Entity ID | Valeurs | Description |
|-----------|---------|-------------|
| `sensor.myelectricaldata_zen_flex_today` | `ECO` / `SOBRIETE` / `BONUS` / `unknown` | Type du jour (`day_type_fr` et `date` en attributs) |
| `sensor.myelectricaldata_zen_flex_tomorrow` | `ECO` / `SOBRIETE` / `BONUS` / `unknown` | Type du lendemain, `unknown` tant qu'EDF ne l'a pas publié |

`unknown` signale un jour absent du calendrier : il n'est jamais supposé Éco.

### EcoWatt (appareil « RTE EcoWatt »)

| Entity ID | Valeurs | Description |
|-----------|---------|-------------|
| `sensor.myelectricaldata_ecowatt_j0` | 1 / 2 / 3 | Signal du jour, valeurs horaires en attributs |
| `sensor.myelectricaldata_ecowatt_j1` | 1 / 2 / 3 | Signal du lendemain |
| `sensor.myelectricaldata_ecowatt_j2` | 1 / 2 / 3 | Signal du surlendemain |

---

## Panneau Énergie (statistiques)

L'import WebSocket alimente des statistiques externes, à sélectionner dans Paramètres > Tableaux de
bord > Énergie :

| Statistique | Description |
|-------------|-------------|
| `<prefix>:consumption_<pdl>_<série>` | Consommation par série (`base`, `hc`/`hp`, ou les 6 séries Tempo) |
| `<prefix>:cost_<pdl>_<série>` | Coût de la série, en EUR |
| `<prefix>:production_<pdl>` | Production |

Le coût utilise l'offre sélectionnée sur le PDL :

- `SEASONAL` : prix d'hiver de novembre à mars, prix d'été d'avril à octobre ;
- `HC_WEEKEND`, `WEEKEND`, `BASE_WEEKEND` : prix week-end le samedi et le dimanche (prix de semaine
  s'il n'est pas renseigné) ;
- `TEMPO` : prix de la couleur et de la période ;
- EDF Zen Flex (`ZEN_FLEX`, ou offre nommée « Option Flex ») : prix Sobriété les jours Sobriété, prix
  Éco les jours Éco et Bonus, d'après le calendrier synchronisé (la remise éventuelle des jours Bonus
  n'est pas modélisée). Les prix Éco et Sobriété sont rangés dans les champs d'hiver et d'été de
  l'offre : la saison au prix HP le plus élevé est la Sobriété. Un jour absent du calendrier, ou des
  prix HP identiques, laissent la série sans coût plutôt qu'avec un coût faux ;
- autres offres : prix unique de la série.

---

## Exemples

### Carte d'entités

```yaml
type: entities
title: MyElectricalData
entities:
  - entity: sensor.myelectricaldata_linky_12345678901234_consumption
    name: Consommation d'hier
  - entity: sensor.myelectricaldata_linky_12345678901234_consumption_this_month_hc
    name: Heures creuses du mois
  - entity: sensor.myelectricaldata_tempo_today
    name: Tempo
  - entity: sensor.myelectricaldata_ecowatt_j0
    name: EcoWatt
```

### Notification Tempo rouge

```yaml
automation:
  - alias: "Alerte Tempo rouge"
    trigger:
      - platform: state
        entity_id: sensor.myelectricaldata_tempo_tomorrow
        to: "RED"
    action:
      - service: notify.mobile_app
        data:
          title: "Tempo rouge demain"
          message: "Pensez à réduire votre consommation."
```

### Signal EcoWatt rouge

```yaml
automation:
  - alias: "EcoWatt rouge : réduire le chauffage"
    trigger:
      - platform: state
        entity_id: sensor.myelectricaldata_ecowatt_j0
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

### Aucune entité créée

- Vérifier que `discovery_prefix` est celui de l'intégration MQTT de Home Assistant
- Écouter le broker : `mosquitto_sub -v -t '<discovery_prefix>/sensor/#'` doit montrer les
  configurations `.../config` retenues
- Vérifier que l'intégration MQTT de Home Assistant est connectée au même broker

### Les identifiants ne correspondent pas à la documentation

Les entités créées par une version antérieure gardent leur ancien `entity_id` (voir
[Identifiant des entités](#identifiant-des-entités-entity_id)).

### Panneau Énergie vide ou sans coût

- Vérifier `ha_url` et `ha_token` (erreur 401 : token invalide ou expiré)
- Sans offre sélectionnée sur le PDL, aucune statistique de coût n'est importée
- Relancer un import complet des statistiques après un changement d'offre

---

## Code source

```
apps/api/src/services/exporters/home_assistant.py
```
