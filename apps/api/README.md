# MyElectricalData API

API Gateway pour accéder aux données Linky via Enedis.

## Prérequis

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) pour la gestion des dépendances
- Redis (pour le cache)

## Installation

```bash
# Installer uv si nécessaire
curl -LsSf https://astral.sh/uv/install.sh | sh

# Installer les dépendances
uv sync
```

## Configuration

Copier `.env.example` vers `.env` et configurer les variables d'environnement.

```bash
cp .env.example .env
# Éditer .env avec vos credentials Enedis
```

## Lancement

```bash
make run
# ou
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

## Tests

```bash
make test
# ou
uv run pytest
```

## Fonctionnalités

### Vérification d'email

La vérification d'email peut être activée via la variable d'environnement `REQUIRE_EMAIL_VERIFICATION`.

- **Configuration** : Ajouter `REQUIRE_EMAIL_VERIFICATION=true` dans `.env`
- **Service email** : Utilise Mailgun pour l'envoi des emails de vérification
- **Variables requises** :
  - `MAILGUN_API_KEY` : Clé API Mailgun
  - `MAILGUN_DOMAIN` : Domaine Mailgun configuré
  - `MAILGUN_FROM_EMAIL` : Adresse email d'expédition

### Protection anti-bot avec Cloudflare Turnstile

Un captcha Cloudflare Turnstile peut être activé sur le formulaire d'inscription.

**Backend** :
- **Configuration** : Ajouter les variables suivantes dans `.env`
  - `REQUIRE_CAPTCHA=true` : Active la vérification du captcha
  - `TURNSTILE_SECRET_KEY=xxx` : Clé secrète Turnstile (obtenue depuis le dashboard Cloudflare)
- **Vérification** : Le token est vérifié côté serveur dans l'endpoint `/accounts/signup`
- **Codes d'erreur** :
  - `CAPTCHA_REQUIRED` : Token manquant
  - `CAPTCHA_FAILED` : Vérification échouée
  - `CAPTCHA_ERROR` : Erreur lors de la vérification

**Frontend** :
- **Configuration** : Ajouter `VITE_TURNSTILE_SITE_KEY=xxx` dans `.env` (clé publique)
- **Widget** : Chargé automatiquement sur le formulaire d'inscription si la clé est configurée
- **Token** : Envoyé automatiquement lors de la création du compte

## Documentation

Documentation Swagger disponible sur http://localhost:8000/docs
