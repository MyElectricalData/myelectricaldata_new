---
sidebar_position: 4
title: Interface Web
---

# Interface Web

Le client local embarque une interface web complète, reprenant toutes les fonctionnalités de la passerelle MyElectricalData. Accessible depuis votre réseau local, elle vous permet de consulter vos données sans dépendre d'un service cloud.

## Accès

Par défaut, l'interface est accessible sur :

```
http://localhost:8080
```

Ou via l'IP de votre machine/container :

```
http://192.168.1.x:8080
```

## Pages disponibles

### Dashboard (`/`)

Page d'accueil listant tous vos points de livraison (PDL) récupérés via l'API de la passerelle.

**Fonctionnalités :**
- Liste des PDL avec leur statut
- Résumé de consommation/production par PDL
- Accès rapide aux détails de chaque PDL
- Indicateur de dernière synchronisation

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PDL 12345678901234                              [>]    │   │
│  │  Adresse: 123 Rue Example, 75001 Paris                  │   │
│  │  Puissance: 6 kVA | Tarif: HC/HP                        │   │
│  │                                                          │   │
│  │  Hier: 12.5 kWh        Ce mois: 245 kWh                 │   │
│  │  Dernière sync: il y a 2h                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PDL 98765432109876                              [>]    │   │
│  │  Adresse: 456 Avenue Test, 69001 Lyon                   │   │
│  │  Puissance: 9 kVA | Tarif: TEMPO                        │   │
│  │  Production solaire: ✓                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Consommation kWh (`/consumption_kwh`)

Visualisation détaillée de la consommation en kilowattheures.

**Fonctionnalités :**
- Graphique journalier/hebdomadaire/mensuel/annuel
- Détail par tranche horaire (30 min)
- Répartition HC/HP (si applicable)
- Export des données (CSV, JSON)
- Comparaison avec les périodes précédentes

**Filtres disponibles :**
- Sélection du PDL
- Période (date de début/fin)
- Granularité (jour, semaine, mois, année)

### Consommation Euro (`/consumption_euro`)

Consommation convertie en euros selon votre tarif actuel.

**Fonctionnalités :**
- Coût journalier/hebdomadaire/mensuel/annuel
- Détail par tranche tarifaire (HC/HP, Tempo bleu/blanc/rouge)
- Estimation du prochain relevé
- Comparaison avec les mois précédents

**Tarifs supportés :**
- Base
- Heures Creuses / Heures Pleines
- Tempo (bleu, blanc, rouge × HC/HP)
- EJP

### Production (`/production`)

Suivi de la production pour les installations avec panneaux solaires.

**Fonctionnalités :**
- Production journalière/mensuelle/annuelle
- Graphique de production par tranche horaire
- Autoconsommation vs injection réseau
- Rendement par rapport à la capacité installée

:::note
Cette page n'est visible que si votre PDL dispose de données de production.
:::

### Bilan (`/bilan`)

Synthèse énergétique complète avec comparatifs.

**Fonctionnalités :**
- Résumé consommation + production
- Bilan financier (coût vs revenus injection)
- Comparaison N / N-1
- Tendances et prévisions
- Impact environnemental (équivalent CO2)

### Ecowatt (`/ecowatt`)

Alertes et prévisions du réseau électrique français (données RTE).

**Fonctionnalités :**
- Signal Ecowatt du jour (vert, orange, rouge)
- Prévisions sur 4 jours
- Historique des alertes
- Conseils d'éco-gestes

### Tempo (`/tempo`)

Couleurs des jours Tempo et historique.

**Fonctionnalités :**
- Couleur du jour actuel et du lendemain
- Calendrier avec historique des couleurs
- Compteur de jours restants par couleur
- Prix par couleur

### Simulation (`/simulation`)

Simulateur de tarifs et comparaison d'offres.

**Fonctionnalités :**
- Simulation BASE vs HC/HP vs TEMPO
- Comparaison de 130+ offres de fournisseurs
- Calcul basé sur votre consommation réelle
- Économies potentielles par offre
- Recommandation personnalisée

### Exporteurs (`/exporters`)

**Nouvelle page** spécifique au client local pour configurer les exports domotiques.

➡️ Voir [Documentation Exporteurs](./exporters)

## Navigation

### Menu principal

```
┌─────────────────────────────────────────────────────────────────┐
│ [Logo] MyElectricalData Local                                   │
├─────────────────────────────────────────────────────────────────┤
│ Dashboard | Consommation ▼ | Production | Bilan | Tempo |       │
│           | • kWh          |            |       | Ecowatt |     │
│           | • Euro         |            |       | Simulation |  │
│                                                  | Exporteurs | │
└─────────────────────────────────────────────────────────────────┘
```

### Sélecteur de PDL

Présent sur toutes les pages de données, il permet de basculer entre vos différents points de livraison :

```
┌─────────────────────────────────┐
│ PDL: [12345678901234      ▼]   │
│      ┌─────────────────────┐   │
│      │ 12345678901234      │   │
│      │ 98765432109876      │   │
│      └─────────────────────┘   │
└─────────────────────────────────┘
```

### Sélecteur de période

Disponible sur les pages de consommation/production :

```
┌───────────────────────────────────────────────────────────┐
│ Période: [Jour] [Semaine] [Mois] [Année] [Personnalisé]  │
│                                                           │
│ Du: [15/01/2024]  Au: [15/01/2024]                       │
└───────────────────────────────────────────────────────────┘
```

## Thème sombre

L'interface supporte le mode sombre, activable via l'icône en haut à droite ou automatiquement selon les préférences système.

## Responsive

L'interface est entièrement responsive et s'adapte aux écrans mobiles, tablettes et desktop.

## Configuration

### Port personnalisé

```yaml
server:
  port: 8080  # Port par défaut
  host: "0.0.0.0"  # Écoute sur toutes les interfaces
```

### Authentification (optionnelle)

```yaml
server:
  auth:
    enabled: true
    username: "admin"
    password: "secret"
```

### HTTPS

```yaml
server:
  https:
    enabled: true
    cert: "/config/certs/cert.pem"
    key: "/config/certs/key.pem"
```

## Différences avec la passerelle

| Fonctionnalité | Passerelle | Client Local |
|----------------|------------|--------------|
| Gestion des comptes | ✓ | ✗ (utilise les identifiants API) |
| Consentement Enedis | ✓ | ✗ (déjà fait via la passerelle) |
| Page Exporteurs | ✗ | ✓ |
| Accès multi-utilisateurs | ✓ | Optionnel (auth locale) |
| Stockage données | Cloud | Local |
