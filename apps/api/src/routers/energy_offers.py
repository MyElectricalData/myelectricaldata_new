from fastapi import APIRouter, Depends, HTTPException, status, Query, Path, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, UTC
from ..models import User, EnergyProvider, EnergyOffer, OfferContribution, ContributionMessage
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..middleware import get_current_user, require_permission, require_action
from ..services.email import email_service
from ..config import settings
import logging


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/energy", tags=["Energy Offers"])


# Public endpoints - Get providers and offers
@router.get("/providers", response_model=APIResponse)
async def list_providers(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """List all active energy providers"""
    result = await db.execute(select(EnergyProvider).where(EnergyProvider.is_active == True))
    providers = result.scalars().all()

    return APIResponse(
        success=True,
        data=[
            {
                "id": p.id,
                "name": p.name,
                "logo_url": p.logo_url,
                "website": p.website,
                "scraper_urls": p.scraper_urls,
            }
            for p in providers
        ],
    )


@router.get("/offers", response_model=APIResponse)
async def list_offers(
    provider_id: str | None = Query(None, description="Filter by provider ID", openapi_examples={"provider_uuid": {"summary": "Provider UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    include_history: bool = Query(False, description="Include historical offers", openapi_examples={"with_history": {"summary": "Include history", "value": True}, "current_only": {"summary": "Current offers only", "value": False}}),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """List all active energy offers, optionally filtered by provider

    By default, returns only offers valid for the current period (valid_to IS NULL or valid_to >= NOW)
    Set include_history=true to get all offers including historical ones
    """
    query = select(EnergyOffer).where(EnergyOffer.is_active == True)

    # Filter by current period only (unless include_history is True)
    if not include_history:
        now = datetime.now(UTC)
        query = query.where(
            (EnergyOffer.valid_to == None) | (EnergyOffer.valid_to >= now)
        )

    if provider_id:
        query = query.where(EnergyOffer.provider_id == provider_id)

    # Order by valid_from DESC to show most recent first
    query = query.order_by(EnergyOffer.valid_from.desc())

    result = await db.execute(query)
    offers = result.scalars().all()

    return APIResponse(
        success=True,
        data=[
            {
                "id": o.id,
                "provider_id": o.provider_id,
                "name": o.name,
                "offer_type": o.offer_type,
                "description": o.description,
                "subscription_price": o.subscription_price,
                "base_price": o.base_price,
                "hc_price": o.hc_price,
                "hp_price": o.hp_price,
                "base_price_weekend": o.base_price_weekend,
                "hc_price_weekend": o.hc_price_weekend,
                "hp_price_weekend": o.hp_price_weekend,
                "tempo_blue_hc": o.tempo_blue_hc,
                "tempo_blue_hp": o.tempo_blue_hp,
                "tempo_white_hc": o.tempo_white_hc,
                "tempo_white_hp": o.tempo_white_hp,
                "tempo_red_hc": o.tempo_red_hc,
                "tempo_red_hp": o.tempo_red_hp,
                "ejp_normal": o.ejp_normal,
                "ejp_peak": o.ejp_peak,
                "hc_price_winter": o.hc_price_winter,
                "hp_price_winter": o.hp_price_winter,
                "hc_price_summer": o.hc_price_summer,
                "hp_price_summer": o.hp_price_summer,
                "peak_day_price": o.peak_day_price,
                "hc_schedules": o.hc_schedules,
                "power_kva": o.power_kva,
                "price_updated_at": o.price_updated_at.isoformat() if o.price_updated_at else None,
                "valid_from": o.valid_from.isoformat() if o.valid_from else None,
                "valid_to": o.valid_to.isoformat() if o.valid_to else None,
                "is_active": o.is_active,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o in offers
        ],
    )


# Contribution endpoints
@router.post("/contribute", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def create_contribution(
    contribution_data: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Submit a new contribution for review"""
    logger.info(f"[CONTRIBUTION] New contribution from user: {current_user.email}")
    logger.info(f"[CONTRIBUTION] Data: {contribution_data}")

    # Validate required fields
    if not contribution_data.get("price_sheet_url"):
        return APIResponse(success=False, error=ErrorDetail(code="MISSING_FIELD", message="Le lien vers la fiche des prix est obligatoire"))

    if not contribution_data.get("power_kva"):
        return APIResponse(success=False, error=ErrorDetail(code="MISSING_FIELD", message="La puissance (kVA) est obligatoire"))

    # Create contribution
    contribution = OfferContribution(
        contributor_user_id=current_user.id,
        contribution_type=contribution_data.get("contribution_type", "NEW_OFFER"),
        status="pending",
        provider_name=contribution_data.get("provider_name"),
        provider_website=contribution_data.get("provider_website"),
        existing_provider_id=contribution_data.get("existing_provider_id"),
        existing_offer_id=contribution_data.get("existing_offer_id"),
        offer_name=contribution_data["offer_name"],
        offer_type=contribution_data["offer_type"],
        description=contribution_data.get("description"),
        pricing_data=contribution_data.get("pricing_data", {}),
        hc_schedules=contribution_data.get("hc_schedules"),
        power_kva=contribution_data.get("power_kva"),
        price_sheet_url=contribution_data["price_sheet_url"],
        screenshot_url=contribution_data.get("screenshot_url"),
    )

    db.add(contribution)
    await db.commit()
    await db.refresh(contribution)

    # Send email notification to all admins
    try:
        await send_contribution_notification(contribution, current_user, db)
    except Exception as e:
        logger.error(f"[CONTRIBUTION] Failed to send admin notifications: {str(e)}")
        # Don't fail the contribution if email fails

    return APIResponse(
        success=True,
        data={
            "id": contribution.id,
            "message": "Contribution soumise avec succès. Les administrateurs vont la vérifier.",
        },
    )


@router.get("/contributions", response_model=APIResponse)
async def list_my_contributions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> APIResponse:
    """List current user's contributions"""
    result = await db.execute(select(OfferContribution).where(OfferContribution.contributor_user_id == current_user.id))
    contributions = result.scalars().all()

    return APIResponse(
        success=True,
        data=[
            {
                "id": c.id,
                "contribution_type": c.contribution_type,
                "status": c.status,
                "offer_name": c.offer_name,
                "offer_type": c.offer_type,
                "created_at": c.created_at.isoformat(),
                "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
                "review_comment": c.review_comment,
            }
            for c in contributions
        ],
    )


# Admin endpoints
@router.get("/contributions/pending", response_model=APIResponse)
async def list_pending_contributions(current_user: User = Depends(require_permission('contributions')), db: AsyncSession = Depends(get_db)) -> APIResponse:
    """List all pending contributions (requires contributions permission)"""

    result = await db.execute(select(OfferContribution).where(OfferContribution.status == "pending"))
    contributions = result.scalars().all()

    data = []
    for c in contributions:
        # Get contributor info
        contributor_result = await db.execute(select(User).where(User.id == c.contributor_user_id))
        contributor = contributor_result.scalar_one_or_none()

        # Get existing provider info if exists
        existing_provider = None
        if c.existing_provider_id:
            provider_result = await db.execute(select(EnergyProvider).where(EnergyProvider.id == c.existing_provider_id))
            existing_provider = provider_result.scalar_one_or_none()

        # Get existing offer info if exists
        existing_offer = None
        if c.existing_offer_id:
            offer_result = await db.execute(select(EnergyOffer).where(EnergyOffer.id == c.existing_offer_id))
            existing_offer = offer_result.scalar_one_or_none()

        data.append(
            {
                "id": c.id,
                "contributor_email": contributor.email if contributor else "Unknown",
                "contribution_type": c.contribution_type,
                "status": c.status,
                "provider_name": c.provider_name,
                "provider_website": c.provider_website,
                "existing_provider_id": c.existing_provider_id,
                "existing_provider": {
                    "id": existing_provider.id,
                    "name": existing_provider.name,
                    "logo_url": existing_provider.logo_url,
                    "website": existing_provider.website,
                } if existing_provider else None,
                "existing_offer_id": c.existing_offer_id,
                "existing_offer": {
                    "id": existing_offer.id,
                    "name": existing_offer.name,
                    "offer_type": existing_offer.offer_type,
                    "description": existing_offer.description,
                    "subscription_price": existing_offer.subscription_price,
                    "base_price": existing_offer.base_price,
                    "hc_price": existing_offer.hc_price,
                    "hp_price": existing_offer.hp_price,
                    "tempo_blue_hc": existing_offer.tempo_blue_hc,
                    "tempo_blue_hp": existing_offer.tempo_blue_hp,
                    "tempo_white_hc": existing_offer.tempo_white_hc,
                    "tempo_white_hp": existing_offer.tempo_white_hp,
                    "tempo_red_hc": existing_offer.tempo_red_hc,
                    "tempo_red_hp": existing_offer.tempo_red_hp,
                    "ejp_normal": existing_offer.ejp_normal,
                    "ejp_peak": existing_offer.ejp_peak,
                    "hc_schedules": existing_offer.hc_schedules,
                    "power_kva": existing_offer.power_kva,
                    "valid_from": existing_offer.valid_from.isoformat() if existing_offer.valid_from else None,
                    "valid_to": existing_offer.valid_to.isoformat() if existing_offer.valid_to else None,
                } if existing_offer else None,
                "offer_name": c.offer_name,
                "offer_type": c.offer_type,
                "description": c.description,
                "pricing_data": c.pricing_data,
                "hc_schedules": c.hc_schedules,
                "power_kva": c.power_kva,
                "price_sheet_url": c.price_sheet_url,
                "screenshot_url": c.screenshot_url,
                "created_at": c.created_at.isoformat(),
            }
        )

    return APIResponse(success=True, data=data)


@router.post("/contributions/{contribution_id}/approve", response_model=APIResponse)
async def approve_contribution(
    contribution_id: str, current_user: User = Depends(require_permission('contributions')), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Approve a contribution and create/update provider/offer (requires contributions permission)"""

    result = await db.execute(select(OfferContribution).where(OfferContribution.id == contribution_id))
    contribution = result.scalar_one_or_none()

    if not contribution:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Contribution not found"))

    if contribution.status != "pending":
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_STATUS", message="Contribution already reviewed"))

    try:
        # Handle provider creation if needed
        provider_id = contribution.existing_provider_id

        if contribution.contribution_type == "NEW_PROVIDER" and contribution.provider_name:
            # Create new provider
            provider = EnergyProvider(name=contribution.provider_name, website=contribution.provider_website)
            db.add(provider)
            await db.flush()
            provider_id = provider.id

        if not provider_id:
            return APIResponse(success=False, error=ErrorDetail(code="INVALID_DATA", message="Provider ID required"))

        # Create or update offer
        pricing = contribution.pricing_data

        if contribution.contribution_type in ["NEW_OFFER", "NEW_PROVIDER"]:
            # Create new offer
            offer = EnergyOffer(
                provider_id=provider_id,
                name=contribution.offer_name,
                offer_type=contribution.offer_type,
                description=contribution.description,
                subscription_price=pricing.get("subscription_price", 0),
                base_price=pricing.get("base_price"),
                hc_price=pricing.get("hc_price"),
                hp_price=pricing.get("hp_price"),
                tempo_blue_hc=pricing.get("tempo_blue_hc"),
                tempo_blue_hp=pricing.get("tempo_blue_hp"),
                tempo_white_hc=pricing.get("tempo_white_hc"),
                tempo_white_hp=pricing.get("tempo_white_hp"),
                tempo_red_hc=pricing.get("tempo_red_hc"),
                tempo_red_hp=pricing.get("tempo_red_hp"),
                ejp_normal=pricing.get("ejp_normal"),
                ejp_peak=pricing.get("ejp_peak"),
                hc_schedules=contribution.hc_schedules,
            )
            db.add(offer)

        elif contribution.contribution_type == "UPDATE_OFFER" and contribution.existing_offer_id:
            # Update existing offer
            offer_result = await db.execute(select(EnergyOffer).where(EnergyOffer.id == contribution.existing_offer_id))
            offer = offer_result.scalar_one_or_none()

            if offer:
                offer.name = contribution.offer_name
                offer.offer_type = contribution.offer_type
                offer.description = contribution.description
                offer.subscription_price = pricing.get("subscription_price", 0)
                offer.base_price = pricing.get("base_price")
                offer.hc_price = pricing.get("hc_price")
                offer.hp_price = pricing.get("hp_price")
                offer.tempo_blue_hc = pricing.get("tempo_blue_hc")
                offer.tempo_blue_hp = pricing.get("tempo_blue_hp")
                offer.tempo_white_hc = pricing.get("tempo_white_hc")
                offer.tempo_white_hp = pricing.get("tempo_white_hp")
                offer.tempo_red_hc = pricing.get("tempo_red_hc")
                offer.tempo_red_hp = pricing.get("tempo_red_hp")
                offer.ejp_normal = pricing.get("ejp_normal")
                offer.ejp_peak = pricing.get("ejp_peak")
                offer.hc_schedules = contribution.hc_schedules
                offer.updated_at = datetime.now(UTC)

        # Mark contribution as approved
        contribution.status = "approved"
        contribution.reviewed_by = current_user.id
        contribution.reviewed_at = datetime.now(UTC)

        await db.commit()

        return APIResponse(success=True, data={"message": "Contribution approved successfully"})

    except Exception as e:
        await db.rollback()
        logger.error(f"[CONTRIBUTION APPROVAL ERROR] {str(e)}")
        import traceback

        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.post("/contributions/{contribution_id}/reject", response_model=APIResponse)
async def reject_contribution(
    contribution_id: str,
    body: dict = Body(default={}),
    current_user: User = Depends(require_permission('contributions')),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Reject a contribution (requires contributions permission)"""
    reason = body.get("reason")

    result = await db.execute(select(OfferContribution).where(OfferContribution.id == contribution_id))
    contribution = result.scalar_one_or_none()

    if not contribution:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Contribution not found"))

    if contribution.status != "pending":
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_STATUS", message="Contribution already reviewed"))

    # Get the contributor to send them an email
    contributor_result = await db.execute(select(User).where(User.id == contribution.contributor_user_id))
    contributor = contributor_result.scalar_one_or_none()

    contribution.status = "rejected"
    contribution.reviewed_by = current_user.id
    contribution.reviewed_at = datetime.now(UTC)
    contribution.review_comment = reason

    await db.commit()

    # Send rejection notification email to contributor
    if contributor and reason:
        try:
            await send_rejection_notification(contribution, contributor, reason)
        except Exception as e:
            logger.error(f"[CONTRIBUTION] Failed to send rejection notification: {str(e)}")
            # Don't fail the rejection if email fails

    return APIResponse(success=True, data={"message": "Contribution rejected"})


@router.post("/contributions/{contribution_id}/request-info", response_model=APIResponse)
async def request_contribution_info(
    contribution_id: str,
    body: dict = Body(...),
    current_user: User = Depends(require_permission('contributions')),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Request additional information from the contributor (requires contributions permission)"""
    message = body.get("message")
    if not message:
        return APIResponse(success=False, error=ErrorDetail(code="MISSING_FIELD", message="Le message est obligatoire"))

    result = await db.execute(select(OfferContribution).where(OfferContribution.id == contribution_id))
    contribution = result.scalar_one_or_none()

    if not contribution:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Contribution not found"))

    if contribution.status != "pending":
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_STATUS", message="Contribution already reviewed"))

    # Get the contributor
    contributor_result = await db.execute(select(User).where(User.id == contribution.contributor_user_id))
    contributor = contributor_result.scalar_one_or_none()

    if not contributor:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Contributor not found"))

    # Create the message record
    contribution_message = ContributionMessage(
        contribution_id=contribution_id,
        sender_user_id=current_user.id,
        message_type="info_request",
        content=message,
        is_from_admin=True,
    )
    db.add(contribution_message)
    await db.commit()

    # Send email to contributor
    try:
        await send_info_request_notification(contribution, contributor, message)
    except Exception as e:
        logger.error(f"[CONTRIBUTION] Failed to send info request notification: {str(e)}")
        # Don't fail the request if email fails

    return APIResponse(success=True, data={"message": "Information request sent successfully"})


@router.get("/contributions/{contribution_id}/messages", response_model=APIResponse)
async def get_contribution_messages(
    contribution_id: str,
    current_user: User = Depends(require_permission('contributions')),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get all messages for a contribution (requires contributions permission)"""

    # Check contribution exists
    result = await db.execute(select(OfferContribution).where(OfferContribution.id == contribution_id))
    contribution = result.scalar_one_or_none()

    if not contribution:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Contribution not found"))

    # Get all messages
    messages_result = await db.execute(
        select(ContributionMessage)
        .where(ContributionMessage.contribution_id == contribution_id)
        .order_by(ContributionMessage.created_at.asc())
    )
    messages = messages_result.scalars().all()

    # Get sender info for each message
    data = []
    for msg in messages:
        sender_result = await db.execute(select(User).where(User.id == msg.sender_user_id))
        sender = sender_result.scalar_one_or_none()
        data.append({
            "id": msg.id,
            "message_type": msg.message_type,
            "content": msg.content,
            "is_from_admin": msg.is_from_admin,
            "sender_email": sender.email if sender else "Unknown",
            "created_at": msg.created_at.isoformat(),
        })

    return APIResponse(success=True, data=data)


# Admin endpoints - Manage offers
@router.put("/offers/{offer_id}", response_model=APIResponse)
async def update_offer(
    offer_id: str,
    offer_data: dict,
    current_user: User = Depends(require_action('offers', 'edit')),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Update an existing energy offer (requires offers.edit permission)"""

    result = await db.execute(select(EnergyOffer).where(EnergyOffer.id == offer_id))
    offer = result.scalar_one_or_none()

    if not offer:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Offer not found"))

    try:
        # Update fields
        if "name" in offer_data:
            offer.name = offer_data["name"]
        if "offer_type" in offer_data:
            offer.offer_type = offer_data["offer_type"]
        if "description" in offer_data:
            offer.description = offer_data["description"]
        if "subscription_price" in offer_data:
            offer.subscription_price = offer_data["subscription_price"]
        if "base_price" in offer_data:
            offer.base_price = offer_data["base_price"]
        if "hc_price" in offer_data:
            offer.hc_price = offer_data["hc_price"]
        if "hp_price" in offer_data:
            offer.hp_price = offer_data["hp_price"]
        if "tempo_blue_hc" in offer_data:
            offer.tempo_blue_hc = offer_data["tempo_blue_hc"]
        if "tempo_blue_hp" in offer_data:
            offer.tempo_blue_hp = offer_data["tempo_blue_hp"]
        if "tempo_white_hc" in offer_data:
            offer.tempo_white_hc = offer_data["tempo_white_hc"]
        if "tempo_white_hp" in offer_data:
            offer.tempo_white_hp = offer_data["tempo_white_hp"]
        if "tempo_red_hc" in offer_data:
            offer.tempo_red_hc = offer_data["tempo_red_hc"]
        if "tempo_red_hp" in offer_data:
            offer.tempo_red_hp = offer_data["tempo_red_hp"]
        if "ejp_normal" in offer_data:
            offer.ejp_normal = offer_data["ejp_normal"]
        if "ejp_peak" in offer_data:
            offer.ejp_peak = offer_data["ejp_peak"]
        if "is_active" in offer_data:
            offer.is_active = offer_data["is_active"]

        offer.updated_at = datetime.now(UTC)
        offer.price_updated_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(offer)

        return APIResponse(success=True, data={"message": "Offer updated successfully", "offer_id": offer.id})

    except Exception as e:
        await db.rollback()
        logger.error(f"[OFFER UPDATE ERROR] {str(e)}")
        import traceback

        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.delete("/offers/{offer_id}", response_model=APIResponse)
async def delete_offer(
    offer_id: str, current_user: User = Depends(require_action('offers', 'delete')), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Delete an energy offer (requires offers.delete permission)"""

    result = await db.execute(select(EnergyOffer).where(EnergyOffer.id == offer_id))
    offer = result.scalar_one_or_none()

    if not offer:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Offer not found"))

    try:
        await db.delete(offer)
        await db.commit()

        return APIResponse(success=True, data={"message": "Offer deleted successfully"})

    except Exception as e:
        await db.rollback()
        logger.error(f"[OFFER DELETE ERROR] {str(e)}")
        import traceback

        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.put("/providers/{provider_id}", response_model=APIResponse)
async def update_provider(
    provider_id: str,
    update_data: dict,
    current_user: User = Depends(require_action('offers', 'edit')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Update an energy provider (requires offers.edit permission)"""

    result = await db.execute(select(EnergyProvider).where(EnergyProvider.id == provider_id))
    provider = result.scalar_one_or_none()

    if not provider:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Provider not found"))

    try:
        # Update allowed fields
        if "name" in update_data:
            provider.name = update_data["name"]
        if "website" in update_data:
            provider.website = update_data["website"]
        if "logo_url" in update_data:
            provider.logo_url = update_data["logo_url"]
        if "scraper_urls" in update_data:
            provider.scraper_urls = update_data["scraper_urls"]

        provider.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(provider)

        return APIResponse(
            success=True,
            data={
                "id": str(provider.id),
                "name": provider.name,
                "website": provider.website,
                "logo_url": provider.logo_url,
                "scraper_urls": provider.scraper_urls,
            }
        )

    except Exception as e:
        await db.rollback()
        logger.error(f"[PROVIDER UPDATE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="DATABASE_ERROR", message="Failed to update provider"))


@router.delete("/providers/{provider_id}", response_model=APIResponse)
async def delete_provider(
    provider_id: str, current_user: User = Depends(require_action('offers', 'delete')), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Delete an energy provider and all its offers (requires offers.delete permission)"""

    result = await db.execute(select(EnergyProvider).where(EnergyProvider.id == provider_id))
    provider = result.scalar_one_or_none()

    if not provider:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Provider not found"))

    try:
        # Delete all offers for this provider first
        offers_result = await db.execute(select(EnergyOffer).where(EnergyOffer.provider_id == provider_id))
        offers = offers_result.scalars().all()

        for offer in offers:
            await db.delete(offer)

        # Then delete the provider
        await db.delete(provider)
        await db.commit()

        return APIResponse(
            success=True,
            data={
                "message": "Provider and all its offers deleted successfully",
                "deleted_offers_count": len(offers)
            }
        )

    except Exception as e:
        await db.rollback()
        logger.error(f"[PROVIDER DELETE ERROR] {str(e)}")
        import traceback

        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


async def send_contribution_notification(contribution: OfferContribution, contributor: User, db: AsyncSession):
    """Send email notification to all admins about a new contribution"""
    if not settings.ADMIN_EMAILS:
        logger.info("[CONTRIBUTION] No admin emails configured")
        return

    admin_emails = [email.strip() for email in settings.ADMIN_EMAILS.split(",")]

    approve_url = f"{settings.FRONTEND_URL}/admin/contributions?id={contribution.id}"

    subject = f"Nouvelle contribution - {contribution.offer_name}"

    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">MyElectricalData</h1>
    </div>

    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Nouvelle contribution communautaire</h2>

        <p>Un utilisateur a soumis une nouvelle contribution :</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Contributeur :</strong> {contributor.email}</p>
            <p><strong>Type :</strong> {contribution.contribution_type}</p>
            <p><strong>Offre :</strong> {contribution.offer_name}</p>
            <p><strong>Type d'offre :</strong> {contribution.offer_type}</p>
            {f'<p><strong>Nouveau fournisseur :</strong> {contribution.provider_name}</p>' if contribution.provider_name else ''}
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{approve_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Gérer cette contribution
            </a>
        </div>

        <p style="color: #666; font-size: 14px;">Connectez-vous à votre compte administrateur pour approuver ou rejeter cette contribution.</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; text-align: center;">
            MyElectricalData - Base de données communautaire
        </p>
    </div>
</body>
</html>
    """

    text_content = f"""
Nouvelle contribution communautaire - MyElectricalData

Un utilisateur a soumis une nouvelle contribution :

Contributeur : {contributor.email}
Type : {contribution.contribution_type}
Offre : {contribution.offer_name}
Type d'offre : {contribution.offer_type}
{'Nouveau fournisseur : ' + contribution.provider_name if contribution.provider_name else ''}

Gérer cette contribution : {approve_url}

---
MyElectricalData
    """

    # Send to all admins
    for admin_email in admin_emails:
        try:
            await email_service.send_email(admin_email, subject, html_content, text_content)
            logger.info(f"[CONTRIBUTION] Notification sent to admin: {admin_email}")
        except Exception as e:
            logger.error(f"[CONTRIBUTION] Failed to send email to {admin_email}: {str(e)}")


async def send_rejection_notification(contribution: OfferContribution, contributor: User, reason: str):
    """Send email notification to contributor about rejection"""
    contributions_url = f"{settings.FRONTEND_URL}/contribute"

    subject = f"Contribution rejetée - {contribution.offer_name}"

    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">MyElectricalData</h1>
    </div>

    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Votre contribution a été examinée</h2>

        <p>Bonjour,</p>

        <p>Nous avons examiné votre contribution pour l'offre <strong>{contribution.offer_name}</strong> et malheureusement, nous n'avons pas pu l'approuver.</p>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 0 5px 5px 0;">
            <p style="margin: 0; font-weight: bold; color: #856404;">Raison du rejet :</p>
            <p style="margin: 10px 0 0 0; color: #856404;">{reason}</p>
        </div>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Offre concernée :</strong> {contribution.offer_name}</p>
            <p><strong>Type :</strong> {contribution.offer_type}</p>
            <p><strong>Date de soumission :</strong> {contribution.created_at.strftime('%d/%m/%Y à %H:%M')}</p>
        </div>

        <p>Vous pouvez soumettre une nouvelle contribution avec les informations corrigées :</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{contributions_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Soumettre une nouvelle contribution
            </a>
        </div>

        <p style="color: #666; font-size: 14px;">Merci pour votre participation à la communauté MyElectricalData !</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; text-align: center;">
            MyElectricalData - Base de données communautaire des offres d'électricité
        </p>
    </div>
</body>
</html>
    """

    text_content = f"""
Votre contribution a été examinée - MyElectricalData

Bonjour,

Nous avons examiné votre contribution pour l'offre "{contribution.offer_name}" et malheureusement, nous n'avons pas pu l'approuver.

Raison du rejet :
{reason}

Offre concernée : {contribution.offer_name}
Type : {contribution.offer_type}
Date de soumission : {contribution.created_at.strftime('%d/%m/%Y à %H:%M')}

Vous pouvez soumettre une nouvelle contribution avec les informations corrigées :
{contributions_url}

Merci pour votre participation à la communauté MyElectricalData !

---
MyElectricalData - Base de données communautaire des offres d'électricité
    """

    try:
        await email_service.send_email(contributor.email, subject, html_content, text_content)
        logger.info(f"[CONTRIBUTION] Rejection notification sent to contributor: {contributor.email}")
    except Exception as e:
        logger.error(f"[CONTRIBUTION] Failed to send rejection email to {contributor.email}: {str(e)}")
        raise


async def send_info_request_notification(contribution: OfferContribution, contributor: User, message: str):
    """Send email notification to contributor requesting more information"""
    contributions_url = f"{settings.FRONTEND_URL}/contribute"

    subject = f"Demande d'information - {contribution.offer_name}"

    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">MyElectricalData</h1>
    </div>

    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Demande d'information sur votre contribution</h2>

        <p>Bonjour,</p>

        <p>Nous examinons actuellement votre contribution pour l'offre <strong>{contribution.offer_name}</strong> et nous avons besoin d'informations supplémentaires.</p>

        <div style="background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 0 5px 5px 0;">
            <p style="margin: 0; font-weight: bold; color: #1565C0;">Message de l'administrateur :</p>
            <p style="margin: 10px 0 0 0; color: #1565C0;">{message}</p>
        </div>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Offre concernée :</strong> {contribution.offer_name}</p>
            <p><strong>Type :</strong> {contribution.offer_type}</p>
            <p><strong>Lien fourni :</strong> <a href="{contribution.price_sheet_url}" style="color: #667eea;">{contribution.price_sheet_url}</a></p>
            <p><strong>Date de soumission :</strong> {contribution.created_at.strftime('%d/%m/%Y à %H:%M')}</p>
        </div>

        <p>Vous pouvez répondre en soumettant une nouvelle contribution avec les informations corrigées :</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{contributions_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Mettre à jour ma contribution
            </a>
        </div>

        <p style="color: #666; font-size: 14px;">Merci pour votre participation à la communauté MyElectricalData !</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; text-align: center;">
            MyElectricalData - Base de données communautaire des offres d'électricité
        </p>
    </div>
</body>
</html>
    """

    text_content = f"""
Demande d'information sur votre contribution - MyElectricalData

Bonjour,

Nous examinons actuellement votre contribution pour l'offre "{contribution.offer_name}" et nous avons besoin d'informations supplémentaires.

Message de l'administrateur :
{message}

Offre concernée : {contribution.offer_name}
Type : {contribution.offer_type}
Lien fourni : {contribution.price_sheet_url}
Date de soumission : {contribution.created_at.strftime('%d/%m/%Y à %H:%M')}

Vous pouvez mettre à jour votre contribution ici :
{contributions_url}

Merci pour votre participation à la communauté MyElectricalData !

---
MyElectricalData - Base de données communautaire des offres d'électricité
    """

    try:
        await email_service.send_email(contributor.email, subject, html_content, text_content)
        logger.info(f"[CONTRIBUTION] Info request notification sent to contributor: {contributor.email}")
    except Exception as e:
        logger.error(f"[CONTRIBUTION] Failed to send info request email to {contributor.email}: {str(e)}")
        raise
