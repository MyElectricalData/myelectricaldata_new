# Feature: Gestion des comptes utilisateurs

## Contexte

Chaque utilisateur doit disposer d'un compte dédié sur la passerelle pour consommer l'API Gateway en autonomie. Ce compte permet de stocker les points de livraison, de gérer les identifiants d'appel et de contrôler la suppression des données.

## Objectifs

- Offrir un parcours simple de création de compte après validation du consentement Enedis.
- Associer un ou plusieurs points de livraison (PDL) Linky à un utilisateur.
- Fournir à chaque utilisateur un `client_id` fixe et un `client_secret` utilisé pour signer les requêtes vers la passerelle.
- Permettre la suppression complète du compte ainsi que des données associées.
- Garantir que chaque utilisateur n'accède qu'à ses propres données et ne peut consulter ou modifier les PDL d'un autre compte.

## Parcours utilisateur

1. L'utilisateur crée un compte passerelle (email, mot de passe).
2. Au terme de l'inscription, la passerelle génère un `client_id` permanent et un `client_secret` que l'utilisateur doit conserver en sécurité.
3. L'utilisateur lance le **consentement Enedis** depuis son tableau de bord (bouton unique, pas de PDL requis).
4. Après validation du consentement, **tous les PDL du compte Enedis** sont automatiquement détectés et ajoutés à la passerelle.
5. L'utilisateur peut consulter les détails de chaque PDL (contrat, adresse) via le bouton "Détails".
6. L'utilisateur peut consulter ses identifiants d'API à tout moment depuis un espace sécurisé.
7. L'utilisateur peut supprimer des PDL individuellement ou son compte complet ; cette action purge également les PDL et toutes les données mises en cache associées.

## Critères d'acceptation

- La création de compte est obligatoire avant d'appeler les endpoints de la passerelle.
- Chaque compte dispose d'un `client_id` stable et d'un `client_secret` valide pour l'appel des API.
- Un utilisateur peut gérer plusieurs PDL à partir d'un même compte.
- La suppression de compte supprime de manière irréversible les données (PDL, cache, identifiants).
- Toute requête API est cloisonnée : un utilisateur ne peut lire ni manipuler les PDL et données d'un autre compte.

## API à exposer

- Endpoints de gestion de compte : inscription, authentification, suppression.
- Endpoints de gestion des PDL : ajout, mise à jour, suppression.
- Endpoints de gestion du `client_secret` : récupération initiale sécurisée.

## Authentification

### OAuth2 Client Credentials Flow

L'authentification utilise le standard OAuth2 Client Credentials avec deux méthodes supportées :

1. **Bearer Token (recommandée)** :
   - Obtenir un token via `POST /accounts/token` avec `client_id` et `client_secret`
   - Utiliser le token dans le header `Authorization: Bearer {token}`
   - Le token expire après 30 jours (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)

2. **Basic Authentication** :
   - Header `Authorization: Basic {base64(client_id:client_secret)}`
   - Moins sécurisé mais utile pour les tests

### Swagger UI

Le Swagger (`/docs`) supporte OAuth2 Client Credentials nativement :
- Le endpoint `/accounts/token` accepte les credentials en Basic Auth header (format standard Swagger)
- Les credentials sont automatiquement parsés du header `Authorization: Basic`
- Permet de tester tous les endpoints directement depuis l'interface

### Rate Limiting

Chaque utilisateur dispose de quotas journaliers :
- **Sans cache** : 50 requêtes/jour vers l'API Enedis (configurable via `USER_DAILY_LIMIT_NO_CACHE`)
- **Avec cache** : 1000 requêtes/jour servies depuis le cache (configurable via `USER_DAILY_LIMIT_WITH_CACHE`)

Les compteurs sont stockés dans Redis avec TTL jusqu'à minuit UTC.

## Administration

### Panel Admin

Les administrateurs sont définis via `ADMIN_EMAILS` (liste d'emails séparés par des virgules).

Fonctionnalités admin :
- **Statistiques globales** : Nombre d'utilisateurs, PDL, appels API
- **Liste des utilisateurs** : Email, client_id, nombre de PDL, quotas utilisés
- **Reset de quota** : Réinitialisation manuelle des compteurs journaliers
- **Auto-refresh** : Rafraîchissement automatique toutes les 30 secondes

Endpoints admin :
- `GET /admin/users` : Liste tous les utilisateurs avec stats
- `POST /admin/users/{user_id}/reset-quota` : Reset les quotas
- `GET /admin/stats` : Statistiques globales

Sécurité :
- Middleware `require_admin()` vérifie que l'email est dans `ADMIN_EMAILS`
- Retourne 403 Forbidden si non-admin
- Les admins ne peuvent pas accéder aux données Enedis des utilisateurs
