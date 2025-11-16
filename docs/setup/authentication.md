# Authentification

MyElectricalData utilise OAuth2 Client Credentials Flow pour l'authentification API.

## 🔑 Obtention des identifiants

Après création de votre compte et consentement Enedis, vous obtenez :

- **`client_id`** : Identifiant public de votre compte
- **`client_secret`** : Clé secrète (à garder confidentielle)

Ces identifiants sont affichés dans votre tableau de bord et peuvent être copiés facilement.

## 🔐 Authentification API

### Méthode 1 : Bearer Token (recommandée)

1. **Obtenir un token d'accès** :

```bash
curl -X POST "https://myelectricaldata.fr/api/accounts/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

Réponse :

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 2592000
}
```

2. **Utiliser le token** dans les requêtes API :

```bash
curl "https://myelectricaldata.fr/api/v1/daily_consumption/YOUR_PDL?start=2024-01-01&end=2024-01-31" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Méthode 2 : Basic Authentication

Vous pouvez aussi utiliser Basic Auth directement (moins sécurisé) :

```bash
curl "https://myelectricaldata.fr/api/v1/daily_consumption/YOUR_PDL?start=2024-01-01&end=2024-01-31" \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET"
```

## 📊 Swagger UI

L'interface Swagger (disponible à `/docs`) supporte OAuth2 Client Credentials :

1. Cliquez sur le bouton **"Authorize"** 🔒
2. Entrez votre `client_id` et `client_secret`
3. Cliquez sur **"Authorize"**
4. Testez directement les endpoints depuis l'interface

Le Swagger utilise Basic Authentication en arrière-plan et fonctionne de manière transparente.

## ⚡ Rate Limiting

Chaque utilisateur dispose de quotas journaliers :

- **Sans cache** : 50 requêtes/jour (configurable avec `USER_DAILY_LIMIT_NO_CACHE`)
- **Avec cache** : 1000 requêtes/jour (configurable avec `USER_DAILY_LIMIT_WITH_CACHE`)

Les requêtes servies depuis le cache (données < 24h) consomment le quota "avec cache". Les requêtes vers l'API Enedis consomment le quota "sans cache".

### Headers de quota

Chaque réponse API inclut :

```http
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704067200
```

### Erreur 429 - Too Many Requests

Si vous dépassez votre quota :

```json
{
  "detail": "Daily API limit exceeded (50/50 without cache). Resets at 2024-01-01 00:00:00 UTC"
}
```

## 🔒 Sécurité

- Le `client_secret` est utilisé comme clé de chiffrement pour vos données en cache
- Ne partagez jamais votre `client_secret`
- Les tokens JWT expirent après 30 jours (configurable avec `ACCESS_TOKEN_EXPIRE_MINUTES`)
- En cas de compromission, supprimez et recréez votre compte

## 🔄 Renouvellement du secret

Pour renouveler votre `client_secret` :

1. Supprimez votre compte depuis le tableau de bord
2. Recréez un compte avec le même email
3. Refaites le consentement Enedis
4. Un nouveau `client_secret` sera généré

**Note** : Cette opération supprimera toutes vos données et votre cache.
