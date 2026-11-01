# Installation

Le plus simple : **Docker Compose, en un seul conteneur**. Quelques minutes suffisent, sur un PC, un NAS ou un Raspberry Pi.

➡️ [Installer avec Docker](./docker.md)

:::tip Vous utilisez déjà l'ancien client (V1) ?
Installez la V2 à côté, puis importez l'historique de la V1 pour ne rien perdre :
[Migrer depuis la V1](../migration-v1.md).
:::

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

```bash
# Récupérer le fichier compose (pas besoin de cloner le dépôt)
curl -O https://raw.githubusercontent.com/MyElectricalData/myelectricaldata_new/main/docker-compose.client.yml

# Renseigner vos identifiants
cat > .env <<'EOF'
MED_CLIENT_ID=votre_client_id
MED_CLIENT_SECRET=votre_client_secret
EOF

# Démarrer (un seul conteneur, base SQLite)
docker compose -f docker-compose.client.yml up -d

# Accéder
open http://localhost:8100
```

➡️ [Guide complet Docker](./docker.md)

## Autres méthodes d'installation

Ces méthodes répondent à des besoins particuliers. Pour un usage domestique, Docker Compose ci-dessus est le chemin le plus court.

| Méthode | Description | Recommandé pour |
|---------|-------------|-----------------|
| [Helm Chart](./helm.md) | Déploiement Kubernetes | Infrastructure existante K8s |
| [Proxmox LXC](https://github.com/Marlboro62/myelectricaldata-proxmox) | Script communautaire, non officiel : conteneur LXC sans Docker | Serveur Proxmox VE |
| [Add-on Home Assistant](https://github.com/Marlboro62/hassio-addons) | Add-on communautaire, non officiel : mode client en un seul conteneur, PostgreSQL et nginx intégrés, import de l'historique v1 | Home Assistant OS ou Supervised, sans Docker |
| [Deux conteneurs](./docker.md#options-avancées-installations-en-deux-conteneurs) | `docker-compose.sqlite.yml` et `docker-compose.yml` | Installations existantes |

## Ports par défaut

| Service | Port |
|---------|------|
| Interface et API (`docker-compose.client.yml`, API sous `/api`) | 8100 |
| Frontend (deux conteneurs : `docker-compose.sqlite.yml`, `docker-compose.yml`) | 8100 |
| Backend API (deux conteneurs seulement) | 8181 |
| PostgreSQL (`docker-compose.yml` seulement) | 5433 (interne) |
