# Testing Rules

## Objectifs de couverture

- Logique metier backend : >= 80%
- Endpoints API (tests d'integration) : >= 75%
- UI frontend (composants + pages) : >= 65%
- Tests end-to-end critiques : obligatoires sur le parcours consentement -> cle API

## Pyramide de tests

1. **Unitaires** : fonctions pures, adapters, composants isolés
2. **Integration** : endpoints FastAPI, flux auth, gestion PDL, interactions API Enedis simulées
3. **End-to-End** : parcours utilisateur complet via navigateur (Playwright ou Cypress)

## Backend

- Validation des requêtes (schemas, champs obligatoires, erreurs 400)
- Mapping adapter Enedis (requêtes vers réponses) avec données factices issues des OpenAPI
- Gestion du cache : hit/miss, expiration, chiffrement, quotas 5 req/s
- Gestion consentement OAuth : creation token, refresh, erreurs (timeout, invalid_scope)
- Suppression compte : purge PDL, tokens, cache
- Gestion des erreurs : vérifier que le format de réponse suit `@docs/features-spec/rules/api-design.json`

## Frontend

- Interactions utilisateur : formulaires login/register, lancement consentement, CRUD PDL
- États de chargement et d'erreur sur chaque vue (toast, bandeaux)
- Mode sombre : persistance du toggle, accessibilité contraste
- Layout responsive : snapshots/visual tests sur breakpoints principaux
- Affichage des identifiants API : masquer/afficher client_secret avec confirmations

## Tests end-to-end

- Parcours complet : inscription -> consentement -> ajout PDL -> récupération cle API
- Scénarios d'échec consentement (refus, expiration) avec affichage messages
- Suppression de compte et vérification redirection vers landing

## Bonnes pratiques

- Respecter le pattern AAA (Arrange, Act, Assert)
- Utiliser des fixtures réutilisables pour setups lourds (tokens, PDL)
- Mocker les appels Enedis sauf pour tests contractuels ciblés
- Automatiser l'exécution dans la CI (lint + unit + integration + e2e)
- Générer des rapports (coverage, junit) exploités par la CI
