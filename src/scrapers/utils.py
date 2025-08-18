"""Shared scraper utilities — salary parsing, market detection, categorization, fingerprinting."""
import hashlib
import re
from datetime import datetime


def parse_salary(salary_str: str) -> tuple:
    """Parse salary string into (min, max) floats.

    Handles formats like:
    - "$120,000 - $150,000"
    - "120000-150000"
    - "$50/hr"
    - "EUR 80,000"
    """
    if not salary_str:
        return None, None
    salary_str = str(salary_str)
    numbers = re.findall(r"[\d,]+", salary_str.replace(",", ""))
    if len(numbers) >= 2:
        return float(numbers[0]), float(numbers[1])
    elif len(numbers) == 1:
        return float(numbers[0]), None
    return None, None


def detect_salary_currency(salary_str: str) -> str:
    """Detect currency from salary string."""
    if not salary_str:
        return "USD"
    s = str(salary_str).upper()
    if any(x in s for x in ["EUR", "\u20ac"]):
        return "EUR"
    if any(x in s for x in ["GBP", "\u00a3"]):
        return "GBP"
    if any(x in s for x in ["CHF"]):
        return "CHF"
    if any(x in s for x in ["CAD", "C$"]):
        return "CAD"
    if any(x in s for x in ["AUD", "A$"]):
        return "AUD"
    return "USD"


def normalize_salary_to_annual(amount: float | None, period: str = "YEAR") -> float | None:
    """Convert hourly/monthly salary to annual estimate."""
    if amount is None:
        return None
    period = (period or "YEAR").upper()
    if period in ("HOUR", "HOURLY"):
        return round(amount * 2080, 0)  # 40h * 52w
    if period in ("MONTH", "MONTHLY"):
        return round(amount * 12, 0)
    if period in ("WEEK", "WEEKLY"):
        return round(amount * 52, 0)
    if period in ("DAY", "DAILY"):
        return round(amount * 260, 0)  # 5d * 52w
    return amount


def detect_market(location: str) -> str:
    """Map a location string to a market_id."""
    loc = location.lower()
    if any(x in loc for x in [
        "san francisco", "bay area", "silicon valley", "palo alto",
        "mountain view", "california", "san jose", "sunnyvale",
        "menlo park", "cupertino",
    ]):
        return "silicon_valley"
    elif any(x in loc for x in [
        "new york", "nyc", "boston", "seattle", "austin", "chicago",
        "denver", "los angeles",
    ]):
        return "us_other"
    elif any(x in loc for x in [
        "tel aviv", "israel", "jerusalem", "haifa", "herzliya", "ramat gan",
    ]):
        return "tel_aviv"
    elif any(x in loc for x in [
        "london", "manchester", "birmingham", "cambridge", "edinburgh", "bristol",
    ]):
        return "london"
    elif any(x in loc for x in [
        "uk", "united kingdom", "england", "scotland", "wales",
    ]):
        return "london"
    elif any(x in loc for x in [
        "berlin", "munich", "germany", "hamburg", "frankfurt", "amsterdam",
        "paris", "dublin", "stockholm", "copenhagen", "zurich",
    ]):
        return "europe"
    elif any(x in loc for x in [
        "washington", "virginia", "maryland", "texas", "florida", "georgia",
        "ohio", "michigan", "pennsylvania",
    ]):
        return "us_other"
    elif any(x in loc for x in [
        "toronto", "vancouver", "montreal", "ottawa", "calgary", "canada",
    ]):
        return "canada"
    elif any(x in loc for x in [
        "sydney", "melbourne", "brisbane", "perth", "australia",
    ]):
        return "australia"
    elif any(x in loc for x in [
        "bangalore", "bengaluru", "mumbai", "hyderabad", "delhi", "pune",
        "chennai", "india",
    ]):
        return "india"
    elif any(x in loc for x in ["singapore"]):
        return "singapore"
    elif any(x in loc for x in ["tokyo", "osaka", "japan"]):
        return "japan"
    else:
        return "other"


def categorize(title: str, tags: list) -> str:
    """Categorize a job by title and tags into a search_category."""
    title_lower = title.lower()
    tag_str = " ".join(t.lower() for t in tags) if tags else ""
    combined = f"{title_lower} {tag_str}"

    categories = {
        "AI engineer": ["ai ", "ai/", "artificial intelligence", "llm", "gpt", "generative ai"],
        "machine learning engineer": ["machine learning", "deep learning", "ml engineer", "ml "],
        "data scientist": ["data scientist", "data science", "data analytics"],
        "data engineer": ["data engineer", "data pipeline", "etl", "data infrastructure"],
        "frontend developer": ["frontend", "front-end", "front end", "react", "vue", "angular"],
        "backend developer": ["backend", "back-end", "back end"],
        "full stack developer": ["full stack", "fullstack", "full-stack"],
        "devops engineer": ["devops", "dev ops", "sre", "site reliability", "platform engineer"],
        "cloud engineer": ["cloud engineer", "cloud architect", "aws", "azure", "gcp"],
        "cybersecurity": ["security", "cybersecurity", "infosec", "penetration", "soc analyst"],
        "product manager": ["product manager", "product owner", "product lead"],
        "biomedical engineer": ["biomedical", "bioinformatics", "biotech", "genomics", "clinical data"],
        "hardware engineer": ["hardware", "electrical engineer", "embedded", "firmware", "fpga", "asic", "pcb"],
        "UX designer": ["ux", "ui/ux", "user experience", "product design", "interaction design"],
        "blockchain developer": ["blockchain", "web3", "solidity", "smart contract", "defi", "crypto"],
        "QA engineer": ["qa ", "quality assurance", "test engineer", "sdet", "automation test"],
        "mobile developer": ["ios", "android", "mobile developer", "flutter", "react native", "swift", "kotlin"],
        "network engineer": ["network engineer", "network architect", "cisco", "routing"],
        "database administrator": ["database admin", "dba", "sql admin", "database engineer"],
        "systems engineer": ["systems engineer", "systems architect", "infrastructure engineer"],
        "technical writer": ["technical writer", "documentation engineer"],
        "software engineer": ["software engineer", "software developer", "programmer", "swe"],
    }

    for cat, keywords in categories.items():
        if any(kw in combined for kw in keywords):
            return cat

    if any(x in combined for x in ["developer", "engineer", "engineering"]):
        return "software engineer"

    return "other"


def _normalize_company(company: str) -> str:
    """Normalize company name for fingerprinting."""
    name = company.lower().strip()
    for suffix in [", inc.", ", inc", " inc.", " inc", ", llc", " llc",
                   ", ltd.", ", ltd", " ltd.", " ltd", " gmbh",
                   " corporation", " corp.", " corp", " co."]:
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name.strip()


def compute_fingerprint(company: str, title: str, city: str = "") -> str:
    """Compute a SHA-256 fingerprint for deduplication.

    Fingerprint = SHA256(normalized_company | normalized_title | city | ISO_week)
    """
    norm_company = _normalize_company(company)
    norm_title = title.lower().strip()
    norm_city = city.lower().strip() if city else ""
    iso_week = datetime.utcnow().strftime("%G-W%V")

    raw = f"{norm_company}|{norm_title}|{norm_city}|{iso_week}"
    return hashlib.sha256(raw.encode()).hexdigest()
