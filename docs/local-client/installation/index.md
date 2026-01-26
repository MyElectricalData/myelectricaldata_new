# Installation

Choisissez la méthode d'installation adaptée à votre environnement.

## Méthodes disponibles

| Méthode | Description | Recommandé pour |
|---------|-------------|-----------------|
| [Docker Compose](./docker.md) | Installation simple et rapide | Usage domestique, Raspberry Pi |
| [Helm Chart](./helm.md) | Déploiement Kubernetes | Infrastructure existante K8s |

## Prérequis communs

### Compte MyElectricalData

1. Créer un compte sur [www.v2.myelectricaldata.fr](https://www.v2.myelectricaldata.fr)
2. Autoriser vos PDL (Points de Livraison) via le consentement Enedis
3. Récupérer vos **Client ID** et **Client Secret** dans les paramètres

### Matériel minimum

- **RAM** : 512 Mo minimum (1 Go recommandé)
- **Disque** : 500 Mo + espace données
- **CPU** : 1 core minimum
- **Réseau** : Accès vers `www.v2.myelectricaldata.fr`

## Démarrage rapide

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
  <TabItem value="docker" label="Docker Compose" default>

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata

# Configurer
cp .env.local-client.example .env.local-client
nano .env.local-client  # Renseigner MED_CLIENT_ID et MED_CLIENT_SECRET

# Démarrer
docker compose -f docker-compose.yml up -d

# Accéder
open http://localhost:8100
```

➡️ [Guide complet Docker](./docker.md)

  </TabItem>
  <TabItem value="helm" label="Helm Chart">

```bash
cd helm

# Télécharger les dépendances
helm dependency build ./myelectricaldata-client

# Installer
helm install myelectricaldata ./myelectricaldata-client \
  --set secrets.med.clientId.value=cli_xxx \
  --set secrets.med.clientSecret.value=xxx \
  --set postgres.auth.password=xxx
```

➡️ [Guide complet Helm](./helm.md)

  </TabItem>
</Tabs>

## Ports par défaut

| Service | Port |
|---------|------|
| Frontend | 8100 |
| Backend API | 8181 |
| PostgreSQL | 5433 (interne) |
