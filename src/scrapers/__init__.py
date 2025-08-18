"""Scraper package — re-exports all scrapers from a single surface."""
from src.scrapers.utils import (
    parse_salary,
    detect_salary_currency,
    normalize_salary_to_annual,
    detect_market,
    categorize,
    compute_fingerprint,
)
from src.scrapers.simple_api_scrapers import TheMuseScraper, JobicyScraper, RemotiveScraper
from src.scrapers.board_scrapers import GreenhouseScraper, LeverScraper, HNWhoIsHiringScraper

__all__ = [
    # Utils
    "parse_salary",
    "detect_salary_currency",
    "normalize_salary_to_annual",
    "detect_market",
    "categorize",
    "compute_fingerprint",
    # Simple API scrapers
    "TheMuseScraper",
    "JobicyScraper",
    "RemotiveScraper",
    # Board scrapers
    "GreenhouseScraper",
    "LeverScraper",
    "HNWhoIsHiringScraper",
]
