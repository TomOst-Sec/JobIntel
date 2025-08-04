"""CV upload, parsing, and Claude-powered analysis."""
import json
import os
import sqlite3

from api.config import get_settings


def save_upload(user_id: int, filename: str, file_bytes: bytes, db: sqlite3.Connection) -> dict:
    """Save uploaded file to disk and record in DB."""
    settings = get_settings()
    upload_dir = os.path.join(settings.upload_dir, str(user_id))
    os.makedirs(upload_dir, exist_ok=True)

    stored_path = os.path.join(upload_dir, filename)
    with open(stored_path, "wb") as f:
        f.write(file_bytes)

    # Parse text from PDF
    parsed_text = extract_text(stored_path)

    cursor = db.execute(
        "INSERT INTO cv_uploads (user_id, filename, stored_path, parsed_text, file_size) VALUES (?, ?, ?, ?, ?)",
        (user_id, filename, stored_path, parsed_text, len(file_bytes)),
    )
    db.commit()
    cv_id = cursor.lastrowid
    return dict(db.execute("SELECT * FROM cv_uploads WHERE id = ?", (cv_id,)).fetchone())


def extract_text(filepath: str) -> str:
    """Extract text from PDF using PyMuPDF."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(filepath)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text.strip()
    except Exception as e:
        return f"[Text extraction failed: {e}]"


def analyze_cv(cv_id: int, user_id: int, db: sqlite3.Connection) -> dict:
    """Run Claude analysis on a parsed CV — brutally honest career strategist."""
    settings = get_settings()

    cv = db.execute(
        "SELECT * FROM cv_uploads WHERE id = ? AND user_id = ?", (cv_id, user_id)
    ).fetchone()
    if cv is None:
        raise ValueError("CV not found")

    cv_text = dict(cv)["parsed_text"]
    if not cv_text or cv_text.startswith("[Text extraction failed"):
        raise ValueError("Could not extract text from CV")

    # Gather market context
    salary_data = db.execute("""
        SELECT search_category, market_id,
            ROUND(AVG(salary_min), 0) as avg_min,
            ROUND(AVG(salary_max), 0) as avg_max,
            COUNT(*) as job_count
        FROM jobs WHERE salary_min > 0
        GROUP BY search_category, market_id
        ORDER BY job_count DESC LIMIT 30
    """).fetchall()

    skill_demand = db.execute("""
        SELECT search_category, COUNT(*) as demand
        FROM jobs WHERE posted_at >= datetime('now', '-7 days')
        GROUP BY search_category ORDER BY demand DESC
    """).fetchall()

    scaling_companies = db.execute("""
        SELECT company, COUNT(*) as postings, GROUP_CONCAT(DISTINCT search_category) as categories
        FROM jobs WHERE posted_at >= datetime('now', '-14 days')
        GROUP BY company HAVING postings >= 5
        ORDER BY postings DESC LIMIT 20
    """).fetchall()

    market_context = json.dumps({
        "salary_data": [dict(r) for r in salary_data],
        "skill_demand": [dict(r) for r in skill_demand],
        "scaling_companies": [dict(r) for r in scaling_companies],
    }, default=str)

    import anthropic
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = f"""You are a brutally honest career strategist. No fluff, no ego-protection.
Rate this CV against REAL market data with unflinching honesty.

CV TEXT:
{cv_text[:5000]}

CURRENT MARKET DATA:
{market_context}

Analyze this CV and return a comprehensive assessment. Be specific, be honest, be actionable.

OUTPUT FORMAT (return ONLY valid JSON):
{{
    "market_position_score": 0-100,
    "honest_assessment": "2-paragraph no-BS assessment of where this person actually stands in the market. What's working, what's not, and why.",
    "critical_gaps": ["gap1 with specific fix", "gap2 with specific fix"],
    "skills_gap": ["skill1 they need to learn", "skill2"],
    "salary_estimate_min": number,
    "salary_estimate_max": number,
    "salary_percentile": "e.g. 65th percentile for your target role",
    "recommended_roles": [
        {{"role": "role title", "fit_score": 85, "why": "specific reason"}},
        {{"role": "role2", "fit_score": 72, "why": "specific reason"}}
    ],
    "opportunity_map": {{
        "best_markets": ["market1", "market2"],
        "target_companies": [
            {{"company": "name", "why": "specific reason", "urgency": "high/med/low"}}
        ],
        "timing": "explanation of current market timing for this candidate"
    }},
    "action_plan": [
        {{"priority": 1, "action": "specific action", "timeline": "1 week", "impact": "high"}},
        {{"priority": 2, "action": "specific action", "timeline": "2 weeks", "impact": "medium"}}
    ],
    "deal_breakers": ["specific things that will get this CV auto-rejected"],
    "ai_narrative": "comprehensive career strategy narrative — 3-4 paragraphs covering market position, strategy, and specific next moves"
}}

Return ONLY valid JSON. No markdown, no explanation outside the JSON."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    # Clean trailing ``` if present
    if text.endswith("```"):
        text = text[:-3].strip()

    try:
        analysis = json.loads(text)
    except json.JSONDecodeError:
        analysis = {
            "market_position_score": None,
            "honest_assessment": None,
            "critical_gaps": [],
            "skills_gap": [],
            "salary_estimate_min": None,
            "salary_estimate_max": None,
            "salary_percentile": None,
            "recommended_roles": [],
            "opportunity_map": {},
            "action_plan": [],
            "deal_breakers": [],
            "ai_narrative": text,
        }

    # Store analysis
    cursor = db.execute("""
        INSERT INTO cv_analyses
            (cv_id, user_id, market_position_score, skills_gap, salary_estimate_min,
             salary_estimate_max, recommended_roles, opportunity_map, ai_narrative,
             honest_assessment, critical_gaps, action_plan, deal_breakers)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        cv_id, user_id,
        analysis.get("market_position_score"),
        json.dumps(analysis.get("skills_gap", [])),
        analysis.get("salary_estimate_min"),
        analysis.get("salary_estimate_max"),
        json.dumps(analysis.get("recommended_roles", [])),
        json.dumps(analysis.get("opportunity_map", {})),
        analysis.get("ai_narrative", ""),
        analysis.get("honest_assessment", ""),
        json.dumps(analysis.get("critical_gaps", [])),
        json.dumps(analysis.get("action_plan", [])),
        json.dumps(analysis.get("deal_breakers", [])),
    ))
    db.commit()

    row = db.execute("SELECT * FROM cv_analyses WHERE id = ?", (cursor.lastrowid,)).fetchone()
    result = dict(row)
    # Parse JSON fields for response
    for field in ("skills_gap", "recommended_roles", "opportunity_map", "critical_gaps", "action_plan", "deal_breakers"):
        if result.get(field):
            try:
                result[field] = json.loads(result[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return result
