---
description: Create React + Vite dashboard
allowed-tools: Bash(npm:*), Bash(npx:*), Bash(mkdir:*)
---

# Create Frontend

## Lire avant de commencer

- `@docs/features-spec/01-front.md`
- `@docs/features-spec/05-gateway.md`
- `@docs/features-spec/02-account.md`
- `@docs/features-spec/10-cache.md`
- `@docs/features-spec/rules/api-design.json`

Ces documents definissent la navigation, les parcours utilisateurs, la gestion du consentement Enedis et les schemas d'erreurs.

## Stack attendue

- `apps/web` construit avec Vite + React + TypeScript
- Gestion de l'etat via React Query + Zustand (ou equivalent simple)
- Routing avec React Router
- Styling via TailwindCSS (ou composants internes) compatible mode sombre
- Tests avec React Testing Library + Vitest

## Ecrans / composants

1. **Landing page** : sections hero, comment ca marche, CTA vers creation de compte
2. **Auth** : pages login/register/reset
3. **Consentement Enedis** : page d'explication et retour de consentement
4. **Dashboard** : resume statut consentement, identifiants API, quotas/cache
5. **PDL Manager** : CRUD points de livraison
6. **Parametres compte** : profil, changement mot de passe, suppression
7. **Layout global** : header, sidebar responsive, toggle dark mode, notifications

Respecter accessibilite (WCAG AA), responsive (mobile -> desktop) et mode sombre complet (voir spec front).

## Integration API

- Base URL: `http://localhost:8000/api`
- Endpoints et schemas alignes sur `@docs/features-spec/05-gateway.md` et `02-account.md`
- Affichage des erreurs conforme a `@docs/enedis-api/enedis-api-error.md`
- Gestion du token (auth) + refresh selon backend
- S'assurer que les actions front declenchent le flux complet (consentement -> PDL -> cle API)

## Workflow dev

- Ajouter scripts `npm run lint`, `npm run test`, `npm run test:e2e` (si Playwright)
- Configurer `.env` (ex: `VITE_API_BASE_URL`)
- Documentation dans `apps/web/README.md` pour lancer `npm install`, `npm run dev`, `npm run build`

## Tests

- Tests unitaires pour les composants critiques
- Tests d'integration pour les formulaires auth et consentement
- Tests E2E de bout en bout (aller-retour consentement + recuperation cle API)

## Livrables

- Code source `apps/web`
- README avec instructions d'installation, scripts, variables d'env
- Capture d'ecran ou storybook (optionnel) illustrant mode sombre + responsive
