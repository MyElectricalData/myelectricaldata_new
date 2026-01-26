---
id: signup
---
# Page Inscription

**Route:** `/signup`

## Description

Page permettant aux **nouveaux utilisateurs de créer un compte** et d'obtenir leurs identifiants API (Client ID et Client Secret).

## Fonctionnalités principales

### 1. Formulaire d'inscription

- **Email** : Adresse email de l'utilisateur
  - Validation du format email
  - Vérification de l'unicité (email non déjà utilisé)
- **Mot de passe** : Minimum 8 caractères
  - Bouton pour afficher/masquer le mot de passe
  - Indicateur de force du mot de passe
- **Confirmation du mot de passe**
  - Vérification que les deux mots de passe correspondent
  - Bouton pour afficher/masquer la confirmation

### 2. Protection Cloudflare Turnstile

- Widget Cloudflare Turnstile pour prévenir les abus
- Génération d'un token de validation
- Gestion des erreurs et expirations
- Configuration via `VITE_TURNSTILE_SITE_KEY`

### 3. Validation du formulaire

- Email valide et unique
- Mot de passe d'au moins 8 caractères
- Correspondance des mots de passe
- Token Turnstile valide (si activé)
- Messages d'erreur explicites

### 4. Écran de succès

- Affichage des identifiants API générés :
  - **Client ID** : Identifiant public
  - **Client Secret** : Clé secrète (à conserver précieusement)
- Boutons pour copier les identifiants
- Indication visuelle de copie (check vert)
- Avertissement important : les identifiants ne seront plus affichés
- Bouton pour continuer vers la page de connexion

### 5. Navigation

- Lien vers la page de connexion (si déjà un compte)
- Lien de retour à l'accueil

## Workflow d'inscription

1. L'utilisateur remplit le formulaire avec email et mot de passe
2. Le widget Turnstile génère un token de validation
3. L'utilisateur soumet le formulaire
4. Le backend crée le compte et génère les identifiants API
5. Les identifiants (Client ID et Client Secret) sont affichés
6. L'utilisateur copie et sauvegarde ses identifiants
7. L'utilisateur clique sur "Continuer vers la connexion"
8. Redirection vers `/login` pour se connecter

## Sécurité

- **Mots de passe** : Hashés côté backend (jamais stockés en clair)
- **Client Secret** : Généré aléatoirement, ne sera plus jamais affiché
- **Turnstile** : Protection contre les inscriptions automatisées
- **Validation** : Email unique, mot de passe robuste

## Messages d'erreur

- Email déjà utilisé
- Mots de passe ne correspondent pas
- Mot de passe trop court (< 8 caractères)
- Erreur Turnstile
- Erreur serveur

## Technologies utilisées

- React avec TypeScript
- React Hook Form ou state local
- Cloudflare Turnstile pour la protection anti-bot
- Lucide React pour les icônes (Eye, EyeOff, Copy, Check)
- React Router pour la navigation
- Tailwind CSS pour le style
- Support du mode sombre

## Fichiers liés

- **Frontend** : `apps/web/src/pages/Signup.tsx`
- **Hook** : `apps/web/src/hooks/useAuth.ts`
- **API** : `apps/web/src/api/auth.ts`
- **Types** : `apps/web/src/types/api.ts`
- **Backend** : `apps/api/src/routers/accounts.py`

## Notes importantes

- Les identifiants API (Client ID + Client Secret) sont générés une seule fois
- Le Client Secret ne sera jamais ré-affiché, il doit être sauvegardé immédiatement
- L'utilisateur devra utiliser ces identifiants pour se connecter via `/login`
- Le Turnstile peut être désactivé en développement (variable d'environnement)
- Le mot de passe doit faire au minimum 8 caractères
- L'email doit être unique dans le système
- Après inscription, l'utilisateur doit se connecter avec ses identifiants API
