---
sidebar_position: 2
title: Installation
---

# Installation du Client Local

## Méthode 1 : Docker (Recommandé)

### Docker Run

```bash
docker run -d \
  --name myelectricaldata-client \
  --restart unless-stopped \
  -e CLIENT_ID=votre_client_id \
  -e CLIENT_SECRET=votre_client_secret \
  -e GATEWAY_URL=https://api.myelectricaldata.fr \
  -v myelectricaldata_data:/data \
  -p 8080:8080 \
  myelectricaldata/local-client:latest
```

### Docker Compose

Créez un fichier `docker-compose.yml` :

```yaml
version: '3.8'

services:
  myelectricaldata:
    image: myelectricaldata/local-client:latest
    container_name: myelectricaldata-client
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      # Identifiants API (obligatoires)
      - CLIENT_ID=votre_client_id
      - CLIENT_SECRET=votre_client_secret
      - GATEWAY_URL=https://api.myelectricaldata.fr

      # Base de données (optionnel, SQLite par défaut)
      - DATABASE_URL=sqlite:///data/myelectricaldata.db

      # Synchronisation (optionnel)
      - SYNC_INTERVAL=3600  # Toutes les heures
      - SYNC_DAYS_BACK=7    # Récupérer les 7 derniers jours

      # Intégrations (optionnel)
      - MQTT_ENABLED=false
      - HA_ENABLED=true
      - VICTORIAMETRICS_ENABLED=false
    volumes:
      - ./data:/data
      - ./config:/config
```

Démarrez avec :

```bash
docker compose up -d
```

## Méthode 2 : Installation manuelle

### Prérequis

- Python 3.11+
- pip ou uv (gestionnaire de paquets)

### Installation

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/local-client.git
cd local-client

# Créer un environnement virtuel
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# ou .venv\Scripts\activate  # Windows

# Installer les dépendances
pip install -r requirements.txt
# ou avec uv
uv sync

# Copier la configuration exemple
cp config.example.yaml config.yaml

# Éditer la configuration
nano config.yaml

# Démarrer le client
python -m myelectricaldata_client
```

## Méthode 3 : Home Assistant Add-on

Si vous utilisez Home Assistant OS ou Supervised :

1. Allez dans **Paramètres** → **Modules complémentaires**
2. Cliquez sur **Boutique des modules complémentaires**
3. Menu ⋮ → **Dépôts** → Ajoutez :
   ```
   https://github.com/MyElectricalData/ha-addons
   ```
4. Recherchez **MyElectricalData Local Client**
5. Cliquez sur **Installer**
6. Configurez vos identifiants dans l'onglet **Configuration**
7. Démarrez l'add-on

## Configuration de la base de données

### SQLite (par défaut)

Aucune configuration nécessaire. La base est créée automatiquement dans `/data/myelectricaldata.db`.

```yaml
database:
  url: "sqlite:///data/myelectricaldata.db"
```

### PostgreSQL

```yaml
database:
  url: "postgresql://user:password@localhost:5432/myelectricaldata"
```

Avec Docker Compose :

```yaml
version: '3.8'

services:
  myelectricaldata:
    image: myelectricaldata/local-client:latest
    environment:
      - DATABASE_URL=postgresql://med:password@postgres:5432/myelectricaldata
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=med
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=myelectricaldata
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### MySQL / MariaDB

```yaml
database:
  url: "mysql://user:password@localhost:3306/myelectricaldata"
```

Avec Docker Compose :

```yaml
version: '3.8'

services:
  myelectricaldata:
    image: myelectricaldata/local-client:latest
    environment:
      - DATABASE_URL=mysql://med:password@mariadb:3306/myelectricaldata
    depends_on:
      - mariadb

  mariadb:
    image: mariadb:11
    environment:
      - MYSQL_ROOT_PASSWORD=rootpassword
      - MYSQL_DATABASE=myelectricaldata
      - MYSQL_USER=med
      - MYSQL_PASSWORD=password
    volumes:
      - mariadb_data:/var/lib/mysql

volumes:
  mariadb_data:
```

## Obtenir vos identifiants API

1. Connectez-vous sur [MyElectricalData](https://myelectricaldata.fr)
2. Allez dans **Paramètres** → **API**
3. Copiez votre `client_id` et `client_secret`

:::warning Important
Ne partagez jamais votre `client_secret`. Il donne accès à toutes vos données électriques.
:::

## Vérification de l'installation

Après le démarrage, vérifiez que le client fonctionne :

```bash
# Vérifier les logs
docker logs myelectricaldata-client

# Tester l'API locale
curl http://localhost:8080/health

# Vérifier la synchronisation
curl http://localhost:8080/api/status
```

Réponse attendue :

```json
{
  "status": "ok",
  "last_sync": "2024-01-15T10:30:00Z",
  "pdl_count": 1,
  "database": "sqlite",
  "integrations": {
    "home_assistant": true,
    "mqtt": false,
    "victoriametrics": false
  }
}
```

## Ports utilisés

| Port | Usage |
|------|-------|
| 8080 | API REST locale et interface web |
| 9090 | Métriques Prometheus (si activé) |

## Prochaines étapes

- [Configuration détaillée](./configuration)
- [Intégration Home Assistant](./integrations/home-assistant)
- [Configuration MQTT](./integrations/mqtt)
