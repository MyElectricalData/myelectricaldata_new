---
sidebar_position: 1
---

# Notifications Slack

## Vue d'ensemble

Le système de notifications Slack permet d'envoyer automatiquement un message sur un canal Slack lorsqu'un utilisateur soumet une nouvelle contribution d'offre d'énergie.

Cette fonctionnalité est **optionnelle** et ne bloque jamais la soumission de contribution en cas d'erreur.

## Configuration

### Variables d'environnement

Ajouter dans `.env.api` :

```bash
# Slack Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_NOTIFICATIONS_ENABLED=true
```

### Créer un webhook Slack

1. Aller sur https://api.slack.com/apps
2. Créer une nouvelle application ou utiliser une existante
3. Activer "Incoming Webhooks"
4. Créer un nouveau webhook pour le canal désiré
5. Copier l'URL du webhook dans `SLACK_WEBHOOK_URL`

## Format des messages

Les notifications sont envoyées avec **Slack Block Kit** pour un formatage riche :

### Header
- Emoji selon le type : `:star2:` (nouveau fournisseur), `:new:` (nouvelle offre), `:arrows_counterclockwise:` (mise à jour)
- Titre : "Nouvelle contribution - {nom de l'offre}"

### Détails
- **Type** : Nouveau fournisseur / Nouvelle offre / Mise à jour d'offre
- **Fournisseur** : Nom du fournisseur (ou "[Fournisseur existant]")
- **Offre** : Nom de l'offre
- **Type d'offre** : BASE, HC_HP, TEMPO, EJP, etc.
- **Puissance** : kVA (ou "Non spécifié")
- **Contributeur** : Email de l'utilisateur

### Tarification
Affichage automatique selon le type d'offre :

- **BASE** : Prix base
- **HC_HP** : Prix HC et HP
- **TEMPO** : Prix Blue/White/Red HC/HP (limité à 4 premiers)
- **EJP** : Prix Normal et Pointe

### Actions
- **Lien vers la fiche des prix** : Si fourni
- **Bouton "Gérer cette contribution"** : Lien direct vers l'interface admin

## Exemple de message

```
🆕 Nouvelle contribution - EDF Tempo 2025

Type:                    Nouveau fournisseur:
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

## Implémentation

### Service Slack

Fichier : `apps/api/src/services/slack.py`

```python
from src.services.slack import slack_service

# Envoyer une notification
await slack_service.send_contribution_notification(contribution, user)
```

### Intégration dans l'API

Dans `apps/api/src/routers/energy_offers.py`, l'endpoint `POST /energy/contribute` :

```python
# Send Slack notification (fire-and-forget, don't block on errors)
try:
    await slack_service.send_contribution_notification(contribution, current_user)
except Exception as e:
    logger.error(f"[CONTRIBUTION] Failed to send Slack notification: {str(e)}")
    # Don't fail the contribution if Slack fails
```

## Gestion des erreurs

Le service Slack est conçu pour **ne jamais bloquer** la soumission d'une contribution :

### Erreurs gérées silencieusement

1. **Notifications désactivées** (`SLACK_NOTIFICATIONS_ENABLED=false`)
   - Log niveau `DEBUG`
   - Retourne `False` sans erreur

2. **Webhook URL manquante**
   - Log niveau `WARNING`
   - Retourne `False` sans erreur

3. **Timeout** (5 secondes)
   - Log niveau `ERROR`
   - Retourne `False` sans erreur

4. **Erreur HTTP** (400, 404, 500, etc.)
   - Log niveau `ERROR` avec statut et message
   - Retourne `False` sans erreur

5. **Exception générique**
   - Log niveau `ERROR`
   - Retourne `False` sans erreur

### Exception handling dans le router

```python
try:
    await slack_service.send_contribution_notification(contribution, current_user)
except Exception as e:
    logger.error(f"[CONTRIBUTION] Failed to send Slack notification: {str(e)}")
    # Don't fail the contribution if Slack fails
```

Même si le service Slack lève une exception inattendue, elle est catchée et loggée sans impact sur la réponse API.

## Tests

### Tests unitaires

Fichier : `apps/api/tests/unit/test_slack.py`

Scénarios testés :
- Notifications désactivées
- Webhook URL manquante
- Envoi réussi
- Erreur HTTP
- Timeout
- Formatage des prix (BASE, HC_HP, TEMPO, EJP)
- Fournisseur existant vs nouveau

### Lancer les tests

```bash
cd apps/api
uv run pytest tests/unit/test_slack.py -v
```

## Monitoring

### Logs

Les logs Slack utilisent le préfixe `[SLACK]` :

```bash
# Succès
[SLACK] Notification sent successfully

# Désactivé
[SLACK] Notifications disabled

# Erreurs
[SLACK] Webhook URL not configured
[SLACK] Timeout while sending notification
[SLACK] HTTP error 400: Bad Request
[SLACK] Failed to send notification: <error>
```

### Vérifier les logs

```bash
# Logs backend
docker logs myelectricaldata_new-backend-1 | grep SLACK

# Ou via make
make backend-logs | grep SLACK
```

## Performance

- **Timeout** : 5 secondes maximum
- **Async** : Non-bloquant, n'impacte pas le temps de réponse API
- **Fire-and-forget** : L'échec Slack n'affecte pas la contribution

## Sécurité

- L'URL du webhook Slack est **confidentielle** (ne jamais commit dans Git)
- Utilisez les variables d'environnement uniquement
- Le webhook doit être créé avec les permissions minimales (post message uniquement)

## Limitations

- Maximum **50 blocks** par message Slack (largement suffisant pour nos messages)
- Timeout de **5 secondes** (configurable dans le code si nécessaire)
- Les prix TEMPO sont limités aux **4 premiers** pour éviter un message trop long

## Désactivation

Pour désactiver les notifications Slack :

```bash
# Option 1 : Via la variable booléenne
SLACK_NOTIFICATIONS_ENABLED=false

# Option 2 : Supprimer/commenter le webhook URL
# SLACK_WEBHOOK_URL=
```

## Exemples de cas d'usage

### Nouveau fournisseur
```
⭐ Nouvelle contribution - TotalEnergies Verte Fixe
Type: Nouveau fournisseur
Fournisseur: TotalEnergies
...
```

### Nouvelle offre
```
🆕 Nouvelle contribution - EDF Vert Électrique
Type: Nouvelle offre
Fournisseur: [Fournisseur existant]
...
```

### Mise à jour
```
🔄 Nouvelle contribution - Enercoop Fixe 2025
Type: Mise à jour d'offre
Fournisseur: [Fournisseur existant]
...
```

## Voir aussi

- [Architecture des services](../architecture/services.md)
- [Email notifications](./email-notifications.md)
- [Contribution workflow](./contribution-workflow.md)
