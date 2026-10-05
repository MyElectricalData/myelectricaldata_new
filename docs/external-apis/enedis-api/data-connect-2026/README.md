# Enedis Data Connect 2026

Enedis a remplacé les API de données v5 (`metering_data_*`, `customers_*`) par les API « Data Connect 2026 » le 28/09/2026. Les API v5 doivent être arrêtées environ deux semaines plus tard (vers le 12/10/2026, sans date officielle publiée). La passerelle parle les deux, selon `ENEDIS_API_MODE`.

Les Swagger officiels de ce dossier viennent de DataHub (`https://datahub-enedis.fr/wp-content/uploads/<fichier>.yaml`). Guide des évolutions : <https://datahub-enedis.fr/wp-content/uploads/2026_Guide-des-evolutions-DataConnect.pdf>.

## Correspondance des appels

| Donnée | v5 (legacy) | Data Connect 2026 |
| --- | --- | --- |
| Jeton | `POST /oauth2/v3/token` | inchangé |
| Consommation quotidienne | `metering_data_dc/v5/daily_consumption` | `GET /mesure_synchrone_auto/v2/consommation_quotidienne` |
| Courbe de charge conso | `metering_data_clc/v5/consumption_load_curve` | `GET /mesure_synchrone_auto/v2/courbe_de_charge_consommation` |
| Puissance max | `metering_data_dcmp/v5/daily_consumption_max_power` | `GET /mesure_synchrone_auto/v2/puissance_conso_max_quotidienne` |
| Production quotidienne | `metering_data_dp/v5/daily_production` | `GET /mesure_synchrone_auto/v2/production_quotidienne` |
| Courbe de charge prod | `metering_data_plc/v5/production_load_curve` | `GET /mesure_synchrone_auto/v2/courbe_de_charge_production` |
| Contrat | `customers_upc/v5/usage_points/contracts` | `situation_contrat_auto/v1/{prm}` + `synth_contrat_auto/v1/{prm}` + `comptage_auto/v1/{prm}` |
| Adresse | `customers_upa/v5/usage_points/addresses` | `donnees_generales_auto/v1/{prm}` |
| Identité, contact | `customers_i/v5/identity`, `customers_cd/v5/contact_data` | `situation_contrat_auto/v1/{prm}` (`person`, `contact_data`) |
| Consentement | `dataconnect/v1/oauth2/authorize`, retour `code` + `usage_point_id` | `dataconnect/v2/oauth2/authorize`, retour `autorisation_id` **sans `code`**, à échanger via `POST /subscribed_services/v1` |

Paramètres des mesures : `pointId`, `dateDebut`, `dateFin` (fin exclue). La puissance max exige en plus `mesuresPas` (`P1D` ou `P1M`) et `grandeurPhysique` (`PMA` ou `TOUT`).

## Format des mesures

```json
{
  "idPrm": "99999999999991",
  "etapeMetier": "BRUT",
  "periode": { "dateDebut": "2026-09-29", "dateFin": "2026-10-01" },
  "modeCalcul": "MESURE",
  "grandeur": [
    {
      "grandeurMetier": "CONS",
      "grandeurPhysique": "PA",
      "unite": "W",
      "points": [{ "v": "4078", "d": "2026-09-29 00:30:00", "p": "PT30M", "n": "B" }]
    }
  ]
}
```

- `grandeurMetier` : `CONS` ou `PROD`. Unités : `Wh` (quotidien), `W` (courbe de charge), `VA` (puissance max).
- Valeurs `v` en chaîne, comme en v5. Pas `p` porté par chaque point de courbe ; `pas` global pour le quotidien (`P1D`).
- Courbe de charge : `d` horodate la **fin** de l'intervalle, comme en v5 (mesuré le 04/10/2026 : mêmes 96 points, mêmes valeurs, mêmes horodatages en v5 et en 2026 sur deux PRM). La passerelle recule chaque point de son pas pour l'horodater au début de l'intervalle.
- Erreur « période antérieure à la mise en service » : toujours `{"error": "ADAM-ERR0123", "error_description": ...}` en 400.

## Contrat

Les API ITC répondent en anglais (`snake_case`), contrairement aux mesures :

- `situation_contrat_auto` rend une **liste** de contrats. Un PRM en autoconsommation en porte deux : soutirage (`Contrat GRD-F`, segment `C5`, avec `subscribed_power`) et injection (`Contrat GRD-A`, segment `P4`, sans puissance). La passerelle retient le contrat de soutirage.
- `synth_contrat_auto` : `consumption_last_activation_date`, `generation_last_activation_date` (production), `services_level`.
- `comptage_auto` : les plages heures creuses sont dans `relais.plageHeuresCreuses`, une **chaîne** sans exemple au Swagger, lue comme l'ancien `offpeak_hours` (`HC (22H00-6H00;...)`).

La passerelle rend un contrat agrégé : `{"situation_contrat": [...], "synthese_contrat": {...}, "comptage": {...} | null}`.

## Pièges relevés

- Le PRM des API ITC va dans le **chemin**. En paramètre de requête, Enedis répond 500.
- Toute requête hors Swagger répond 500 (et non 400), ce qui masque les erreurs de paramètres.
- Le guide écrit `index_consumption`, le Swagger `index_consommation` : suivre le Swagger.
- Chaque API doit être souscrite pour l'application sur DataHub. Sinon : 403 `900908 API Subscription validation failed` (cas de `comptage_auto` au 04/10/2026).
- Quota : 5 appels par seconde et 1000 par heure, par API.
- Les consentements donnés avant la bascule fonctionnent sur les nouvelles API de mesure (vérifié sur un PRM consommateur et un PRM en autoconsommation) : pas de nouveau consentement à demander.

## Configuration de la passerelle

| Variable | Valeurs | Défaut | Rôle |
| --- | --- | --- | --- |
| `ENEDIS_API_MODE` | `legacy`, `new`, `auto` | `auto` | `new` : API 2026 seules. `legacy` : API v5 seules. `auto` : API 2026, repli sur la v5 en cas d'erreur HTTP (pas sur `ADAM-ERR0123`). Dans tous les cas la réponse est au format 2026. En `auto`, les heures creuses sont lues dans le contrat v5 tant que `comptage_auto` est indisponible. |
| `ENEDIS_AUTHORIZE_VERSION` | `v1`, `v2` | `v1` | Page de consentement. Le callback accepte `code` + `usage_point_id` (v1) et `autorisation_id` seul (v2) quelle que soit la valeur. Passée à `v2` en prod le 05/10/2026. |
| `ENEDIS_AUTHORIZE_URL` | URL | vide | Surcharge complète de l'URL de consentement. |

Chart Helm serveur : `config.enedisApiMode`, `config.enedisAuthorizeVersion`, `config.enedisAuthorizeUrl`.

Bascule prévue : `auto` dès le déploiement, puis `new` après l'arrêt des API v5. Passer `ENEDIS_AUTHORIZE_VERSION=v2` le jour où Enedis coupe la page de consentement v1, et mettre à jour l'URL de redirection sur DataHub.

## Consentement v2

Mesuré en prod le 05/10/2026 :

- Enedis renvoie `/oauth/callback?autorisation_id=<id>&state=<state>`, **sans `code`**. Le front (`utils/oauthCallback.ts`) relaie dès que `code` **ou** `autorisation_id` est présent, et `code` est facultatif sur `GET /oauth/callback`.
- La passerelle appelle `POST /subscribed_services/v1` (jeton client_credentials global, corps `{"autorisationId": <id>, "comptage": false}`) et retient les services `ACTIF` ou `DEMANDE`.
- Un partage v2 porte **un seul PRM**. L'`autorisation_id` est stable pour une application et un titulaire : supprimer le partage puis le refaire redonne le même identifiant.
- Repartager un PRM **déjà partagé** avec l'application échoue chez Enedis (« Une erreur est survenue lors du partage de vos données »), sans retour vers la passerelle : supprimer d'abord l'ancien partage dans l'espace client Enedis.
- Le chart Helm transmet `ENEDIS_AUTHORIZE_VERSION` au backend à partir de la version **2.0.1** (le ConfigMap seul ne suffit pas : le déploiement mappe ses variables une à une).

## Format servi par la passerelle

Les conteneurs locaux jusqu'à la 1.22.0 ne lisent que le format v5 : face à une réponse 2026, ils enregistrent 0 donnée sans erreur. La passerelle choisit donc le format selon l'en-tête `X-MED-Format` :

| Appelant | En-tête | Réponse |
| --- | --- | --- |
| Front et conteneur local >= 2.0.1 | `X-MED-Format: 2026` | format 2026 |
| Conteneur local <= 2.0.0, intégration tierce | aucun | format v5, avec l'en-tête `Deprecation: @1791153780` (RFC 9745, date de la 2.0.0) |

Routes concernées : `/enedis/consumption/daily`, `/enedis/consumption/detail`, `/enedis/power`, `/enedis/production/daily`, `/enedis/production/detail`, `/enedis/contract`, `/enedis/address`. Les champs v5 absents de Data Connect 2026 (statut du contrat, type de compteur) ne sont pas reconstruits.

Chaque réponse v5 est journalisée (`[COMPAT v5]`, avec le User-Agent) : quand ces lignes disparaissent des logs, la compatibilité peut être retirée. Le conteneur local s'annonce en `MyElectricalData-Client/<version>` depuis la 2.0.1 ; la 2.0.0 (publiée sans l'en-tête) et les versions antérieures envoient toutes `MyElectricalData-Client/1.0` et ne se distinguent pas. La 2.0.0 lit le v5 sans perte.

Une intégration tierce qui lit déjà le format 2026 doit envoyer `X-MED-Format: 2026` : sans lui, elle reçoit le v5.

## Code

- `apps/api/src/adapters/enedis.py` : appels, modes, contrat agrégé, `subscribed_services`.
- `apps/api/src/adapters/enedis_format.py` : format 2026, décalage des horodatages, conversion v5 vers 2026 (mode legacy, repli auto, cache Redis et clients encore en v5).
- `apps/api/src/services/enedis_contract.py` : lecture du contrat et de l'adresse.
- `apps/api/src/routers/format_negotiation.py` et `apps/api/src/services/enedis_legacy.py` : format v5 servi aux clients sans `X-MED-Format: 2026`.
- `apps/web/src/utils/enedisMeasure.ts` : seul point du front qui lit ces formats.
- Fixtures anonymisées issues de captures réelles : `apps/api/tests/fixtures/enedis_2026/`.
