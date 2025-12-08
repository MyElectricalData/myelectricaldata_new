---
sidebar_position: 5
title: Exporteurs
---

# Page Exporteurs

La page **Exporteurs** (`/exporters`) est une fonctionnalité exclusive du client local. Elle offre une interface graphique pour configurer tous vos exports vers les systèmes domotiques, sans avoir à éditer manuellement les fichiers de configuration.

## Accès

```
http://localhost:8080/exporters
```

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│  Exporteurs                                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐ ┌──────┐ ┌───────────────┐ ┌──────────┐ ┌────────┐ │
│  │ Home       │ │ MQTT │ │ VictoriaMetrics│ │Prometheus│ │ Jeedom │ │
│  │ Assistant  │ │      │ │               │ │          │ │        │ │
│  └────────────┘ └──────┘ └───────────────┘ └──────────┘ └────────┘ │
│       ▲                                                              │
│       │ (onglet actif)                                              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Configuration de l'exporteur sélectionné]                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Exporteurs disponibles

### Home Assistant

Configuration de l'intégration Home Assistant via MQTT Discovery.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Home Assistant                                    Statut: ● Actif  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Général ──────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Activer l'exporteur      [✓]                                  │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ MQTT Discovery ───────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Activer Discovery        [✓]                                  │ │
│  │  Préfixe Discovery        [homeassistant_____________]         │ │
│  │  Préfixe entités          [myelectricaldata__________]         │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Energy Dashboard ─────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Compatible Energy        [✓]    Ajoute les device_class et   │ │
│  │                                  state_class appropriés        │ │
│  │                                                                 │ │
│  │  Statistiques long terme  [✓]    Historique illimité          │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Connexion MQTT ───────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Hôte         [core-mosquitto_____]  Port    [1883__]          │ │
│  │  Utilisateur  [________________]     Mot de passe [********]   │ │
│  │  TLS/SSL      [ ]                                               │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Tester la connexion]              [Sauvegarder]   [Réinitialiser] │
│                                                                      │
│  ┌─ Entités créées ───────────────────────────────────────────────┐ │
│  │  sensor.med_12345678901234_consumption_daily          ● Actif  │ │
│  │  sensor.med_12345678901234_consumption_hc             ● Actif  │ │
│  │  sensor.med_12345678901234_consumption_hp             ● Actif  │ │
│  │  sensor.med_12345678901234_production_daily           ● Actif  │ │
│  │  sensor.med_12345678901234_max_power                  ● Actif  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Options :**
- Activer/désactiver l'exporteur
- Configuration MQTT Discovery (préfixe, entités)
- Compatibilité Energy Dashboard
- Statistiques long terme
- Connexion au broker MQTT
- Visualisation des entités créées

➡️ [Documentation complète Home Assistant](./integrations/home-assistant)

---

### MQTT

Configuration de la publication MQTT générique.

```
┌─────────────────────────────────────────────────────────────────────┐
│  MQTT                                              Statut: ● Actif  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Général ──────────────────────────────────────────────────────┐ │
│  │  Activer l'exporteur      [✓]                                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Broker ───────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Hôte         [localhost__________]  Port    [1883__]          │ │
│  │  Utilisateur  [________________]     Mot de passe [********]   │ │
│  │                                                                 │ │
│  │  TLS/SSL      [ ]                                               │ │
│  │  Certificat CA    [Parcourir...]                               │ │
│  │  Certificat client [Parcourir...]                              │ │
│  │  Clé client        [Parcourir...]                              │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Topics ───────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Préfixe topics   [myelectricaldata______]                     │ │
│  │                                                                 │ │
│  │  Structure:                                                     │ │
│  │  {prefix}/{pdl}/consumption/daily                              │ │
│  │  {prefix}/{pdl}/consumption/hc                                 │ │
│  │  {prefix}/{pdl}/consumption/hp                                 │ │
│  │  {prefix}/{pdl}/production/daily                               │ │
│  │  {prefix}/status                                                │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Options ──────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Format messages   (●) JSON   ( ) Simple (valeur uniquement)   │ │
│  │  QoS              [1 ▼]                                        │ │
│  │  Retain           [✓]                                          │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Tester la connexion]              [Sauvegarder]   [Réinitialiser] │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Options :**
- Configuration du broker (hôte, port, auth, TLS)
- Préfixe des topics
- Format des messages (JSON ou valeur simple)
- QoS (0, 1, 2)
- Rétention des messages

➡️ [Documentation complète MQTT](./integrations/mqtt)

---

### VictoriaMetrics

Configuration de l'export vers VictoriaMetrics.

```
┌─────────────────────────────────────────────────────────────────────┐
│  VictoriaMetrics                                   Statut: ○ Inactif│
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Général ──────────────────────────────────────────────────────┐ │
│  │  Activer l'exporteur      [ ]                                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Mode Push ────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Activer Push     [✓]                                          │ │
│  │  URL endpoint     [http://victoriametrics:8428/api/v1/import]  │ │
│  │  Intervalle       [60_____] secondes                           │ │
│  │                                                                 │ │
│  │  Authentification                                               │ │
│  │  Utilisateur  [________________]     Mot de passe [********]   │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Labels ───────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  instance     [home_______________]                            │ │
│  │  location     [paris______________]                            │ │
│  │  + Ajouter un label                                            │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Tester la connexion]              [Sauvegarder]   [Réinitialiser] │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Options :**
- Mode push vers VictoriaMetrics
- URL de l'endpoint
- Intervalle de push
- Labels personnalisés

➡️ [Documentation complète VictoriaMetrics](./integrations/victoriametrics)

---

### Prometheus

Configuration de l'endpoint Prometheus pour le scraping.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Prometheus                                        Statut: ○ Inactif│
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Général ──────────────────────────────────────────────────────┐ │
│  │  Activer l'exporteur      [ ]                                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Endpoint ─────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Port             [9090____]                                   │ │
│  │  Path             [/metrics_______________]                    │ │
│  │                                                                 │ │
│  │  URL: http://localhost:9090/metrics                            │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Métriques exposées ───────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  [✓] myelectricaldata_consumption_daily_kwh                    │ │
│  │  [✓] myelectricaldata_consumption_hc_kwh                       │ │
│  │  [✓] myelectricaldata_consumption_hp_kwh                       │ │
│  │  [✓] myelectricaldata_production_daily_kwh                     │ │
│  │  [✓] myelectricaldata_max_power_kva                            │ │
│  │  [✓] myelectricaldata_sync_status                              │ │
│  │  [✓] myelectricaldata_last_sync_timestamp                      │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Aperçu des métriques]             [Sauvegarder]   [Réinitialiser] │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Options :**
- Port d'exposition
- Path de l'endpoint
- Sélection des métriques à exposer
- Aperçu des métriques générées

---

### Jeedom

Configuration de l'intégration Jeedom.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Jeedom                                            Statut: ○ Inactif│
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Général ──────────────────────────────────────────────────────┐ │
│  │  Activer l'exporteur      [ ]                                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Connexion ────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  URL Jeedom       [http://jeedom.local____________________]    │ │
│  │  Clé API          [****************************************]   │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Méthode ──────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  (●) Plugin Virtuel                                            │ │
│  │  ( ) API JSON RPC                                              │ │
│  │  ( ) Via MQTT (nécessite jMQTT)                                │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Mapping des commandes ────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  ID Équipement virtuel  [123_______]                           │ │
│  │                                                                 │ │
│  │  Consommation jour  →  ID cmd: [456_______]                    │ │
│  │  Consommation HC    →  ID cmd: [457_______]                    │ │
│  │  Consommation HP    →  ID cmd: [458_______]                    │ │
│  │  Production jour    →  ID cmd: [459_______]                    │ │
│  │  Puissance max      →  ID cmd: [460_______]                    │ │
│  │                                                                 │ │
│  │  [Détecter automatiquement]                                    │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Tester la connexion]              [Sauvegarder]   [Réinitialiser] │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Options :**
- URL et clé API Jeedom
- Méthode d'intégration (Virtuel, API, MQTT)
- Mapping des commandes
- Détection automatique des équipements

➡️ [Documentation complète Jeedom](./integrations/jeedom)

---

## Fonctionnalités communes

### Test de connexion

Chaque exporteur dispose d'un bouton **Tester la connexion** qui vérifie :
- Connectivité réseau
- Authentification
- Permissions d'écriture

Résultat affiché :

```
┌─────────────────────────────────────────────────────┐
│ ✓ Connexion réussie                                 │
│   Broker MQTT: core-mosquitto:1883                  │
│   Latence: 12ms                                     │
└─────────────────────────────────────────────────────┘
```

ou

```
┌─────────────────────────────────────────────────────┐
│ ✗ Échec de connexion                                │
│   Erreur: Connection refused                        │
│   Vérifiez l'hôte et le port                       │
└─────────────────────────────────────────────────────┘
```

### Sauvegarde

Le bouton **Sauvegarder** :
1. Valide la configuration
2. Enregistre dans le fichier `config.yaml`
3. Recharge l'exporteur concerné
4. Affiche une confirmation

### Réinitialiser

Le bouton **Réinitialiser** restaure les valeurs par défaut de l'exporteur.

### Indicateur de statut

Chaque onglet affiche un indicateur de statut :
- ● **Vert** : Exporteur actif et fonctionnel
- ○ **Gris** : Exporteur désactivé
- ● **Rouge** : Exporteur actif mais en erreur

## Multi-exporteurs

Vous pouvez activer plusieurs exporteurs simultanément. Par exemple :
- Home Assistant pour l'interface domotique
- VictoriaMetrics pour l'historisation longue durée
- MQTT pour des automatisations Node-RED

Les exporteurs fonctionnent indépendamment et n'interfèrent pas entre eux.

## Synchronisation avec config.yaml

Les modifications effectuées via l'interface sont automatiquement synchronisées avec le fichier `config.yaml`. Inversement, les modifications manuelles du fichier sont reflétées dans l'interface après rechargement.

```yaml
# Exemple de config.yaml généré
home_assistant:
  enabled: true
  discovery: true
  discovery_prefix: "homeassistant"
  entity_prefix: "myelectricaldata"
  energy_dashboard: true
  statistics: true

mqtt:
  enabled: true
  host: "core-mosquitto"
  port: 1883
  username: "mqtt_user"
  password: "secret"
  topic_prefix: "myelectricaldata"
  qos: 1
  retain: true
  format: "json"

metrics:
  enabled: false

jeedom:
  enabled: false
```
