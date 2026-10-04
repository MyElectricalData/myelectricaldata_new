"""Réponses de la passerelle au format v5, pour les conteneurs locaux <= 1.22.0 (MED-12).

Un client 1.22.0 ne lit que le format v5. Face à une réponse 2026, il ne trouve pas
`meter_reading` et enregistre 0 donnée sans lever d'erreur. Ces conversions
reconstruisent ce qu'il lit, et seulement ça :
    - mesures : meter_reading.interval_reading[].{value, date, interval_length?, measure_type?}
    - contrat : customer.usage_points[0].{usage_point.usage_point_id, contracts.{...}}
    - adresse : customer.usage_points[0].usage_point.usage_point_addresses.{...}
Les champs v5 absents de Data Connect 2026 (statut du contrat, type de compteur)
ne sont pas inventés.
"""

from typing import Any

from .enedis_contract import _select_consumption_contract, parse_address, parse_contract


def measure_2026_to_v5(response: Any) -> Any:
    """Mesure 2026 (`grandeur[0].points`) → `meter_reading` v5 ; sans mesure, rendue telle quelle"""
    if not isinstance(response, dict) or not response.get("grandeur"):
        return response

    grandeur = response["grandeur"][0]
    readings = []
    for point in grandeur.get("points", []):
        reading = {"value": point.get("v"), "date": point.get("d")}
        if point.get("p"):
            reading["interval_length"] = point["p"]
        if point.get("n"):
            reading["measure_type"] = point["n"]
        readings.append(reading)

    periode = response.get("periode") or {}
    reading_type: dict[str, Any] = {"unit": grandeur.get("unite")}
    if response.get("pas"):
        reading_type["measuring_period"] = response["pas"]
    return {
        "meter_reading": {
            "usage_point_id": response.get("idPrm"),
            "start": periode.get("dateDebut"),
            "end": periode.get("dateFin"),
            "quality": response.get("etapeMetier", "BRUT"),
            "reading_type": reading_type,
            "interval_reading": readings,
        }
    }


def contract_2026_to_v5(response: Any, usage_point_id: str) -> Any:
    """Contrat agrégé 2026 → `customer.usage_points[0].contracts` v5 ; forme inconnue rendue telle quelle"""
    if not isinstance(response, dict) or "situation_contrat" not in response:
        return response

    situations = response.get("situation_contrat") or []
    if isinstance(situations, dict):
        situations = [situations]
    consumption = _select_consumption_contract(situations)
    parsed = parse_contract(response)

    contracts: dict[str, Any] = {
        "segment": parsed["segment"],
        "distribution_tariff": parsed["distribution_tariff"],
        "contract_type": consumption.get("contract_type"),
    }
    if parsed["subscribed_power"] is not None:
        contracts["subscribed_power"] = f"{parsed['subscribed_power']} kVA"
    if parsed["activation_date"]:
        contracts["last_activation_date"] = parsed["activation_date"].isoformat()
    # Chaîne v5 d'origine ("HC (22H00-6H00)") ou dict hérité : rendue telle que comptage_auto la donne
    offpeak = ((response.get("comptage") or {}).get("relais") or {}).get("plageHeuresCreuses")
    if offpeak:
        contracts["offpeak_hours"] = offpeak

    return {
        "customer": {
            "usage_points": [{"usage_point": {"usage_point_id": usage_point_id}, "contracts": contracts}],
        }
    }


def address_2026_to_v5(response: Any, usage_point_id: str) -> Any:
    """Adresse donnees_generales_auto → `usage_point.usage_point_addresses` v5 ; forme inconnue rendue telle quelle"""
    if not isinstance(response, dict) or "address" not in response:
        return response

    return {
        "customer": {
            "usage_points": [
                {"usage_point": {"usage_point_id": usage_point_id, "usage_point_addresses": parse_address(response)}}
            ],
        }
    }
