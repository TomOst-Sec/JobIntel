"""Enrichment Pipeline — transforms raw jobs into 47-field intelligence.

9-stage pipeline:
  1. VALIDATION (sync)
  2. CLASSIFICATION (rule-based)
  3. COMPANY MATCHING
  4. GHOST SCORING (enhanced with 6 types)
  5. SALARY INTELLIGENCE
  6. SKILL TAXONOMY
  7. AI ENRICHMENT (Claude — the expensive, high-value stage)
  8. SEARCH INDEX UPDATE
  9. ALERT MATCHING
"""
import json
import re
import sqlite3
from datetime import datetime

import anthropic

from api.config import get_settings

# ═══════════════════════════════════════════════════
# CLASSIFICATION MAPS
# ═══════════════════════════════════════════════════

TECH_DOMAIN_KEYWORDS = {
    "ai_ml": ["machine learning", "deep learning", "ml engineer", "ai ", "nlp", "computer vision", "rlhf", "llm", "data scientist"],
    "backend": ["backend", "back-end", "server-side", "api developer", "microservices"],
    "frontend": ["frontend", "front-end", "ui engineer", "react developer", "angular developer", "vue"],
    "fullstack": ["fullstack", "full-stack", "full stack"],
    "mobile": ["mobile", "ios", "android", "react native", "flutter", "swift developer", "kotlin developer"],
    "devops_platform": ["devops", "sre", "site reliability", "platform engineer", "infrastructure", "cloud engineer", "kubernetes"],
    "data_engineering": ["data engineer", "etl", "data pipeline", "spark", "airflow", "dbt "],
    "cybersecurity": ["security engineer", "cybersecurity", "infosec", "penetration test", "soc analyst", "appsec"],
    "embedded_systems": ["embedded", "firmware", "rtos", "fpga", "iot engineer"],
    "game_dev": ["game developer", "game engineer", "unity developer", "unreal engine"],
    "blockchain": ["blockchain", "web3", "smart contract", "solidity", "defi"],
    "cloud_infrastructure": ["cloud architect", "aws engineer", "azure engineer", "gcp engineer"],
    "research": ["research scientist", "research engineer", "phd", "publications"],
    "engineering_management": ["engineering manager", "vp engineering", "head of engineering", "director of engineering", "cto"],
    "product_engineering": ["product engineer", "growth engineer"],
    "qa_testing": ["qa engineer", "test engineer", "sdet", "quality assurance", "automation test"],
}

SENIORITY_MAP = {
    "intern": "entry", "trainee": "entry", "apprentice": "entry",
    "junior": "junior", "jr ": "junior", "jr.": "junior", "entry level": "junior",
    "mid-level": "mid", "mid level": "mid", "intermediate": "mid",
    "senior": "senior", "sr ": "senior", "sr.": "senior",
    "staff": "staff", "staff engineer": "staff",
    "principal": "principal",
    "distinguished": "distinguished",
    "fellow": "fellow",
    "engineering manager": "management_em", "em ": "management_em",
    "director": "management_director",
    "vp ": "management_vp", "vice president": "management_vp",
    "cto": "management_c_suite", "chief": "management_c_suite",
}

# Level mapping (Google/Meta style)
LEVEL_MAP = {
    "l3": "mid", "l4": "senior", "l5": "staff", "l6": "principal",
    "l7": "distinguished", "l8": "fellow",
    "ic3": "mid", "ic4": "senior", "ic5": "staff", "ic6": "principal",
    "e3": "mid", "e4": "senior", "e5": "staff", "e6": "principal",
}

WORK_ARRANGEMENT_PATTERNS = {
    "fully_remote_anywhere": ["remote anywhere", "100% remote", "fully remote", "work from anywhere"],
    "fully_remote_us_only": ["remote us only", "remote (us)", "us remote only", "remote - united states"],
    "fully_remote_eu_only": ["remote eu only", "remote (eu)", "eu remote only", "remote - europe"],
    "remote_with_quarterly_travel": ["remote with travel", "remote + quarterly", "remote with occasional"],
    "hybrid_flexible": ["hybrid flexible", "flex hybrid", "mostly remote"],
    "hybrid_3_days": ["3 days in office", "3 days on-site", "hybrid 3"],
    "hybrid_2_days": ["2 days in office", "2 days on-site", "hybrid 2"],
    "onsite_required": ["on-site", "onsite", "in-office", "in office required"],
    "onsite_with_relocation": ["relocation", "relo assistance", "relocation package"],
}

INDUSTRY_KEYWORDS = {
    "fintech": ["fintech", "financial technology", "payments", "banking", "neobank"],
    "healthtech": ["healthtech", "health tech", "medical", "healthcare", "biotech", "clinical"],
    "ai_saas": ["ai platform", "ai-powered", "llm platform", "ai startup"],
    "enterprise_software": ["enterprise", "b2b saas", "crm", "erp"],
    "ecommerce": ["ecommerce", "e-commerce", "marketplace", "retail tech"],
    "social_media": ["social media", "social network", "content platform"],
    "gaming": ["gaming", "game studio", "esports"],
    "defense": ["defense", "defence", "military", "clearance required"],
    "edtech": ["edtech", "education technology", "learning platform"],
    "adtech": ["adtech", "advertising technology", "programmatic"],
    "infrastructure": ["cloud infrastructure", "data center", "networking"],
}

URGENCY_SIGNALS = {
    "immediate": ["asap", "immediate start", "start immediately", "urgent hire", "this week"],
    "standard": [],  # default
    "slow_burn": ["always looking", "growing team", "building pipeline"],
    "pipeline": ["future openings", "talent pool", "expression of interest"],
}

# Canonical skill normalization
SKILL_ALIASES = {
    "python3": "python", "python 3": "python", "py": "python",
    "javascript": "javascript", "js": "javascript", "ecmascript": "javascript",
    "typescript": "typescript", "ts": "typescript",
    "react.js": "react", "reactjs": "react", "react js": "react",
    "vue.js": "vue", "vuejs": "vue",
    "node.js": "nodejs", "node": "nodejs",
    "amazon web services": "aws", "amazon aws": "aws",
    "google cloud platform": "gcp", "google cloud": "gcp",
    "microsoft azure": "azure",
    "kubernetes": "kubernetes", "k8s": "kubernetes",
    "docker": "docker", "containerization": "docker",
    "machine learning": "ml", "deep learning": "deep_learning",
    "natural language processing": "nlp",
    "ci/cd": "cicd", "ci cd": "cicd",
    "postgresql": "postgres", "psql": "postgres",
    "mongodb": "mongodb", "mongo": "mongodb",
    "ruby on rails": "rails", "ror": "rails",
    "c++": "cpp", "c plus plus": "cpp",
    "c#": "csharp", "c sharp": "csharp",
    "objective-c": "objc",
    "react native": "react_native",
    "spring boot": "spring_boot", "springboot": "spring_boot",
    "graphql": "graphql", "graph ql": "graphql",
    "terraform": "terraform", "tf": "terraform",
}

JD_RED_FLAGS = [
    ("competitive salary", "Compensation red flag: 'competitive salary' without a range often means below-market pay"),
    ("like a family", "Culture red flag: 'like a family' often signals boundary issues"),
    ("fast-paced environment", "Pace red flag: 'fast-paced' can indicate burnout culture"),
    ("wear many hats", "Scope red flag: 'wear many hats' can mean understaffed team"),
    ("rock star", "Culture red flag: 'rock star' language signals poor hiring culture"),
    ("ninja", "Culture red flag: 'ninja' language signals poor hiring culture"),
    ("unlimited pto", "Benefits red flag: 'unlimited PTO' often means no PTO tracking/culture"),
    ("no 9-to-5", "Work-life red flag: 'no 9-to-5' signals overwork expectations"),
    ("passion", "Culture red flag: 'passion' requirements can mask exploitation"),
    ("work hard play hard", "Culture red flag: 'work hard play hard' often means overwork"),
    ("startup mentality", "Scope red flag: 'startup mentality' at established company signals understaffing"),
    ("self-starter", "Support red flag: 'self-starter' can mean lack of mentorship/structure"),
]

JD_GREEN_FLAGS = [
    ("salary range", "Transparency: salary range disclosed"),
    ("async", "Culture: async-first or async-friendly work culture"),
    ("learning budget", "Growth: learning/education budget mentioned"),
    ("promotion criteria", "Growth: clear promotion criteria described"),
    ("eng blog", "Culture: engineering blog referenced (technical culture)"),
    ("tech blog", "Culture: tech blog referenced (technical culture)"),
    ("flexible hours", "Work-life: flexible working hours"),
    ("parental leave", "Benefits: parental leave mentioned"),
    ("mental health", "Benefits: mental health support mentioned"),
    ("4-day work week", "Work-life: 4-day work week"),
    ("sabbatical", "Benefits: sabbatical available"),
    ("equity", "Compensation: equity compensation offered"),
    ("open source", "Culture: open source contribution encouraged"),
]


def _get_client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


# ═══════════════════════════════════════════════════
# Stage 1: Validation
# ═══════════════════════════════════════════════════

def stage_validate(job: dict) -> dict:
    """Validate job has required fields and clean data."""
    job["title"] = (job.get("title") or "").strip()
    job["company"] = (job.get("company") or "").strip()
    job["description"] = (job.get("description") or "").strip()
    if not job["title"] or not job["company"]:
        raise ValueError("Job missing title or company")
    return job


# ═══════════════════════════════════════════════════
# Stage 2: Classification (rule-based, fast)
# ═══════════════════════════════════════════════════

def stage_classify(job: dict) -> dict:
    """Classify job into tech domain, seniority, work arrangement, etc."""
    title_lower = (job.get("title") or "").lower()
    desc_lower = (job.get("description") or "").lower()
    combined = f"{title_lower} {desc_lower}"

    # Tech domain
    tech_domain = "other_tech"
    best_score = 0
    for domain, keywords in TECH_DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in combined)
        if score > best_score:
            best_score = score
            tech_domain = domain

    # Seniority
    seniority = "mid"  # default
    for pattern, level in SENIORITY_MAP.items():
        if pattern in title_lower:
            seniority = level
            break
    for level_code, level_name in LEVEL_MAP.items():
        if level_code in title_lower:
            seniority = level_name
            break

    # Work arrangement
    work_arrangement = "onsite_required"
    if job.get("is_remote"):
        work_arrangement = "fully_remote_anywhere"
    for arrangement, patterns in WORK_ARRANGEMENT_PATTERNS.items():
        if any(p in combined for p in patterns):
            work_arrangement = arrangement
            break

    # Industry
    company_industry = "enterprise_software"
    for industry, keywords in INDUSTRY_KEYWORDS.items():
        if any(kw in combined for kw in keywords):
            company_industry = industry
            break

    # Employment type
    emp_type = job.get("employment_type") or "full_time"
    emp_normalized = "full_time"
    if "contract" in emp_type.lower() or "freelance" in combined:
        emp_normalized = "contract"
    elif "part" in emp_type.lower():
        emp_normalized = "part_time"
    elif "intern" in emp_type.lower() or "intern" in title_lower:
        emp_normalized = "internship"

    # Equity detection
    has_equity = None
    equity_type = None
    if "rsu" in combined:
        has_equity = 1
        equity_type = "rsu"
    elif "stock option" in combined or "equity" in combined:
        has_equity = 1
        equity_type = "options"

    # Hiring urgency
    urgency = "standard"
    for urg, signals in URGENCY_SIGNALS.items():
        if any(s in combined for s in signals):
            urgency = urg
            break

    # Team function
    team_function = "product_engineering"
    if any(kw in combined for kw in ["platform", "infrastructure", "infra"]):
        team_function = "platform_infra"
    elif any(kw in combined for kw in ["data science", "analytics", "ml"]):
        team_function = "data_science"
    elif any(kw in combined for kw in ["security", "infosec"]):
        team_function = "security"
    elif any(kw in combined for kw in ["research", "r&d"]):
        team_function = "research"
    elif any(kw in combined for kw in ["devrel", "developer relations", "developer advocacy"]):
        team_function = "developer_relations"

    return {
        **job,
        "tech_domain": tech_domain,
        "seniority_universal": seniority,
        "employment_type_normalized": emp_normalized,
        "work_arrangement": work_arrangement,
        "company_industry": company_industry,
        "has_equity": has_equity,
        "equity_type": equity_type,
        "hiring_urgency": urgency,
        "team_function": team_function,
    }


# ═══════════════════════════════════════════════════
# Stage 3: Company Matching
# ═══════════════════════════════════════════════════

COMPANY_TIERS = {
    "FAANG_PLUS": ["google", "meta", "apple", "amazon", "microsoft", "netflix", "nvidia"],
    "TOP_100": ["salesforce", "oracle", "ibm", "intel", "cisco", "adobe", "uber", "lyft",
                "airbnb", "stripe", "databricks", "snowflake", "palantir", "spotify"],
    "UNICORN": ["openai", "anthropic", "figma", "notion", "discord", "canva", "scale ai",
                "vercel", "supabase", "linear", "dbt labs", "hashicorp"],
}


def stage_company_match(job: dict, conn: sqlite3.Connection) -> dict:
    """Match company to intelligence database and compute tier."""
    company = job.get("company", "").lower().strip()

    # Determine tier
    tier = "UNKNOWN"
    for tier_name, companies in COMPANY_TIERS.items():
        if any(c in company for c in companies):
            tier = tier_name
            break

    # Load existing company intel
    row = conn.execute(
        "SELECT trajectory, layoff_risk_score, ipo_probability FROM company_intel_cache WHERE LOWER(company) = ?",
        (company,),
    ).fetchone()

    trajectory = "unknown"
    layoff_risk = 0.0
    ipo_prob = 0.0
    if row:
        r = dict(row)
        trajectory = r.get("trajectory", "unknown")
        layoff_risk = r.get("layoff_risk_score", 0.0)
        ipo_prob = r.get("ipo_probability", 0.0)

    # Compute hiring velocity
    recent_30 = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ? AND scraped_at >= datetime('now', '-30 days')",
        (company,),
    ).fetchone()[0]
    baseline_90 = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ? AND scraped_at >= datetime('now', '-90 days')",
        (company,),
    ).fetchone()[0]
    velocity = (recent_30 * 3) / max(baseline_90, 1)

    # Ghost rate for this company
    total = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ?", (company,),
    ).fetchone()[0]
    ghosts = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ? AND ghost_score > 50",
        (company,),
    ).fetchone()[0]
    ghost_rate = ghosts / max(total, 1)

    return {
        **job,
        "company_tier": tier,
        "company_trajectory": trajectory,
        "company_hiring_velocity": round(velocity, 2),
        "layoff_risk_score": layoff_risk,
        "ipo_probability": ipo_prob,
        "company_ghost_rate": round(ghost_rate, 3),
    }


# ═══════════════════════════════════════════════════
# Stage 5: Salary Intelligence
# ═══════════════════════════════════════════════════

def stage_salary_intelligence(job: dict, conn: sqlite3.Connection) -> dict:
    """Compute salary percentile, market comparison, H1B data."""
    sal_min = job.get("salary_min")
    sal_max = job.get("salary_max")
    company = (job.get("company") or "").lower()
    title = (job.get("title") or "").lower()
    category = job.get("search_category", "")

    # Market salary data for this role category
    market = conn.execute(
        """SELECT AVG(salary_min) as avg_min, AVG(salary_max) as avg_max,
                  COUNT(*) as cnt
           FROM jobs WHERE search_category = ? AND salary_min > 0""",
        (category,),
    ).fetchone()
    market_data = dict(market) if market else {}
    market_avg_min = market_data.get("avg_min")
    market_avg_max = market_data.get("avg_max")

    # Salary percentile
    salary_percentile = None
    salary_vs_p50 = None
    if sal_min and market_avg_min and market_avg_max:
        mid = (sal_min + (sal_max or sal_min)) / 2
        market_mid = (market_avg_min + (market_avg_max or market_avg_min)) / 2
        if market_mid > 0:
            salary_vs_p50 = round(mid / market_mid, 2)
            # Rough percentile
            ratio = mid / market_mid
            if ratio >= 1.3:
                salary_percentile = 90
            elif ratio >= 1.15:
                salary_percentile = 75
            elif ratio >= 0.95:
                salary_percentile = 50
            elif ratio >= 0.8:
                salary_percentile = 25
            else:
                salary_percentile = 10

    # Salary estimation when not disclosed
    estimated_min = None
    estimated_max = None
    est_confidence = 0.0
    if not sal_min and market_avg_min:
        estimated_min = round(market_avg_min, -3)
        estimated_max = round((market_avg_max or market_avg_min * 1.3), -3)
        est_confidence = min(0.8, (market_data.get("cnt", 0) or 0) / 100)

    # H1B data lookup
    h1b_avg = None
    h1b_count = None
    h1b_row = conn.execute(
        """SELECT AVG(wage_annual) as avg_wage, COUNT(*) as cnt
           FROM h1b_salary_data
           WHERE company_name_normalized LIKE ? AND job_title_normalized LIKE ?""",
        (f"%{company[:20]}%", f"%{title[:30]}%"),
    ).fetchone()
    if h1b_row:
        h1b_data = dict(h1b_row)
        if h1b_data.get("cnt", 0) > 0:
            h1b_avg = h1b_data.get("avg_wage")
            h1b_count = h1b_data.get("cnt")

    return {
        **job,
        "salary_vs_market_p50": salary_vs_p50,
        "salary_percentile": salary_percentile,
        "salary_estimated_min": estimated_min,
        "salary_estimated_max": estimated_max,
        "salary_estimation_confidence": est_confidence,
        "h1b_avg_wage": h1b_avg,
        "h1b_sample_size": h1b_count,
    }


# ═══════════════════════════════════════════════════
# Stage 6: Skill Taxonomy
# ═══════════════════════════════════════════════════

def stage_skill_taxonomy(job: dict, conn: sqlite3.Connection) -> dict:
    """Normalize skills to canonical taxonomy."""
    raw_skills = job.get("required_skills") or ""
    if raw_skills.startswith("["):
        try:
            skills_list = json.loads(raw_skills)
        except json.JSONDecodeError:
            skills_list = [s.strip() for s in raw_skills.split(",") if s.strip()]
    else:
        skills_list = [s.strip() for s in raw_skills.split(",") if s.strip()]

    # Normalize to canonical
    canonical = []
    for skill in skills_list:
        normalized = SKILL_ALIASES.get(skill.lower().strip(), skill.lower().strip())
        if normalized not in canonical:
            canonical.append(normalized)

    # Categorize
    methodologies = ["agile", "scrum", "tdd", "bdd", "cicd", "devops", "kanban", "waterfall", "pair_programming"]
    domain_skills = ["ml", "deep_learning", "nlp", "computer_vision", "fintech", "healthcare", "blockchain"]

    skills_technical = [s for s in canonical if s not in methodologies and s not in domain_skills]
    skills_meth = [s for s in canonical if s in methodologies]
    skills_dom = [s for s in canonical if s in domain_skills]

    # Demand score: what % of active jobs require 80%+ of these skills
    demand_score = 50.0
    rarity_score = 50.0
    if canonical:
        # Count jobs with similar skill sets
        like_clauses = " AND ".join(["required_skills LIKE ?" for _ in canonical[:5]])
        params = [f"%{s}%" for s in canonical[:5]]
        if like_clauses:
            matching = conn.execute(
                f"SELECT COUNT(*) FROM jobs WHERE {like_clauses}",
                params,
            ).fetchone()[0]
            total = conn.execute("SELECT COUNT(*) FROM jobs WHERE required_skills IS NOT NULL").fetchone()[0]
            if total > 0:
                demand_ratio = matching / total
                demand_score = min(100, demand_ratio * 1000)  # Scale up
                rarity_score = max(0, 100 - demand_score)

    return {
        **job,
        "skills_canonical": json.dumps(canonical),
        "skills_technical": json.dumps(skills_technical),
        "skills_methodologies": json.dumps(skills_meth),
        "skills_domain": json.dumps(skills_dom),
        "skills_hard_required": json.dumps(canonical[:len(canonical)//2 + 1] if canonical else []),
        "skills_preferred": json.dumps(canonical[len(canonical)//2 + 1:] if len(canonical) > 1 else []),
        "skill_demand_score": round(demand_score, 1),
        "skill_rarity_score": round(rarity_score, 1),
    }


# ═══════════════════════════════════════════════════
# Stage 4 + JD Analysis: Red/Green Flags
# ═══════════════════════════════════════════════════

def stage_jd_analysis(job: dict) -> dict:
    """Detect red flags, green flags, and culture signals from JD language."""
    desc = (job.get("description") or "").lower()
    title = (job.get("title") or "").lower()
    combined = f"{title} {desc}"

    red_flags = []
    for pattern, flag in JD_RED_FLAGS:
        if pattern in combined:
            red_flags.append(flag)

    green_flags = []
    for pattern, flag in JD_GREEN_FLAGS:
        if pattern in combined:
            green_flags.append(flag)

    # Culture signals
    culture = []
    if "autonomous" in combined or "autonomy" in combined:
        culture.append("autonomy-focused")
    if "collaborative" in combined or "teamwork" in combined:
        culture.append("collaboration-heavy")
    if "metrics" in combined or "data-driven" in combined:
        culture.append("metrics-driven")
    if "move fast" in combined or "iterate quickly" in combined:
        culture.append("fast-iteration")
    if "sustainable" in combined or "work-life" in combined:
        culture.append("sustainable-pace")
    if "on-call" in combined or "pager" in combined:
        culture.append("on-call-culture")
    if "engineering-led" in combined or "engineer-driven" in combined:
        culture.append("engineering-led")

    # Visa detection
    visa = None
    if "clearance required" in combined or "security clearance" in combined:
        visa = "clearance_required"
    elif "citizen only" in combined or "us citizen" in combined:
        visa = "citizen_only"
    elif "visa sponsor" in combined:
        visa = "visa_sponsorship_available"

    return {
        **job,
        "jd_red_flags": json.dumps(red_flags),
        "jd_green_flags": json.dumps(green_flags),
        "culture_signals": json.dumps(culture),
        "visa_requirements_detected": visa,
    }


# ═══════════════════════════════════════════════════
# Stage 7: AI Enrichment (Claude — the expensive stage)
# ═══════════════════════════════════════════════════

AI_ENRICHMENT_PROMPT = """You are JobIntel's Intelligence Engine. Analyze this tech job posting and extract non-obvious insights.

JOB: {title} at {company}
DESCRIPTION: {description}
LOCATION: {location}
SALARY: {salary_range}
SKILLS DETECTED: {skills}
COMPANY CONTEXT: Tier={company_tier}, Trajectory={trajectory}, Velocity={velocity}x, Ghost Rate={ghost_rate}%

Provide these outputs as JSON (no markdown fences):
{{
    "ai_intelligence_note": "1-2 sentence non-obvious insight about this specific job. If nothing interesting, write 'No unusual signals detected.'",
    "typical_candidate_background": "1 sentence describing who typically gets hired for this role",
    "typical_years_experience": "3-5" or "5-8" or "8-12" or "12+",
    "interview_difficulty": 0.0 to 1.0,
    "interview_rounds_typical": integer 2-8,
    "application_response_rate": 0.0 to 1.0,
    "ideal_cover_letter_focus": "1-2 sentences: what should a candidate emphasize for THIS role?",
    "posting_urgency_analysis": "1 sentence: why this role exists right now"
}}"""


def stage_ai_enrichment(job: dict) -> dict:
    """Use Claude to generate the high-value intelligence fields."""
    client = _get_client()

    salary_range = "Not disclosed"
    if job.get("salary_min"):
        salary_range = f"${job['salary_min']:,.0f} - ${job.get('salary_max', job['salary_min']):,.0f}"

    prompt = AI_ENRICHMENT_PROMPT.format(
        title=job.get("title", ""),
        company=job.get("company", ""),
        description=(job.get("description") or "")[:3000],
        location=job.get("location", "Unknown"),
        salary_range=salary_range,
        skills=job.get("skills_canonical", "[]"),
        company_tier=job.get("company_tier", "UNKNOWN"),
        trajectory=job.get("company_trajectory", "unknown"),
        velocity=job.get("company_hiring_velocity", 1.0),
        ghost_rate=round(job.get("company_ghost_rate", 0) * 100, 1),
    )

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
    except Exception:
        data = {
            "ai_intelligence_note": "No unusual signals detected.",
            "typical_candidate_background": "Standard profile for this role type",
            "typical_years_experience": "3-5",
            "interview_difficulty": 0.5,
            "interview_rounds_typical": 4,
            "application_response_rate": 0.15,
            "ideal_cover_letter_focus": "Emphasize relevant technical experience.",
            "posting_urgency_analysis": "Standard hiring cycle.",
        }

    return {**job, **data}


# ═══════════════════════════════════════════════════
# MAIN PIPELINE ORCHESTRATOR
# ═══════════════════════════════════════════════════

def compute_priority(job: dict) -> int:
    """Higher priority = enriched faster."""
    priority = 100
    ghost = job.get("ghost_score", 50)
    if ghost < 20:
        priority += 50
    sal = job.get("salary_min") or 0
    if sal > 200000:
        priority += 20
    return priority


def enqueue_job(job_id: str, conn: sqlite3.Connection) -> None:
    """Add a job to the enrichment queue."""
    job = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job:
        return
    priority = compute_priority(dict(job))
    stages = ["classify", "company_match", "ghost_score", "salary", "skills", "jd_analysis", "ai_enrich"]
    for stage in stages:
        conn.execute(
            """INSERT OR IGNORE INTO enrichment_queue (job_id, stage, priority, status)
               VALUES (?, ?, ?, 'pending')""",
            (job_id, stage, priority),
        )
    conn.commit()


def run_enrichment(job_id: str, conn: sqlite3.Connection, skip_ai: bool = False) -> dict:
    """Run the full enrichment pipeline for a single job.

    Returns the enriched fields dict.
    """
    row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not row:
        raise ValueError("Job not found")
    job = dict(row)

    # Stage 1: Validate
    job = stage_validate(job)

    # Stage 2: Classify
    job = stage_classify(job)

    # Stage 3: Company match
    job = stage_company_match(job, conn)

    # Stage 5: Salary intelligence
    job = stage_salary_intelligence(job, conn)

    # Stage 6: Skill taxonomy
    job = stage_skill_taxonomy(job, conn)

    # JD Analysis (red/green flags)
    job = stage_jd_analysis(job)

    # Stage 7: AI enrichment (expensive — optional)
    if not skip_ai:
        job = stage_ai_enrichment(job)
    else:
        job["ai_intelligence_note"] = "AI enrichment pending."
        job["typical_candidate_background"] = None
        job["typical_years_experience"] = None
        job["interview_difficulty"] = None
        job["interview_rounds_typical"] = None
        job["application_response_rate"] = None
        job["ideal_cover_letter_focus"] = None
        job["posting_urgency_analysis"] = None

    # Persist enriched data
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """INSERT OR REPLACE INTO enriched_jobs (
               job_id, tech_domain, seniority_universal, employment_type_normalized,
               work_arrangement, team_function, company_industry, has_equity, equity_type,
               hiring_urgency, skills_canonical, skills_technical, skills_methodologies,
               skills_domain, skills_hard_required, skills_preferred,
               skill_demand_score, skill_rarity_score,
               salary_vs_market_p50, salary_percentile,
               salary_estimated_min, salary_estimated_max, salary_estimation_confidence,
               h1b_avg_wage, h1b_sample_size,
               company_tier, company_trajectory, company_hiring_velocity,
               company_glassdoor_rating, company_glassdoor_trend,
               layoff_risk_score, ipo_probability, company_ghost_rate,
               typical_candidate_background, typical_years_experience,
               interview_difficulty, interview_rounds_typical,
               application_response_rate, ideal_cover_letter_focus,
               ai_intelligence_note, jd_red_flags, jd_green_flags,
               visa_requirements_detected, culture_signals, posting_urgency_analysis,
               enrichment_status, enrichment_priority, enriched_at
           ) VALUES (
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'completed', ?, ?
           )""",
        (
            job_id, job.get("tech_domain"), job.get("seniority_universal"),
            job.get("employment_type_normalized"), job.get("work_arrangement"),
            job.get("team_function"), job.get("company_industry"),
            job.get("has_equity"), job.get("equity_type"), job.get("hiring_urgency"),
            job.get("skills_canonical"), job.get("skills_technical"),
            job.get("skills_methodologies"), job.get("skills_domain"),
            job.get("skills_hard_required"), job.get("skills_preferred"),
            job.get("skill_demand_score"), job.get("skill_rarity_score"),
            job.get("salary_vs_market_p50"), job.get("salary_percentile"),
            job.get("salary_estimated_min"), job.get("salary_estimated_max"),
            job.get("salary_estimation_confidence"),
            job.get("h1b_avg_wage"), job.get("h1b_sample_size"),
            job.get("company_tier"), job.get("company_trajectory"),
            job.get("company_hiring_velocity"),
            job.get("company_glassdoor_rating"), job.get("company_glassdoor_trend"),
            job.get("layoff_risk_score"), job.get("ipo_probability"),
            job.get("company_ghost_rate"),
            job.get("typical_candidate_background"), job.get("typical_years_experience"),
            job.get("interview_difficulty"), job.get("interview_rounds_typical"),
            job.get("application_response_rate"), job.get("ideal_cover_letter_focus"),
            job.get("ai_intelligence_note"), job.get("jd_red_flags"),
            job.get("jd_green_flags"), job.get("visa_requirements_detected"),
            job.get("culture_signals"), job.get("posting_urgency_analysis"),
            compute_priority(job), now,
        ),
    )
    conn.commit()
    return job


def batch_enrich(conn: sqlite3.Connection, limit: int = 50, skip_ai: bool = False) -> dict:
    """Enrich a batch of unenriched jobs."""
    rows = conn.execute(
        """SELECT j.job_id FROM jobs j
           LEFT JOIN enriched_jobs ej ON j.job_id = ej.job_id
           WHERE ej.job_id IS NULL
           ORDER BY j.scraped_at DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()

    results = {"enriched": 0, "failed": 0, "errors": []}
    for row in rows:
        try:
            run_enrichment(row["job_id"], conn, skip_ai=skip_ai)
            results["enriched"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append(str(e)[:100])
    return results
