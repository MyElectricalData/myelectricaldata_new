# Migrations de base de données

Ce dossier contient les scripts de migration pour la base de données PostgreSQL.

## 📋 Migrations disponibles

### Récentes
- `add_is_active_to_pdls.py` - Ajoute le champ `is_active` pour activer/désactiver les PDL
- `replace_is_production_with_dual_flags.py` - Remplace `is_production` par `has_consumption` et `has_production`
- `add_is_production_to_pdls.py` - Ajoute le champ `is_production`

### Système de rôles
- `001_add_roles.sql` - Création des tables pour le système de rôles et permissions
- `002_init_roles_data.sql` - Initialisation des données de rôles par défaut
- `init_roles_and_permissions.py` - Script Python pour initialiser les rôles

### Autres
- `add_power_kva_to_offers.py` - Ajoute la puissance en kVA aux offres
- `extract_power_from_names.py` - Extrait la puissance depuis les noms
- `add_contribution_docs.py` - Ajoute la documentation des contributions
- `update_contribution_fields.py` - Met à jour les champs de contribution
- `add_price_updated_at.py` - Ajoute le timestamp de mise à jour des prix

## 🚀 Comment exécuter une migration

### Méthode 1 : Via Docker (recommandé)

```bash
# Depuis le répertoire racine du projet
docker compose exec backend python /app/migrations/nom_de_la_migration.py
```

**Exemple :**
```bash
docker compose exec backend python /app/migrations/add_is_active_to_pdls.py
```

### Méthode 2 : Via SQL direct

```bash
# Pour PostgreSQL
docker compose exec postgres psql -U myelectricaldata -d myelectricaldata -f /path/to/migration.sql
```

**Ou en ligne de commande :**
```bash
docker compose exec postgres psql -U myelectricaldata -d myelectricaldata -c "ALTER TABLE ..."
```

## 📝 Structure d'une migration Python

Les migrations Python utilisent SQLAlchemy avec async/await :

```python
"""
Migration: Description de la migration
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    """Applique la migration"""
    async with async_session_maker() as session:
        async with session.begin():
            await session.execute(text('''
                ALTER TABLE table_name
                ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT VALUE
            '''))

            print("✅ Migration completed")


async def rollback():
    """Annule la migration (optionnel)"""
    async with async_session_maker() as session:
        async with session.begin():
            await session.execute(text('''
                ALTER TABLE table_name
                DROP COLUMN IF EXISTS column_name
            '''))

            print("✅ Rollback completed")


if __name__ == "__main__":
    print("Running migration: nom_de_la_migration")
    asyncio.run(migrate())
    print("Migration completed successfully!")
```

## ⚠️ Bonnes pratiques

1. **Toujours utiliser `IF NOT EXISTS` / `IF EXISTS`** pour éviter les erreurs si la migration a déjà été appliquée
2. **Tester en local** avant d'appliquer en production
3. **Créer un rollback** pour pouvoir annuler la migration si nécessaire
4. **Documenter** : ajouter une description claire de ce que fait la migration
5. **Versioning** : nommer les fichiers de manière claire (ex: `add_xxx_to_yyy.py`)

## 🔄 Rollback d'une migration

Si une migration contient une fonction `rollback()`, vous pouvez l'annuler :

```bash
docker compose exec backend python -c "
import asyncio
import sys
sys.path.insert(0, '/app')
from migrations.nom_de_la_migration import rollback
asyncio.run(rollback())
"
```

## 📊 Vérifier l'état de la base de données

```bash
# Afficher la structure d'une table
docker compose exec postgres psql -U myelectricaldata -d myelectricaldata -c "\d nom_table"

# Lister toutes les tables
docker compose exec postgres psql -U myelectricaldata -d myelectricaldata -c "\dt"

# Vérifier qu'une colonne existe
docker compose exec postgres psql -U myelectricaldata -d myelectricaldata -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='nom_table';"
```

## 🛠️ Dépannage

### Erreur "column already exists"
- Utilisez `IF NOT EXISTS` dans vos commandes `ALTER TABLE ADD COLUMN`

### Erreur de connexion à la base
- Vérifiez que le conteneur PostgreSQL est démarré : `docker compose ps`
- Vérifiez les logs : `docker compose logs postgres`

### Migration bloquée
- Vérifiez les locks : `SELECT * FROM pg_locks;`
- Redémarrez PostgreSQL si nécessaire : `docker compose restart postgres`
