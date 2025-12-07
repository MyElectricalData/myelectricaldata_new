# Mesures de Sécurité - MyElectricalData API

## Isolation des Données Utilisateur

### Principe de Cloisonnement

Chaque utilisateur ne peut accéder **uniquement** qu'à ses propres données. Toute tentative d'accès aux données d'un autre utilisateur est bloquée.

### Consentement Enedis

Le consentement Enedis est **au niveau du compte utilisateur**, pas par PDL :
- Un seul consentement donne accès à **tous les PDL** du compte Enedis
- Après consentement, la passerelle récupère automatiquement tous les PDL via l'API Enedis
- Le `customer_id` Enedis est stocké sur l'utilisateur de la passerelle (champ `enedis_customer_id`)
- Les PDL sont créés automatiquement en base de données
- Un token OAuth est créé pour chaque PDL détecté

### Vérifications Implémentées

#### 1. Authentification (Tous les endpoints protégés)

Tous les endpoints nécessitant une authentification vérifient via `get_current_user` :
- JWT token valide OU client_secret valide
- Utilisateur actif
- Auto-logout si token expiré (401)

**Fichier** : `src/middleware/auth.py`

#### 2. Vérification de Propriété des PDL

**Fonction** : `verify_pdl_ownership(usage_point_id, user, db)`
**Localisation** : `src/routers/enedis.py`

Vérifie que le PDL appartient bien à l'utilisateur authentifié avant toute opération.

**Appliquée sur** :
- ✅ Tous les endpoints de données Enedis (`/enedis/*`)
- ✅ Endpoint de suppression du cache (`/enedis/cache/{usage_point_id}`)
- ✅ Endpoint de refresh token (`/oauth/refresh/{usage_point_id}`)

**Note** : L'endpoint `/oauth/authorize` ne nécessite **plus** de `usage_point_id` car le consentement est au niveau du compte.

#### 3. Double Vérification Token + PDL

**Fonction** : `get_valid_token(usage_point_id, user, db)`
**Localisation** : `src/routers/enedis.py`

Cette fonction :
1. ✅ Vérifie la propriété du PDL via `verify_pdl_ownership`
2. ✅ Vérifie que le token appartient à l'utilisateur (`Token.user_id == user.id`)
3. ✅ Vérifie que le token appartient au bon PDL
4. ✅ Refresh automatique si expiré
5. ✅ Retourne `None` si une vérification échoue

#### 4. Cache Chiffré par Utilisateur

**Service** : `CacheService`
**Localisation** : `src/services/cache.py`

- ✅ Données chiffrées avec le `client_secret` de l'utilisateur
- ✅ Impossible de déchiffrer les données d'un autre utilisateur
- ✅ Clé de chiffrement dérivée : `SHA256(client_secret)` → Fernet key

#### 5. Gestion des PDL

**Endpoints** : `/pdl/*`
**Localisation** : `src/routers/pdl.py`

- ✅ Liste : uniquement les PDL de l'utilisateur (`PDL.user_id == current_user.id`)
- ✅ Lecture : vérifie propriété avant retour
- ✅ Suppression : vérifie propriété avant suppression
- ✅ Cascade delete : suppression compte → suppression PDL

#### 6. Gestion des Tokens OAuth

**Endpoints** : `/oauth/*`
**Localisation** : `src/routers/oauth.py` et `src/main.py`

- ✅ **Autorisation** (`/oauth/authorize`) : génère URL Enedis avec `state=user_id` uniquement
- ✅ **Callback** (`/oauth/callback`) :
  - Valide le format du PDL (14 chiffres exactement)
  - Crée automatiquement les PDL détectés
  - Récupère les infos du contrat (puissance souscrite, heures creuses)
- ✅ **Refresh** : vérifie propriété PDL avant refresh
- ✅ **Cascade delete** : suppression compte → suppression tokens

## Endpoints Protégés

### Sans Authentification
- `GET /` - Info API
- `GET /ping` - Health check
- `POST /accounts/signup` - Création compte
- `POST /accounts/login` - Connexion

### Avec Authentification (JWT ou client_secret)
Tous les endpoints suivants vérifient l'authentification ET la propriété des ressources :

#### Comptes
- `GET /accounts/me` - Info utilisateur (ses propres infos)
- `GET /accounts/credentials` - Credentials (ses propres credentials)
- `DELETE /accounts/me` - Suppression (son propre compte)

#### PDL
- `GET /pdl` - Liste (ses propres PDL uniquement)
- `POST /pdl` - Ajout (à son propre compte)
- `GET /pdl/{id}` - Lecture (vérifie propriété)
- `DELETE /pdl/{id}` - Suppression (vérifie propriété)

#### OAuth
- `GET /oauth/authorize` - Génère URL Enedis (pas de PDL requis)
- `GET /oauth/callback` - Callback Enedis, valide et crée les PDL automatiquement
- `POST /oauth/refresh/{usage_point_id}` - **Vérifie propriété PDL**

#### Données Enedis
Tous ces endpoints utilisent `get_valid_token` qui vérifie propriété PDL + token :
- `GET /enedis/consumption/daily/{usage_point_id}`
- `GET /enedis/consumption/detail/{usage_point_id}`
- `GET /enedis/power/{usage_point_id}`
- `GET /enedis/production/daily/{usage_point_id}`
- `GET /enedis/production/detail/{usage_point_id}`
- `GET /enedis/contract/{usage_point_id}`
- `GET /enedis/address/{usage_point_id}`
- `GET /enedis/customer/{usage_point_id}`
- `GET /enedis/contact/{usage_point_id}`
- `DELETE /enedis/cache/{usage_point_id}` - **Vérifie propriété PDL**

## Messages d'Erreur

En cas de tentative d'accès non autorisé :

```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Access denied: PDL not found or no valid token. Please verify PDL ownership and consent."
  }
}
```

Ou pour le cache/OAuth :

```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Access denied: This PDL does not belong to you."
  }
}
```

## Cascade de Suppression

Lors de la suppression d'un compte utilisateur (`DELETE /accounts/me`) :

1. ✅ Suppression du cache pour tous les PDL de l'utilisateur
2. ✅ Suppression de tous les PDL (cascade SQLAlchemy)
3. ✅ Suppression de tous les tokens OAuth (cascade SQLAlchemy)
4. ✅ Suppression du compte utilisateur

**Fichier** : `src/routers/accounts.py:delete_account()`

## Tests de Sécurité Recommandés

### Test 1 : Accès PDL d'un autre utilisateur
```bash
# User A tente d'accéder au PDL de User B
curl -H "Authorization: Bearer <token_user_A>" \
  http://localhost:8000/enedis/consumption/daily/12345678901234?start=2024-01-01&end=2024-01-31

# Attendu : 200 OK avec success=false, code="ACCESS_DENIED"
```

### Test 2 : Suppression PDL d'un autre utilisateur
```bash
# User A tente de supprimer le PDL de User B
curl -X DELETE -H "Authorization: Bearer <token_user_A>" \
  http://localhost:8000/pdl/<id_pdl_user_B>

# Attendu : 200 OK avec success=false, code="PDL_NOT_FOUND"
```

### Test 3 : Consentement automatique
```bash
# Le consentement récupère automatiquement tous les PDL du compte Enedis
# Après validation sur le portail Enedis, vérifier que :
# 1. Tous les PDL sont créés en base
# 2. Les tokens OAuth sont créés pour chaque PDL
# 3. L'utilisateur ne peut pas accéder aux PDL d'un autre utilisateur
```

### Test 4 : Cache chiffré
```bash
# Impossible de déchiffrer le cache d'un autre utilisateur
# même avec accès direct à Redis
redis-cli GET "12345678901234:consumption_daily:*"

# Résultat : données chiffrées avec Fernet, clé dérivée du client_secret
```

## Recommandations Production

1. ✅ **HTTPS obligatoire** en production
2. ✅ **Rate limiting** sur les endpoints publics (signup, login)
3. ✅ **CORS** : restreindre `allow_origins` aux domaines autorisés
4. ✅ **Logs** : logger toutes les tentatives d'accès refusées
5. ✅ **Monitoring** : alerter sur les erreurs ACCESS_DENIED répétées
6. ✅ **Rotation secrets** : permettre rotation du SECRET_KEY sans casser les sessions
7. ✅ **Backup** : sauvegardes régulières de la base de données

## Conformité

- ✅ **RGPD** : Droit à l'oubli via `DELETE /accounts/me`
- ✅ **Isolation** : Cloisonnement strict des données par utilisateur
- ✅ **Chiffrement** : Données sensibles chiffrées au repos (cache)
- ✅ **Audit** : Traçabilité via logs FastAPI
