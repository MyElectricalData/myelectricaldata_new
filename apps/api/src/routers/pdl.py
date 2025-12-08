from fastapi import APIRouter, Depends, HTTPException, status, Path, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from ..models import User, PDL
from ..models.energy_provider import EnergyOffer
from ..models.database import get_db
from ..schemas import PDLCreate, PDLResponse, APIResponse, ErrorDetail
from ..schemas.requests import AdminPDLCreate
from ..middleware import get_current_user, require_admin, require_permission, require_not_demo
from ..routers.enedis import get_valid_token
from ..adapters import enedis_adapter
import logging


logger = logging.getLogger(__name__)

# Helper function to add PDL prefix to log messages
def log_with_pdl(level: str, pdl: str, message: str):
    """Add PDL prefix to log message: [XXXXXXXXXXXXXX] message"""
    prefixed_message = f"[{pdl}] {message}"
    if level == "info":
        logger.info(prefixed_message)
    elif level == "warning":
        logger.warning(prefixed_message)
    elif level == "error":
        logger.error(prefixed_message)
    elif level == "debug":
        logger.debug(prefixed_message)

router = APIRouter(prefix="/pdl", tags=["PDL Management"])


class PDLUpdateContract(BaseModel):
    subscribed_power: int | None = None
    offpeak_hours: list[str] | dict | None = None  # Array format or legacy object format


class PDLUpdateName(BaseModel):
    name: str | None = None


class PDLUpdateType(BaseModel):
    has_consumption: bool
    has_production: bool


class PDLUpdateActive(BaseModel):
    is_active: bool


class PDLLinkProduction(BaseModel):
    linked_production_pdl_id: str | None = None  # None to unlink


class PDLUpdatePricingOption(BaseModel):
    pricing_option: str | None = None  # BASE, HC_HP, TEMPO, EJP, HC_WEEKEND


class PDLUpdateSelectedOffer(BaseModel):
    selected_offer_id: str | None = None  # Energy offer ID or None to unselect


class PDLOrderItem(BaseModel):
    id: str
    order: int


class PDLUpdateOrder(BaseModel):
    pdl_orders: list[PDLOrderItem]


@router.get("/", response_model=APIResponse)
async def list_pdls(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Liste tous vos points de livraison (PDL)

    ✨ **Utilisez cet endpoint en premier** pour récupérer vos `usage_point_id`
    à utiliser dans les autres endpoints de l'API Enedis.
    """
    logger.info(f"[PDL] list_pdls called for user: {current_user.email}")
    result = await db.execute(
        select(PDL)
        .where(PDL.user_id == current_user.id)
        .order_by(PDL.display_order.asc().nulls_last(), PDL.created_at.desc())
    )
    pdls = result.scalars().all()

    pdl_responses = [
        PDLResponse(
            id=pdl.id,
            usage_point_id=pdl.usage_point_id,
            name=pdl.name,
            created_at=pdl.created_at,
            display_order=pdl.display_order,
            subscribed_power=pdl.subscribed_power,
            offpeak_hours=pdl.offpeak_hours,
            pricing_option=pdl.pricing_option,
            has_consumption=pdl.has_consumption,
            has_production=pdl.has_production,
            is_active=pdl.is_active,
            oldest_available_data_date=pdl.oldest_available_data_date,
            activation_date=pdl.activation_date,
            linked_production_pdl_id=pdl.linked_production_pdl_id,
            selected_offer_id=pdl.selected_offer_id,
        )
        for pdl in pdls
    ]

    return APIResponse(success=True, data=[pdl.model_dump() for pdl in pdl_responses])


@router.post("/", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def create_pdl(
    pdl_data: PDLCreate = Body(
        ...,
        openapi_examples={
            "standard": {
                "summary": "Standard PDL",
                "description": "Create a PDL with a standard 14-digit identifier",
                "value": {"usage_point_id": "12345678901234", "name": "Mon compteur principal"}
            },
            "secondary": {
                "summary": "Secondary PDL",
                "description": "Add a secondary property PDL",
                "value": {"usage_point_id": "98765432109876", "name": "Résidence secondaire"}
            }
        }
    ),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Add a new PDL to current user"""
    # Check if PDL already exists for this user
    result = await db.execute(
        select(PDL).where(PDL.user_id == current_user.id, PDL.usage_point_id == pdl_data.usage_point_id)
    )
    existing_pdl = result.scalar_one_or_none()

    if existing_pdl:
        return APIResponse(
            success=False, error=ErrorDetail(code="PDL_EXISTS", message="This PDL is already registered")
        )

    # Create PDL
    pdl = PDL(user_id=current_user.id, usage_point_id=pdl_data.usage_point_id, name=pdl_data.name)

    db.add(pdl)
    await db.commit()
    await db.refresh(pdl)

    # Try to fetch contract info from Enedis automatically
    try:
        access_token = await get_valid_token(pdl.usage_point_id, current_user, db)
        if access_token:
            contract_data = await enedis_adapter.get_contract(pdl.usage_point_id, access_token)

            if contract_data and "customer" in contract_data and "usage_points" in contract_data["customer"]:
                usage_points = contract_data["customer"]["usage_points"]
                if usage_points and len(usage_points) > 0:
                    usage_point = usage_points[0]

                    if "contracts" in usage_point:
                        contract = usage_point["contracts"]

                        if "subscribed_power" in contract:
                            power_str = str(contract["subscribed_power"])
                            pdl.subscribed_power = int(power_str.replace("kVA", "").replace(" ", "").strip())

                        if "offpeak_hours" in contract:
                            offpeak = contract["offpeak_hours"]

                            # Parse offpeak hours - format: "HC (22H00-6H00)" or "HC (22H00-6H00;12h00-14h00)"
                            # Convert Enedis format to array of "HH:MM-HH:MM" strings
                            parsed_ranges = []

                            if isinstance(offpeak, str):
                                import re
                                # Extract content inside parentheses after "HC"
                                match = re.search(r'HC\s*\(([^)]+)\)', offpeak, flags=re.IGNORECASE)
                                if match:
                                    content = match.group(1)
                                    # Split by semicolon to get multiple ranges
                                    ranges = content.split(';')

                                    for range_str in ranges:
                                        range_str = range_str.strip()
                                        # Match format like "22H00-6H00" or "12h00-14h00"
                                        range_match = re.search(r'(\d{1,2})[hH](\d{2})\s*-\s*(\d{1,2})[hH](\d{2})', range_str)
                                        if range_match:
                                            start_h = range_match.group(1).zfill(2)
                                            start_m = range_match.group(2)
                                            end_h = range_match.group(3).zfill(2)
                                            end_m = range_match.group(4)
                                            parsed_ranges.append(f"{start_h}:{start_m}-{end_h}:{end_m}")

                            elif isinstance(offpeak, dict):
                                # Legacy dict format - convert values to array
                                import re
                                for value in offpeak.values():
                                    if isinstance(value, str):
                                        # Try new format with parentheses
                                        match = re.search(r'HC\s*\(([^)]+)\)', value, flags=re.IGNORECASE)
                                        if match:
                                            content = match.group(1)
                                            ranges = content.split(';')
                                            for range_str in ranges:
                                                range_str = range_str.strip()
                                                range_match = re.search(r'(\d{1,2})[hH](\d{2})\s*-\s*(\d{1,2})[hH](\d{2})', range_str)
                                                if range_match:
                                                    start_h = range_match.group(1).zfill(2)
                                                    start_m = range_match.group(2)
                                                    end_h = range_match.group(3).zfill(2)
                                                    end_m = range_match.group(4)
                                                    parsed_ranges.append(f"{start_h}:{start_m}-{end_h}:{end_m}")
                                        else:
                                            # Try old format without parentheses
                                            range_match = re.search(r'(\d{1,2})[h:](\d{2})\s*-\s*(\d{1,2})[h:](\d{2})', value)
                                            if range_match:
                                                start_h = range_match.group(1).zfill(2)
                                                start_m = range_match.group(2)
                                                end_h = range_match.group(3).zfill(2)
                                                end_m = range_match.group(4)
                                                parsed_ranges.append(f"{start_h}:{start_m}-{end_h}:{end_m}")

                            if parsed_ranges:
                                pdl.offpeak_hours = parsed_ranges
                            else:
                                # Fallback to storing raw data if parsing failed
                                if isinstance(offpeak, str):
                                    pdl.offpeak_hours = {"default": offpeak}
                                elif isinstance(offpeak, dict):
                                    pdl.offpeak_hours = offpeak

                        # Get contract activation date if available
                        if "last_activation_date" in contract:
                            from datetime import datetime as dt
                            activation_str = contract["last_activation_date"]
                            try:
                                # Parse ISO date format (e.g., "2020-01-15T00:00:00+01:00", "2018-08-31+02:00", or "2020-01-15")
                                if isinstance(activation_str, str):
                                    # Remove timezone info and time if present
                                    # Handle both "T" separator and "+" timezone separator
                                    date_part = activation_str.split('T')[0] if 'T' in activation_str else activation_str.split('+')[0]
                                    pdl.activation_date = dt.strptime(date_part, "%Y-%m-%d").date()
                                    logger.info(f"[CREATE PDL] Set activation_date: {pdl.activation_date}")
                            except Exception as e:
                                logger.warning(f"[CREATE PDL] Could not parse activation date '{activation_str}': {e}")

            # Detect PDL type (production and/or consumption) by testing Enedis endpoints
            from datetime import datetime, timedelta
            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            today = datetime.now().strftime("%Y-%m-%d")

            has_production = False
            has_consumption = False

            # Test consumption endpoint
            try:
                consumption_test = await enedis_adapter.get_consumption_daily(
                    pdl.usage_point_id, yesterday, today, access_token
                )
                if consumption_test and "meter_reading" in consumption_test:
                    has_consumption = True
                    log_with_pdl("info", pdl.usage_point_id, "[CREATE PDL] HAS CONSUMPTION (endpoint responded)")
            except Exception as e:
                logger.info(f"[CREATE PDL] Consumption endpoint failed: {str(e)}")

            # Test production endpoint
            try:
                production_test = await enedis_adapter.get_production_daily(
                    pdl.usage_point_id, yesterday, today, access_token
                )
                if production_test and "meter_reading" in production_test:
                    has_production = True
                    log_with_pdl("info", pdl.usage_point_id, "[CREATE PDL] HAS PRODUCTION (endpoint responded)")
            except Exception as e:
                logger.info(f"[CREATE PDL] Production endpoint failed: {str(e)}")

            # Set PDL type based on test results
            pdl.has_consumption = has_consumption
            pdl.has_production = has_production

            if has_consumption and has_production:
                logger.info(f"[CREATE PDL] Set PDL type: BOTH consumption and production")
            elif has_production:
                logger.info(f"[CREATE PDL] Set PDL type: PRODUCTION only")
            elif has_consumption:
                logger.info(f"[CREATE PDL] Set PDL type: CONSUMPTION only")
            else:
                # Default to consumption if neither worked (consent might be missing)
                pdl.has_consumption = True
                pdl.has_production = False
                logger.warning(f"[CREATE PDL] Could not detect PDL type, defaulting to CONSUMPTION")

            await db.commit()
            await db.refresh(pdl)
    except Exception as e:
        # Don't fail PDL creation if contract fetch fails
        logger.warning(f"[CREATE PDL] Could not fetch contract info: {e}")

    pdl_response = PDLResponse(
        id=pdl.id,
        usage_point_id=pdl.usage_point_id,
        name=pdl.name,
        created_at=pdl.created_at,
        subscribed_power=pdl.subscribed_power,
        offpeak_hours=pdl.offpeak_hours,
        pricing_option=pdl.pricing_option,
        has_consumption=pdl.has_consumption,
        has_production=pdl.has_production,
        is_active=pdl.is_active,
        oldest_available_data_date=pdl.oldest_available_data_date,
        activation_date=pdl.activation_date,
        linked_production_pdl_id=pdl.linked_production_pdl_id,
        selected_offer_id=pdl.selected_offer_id,
    )

    return APIResponse(success=True, data=pdl_response.model_dump())


@router.get("/{pdl_id}", response_model=APIResponse)
async def get_pdl(
    pdl_id: str = Path(
        ...,
        description="PDL ID (UUID)",
        openapi_examples={
            "example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}
        }
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Get a specific PDL"""
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    pdl_response = PDLResponse(
        id=pdl.id,
        usage_point_id=pdl.usage_point_id,
        name=pdl.name,
        created_at=pdl.created_at,
        display_order=pdl.display_order,
        subscribed_power=pdl.subscribed_power,
        offpeak_hours=pdl.offpeak_hours,
        pricing_option=pdl.pricing_option,
        has_consumption=pdl.has_consumption,
        has_production=pdl.has_production,
        is_active=pdl.is_active,
        oldest_available_data_date=pdl.oldest_available_data_date,
        activation_date=pdl.activation_date,
        linked_production_pdl_id=pdl.linked_production_pdl_id,
        selected_offer_id=pdl.selected_offer_id,
    )

    return APIResponse(success=True, data=pdl_response.model_dump())


@router.delete("/{pdl_id}", response_model=APIResponse)
async def delete_pdl(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Delete a PDL"""
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    await db.delete(pdl)
    await db.commit()

    return APIResponse(success=True, data={"message": "PDL deleted successfully"})


@router.patch("/{pdl_id}/name", response_model=APIResponse)
async def update_pdl_name(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    name_data: PDLUpdateName = Body(..., openapi_examples={"update_name": {"summary": "Update name", "value": {"name": "Nouveau nom de compteur"}}}),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update PDL custom name"""
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    pdl.name = name_data.name

    await db.commit()
    await db.refresh(pdl)

    return APIResponse(
        success=True,
        data={
            "id": pdl.id,
            "usage_point_id": pdl.usage_point_id,
            "name": pdl.name,
        },
    )


@router.patch("/{pdl_id}/type", response_model=APIResponse)
async def update_pdl_type(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    type_data: PDLUpdateType = Body(..., openapi_examples={
        "consumption_only": {"summary": "Consumption only", "value": {"has_consumption": True, "has_production": False}},
        "production_only": {"summary": "Production only", "value": {"has_consumption": False, "has_production": True}},
        "both": {"summary": "Both consumption and production", "value": {"has_consumption": True, "has_production": True}}
    }),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update PDL type (consumption and/or production)"""
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    pdl.has_consumption = type_data.has_consumption
    pdl.has_production = type_data.has_production

    await db.commit()
    await db.refresh(pdl)

    return APIResponse(
        success=True,
        data={
            "id": pdl.id,
            "usage_point_id": pdl.usage_point_id,
            "has_consumption": pdl.has_consumption,
            "has_production": pdl.has_production,
        },
    )


@router.patch("/{pdl_id}/active", response_model=APIResponse)
async def toggle_pdl_active(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    active_data: PDLUpdateActive = Body(..., openapi_examples={
        "activate": {"summary": "Activate PDL", "value": {"is_active": True}},
        "deactivate": {"summary": "Deactivate PDL", "value": {"is_active": False}}
    }),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Toggle PDL active/inactive status"""
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    pdl.is_active = active_data.is_active

    await db.commit()
    await db.refresh(pdl)

    return APIResponse(
        success=True,
        data={
            "id": pdl.id,
            "usage_point_id": pdl.usage_point_id,
            "is_active": pdl.is_active,
        },
    )


@router.patch("/{pdl_id}/pricing-option", response_model=APIResponse)
async def update_pdl_pricing_option(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    pricing_data: PDLUpdatePricingOption = Body(..., openapi_examples={
        "base": {"summary": "Tarif Base", "value": {"pricing_option": "BASE"}},
        "hc_hp": {"summary": "Heures Creuses / Heures Pleines", "value": {"pricing_option": "HC_HP"}},
        "tempo": {"summary": "Tarif Tempo", "value": {"pricing_option": "TEMPO"}},
        "ejp": {"summary": "Effacement Jour de Pointe", "value": {"pricing_option": "EJP"}},
        "hc_weekend": {"summary": "HC Nuit & Week-end", "value": {"pricing_option": "HC_WEEKEND"}},
        "clear": {"summary": "Remove pricing option", "value": {"pricing_option": None}}
    }),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Update PDL pricing option (tariff type).

    Available options:
    - **BASE**: Single price 24/7
    - **HC_HP**: Off-peak hours (Heures Creuses) / Peak hours (Heures Pleines)
    - **TEMPO**: 6-tier pricing based on day color (blue/white/red) and period (HC/HP)
    - **EJP**: Peak Day Curtailment (22 expensive days per year)
    - **HC_WEEKEND**: Off-peak hours extended to weekends
    """
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    # Validate pricing option if provided
    valid_options = ["BASE", "HC_HP", "TEMPO", "EJP", "HC_WEEKEND"]
    if pricing_data.pricing_option is not None and pricing_data.pricing_option not in valid_options:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="INVALID_PRICING_OPTION",
                message=f"Invalid pricing option. Must be one of: {', '.join(valid_options)}"
            )
        )

    pdl.pricing_option = pricing_data.pricing_option

    await db.commit()
    await db.refresh(pdl)

    return APIResponse(
        success=True,
        data={
            "id": pdl.id,
            "usage_point_id": pdl.usage_point_id,
            "pricing_option": pdl.pricing_option,
        },
    )


@router.patch("/{pdl_id}/selected-offer", response_model=APIResponse)
async def update_pdl_selected_offer(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    offer_data: PDLUpdateSelectedOffer = Body(..., openapi_examples={
        "select_offer": {"summary": "Select an energy offer", "value": {"selected_offer_id": "550e8400-e29b-41d4-a716-446655440001"}},
        "clear": {"summary": "Remove selected offer", "value": {"selected_offer_id": None}}
    }),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Update PDL selected energy offer.

    This endpoint allows you to select an energy offer for a PDL.
    When an offer is selected, the PDL's pricing_option will be automatically
    updated to match the offer's offer_type.

    Set `selected_offer_id` to `null` to remove the selection.
    """
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    # If clearing the selection
    if offer_data.selected_offer_id is None:
        pdl.selected_offer_id = None
        await db.commit()
        await db.refresh(pdl)

        return APIResponse(
            success=True,
            data={
                "id": pdl.id,
                "usage_point_id": pdl.usage_point_id,
                "selected_offer_id": None,
                "pricing_option": pdl.pricing_option,
            },
        )

    # Validate the offer exists and is active
    result = await db.execute(select(EnergyOffer).where(EnergyOffer.id == offer_data.selected_offer_id, EnergyOffer.is_active == True))
    offer = result.scalar_one_or_none()

    if not offer:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="OFFER_NOT_FOUND", message="Energy offer not found or not active")
        )

    # Update PDL with selected offer and sync pricing_option
    pdl.selected_offer_id = offer.id
    pdl.pricing_option = offer.offer_type

    await db.commit()
    await db.refresh(pdl)

    return APIResponse(
        success=True,
        data={
            "id": pdl.id,
            "usage_point_id": pdl.usage_point_id,
            "selected_offer_id": pdl.selected_offer_id,
            "pricing_option": pdl.pricing_option,
        },
    )


@router.patch("/{pdl_id}/link-production", response_model=APIResponse)
async def link_production_pdl(
    pdl_id: str = Path(..., description="PDL ID (UUID) of the consumption PDL", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    link_data: PDLLinkProduction = Body(..., openapi_examples={
        "link": {"summary": "Link to production PDL", "value": {"linked_production_pdl_id": "550e8400-e29b-41d4-a716-446655440001"}},
        "unlink": {"summary": "Unlink production PDL", "value": {"linked_production_pdl_id": None}}
    }),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Link a production PDL to a consumption PDL for combined graphs.

    This endpoint allows you to associate a production PDL with a consumption PDL.
    Once linked, you can create combined visualizations showing both consumption and production data.

    **Validation rules:**
    - The consumption PDL (pdl_id) must have `has_consumption=True`
    - The production PDL (linked_production_pdl_id) must have `has_production=True`
    - Both PDLs must belong to the same user
    - Set `linked_production_pdl_id` to `null` to unlink
    """
    # Get the consumption PDL
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    consumption_pdl = result.scalar_one_or_none()

    if not consumption_pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="Consumption PDL not found"))

    # Validate that this PDL has consumption
    if not consumption_pdl.has_consumption:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="INVALID_PDL_TYPE",
                message="This PDL does not have consumption data. Only consumption PDLs can be linked to production PDLs."
            )
        )

    # If unlinking (None), just clear the link
    if link_data.linked_production_pdl_id is None:
        consumption_pdl.linked_production_pdl_id = None
        await db.commit()
        await db.refresh(consumption_pdl)

        return APIResponse(
            success=True,
            data={
                "id": consumption_pdl.id,
                "usage_point_id": consumption_pdl.usage_point_id,
                "linked_production_pdl_id": None,
                "message": "Production PDL unlinked successfully"
            },
        )

    # If linking, validate the production PDL
    result = await db.execute(
        select(PDL).where(PDL.id == link_data.linked_production_pdl_id, PDL.user_id == current_user.id)
    )
    production_pdl = result.scalar_one_or_none()

    if not production_pdl:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="PDL_NOT_FOUND", message="Production PDL not found")
        )

    # Validate that the target PDL has production
    if not production_pdl.has_production:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="INVALID_PDL_TYPE",
                message="The target PDL does not have production data. Please select a PDL with production capability."
            )
        )

    # Prevent linking a PDL to itself
    if consumption_pdl.id == production_pdl.id:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_LINK", message="Cannot link a PDL to itself")
        )

    # Set the link
    consumption_pdl.linked_production_pdl_id = production_pdl.id

    await db.commit()
    await db.refresh(consumption_pdl)

    return APIResponse(
        success=True,
        data={
            "id": consumption_pdl.id,
            "usage_point_id": consumption_pdl.usage_point_id,
            "linked_production_pdl_id": consumption_pdl.linked_production_pdl_id,
            "linked_production_pdl_name": production_pdl.name or production_pdl.usage_point_id,
            "message": "Production PDL linked successfully"
        },
    )


@router.patch("/{pdl_id}/contract", response_model=APIResponse)
async def update_pdl_contract(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    contract_data: PDLUpdateContract = Body(
        ...,
        openapi_examples={
            "update_power": {
                "summary": "Update subscribed power",
                "value": {"subscribed_power": 6, "offpeak_hours": None}
            },
            "update_offpeak": {
                "summary": "Update off-peak hours",
                "value": {"subscribed_power": None, "offpeak_hours": {"default": "22h30-06h30"}}
            },
            "update_both": {
                "summary": "Update both",
                "value": {"subscribed_power": 9, "offpeak_hours": {"default": "02h00-07h00"}}
            }
        }
    ),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update PDL contract information (subscribed power and offpeak hours)"""
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    if contract_data.subscribed_power is not None:
        pdl.subscribed_power = contract_data.subscribed_power

    if contract_data.offpeak_hours is not None:
        pdl.offpeak_hours = contract_data.offpeak_hours

    await db.commit()
    await db.refresh(pdl)

    return APIResponse(
        success=True,
        data={
            "id": pdl.id,
            "usage_point_id": pdl.usage_point_id,
            "subscribed_power": pdl.subscribed_power,
            "offpeak_hours": pdl.offpeak_hours,
        },
    )


@router.patch("/reorder", response_model=APIResponse)
async def reorder_pdls(
    order_data: PDLUpdateOrder = Body(
        ...,
        openapi_examples={
            "reorder_example": {
                "summary": "Reorder PDLs",
                "description": "Update display order for multiple PDLs",
                "value": {
                    "pdl_orders": [
                        {"id": "550e8400-e29b-41d4-a716-446655440000", "order": 0},
                        {"id": "550e8400-e29b-41d4-a716-446655440001", "order": 1}
                    ]
                }
            }
        }
    ),
    current_user: User = Depends(require_not_demo),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update display order for multiple PDLs"""
    for item in order_data.pdl_orders:
        result = await db.execute(select(PDL).where(PDL.id == item.id, PDL.user_id == current_user.id))
        pdl = result.scalar_one_or_none()

        if pdl:
            pdl.display_order = item.order

    await db.commit()

    return APIResponse(success=True, data={"message": "PDL order updated successfully"})


@router.post("/admin/add", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def admin_add_pdl(
    pdl_data: AdminPDLCreate = Body(
        ...,
        openapi_examples={
            "admin_create": {
                "summary": "Admin create PDL",
                "description": "Admin creates PDL for a user",
                "value": {
                    "user_email": "user@example.com",
                    "usage_point_id": "12345678901234",
                    "name": "PDL créé par admin"
                }
            }
        }
    ),
    current_user: User = Depends(require_permission('users')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Admin-only: Add a PDL to any user without consent (requires users permission)"""
    # Find target user by email
    result = await db.execute(select(User).where(User.email == pdl_data.user_email))
    target_user = result.scalar_one_or_none()

    if not target_user:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="USER_NOT_FOUND", message=f"User with email {pdl_data.user_email} not found")
        )

    # Check if PDL already exists for this user
    result = await db.execute(
        select(PDL).where(PDL.user_id == target_user.id, PDL.usage_point_id == pdl_data.usage_point_id)
    )
    existing_pdl = result.scalar_one_or_none()

    if existing_pdl:
        return APIResponse(
            success=False, error=ErrorDetail(code="PDL_EXISTS", message="This PDL is already registered for this user")
        )

    # Create PDL for target user
    pdl = PDL(user_id=target_user.id, usage_point_id=pdl_data.usage_point_id, name=pdl_data.name)

    db.add(pdl)
    await db.commit()
    await db.refresh(pdl)

    pdl_response = PDLResponse(
        id=pdl.id,
        usage_point_id=pdl.usage_point_id,
        name=pdl.name,
        created_at=pdl.created_at,
        subscribed_power=pdl.subscribed_power,
        offpeak_hours=pdl.offpeak_hours,
        pricing_option=pdl.pricing_option,
        has_consumption=pdl.has_consumption,
        has_production=pdl.has_production,
        is_active=pdl.is_active,
        oldest_available_data_date=pdl.oldest_available_data_date,
        activation_date=pdl.activation_date,
        linked_production_pdl_id=pdl.linked_production_pdl_id,
        selected_offer_id=pdl.selected_offer_id,
    )

    return APIResponse(success=True, data=pdl_response.model_dump())


@router.post("/{pdl_id}/fetch-contract", response_model=APIResponse)
async def fetch_contract_from_enedis(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Fetch contract information from Enedis API and update PDL"""
    result = await db.execute(select(PDL).where(PDL.id == pdl_id, PDL.user_id == current_user.id))
    pdl = result.scalar_one_or_none()

    if not pdl:
        return APIResponse(success=False, error=ErrorDetail(code="PDL_NOT_FOUND", message="PDL not found"))

    # Get access token
    access_token = await get_valid_token(pdl.usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="ACCESS_DENIED", message="Cannot access Enedis API. Please verify consent."),
        )

    try:
        # Fetch contract data from Enedis
        contract_data = await enedis_adapter.get_contract(pdl.usage_point_id, access_token)

        # Log the structure for debugging
        logger.info(f"[FETCH CONTRACT] Raw contract data: {contract_data}")

        # Extract subscribed power (puissance souscrite)
        if contract_data and "customer" in contract_data and "usage_points" in contract_data["customer"]:
            usage_points = contract_data["customer"]["usage_points"]
            if usage_points and len(usage_points) > 0:
                usage_point = usage_points[0]

                # Get subscribed power and offpeak hours
                if "contracts" in usage_point:
                    contract = usage_point["contracts"]
                    logger.info(f"[FETCH CONTRACT] Contract object: {contract}")

                    if "subscribed_power" in contract:
                        power_str = str(contract["subscribed_power"])
                        # Extract just the number (handle "6 kVA", "6", etc.)
                        pdl.subscribed_power = int(power_str.replace("kVA", "").replace(" ", "").strip())
                        logger.info(f"[FETCH CONTRACT] Set subscribed_power: {pdl.subscribed_power}")

                    # Get offpeak hours if available
                    if "offpeak_hours" in contract:
                        offpeak = contract["offpeak_hours"]
                        logger.info(f"[FETCH CONTRACT] Offpeak hours: {offpeak}")

                        # Parse offpeak hours - format: "HC (22H00-6H00)" or "HC (22H00-6H00;12h00-14h00)"
                        # Convert Enedis format to array of "HH:MM-HH:MM" strings
                        parsed_ranges = []

                        if isinstance(offpeak, str):
                            import re
                            # Extract content inside parentheses after "HC"
                            match = re.search(r'HC\s*\(([^)]+)\)', offpeak, flags=re.IGNORECASE)
                            if match:
                                content = match.group(1)
                                # Split by semicolon to get multiple ranges
                                ranges = content.split(';')

                                for range_str in ranges:
                                    range_str = range_str.strip()
                                    # Match format like "22H00-6H00" or "12h00-14h00"
                                    range_match = re.search(r'(\d{1,2})[hH](\d{2})\s*-\s*(\d{1,2})[hH](\d{2})', range_str)
                                    if range_match:
                                        start_h = range_match.group(1).zfill(2)
                                        start_m = range_match.group(2)
                                        end_h = range_match.group(3).zfill(2)
                                        end_m = range_match.group(4)
                                        parsed_ranges.append(f"{start_h}:{start_m}-{end_h}:{end_m}")

                        elif isinstance(offpeak, dict):
                            # Legacy dict format - convert values to array
                            import re
                            for value in offpeak.values():
                                if isinstance(value, str):
                                    # Try new format with parentheses
                                    match = re.search(r'HC\s*\(([^)]+)\)', value, flags=re.IGNORECASE)
                                    if match:
                                        content = match.group(1)
                                        ranges = content.split(';')
                                        for range_str in ranges:
                                            range_str = range_str.strip()
                                            range_match = re.search(r'(\d{1,2})[hH](\d{2})\s*-\s*(\d{1,2})[hH](\d{2})', range_str)
                                            if range_match:
                                                start_h = range_match.group(1).zfill(2)
                                                start_m = range_match.group(2)
                                                end_h = range_match.group(3).zfill(2)
                                                end_m = range_match.group(4)
                                                parsed_ranges.append(f"{start_h}:{start_m}-{end_h}:{end_m}")
                                    else:
                                        # Try old format without parentheses
                                        range_match = re.search(r'(\d{1,2})[h:](\d{2})\s*-\s*(\d{1,2})[h:](\d{2})', value)
                                        if range_match:
                                            start_h = range_match.group(1).zfill(2)
                                            start_m = range_match.group(2)
                                            end_h = range_match.group(3).zfill(2)
                                            end_m = range_match.group(4)
                                            parsed_ranges.append(f"{start_h}:{start_m}-{end_h}:{end_m}")

                        if parsed_ranges:
                            pdl.offpeak_hours = parsed_ranges
                        else:
                            # Fallback to storing raw data if parsing failed
                            if isinstance(offpeak, str):
                                pdl.offpeak_hours = {"default": offpeak}
                            elif isinstance(offpeak, dict):
                                pdl.offpeak_hours = offpeak

                    # Get contract activation date if available
                    if "last_activation_date" in contract:
                        from datetime import datetime
                        activation_str = contract["last_activation_date"]
                        try:
                            # Parse ISO date format (e.g., "2020-01-15T00:00:00+01:00", "2018-08-31+02:00", or "2020-01-15")
                            if isinstance(activation_str, str):
                                # Remove timezone info and time if present
                                # Handle both "T" separator and "+" timezone separator
                                date_part = activation_str.split('T')[0] if 'T' in activation_str else activation_str.split('+')[0]
                                pdl.activation_date = datetime.strptime(date_part, "%Y-%m-%d").date()
                                logger.info(f"[FETCH CONTRACT] Set activation_date: {pdl.activation_date}")
                        except Exception as e:
                            logger.warning(f"[FETCH CONTRACT] Could not parse activation date '{activation_str}': {e}")

                        logger.info(f"[FETCH CONTRACT] Set offpeak_hours: {pdl.offpeak_hours}")

        # Detect PDL type (production and/or consumption) by testing Enedis endpoints
        from datetime import datetime, timedelta
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        today = datetime.now().strftime("%Y-%m-%d")

        has_production = False
        has_consumption = False

        # Test consumption endpoint
        try:
            consumption_test = await enedis_adapter.get_consumption_daily(
                pdl.usage_point_id, yesterday, today, access_token
            )
            if consumption_test and "meter_reading" in consumption_test:
                has_consumption = True
                log_with_pdl("info", pdl.usage_point_id, "[FETCH CONTRACT] HAS CONSUMPTION (endpoint responded)")
        except Exception as e:
            logger.info(f"[FETCH CONTRACT] Consumption endpoint failed: {str(e)}")

        # Test production endpoint
        try:
            production_test = await enedis_adapter.get_production_daily(
                pdl.usage_point_id, yesterday, today, access_token
            )
            if production_test and "meter_reading" in production_test:
                has_production = True
                log_with_pdl("info", pdl.usage_point_id, "[FETCH CONTRACT] HAS PRODUCTION (endpoint responded)")
        except Exception as e:
            logger.info(f"[FETCH CONTRACT] Production endpoint failed: {str(e)}")

        # Set PDL type based on test results
        # A PDL can have consumption, production, or both
        pdl.has_consumption = has_consumption
        pdl.has_production = has_production

        if has_consumption and has_production:
            logger.info(f"[FETCH CONTRACT] Set PDL type: BOTH consumption and production")
        elif has_production:
            logger.info(f"[FETCH CONTRACT] Set PDL type: PRODUCTION only")
        elif has_consumption:
            logger.info(f"[FETCH CONTRACT] Set PDL type: CONSUMPTION only")
        else:
            # Default to consumption if neither worked (consent might be missing)
            pdl.has_consumption = True
            pdl.has_production = False
            logger.warning(f"[FETCH CONTRACT] Could not detect PDL type, defaulting to CONSUMPTION")

        await db.commit()
        await db.refresh(pdl)

        return APIResponse(
            success=True,
            data={
                "id": pdl.id,
                "usage_point_id": pdl.usage_point_id,
                "subscribed_power": pdl.subscribed_power,
                "offpeak_hours": pdl.offpeak_hours,
                "has_consumption": pdl.has_consumption,
                "has_production": pdl.has_production,
                "activation_date": pdl.activation_date.isoformat() if pdl.activation_date else None,
            },
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="ENEDIS_ERROR", message=f"Failed to fetch contract data: {str(e)}"),
        )
