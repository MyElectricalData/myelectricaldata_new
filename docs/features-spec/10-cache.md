# Feature: Cache Enedis

## Contexte

Les API Enedis sont soumises à un quota strict de 5 appels par seconde. Sans mécanisme de mise en cache, chaque requête utilisateur traverserait la passerelle jusqu'à Enedis, risquant de saturer rapidement la limite et de provoquer des erreurs de rate limit.

## Objectifs

- Réduire le nombre d'appels directs vers Enedis en stockant temporairement les réponses courantes.
- Garantir le respect des quotas Enedis (5 requêtes/seconde) et éviter les blocages côté fournisseur.
- Préserver des temps de réponse stables pour les utilisateurs, même lors de pics de trafic.

## Principes de fonctionnement

- Mise en cache des réponses Enedis sur les points de livraison pour une durée configurable.
- Invalidation ciblée dès qu'une donnée doit être rafraîchie (expiration ou action utilisateur explicite).
- Chiffrement des données en cache avec la clé API propre à l'utilisateur afin de conserver l'isolation des données.

## Critères d'acceptation

- Le système limite les appels sortants à Enedis à maximum 5 par seconde en s'appuyant sur le cache.
- Chaque réponse servie depuis le cache respecte les règles d'expiration définies.
- Une route ou un outil d'administration permet de purger ou d'invalider le cache pour un utilisateur donné.
- Les données en cache sont chiffrées au repos et ne sont lisibles que via la clé API de l'utilisateur.

## Implémentation

### Configuration

- **`REDIS_URL`** : URL de connexion à Valkey (protocole Redis compatible, ex: `redis://valkey:6379/0`)
- **`CACHE_TTL_SECONDS`** : Durée de vie du cache (défaut: 86400 = 24h)
- **`ENEDIS_RATE_LIMIT`** : Limite de requêtes/seconde vers Enedis (défaut: 5)

### Rate Limiting utilisateurs

En plus du rate limiting Enedis, chaque utilisateur dispose de quotas journaliers distincts :

- **`USER_DAILY_LIMIT_NO_CACHE`** : Quota pour les requêtes sans cache (défaut: 50/jour)
  - Consommé lorsque la donnée n'est pas en cache ou expirée
  - Effectue un appel réel vers l'API Enedis

- **`USER_DAILY_LIMIT_WITH_CACHE`** : Quota pour les requêtes avec cache (défaut: 1000/jour)
  - Consommé lorsque la donnée est servie depuis le cache
  - Aucun appel vers Enedis

### Clés Valkey/Redis

Format des clés de cache :
```
cache:{user_id}:{pdl}:{endpoint}:{params_hash}
```

Format des clés de rate limiting utilisateur :
```
user:{user_id}:daily_no_cache    # Compteur requêtes sans cache
user:{user_id}:daily_with_cache  # Compteur requêtes avec cache
```

Les compteurs expirent automatiquement à minuit UTC (TTL calculé).

### Headers de réponse

Chaque réponse API inclut :
- **`X-Cache-Status`** : `HIT` ou `MISS` selon si la donnée vient du cache
- **`X-RateLimit-Limit`** : Quota journalier applicable (50 ou 1000)
- **`X-RateLimit-Remaining`** : Nombre de requêtes restantes
- **`X-RateLimit-Reset`** : Timestamp de réinitialisation (minuit UTC)

### Chiffrement

Les données en cache sont chiffrées avec **Fernet** (chiffrement symétrique) :
- Clé de chiffrement : Dérivée du `client_secret` de l'utilisateur
- Garantit que seul l'utilisateur peut déchiffrer ses données
- Suppression automatique du cache à la suppression du compte

### Purge du cache

- **Suppression de compte** : Purge automatique de toutes les clés `cache:{user_id}:*`
- **Suppression de PDL** : Purge des clés `cache:{user_id}:{pdl}:*`
- **Reset admin** : Les administrateurs peuvent réinitialiser les compteurs de quota (pas le cache lui-même)
