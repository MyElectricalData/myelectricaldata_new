---
name: production
id: production
path: /production
description: Visualisation et analyse de la production d'energie solaire
mode_client: true
mode_server: true
menu: Production
---

# Production

Visualisation et analyse de la production d'énergie solaire avec graphiques détaillés et statistiques.

## Features

| Feature                               | Statut | Mode           |
| ------------------------------------- | ------ | -------------- |
| Données journalières (3 ans max)      | FAIT   | Serveur+Client |
| Données détaillées 30min (2 ans max)  | FAIT   | Serveur+Client |
| Graphiques production par année       | FAIT   | Serveur+Client |
| Courbe de charge détaillée par jour   | FAIT   | Serveur+Client |
| Cache day-by-day                      | FAIT   | Serveur+Client |
| Auto-load pour compte démo            | FAIT   | Serveur+Client |
| Sections always-visible               | FAIT   | Serveur+Client |
| Gestion PDLs liés conso-production    | FAIT   | Serveur+Client |
| Carousel responsive (3-14 jours)      | FAIT   | Serveur+Client |
| Comparaisons temporelles (S-1, A-1)   | FAIT   | Serveur+Client |
| Calendrier interactif                 | FAIT   | Serveur+Client |
| Bannière PDL lié                      | FAIT   | Serveur+Client |

## Différences avec /consumption

| Élément               | Consumption | Production |
| --------------------- | ----------- | ---------- |
| Puissance maximum     | ✅          | ❌         |
| HC/HP                 | ✅          | ❌         |
| Section PowerPeaks    | ✅          | ❌         |
| HcHpDistribution      | ✅          | ❌         |
| MonthlyHcHp           | ✅          | ❌         |
| Données journalières  | ✅          | ✅         |
| Données détaillées    | ✅          | ✅         |
| Graphiques annuels    | ✅          | ✅         |
| Courbe détaillée      | ✅          | ✅         |

## Fichiers

| Type       | Fichier                                              |
| ---------- | ---------------------------------------------------- |
| Page       | `apps/web/src/pages/Production/index.tsx`            |
| Composants | `apps/web/src/pages/Production/components/*.tsx`     |
| Hooks      | `apps/web/src/pages/Production/hooks/*.ts`           |
| API        | `apps/web/src/api/enedis.ts`                         |
| Backend    | `apps/api/src/routers/enedis.py`                     |

### Composants

| Composant                  | Rôle                              |
| -------------------------- | --------------------------------- |
| YearlyProductionCards      | Cartes statistiques annuelles     |
| YearlyProduction           | Graphique production annuelle     |
| AnnualProductionCurve      | Courbe de production annuelle     |
| DataFetchSection           | Section récupération données      |
| PDLSelector                | Sélecteur de PDL                  |
| LoadingProgress            | Indicateur de progression         |
| ModernButton               | Bouton stylisé glassmorphism      |

### Hooks

| Hook                | Rôle                              |
| ------------------- | --------------------------------- |
| useProductionData   | Gestion données production        |
| useProductionFetch  | Récupération données API          |
| useProductionCalcs  | Calculs statistiques              |

---

## API Endpoints

### Production journalière

```http
GET /api/enedis/production/daily/{pdl}?start={date}&end={date}
```

**Paramètres :**

- `pdl` : Numéro du point de livraison (14 chiffres)
- `start` : Date début (YYYY-MM-DD)
- `end` : Date fin (YYYY-MM-DD)

### Production détaillée (30 min)

```http
GET /api/enedis/production/load-curve/{pdl}?start={date}&end={date}
```

**Limites Enedis :**

- Données journalières : 1095 jours (3 ans)
- Données détaillées : 730 jours (2 ans)
- Données disponibles : J-1 uniquement

---

## Interface utilisateur

### Sections de la page

| Section                         | Icône      | Collapsible |
| ------------------------------- | ---------- | ----------- |
| Statistiques de production      | Zap        | Oui         |
| Graphiques de production        | BarChart3  | Oui         |
| Courbe de production détaillée  | LineChart  | Oui         |
| Informations importantes        | Info       | Oui         |

### États de la page

| État                  | Comportement                                    |
| --------------------- | ----------------------------------------------- |
| Sans données          | Empty state avec instructions                   |
| Chargement cache      | LoadingOverlay + LoadingPlaceholder flou        |
| Données disponibles   | Sections expanded, graphiques visibles          |
| PDL sans production   | Bannière info bleue avec instructions           |
| PDL lié               | Bannière verte "Production liée affichée"       |

---

## Gestion des PDLs liés

### Sélecteur de PDL

| Type de PDL                              | Visible | Données affichées |
| ---------------------------------------- | ------- | ----------------- |
| Consommation avec `linked_production_pdl_id` | ✅      | PDL lié           |
| Production standalone                    | ✅      | Lui-même          |
| Production lié à une consommation        | ❌      | Via conso         |

### Exemple de liaison

```typescript
// PDL Consommation
{
  usage_point_id: "00987654321098",
  has_consumption: true,
  has_production: false,
  linked_production_pdl_id: "uuid-production"
}

// PDL Production (masqué du sélecteur)
{
  id: "uuid-production",
  usage_point_id: "00123456789012",
  has_production: true
}

// Résultat : Sélectionner "Maison" affiche les données de "00123456789012"
```

### Conversion ID → usage_point_id

```typescript
// linked_production_pdl_id contient l'UUID, pas le usage_point_id
const linkedPdl = pdls.find(p => p.id === pdlDetails.linked_production_pdl_id)
const actualProductionPDL = linkedPdl.usage_point_id
```

---

## Design

### Boutons ModernButton

| Variant   | Usage                          | Style                    |
| --------- | ------------------------------ | ------------------------ |
| primary   | Récupérer historique           | Gradient bleu            |
| secondary | Accès rapide (Hier, S-1, A-1)  | Glassmorphism transparent|
| tab       | Sélection années               | Actif/inactif            |
| gradient  | Export                         | Bleu → Indigo → Violet   |

### Caractéristiques design

- Glassmorphism avec backdrop-blur
- Gradients animés (shine effect au hover)
- Animations GPU-accelerated
- Support complet dark mode
- Responsive mobile-first

---

## Notes techniques

- Cache : Granulaire par jour avec TTL 24h
- Chiffrement : Fernet avec `client_secret` utilisateur
- Rate limiting : 5 req/s niveau adapter, 50 req/jour non-caché
- Auto-load démo : Déclenché si `isDemo` et pas de cache
- Sections : Pattern `AnimatedSection` pour animations fluides
