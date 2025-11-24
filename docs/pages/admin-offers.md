# Page Administration - Offres d'énergie

## 🎯 Directives d'agent

- **Pour l'UX/UI** (interface, composants, design) : Utiliser l'agent **frontend-specialist**
- **Pour le backend** (API, base de données, logique métier) : Utiliser l'agent **backend-specialist**

Tu travailles sur la page `/admin/offers` de l'application MyElectricalData.

## Description de la page

Cette page permet aux **administrateurs de gérer les offres d'électricité** proposées par les différents fournisseurs d'énergie avec **scraping automatique des tarifs**.

## Fonctionnalités principales

### 1. **Gestion des Fournisseurs** (Nouveau)

Section dédiée à la mise à jour automatique des tarifs via les scrapers :

- **Liste des 8 fournisseurs** : EDF, Enercoop, TotalEnergies, Priméo Énergie, Engie, ALPIQ, Alterna, Ekwateur
- **Total : ~236 offres énergétiques**
- **Pour chaque fournisseur** :
  - **Logo du fournisseur** (via Clearbit Logo API)
  - Nom
  - Nombre d'offres actives
  - **Date du tarif** (affiché dans la tuile)
  - Date de dernière mise à jour
  - **URLs des scrapers** avec labels descriptifs :
    - EDF : "Tarif Bleu (réglementé)", "Zen Week-End (marché)"
    - Enercoop : "Grille tarifaire (PDF officiel)"
    - TotalEnergies : "Offre Essentielle (Eco Electricité)", "Offre Verte Fixe"
    - Priméo Énergie : "Offre Fixe -20% (PDF)"
    - Engie : "Elec Référence 1 an (PDF officiel)"
    - ALPIQ : "Électricité Stable (PDF officiel)"
    - Alterna : "Électricité verte 100% locale", "100% française", "100% VE"
    - Ekwateur : "Prix kwh électricité et abonnement"
  - **Bouton "Modifier les URLs"** : Permet d'éditer les URLs des scrapers si elles changent
  - **Bouton "Prévisualiser"** (icône Eye) :
    - Appelle `GET /api/admin/offers/preview?provider=X`
    - Ouvre un modal avec les changements proposés
    - Affiche 3 onglets : Nouvelles offres, Mises à jour, Désactivations
    - **Diff des prix** pour les mises à jour (ancien → nouveau + %)
    - Bouton "Appliquer les changements" pour confirmer
  - **Bouton "Rafraîchir"** (icône RefreshCw) :
    - Appelle `POST /api/admin/offers/refresh?provider=X`
    - Applique directement les changements
    - Affiche une notification de succès/erreur

### 2. **Modal de Prévisualisation** (Nouveau)

Modal interactif qui s'affiche après clic sur "Prévisualiser" :

- **3 onglets avec compteurs** :
  - **Nouvelles offres** (badge vert) : Offres qui seraient créées
  - **Mises à jour** (badge bleu) : Offres qui seraient modifiées avec diff des prix
  - **Désactivations** (badge rouge) : Offres qui seraient désactivées

- **Affichage détaillé** :
  - Pour chaque offre : Nom, Type, Puissance, Prix
  - Pour les mises à jour : **Ancien prix → Nouveau prix (+ X.X%)**
  - Indicateurs visuels de couleur (vert/bleu/rouge)

- **Actions** :
  - Bouton "Annuler" : Ferme le modal sans rien faire
  - Bouton "Appliquer les changements" : Exécute le refresh et ferme le modal

### 3. **Liste des offres**

   - Tableau avec toutes les offres disponibles
   - Colonnes affichées :
     - Fournisseur
     - Nom de l'offre
     - Type (BASE, HP/HC, TEMPO)
     - Puissance(s) souscrite(s) compatible(s)
     - Prix de l'abonnement
     - Prix du kWh
     - Statut (actif/inactif)
     - Actions

### 4. **Filtrage et recherche**

   - Filtre par fournisseur
   - Filtre par type d'offre
   - Filtre par puissance souscrite
   - Recherche par nom d'offre

### 5. **Création d'offre manuelle** (optionnel)

   - Formulaire de création d'une nouvelle offre
   - Sélection du fournisseur
   - Configuration des tarifs selon le type :
     - **BASE** : prix unique du kWh
     - **HP/HC** : prix HP et prix HC
     - **TEMPO** : 6 prix (Bleu HP/HC, Blanc HP/HC, Rouge HP/HC)
   - Prix de l'abonnement
   - Puissances compatibles

### 6. **Modification d'offre**

   - Édition des tarifs
   - Modification du statut actif/inactif
   - Mise à jour de la puissance souscrite

### 7. **Suppression d'offre**

   - Désactivation ou suppression définitive
   - Confirmation avant suppression

## Permissions requises

- **Rôle** : Administrateur
- **Permission** : `offers:manage`

## Technologies utilisées

- React avec TypeScript
- React Query pour les mutations et le cache
- Tailwind CSS pour le style
- Support du mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/AdminOffers.tsx`
- **API** : `apps/web/src/api/energy.ts`, `apps/web/src/api/admin.ts`
- **Types** : `apps/web/src/types/api.ts`
- **Backend** : `apps/api/src/routers/energy.py`

## Navigation

Cette page est accessible via le **menu de navigation supérieur** : **Admin → Offres**

Le menu Admin regroupe toutes les pages d'administration :

- Tableau de bord, Utilisateurs, Offres, TEMPO, EcoWatt, Contributions, Rôles, Logs, Ajouter PDL

## Notes importantes

- Les offres désactivées ne sont plus proposées dans le simulateur
- Les tarifs doivent être mis à jour régulièrement
- Les puissances souscrites sont en kVA (3, 6, 9, 12, 15, 18, 24, 30, 36)
- Les offres TEMPO ont 6 tarifs différents (3 couleurs × 2 périodes)
