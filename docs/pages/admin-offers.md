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

- **Liste des 9 fournisseurs** : EDF, Enercoop, TotalEnergies, Priméo Énergie, Engie, ALPIQ, Alterna, Ekwateur, Octopus
- **Total : ~254 offres énergétiques**
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
    - Engie : "Tarifs Engie (HelloWatt)"
    - ALPIQ : "Électricité Stable (PDF officiel)"
    - Alterna : "Électricité verte 100% locale", "100% française", "100% VE"
    - Ekwateur : "Prix kwh électricité et abonnement"
    - Octopus : "Offre électricité tarifs"
  - **Bouton "Modifier les URLs"** (icône Edit2) : Permet d'éditer les URLs des scrapers si elles changent
  - **Bouton "Prévisualiser"** (icône Eye) :
    - Appelle `GET /api/admin/offers/preview?provider=X`
    - Ouvre un modal avec les changements proposés
    - Affiche 3 onglets : Nouvelles offres, Mises à jour, Désactivations
    - **Diff des prix** pour les mises à jour (ancien → nouveau + %)
    - Bouton "Appliquer les changements" pour confirmer (appelle `POST /api/admin/offers/refresh`)
  - **Bouton "Purger"** (icône Trash2, rouge) - Requiert permission `offers.delete` :
    - Supprime **toutes les offres** du fournisseur
    - Affiche une boîte de dialogue de confirmation avant suppression
    - Appelle `DELETE /api/admin/offers/purge?provider=X`
    - Affiche une notification de succès/erreur

### 2. **Modal de Prévisualisation**

Modal interactif qui s'affiche après clic sur "Prévisualiser" :

- **3 onglets avec compteurs** :
  - **Nouvelles offres** : Offres qui seraient créées (fond vert)
  - **Mises à jour** : Offres qui seraient modifiées avec diff des prix (fond bleu)
  - **Désactivations** : Offres qui seraient désactivées (fond rouge)

- **Affichage détaillé** :
  - Pour chaque offre : Nom, Type, Puissance, Prix, Date du tarif
  - Pour les mises à jour : **Ancien prix → Nouveau prix (↗ +X.X% ou ↘ -X.X%)**
  - Indicateurs visuels de couleur selon le type de changement
  - Support de tous les types de tarification : BASE, HC/HP, TEMPO, SEASONAL, Week-end

- **Barre de progression** :
  - S'affiche pendant l'application des changements
  - Progression animée avec pourcentage
  - États : Démarrage (10%) → API (60%) → Invalidation cache (80%) → Terminé (100%)

- **Actions** :
  - Bouton "Annuler" : Ferme le modal sans rien faire
  - Bouton "Appliquer les changements" (icône RefreshCw) : Exécute le refresh et ferme le modal
  - Total des changements affiché en bas du modal

### 3. **Liste des offres**

Tableau interactif regroupé par fournisseur :

- **Organisation** :
  - Offres groupées par fournisseur (sections pliables)
  - Fournisseurs triés alphabétiquement
  - Indicateur de nombre d'offres par fournisseur
  - Actions par fournisseur : Renommer (Edit2), Supprimer (X)

- **Colonnes affichées** :
  - Checkbox de sélection
  - Nom de l'offre (avec alerte ⚠️ si tarif > 6 mois)
  - Type (BASE, BASE_WEEKEND, HC_HP, HC_NUIT_WEEKEND, TEMPO, EJP, SEASONAL)
  - Puissance (kVA)
  - Prix abonnement (€/mois)
  - Prix kWh (avec détail selon le type)
  - Date du tarif (mois/année)
  - Actions (Éditer, Supprimer)

- **Fonctionnalités de sélection** :
  - Sélection individuelle par checkbox
  - Sélection avec SHIFT pour plage de lignes
  - Sélection globale (tout sélectionner/désélectionner)
  - Actions groupées : Activer, Désactiver, Supprimer

- **Tri** :
  - Par nom, type, prix abonnement, prix kWh
  - Icônes de tri (ArrowUp/ArrowDown)

- **Menu contextuel (clic droit)** :
  - Éditer l'offre
  - Supprimer l'offre

### 4. **Filtrage et recherche**

Section de filtres avec icône Filter :

- **Recherche** : Champ texte pour filtrer par nom d'offre
- **Fournisseur** : Dropdown avec tous les fournisseurs
- **Type** : Dropdown avec les types d'offre (BASE, BASE_WEEKEND, HC_HP, HC_NUIT_WEEKEND, HC_WEEKEND, SEASONAL, TEMPO, EJP)
- **Puissance** : Dropdown avec les puissances (3, 6, 9, 12, 15, 18, 24, 30, 36 kVA)
- **Compteur** : Affichage du nombre d'offres trouvées et sélectionnées
- **Toggle** : Afficher/masquer les alertes de tarifs anciens (> 6 mois)

### 5. **Modification d'offre**

Modal d'édition avec formulaire complet :

- **Informations générales** : Nom de l'offre
- **Période de validité** : Date d'application et fin de validité (optionnelle)
- **Puissance et abonnement** : kVA et prix mensuel
- **Tarifs selon le type** :
  - **BASE** : Prix semaine + Prix week-end (optionnel)
  - **HC/HP** : Prix HC/HP semaine + Prix HC/HP week-end (optionnel)
  - **TEMPO** : 6 prix (Bleu HC/HP, Blanc HC/HP, Rouge HC/HP)
  - **EJP** : Prix Normal + Prix Pointe
  - **SEASONAL** : Hiver HC/HP, Été HC/HP, Jour de pointe (optionnel)
- **Description** : Champ texte optionnel

### 6. **Suppression d'offre**

- Suppression individuelle via bouton Trash2
- Suppression multiple via sélection + bouton "Supprimer (N)"
- Confirmation obligatoire avant suppression (modal de confirmation)

## Permissions requises

- **Permission `offers`** : Lecture des offres, prévisualisation des changements
- **Permission `offers.edit`** : Modification des offres et des URLs scrapers
- **Permission `offers.delete`** : Suppression des offres, purge des fournisseurs

## Technologies utilisées

- React avec TypeScript
- React Query (useQuery, useMutation) pour les mutations et le cache
- Tailwind CSS pour le style
- Lucide React pour les icônes
- React Hot Toast pour les notifications
- Support complet du mode sombre

## Fichiers liés

- **Frontend** :
  - Page : `apps/web/src/pages/AdminOffers.tsx`
  - API Client : `apps/web/src/api/energy.ts`
  - Types : `apps/web/src/types/api.ts`
- **Backend** :
  - Router énergie : `apps/api/src/routers/energy_offers.py`
  - Router admin : `apps/api/src/routers/admin.py` (endpoints preview/refresh/purge)
  - Service scraping : `apps/api/src/services/price_update_service.py`
  - Scrapers : `apps/api/src/services/price_scrapers/`

## Navigation

Cette page est accessible via le **menu de navigation supérieur** : **Admin → Offres**

Le menu Admin regroupe toutes les pages d'administration :

- Tableau de bord, Utilisateurs, Offres, TEMPO, EcoWatt, Contributions, Rôles, Logs, Ajouter PDL

## Notes importantes

- Les offres désactivées ne sont plus proposées dans le simulateur
- Les tarifs anciens (> 6 mois) sont signalés avec une alerte ⚠️
- Les puissances souscrites sont en kVA (3, 6, 9, 12, 15, 18, 24, 30, 36)
- Les offres TEMPO ont 6 tarifs différents (3 couleurs × 2 périodes)
- Les offres SEASONAL supportent les tarifs Hiver/Été + Jour de pointe optionnel
- Les offres Week-end ont des tarifs différenciés semaine/week-end
- Le scraper est disponible pour 9 fournisseurs : EDF, Enercoop, TotalEnergies, Priméo Énergie, Engie, ALPIQ, Alterna, Ekwateur, Octopus
- Les logos des fournisseurs sont chargés via Clearbit Logo API

## Endpoints API

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/admin/offers/preview` | GET | Prévisualisation des changements (DRY RUN) |
| `/api/admin/offers/refresh` | POST | Application des changements |
| `/api/admin/offers/purge` | DELETE | Suppression de toutes les offres d'un fournisseur |
| `/api/energy/providers` | GET | Liste des fournisseurs |
| `/api/energy/offers` | GET | Liste des offres |
| `/api/energy/offers/{id}` | PUT | Mise à jour d'une offre |
| `/api/energy/offers/{id}` | DELETE | Suppression d'une offre |
| `/api/energy/providers/{id}` | PUT | Mise à jour d'un fournisseur |
| `/api/energy/providers/{id}` | DELETE | Suppression d'un fournisseur
