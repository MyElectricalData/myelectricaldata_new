---
name: root
id: root
path: /
description: Page d'accueil présentant le service MyElectricalData aux visiteurs
mode_client: false
mode_server: true
menu: null
---

# Page d'accueil

Page d'accueil publique de MyElectricalData présentant le service aux visiteurs non authentifiés. Point d'entrée principal de l'application en mode serveur.

## Features

| Feature                              | Statut | Mode    |
| ------------------------------------ | ------ | ------- |
| Header glassmorphism au scroll       | FAIT   | Serveur |
| Typing effect sur le titre H1        | FAIT   | Serveur |
| Particules connectées (Canvas)       | FAIT   | Serveur |
| Compteurs animés au scroll           | FAIT   | Serveur |
| Timeline interactive 5 étapes        | FAIT   | Serveur |
| Cards fonctionnalités avec brillance | FAIT   | Serveur |
| Section client auto-hébergé          | FAIT   | Serveur |
| Section donation avec modale         | FAIT   | Serveur |
| CTA conditionnel selon auth          | FAIT   | Serveur |
| Dark mode complet                    | FAIT   | Serveur |
| Responsive mobile/desktop            | FAIT   | Serveur |
| Easter egg Konami Code               | FAIT   | Serveur |

## Raccourcis clavier

| Touche                     | Action                                    |
| -------------------------- | ----------------------------------------- |
| `↑↑↓↓←→←→BA` (Konami Code) | Transforme les particules en cœurs/bisous |

## Fichiers

| Type       | Fichier                                     |
| ---------- | ------------------------------------------- |
| Page       | `apps/web/src/pages/Landing.tsx`            |
| Composants | `apps/web/src/components/DonationModal.tsx` |
| Stores     | `apps/web/src/stores/themeStore.ts`         |
| Hooks      | `apps/web/src/hooks/useAuth.ts`             |
| Route      | `apps/web/src/App.tsx` (ligne 170)          |

---

## Interface utilisateur

### Sections de la page

| Section                   | Description                                         |
| ------------------------- | --------------------------------------------------- |
| Header                    | Fixe, glassmorphism, apparaît après 100px de scroll |
| Hero                      | Titre animé, particules Canvas, CTA principal       |
| Stats                     | 3 compteurs animés (99%, 100%, 5/s)                 |
| Pourquoi MyElectricalData | Explication OAuth2.0 Enedis                         |
| Comment ça marche         | Timeline 5 étapes avec alerte "deux comptes"        |
| Fonctionnalités           | 5 cards avec effet brillance au hover               |
| Données protégées         | 2 cards (cache multi-niveaux, chiffrement)          |
| Client auto-hébergé       | 3 intégrations (HA, MQTT, InfluxDB) + avantages     |
| Soutenez le projet        | Explication modèle gratuit + bouton donation        |
| CTA Final                 | Gradient animé + bouton inscription                 |
| Footer                    | Minimaliste                                         |

### Header (Glassmorphism)

Apparaît après 100px de scroll avec `backdrop-blur-md`.

**Éléments :**

| Élément      | Desktop          | Mobile      |
| ------------ | ---------------- | ----------- |
| Logo         | `/logo-full.png` | `/logo.svg` |
| GitHub       | Icône + texte    | Icône seule |
| Donation     | Icône + texte    | Icône seule |
| Theme toggle | Sun/Moon         | Sun/Moon    |
| Auth button  | "Se connecter"   | "Connexion" |

### Hero Section

**Fond animé :**

- `ConnectedParticles` : 60 particules Canvas avec lignes de connexion
- Distance max connexion : 150px
- Cercles décoratifs avec blur et pulse

**Texte :**

- Typing effect : 50ms par caractère
- Badge : "100% Gratuit & Open Source" avec bounce
- Scroll indicator : ChevronDown animé

### Compteurs animés

| Compteur      | Valeur | Suffix | Note au hover                          |
| ------------- | ------ | ------ | -------------------------------------- |
| Disponibilité | 99     | %      | "\*Quand Enedis n'est pas en vacances" |
| Sécurisé      | 100    | %      | -                                      |
| Requêtes max  | 5      | /s     | -                                      |

### Timeline (Comment ça marche)

| Étape | Icône        | Titre                            | Description                                |
| ----- | ------------ | -------------------------------- | ------------------------------------------ |
| 1     | Key          | Création compte MyElectricalData | Obtention client_id/client_secret          |
| 2     | ExternalLink | Création compte Enedis           | Lien vers mon-compte-particulier.enedis.fr |
| 3     | Shield       | Consentement Enedis              | Autorisation OAuth2 sur enedis.fr          |
| 4     | Zap          | Accès aux données                | Utilisation API                            |
| 5     | BarChart3    | Profitez du service              | Interface web ou client local              |

**Layout responsive :**

- Mobile : Numéros en haut, cartes centrées
- Desktop : Timeline alternée gauche/droite avec ligne centrale

### Cards Fonctionnalités

| Icône     | Titre                 | Description                              |
| --------- | --------------------- | ---------------------------------------- |
| Lock      | Sécurité maximale     | Chiffrement avec clé API personnelle     |
| Zap       | Cache intelligent     | Respect quotas Enedis (5 req/s)          |
| BarChart3 | Données complètes     | Conso, prod, puissance, contrat, adresse |
| RefreshCw | Gestion OAuth2.0      | Auth complète + gestion auto tokens      |
| Container | Déploiement simplifié | Docker + Helm Chart Kubernetes           |

**Effets hover :**

- Brillance : gradient horizontal traversant
- Shadow : MD → 2XL
- Lift : translateY(-8px)
- Icône : scale(1.1) + rotate(6deg)

### Intégrations Client Local

| Intégration    | Icône     | Couleur | Description                            |
| -------------- | --------- | ------- | -------------------------------------- |
| Home Assistant | Home      | Blue    | Tableaux de bord domotique             |
| MQTT           | Radio     | Purple  | Protocole universel (Jeedom, Domoticz) |
| InfluxDB       | LineChart | Orange  | Métriques + Grafana                    |

---

## Composants personnalisés

### useInView Hook

```tsx
const [ref, isInView] = useInView({ threshold: 0.1 });
```

- Utilise `IntersectionObserver`
- Trigger une seule fois
- Threshold : 10% visible

### AnimatedCounter

```tsx
<AnimatedCounter end={99} suffix="%" duration={2000} />
```

| Prop     | Type   | Défaut | Description           |
| -------- | ------ | ------ | --------------------- |
| end      | number | -      | Valeur finale         |
| duration | number | 2000   | Durée animation (ms)  |
| suffix   | string | ""     | Texte après le nombre |

### ConnectedParticles

Canvas animé avec 60 particules connectées.

| Paramètre      | Valeur |
| -------------- | ------ |
| Particules     | 60     |
| Distance max   | 150px  |
| Vitesse        | 0.5    |
| Rayon          | 3-6px  |
| Opacity canvas | 0.4    |

**Easter egg Konami Code :**

- Séquence : `↑↑↓↓←→←→BA` (A ou Q pour AZERTY)
- Toggle : particules → cœurs/bisous 💋
- 30% bisous, 70% cœurs

---

## Animations CSS

| Animation     | Keyframes                      | Usage               |
| ------------- | ------------------------------ | ------------------- |
| fade-in-up    | opacity 0→1, translateY 30px→0 | Sections au scroll  |
| fade-in       | opacity 0→1                    | Éléments apparition |
| blink         | opacity 1→0→1 (step-end)       | Curseur typing      |
| bounce-subtle | translateY 0→-5px→0            | Badge "Open Source" |

---

## Comportement conditionnel

### Selon état d'authentification

| Élément   | Non authentifié                 | Authentifié                |
| --------- | ------------------------------- | -------------------------- |
| Header    | "Se connecter" → `/login`       | "Dashboard" → `/dashboard` |
| Hero CTA  | "Démarrer" + "Se connecter"     | "Accéder au dashboard"     |
| CTA Final | "Créer mon compte gratuitement" | "Accéder au dashboard"     |

### Selon le mode d'exécution

| Mode    | Comportement               |
| ------- | -------------------------- |
| Serveur | Affiche la Landing page    |
| Client  | Redirige vers `/dashboard` |

---

## Responsive

| Breakpoint  | Header logo  | Stats grid | Timeline   | Cards features |
| ----------- | ------------ | ---------- | ---------- | -------------- |
| Mobile      | Icône seule  | 1 colonne  | Vertical   | 1 colonne      |
| sm (640px)  | Logo complet | 1 colonne  | Vertical   | 2 colonnes     |
| md (768px)  | Logo complet | 3 colonnes | Horizontal | 2 colonnes     |
| lg (1024px) | Logo complet | 3 colonnes | Horizontal | 2 colonnes     |

---

## Performance

| Optimisation          | Implémentation                              |
| --------------------- | ------------------------------------------- |
| IntersectionObserver  | Animations déclenchées au scroll uniquement |
| requestAnimationFrame | Compteurs à 60fps                           |
| CSS transforms        | GPU accelerated                             |
| Cleanup observers     | Dans useEffect return                       |
| Particules limitées   | 60 max                                      |

---

## Liens externes

| Lien          | URL                                                      |
| ------------- | -------------------------------------------------------- |
| GitHub        | https://github.com/MyElectricalData/myelectricaldata_new |
| Compte Enedis | https://mon-compte-particulier.enedis.fr                 |

---

## Notes techniques

- **Pas de Layout.tsx** : Header et sections custom intégrés
- **Smooth scroll** : Activé globalement via `document.documentElement.style.scrollBehavior`
- **Header apparition** : `window.scrollY > 100`
- **Sections animées** : 5 refs avec useInView (ref1 à ref5)
- **DonationModal** : Composant séparé avec état `showDonationModal`
- **isReady state** : Évite le clignotement des boutons auth au montage
