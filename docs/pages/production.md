# Production

**Route:** `/production`

Voir la spécification complète dans `.claude/commands/production.md` pour tous les détails techniques.

## Description

Page équivalente à `/consumption` mais pour la **production d'énergie solaire**.

## Différences avec /consumption

### Retiré
- ❌ Puissance maximum
- ❌ HC/HP (heures creuses/pleines)
- ❌ Section PowerPeaks
- ❌ Composants HcHpDistribution et MonthlyHcHp

### Conservé
- ✅ Données journalières (3 ans max)
- ✅ Données détaillées (2 ans max, intervalles 30min)
- ✅ Graphiques annuels (production par année)
- ✅ Courbe de charge détaillée (par jour)
- ✅ Cache day-by-day
- ✅ Auto-load pour démo
- ✅ Sections always-visible

## Fonctionnalités principales

### 1. Configuration
- Sélecteur PDL intelligent :
  - **PDLs de consommation avec production liée** : Affiche les PDLs de consommation qui ont un `linked_production_pdl_id`
  - **PDLs de production standalone** : Affiche les PDLs de production non liés à un PDL de consommation
  - **Masquage automatique** : Les PDLs de production liés à un PDL de consommation sont masqués du sélecteur
- Bouton "Récupérer 3 ans d'historique de production"
- LoadingProgress (2 tâches : Quotidien + Détaillé)
- **Bannière informative** : Affichée quand un PDL de consommation avec production liée est sélectionné

### 2. Statistiques de production
- Cartes par année (kWh produits)
- Total production sur 3 périodes glissantes

### 3. Graphiques de production
- Production mensuelle par année
- Courbe annuelle de production

### 4. Courbe de production détaillée
- Graphique 30min par jour
- Navigation par semaine
- Total journalier en kWh
- **Carousel responsive** : Ajuste automatiquement le nombre de jours affichés selon la largeur d'écran (3-14 jours)
- **Comparaisons temporelles** : Semaine -1 et Année -1 avec indicateurs visuels
- **Calendrier interactif** : Sélection rapide d'une date spécifique

## Technologies

- React avec TypeScript
- React Query
- Recharts
- Tailwind CSS
- ModernButton component (glassmorphism + gradients)

## Fichiers liés

- **Frontend** : `apps/web/src/pages/Production/`
- **Hooks** : `useProductionData.ts`, `useProductionFetch.ts`, `useProductionCalcs.ts`
- **API** : `apps/web/src/api/enedis.ts`
- **Backend** : `apps/api/src/routers/enedis.py`

## État actuel

✅ Structure créée et complète
✅ Hooks implémentés (sans puissance ni HC/HP)
✅ Page principale fonctionnelle
✅ Route et navigation configurées (icône Sun ☀️)
✅ Design moderne avec ModernButton
✅ **Gestion des PDLs liés** : Affichage et masquage intelligents
✅ **Carousel responsive** : Hook useResponsiveDayCount implémenté
✅ **Bannière informative** : Pour les PDLs de consommation avec production liée
✅ Graphiques détaillés implémentés

## Gestion des PDLs de production liés

### Principe

Lorsqu'un PDL de production (ex: "Ioul Production") est lié à un PDL de consommation (ex: "Maison") via le champ `linked_production_pdl_id`, la page Production affiche le PDL de consommation dans le sélecteur et masque le PDL de production.

### Comportement

#### Sélecteur de PDL
- **Affichés** :
  - PDLs de consommation avec `linked_production_pdl_id` renseigné
  - PDLs de production standalone (non liés)
- **Masqués** :
  - PDLs de production liés à un PDL de consommation

#### Exemple concret

```typescript
// Configuration
PDL "Maison" (consommation) {
  usage_point_id: "00987654321098",
  has_consumption: true,
  has_production: false,
  linked_production_pdl_id: "uuid-ioul-production"
}

PDL "Ioul Production" (production) {
  id: "uuid-ioul-production",
  usage_point_id: "00123456789012",
  has_production: true,
  has_consumption: false
}

// Résultat dans le sélecteur
✅ "Maison" → Visible dans le sélecteur
❌ "Ioul Production" → Masqué du sélecteur

// Données affichées quand "Maison" est sélectionné
→ Récupère les données de production de "00123456789012" (Ioul Production)
→ Bannière : "Vous consultez les données de production du PDL Ioul Production lié au PDL de consommation Maison"
```

### Conversion ID → usage_point_id

**Important** : Le champ `linked_production_pdl_id` contient l'**ID UUID** (base de données interne), pas le `usage_point_id`. La page effectue automatiquement la conversion :

```typescript
// Conversion UUID → usage_point_id pour les API Enedis
const linkedPdl = pdls.find(p => p.id === pdlDetails.linked_production_pdl_id)
const actualProductionPDL = linkedPdl.usage_point_id // "00123456789012"

// Utilisation dans les requêtes API
GET /api/enedis/production/daily/{actualProductionPDL}
```

### Bannière informative

Quand un PDL de consommation avec production liée est sélectionné, une bannière verte s'affiche :

- **Icône** : ⚡ Éclair (symbolise l'énergie)
- **Titre** : "Production liée affichée"
- **Message** : "Vous consultez les données de production du PDL [Nom Production] lié au PDL de consommation [Nom Consommation]"
- **Info** : Indication qu'une vue combinée est disponible sur `/consumption`

### Message d'avertissement

Le message "Ce PDL n'a pas l'option production activée" est **automatiquement masqué** si le PDL a un `linked_production_pdl_id` renseigné, même si `has_production = false`.

## Design moderne

### Boutons modernisés

La page utilise le composant `ModernButton` pour une expérience utilisateur améliorée :

**Bouton "Récupérer l'historique de production"** :
- Variant : `primary` avec gradient bleu
- Taille : `lg` (large) avec `fullWidth`
- États : Loading avec spinner, icône Lock en mode démo
- Gestion automatique du disabled state

**Boutons d'accès rapide** (Hier, Semaine dernière, Il y a un an) :
- Variant : `secondary` avec fond transparent
- Taille : `sm` (compact)
- Effet glassmorphism avec bordure

**Onglets de sélection d'années** :
- Variant : `tab` avec état actif/inactif
- Multi-sélection supportée
- Scrollbar cachée avec `.no-scrollbar`
- Transitions optimisées GPU

**Boutons d'export** :
- Variant : `gradient` (bleu → indigo → violet)
- Icône Download intégrée
- Double présence pour responsive (desktop/mobile)

**Bouton "Réinitialiser" (zoom)** :
- Gradient personnalisé (purple → pink)
- Affichage conditionnel si zoom actif
- Icône ZoomOut

### Avantages du design

- **Glassmorphism** : Effet de transparence avec backdrop-blur
- **Gradients animés** : Shine effect au hover
- **Performance** : Animations GPU-accelerated
- **Accessibilité** : Support complet des attributs ARIA
- **Dark mode** : Variantes optimisées pour mode sombre
- **Responsive** : Adapté mobile avec boutons full-width et grid responsive

Voir documentation complète : `docs/design/components/07-buttons.md`
