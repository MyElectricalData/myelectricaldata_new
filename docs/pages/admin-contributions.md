# Page Administration - Gestion des contributions

## Directives d'agent

- **Pour l'UX/UI** (interface, composants, design) : Utiliser l'agent **frontend-specialist**
- **Pour le backend** (API, base de données, logique métier) : Utiliser l'agent **backend-specialist**

Tu travailles sur la page `/admin/contributions` de l'application MyElectricalData.

## Description de la page

Cette page permet aux **administrateurs de modérer les contributions d'offres d'énergie** soumises par les utilisateurs.

## Fonctionnalités implémentées

### 1. Statistiques (en haut de page)

Cards affichant :
- **En attente** : Nombre de contributions à traiter (icône Clock, bleu)
- **Validées ce mois** : Contributions approuvées ce mois (icône CheckCircle, vert)
- **Rejetées** : Total des contributions rejetées (icône XCircle, rouge)
- **Total validées** : Nombre total de contributions approuvées (icône Users, violet)

**Top contributeurs** : Section dédiée affichant les 5 meilleurs contributeurs avec :
- Avatar avec initiales
- Email du contributeur
- Badge avec nombre de contributions validées

### 2. Filtrage et recherche

- **Recherche** : Par nom d'offre ou email du contributeur
- **Filtre par type d'offre** : Tous, BASE, HC/HP, TEMPO, EJP
- **Tri par date** : Plus récent / Plus ancien (bouton toggle)

### 3. Liste des contributions

Chaque contribution affiche :
- Checkbox de sélection (pour actions en masse)
- Nom de l'offre et badge type (Nouvelle offre, Nouveau fournisseur, Mise à jour)
- Email du contributeur et date de soumission
- Informations du fournisseur (existant ou nouveau)
- Tarification proposée (abonnement, prix kWh selon le type)
- Documentation (lien vers fiche des prix, screenshot)

### 4. Système de messagerie

- **Bouton "Voir les échanges"** : Toggle pour afficher/masquer l'historique
- **Indicateur de message non lu** : Point orange clignotant si le contributeur a répondu
- **Persistance** : Les contributions lues sont mémorisées dans localStorage
- **Réponse rapide** : Champ de texte inline pour répondre directement au contributeur
- **Historique des échanges** : Messages affichés avec distinction admin/contributeur

### 5. Actions individuelles

- **Approuver** (bouton vert) : Ouvre modal de confirmation
- **Demander des infos** (bouton bleu) : Ouvre modal avec champ de message
- **Rejeter** (bouton rouge) : Ouvre modal avec raisons prédéfinies :
  - Tarifs incorrects ou obsolètes
  - Offre déjà existante dans la base
  - Informations incomplètes
  - Source non vérifiable
  - Fournisseur non reconnu
  - Autre (commentaire libre)

### 6. Actions en masse

- **Sélection multiple** : Checkboxes sur chaque contribution
- **Sélectionner tout** : Checkbox en entête
- **Barre d'actions flottante** (apparaît quand items sélectionnés) :
  - Compteur de sélection
  - Bouton "Approuver" (vert)
  - Bouton "Rejeter" (rouge) avec modal pour raison
  - Bouton "Annuler"

### 7. Auto-refresh

- Rafraîchissement automatique toutes les 30 secondes
- Rafraîchissement au focus de la fenêtre
- Invalidation du cache après chaque action

## Endpoints API utilisés

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/energy/contributions/pending` | GET | Liste des contributions en attente |
| `/energy/contributions/stats` | GET | Statistiques des contributions |
| `/energy/contributions/{id}/approve` | POST | Approuver une contribution |
| `/energy/contributions/{id}/reject` | POST | Rejeter une contribution |
| `/energy/contributions/{id}/request-info` | POST | Demander des infos au contributeur |
| `/energy/contributions/{id}/messages` | GET | Historique des messages |
| `/energy/contributions/bulk-approve` | POST | Approbation en masse |
| `/energy/contributions/bulk-reject` | POST | Rejet en masse |

## Workflow de modération

1. Utilisateur soumet une contribution via `/contribute`
2. Contribution apparaît avec statut "En attente"
3. Si le contributeur répond à une demande d'info, un indicateur clignote
4. Administrateur examine la contribution
5. Administrateur peut dialoguer via la réponse rapide
6. Administrateur valide ou rejette
7. Utilisateur reçoit une notification par email
8. Si validée, l'offre est ajoutée à la base de données

## Permissions requises

- **Permission** : `contributions` (vérifiée par `require_permission('contributions')`)

## Technologies utilisées

- React avec TypeScript
- React Query pour les mutations, cache et auto-refresh
- Tailwind CSS pour le style
- localStorage pour persister les contributions lues
- Support complet du mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/AdminContributions.tsx`
- **API Client** : `apps/web/src/api/energy.ts`
- **Backend** : `apps/api/src/routers/energy_offers.py`

## Navigation

Cette page est accessible via le **menu de navigation** : **Admin > Contributions**

## Notes techniques

- Les messages non lus sont détectés côté backend (`has_unread_messages`)
- Le dernier message du contributeur (non admin) déclenche l'indicateur
- Les contributions lues sont stockées dans `localStorage['admin-read-contributions']`
- Le cache React Query est invalidé après chaque action pour synchroniser l'affichage
