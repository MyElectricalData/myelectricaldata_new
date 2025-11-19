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
- Sélecteur PDL (filtrés sur `has_production = true`)
- Bouton "Récupérer 3 ans d'historique de production"
- LoadingProgress (2 tâches : Quotidien + Détaillé)

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
⚠️ Graphiques détaillés à implémenter

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
