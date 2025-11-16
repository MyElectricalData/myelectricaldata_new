# Landing Page (Accueil)

**Route:** `/`

## Description

Page d'accueil **publique** de MyElectricalData qui présente le service aux visiteurs non authentifiés et sert de point d'entrée principal à l'application.

**Particularité** : Cette page n'utilise PAS le Layout.tsx standard - elle possède son propre header custom intégré.

## Fonctionnalités principales

### 1. Header

- **Logo** : Logo complet (desktop) / Logo simple (mobile)
- **Bouton Donation** : Lien PayPal avec icône cœur (Heart)
- **Toggle Dark Mode** : Icône Sun/Moon pour basculer entre les thèmes
- **Navigation authentification** :
  - **Non connecté** : Bouton "Se connecter"
  - **Connecté** : Bouton "Dashboard"

### 2. Hero Section

**Gradient background** : `bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800`

- **Titre H1** : "Accédez à vos données Linky"
- **Description** : Présentation de MyElectricalData comme passerelle Enedis
- **CTA (Call-to-Action)** :
  - **Non authentifié** :
    - Bouton principal "Démarrer" → `/signup`
    - Bouton secondaire "Se connecter" → `/login`
  - **Authentifié** :
    - Bouton "Accéder au dashboard" → `/dashboard`

### 3. Sections informatives

#### Section 1 : Pourquoi utiliser MyElectricalData ?

**Background** : `bg-gray-100 dark:bg-gray-800` avec bordures

Explique :
- Le passage d'Enedis à OAuth2.0
- La nécessité d'une passerelle pour les particuliers
- La gestion des couches de sécurité

#### Section 2 : Puis-je appeler directement Enedis ?

**Background** : `bg-white dark:bg-gray-900`

Explique :
- **Non** pour les particuliers
- **Oui** pour les sociétés (avec contrat)
- Card info : Nécessité d'une entité juridique (société/association)

#### Section 3 : Comment ça marche ?

**Background** : `bg-gray-100 dark:bg-gray-800` avec bordures

Grid 3 colonnes (responsive : 1 colonne mobile, 3 desktop) :

1. **Création de compte** (Icône Key)
   - Création compte
   - Obtention client_id/client_secret

2. **Consentement Enedis** (Icône Shield)
   - Autorisation via portail Enedis
   - Données sous contrôle utilisateur

3. **Accès aux données** (Icône Zap)
   - Utilisation de l'API
   - Récupération consommation/production

#### Section 4 : Données personnelles et cache

**Background** : `bg-white dark:bg-gray-900`

Explique :
- Limites API Enedis (5 appels/seconde)
- Système de cache chiffré
- Option d'utilisation du cache

#### Section 5 : Fonctionnalités

**Background** : `bg-gray-100 dark:bg-gray-800` avec bordures

Grid 2 colonnes (responsive : 1 colonne mobile) avec cards :

1. 🔒 **Sécurité maximale**
   - Données chiffrées avec clé API
   - Protection par identifiants

2. ⚡ **Cache intelligent**
   - Respect quotas Enedis
   - Amélioration performances

3. 📊 **Données complètes**
   - Consommation, production, puissance
   - Contrat, adresse, etc.

4. 🔄 **Gestion OAuth2.0**
   - Authentification complète
   - Gestion automatique tokens

#### Section 6 : Qui suis-je ?

**Background** : `bg-white dark:bg-gray-900`

Présentation de l'auteur :
- Particulier passionné domotique/informatique
- Aide à la communauté
- Accès aux données Enedis

#### Section 7 : CTA Final

**Background** : `bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-800`

- **Titre** : "Prêt à commencer ?"
- **Description** : Création compte gratuite
- **CTA** : Bouton "Créer mon compte" → `/signup` (si non authentifié)

## Design

### Couleurs

- **Primary gradient** : `from-primary-50 to-white` / `dark:from-gray-900 dark:to-gray-800`
- **Sections alternées** : `bg-gray-100 dark:bg-gray-800` / `bg-white dark:bg-gray-900`
- **Cards** : `card` class (définie globalement)
- **Icônes** : `text-primary-600 dark:text-primary-400`

### Typographie

- **H1** : `text-3xl sm:text-4xl lg:text-5xl font-bold`
- **H2** : `text-2xl sm:text-3xl font-bold`
- **H3** : `text-xl font-semibold`
- **Paragraphes** : `text-gray-600 dark:text-gray-400`

### Responsive

- **Mobile-first** : Grid colonnes s'adaptent (1 → 2 → 3)
- **Espacement** : Padding/margin adaptés (12/20 → 16/24)
- **Textes** : Tailles adaptées via `sm:` et `lg:`

### Icônes (Lucide React)

- **ArrowRight** : CTA buttons
- **Shield** : Sécurité/Consentement
- **Zap** : Données/Électricité
- **Key** : Authentification/Credentials
- **Moon/Sun** : Toggle dark mode
- **Heart** : Donation

## Comportement conditionnel

### Selon état d'authentification

**Non authentifié** :
- Header : Bouton "Se connecter"
- Hero : Boutons "Démarrer" + "Se connecter"
- CTA Final : Bouton "Créer mon compte"

**Authentifié** :
- Header : Bouton "Dashboard"
- Hero : Bouton "Accéder au dashboard"
- CTA Final : Masqué

## Technologies

- React avec TypeScript
- React Router (Link, navigation)
- Lucide React (icônes)
- Tailwind CSS
- Zustand (themeStore)

## Composants & Hooks

- **Link** (react-router-dom) : Navigation interne
- **useAuth** : Hook pour état d'authentification (`@/hooks/useAuth`)
- **useThemeStore** : Store Zustand pour dark mode (`@/stores/themeStore`)

## Fichiers liés

**Frontend :**
- [apps/web/src/pages/Landing.tsx](../../apps/web/src/pages/Landing.tsx)
- [apps/web/src/stores/themeStore.ts](../../apps/web/src/stores/themeStore.ts)
- [apps/web/src/hooks/useAuth.ts](../../apps/web/src/hooks/useAuth.ts)

**Configuration :**
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) : Route `/`

## SEO & Accessibilité

- **Images alt** : Logo avec description complète ("MyElectricalData - Vos données Linky chez vous")
- **aria-label** : Toggle theme button
- **target="_blank" + rel="noopener noreferrer"** : Lien externe donation
- **Semantic HTML** : `<header>`, `<nav>`, `<section>`
- **Responsive** : Mobile-first, tous breakpoints supportés (sm, lg)
- **Keyboard navigation** : Tous les boutons et liens accessibles au clavier

## Liens externes

- **Donation PayPal** : <https://www.paypal.com/donate?token=YS8EyJdh1jxVY3jqnIQu_YUPEyqp6buLbtfT7aDF8iPI78NF8ajvCUrmXtE4KJjbVjrB5_RfWwtaG2gR>

## Notes importantes

- Page **publique** : Accessible sans authentification
- **Point d'entrée** principal de l'application
- **Aucun Layout** : Header et sections custom (pas de Layout.tsx standard)
- **Logo** : 2 versions (full `/logo-full.png` pour desktop, simple `/logo.svg` pour mobile)
- **Dark mode** : Supporté sur tous les éléments avec classes Tailwind
- **Gradient** : Utilise `primary-50` pour cohérence visuelle avec le design system
- **Conditional rendering** : Contenu adapté selon état d'authentification (useAuth)
- **Mobile responsive** : Textes et boutons adaptés (masquage/affichage conditionnel)
