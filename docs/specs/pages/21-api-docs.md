---
name: api-docs
id: api-docs
path: /api-docs
description: Documentation interactive de l'API avec Swagger UI
mode_client: false
mode_server: true
menu: Documentation API
---

# Documentation de l'API

Page affichant la **documentation interactive de l'API** avec l'interface Swagger UI.

## Features

| Feature                    | Statut |
| -------------------------- | ------ |
| Interface Swagger UI       | FAIT   |
| Organisation par categorie | FAIT   |
| Authentification JWT       | FAIT   |
| Test des endpoints         | FAIT   |
| Schemas de donnees         | FAIT   |
| Theme sombre               | FAIT   |

## Fichiers

| Type    | Fichier                           |
| ------- | --------------------------------- |
| Page    | `apps/web/src/pages/ApiDocs.tsx`  |
| Backend | `apps/api/main.py`                |

## Details implementation

### Interface Swagger UI (FAIT)

   - Documentation complète de tous les endpoints API
   - Interface interactive pour tester les requêtes
   - Schémas de données détaillés
   - Exemples de requêtes/réponses

### Organisation par categories (FAIT)

   - **Accounts** : Gestion des comptes utilisateurs
   - **PDL** : Gestion des Points De Livraison
   - **Enedis** : Récupération des données de consommation
   - **Energy** : Offres et fournisseurs d'énergie
   - **Tempo** : Données TEMPO
   - **EcoWatt** : Données EcoWatt
   - **OAuth** : Authentification Enedis
   - **Admin** : Administration (réservé aux admins)

### Authentification (FAIT)

   - Bouton "Authorize" pour s'authentifier
   - Support des tokens JWT
   - Authentification automatique si déjà connecté

### Test des endpoints (FAIT)

   - Bouton "Try it out" sur chaque endpoint
   - Remplissage des paramètres
   - Exécution de la requête
   - Affichage de la réponse (JSON, status code, headers)

### Schemas de donnees (FAIT)
   - Documentation de tous les modèles
   - Types de données
   - Champs obligatoires/optionnels
   - Exemples de valeurs

### Personnalisation (FAIT)

- Theme sombre adapte au design de l'application
- Logo et titre personnalises
- CSS custom pour l'integration visuelle

## Notes importantes

- La documentation est générée automatiquement depuis les annotations FastAPI
- Les exemples sont basés sur les schémas Pydantic du backend
- L'authentification est requise pour tester certains endpoints
- La documentation est toujours à jour avec le code backend
