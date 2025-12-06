# Page Contribuer

**Route:** `/contribute`

## Description

Page permettant aux **utilisateurs de contribuer en ajoutant des offres d'énergie** qui ne sont pas encore dans la base de données.

## Fonctionnalités principales

### 1. Formulaire de contribution

- **Type de contribution** :
  - Nouvelle offre (fournisseur existant)
  - Nouveau fournisseur + offre
  - Mise à jour d'une offre existante
- Sélection du fournisseur d'énergie (ou création d'un nouveau)
- Nom de l'offre
- Type d'offre (BASE, HP/HC, TEMPO, EJP, WEEKEND, SEASONAL)
- Puissance souscrite (3 à 36 kVA)
- Prix de l'abonnement mensuel
- Prix du/des kWh selon le type :
  - **BASE** : 1 tarif unique
  - **HP/HC** : 2 tarifs (Heures Pleines / Heures Creuses)
  - **TEMPO** : 6 tarifs (Bleu HP/HC, Blanc HP/HC, Rouge HP/HC)
  - **EJP** : 2 tarifs (Normal / Pointe Mobile)
  - **WEEKEND** : Tarifs semaine + week-end
  - **SEASONAL** : Tarifs été/hiver avec option jour de pointe
- **Documentation requise** :
  - Lien vers la fiche tarifaire officielle (obligatoire)
  - Screenshot de la fiche des prix (optionnel)

### 2. Validation des données

- Vérification que tous les champs requis sont remplis
- Validation du format des prix (nombre positif)
- Vérification de la cohérence des données selon le type d'offre

### 3. Soumission

- Envoi de la contribution aux administrateurs
- Message de confirmation après soumission
- Notification visuelle du statut

### 4. Mes contributions

Section affichant les contributions de l'utilisateur, organisée par statut :

#### Organisation par accordéons
- **En attente** (jaune) : déplié par défaut
- **Approuvées** (vert) : plié par défaut
- **Rejetées** (rouge) : plié par défaut

#### Affichage compact des contributions
- **En-tête** : nom de l'offre, badges (type, puissance), fournisseur, date, description tronquée
- **Tarification inline** : prix affichés sur une ligne (Abo, Base, HC/HP, Tempo, EJP...)
- **Lien documentation** : icône cliquable vers la fiche tarifaire
- **Motif de rejet** : affiché en bas pour les contributions rejetées

#### Actions disponibles
- **Bouton "Modifier"** (compact, bleu/orange) : pour les contributions en attente ou rejetées
- Active le **mode édition** du formulaire :
  - Le titre du formulaire devient "Modifier la contribution"
  - Le bouton de soumission devient "Mettre à jour la contribution"
  - Un lien "Annuler l'édition" permet de revenir au mode création
- La mise à jour modifie la contribution existante au lieu d'en créer une nouvelle
- Les contributions rejetées passent automatiquement en statut "pending" après modification

### 5. Système de messagerie

Communication bidirectionnelle entre l'administrateur et le contributeur :

#### Section "Échanges" dépliable
- **Visible pour** : contributions en attente (avec ou sans messages) ou avec messages existants
- **Auto-déploiement** : s'ouvre automatiquement si le dernier message est de l'admin (non lu)
- **Badge "Nouveau"** : affiché quand il y a un message non lu
- **Protection anti-perte** : impossible de replier si l'utilisateur est en train d'écrire ou d'envoyer

#### Affichage des messages (compact)
- Messages différenciés visuellement :
  - Messages admin (Modo) : fond bleu avec icône bouclier
  - Messages contributeur (Vous) : fond vert avec icône utilisateur
- Horodatage compact (JJ/MM HH:MM)
- **Auto-scroll** vers le dernier message

#### Formulaire de réponse intégré
- Champ de saisie compact (1 ligne) directement dans la section Échanges
- Envoi avec Entrée (Shift+Entrée pour nouvelle ligne)
- Bouton d'envoi icône uniquement
- **Rafraîchissement automatique** toutes les 10 secondes

### 6. Import JSON (fonctionnalité avancée)

- Import en masse d'offres via fichier JSON
- Progression affichée pendant l'import
- Gestion des erreurs par offre

## Modération

- Les contributions sont vérifiées par les administrateurs avant publication
- Les administrateurs peuvent :
  - Approuver une contribution (ajout automatique à la base)
  - Rejeter avec un motif
  - Demander des informations complémentaires via le chat
- Les utilisateurs sont notifiés du statut via le rafraîchissement automatique

## Technologies utilisées

- React avec TypeScript
- React Query pour les mutations, le cache et le polling (refetchInterval)
- Tailwind CSS pour le style
- Support complet du mode sombre
- useMemo pour le groupement par statut
- useRef pour la gestion du scroll des messages

## Fichiers liés

- **Frontend** :
  - Page : `apps/web/src/pages/Contribute.tsx`
  - API client : `apps/web/src/api/energy.ts`
- **Backend** :
  - Routes : `apps/api/src/routers/energy_offers.py`
  - Modèles : `apps/api/src/models/energy_provider.py`
    - `OfferContribution` : contribution soumise
    - `ContributionMessage` : messages échangés

## Endpoints API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/energy/contribute` | Soumettre une nouvelle contribution |
| PUT | `/energy/contributions/{id}` | Modifier une contribution existante |
| GET | `/energy/contributions` | Récupérer ses contributions avec messages |
| POST | `/energy/contributions/{id}/reply` | Répondre à un message admin |

## Notes importantes

- Les contributions aident à enrichir la base de données pour tous les utilisateurs
- Les tarifs doivent être récents et vérifiables
- Un lien vers la fiche tarifaire officielle est obligatoire
- Les contributeurs peuvent modifier et resoumettre leurs contributions en attente ou rejetées
