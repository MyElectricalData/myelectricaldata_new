---
sidebar_position: 1
slug: /
title: Accueil
---

# MyElectricalData

**Accédez à vos données Linky en toute simplicité**

MyElectricalData est une passerelle API sécurisée qui permet aux particuliers français d'accéder à leurs données de consommation et de production électrique via les API professionnelles Enedis.

## 🚀 Démarrage rapide

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
  <TabItem value="client" label="Mode Client (recommandé)" default>

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Configurer les identifiants MyElectricalData API
cp .env.local-client.example .env.local-client
nano .env.local-client

# Démarrer les services
docker compose up -d

# Accéder à l'application
open http://localhost:8100
```

  </TabItem>
  <TabItem value="server" label="Mode Serveur">

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Configurer les identifiants Enedis/RTE
cp apps/api/.env.example apps/api/.env.docker
nano apps/api/.env.docker

# Démarrer les services
docker compose up -d

# Accéder à l'application
open http://localhost:8000
```

  </TabItem>
  <TabItem value="helm" label="Kubernetes (Helm)">

```bash
# Mode Client
helm install myelectricaldata ./helm/myelectricaldata-client \
  --set secrets.med.clientId.value=xxx \
  --set secrets.med.clientSecret.value=xxx

# Mode Serveur
helm install myelectricaldata ./helm/myelectricaldata-server \
  --set secrets.enedis.clientId.value=xxx \
  --set secrets.enedis.clientSecret.value=xxx
```

  </TabItem>
</Tabs>

## 📚 Documentation

### Guides par mode

| Mode | Description | Documentation |
|------|-------------|---------------|
| **Mode Client** | Installation locale mono-utilisateur | [Documentation Client](/local-client) |
| **Mode Serveur** | Gateway multi-utilisateurs avec API Enedis | [Documentation Serveur](/server-mode) |

### Ressources générales

| Section | Description |
|---------|-------------|
| [**APIs Externes**](/external-apis) | Documentation des API Enedis DataHub et RTE |
| [**Design System**](/specs/design) | Règles de design et composants UI |
| [**Pages**](/pages/dashboard) | Guide de conception des pages de l'application |

## ✨ Fonctionnalités principales

### 📊 Consultation des données
- **Consommation** : Visualisez votre consommation quotidienne, mensuelle et annuelle
- **Production** : Suivez votre production solaire (si applicable)
- **Puissance max** : Analysez vos pics de puissance

### 💰 Simulateur de tarifs
- Comparez les offres **BASE**, **HC/HP** et **TEMPO**
- Calcul basé sur votre consommation réelle
- Support de 130+ offres de 4 fournisseurs

### 📅 Données TEMPO & Ecowatt
- Couleurs des jours TEMPO (bleu, blanc, rouge)
- Alertes Ecowatt pour les tensions réseau
- Historique et prévisions

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Enedis API │
│  React/Vite │     │   FastAPI   │     │  DataHub    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │    Cache    │
                    │   (Redis)   │
                    └─────────────┘
```

- **Frontend** : React 18 + TypeScript + Vite + TailwindCSS
- **Backend** : FastAPI + SQLAlchemy + Pydantic
- **Base de données** : PostgreSQL ou SQLite
- **Cache** : Redis avec chiffrement Fernet

## 🔐 Sécurité

- **Isolation des données** : Chaque utilisateur n'accède qu'à ses propres PDL
- **[Chiffrement Fernet](/server-mode/encryption)** : Données en cache chiffrées avec la clé secrète de l'utilisateur
- **OAuth2** : Flux de consentement Enedis sécurisé
- **Rate limiting** : Protection contre les abus

## 🏠 Client Local (domotique)

Installez le **Client Local** chez vous pour intégrer vos données Linky dans votre système domotique :

- **Home Assistant** : Energy Dashboard, entités automatiques
- **MQTT** : Compatible avec tout broker MQTT
- **VictoriaMetrics** : Métriques Prometheus pour Grafana

➡️ [Documentation du Client Local](/local-client)

## 🖥️ Mode Serveur (Gateway)

Déployez votre propre gateway multi-utilisateurs avec accès direct aux API Enedis :

- **Multi-utilisateurs** : Gestion complète des comptes et rôles
- **OAuth2 Enedis** : Consentement et tokens automatiques
- **Administration** : Interface complète (users, offres, logs)
- **Simulateur** : Comparaison de 130+ offres tarifaires

➡️ [Documentation du Mode Serveur](/server-mode)

## 📖 Ressources

- [Client Local domotique](/local-client)
- [Mode Serveur (Gateway)](/server-mode)
- [APIs Externes](/external-apis)
- [Design System](/specs/design)

## 🤝 Contribution

Le projet est open-source. Les contributions sont les bienvenues sur [GitHub](https://github.com/MyElectricalData/myelectricaldata).
