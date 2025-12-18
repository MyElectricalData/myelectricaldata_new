# Chiffrement des données utilisateurs

## Vue d'ensemble

MyElectricalData implémente un système de chiffrement **GDPR-compliant** pour protéger les données sensibles des utilisateurs (consommation, production, contrats). Chaque utilisateur possède une clé de chiffrement unique dérivée de son `client_secret`.

```text
┌─────────────────────────────────────────────────────────────┐
│                    FLUX DE CHIFFREMENT                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Utilisateur                                                │
│      │                                                      │
│      ▼                                                      │
│  Authentification (JWT ou client_secret)                    │
│      │                                                      │
│      ▼                                                      │
│  Récupération du client_secret                              │
│      │                                                      │
│      ▼                                                      │
│  ┌─────────────────────────────────────┐                    │
│  │  Dérivation de clé                  │                    │
│  │                                     │                    │
│  │  1. SHA256(client_secret)           │                    │
│  │  2. Base64 URL-safe encode          │                    │
│  │  3. Création cipher Fernet          │                    │
│  └─────────────────────────────────────┘                    │
│      │                                                      │
│      ▼                                                      │
│  ┌─────────────────────────────────────┐                    │
│  │  Valkey (données chiffrées)         │                    │
│  │                                     │                    │
│  │  consumption:daily:{pdl}:{date}     │                    │
│  │  production:daily:{pdl}:{date}      │                    │
│  │  contract:{pdl}                     │                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Algorithme : Fernet

Le système utilise **Fernet** de la bibliothèque `cryptography` Python, qui fournit :

- **AES-128-CBC** pour le chiffrement
- **HMAC-SHA256** pour l'authentification
- **Timestamps** pour la validation temporelle

### Pourquoi Fernet ?

| Avantage                | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| **Sécurisé par défaut** | Pas de configuration complexe, résistant aux attaques courantes |
| **Authentifié**         | HMAC garantit l'intégrité des données                           |
| **Simple**              | API minimaliste, moins de risques d'erreur                      |
| **Standard**            | Utilisé largement dans l'écosystème Python                      |

---

## Implémentation

### Fichier principal

`apps/api/src/services/cache.py`

### Dérivation de la clé

```python
def _get_cipher(self, encryption_key: str) -> Fernet:
    """Get Fernet cipher with user's client_secret as key"""
    from base64 import urlsafe_b64encode
    from hashlib import sha256

    # 1. Hash le client_secret (64 chars) → 32 bytes
    key = urlsafe_b64encode(sha256(encryption_key.encode()).digest())

    # 2. Crée le cipher Fernet avec la clé dérivée
    return Fernet(key)
```

### Processus de dérivation

```
client_secret (64 caractères URL-safe)
        │
        ▼
    SHA256()
        │
        ▼
    32 bytes (256 bits)
        │
        ▼
  Base64 URL-safe encode
        │
        ▼
    44 caractères (clé Fernet valide)
        │
        ▼
    Fernet(key) → Cipher prêt à l'emploi
```

---

## Chiffrement en cache

### Écriture (set)

```python
async def set(
    self,
    key: str,
    value: Any,
    encryption_key: str,
    ttl: int | None = None
) -> bool:
    """Store encrypted data in Valkey"""
    try:
        # 1. Sérialise en JSON
        json_data = json.dumps(value)

        # 2. Chiffre avec Fernet
        cipher = self._get_cipher(encryption_key)
        encrypted_data = cipher.encrypt(json_data.encode())

        # 3. Stocke dans Valkey avec TTL
        await self.redis.setex(
            key,
            ttl or self.default_ttl,
            encrypted_data
        )
        return True
    except Exception as e:
        logger.error(f"Cache set error: {e}")
        return False
```

### Lecture (get)

```python
async def get(self, key: str, encryption_key: str) -> Any | None:
    """Retrieve and decrypt data from Valkey"""
    try:
        # 1. Récupère les bytes chiffrés
        encrypted_data = await self.redis.get(key)
        if not encrypted_data:
            return None

        # 2. Déchiffre avec Fernet
        cipher = self._get_cipher(encryption_key)
        decrypted_data = cipher.decrypt(encrypted_data)

        # 3. Parse le JSON
        return json.loads(decrypted_data.decode())
    except Exception as e:
        logger.error(f"Cache get error: {e}")
        return None
```

---

## Utilisation dans le code

### Pattern standard

```python
# Dans apps/api/src/routers/enedis.py

# Lecture du cache
cached_data = await cache_service.get(
    cache_key,
    current_user.client_secret  # Clé de chiffrement
)

# Écriture en cache
await cache_service.set(
    cache_key,
    data,
    current_user.client_secret  # Clé de chiffrement
)
```

### Format des clés de cache

```python
def make_cache_key(self, usage_point_id: str, endpoint: str, **kwargs) -> str:
    """Generate cache key"""
    parts = [usage_point_id, endpoint]
    for key, value in sorted(kwargs.items()):
        parts.append(f"{key}:{value}")
    return ":".join(parts)
```

**Exemples de clés** :

| Type de données          | Clé de cache                                  |
| ------------------------ | --------------------------------------------- |
| Consommation journalière | `consumption:daily:12345678901234:2024-01-15` |
| Production journalière   | `production:daily:12345678901234:2024-01-15`  |
| Contrat                  | `contract:12345678901234`                     |
| Adresse                  | `address:12345678901234`                      |
| Type de compteur         | `consumption:reading_type:12345678901234`     |

---

## Génération du client_secret

### Code

`apps/api/src/utils/auth.py`

```python
import secrets

def generate_client_secret() -> str:
    """Generate a secure client_secret"""
    return secrets.token_urlsafe(64)
```

### Caractéristiques

| Propriété      | Valeur                                 |
| -------------- | -------------------------------------- |
| **Longueur**   | 64 bytes → ~86 caractères encodés      |
| **Entropie**   | 512 bits                               |
| **Caractères** | URL-safe Base64 (A-Z, a-z, 0-9, -, \_) |
| **Générateur** | `secrets.token_urlsafe()` (CSPRNG)     |

### Stockage

```python
# Dans apps/api/src/models/user.py
class User(Base):
    # ...
    client_secret: Mapped[str] = mapped_column(String(128), nullable=False)
```

Le `client_secret` est stocké en clair dans la base de données car :

1. Il est nécessaire pour déchiffrer les données du cache
2. Il sert aussi d'authentification API (OAuth2 Client Credentials)

---

## Propriétés de sécurité

### Isolation des données

```
┌─────────────────────────────────────────────────────────────┐
│                      REDIS                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User A (client_secret_A)                                   │
│  ├── consumption:daily:PDL_A:2024-01-01  [CHIFFRÉ avec A]   │
│  ├── consumption:daily:PDL_A:2024-01-02  [CHIFFRÉ avec A]   │
│  └── contract:PDL_A                      [CHIFFRÉ avec A]   │
│                                                             │
│  User B (client_secret_B)                                   │
│  ├── consumption:daily:PDL_B:2024-01-01  [CHIFFRÉ avec B]   │
│  ├── consumption:daily:PDL_B:2024-01-02  [CHIFFRÉ avec B]   │
│  └── contract:PDL_B                      [CHIFFRÉ avec B]   │
│                                                             │
│  ⚠️  User A ne peut PAS déchiffrer les données de User B   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tableau récapitulatif

| Propriété                 | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| **Isolation utilisateur** | Chaque cache est chiffré avec un secret unique       |
| **Confidentialité**       | Impossible de déchiffrer sans le bon `client_secret` |
| **Intégrité**             | HMAC-SHA256 détecte toute modification               |
| **GDPR**                  | Données personnelles chiffrées au repos              |
| **Cascade delete**        | Suppression compte → données inaccessibles           |
| **TTL automatique**       | Expiration après 24h (configurable)                  |

---

## Scénarios de sécurité

### Valkey compromis

Si un attaquant accède à Valkey :

- ✅ Il ne voit que des bytes chiffrés
- ✅ Sans le `client_secret`, déchiffrement impossible
- ✅ Chaque utilisateur a une clé différente

### Base de données compromise

Si un attaquant accède à PostgreSQL/SQLite :

- ⚠️ Il peut lire les `client_secret`
- ⚠️ Il pourrait déchiffrer les caches Valkey
- 🔒 **Mitigation** : Chiffrer la base de données au niveau disque

### Rotation des clés

Actuellement, le `client_secret` ne change jamais après la création du compte. Une rotation nécessiterait :

1. Déchiffrer toutes les données avec l'ancienne clé
2. Re-chiffrer avec la nouvelle clé
3. Mettre à jour le `client_secret` en base

---

## Configuration

### Variables d'environnement

```bash
# Valkey connection (protocole Redis compatible)
REDIS_URL=redis://localhost:6379/0

# Cache TTL (default: 24 hours)
CACHE_TTL_SECONDS=86400
```

### Settings

`apps/api/src/config/settings.py`

```python
class Settings(BaseSettings):
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 86400  # 24 hours
```

---

## Gestion des erreurs

### Échec de chiffrement/déchiffrement

```python
async def get(self, key: str, encryption_key: str) -> Any | None:
    try:
        # ... déchiffrement ...
    except Exception as e:
        logger.error(f"Cache get error: {e}")
        return None  # Retourne None, pas d'exception propagée
```

### Comportement en cas d'échec

| Opération          | Comportement                                      |
| ------------------ | ------------------------------------------------- |
| `get()` échoue     | Retourne `None`, données récupérées depuis Enedis |
| `set()` échoue     | Retourne `False`, données non cachées             |
| Valkey indisponible | Application continue, performances dégradées      |
| Clé invalide       | Déchiffrement échoue silencieusement              |

---

## Données non chiffrées

Certaines données ne nécessitent pas de chiffrement :

### Cache brut (raw)

```python
async def get_raw(self, key: str) -> str | None:
    """Get raw (unencrypted) value"""
    return await self.redis.get(key)

async def set_raw(self, key: str, value: str, ttl: int | None = None) -> bool:
    """Set raw (unencrypted) value"""
    await self.redis.setex(key, ttl or self.default_ttl, value)
    return True
```

### Utilisations

| Clé                        | Description                           |
| -------------------------- | ------------------------------------- |
| `rate_limit:{user_id}:*`   | Compteurs de rate limiting            |
| `scraper_cache:{provider}` | Cache des offres scrapées (publiques) |
| `sync_status`              | Statut de synchronisation             |

---

## Tests

### Vérifier le chiffrement

```python
import pytest
from services.cache import CacheService

async def test_encryption_isolation():
    cache = CacheService()

    # User A écrit des données
    await cache.set("test:key", {"secret": "data"}, "secret_A")

    # User A peut lire
    data_A = await cache.get("test:key", "secret_A")
    assert data_A == {"secret": "data"}

    # User B ne peut PAS lire (mauvaise clé)
    data_B = await cache.get("test:key", "secret_B")
    assert data_B is None  # Déchiffrement échoue
```

---

## Références

- **Fernet specification** : <https://github.com/fernet/spec/>
- **Cryptography library** : <https://cryptography.io/>
- **GDPR Article 32** : Mesures techniques de protection des données
- **Code source** : `apps/api/src/services/cache.py`
