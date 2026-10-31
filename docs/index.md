---
sidebar_position: 1
slug: /
title: Accueil
---

# MyElectricalData

**Accédez à vos données Linky en toute simplicité**

MyElectricalData vous permet de consulter votre consommation et votre production électrique, de comparer les offres des fournisseurs et d'alimenter votre domotique (Home Assistant, MQTT, Grafana), à partir de vos données Enedis.

Le moyen le plus simple de l'utiliser : installer le **client local** chez vous. Un seul conteneur Docker, une seule adresse, vos données restent sur votre machine.

## 🚀 Installer le client local

Il vous faut [Docker](https://docs.docker.com/get-docker/) et vos identifiants MyElectricalData (`client_id` et `client_secret`), visibles dans **Paramètres > API** de [www.v2.myelectricaldata.fr](https://www.v2.myelectricaldata.fr).

```bash
# 1. Récupérer le fichier de déploiement (pas besoin de cloner le dépôt)
curl -O https://raw.githubusercontent.com/MyElectricalData/myelectricaldata_new/main/docker-compose.client.yml

# 2. Renseigner vos identifiants
cat > .env <<'EOF'
MED_CLIENT_ID=votre_client_id
MED_CLIENT_SECRET=votre_client_secret
EOF

# 3. Démarrer
docker compose -f docker-compose.client.yml up -d
```

Ouvrez ensuite **http://localhost:8100** : créez votre compte, lancez la synchronisation, et vos données arrivent.

- **Une seule image** : `ghcr.io/myelectricaldata/myelectricaldata_new/client` (amd64 et arm64, Raspberry Pi compris).
- **Un seul volume** : vos données sont dans une base SQLite, rien d'autre à installer.
- **Mise à jour** : `docker compose -f docker-compose.client.yml pull && docker compose -f docker-compose.client.yml up -d`.

➡️ [Guide d'installation complet](./local-client/installation/docker.md) · [Configuration](./local-client/configuration.md) · [Migrer depuis deux conteneurs ou depuis la V1](./local-client/installation/docker.md#passer-de-deux-conteneurs-à-un-seul)

## ✨ Ce que vous obtenez

### 📊 Consultation des données
- **Consommation** : quotidienne, mensuelle et annuelle, courbe de charge
- **Production** : suivi de votre production solaire (si applicable)
- **Puissance max** : analyse de vos pics de puissance

### 💰 Simulateur de tarifs
- Comparez les offres **BASE**, **HC/HP** et **TEMPO**
- Calcul basé sur votre consommation réelle
- Plus de 130 offres de 4 fournisseurs

### 📅 TEMPO et Ecowatt
- Couleurs des jours TEMPO (bleu, blanc, rouge)
- Alertes Ecowatt sur les tensions du réseau
- Historique et prévisions

### 🏠 Domotique
- **Home Assistant** : Energy Dashboard, entités créées automatiquement
- **MQTT** : compatible avec tout broker
- **VictoriaMetrics** : métriques pour Grafana

## 📖 Pour aller plus loin

| Je veux... | Documentation |
|------------|---------------|
| Installer et utiliser le client local | [Client Local](/local-client) |
| Régler l'application et les exports | [Configuration](./local-client/configuration.md) |
| Brancher Home Assistant, MQTT, Grafana | [Exporteurs](./local-client/exporters.md) |

## 🧰 Autres modes d'installation

Ces modes s'adressent à des besoins particuliers. Si vous voulez simplement voir vos données chez vous, le client local ci-dessus suffit.

- **Kubernetes (Helm)** : le client local sur un cluster, voir [Installation Helm](./local-client/installation/helm.md).
- **Mode Serveur (gateway)** : héberger une passerelle multi-utilisateurs avec accès direct aux API Enedis et RTE, voir [Mode Serveur](/server-mode). Réservé à qui opère un service pour d'autres utilisateurs (compte professionnel Enedis requis).

## 🛠️ Pour les développeurs

- [APIs Externes](/external-apis) : Enedis DataHub et RTE
- [Architecture du client local](./local-client/architecture.md)
- [Design System](/specs/design) et [Pages](/specs/pages/dashboard) : règles de conception de l'interface

Le projet est open-source. Les contributions sont les bienvenues sur [GitHub](https://github.com/MyElectricalData/myelectricaldata_new).
