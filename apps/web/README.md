# MyElectricalData Frontend

Interface web React pour la passerelle API Enedis MyElectricalData.

## Stack Technique

- **React 18** avec TypeScript
- **Vite** pour le build et dev server
- **TailwindCSS** pour le styling avec support du mode sombre
- **React Router** pour la navigation
- **React Query** (@tanstack/react-query) pour la gestion des requêtes API
- **Zustand** pour la gestion d'état global
- **Axios** pour les appels HTTP
- **Lucide React** pour les icônes
- **Vitest** + **React Testing Library** pour les tests

## Prérequis

- Node.js 18+
- npm ou yarn
- Backend API démarré sur http://localhost:8000

## Installation

```bash
npm install
```

## Configuration

Créer un fichier `.env` à la racine (copier depuis `.env.example`) :

```bash
cp .env.example .env
```

Variables d'environnement disponibles :
```
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME=MyElectricalData
```

## Développement

Démarrer le serveur de développement :

```bash
npm run dev
```

L'application sera disponible sur http://localhost:3000

## Build

Créer un build de production :

```bash
npm run build
```

Les fichiers compilés seront dans le dossier `dist/`.

Prévisualiser le build :

```bash
npm run preview
```

## Tests

Lancer les tests unitaires :

```bash
npm test
```

Lancer les tests avec UI :

```bash
npm run test:ui
```

Générer le rapport de couverture :

```bash
npm run test:coverage
```

## Linting

```bash
npm run lint
```

## Structure du Projet

```
src/
├── api/           # Clients API et appels backend
├── components/    # Composants React réutilisables
├── hooks/         # Custom React hooks
├── pages/         # Pages/écrans de l'application
├── stores/        # Stores Zustand (state management)
├── types/         # Types TypeScript
├── utils/         # Fonctions utilitaires
├── test/          # Configuration de test
├── App.tsx        # Composant racine
├── main.tsx       # Point d'entrée
└── index.css      # Styles globaux
```

## Fonctionnalités

### Pages Publiques
- **Landing** (`/`) : Page d'accueil avec présentation du service
- **Login** (`/login`) : Connexion utilisateur
- **Signup** (`/signup`) : Création de compte avec affichage des credentials

### Pages Protégées (nécessitent authentification)
- **Dashboard** (`/dashboard`) : Tableau de bord principal
  - Affichage des identifiants API (client_id/client_secret)
  - Gestion des points de livraison (PDL)
  - Lancement du consentement OAuth Enedis
- **Settings** (`/settings`) : Paramètres du compte
  - Informations du compte
  - Suppression de compte (avec confirmation)
- **OAuth Callback** (`/oauth/callback`) : Page de retour après consentement Enedis

### Fonctionnalités Transverses
- **Mode sombre** : Toggle persistant avec détection système
- **Authentification** : JWT token avec refresh automatique
- **Navigation protégée** : Redirection automatique selon état d'authentification
- **Responsive design** : Mobile, tablette, desktop
- **Accessibilité** : Support clavier et lecteurs d'écran

## API Backend

L'application communique avec le backend FastAPI via les endpoints suivants :

- `POST /accounts/signup` - Création de compte
- `POST /accounts/login` - Connexion
- `GET /accounts/me` - Informations utilisateur
- `GET /accounts/credentials` - Récupération des credentials
- `DELETE /accounts/me` - Suppression de compte
- `GET /pdl` - Liste des PDL
- `POST /pdl` - Ajout d'un PDL
- `DELETE /pdl/:id` - Suppression d'un PDL
- `GET /oauth/authorize` - URL d'autorisation Enedis
- `GET /oauth/callback` - Callback OAuth
- `POST /oauth/refresh/:usage_point_id` - Refresh token

## Parcours Utilisateur Principal

1. **Découverte** : Landing page explique le service
2. **Inscription** : Création de compte → réception client_id/client_secret
3. **Connexion** : Login avec email/password
4. **Configuration** : Ajout de PDL(s) depuis le dashboard
5. **Consentement** : Clic "Consentement" → redirection Enedis → callback
6. **Utilisation** : Credentials disponibles pour appels API

## Développement

### Ajout d'une Nouvelle Page

1. Créer le composant dans `src/pages/`
2. Ajouter la route dans `src/App.tsx`
3. Ajouter la navigation si nécessaire dans `src/components/Layout.tsx`

### Ajout d'un Endpoint API

1. Définir les types dans `src/types/api.ts`
2. Créer/étendre le client dans `src/api/`
3. Créer un custom hook dans `src/hooks/` si nécessaire

## Contribution

- Suivre les conventions de nommage React/TypeScript
- Utiliser les composants utilitaires (btn, input, card) de `index.css`
- Respecter l'accessibilité (labels, aria-*, semantic HTML)
- Tester les composants critiques
- Mode sombre : toujours utiliser les classes Tailwind dark:

## Support Navigateurs

- Chrome/Edge (dernières versions)
- Firefox (dernières versions)
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Code splitting automatique par Vite
- Lazy loading des routes (possibilité d'optimisation future)
- Images optimisées
- CSS purgé en production via Tailwind

## Sécurité

- Token JWT stocké en localStorage
- Client secret masqué par défaut
- Validation des formulaires
- Protection CSRF via tokens
- HTTPS recommandé en production
