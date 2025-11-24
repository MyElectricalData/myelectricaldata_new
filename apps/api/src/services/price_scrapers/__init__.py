from .base import BasePriceScraper
from .edf_scraper import EDFPriceScraper
from .enercoop_scraper import EnercoopPriceScraper
from .totalenergies_scraper import TotalEnergiesPriceScraper
from .primeo_scraper import PrimeoEnergiePriceScraper
from .engie_scraper import EngieScraper
from .alpiq_scraper import AlpiqScraper
from .alterna_scraper import AlternaScraper
from .ekwateur_scraper import EkwateurScraper

__all__ = [
    "BasePriceScraper",
    "EDFPriceScraper",
    "EnercoopPriceScraper",
    "TotalEnergiesPriceScraper",
    "PrimeoEnergiePriceScraper",
    "EngieScraper",
    "AlpiqScraper",
    "AlternaScraper",
    "EkwateurScraper",
]
