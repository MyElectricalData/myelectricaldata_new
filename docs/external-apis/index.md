---
sidebar_position: 1
slug: /external-apis
---

# APIs Externes

MyElectricalData s'appuie sur deux APIs externes principales pour accéder aux données énergétiques françaises.

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MyElectricalData                                │
│                                                                     │
│  ┌─────────────┐                                                   │
│  │   Backend   │                                                   │
│  │  (FastAPI)  │                                                   │
│  └──────┬──────┘                                                   │
│         │                                                          │
│    ┌────┴────┐                                                     │
│    │         │                                                     │
│    ▼         ▼                                                     │
│  ┌────────┐ ┌────────┐                                             │
│  │ Enedis │ │  RTE   │                                             │
│  │DataHub │ │  APIs  │                                             │
│  └────────┘ └────────┘                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Enedis DataHub

**Enedis** est le gestionnaire du réseau de distribution d'électricité en France. L'API DataHub permet d'accéder aux données des compteurs Linky.

### Données disponibles

| Type | Description | Granularité |
|------|-------------|-------------|
| **Consommation journalière** | Énergie consommée par jour | 1 jour |
| **Courbe de charge** | Puissance instantanée | 30 minutes |
| **Production journalière** | Énergie produite (panneaux solaires) | 1 jour |
| **Courbe de production** | Puissance instantanée (production) | 30 minutes |
| **Contrat** | Informations du contrat (puissance souscrite, etc.) | - |
| **Adresse** | Adresse du point de livraison | - |

### Contraintes

- **Données disponibles** : J-1 (veille) maximum
- **Plage de dates** : 7 jours max pour les courbes de charge
- **Rate limiting** : 5 requêtes/seconde
- **Quota** : 10 000 requêtes/heure
- **Authentification** : OAuth2 avec consentement utilisateur

### Documentation

➡️ [Documentation complète API Enedis](/enedis-api/endpoint)

---

## API RTE (Réseau de Transport d'Électricité)

**RTE** est le gestionnaire du réseau de transport d'électricité haute tension en France. Les APIs RTE fournissent des données nationales et des signaux temps réel.

### APIs disponibles

#### 1. TEMPO

Informations sur les jours Tempo (tarification EDF).

| Donnée | Description |
|--------|-------------|
| **Couleur du jour** | Bleu / Blanc / Rouge |
| **Couleur J+1** | Prévision lendemain (après 11h) |
| **Compteurs** | Jours bleus/blancs/rouges restants |

**Publication** : Chaque jour à 11h pour J+1

➡️ [Documentation TEMPO](/rte-api/tempo/tempo-api)

#### 2. EcoWatt

Signaux de tension sur le réseau électrique français.

| Niveau | Description |
|--------|-------------|
| **Vert** | Consommation normale |
| **Orange** | Système électrique tendu |
| **Rouge** | Système très tendu, risque de coupures |

**Publication** :
- Quotidien à 17h pour J+1 à J+3
- Vendredi 12h15 pour anticipation week-end

➡️ [Documentation EcoWatt](/rte-api/ecowatt/ecowatt-api)

#### 3. Consumption (Consommation France)

Données de consommation électrique à l'échelle nationale.

- **Temps réel** : Consommation actuelle (REALISED)
- **Infraday** : Estimation jour même (ID)
- **Prévisions** : J+1 et J+2 (D-1, D-2)
- **Granularité** : 30 minutes
- **Horizon** : J-2 à J+2

➡️ [Documentation Consumption](/rte-api/consumption)

#### 4. Generation Forecast (Prévisions de production)

Prévisions de production par filière renouvelable.

- **Solaire** : Production photovoltaïque (SOLAR)
- **Éolien terrestre** : WIND_ONSHORE
- **Éolien offshore** : WIND_OFFSHORE
- **Granularité** : 30 minutes
- **Horizon** : J+1 à J+3 (D-1, D-2, D-3)

➡️ [Documentation Generation Forecast](/rte-api/generation-forecast)

### Contraintes

- **Rate limiting** : Varie selon l'API
- **Authentification** : OAuth2 Client Credentials (optionnel selon l'API)
- **Format** : JSON

### Documentation

➡️ [Documentation complète API RTE](/rte-api)

---

## Obtenir les credentials

### Enedis DataHub

1. Créer un compte sur [datahub-enedis.fr](https://datahub-enedis.fr)
2. Nécessite un **SIRET** (entreprise ou auto-entrepreneur)
3. Créer une application et demander l'accès aux APIs
4. Récupérer `client_id` et `client_secret`

**Coût** : Gratuit pour usage normal

### RTE Data

1. Créer un compte sur [data.rte-france.com](https://data.rte-france.com)
2. Souscrire aux APIs souhaitées
3. Récupérer `client_id` et `client_secret` (si requis)

**Coût** : Gratuit

---

## Utilisation dans MyElectricalData

### Mode Serveur

Le mode serveur accède **directement** aux APIs Enedis et RTE :

```
Frontend → Backend → Enedis/RTE APIs
```

Configuration dans `.env.docker` :
```bash
# Enedis (REQUIS)
ENEDIS_CLIENT_ID=xxx
ENEDIS_CLIENT_SECRET=xxx

# RTE (OPTIONNEL)
RTE_CLIENT_ID=xxx
RTE_CLIENT_SECRET=xxx
```

### Mode Client

Le mode client utilise l'**API MyElectricalData** (v2.myelectricaldata.fr) qui agit comme proxy :

```
Frontend → Backend → API MyElectricalData → Enedis/RTE APIs
```

Configuration dans `.env.local-client` :
```bash
MED_CLIENT_ID=xxx
MED_CLIENT_SECRET=xxx
```

Pas besoin de credentials Enedis/RTE directs.

---

## Comparaison

| Aspect | API Enedis | API RTE |
|--------|-----------|---------|
| **Données** | Individuelles (par compteur) | Nationales (France entière) |
| **Authentification** | OAuth2 consentement utilisateur | OAuth2 Client Credentials |
| **Granularité** | 30 min (courbe de charge) | Variable selon API |
| **Historique** | Limité (J-1 max) | Plusieurs années |
| **Rate limiting** | Strict (5 req/s) | Variable |
| **Coût** | Gratuit | Gratuit |
| **SIRET requis** | Oui | Non |

---

## Ressources officielles

| Ressource | Lien |
|-----------|------|
| **Portail Enedis DataHub** | [datahub-enedis.fr](https://datahub-enedis.fr) |
| **Portail RTE Data** | [data.rte-france.com](https://data.rte-france.com) |
| **Swagger Enedis** | [Sandbox DataHub](https://datahub-enedis.fr/data-connect/documentation/) |
| **Documentation RTE** | [RTE Data Services](https://data.rte-france.com/catalog) |
