---
id: api-docs
---
# Documentation de l'API

**Route:** `/api-docs`

## Description de la page

Cette page affiche la **documentation interactive de l'API** avec l'interface Swagger UI.

## Fonctionnalités principales

1. **Interface Swagger UI**

   - Documentation complète de tous les endpoints API
   - Interface interactive pour tester les requêtes
   - Schémas de données détaillés
   - Exemples de requêtes/réponses

2. **Organisation par catégories**

   - **Accounts** : Gestion des comptes utilisateurs
   - **PDL** : Gestion des Points De Livraison
   - **Enedis** : Récupération des données de consommation
   - **Energy** : Offres et fournisseurs d'énergie
   - **Tempo** : Données TEMPO
   - **EcoWatt** : Données EcoWatt
   - **OAuth** : Authentification Enedis
   - **Admin** : Administration (réservé aux admins)

3. **Authentification**

   - Bouton "Authorize" pour s'authentifier
   - Support des tokens JWT
   - Authentification automatique si déjà connecté

4. **Test des endpoints**

   - Bouton "Try it out" sur chaque endpoint
   - Remplissage des paramètres
   - Exécution de la requête
   - Affichage de la réponse (JSON, status code, headers)

5. **Schémas de données**
   - Documentation de tous les modèles
   - Types de données
   - Champs obligatoires/optionnels
   - Exemples de valeurs

## Personnalisation

- Thème sombre adapté au design de l'application
- Logo et titre personnalisés
- CSS custom pour l'intégration visuelle

## Technologies utilisées

- Swagger UI React
- OpenAPI 3.0 specification
- React avec TypeScript
- Tailwind CSS pour le wrapper

## Fichiers liés

- **Frontend** : `apps/web/src/pages/ApiDocs.tsx`
- **Backend** : `apps/api/main.py` (génération de la spec OpenAPI)
- **Spec OpenAPI** : Générée automatiquement par FastAPI

## Notes importantes

- La documentation est générée automatiquement depuis les annotations FastAPI
- Les exemples sont basés sur les schémas Pydantic du backend
- L'authentification est requise pour tester certains endpoints
- La documentation est toujours à jour avec le code backend
