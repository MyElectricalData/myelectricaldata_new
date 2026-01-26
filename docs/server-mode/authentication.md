---
sidebar_position: 3
---

# Authentification OAuth2

## Vue d'ensemble

Le mode serveur utilise deux niveaux d'authentification :

1. **JWT** : Authentification utilisateur sur la plateforme
2. **OAuth2 Enedis** : Autorisation d'accès aux données Linky

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUX D'AUTHENTIFICATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         1. AUTHENTIFICATION JWT                       │   │
│  │                                                                       │   │
│  │  Utilisateur                    Backend                               │   │
│  │      │                             │                                  │   │
│  │      │  POST /signup               │                                  │   │
│  │      │  {email, password}          │                                  │   │
│  │      │───────────────────────────>│                                  │   │
│  │      │                             │  Créer compte                    │   │
│  │      │                             │  Générer client_id/secret        │   │
│  │      │  200 OK                     │                                  │   │
│  │      │<───────────────────────────│                                  │   │
│  │      │                             │                                  │   │
│  │      │  POST /login                │                                  │   │
│  │      │  {email, password}          │                                  │   │
│  │      │───────────────────────────>│                                  │   │
│  │      │                             │  Vérifier credentials            │   │
│  │      │  200 {access_token}         │  Générer JWT (30 jours)          │   │
│  │      │<───────────────────────────│                                  │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      2. CONSENTEMENT OAUTH2 ENEDIS                    │   │
│  │                                                                       │   │
│  │  Utilisateur         Backend              Enedis                      │   │
│  │      │                  │                    │                        │   │
│  │      │  GET /consent    │                    │                        │   │
│  │      │─────────────────>│                    │                        │   │
│  │      │                  │  Construire URL    │                        │   │
│  │      │  302 Redirect    │  OAuth2            │                        │   │
│  │      │<─────────────────│                    │                        │   │
│  │      │                  │                    │                        │   │
│  │      │  Enedis Login    │                    │                        │   │
│  │      │─────────────────────────────────────>│                        │   │
│  │      │                  │                    │                        │   │
│  │      │  Autoriser app   │                    │                        │   │
│  │      │─────────────────────────────────────>│                        │   │
│  │      │                  │                    │                        │   │
│  │      │  Redirect + code │                    │                        │   │
│  │      │<─────────────────────────────────────│                        │   │
│  │      │                  │                    │                        │   │
│  │      │  /callback?code= │                    │                        │   │
│  │      │─────────────────>│  POST /oauth/token │                        │   │
│  │      │                  │───────────────────>│                        │   │
│  │      │                  │<───────────────────│                        │   │
│  │      │                  │  access_token      │                        │   │
│  │      │                  │  refresh_token     │                        │   │
│  │      │                  │                    │                        │   │
│  │      │                  │  Stocker tokens    │                        │   │
│  │      │  302 /dashboard  │  Détecter PDLs     │                        │   │
│  │      │<─────────────────│                    │                        │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      3. APPELS API AUTHENTIFIÉS                       │   │
│  │                                                                       │   │
│  │  Frontend                       Backend              Enedis           │   │
│  │      │                             │                    │             │   │
│  │      │  GET /consumption           │                    │             │   │
│  │      │  Authorization: Bearer JWT  │                    │             │   │
│  │      │───────────────────────────>│                    │             │   │
│  │      │                             │  Vérifier JWT      │             │   │
│  │      │                             │  Récupérer token   │             │   │
│  │      │                             │  Enedis            │             │   │
│  │      │                             │                    │             │   │
│  │      │                             │  GET /metering     │             │   │
│  │      │                             │  Authorization:    │             │   │
│  │      │                             │  Bearer Enedis     │             │   │
│  │      │                             │───────────────────>│             │   │
│  │      │                             │<───────────────────│             │   │
│  │      │  200 {data}                 │                    │             │   │
│  │      │<───────────────────────────│                    │             │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## JWT (JSON Web Token)

### Structure du token

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "is_admin": false,
    "exp": 1704067200,
    "iat": 1701475200
  }
}
```

### Configuration

```bash
# Clé secrète pour signer les tokens
SECRET_KEY=your-super-secret-key-minimum-32-characters

# Durée de validité (en jours)
ACCESS_TOKEN_EXPIRE_DAYS=30
```

### Utilisation dans les requêtes

```bash
# Header Authorization
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# Ou query parameter (déconseillé)
GET /api/consumption?token=eyJhbGciOiJIUzI1NiIs...
```

---

## OAuth2 Enedis

### Scopes demandés

| Scope | Description |
|-------|-------------|
| `metering_data:consumption_daily` | Consommation journalière |
| `metering_data:consumption_load_curve` | Courbe de charge (30 min) |
| `metering_data:production_daily` | Production journalière |
| `metering_data:production_load_curve` | Courbe de charge production |
| `customers:contact_data` | Informations de contact |
| `customers:contract_data` | Informations de contrat |

### URL d'autorisation

```
https://mon-compte-particulier.enedis.fr/dataconnect/v1/oauth2/authorize
  ?response_type=code
  &client_id={ENEDIS_CLIENT_ID}
  &redirect_uri={CALLBACK_URL}
  &scope=metering_data:consumption_daily+...
  &state={random_state}
  &duration=P3Y
```

### Durée du consentement

Le paramètre `duration=P3Y` demande un consentement de 3 ans.

### Gestion des tokens

```python
# Stockage en base (chiffré)
class Token(Base):
    id = Column(UUID)
    user_id = Column(UUID, ForeignKey('users.id'))
    pdl_id = Column(UUID, ForeignKey('pdls.id'))
    access_token = Column(Text)  # Chiffré
    refresh_token = Column(Text)  # Chiffré
    expires_at = Column(DateTime)
```

### Refresh automatique

Un job planifié rafraîchit les tokens avant expiration :

```python
# Exécuté toutes les heures
async def refresh_expiring_tokens():
    # Tokens qui expirent dans les 2 heures
    expiring = await get_expiring_tokens(hours=2)
    for token in expiring:
        await refresh_token(token)
```

---

## Client Credentials

Chaque utilisateur reçoit un `client_id` et `client_secret` uniques :

```json
{
  "client_id": "cli_a1b2c3d4e5f6g7h8",
  "client_secret": "sec_xxxxxxxxxxxxxxxxxxxx"
}
```

### Utilisation

```bash
# Authentification API (alternative au JWT)
curl -X GET /api/consumption \
  -u "cli_xxx:sec_xxx"

# Ou via header
Authorization: Basic base64(client_id:client_secret)
```

### Régénération

```
Paramètres → API → Régénérer les credentials
```

⚠️ L'ancienne clé est immédiatement invalidée.

---

## Sécurité

### Bonnes pratiques implémentées

| Mesure | Description |
|--------|-------------|
| HTTPS obligatoire | Redirection automatique HTTP → HTTPS |
| Tokens signés | JWT signé avec HS256 |
| Rate limiting | 5 req/s par utilisateur |
| Brute force protection | Blocage après 5 échecs |
| Token rotation | Refresh token unique par session |
| Secure cookies | `HttpOnly`, `Secure`, `SameSite=Strict` |

### Protection CSRF

```python
# Vérification du state dans le callback OAuth2
if state != session['oauth_state']:
    raise HTTPException(403, "Invalid state")
```

### Révocation de consentement

Un utilisateur peut révoquer son consentement :

1. Via l'interface MyElectricalData : `Paramètres → Consentement → Révoquer`
2. Via le portail Enedis : `Mon compte → Mes données`

La révocation côté Enedis est détectée lors du prochain appel API (erreur 403).

---

## Dépannage

### Token JWT expiré

```json
{
  "detail": "Token has expired"
}
```

**Solution** : Se reconnecter via `/login`

### Token Enedis expiré

```json
{
  "detail": "Enedis token expired, please renew consent"
}
```

**Solution** : Relancer le consentement via `Paramètres → Consentement`

### Consentement révoqué

```json
{
  "detail": "Access denied - consent may have been revoked"
}
```

**Solution** : Redonner le consentement sur le portail Enedis

### Rate limit atteint

```json
{
  "detail": "Rate limit exceeded. Try again in 60 seconds"
}
```

**Solution** : Attendre ou optimiser les appels (utiliser le cache)
