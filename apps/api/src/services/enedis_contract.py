"""Lecture du contrat Enedis Data Connect 2026 (MED-14).

Point unique de parsing du contrat agrégé rendu par EnedisAdapter.get_contract :
    {"situation_contrat": [...], "synthese_contrat": {...}, "comptage": {...} | None}

Remplace les copies du parsing v5 de routers/pdl.py et routers/oauth.py.
"""

import logging
import re
from datetime import date, datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Un PRM en autoconsommation porte deux contrats : soutirage (GRD-F, segment C*)
# et injection (GRD-A, segment P*, sans puissance souscrite).
INJECTION_CONTRACT_TYPES = ("GRD-A",)

HC_WRAPPER = re.compile(r"HC\s*\(([^)]+)\)", re.IGNORECASE)
HC_RANGE = re.compile(r"(\d{1,2})[hH:](\d{2})\s*-\s*(\d{1,2})[hH:](\d{2})")


def _parse_date(value: Optional[str]) -> Optional[date]:
    """'2018-08-31T00:00:00+0200', '2018-08-31+02:00' ou '2018-08-31' → date"""
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        logger.warning(f"[CONTRAT] Date illisible : {value!r}")
        return None


def _parse_power(power: Any) -> Optional[int]:
    """{"value": "12", "unit": "kVA"}, "12 kVA" ou 12 → 12"""
    if isinstance(power, dict):
        power = power.get("value")
    if power is None:
        return None
    try:
        return int(float(str(power).replace("kVA", "").strip()))
    except ValueError:
        logger.warning(f"[CONTRAT] Puissance souscrite illisible : {power!r}")
        return None


def _is_injection(contract: dict[str, Any]) -> bool:
    contract_type = contract.get("contract_type") or ""
    return any(t in contract_type for t in INJECTION_CONTRACT_TYPES) or str(contract.get("segment", "")).startswith("P")


def _select_consumption_contract(situations: list[dict[str, Any]]) -> dict[str, Any]:
    """Contrat de soutirage parmi ceux du PRM ; à défaut, le premier qui porte une puissance."""
    for contract in situations:
        if not _is_injection(contract):
            return contract
    for contract in situations:
        if contract.get("subscribed_power"):
            return contract
    return situations[0] if situations else {}


def parse_offpeak_hours(comptage: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Plages heures creuses de comptage_auto (`relais.plageHeuresCreuses`, chaîne libre).

    Rend {"ranges": ["22:00-06:00", ...]} comme le parsing historique, ou
    {"default": <chaîne>} si le format n'est pas reconnu (rien n'est perdu).
    """
    if not comptage:
        return None
    raw = (comptage.get("relais") or {}).get("plageHeuresCreuses")
    if not raw:
        return None

    # Format hérité : dict de chaînes, une par période
    values = [v for v in raw.values() if isinstance(v, str)] if isinstance(raw, dict) else [raw]
    ranges = []
    for value in values:
        wrapped = HC_WRAPPER.search(value)
        content = wrapped.group(1) if wrapped else value
        for part in content.split(";"):
            match = HC_RANGE.search(part)
            if match:
                start_h, start_m, end_h, end_m = match.groups()
                parsed = f"{start_h.zfill(2)}:{start_m}-{end_h.zfill(2)}:{end_m}"
                if parsed not in ranges:  # format hérité : la même plage répétée par jour
                    ranges.append(parsed)

    if ranges:
        return {"ranges": ranges}
    return raw if isinstance(raw, dict) else {"default": raw}


def offpeak_hours_to_text(offpeak: Any) -> Any:
    """Plages HC stockées ({"ranges": ["22:00-06:00"]} ou {"default": ...}) → forme relais.plageHeuresCreuses"""
    if not isinstance(offpeak, dict):
        return offpeak
    if offpeak.get("ranges"):
        return "HC (" + ";".join(r.replace(":", "H") for r in offpeak["ranges"]) + ")"
    if "default" in offpeak:
        return offpeak["default"]
    return offpeak


def parse_contract(contract: dict[str, Any]) -> dict[str, Any]:
    """Champs utiles du contrat agrégé : puissance, heures creuses, dates, production"""
    situations = contract.get("situation_contrat") or []
    if isinstance(situations, dict):
        situations = [situations]
    synthese = contract.get("synthese_contrat") or {}
    consumption = _select_consumption_contract(situations)

    return {
        "subscribed_power": _parse_power(consumption.get("subscribed_power")),
        "offpeak_hours": parse_offpeak_hours(contract.get("comptage")),
        "activation_date": _parse_date(synthese.get("consumption_last_activation_date")),
        "production_activation_date": _parse_date(synthese.get("generation_last_activation_date")),
        "distribution_tariff": consumption.get("distribution_tariff"),
        "segment": consumption.get("segment"),
        "has_production": any(_is_injection(c) for c in situations)
        or bool(synthese.get("generation_last_activation_date")),
    }


def apply_contract_to_pdl(pdl: Any, contract: dict[str, Any], log_prefix: str = "[CONTRAT]") -> dict[str, Any]:
    """Reporte puissance, heures creuses et date de mise en service sur le PDL.

    Un champ absent du contrat (comptage indisponible par exemple) ne touche pas la
    valeur déjà en base. Rend le contrat parsé.
    """
    parsed = parse_contract(contract)
    if parsed["subscribed_power"] is not None:
        pdl.subscribed_power = parsed["subscribed_power"]
    if parsed["offpeak_hours"] is not None:
        pdl.offpeak_hours = parsed["offpeak_hours"]
    if parsed["activation_date"] is not None:
        pdl.activation_date = parsed["activation_date"]
    logger.info(
        f"{log_prefix} Contrat : {parsed['subscribed_power']} kVA, HC {parsed['offpeak_hours']}, "
        f"mise en service {parsed['activation_date']}"
    )
    return parsed


def parse_address(response: dict[str, Any]) -> dict[str, Any]:
    """Adresse donnees_generales_auto → champs à plat (rue, code postal, ville, INSEE).

    `postal_code_city` regroupe code postal et commune ("59199 BRUILLE ST AMAND").
    """
    address = response.get("address") or {}
    postal_code_city = (address.get("postal_code_city") or "").strip()
    match = re.match(r"(\d{5})\s+(.*)", postal_code_city)
    return {
        "street": address.get("number_street_name"),
        "postal_code": match.group(1) if match else None,
        "city": match.group(2) if match else (postal_code_city or None),
        "insee_code": address.get("insee_code"),
        "country": "France",
    }
