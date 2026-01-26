---
id: france
---
# Page France

## Vue d'ensemble

La page **France** affiche les données nationales de consommation et production électrique en temps réel, basées sur les APIs RTE.

**Route** : `/france`
**Fichier** : `apps/web/src/pages/France.tsx`
**Mode** : Serveur et Client

## Mode de fonctionnement

| Mode    | Source des données                    | Rafraîchissement               |
| ------- | ------------------------------------- | ------------------------------ |
| Serveur | API RTE directement                   | Scheduler toutes les 15-30 min |
| Client  | Passerelle MyElectricalData (gateway) | Scheduler toutes les 15-30 min |

En mode client, les données sont récupérées depuis la passerelle serveur et stockées localement dans PostgreSQL. Le scheduler synchronise automatiquement les données France.

## Fonctionnalités

### Cartes résumé (4 indicateurs)

| Indicateur   | Icône | Source API                    |
| ------------ | ----- | ----------------------------- |
| Consommation | Zap   | `/consumption-france/current` |
| Solaire      | Sun   | `/generation-forecast/mix`    |
| Éolien       | Wind  | `/generation-forecast/mix`    |
| Renouvelable | Leaf  | `/generation-forecast/mix`    |

### Graphique Consommation nationale

Affiche les courbes de consommation avec différentes sources :

| Type     | Couleur | Description                |
| -------- | ------- | -------------------------- |
| REALISED | Vert    | Mesure temps réel (15 min) |
| ID       | Orange  | Prévision intraday         |
| D-1      | Bleu    | Prévision de la veille     |
| D-2      | Violet  | Prévision J-2              |

**Période affichée** : 24 dernières heures (96 points à 15 min)

### Graphique Production renouvelable

Graphique à aires empilées montrant :

- **Solaire** : Jaune (#fcd34d)
- **Éolien** : Bleu (#93c5fd)

**Période affichée** : Données du jour courant

## APIs Backend utilisées

### Consommation France

```
GET /api/consumption-france
GET /api/consumption-france/current
```

**Fichiers backend** :

- Router : `apps/api/src/routers/consumption_france.py`
- Service RTE : `apps/api/src/services/rte.py`

### Production renouvelable

```
GET /api/generation-forecast/mix
```

**Fichiers backend** :

- Router : `apps/api/src/routers/generation_forecast.py`
- Service RTE : `apps/api/src/services/rte.py`

## Structure du composant

```tsx
France
├── État
│   ├── consumptionData (ConsumptionFranceResponse)
│   ├── currentConsumption (ConsumptionFranceCurrent)
│   ├── mixData (RenewableMixResponse)
│   ├── loading, error
│
├── Fonctions
│   ├── fetchData() - Charge toutes les données en parallèle
│   ├── prepareConsumptionChartData() - Formate pour LineChart
│   ├── prepareMixChartData() - Formate pour AreaChart
│   └── getCurrentProductionTotals() - Extrait les totaux actuels
│
└── Rendu
    ├── Cartes résumé (grid 4 colonnes)
    ├── LineChart Consommation (Recharts)
    ├── AreaChart Production (Recharts)
    └── Section info explicative
```

## Design System

### Structure de page

```tsx
<div className="pt-6 w-full">
  <div className="space-y-8">
    {/* Cartes résumé */}
    {/* Graphique consommation */}
    {/* Graphique production */}
    {/* Info */}
  </div>
</div>
```

### Cartes résumé

```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 p-6">
  <div className="flex items-center gap-4">
    <div className="p-3 bg-{color}-100 dark:bg-{color}-900/30 rounded-lg">
      <Icon className="text-{color}-600 dark:text-{color}-400" size={24} />
    </div>
    <div>
      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Label
      </h3>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        Valeur
      </div>
    </div>
  </div>
</div>
```

### Section graphique

```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 p-6">
  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
    <Icon className="text-primary-600 dark:text-primary-400" size={20} />
    Titre
  </h2>
  <div className="h-[350px]">
    <ResponsiveContainer>{/* Chart */}</ResponsiveContainer>
  </div>
</div>
```

## Helpers

### formatMW

Formate les valeurs en MW ou GW :

```typescript
const formatMW = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} GW`;
  }
  return `${value.toFixed(0)} MW`;
};
```

### formatHour

Formate l'heure depuis une date ISO :

```typescript
const formatHour = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};
```

## États de la page

### Loading

```tsx
<div className="flex items-center justify-center min-h-[400px]">
  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600" />
</div>
```

### Erreur

```tsx
<div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg">
  <p className="text-red-800 dark:text-red-200">{error}</p>
  <button onClick={fetchData}>Réessayer</button>
</div>
```

### Données manquantes

Affichage d'un empty state avec icône et message explicatif.

## Dépendances

### Frontend

- `recharts` : LineChart, AreaChart, ResponsiveContainer
- `lucide-react` : Sun, Wind, Info, Leaf, Zap, TrendingUp, BarChart3

### APIs clients

- `apps/web/src/api/consumptionFrance.ts`
- `apps/web/src/api/generationForecast.ts`

## Évolutions possibles

- Sélecteur de période (aujourd'hui, semaine, mois)
- Comparaison avec la moyenne historique
- Prévisions pour les jours suivants
- Export des données (CSV, PDF)
- Intégration avec les données Tempo/EcoWatt
