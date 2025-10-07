"""
Import energy offers from GitHub repository
https://github.com/JC144/EDF_Simulateur_Prix/tree/main/scripts/tarifs
"""
import asyncio
import sys
import re
import json
from pathlib import Path
from datetime import datetime, UTC

sys.path.insert(0, '/app')

from sqlalchemy import select
from src.models.database import async_session_maker
from src.models.energy_provider import EnergyProvider, EnergyOffer


# Provider name mapping
PROVIDER_MAPPING = {
    'alpiq': 'Alpiq',
    'alterna': 'Alterna',
    'edf': 'EDF',
    'ekwateur': 'Ekwateur',
    'enercoop': 'Enercoop',
    'engie': 'Engie',
    'es': 'ES (Énergies de Strasbourg)',
    'ilek': 'Ilek',
    'labelleenergie': 'La Belle Énergie',
    'mint': 'Mint Énergie',
    'octopus': 'Octopus Energy',
    'ohm': 'Ohm Énergie',
    'sowee': 'Sowee',
    'switch': 'Switch Electric',
    'total': 'TotalEnergies',
    'uem': 'UEM',
}


def parse_js_offer(file_content: str, provider_name: str, file_name: str) -> list[dict]:
    """Parse JavaScript offer file and extract pricing data"""
    offers = []

    # Extract all push blocks
    push_pattern = r'abonnements\.push\((.*?)\);'
    matches = re.finditer(push_pattern, file_content, re.DOTALL)

    for match in matches:
        try:
            offer_block = match.group(1)

            # Extract offer name
            name_match = re.search(r'name:\s*"([^"]+)"', offer_block)
            if not name_match:
                continue
            offer_name = name_match.group(1)

            # Extract price URL
            price_url_match = re.search(r'price_url:\s*"([^"]+)"', offer_block)
            price_url = price_url_match.group(1) if price_url_match else ""

            # Extract last update
            update_match = re.search(r'lastUpdate:\s*"([^"]+)"', offer_block)
            last_update = update_match.group(1) if update_match else None

            # Extract prices array
            prices_match = re.search(r'prices:\s*\[(.*?)\]', offer_block, re.DOTALL)
            if not prices_match:
                continue

            prices_block = prices_match.group(1)

            # Detect offer type
            offer_type = "BASE"
            if "Tempo" in offer_name:
                offer_type = "TEMPO"
            elif "EJP" in offer_name or "ejp" in file_name.lower():
                offer_type = "EJP"
            elif "Heures Creuses" in offer_name or "HC" in offer_name or "prixKwhHC" in offer_block:
                offer_type = "HC_HP"

            # Extract power levels and pricing
            power_pattern = r'\{\s*puissance:\s*(\d+),\s*abonnement:\s*([\d.]+)\s*\}'
            power_matches = re.finditer(power_pattern, prices_block)

            # Extract pricing by type
            base_price_match = re.search(r'prixKwhHC:\s*([\d.]+)', offer_block) if offer_type == "BASE" else None
            hc_price_match = re.search(r'prixKwhHC:\s*([\d.]+)', offer_block)
            hp_price_match = re.search(r'prixKwhHP:\s*([\d.]+)', offer_block)

            # TEMPO prices
            tempo_blue_hc = None
            tempo_blue_hp = None
            tempo_white_hc = None
            tempo_white_hp = None
            tempo_red_hc = None
            tempo_red_hp = None

            if offer_type == "TEMPO":
                blue_match = re.search(r'bleu:\s*\{[^}]*prixKwhHC:\s*([\d.]+)[^}]*prixKwhHP:\s*([\d.]+)', offer_block)
                white_match = re.search(r'blanc:\s*\{[^}]*prixKwhHC:\s*([\d.]+)[^}]*prixKwhHP:\s*([\d.]+)', offer_block)
                red_match = re.search(r'rouge:\s*\{[^}]*prixKwhHC:\s*([\d.]+)[^}]*prixKwhHP:\s*([\d.]+)', offer_block)

                if blue_match:
                    tempo_blue_hc = float(blue_match.group(1)) / 100
                    tempo_blue_hp = float(blue_match.group(2)) / 100
                if white_match:
                    tempo_white_hc = float(white_match.group(1)) / 100
                    tempo_white_hp = float(white_match.group(2)) / 100
                if red_match:
                    tempo_red_hc = float(red_match.group(1)) / 100
                    tempo_red_hp = float(red_match.group(2)) / 100

            # EJP prices
            ejp_normal = None
            ejp_peak = None
            if offer_type == "EJP":
                normal_match = re.search(r'prixKwhHC:\s*([\d.]+)', offer_block)
                peak_match = re.search(r'prixKwhHP:\s*([\d.]+)', offer_block)
                if normal_match:
                    ejp_normal = float(normal_match.group(1)) / 100
                if peak_match:
                    ejp_peak = float(peak_match.group(1)) / 100

            # Create an offer for each power level
            for power_match in power_matches:
                power_kva = int(power_match.group(1))
                subscription = float(power_match.group(2))

                offer_data = {
                    'name': f"{offer_name} {power_kva} kVA",
                    'offer_type': offer_type,
                    'power_kva': power_kva,
                    'subscription_price': subscription,
                    'price_url': price_url,
                    'last_update': last_update,
                }

                # Add pricing based on type
                if offer_type == "BASE":
                    if base_price_match:
                        offer_data['base_price'] = float(base_price_match.group(1)) / 100
                elif offer_type == "HC_HP":
                    if hc_price_match:
                        offer_data['hc_price'] = float(hc_price_match.group(1)) / 100
                    if hp_price_match:
                        offer_data['hp_price'] = float(hp_price_match.group(1)) / 100
                elif offer_type == "TEMPO":
                    offer_data['tempo_blue_hc'] = tempo_blue_hc
                    offer_data['tempo_blue_hp'] = tempo_blue_hp
                    offer_data['tempo_white_hc'] = tempo_white_hc
                    offer_data['tempo_white_hp'] = tempo_white_hp
                    offer_data['tempo_red_hc'] = tempo_red_hc
                    offer_data['tempo_red_hp'] = tempo_red_hp
                elif offer_type == "EJP":
                    offer_data['ejp_normal'] = ejp_normal
                    offer_data['ejp_peak'] = ejp_peak

                offers.append(offer_data)

        except Exception as e:
            print(f"❌ Error parsing offer in {file_name}: {str(e)}")
            continue

    return offers


async def import_offers(tarifs_path: str):
    """Import offers from GitHub repository tarifs directory"""
    tarifs_dir = Path(tarifs_path)

    if not tarifs_dir.exists():
        print(f"❌ Directory not found: {tarifs_path}")
        return

    async with async_session_maker() as session:
        total_offers = 0
        total_providers = 0

        # Process each provider directory
        for provider_dir in sorted(tarifs_dir.iterdir()):
            if not provider_dir.is_dir():
                continue

            provider_key = provider_dir.name.lower()
            provider_name = PROVIDER_MAPPING.get(provider_key, provider_key.title())

            print(f"\n📁 Processing {provider_name}...")

            # Check if provider exists
            result = await session.execute(
                select(EnergyProvider).where(EnergyProvider.name == provider_name)
            )
            provider = result.scalar_one_or_none()

            if not provider:
                # Create provider
                provider = EnergyProvider(
                    name=provider_name,
                    website=None,
                    is_active=True
                )
                session.add(provider)
                await session.flush()
                print(f"  ✅ Created provider: {provider_name}")
                total_providers += 1
            else:
                print(f"  ℹ️  Provider exists: {provider_name}")

            # Process JS files in provider directory
            provider_offers = 0
            for js_file in provider_dir.glob("*.js"):
                try:
                    content = js_file.read_text(encoding='utf-8')
                    offers = parse_js_offer(content, provider_name, js_file.name)

                    for offer_data in offers:
                        # Check if offer already exists
                        existing = await session.execute(
                            select(EnergyOffer).where(
                                EnergyOffer.provider_id == provider.id,
                                EnergyOffer.name == offer_data['name']
                            )
                        )
                        if existing.scalar_one_or_none():
                            print(f"    ⚠️  Skipping existing: {offer_data['name']}")
                            continue

                        # Parse last_update date
                        price_updated_at = None
                        if offer_data.get('last_update'):
                            try:
                                price_updated_at = datetime.strptime(offer_data['last_update'], "%Y-%m-%d")
                                price_updated_at = price_updated_at.replace(tzinfo=UTC)
                            except:
                                pass

                        # Create offer
                        offer = EnergyOffer(
                            provider_id=provider.id,
                            name=offer_data['name'],
                            offer_type=offer_data['offer_type'],
                            subscription_price=offer_data['subscription_price'],
                            base_price=offer_data.get('base_price'),
                            hc_price=offer_data.get('hc_price'),
                            hp_price=offer_data.get('hp_price'),
                            tempo_blue_hc=offer_data.get('tempo_blue_hc'),
                            tempo_blue_hp=offer_data.get('tempo_blue_hp'),
                            tempo_white_hc=offer_data.get('tempo_white_hc'),
                            tempo_white_hp=offer_data.get('tempo_white_hp'),
                            tempo_red_hc=offer_data.get('tempo_red_hc'),
                            tempo_red_hp=offer_data.get('tempo_red_hp'),
                            ejp_normal=offer_data.get('ejp_normal'),
                            ejp_peak=offer_data.get('ejp_peak'),
                            price_updated_at=price_updated_at,
                            is_active=True
                        )
                        session.add(offer)
                        provider_offers += 1
                        total_offers += 1
                        print(f"    ✅ Added: {offer_data['name']}")

                except Exception as e:
                    print(f"  ❌ Error processing {js_file.name}: {str(e)}")
                    continue

            print(f"  📊 Total offers for {provider_name}: {provider_offers}")

        # Commit all changes
        await session.commit()

        print(f"\n{'='*60}")
        print(f"✅ Import completed!")
        print(f"📊 Total providers: {total_providers} created")
        print(f"📊 Total offers: {total_offers} imported")
        print(f"{'='*60}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python import_github_offers.py <path_to_tarifs_directory>")
        sys.exit(1)

    tarifs_path = sys.argv[1]
    asyncio.run(import_offers(tarifs_path))
