"""
Default roles and permissions seed data.

This module provides functions to initialize default roles and permissions
in the database when the application starts for the first time.
It also ensures ADMIN_EMAILS users always have the admin role.
"""

import logging
from datetime import datetime, timezone
from typing import cast
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .role import Role, Permission
from .energy_provider import EnergyProvider, EnergyOffer

logger = logging.getLogger(__name__)


# Default permissions grouped by resource
DEFAULT_PERMISSIONS = [
    # Admin Dashboard
    {
        "name": "admin_dashboard",
        "display_name": "Tableau de bord admin",
        "description": "Accès au tableau de bord d'administration",
        "resource": "admin_dashboard",
    },
    # Users management
    {
        "name": "users",
        "display_name": "Gestion des utilisateurs",
        "description": "Voir la liste des utilisateurs",
        "resource": "users",
    },
    {
        "name": "users.edit",
        "display_name": "Modifier les utilisateurs",
        "description": "Créer, modifier et gérer les utilisateurs",
        "resource": "users",
    },
    {
        "name": "users.delete",
        "display_name": "Supprimer les utilisateurs",
        "description": "Supprimer des utilisateurs",
        "resource": "users",
    },
    # Logs
    {
        "name": "logs",
        "display_name": "Voir les logs",
        "description": "Consulter les logs de l'application",
        "resource": "logs",
    },
    {
        "name": "logs.delete",
        "display_name": "Supprimer les logs",
        "description": "Supprimer les logs de l'application",
        "resource": "logs",
    },
    # Contributions
    {
        "name": "contributions",
        "display_name": "Gestion des contributions",
        "description": "Modérer les contributions des utilisateurs",
        "resource": "contributions",
    },
    # Energy Offers
    {
        "name": "offers",
        "display_name": "Gestion des offres",
        "description": "Gérer les offres tarifaires",
        "resource": "offers",
    },
    {
        "name": "offers.delete",
        "display_name": "Supprimer les offres",
        "description": "Supprimer des offres tarifaires",
        "resource": "offers",
    },
    # Roles
    {
        "name": "roles",
        "display_name": "Gestion des rôles",
        "description": "Gérer les rôles et permissions",
        "resource": "roles",
    },
]


# Default roles with their permissions
DEFAULT_ROLES = [
    {
        "name": "admin",
        "display_name": "Administrateur",
        "description": "Accès complet à toutes les fonctionnalités",
        "is_system": True,
        "permissions": [
            "admin_dashboard",
            "users",
            "users.edit",
            "users.delete",
            "logs",
            "logs.delete",
            "contributions",
            "offers",
            "offers.delete",
            "roles",
        ],
    },
    {
        "name": "moderator",
        "display_name": "Modérateur",
        "description": "Modération des contributions et gestion limitée",
        "is_system": True,
        "permissions": [
            "admin_dashboard",
            "users",
            "contributions",
            "offers",
            "logs",
        ],
    },
    {
        "name": "visitor",
        "display_name": "Visiteur",
        "description": "Accès en lecture seule aux données publiques",
        "is_system": True,
        "permissions": [],
    },
]


async def init_default_roles_and_permissions(db: AsyncSession) -> None:
    """
    Initialize default roles and permissions in the database.

    This function is truly idempotent - it creates missing permissions and roles
    without modifying existing ones. Each permission and role is checked individually.
    """
    try:
        logger.info("[SEED] Checking default permissions and roles...")

        # Get existing permissions by name
        result = await db.execute(select(Permission))
        existing_permissions = {p.name: p for p in result.scalars().all()}

        # Create missing permissions
        permission_objects: dict[str, Permission] = dict(existing_permissions)
        permissions_created = 0

        for perm_data in DEFAULT_PERMISSIONS:
            if perm_data["name"] not in existing_permissions:
                permission = Permission(
                    name=perm_data["name"],
                    display_name=perm_data["display_name"],
                    description=perm_data["description"],
                    resource=perm_data["resource"],
                )
                db.add(permission)
                permission_objects[perm_data["name"]] = permission
                permissions_created += 1
                logger.info(f"[SEED] Created permission: {perm_data['name']}")

        if permissions_created > 0:
            await db.flush()
            logger.info(f"[SEED] Created {permissions_created} missing permission(s)")
        else:
            logger.info("[SEED] All permissions already exist")

        # Get existing roles by name
        result = await db.execute(select(Role))
        existing_roles = {r.name: r for r in result.scalars().all()}

        # Create missing roles with their permissions
        roles_created = 0

        for role_data in DEFAULT_ROLES:
            if role_data["name"] not in existing_roles:
                role = Role(
                    name=role_data["name"],
                    display_name=role_data["display_name"],
                    description=role_data["description"],
                    is_system=role_data["is_system"],
                )

                # Assign permissions to role
                permissions_list = cast(list[str], role_data["permissions"])
                for perm_name in permissions_list:
                    if perm_name in permission_objects:
                        role.permissions.append(permission_objects[perm_name])

                db.add(role)
                roles_created += 1
                logger.info(f"[SEED] Created role: {role_data['name']} with {len(permissions_list)} permissions")

        if roles_created > 0:
            await db.commit()
            logger.info(f"[SEED] Created {roles_created} missing role(s)")
        elif permissions_created > 0:
            await db.commit()
            logger.info("[SEED] All roles already exist, committed new permissions")
        else:
            logger.info("[SEED] All roles and permissions already exist, nothing to do")

    except Exception as e:
        logger.error(f"[SEED] Error initializing roles and permissions: {e}")
        await db.rollback()
        raise


# ============================================================================
# NOTE: Les types d'offres (PricingType) sont maintenant gérés via OfferRegistry
# dans services/offers/registry.py (auto-discovery des calculateurs Python)
# La fonction init_default_pricing_types a été supprimée car redondante.
# ============================================================================


# ============================================================================
# DEFAULT ENERGY PROVIDERS & OFFERS (EDF Tarif Bleu - Août 2025)
# ============================================================================

# Date de mise à jour des tarifs EDF (1er août 2025)
EDF_PRICE_UPDATE_DATE = datetime(2025, 8, 1, 0, 0, 0, tzinfo=timezone.utc)

# Fournisseur EDF
DEFAULT_PROVIDER = {
    "name": "EDF",
    "website": "https://www.edf.fr",
    "logo_url": "https://logo.clearbit.com/edf.fr",
    "is_active": True,
}

# Offres BASE (Option Base TTC) - kVA, Abonnement €/mois, Prix kWh
DEFAULT_BASE_OFFERS = [
    (3, 11.73, 0.1952),
    (6, 15.47, 0.1952),
    (9, 19.39, 0.1952),
    (12, 23.32, 0.1952),
    (15, 27.06, 0.1952),
    (18, 30.76, 0.1952),
    (24, 38.79, 0.1952),
    (30, 46.44, 0.1952),
    (36, 54.29, 0.1952),
]

# Offres HC/HP (Option Heures Creuses TTC) - kVA, Abonnement €/mois, HP €/kWh, HC €/kWh
DEFAULT_HCHP_OFFERS = [
    (6, 15.74, 0.2081, 0.1635),
    (9, 19.81, 0.2081, 0.1635),
    (12, 23.76, 0.2081, 0.1635),
    (15, 27.49, 0.2081, 0.1635),
    (18, 31.34, 0.2081, 0.1635),
    (24, 39.47, 0.2081, 0.1635),
    (30, 47.02, 0.2081, 0.1635),
    (36, 54.61, 0.2081, 0.1635),
]

# Offres TEMPO (Option Tempo TTC) - kVA, Abo, Bleu HC/HP, Blanc HC/HP, Rouge HC/HP
DEFAULT_TEMPO_OFFERS = [
    (6, 15.50, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
    (9, 19.49, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
    (12, 23.38, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
    (15, 27.01, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
    (18, 30.79, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
    (30, 46.31, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
    (36, 54.43, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
]


async def init_default_energy_offers(db: AsyncSession) -> None:
    """
    Initialize default energy provider (EDF) and offers.

    This function is idempotent - it only creates the provider and offers
    if they don't already exist. Existing offers are not modified.
    Les types d'offres sont validés via OfferRegistry (auto-discovery).
    """
    try:
        logger.info("[SEED] Checking default energy provider and offers...")

        # Check if EDF provider already exists
        result = await db.execute(
            select(EnergyProvider).where(EnergyProvider.name == DEFAULT_PROVIDER["name"])
        )
        provider = result.scalar_one_or_none()

        if provider:
            logger.info("[SEED] EDF provider already exists, checking offers...")
        else:
            # Create EDF provider
            provider = EnergyProvider(
                name=DEFAULT_PROVIDER["name"],
                website=DEFAULT_PROVIDER["website"],
                logo_url=DEFAULT_PROVIDER["logo_url"],
                is_active=DEFAULT_PROVIDER["is_active"],
            )
            db.add(provider)
            await db.flush()
            logger.info(f"[SEED] Created EDF provider: {provider.id}")

        # Check existing offers for this provider
        result = await db.execute(
            select(EnergyOffer).where(EnergyOffer.provider_id == provider.id)
        )
        existing_offers = {offer.name for offer in result.scalars().all()}

        offers_created = 0

        # Create BASE offers
        for kva, subscription, base_price in DEFAULT_BASE_OFFERS:
            offer_name = f"Tarif Bleu - BASE {kva} kVA"
            if offer_name not in existing_offers:
                offer = EnergyOffer(
                    provider_id=provider.id,
                    name=offer_name,
                    offer_type="BASE",
                    subscription_price=subscription,
                    base_price=base_price,
                    power_kva=kva,
                    price_updated_at=EDF_PRICE_UPDATE_DATE,
                )
                db.add(offer)
                offers_created += 1
                logger.debug(f"[SEED] Created offer: {offer_name}")

        # Create HC/HP offers
        for kva, subscription, hp_price, hc_price in DEFAULT_HCHP_OFFERS:
            offer_name = f"Tarif Bleu - HC/HP {kva} kVA"
            if offer_name not in existing_offers:
                offer = EnergyOffer(
                    provider_id=provider.id,
                    name=offer_name,
                    offer_type="HC_HP",
                    subscription_price=subscription,
                    hp_price=hp_price,
                    hc_price=hc_price,
                    power_kva=kva,
                    price_updated_at=EDF_PRICE_UPDATE_DATE,
                )
                db.add(offer)
                offers_created += 1
                logger.debug(f"[SEED] Created offer: {offer_name}")

        # Create TEMPO offers
        for kva, subscription, blue_hc, blue_hp, white_hc, white_hp, red_hc, red_hp in DEFAULT_TEMPO_OFFERS:
            offer_name = f"Tarif Bleu - TEMPO {kva} kVA"
            if offer_name not in existing_offers:
                offer = EnergyOffer(
                    provider_id=provider.id,
                    name=offer_name,
                    offer_type="TEMPO",
                    subscription_price=subscription,
                    tempo_blue_hc=blue_hc,
                    tempo_blue_hp=blue_hp,
                    tempo_white_hc=white_hc,
                    tempo_white_hp=white_hp,
                    tempo_red_hc=red_hc,
                    tempo_red_hp=red_hp,
                    power_kva=kva,
                    price_updated_at=EDF_PRICE_UPDATE_DATE,
                )
                db.add(offer)
                offers_created += 1
                logger.debug(f"[SEED] Created offer: {offer_name}")

        if offers_created > 0:
            await db.commit()
            logger.info(f"[SEED] Created {offers_created} EDF offer(s)")
        else:
            logger.info("[SEED] All EDF offers already exist, nothing to do")

    except Exception as e:
        logger.error(f"[SEED] Error initializing energy offers: {e}")
        await db.rollback()
        raise


async def sync_admin_users(db: AsyncSession) -> None:
    """
    Ensure all users in ADMIN_EMAILS have the admin role.

    This function runs at every startup to guarantee that configured
    admin emails always have admin privileges, even if their role
    was accidentally changed.
    """
    from ..config import settings
    from .user import User

    if not settings.ADMIN_EMAILS:
        logger.info("[SEED] No ADMIN_EMAILS configured, skipping admin sync")
        return

    try:
        # Get admin role
        result = await db.execute(select(Role).where(Role.name == "admin"))
        admin_role = result.scalar_one_or_none()

        if not admin_role:
            logger.warning("[SEED] Admin role not found, cannot sync admin users")
            return

        # Parse admin emails
        admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]

        if not admin_emails:
            return

        logger.info(f"[SEED] Syncing admin role for {len(admin_emails)} configured admin(s)...")

        updated_count = 0
        for email in admin_emails:
            # Find user by email (case-insensitive)
            result = await db.execute(
                select(User).where(User.email.ilike(email))
            )
            user = result.scalar_one_or_none()

            if not user:
                logger.debug(f"[SEED] Admin user not found (not yet registered): {email}")
                continue

            # Check if user needs update
            needs_update = False
            if user.role_id != admin_role.id:  # type: ignore[attr-defined]
                user.role_id = admin_role.id  # type: ignore[attr-defined,assignment]
                needs_update = True
            if not user.is_admin:  # type: ignore[attr-defined]
                user.is_admin = True  # type: ignore[attr-defined,assignment]
                needs_update = True

            if needs_update:
                updated_count += 1
                logger.info(f"[SEED] Admin role assigned to: {user.email}")  # type: ignore[attr-defined]

        if updated_count > 0:
            await db.commit()
            logger.info(f"[SEED] Admin sync complete: {updated_count} user(s) updated")
        else:
            logger.info("[SEED] Admin sync complete: all admin users already have correct role")

    except Exception as e:
        logger.error(f"[SEED] Error syncing admin users: {e}")
        await db.rollback()
        raise
