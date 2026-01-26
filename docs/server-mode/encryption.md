---
sidebar_position: 5
---

# Chiffrement des Données

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

## Algorithme : Fernet

Le système utilise **Fernet** de la bibliothèque `cryptography` Python :

- **AES-128-CBC** pour le chiffrement
- **HMAC-SHA256** pour l'authentification
- **Timestamps** pour la validation temporelle

| Avantage                | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| **Sécurisé par défaut** | Pas de configuration complexe, résistant aux attaques courantes |
| **Authentifié**         | HMAC garantit l'intégrité des données                           |
| **Simple**              | API minimaliste, moins de risques d'erreur                      |
| **Standard**            | Utilisé largement dans l'écosystème Python                      |

## Implémentation

### Fichier principal

`apps/api/src/services/cache.py`

### Dérivation de la clé

```python
def _get_cipher(self, encryption_key: str) -> Fernet:
    """Get Fernet cipher with user's client_secret as key"""
    from base64 import urlsafe_b64encode
    from hashlib import sha256

    key = urlsafe_b64encode(sha256(encryption_key.encode()).digest())
    return Fernet(key)
```

### Chiffrement en cache

```python
async def set(self, key: str, value: Any, encryption_key: str, ttl: int | None = None) -> bool:
    """Store encrypted data in Valkey"""
    json_data = json.dumps(value)
    cipher = self._get_cipher(encryption_key)
    encrypted_data = cipher.encrypt(json_data.encode())
    await self.redis.setex(key, ttl or self.default_ttl, encrypted_data)
    return True

async def get(self, key: str, encryption_key: str) -> Any | None:
    """Retrieve and decrypt data from Valkey"""
    encrypted_data = await self.redis.get(key)
    if not encrypted_data:
        return None
    cipher = self._get_cipher(encryption_key)
    decrypted_data = cipher.decrypt(encrypted_data)
    return json.loads(decrypted_data.decode())
```

## Clés de cache

| Type de données          | Clé de cache                                  |
| ------------------------ | --------------------------------------------- |
| Consommation journalière | `consumption:daily:12345678901234:2024-01-15` |
| Production journalière   | `production:daily:12345678901234:2024-01-15`  |
| Contrat                  | `contract:12345678901234`                     |
| Adresse                  | `address:12345678901234`                      |

## Propriétés de sécurité

| Propriété                 | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| **Isolation utilisateur** | Chaque cache est chiffré avec un secret unique       |
| **Confidentialité**       | Impossible de déchiffrer sans le bon `client_secret` |
| **Intégrité**             | HMAC-SHA256 détecte toute modification               |
| **GDPR**                  | Données personnelles chiffrées au repos              |
| **TTL automatique**       | Expiration après 24h (configurable)                  |

## Références

- [Fernet specification](https://github.com/fernet/spec/)
- [Cryptography library](https://cryptography.io/)
- Code source : `apps/api/src/services/cache.py`
