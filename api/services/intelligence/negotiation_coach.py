"""Negotiation coach — AI-powered salary negotiation assistant using real market data."""
import json
import sqlite3

import anthropic

from api.config import get_settings


NEGOTIATION_SYSTEM_PROMPT = """You are the world's best salary negotiation coach — part psychologist, part data analyst, part hostage negotiator.

Your toolkit:
- **Anchoring**: Set aggressive but defensible first numbers
- **BATNA Analysis**: Help the candidate understand their best alternative to negotiated agreement
- **Package Decomposition**: Break total comp into negotiable components (base, equity, bonus, signing, PTO, remote, title)
- **Psychological Framing**: Help the candidate project confidence and avoid common traps

RESPONSE STRUCTURE (use for every analysis):

1. **Offer Assessment** — Is this offer fair, low, or strong against market data? Grade it A-F.

2. **Recommended Counter** — A SPECIFIC dollar figure for base salary, plus equity/bonus targets. Every counter-offer MUST include a specific dollar figure. No vague "ask for more."

3. **Opening Script** — Word-for-word language the candidate can use to start the negotiation. This should be copy-paste ready.

4. **Objection Rebuttals** — Top 3 likely employer objections and exact responses:
   - "That's above our budget" → [specific rebuttal]
   - "We don't negotiate on base" → [specific rebuttal]
   - "The equity makes up for it" → [specific rebuttal]

5. **Walk-Away Number** — The minimum acceptable offer based on market reality. Below this, the candidate should decline.

6. **Full Comp Breakdown** — Target ranges for every component:
   - Base salary range
   - Equity/RSU target
   - Signing bonus target
   - Annual bonus target
   - Other levers (PTO, remote, title bump)

7. **Success Probability** — A percentage estimate of successfully negotiating to the recommended counter, with brief justification.

RULES:
- Use ONLY the real salary data provided to ground your advice
- Provide exact scripts the candidate can copy-paste verbatim
- Consider the full compensation picture (base, equity, bonus, benefits)
- Be honest if the offer is already fair — don't create false negotiation opportunities
- Account for company size, stage, and market when advising
- Calculate success probability as a percentage based on market position and leverage
- Be specific with dollar amounts — no vague ranges"""


def start_negotiation_session(
    user_id: int,
    job_title: str,
    company: str,
    offered_salary: float,
    offered_equity: str | None,
    location: str | None,
    db: sqlite3.Connection,
) -> dict:
    """Start a new negotiation coaching session with market context."""
    settings = get_settings()

    # Gather market data
    salary_data = db.execute("""
        SELECT search_category, market_id,
            COUNT(*) as sample_size,
            ROUND(AVG(salary_min), 0) as avg_min,
            ROUND(AVG(salary_max), 0) as avg_max,
            ROUND(MIN(salary_min), 0) as floor,
            ROUND(MAX(salary_max), 0) as ceiling
        FROM jobs
        WHERE (title LIKE ? OR search_category LIKE ?)
        AND salary_min > 0
        GROUP BY search_category, market_id
    """, (f"%{job_title}%", f"%{job_title}%")).fetchall()

    company_data = db.execute("""
        SELECT COUNT(*) as total_postings,
            COUNT(DISTINCT search_category) as hiring_breadth,
            ROUND(AVG(CASE WHEN salary_min > 0 THEN salary_min END), 0) as company_avg_min,
            ROUND(AVG(CASE WHEN salary_max > 0 THEN salary_max END), 0) as company_avg_max
        FROM jobs WHERE company LIKE ?
    """, (f"%{company}%",)).fetchone()

    # Compute leverage and market position
    salary_list = [dict(r) for r in salary_data]
    company_info = dict(company_data) if company_data else {}

    # Calculate where the offer sits in the market
    all_maxes = [r["avg_max"] for r in salary_list if r.get("avg_max")]
    all_mins = [r["avg_min"] for r in salary_list if r.get("avg_min")]
    market_median = (sum(all_maxes) / len(all_maxes) + sum(all_mins) / len(all_mins)) / 2 if all_maxes and all_mins else offered_salary
    market_ceiling = max(all_maxes) if all_maxes else offered_salary * 1.3

    # Leverage score calculation (0-100)
    leverage_components = {}
    leverage_score = 50  # baseline

    # Market position: is offer below median?
    if market_median > 0 and offered_salary < market_median:
        gap_pct = (market_median - offered_salary) / market_median * 100
        leverage_components["below_market"] = min(gap_pct, 25)
        leverage_score += leverage_components["below_market"]

    # Company hiring urgency: many open roles = more leverage
    total_postings = company_info.get("total_postings", 0)
    if total_postings >= 20:
        leverage_components["high_hiring_volume"] = 15
        leverage_score += 15
    elif total_postings >= 10:
        leverage_components["moderate_hiring_volume"] = 8
        leverage_score += 8

    # Sample size: more data = more confidence
    total_samples = sum(r.get("sample_size", 0) for r in salary_list)
    if total_samples >= 50:
        leverage_components["strong_market_data"] = 10
        leverage_score += 10

    leverage_score = min(round(leverage_score, 1), 100)

    # Success probability estimate
    success_probability = 65  # baseline
    if offered_salary < market_median * 0.9:
        success_probability += 15  # clearly below market
    if total_postings >= 10:
        success_probability += 10  # company is hiring aggressively
    if total_samples < 10:
        success_probability -= 10  # limited data
    success_probability = max(20, min(success_probability, 95))

    job_context = {
        "job_title": job_title,
        "company": company,
        "offered_salary": offered_salary,
        "offered_equity": offered_equity,
        "location": location,
        "market_salary_data": salary_list,
        "company_hiring_data": company_info,
        "leverage_score": leverage_score,
        "leverage_components": leverage_components,
        "success_probability": success_probability,
        "market_median": market_median,
        "market_ceiling": market_ceiling,
    }

    # Get initial AI analysis
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    initial_analysis = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2500,
        system=NEGOTIATION_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"""A candidate received this offer and needs negotiation coaching.

OFFER DETAILS:
- Role: {job_title}
- Company: {company}
- Offered Base Salary: ${offered_salary:,.0f}
- Equity: {offered_equity or 'Not specified'}
- Location: {location or 'Not specified'}

REAL MARKET DATA (from JobIntel database):
{json.dumps(salary_list, indent=2, default=str)}

COMPANY HIRING PROFILE:
{json.dumps(company_info, indent=2, default=str)}

MARKET POSITION:
- Market median salary: ${market_median:,.0f}
- Market ceiling: ${market_ceiling:,.0f}
- Offer vs market median: {((offered_salary - market_median) / market_median * 100):+.1f}%
- Leverage score: {leverage_score}/100
- Estimated success probability: {success_probability}%

Provide your FULL analysis using the 7-part structure from your instructions. Include specific dollar amounts, word-for-word scripts, and a success probability percentage.""",
        }],
    )

    initial_message = initial_analysis.content[0].text

    messages = [
        {"role": "assistant", "content": initial_message},
    ]

    # Create session
    cursor = db.execute("""
        INSERT INTO negotiation_sessions (user_id, job_context, messages)
        VALUES (?, ?, ?)
    """, (user_id, json.dumps(job_context, default=str), json.dumps(messages)))
    db.commit()

    session_id = cursor.lastrowid

    return {
        "session_id": session_id,
        "initial_analysis": initial_message,
        "market_context": {
            "salary_samples": len(salary_data),
            "company_postings": company_info.get("total_postings", 0),
        },
        "leverage_score": leverage_score,
        "leverage_components": leverage_components,
        "success_probability": success_probability,
    }


def continue_negotiation(
    session_id: int,
    user_id: int,
    user_message: str,
    db: sqlite3.Connection,
) -> dict:
    """Continue a negotiation coaching conversation."""
    settings = get_settings()

    session = db.execute(
        "SELECT * FROM negotiation_sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if session is None:
        raise ValueError("Session not found")

    session = dict(session)
    messages = json.loads(session["messages"])
    job_context = json.loads(session["job_context"]) if session["job_context"] else {}

    messages.append({"role": "user", "content": user_message})

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Build conversation with market context
    api_messages = []
    for msg in messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    # Add market data reminder in the latest user message
    api_messages[-1]["content"] += f"\n\n[Market context: {json.dumps(job_context.get('market_salary_data', [])[:5], default=str)}]"

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        system=NEGOTIATION_SYSTEM_PROMPT,
        messages=api_messages,
    )

    assistant_message = response.content[0].text
    messages.append({"role": "assistant", "content": assistant_message})

    # Update session
    db.execute("""
        UPDATE negotiation_sessions SET messages = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (json.dumps(messages), session_id))
    db.commit()

    return {
        "session_id": session_id,
        "response": assistant_message,
        "message_count": len(messages),
    }


def get_negotiation_sessions(user_id: int, db: sqlite3.Connection) -> list[dict]:
    """List all negotiation sessions for a user."""
    rows = db.execute("""
        SELECT id, job_context, created_at, updated_at FROM negotiation_sessions
        WHERE user_id = ? ORDER BY updated_at DESC
    """, (user_id,)).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        ctx = json.loads(d["job_context"]) if d["job_context"] else {}
        results.append({
            "id": d["id"],
            "job_title": ctx.get("job_title", "Unknown"),
            "company": ctx.get("company", "Unknown"),
            "offered_salary": ctx.get("offered_salary"),
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
        })
    return results


def get_session_detail(session_id: int, user_id: int, db: sqlite3.Connection) -> dict:
    """Get full session detail including all messages."""
    row = db.execute(
        "SELECT * FROM negotiation_sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if row is None:
        raise ValueError("Session not found")

    d = dict(row)
    d["messages"] = json.loads(d["messages"]) if d["messages"] else []
    d["job_context"] = json.loads(d["job_context"]) if d["job_context"] else {}
    return d
