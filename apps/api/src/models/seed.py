"""
Default roles and permissions seed data.

This module provides functions to initialize default roles and permissions
in the database when the application starts for the first time.
It also ensures ADMIN_EMAILS users always have the admin role.
"""

import logging
from typing import cast
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .role import Role, Permission
from .energy_provider import PricingType, EnergyProvider, EnergyOffer

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
# DEFAULT PRICING TYPES (Types d'offres tarifaires)
# ============================================================================

# Types d'offres supportés avec leurs champs requis/optionnels
DEFAULT_PRICING_TYPES = [
    {
        "code": "BASE",
        "name": "Base",
        "description": "Tarif unique, prix du kWh identique à toute heure",
        "required_price_fields": ["base_price"],
        "optional_price_fields": ["base_price_weekend"],
        "icon": "zap",
        "color": "#3B82F6",  # blue
        "display_order": 1,
    },
    {
        "code": "HC_HP",
        "name": "Heures Creuses / Heures Pleines",
        "description": "Deux tarifs selon l'heure : Heures Creuses (nuit) moins chères, Heures Pleines (jour) plus chères",
        "required_price_fields": ["hc_price", "hp_price"],
        "optional_price_fields": ["hc_schedules", "hc_price_weekend", "hp_price_weekend"],
        "icon": "clock",
        "color": "#10B981",  # green
        "display_order": 2,
    },
    {
        "code": "TEMPO",
        "name": "Tempo",
        "description": "6 tarifs selon le jour (Bleu, Blanc, Rouge) et l'heure (HC/HP). 300 jours Bleus, 43 Blancs, 22 Rouges par an",
        "required_price_fields": [
            "tempo_blue_hc", "tempo_blue_hp",
            "tempo_white_hc", "tempo_white_hp",
            "tempo_red_hc", "tempo_red_hp",
        ],
        "optional_price_fields": ["hc_schedules"],
        "icon": "palette",
        "color": "#8B5CF6",  # purple
        "display_order": 3,
    },
    {
        "code": "EJP",
        "name": "EJP (Effacement Jour de Pointe)",
        "description": "2 tarifs : Normal (342 jours) et Pointe Mobile (22 jours, très cher). Offre fermée aux nouveaux clients",
        "required_price_fields": ["ejp_normal", "ejp_peak"],
        "optional_price_fields": [],
        "icon": "alert-triangle",
        "color": "#F59E0B",  # amber
        "display_order": 4,
    },
    {
        "code": "HC_WEEKEND",
        "name": "Heures Creuses Week-end",
        "description": "Variante HC/HP avec tarifs différenciés le week-end",
        "required_price_fields": ["hc_price", "hp_price", "hc_price_weekend", "hp_price_weekend"],
        "optional_price_fields": ["hc_schedules"],
        "icon": "calendar",
        "color": "#EC4899",  # pink
        "display_order": 5,
    },
    {
        "code": "SEASONAL",
        "name": "Saisonnier",
        "description": "Tarifs différenciés été/hiver, avec ou sans jours de pointe",
        "required_price_fields": ["hc_price_winter", "hp_price_winter", "hc_price_summer", "hp_price_summer"],
        "optional_price_fields": ["peak_day_price", "hc_schedules"],
        "icon": "sun",
        "color": "#06B6D4",  # cyan
        "display_order": 6,
    },
]


async def init_default_pricing_types(db: AsyncSession) -> None:
    """
    Initialize default pricing types.

    This function is idempotent - it only creates pricing types
    if they don't already exist. Existing types are not modified.
    """
    try:
        logger.info("[SEED] Checking default pricing types...")

        # Get existing pricing types by code
        result = await db.execute(select(PricingType))
        existing_types = {pt.code: pt for pt in result.scalars().all()}

        types_created = 0
        pricing_type_map: dict[str, PricingType] = dict(existing_types)

        for pt_data in DEFAULT_PRICING_TYPES:
            if pt_data["code"] not in existing_types:
                pricing_type = PricingType(
                    code=pt_data["code"],
                    name=pt_data["name"],
                    description=pt_data["description"],
                    required_price_fields=pt_data["required_price_fields"],
                    optional_price_fields=pt_data.get("optional_price_fields"),
                    icon=pt_data.get("icon"),
                    color=pt_data.get("color"),
                    display_order=pt_data.get("display_order", 0),
                )
                db.add(pricing_type)
                pricing_type_map[pt_data["code"]] = pricing_type
                types_created += 1
                logger.info(f"[SEED] Created pricing type: {pt_data['code']}")

        if types_created > 0:
            await db.commit()
            logger.info(f"[SEED] Created {types_created} pricing type(s)")
        else:
            logger.info("[SEED] All pricing types already exist")

        return pricing_type_map

    except Exception as e:
        logger.error(f"[SEED] Error initializing pricing types: {e}")
        await db.rollback()
        raise


# ============================================================================
# DEFAULT ENERGY PROVIDERS & OFFERS (EDF Tarif Bleu - Août 2025)
# ============================================================================

from datetime import datetime, timezone

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
    Links offers to their corresponding PricingType.
    """
    try:
        logger.info("[SEED] Checking default energy provider and offers...")

        # Get pricing types for linking
        result = await db.execute(select(PricingType))
        pricing_types = {pt.code: pt for pt in result.scalars().all()}

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
        base_type = pricing_types.get("BASE")
        for kva, subscription, base_price in DEFAULT_BASE_OFFERS:
            offer_name = f"Tarif Bleu - BASE {kva} kVA"
            if offer_name not in existing_offers:
                offer = EnergyOffer(
                    provider_id=provider.id,
                    name=offer_name,
                    offer_type="BASE",
                    pricing_type_id=base_type.id if base_type else None,
                    subscription_price=subscription,
                    base_price=base_price,
                    power_kva=kva,
                    price_updated_at=EDF_PRICE_UPDATE_DATE,
                )
                db.add(offer)
                offers_created += 1
                logger.debug(f"[SEED] Created offer: {offer_name}")

        # Create HC/HP offers
        hchp_type = pricing_types.get("HC_HP")
        for kva, subscription, hp_price, hc_price in DEFAULT_HCHP_OFFERS:
            offer_name = f"Tarif Bleu - HC/HP {kva} kVA"
            if offer_name not in existing_offers:
                offer = EnergyOffer(
                    provider_id=provider.id,
                    name=offer_name,
                    offer_type="HC_HP",
                    pricing_type_id=hchp_type.id if hchp_type else None,
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
        tempo_type = pricing_types.get("TEMPO")
        for kva, subscription, blue_hc, blue_hp, white_hc, white_hp, red_hc, red_hp in DEFAULT_TEMPO_OFFERS:
            offer_name = f"Tarif Bleu - TEMPO {kva} kVA"
            if offer_name not in existing_offers:
                offer = EnergyOffer(
                    provider_id=provider.id,
                    name=offer_name,
                    offer_type="TEMPO",
                    pricing_type_id=tempo_type.id if tempo_type else None,
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
