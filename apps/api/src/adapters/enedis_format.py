"""Format des mesures Enedis Data Connect 2026.

Réponse 2026 (mesure_synchrone_auto/v2) :
    {idPrm, etapeMetier, periode: {dateDebut, dateFin}, pas?, grandeur: [
        {grandeurMetier: CONS|PROD, grandeurPhysique, unite, points: [{v, d, p?, n?, ...}]}]}

C'est le seul format que voit le reste du code : les réponses v5 (mode legacy, ou
repli du mode auto) sont converties ici. Mesuré le 04/10/2026 sur deux PRM : la
courbe de charge v5 et la 2026 portent les mêmes valeurs et les mêmes horodatages.
"""

import copy
import logging
import re
from datetime import datetime, timedelta
from typing import Any, cast

logger = logging.getLogger(__name__)

DEFAULT_INTERVAL_MINUTES = 30


def iso_duration_to_minutes(duration: str) -> int:
    """Pas ISO 8601 en minutes (PT5M → 5, PT30M → 30, PT1H → 60), 30 par défaut."""
    match = re.match(r"PT(\d+)([HM])", duration or "")
    if not match:
        logger.warning(f"[ENEDIS] Pas '{duration}' illisible, {DEFAULT_INTERVAL_MINUTES} minutes par défaut")
        return DEFAULT_INTERVAL_MINUTES
    value = int(match.group(1))
    return value * 60 if match.group(2) == "H" else value


def _shift_date(original: str, minutes: int) -> str:
    if "T" in original:
        dt = datetime.fromisoformat(original.replace("Z", "+00:00"))
        return (dt - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S")
    dt = datetime.strptime(original, "%Y-%m-%d %H:%M:%S")
    return (dt - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")


def shift_points_to_interval_start(response: dict[str, Any]) -> dict[str, Any]:
    """Recule chaque point d'une courbe de charge de son pas : fin d'intervalle → début.

    Enedis horodate la FIN de l'intervalle (00:30 couvre 00:00-00:30, et le point de
    minuit appartient à la veille). Les points sans pas (`p`), comme les mesures
    quotidiennes, ne bougent pas.
    """
    if "grandeur" not in response:
        return response

    shifted = copy.deepcopy(response)
    count = 0
    for grandeur in shifted["grandeur"]:
        for point in grandeur.get("points", []):
            if "d" not in point or "p" not in point:
                continue
            try:
                point["d"] = _shift_date(point["d"], iso_duration_to_minutes(point["p"]))
                count += 1
            except ValueError as e:
                logger.warning(f"[ENEDIS] Horodatage '{point['d']}' non décalé : {e}")

    if count:
        logger.info(f"[ENEDIS] {count} horodatages décalés de la fin au début d'intervalle")
    return shifted


def v5_to_2026(
    response: dict[str, Any],
    *,
    grandeur_metier: str,
    grandeur_physique: str,
    pas: str | None = None,
) -> dict[str, Any]:
    """Convertit une réponse de mesure v5 (`meter_reading`) au format 2026.

    Une réponse sans `meter_reading` (erreur ADAM-ERR0123 par exemple) est rendue telle quelle.
    """
    if "meter_reading" not in response:
        return response

    meter_reading = response["meter_reading"]
    points = []
    for reading in meter_reading.get("interval_reading", []):
        point = {"v": reading.get("value"), "d": reading.get("date")}
        if reading.get("interval_length"):
            point["p"] = reading["interval_length"]
        if reading.get("measure_type"):
            point["n"] = reading["measure_type"]
        points.append(point)

    converted: dict[str, Any] = {
        "idPrm": meter_reading.get("usage_point_id"),
        "etapeMetier": meter_reading.get("quality", "BRUT"),
        "periode": {"dateDebut": meter_reading.get("start"), "dateFin": meter_reading.get("end")},
        "grandeur": [
            {
                "grandeurMetier": grandeur_metier,
                "grandeurPhysique": grandeur_physique,
                "unite": meter_reading.get("reading_type", {}).get("unit"),
                "points": points,
                "calendrier": [],
            }
        ],
        "contexte": [],
    }
    if pas:
        converted["pas"] = pas
    return converted


def _first_usage_point(response: dict[str, Any]) -> dict[str, Any]:
    usage_points = response.get("customer", {}).get("usage_points") or [{}]
    return cast(dict[str, Any], usage_points[0])


def contract_v5_to_2026(response: dict[str, Any]) -> dict[str, Any]:
    """Contrat v5 (`customer.usage_points[0].contracts`) → contrat agrégé 2026.

    Même forme que EnedisAdapter.get_contract en mode new : situation_contrat (liste),
    synthese_contrat et comptage (plages heures creuses dans relais.plageHeuresCreuses).
    """
    if "customer" not in response:
        return response

    contracts = _first_usage_point(response).get("contracts", {})
    situation: dict[str, Any] = {
        "contract_type": contracts.get("contract_type"),
        "segment": contracts.get("segment"),
        "distribution_tariff": contracts.get("distribution_tariff"),
        "contract_status": contracts.get("contract_status"),
    }
    power = contracts.get("subscribed_power")
    if power:
        situation["subscribed_power"] = {"value": str(power).replace("kVA", "").strip(), "unit": "kVA"}

    offpeak = contracts.get("offpeak_hours")
    return {
        "situation_contrat": [situation],
        "synthese_contrat": {"consumption_last_activation_date": contracts.get("last_activation_date")},
        "comptage": {"relais": {"plageHeuresCreuses": offpeak}} if offpeak else None,
    }


def address_v5_to_2026(response: dict[str, Any]) -> dict[str, Any]:
    """Adresse v5 (`usage_point_addresses`) → forme donnees_generales_auto {"address": {...}}"""
    if "customer" not in response:
        return response

    address = _first_usage_point(response).get("usage_point", {}).get("usage_point_addresses", {})
    postal_code_city = " ".join(part for part in (address.get("postal_code"), address.get("city")) if part)
    return {
        "address": {
            "number_street_name": address.get("street"),
            "postal_code_city": postal_code_city or None,
            "insee_code": address.get("insee_code"),
        }
    }


def customer_v5_to_2026(response: dict[str, Any]) -> Any:
    """Identité / contact v5 → forme situation_contrat_auto ([{person, contact_data}])"""
    if "customer" not in response:
        return response

    customer = response["customer"]
    person = customer.get("identity", {}).get("natural_person", {})
    contact = customer.get("contact_data", {})
    return [
        {
            "person": {k: person.get(k) for k in ("title", "firstname", "lastname")} if person else {},
            "contact_data": {"phone": contact.get("phone"), "email": contact.get("email")} if contact else {},
        }
    ]
