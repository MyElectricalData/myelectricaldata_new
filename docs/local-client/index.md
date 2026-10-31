# Mode Client Local

## Vue d'ensemble

Le **mode client** de MyElectricalData est une version allégée de l'application, conçue pour tourner localement chez l'utilisateur final. Contrairement au mode serveur (gateway complet), le mode client :

- **Se connecte à l'API MyElectricalData** (www.v2.myelectricaldata.fr) au lieu d'Enedis directement
- **Stocke les données indéfiniment** dans une base locale : un simple fichier SQLite (recommandé) ou PostgreSQL
- **Ne nécessite pas de compte Enedis professionnel**
- **Propose des exports vers Home Assistant, MQTT, VictoriaMetrics, Jeedom**

➡️ **Pour l'installer : [Installation avec Docker](./installation/docker.md)**, un seul conteneur et quelques minutes.

---

## Fonctionnalités

### Pages disponibles

| Page | Description | Source de données |
|------|-------------|-------------------|
| **Dashboard** | Vue d'ensemble des PDL | API v2.myelectricaldata.fr |
| **Consommation (kWh)** | Données de consommation | API → base locale |
| **Consommation (Euro)** | Coûts calculés | Base locale |
| **Production** | Données de production | API → base locale |
| **Bilan** | Synthèse conso/prod | Base locale |
| **Contribution** | Envoi de contributions | API v2.myelectricaldata.fr |
| **Tempo** | Calendrier RTE Tempo | API → base locale |
| **EcoWatt** | Alertes RTE EcoWatt | API → base locale |
| **Exporter** | Configuration exports | Local uniquement |

### Pages supprimées (vs mode serveur)

- Page d'accueil (landing)
- Inscription / Connexion
- Administration (users, rôles, logs, offres)
- Paramètres avancés

### Exports disponibles

| Destination | Description |
|-------------|-------------|
| **Home Assistant** | Intégration directe via REST API |
| **MQTT** | Publication vers broker MQTT |
| **VictoriaMetrics** | Push vers base time-series |

➡️ [Voir les intégrations planifiées](./integrations/autres.md) (Jeedom, InfluxDB, Domoticz...)

---

## Prérequis

- Docker & Docker Compose
- Compte sur www.v2.myelectricaldata.fr avec PDL autorisé
- Client ID et Client Secret de l'API MyElectricalData

---

## Installation rapide

```bash
# Récupérer le fichier compose (pas besoin de cloner le dépôt)
curl -O https://raw.githubusercontent.com/MyElectricalData/myelectricaldata_new/main/docker-compose.client.yml

# Renseigner vos identifiants API
cat > .env <<'EOF'
MED_CLIENT_ID=votre_client_id
MED_CLIENT_SECRET=votre_client_secret
EOF

# Démarrer (un seul conteneur, base SQLite)
docker compose -f docker-compose.client.yml up -d
```

**Accès** : http://localhost:8100

Autres méthodes (Kubernetes, Proxmox, installations en deux conteneurs) : [Installation](./installation/).

---

## Compatibilité avec la passerelle (Enedis Data Connect 2026)

Depuis la migration vers les API Enedis Data Connect 2026, la passerelle `v2.myelectricaldata.fr` rend les mesures, le contrat et l'adresse au nouveau format (`grandeur[].points[]` au lieu de `meter_reading.interval_reading[]`). Conséquences :

- un client local **antérieur** à cette version ne sait plus lire les réponses de la passerelle : il faut le mettre à jour ;
- un client local **à jour** lit aussi une passerelle encore en v5, l'ordre de mise à jour est donc libre ;
- les données déjà synchronisées en base (`raw_data` au format v5) sont gardées et restent lues, sans migration.

Détail du format : [Data Connect 2026](../external-apis/enedis-api/data-connect-2026/README.md).

## Documentation

- [Installation](./installation/) (Docker en priorité ; Helm et autres méthodes)
- [Architecture technique](./architecture.md)
- [Configuration](./configuration.md)
- [Page Exporter](./exporters.md)
- [Interface utilisateur](./interface.md)

### Intégrations

- [Home Assistant](./integrations/home-assistant.md)
- [MQTT](./integrations/mqtt.md)
- [VictoriaMetrics](./integrations/victoriametrics.md)
- [Autres intégrations planifiées](./integrations/autres.md) (Jeedom, InfluxDB...)

---

## Pour aller plus loin : client et mode serveur

Le client local se connecte à la passerelle MyElectricalData, qui parle à Enedis à sa place. Le [mode serveur](../server-mode/index.md) est cette passerelle : il s'adresse à qui héberge un service pour d'autres utilisateurs, pas à un usage domestique.

```
Client local ──▶ API MyElectricalData (passerelle) ──▶ API Enedis
(chez vous)      (www.v2.myelectricaldata.fr)
```

Les deux modes peuvent tourner sur la même machine, sur des ports différents :

| Mode | Interface | Base de données |
|------|-----------|-----------------|
| Client (un conteneur) | :8100 (API sous `/api`) | SQLite (fichier), ou PostgreSQL externe |
| Serveur | :8000 | PostgreSQL |

```bash
docker compose -f docker-compose.server.yml up -d    # Mode serveur
docker compose -f docker-compose.client.yml up -d    # Mode client
```
