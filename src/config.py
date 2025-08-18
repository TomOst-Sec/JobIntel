"""Configuration for JobIntel."""
import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# JSearch API
JSEARCH_BASE_URL = "https://jsearch.p.rapidapi.com"
JSEARCH_HOST = "jsearch.p.rapidapi.com"

# LinkedIn Data API (RapidAPI)
LINKEDIN_BASE_URL = "https://linkedin-data-api.p.rapidapi.com"
LINKEDIN_HOST = "linkedin-data-api.p.rapidapi.com"

# Target markets
MARKETS = {
    "silicon_valley": {
        "name": "Silicon Valley / Bay Area",
        "query_location": "San Francisco, CA",
        "radius": 50,  # miles
    },
    "tel_aviv": {
        "name": "Tel Aviv",
        "query_location": "Tel Aviv, Israel",
        "radius": 30,
    },
    "london": {
        "name": "London",
        "query_location": "London, UK",
        "radius": 30,
    },
    "remote": {
        "name": "Remote / Global",
        "query_location": "Remote",
        "radius": 0,
    },
    "europe": {
        "name": "Europe",
        "query_location": "Europe",
        "radius": 0,
    },
    "us_other": {
        "name": "US (Other)",
        "query_location": "United States",
        "radius": 0,
    },
    "other": {
        "name": "Other",
        "query_location": "",
        "radius": 0,
    },
}

# Job categories to track
CATEGORIES = [
    "software engineer",
    "data scientist",
    "product manager",
    "devops engineer",
    "machine learning engineer",
    "frontend developer",
    "backend developer",
    "full stack developer",
    "AI engineer",
    "cloud engineer",
    "cybersecurity",
    "data engineer",
]

# Database
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "jobintel.db")

# Reports output
REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")
