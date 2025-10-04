from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, UTC
from ..models import User, EnergyProvider, EnergyOffer, OfferContribution
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..middleware import get_current_user
from ..services.email import email_service
from ..config import settings

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
            }
            for p in providers
        ],
    )


@router.get("/offers", response_model=APIResponse)
async def list_offers(provider_id: str | None = None, db: AsyncSession = Depends(get_db)) -> APIResponse:
    """List all active energy offers, optionally filtered by provider"""
    query = select(EnergyOffer).where(EnergyOffer.is_active == True)

    if provider_id:
        query = query.where(EnergyOffer.provider_id == provider_id)

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
                "tempo_blue_hc": o.tempo_blue_hc,
                "tempo_blue_hp": o.tempo_blue_hp,
                "tempo_white_hc": o.tempo_white_hc,
                "tempo_white_hp": o.tempo_white_hp,
                "tempo_red_hc": o.tempo_red_hc,
                "tempo_red_hp": o.tempo_red_hp,
                "ejp_normal": o.ejp_normal,
                "ejp_peak": o.ejp_peak,
                "hc_schedules": o.hc_schedules,
                "price_updated_at": o.price_updated_at.isoformat() if o.price_updated_at else None,
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
    print(f"[CONTRIBUTION] New contribution from user: {current_user.email}")
    print(f"[CONTRIBUTION] Data: {contribution_data}")

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
    )

    db.add(contribution)
    await db.commit()
    await db.refresh(contribution)

    # Send email notification to all admins
    try:
        await send_contribution_notification(contribution, current_user, db)
    except Exception as e:
        print(f"[CONTRIBUTION] Failed to send admin notifications: {str(e)}")
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
async def list_pending_contributions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> APIResponse:
    """List all pending contributions (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(success=False, error=ErrorDetail(code="FORBIDDEN", message="Admin access required"))

    result = await db.execute(select(OfferContribution).where(OfferContribution.status == "pending"))
    contributions = result.scalars().all()

    data = []
    for c in contributions:
        # Get contributor info
        contributor_result = await db.execute(select(User).where(User.id == c.contributor_user_id))
        contributor = contributor_result.scalar_one_or_none()

        data.append(
            {
                "id": c.id,
                "contributor_email": contributor.email if contributor else "Unknown",
                "contribution_type": c.contribution_type,
                "status": c.status,
                "provider_name": c.provider_name,
                "existing_provider_id": c.existing_provider_id,
                "offer_name": c.offer_name,
                "offer_type": c.offer_type,
                "description": c.description,
                "pricing_data": c.pricing_data,
                "hc_schedules": c.hc_schedules,
                "created_at": c.created_at.isoformat(),
            }
        )

    return APIResponse(success=True, data=data)


@router.post("/contributions/{contribution_id}/approve", response_model=APIResponse)
async def approve_contribution(
    contribution_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Approve a contribution and create/update provider/offer (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(success=False, error=ErrorDetail(code="FORBIDDEN", message="Admin access required"))

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
        print(f"[CONTRIBUTION APPROVAL ERROR] {str(e)}")
        import traceback

        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.post("/contributions/{contribution_id}/reject", response_model=APIResponse)
async def reject_contribution(
    contribution_id: str,
    reason: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Reject a contribution (Admin only)"""
    if not current_user.is_admin:
        return APIResponse(success=False, error=ErrorDetail(code="FORBIDDEN", message="Admin access required"))

    result = await db.execute(select(OfferContribution).where(OfferContribution.id == contribution_id))
    contribution = result.scalar_one_or_none()

    if not contribution:
        return APIResponse(success=False, error=ErrorDetail(code="NOT_FOUND", message="Contribution not found"))

    if contribution.status != "pending":
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_STATUS", message="Contribution already reviewed"))

    contribution.status = "rejected"
    contribution.reviewed_by = current_user.id
    contribution.reviewed_at = datetime.now(UTC)
    contribution.review_comment = reason

    await db.commit()

    return APIResponse(success=True, data={"message": "Contribution rejected"})


async def send_contribution_notification(contribution: OfferContribution, contributor: User, db: AsyncSession):
    """Send email notification to all admins about a new contribution"""
    if not settings.ADMIN_EMAILS:
        print("[CONTRIBUTION] No admin emails configured")
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
            print(f"[CONTRIBUTION] Notification sent to admin: {admin_email}")
        except Exception as e:
            print(f"[CONTRIBUTION] Failed to send email to {admin_email}: {str(e)}")
