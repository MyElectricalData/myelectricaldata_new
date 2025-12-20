# Configuration des notifications Slack

Guide rapide pour configurer les notifications Slack pour les contributions d'offres d'énergie.

## Étape 1 : Créer un webhook Slack

1. Accédez à https://api.slack.com/apps
2. Cliquez sur **"Create New App"**
3. Sélectionnez **"From scratch"**
4. Donnez un nom à votre app : `MyElectricalData Contributions`
5. Choisissez votre workspace Slack
6. Cliquez sur **"Create App"**

## Étape 2 : Activer les Incoming Webhooks

1. Dans le menu de gauche, cliquez sur **"Incoming Webhooks"**
2. Activez **"Activate Incoming Webhooks"** (toggle en haut)
3. Cliquez sur **"Add New Webhook to Workspace"**
4. Sélectionnez le canal où les notifications seront envoyées (ex: `#contributions`)
5. Cliquez sur **"Allow"**

## Étape 3 : Copier l'URL du webhook

1. L'URL du webhook apparaît sous **"Webhook URL"**
2. Elle ressemble à : `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`
3. Copiez cette URL (bouton **"Copy"**)

## Étape 4 : Configurer les variables d'environnement

Dans le fichier `.env.api` :

```bash
# Slack Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/VOTRE/WEBHOOK/URL
SLACK_NOTIFICATIONS_ENABLED=true
```

**Important** : Ne commitez JAMAIS ce fichier avec l'URL réelle du webhook.

## Étape 5 : Redémarrer l'application

```bash
# Redémarrer le backend pour charger les nouvelles variables
make backend-restart

# Ou redémarrer tous les services
make restart
```

## Étape 6 : Tester

### Option 1 : Via le script de test

```bash
cd apps/api
uv run python scripts/test_slack_notification.py
```

### Option 2 : Soumettre une vraie contribution

1. Connectez-vous à l'application
2. Allez sur la page **Contribute**
3. Soumettez une contribution de test
4. Vérifiez que la notification apparaît dans votre canal Slack

## Vérification

### Vérifier la configuration

```bash
docker exec myelectricaldata_new-backend-1 python -c "from src.services.slack import slack_service; print(f'Enabled: {slack_service.enabled}'); print(f'Webhook configured: {bool(slack_service.webhook_url)}')"
```

Résultat attendu :
```
Enabled: True
Webhook configured: True
```

### Vérifier les logs

```bash
make backend-logs | grep SLACK
```

Logs attendus :
- `[SLACK] Notification sent successfully` (succès)
- `[SLACK] HTTP error 400: ...` (erreur)
- `[SLACK] Webhook URL not configured` (non configuré)

## Désactivation

Pour désactiver temporairement les notifications :

```bash
# Dans .env.api
SLACK_NOTIFICATIONS_ENABLED=false
```

Puis redémarrer le backend.

## Dépannage

### "Webhook URL not configured"

- Vérifiez que `SLACK_WEBHOOK_URL` est bien défini dans `.env.api`
- Vérifiez que le fichier `.env.api` est bien monté dans le container Docker

### "HTTP error 404: channel_not_found"

- Le canal Slack a été supprimé ou renommé
- Re-créez un webhook pour un nouveau canal

### "HTTP error 410: invalid_webhook_token"

- Le webhook a été révoqué
- Re-créez un nouveau webhook

### Les notifications ne partent pas

1. Vérifier la configuration :
   ```bash
   docker exec myelectricaldata_new-backend-1 env | grep SLACK
   ```

2. Vérifier les logs :
   ```bash
   make backend-logs | tail -100 | grep -i slack
   ```

3. Tester manuellement :
   ```bash
   cd apps/api
   uv run python scripts/test_slack_notification.py
   ```

## Sécurité

- **Ne partagez jamais** l'URL du webhook publiquement
- **Ne commitez jamais** le webhook dans Git
- Utilisez les **variables d'environnement** uniquement
- Créez un webhook **spécifique** pour MyElectricalData (ne réutilisez pas un webhook existant)
- Limitez les permissions aux **messages uniquement** (pas d'accès aux fichiers, etc.)

## Personnalisation du canal

Pour changer le canal de destination :

1. Retournez sur https://api.slack.com/apps
2. Sélectionnez votre app
3. Allez dans **"Incoming Webhooks"**
4. Supprimez l'ancien webhook
5. Créez un nouveau webhook pour le nouveau canal

## Exemple de notification

Après configuration, une contribution génère un message comme :

```
🆕 Nouvelle contribution - EDF Tempo 2025

Type:                    Fournisseur:
Nouvelle offre           EDF

Offre:                   Type d'offre:
EDF Tempo 2025           TEMPO

Puissance:               Contributeur:
6 kVA                    user@example.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tarification:
Abonnement: *12.50 €/mois*
Blue HC: 0.12340 €/kWh
Blue HP: 0.23450 €/kWh
White HC: 0.34560 €/kWh
White HP: 0.45670 €/kWh

Fiche des prix:
<https://edf.fr/tarifs.pdf|Voir la fiche>

[Gérer cette contribution] (bouton bleu)
```

## Voir aussi

- [Documentation complète](../features-spec/slack-notifications.md)
- [Architecture des services](../architecture/services.md)
