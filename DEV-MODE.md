# Mode Développement

## 🔥 Hot-Reload automatique

Le mode développement permet de modifier le frontend et voir les changements **immédiatement** sans rebuild manuel.

### Démarrer le mode dev

```bash
./dev-start.sh
```

Ou manuellement :
```bash
docker compose -f docker-compose.dev.yml up --build
```

### Accès

- **Frontend (dev)**: http://localhost:5173 (avec hot-reload ✨)
- **Backend API**: http://localhost:8000
- **Production**: https://myelectricaldata.fr (continue de fonctionner)

### Arrêter le mode dev

```bash
./dev-stop.sh
```

Ou manuellement :
```bash
docker compose -f docker-compose.dev.yml down
```

---

## 📦 Rebuild manuel du frontend production

Si vous préférez rebuilder manuellement le frontend de production :

```bash
./rebuild-frontend.sh
```

Ou manuellement :
```bash
docker compose build --no-cache frontend && docker compose up -d --force-recreate frontend
```

---

## 💡 Conseils

1. **En développement** : Utilisez `./dev-start.sh` pour avoir le hot-reload automatique
2. **En production** : Utilisez le docker-compose normal avec `./rebuild-frontend.sh` quand nécessaire
3. Les deux modes peuvent tourner en même temps sur des ports différents

---

## 🔧 Troubleshooting

### Le hot-reload ne fonctionne pas
- Vérifiez que les volumes sont bien montés : `docker compose -f docker-compose.dev.yml config`
- Redémarrez le container : `docker compose -f docker-compose.dev.yml restart frontend-dev`

### Port 5173 déjà utilisé
- Arrêtez l'autre processus ou changez le port dans `docker-compose.dev.yml`

### Les changements n'apparaissent pas
- Videz le cache du navigateur (Ctrl+Shift+R ou Cmd+Shift+R)
- Vérifiez les logs : `docker compose -f docker-compose.dev.yml logs -f frontend-dev`
