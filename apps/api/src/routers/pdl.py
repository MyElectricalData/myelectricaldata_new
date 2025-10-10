from fastapi import APIRouter, Depends, HTTPException, status, Path, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from ..models import User, PDL
from ..models.database import get_db
from ..schemas import PDLCreate, PDLResponse, APIResponse, ErrorDetail
from ..schemas.requests import AdminPDLCreate
from ..middleware import get_current_user, require_admin, require_permission
from ..routers.enedis import get_valid_token
from ..adapters import enedis_adapter
import logging


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pdl", tags=["PDL Management"])


class PDLUpdateContract(BaseModel):
    subscribed_power: int | None = None
    offpeak_hours: dict | None = None


class PDLUpdateName(BaseModel):
    name: str | None = None


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
    current_user: User = Depends(get_current_user),
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
                            if isinstance(offpeak, str):
                                pdl.offpeak_hours = {"default": offpeak}
                            elif isinstance(offpeak, dict):
                                pdl.offpeak_hours = offpeak

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
        id=pdl.id, usage_point_id=pdl.usage_point_id, name=pdl.name, created_at=pdl.created_at
    )

    return APIResponse(success=True, data=pdl_response.model_dump())


@router.delete("/{pdl_id}", response_model=APIResponse)
async def delete_pdl(
    pdl_id: str = Path(..., description="PDL ID (UUID)", openapi_examples={"example_uuid": {"summary": "Example UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update display order for multiple PDLs"""
    logger.info(f"[REORDER] Received data: {order_data}")
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
                        # Parse offpeak hours - format can vary
                        if isinstance(offpeak, str):
                            # If it's a string like "HC : 22h30 - 06h30"
                            pdl.offpeak_hours = {"default": offpeak}
                        elif isinstance(offpeak, dict):
                            pdl.offpeak_hours = offpeak
                        logger.info(f"[FETCH CONTRACT] Set offpeak_hours: {pdl.offpeak_hours}")

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

    except Exception as e:
        import traceback
        traceback.print_exc()
        return APIResponse(
            success=False,
            error=ErrorDetail(code="ENEDIS_ERROR", message=f"Failed to fetch contract data: {str(e)}"),
        )
