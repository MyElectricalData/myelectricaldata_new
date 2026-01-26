---
name: consumption-kwh
id: consumption-kwh
path: /consumption_kwh
description: Visualisez et analysez votre consommation électrique en kWh
mode_client: true
mode_server: true
menu: Consommation
tab: <logo thunder> kWh
---

# Section Consommation

## Structure des routes

La section Consommation utilise un **sous-menu avec deux onglets** :

| Route               | Description                      | Statut     |
| ------------------- | -------------------------------- | ---------- |
| `/consumption`      | Redirige vers `/consumption_kwh` | Redirect   |
| `/consumption_kwh`  | Consommation en kWh              | Implémenté |
| `/consumption_euro` | Consommation en euros            | Implémenté |

## Architecture

```
apps/web/src/
├── components/
│   └── ConsumptionTabs.tsx          # Sous-menu onglets kWh/Euro
├── pages/
│   ├── ConsumptionKwh/              # Page kWh (complete)
│   │   ├── index.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── types/
│   └── ConsumptionEuro/             # Page Euro (placeholder)
│       └── index.tsx
```

## Documentation détaillée

- **Page kWh** : Voir `consumption-kwh.md` pour les spécifications complètes
- **Page Euro** : Voir `consumption-euro.md` pour les spécifications à venir

---

# Page Consommation kWh

**Route:** `/consumption_kwh`

## Description

Page permettant aux utilisateurs de **visualiser et analyser leur consommation électrique en kWh** récupérée depuis l'API Enedis.

**Important:** Garde la structure des fonctionnalités : elle définit l'ordre souhaité, les différents blocs et leurs regroupements.

## Etat d'implementation actuel

### Fonctionnalites completes (100%)

#### 1. Sélection du PDL ✅

- Liste déroulante multi-PDL fonctionnelle
- Message d'information pour données limitées (oldest_available_data_date)
- Auto-sélection du premier PDL actif au chargement

#### 2. Récupération des données ✅

- Bouton "Récupérer l'historique" opérationnel
- Bouton "Vider cache" (admin uniquement) avec modal de confirmation
- Auto-chargement depuis cache (React Query + localStorage + IndexedDB + Redis)
- Indicateurs de progression détaillés pour 3 types :
  - Données quotidiennes (cache granulaire par jour)
  - Puissance maximale (cache granulaire par jour)
  - Données détaillées (cache ultra-granulaire par timestamp 30min)
- Gestion intelligente des erreurs avec retry logic (ADAM-ERR0123)

#### 3. Statistiques de consommation ✅

- **Consommation par année** ✅ : graphiques avec comparaison mensuelle, export JSON (lignes 2180-2363)
- **Répartition HC/HP par année** ✅ : camemberts avec onglets, totaux HC/HP, message d'info, export JSON (lignes 2026-2167)

#### 4. Courbe annuelle ✅

- Graphique de consommation annuelle (lignes 2733-2962)
- Toggle comparaison année N vs N-1
- Mode sombre adaptatif
- Export JSON

#### 5. Courbe de charge détaillée ✅

- **Graphique détaillé** ✅ : intervalle PT30M/PT15M, navigation semaine/jour, toggles comparaison (lignes 2370-3000)
- **Calendrier de navigation** ✅ : calendrier visuel CSS adaptatif, blocage hors plages disponibles (lignes 2483-2705)
- **3 raccourcis** ✅ : Aujourd'hui / Semaine dernière / Il y a un an (lignes 2620-2650)
- **Consommation HC/HP mensuelle** ✅ : graphiques en barres par mois/année, onglets, comparaison N-1, export JSON (lignes 3051-3330)
- Exports JSON disponibles pour toutes les sections

#### 6. Pics de puissance maximale ✅

- Graphiques par année glissante (365 jours) (lignes 3332-3406)
- Ligne de référence puissance souscrite
- Message informatif dépassements Linky
- Conversion W → kW automatique
- Export JSON

#### 7. Gestion du cache ✅

- Cache granulaire jour par jour (daily)
- Cache ultra-granulaire timestamp par timestamp (detail - PT30M/PT15M)
- Invalidation intelligente
- Support React Query + localStorage + IndexedDB + Redis

#### 8. Bloc d'information ✅

- Visible en permanence, même sans données chargées
- Détails sur l'API Enedis, cache, limites, disponibilité J-1

---

## Fonctionnalités principales (ordre d'affichage cible)

### 1. Sélection du PDL (Point de Livraison)

#### 1.1 Liste déroulante ✅

- Proposer un sélecteur de PDL lorsque l'utilisateur en possède plusieurs
- Afficher un message d'information si le PDL dispose de données limitées

#### 1.2 Récupération des données ✅

- Bouton "Récupérer l'historique" pour charger les données
- Si l'utilisateur est administrateur, ajouter un bouton pour vider le cache (navigateur + Redis)
- Charger automatiquement les données depuis le cache lorsqu'elles sont disponibles
- Afficher des indicateurs de progression pour trois types de données :
  - Données quotidiennes (3 ans par pas d'un an maximum)
  - Puissance maximale (3 ans par pas d'un an maximum)
  - Données détaillées (2 ans par pas d'une semaine maximum)

### 2. Statistiques de consommation

#### 2.1 Consommation par année ✅

- Afficher la consommation annuelle avec graphiques
- Proposer une comparaison mensuelle sur plusieurs années
- Fournir un bouton d'export en JSON

#### 2.2 Répartition HC/HP par année ✅

- ✅ **Camemberts** du ratio HC/HP par année glissante via des onglets (ex. : 2025, 2024, ...)
- ✅ Affichage des **totaux HC/HP** et pourcentages
- ✅ Message d'information complet :
  > _Le total HC/HP peut différer légèrement de la "Consommation par année". Cette différence provient d'une simulation basée sur les plages horaires HC/HP, car Enedis ne fournit pas ces données détaillées. De plus, Enedis transmet les données par paliers de 30 minutes : si le passage heures creuses/heures pleines intervient au milieu d'un intervalle de 30 minutes, la répartition HC/HP reste approximative à 30 minutes près. La section "Consommation par année" est la plus précise et correspond à la base de facturation de votre fournisseur._
- ✅ Export JSON disponible

### 3. Courbe annuelle ✅

- Afficher la courbe annuelle de consommation
- Permettre la comparaison année par année

### 4. Courbe de charge détaillée

#### 4.1 Courbe de charge détaillée ✅

- ✅ Afficher la courbe des données par intervalle transmis par Enedis
- ✅ Proposer une navigation par semaine et par jour (onglets de 7 jours) avec des contrôles gauche/droite pour parcourir les semaines
  - Boutons de jour adaptatifs : affichage sur 2 lignes (date complète + puissance)
  - Responsive : nombre de jours visible calculé dynamiquement selon la largeur d'écran
- ✅ **Calendrier** respectant le CSS du site et empêchant la navigation en dehors des plages présentes en cache
  - Alignement des jours corrigé pour calendrier français (lundi en première colonne)
  - Sélection de date intelligente : navigation vers la bonne semaine puis sélection automatique du jour
- ✅ **Trois raccourcis** au même niveau que le calendrier pour naviguer rapidement :
  - Aujourd'hui
  - Semaine dernière
  - Il y a un an
- ✅ Comparer avec l'année et la semaine précédentes lorsqu'elles sont disponibles
  - Chargement automatique depuis le cache React Query (batch data)
  - Extraction intelligente des données de comparaison par filtrage de date
- ✅ Export JSON disponible

#### 4.2 Consommation HC/HP par mois ✅

- ✅ **Graphique en barres** présentant les HC/HP par mois et par année
- ✅ **Onglets** dédiés pour chaque année
- ✅ Comparaison avec l'année précédente si disponible
- ✅ Détection automatique des heures creuses et heures pleines
- ✅ Export JSON disponible

### 5. Pics de puissance maximale ✅

- Afficher les graphiques des pics de puissance par année
- Dessiner une ligne de référence indiquant la puissance souscrite
- Fournir des informations sur les dépassements autorisés par le Linky
  > _ℹ️ Note : ces graphiques affichent les pics de puissance maximale atteints chaque jour sur les 3 dernières années. La ligne violette en pointillés représente votre puissance souscrite (12 kVA). Le compteur Linky autorise des dépassements temporaires de cette limite ; un pic ponctuel au-dessus de cette ligne ne provoquera donc pas nécessairement de disjonction. En revanche, des dépassements réguliers ou prolongés augmentent le risque de disjonction._

### 6. Bloc d'information ✅

- ✅ Le bloc reste visible même sans données chargées ; il détaille :
  - Les données sont récupérées depuis l'API Enedis Data Connect
  - L'endpoint utilisé est `consumption/daily` (relevés quotidiens)
  - Les données sont mises en cache pour optimiser les performances
  - Récupération automatique de 1095 jours d'historique (limite maximale Enedis)
  - Les données Enedis ne sont disponibles qu'en J-1 (hier)

---

## Technologies utilisées

- React avec TypeScript
- React Query pour la gestion du cache et des requêtes API
- Recharts pour les graphiques
- Tailwind CSS pour le style
- Support du mode sombre
- lucide-react pour les icônes
- react-hot-toast pour les notifications

## Design visuel

### Couleurs des sections

Chaque section utilise une icône colorée distinctive :

| Section                      | Icône         | Couleur                  |
| ---------------------------- | ------------- | ------------------------ |
| Statistiques de consommation | ⚡ Zap        | Ambre (`amber-500`)      |
| Graphiques de consommation   | 📊 BarChart3  | Émeraude (`emerald-500`) |
| Courbe de charge détaillée   | 📈 LineChart  | Indigo (`indigo-500`)    |
| Pics de puissance maximale   | 📉 TrendingUp | Rouge (`red-500`)        |

### Cartes statistiques annuelles

Les cartes `YearlyStatCards` utilisent des gradients colorés rotatifs :

1. **Bleu → Indigo** : `from-blue-50 to-indigo-100`
2. **Émeraude → Teal** : `from-emerald-50 to-teal-100`
3. **Violet → Violet** : `from-purple-50 to-violet-100`
4. **Ambre → Orange** : `from-amber-50 to-orange-100`

Chaque carte affiche :

- Icône Zap colorée
- Année et période (dates)
- Consommation en kWh
- Comparaison année précédente (tendance haut/bas)

### Sélecteurs d'années (tabs)

Les sélecteurs d'années utilisent les mêmes couleurs que les graphiques associés :

**Style actif :**

```css
background-color: rgba(couleur, 0.125);
border-color: couleur;
color: couleur;
```

**Style inactif :**

```css
text-gray-400 border-gray-700
hover:text-gray-200 hover:border-gray-600
```

**Couleurs par composant :**

| Composant        | Couleurs des tabs                                                              |
| ---------------- | ------------------------------------------------------------------------------ |
| AnnualCurve      | `#3B82F6` (bleu), `#10B981` (émeraude), `#F59E0B` (ambre), `#8B5CF6` (violet)  |
| PowerPeaks       | `#EF4444` (rouge), `#F59E0B` (ambre), `#10B981` (émeraude), `#8B5CF6` (violet) |
| MonthlyHcHp      | Nuances de bleu (`#3B82F6`, `#93C5FD`, `#60A5FA`, `#2563EB`)                   |
| HcHpDistribution | Nuances de bleu (`#60A5FA`, `#3B82F6`, `#93C5FD`, `#2563EB`)                   |

### Camembert HC/HP

Le camembert de répartition HC/HP utilise des couleurs semi-transparentes :

- **Heures Creuses (HC)** : `rgba(96, 165, 250, 0.6)` (bleu-400 avec 60% opacité)
- **Heures Pleines (HP)** : `rgba(251, 146, 60, 0.6)` (orange-400 avec 60% opacité)

### Graphiques avec gradients

Les conteneurs de graphiques utilisent des gradients subtils :

| Composant         | Gradient                      |
| ----------------- | ----------------------------- |
| YearlyConsumption | `from-sky-50 to-blue-100`     |
| AnnualCurve       | `from-teal-50 to-emerald-100` |
| MonthlyHcHp       | `from-indigo-50 to-cyan-100`  |
| PowerPeaks        | `from-red-50 to-orange-100`   |

## Fichiers lies

- **Frontend** : `apps/web/src/pages/ConsumptionKwh/` (dossier avec composants)
- **Tabs** : `apps/web/src/components/ConsumptionTabs.tsx`
- **API** : `apps/web/src/api/enedis.ts`, `apps/web/src/api/pdl.ts`
- **Types** : `apps/web/src/types/api.ts`
- **Backend** : `apps/api/src/routers/enedis.py`, `apps/api/src/routers/pdl.py`
- **Utils** : `apps/web/src/utils/offpeakHours.ts` (parsing plages HC/HP)

## Notes techniques importantes

### Cache granulaire

- **Daily data** : 1 clé cache par jour (`consumption:daily:{pdl}:{date}`)
- **Detail data** : 1 clé cache par timestamp (`consumption:detail:{pdl}:{timestamp}`)
- **Reading type** : Stocké séparément (`consumption:reading_type:{pdl}`)

### Calculs par année glissante ✅

- Tous les calculs se font par année glissante (365 jours)
- Du jour J-1 au jour J-1 de l'année N-1
- Exemple : si nous sommes le 24/10/2025, l'année 2025 couvre du 23/10/2025 au 23/10/2024
- La plage de dates est affichée dans l'UI

### Gestion des intervalles Enedis ✅

- Parsing dynamique des intervalles ISO8601 : `PT30M`, `PT15M`, etc.
- Conversion automatique des unités (W → Wh → kWh)
- **Important** : Les valeurs Enedis sont des **fins d'intervalle**
  - Si tu reçois `11h30`, la valeur couvre `11h00 → 11h30`
  - Si tu reçois `23/10/2025 00h00`, elle correspond à `22/10/2025 23h30 → 23/10/2025 00h00`
  - Le code soustrait l'intervalle pour obtenir l'heure de début
- L'unité est dynamique : `data.meter_reading.reading_type.unit` (W, Wh, kWh, VA...)

### Retry logic ADAM-ERR0123 ✅

- Détection automatique des erreurs "data anterior to meter activation"
- Mise à jour de `oldest_available_data_date` dans la base PDL
- Retry avec dates ajustées

### Limites API Enedis

- **Daily endpoint** : max 3 ans (1095 jours)
- **Detail endpoint** : max 2 ans (730 jours)
- **Max power** : max 3 ans (1095 jours)
- Données disponibles uniquement en J-1 (hier)

---

## Architecture actuelle du dossier ConsumptionKwh

### Structure (refactorisee)

```
apps/web/src/pages/ConsumptionKwh/
├── index.tsx                           # Page principale
├── components/
│   ├── AnnualCurve.tsx                # Courbe annuelle avec sélecteurs colorés
│   ├── DataFetchSection.tsx           # Section recuperation donnees
│   ├── HcHpDistribution.tsx           # Repartition HC/HP (camemberts)
│   ├── InfoBlock.tsx                  # Bloc d'information
│   ├── LoadingProgress.tsx            # Indicateurs de progression
│   ├── ModernButton.tsx               # Bouton moderne
│   ├── MonthlyHcHp.tsx                # HC/HP mensuel (barres)
│   ├── PDLSelector.tsx                # Selecteur PDL
│   ├── PowerPeaks.tsx                 # Pics de puissance avec sélecteurs colorés
│   ├── YearlyConsumption.tsx          # Comparaison mensuelle avec gradient
│   └── YearlyStatCards.tsx            # Cartes annuelles avec gradients colorés
├── hooks/
│   ├── useConsumptionCalcs.ts         # Calculs consommation
│   ├── useConsumptionData.ts          # Gestion donnees
│   └── useConsumptionFetch.ts         # Fetch API
└── types/
    └── consumption.types.ts           # Types TypeScript
```

---

## Statut : Implementation complete

Toutes les fonctionnalites specifiees sont implementees et operationnelles.

Le code a ete refactorise en composants modulaires pour une meilleure maintenabilite.

### Pages associées

- **Page Euro** : Voir `02-consumption-euro.md` pour les spécifications de la page `/consumption_euro`

---

## Structure des données d'API

Le routeur de l'API Enedis est disponible ici :

`./apps/api/src/routers/enedis.py`

### Endpoints principaux

- `GET /enedis/consumption/daily/{pdl}` : Données quotidiennes (max 3 ans)
- `GET /enedis/consumption/detail/{pdl}` : Données détaillées PT30M/PT15M (max 2 ans)
- `GET /enedis/power/{pdl}` : Puissance maximale (max 3 ans)
- `DELETE /enedis/cache/{pdl}` : Vider cache Redis
