"""Layoff risk detection — analyzes hiring patterns to predict company instability."""
import json
import sqlite3

import anthropic

from api.config import get_settings


def analyze_layoff_risk(company: str, db: sqlite3.Connection) -> dict:
    """Generate a layoff risk score (0-100) for a company based on hiring patterns."""
    # Gather hiring data
    weekly_postings = db.execute("""
        SELECT strftime('%Y-W%W', posted_at) as week,
            COUNT(*) as postings,
            COUNT(DISTINCT search_category) as categories
        FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-90 days')
        GROUP BY week ORDER BY week
    """, (f"%{company}%",)).fetchall()
    weekly = [dict(r) for r in weekly_postings]

    total_ever = db.execute(
        "SELECT COUNT(*) FROM jobs WHERE company LIKE ?", (f"%{company}%",)
    ).fetchone()[0]

    recent_count = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-14 days')
    """, (f"%{company}%",)).fetchone()[0]

    older_count = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-60 days')
        AND posted_at < datetime('now', '-14 days')
    """, (f"%{company}%",)).fetchone()[0]

    # Category breadth change
    recent_categories = db.execute("""
        SELECT COUNT(DISTINCT search_category) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-14 days')
    """, (f"%{company}%",)).fetchone()[0]

    older_categories = db.execute("""
        SELECT COUNT(DISTINCT search_category) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-60 days')
        AND posted_at < datetime('now', '-14 days')
    """, (f"%{company}%",)).fetchone()[0]

    # Compute signals
    signals = []
    risk_score = 0.0

    # Signal 1: Hiring velocity drop
    if older_count > 0:
        weekly_rate_old = older_count / 6.5  # ~46 days ~ 6.5 weeks
        weekly_rate_new = recent_count / 2.0  # 14 days = 2 weeks
        velocity_change = (weekly_rate_new - weekly_rate_old) / weekly_rate_old if weekly_rate_old > 0 else 0

        if velocity_change < -0.5:
            signals.append({
                "signal": "hiring_velocity_drop",
                "severity": "high",
                "detail": f"Hiring dropped {abs(velocity_change)*100:.0f}% in last 2 weeks vs prior 6 weeks",
            })
            risk_score += 30

    # Signal 2: Category contraction
    if older_categories > 3 and recent_categories <= 1:
        signals.append({
            "signal": "category_contraction",
            "severity": "high",
            "detail": f"Hiring categories dropped from {older_categories} to {recent_categories}",
        })
        risk_score += 20

    # Signal 3: Sudden silence (had postings, now nothing)
    if total_ever > 10 and recent_count == 0:
        signals.append({
            "signal": "hiring_freeze",
            "severity": "critical",
            "detail": f"Zero postings in last 14 days despite {total_ever} historical postings",
        })
        risk_score += 40

    # Signal 4: Ghost job inflation
    ghost_count = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND ghost_score >= 50
    """, (f"%{company}%",)).fetchone()[0]

    if ghost_count > 3:
        signals.append({
            "signal": "ghost_job_inflation",
            "severity": "medium",
            "detail": f"{ghost_count} postings flagged as likely ghost jobs",
        })
        risk_score += 15

    # Signal 5: Department elimination pattern
    dept_categories_recent = db.execute("""
        SELECT DISTINCT search_category FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-14 days')
    """, (f"%{company}%",)).fetchall()
    dept_categories_older = db.execute("""
        SELECT DISTINCT search_category FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-60 days')
        AND posted_at < datetime('now', '-14 days')
    """, (f"%{company}%",)).fetchall()

    recent_depts = {r[0] for r in dept_categories_recent if r[0]}
    older_depts = {r[0] for r in dept_categories_older if r[0]}
    eliminated_depts = older_depts - recent_depts

    if len(eliminated_depts) >= 2:
        signals.append({
            "signal": "department_elimination",
            "severity": "high",
            "detail": f"Stopped hiring in: {', '.join(sorted(eliminated_depts))}",
        })
        risk_score += 25

    # Signal 6: Seniority shift (replacing senior with junior = cost cutting)
    senior_recent = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-14 days')
        AND (LOWER(title) LIKE '%senior%' OR LOWER(title) LIKE '%lead%' OR LOWER(title) LIKE '%director%'
             OR LOWER(title) LIKE '%principal%' OR LOWER(title) LIKE '%staff%')
    """, (f"%{company}%",)).fetchone()[0]

    junior_recent = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-14 days')
        AND (LOWER(title) LIKE '%junior%' OR LOWER(title) LIKE '%intern%' OR LOWER(title) LIKE '%associate%'
             OR LOWER(title) LIKE '%entry%' OR LOWER(title) LIKE '%graduate%')
    """, (f"%{company}%",)).fetchone()[0]

    senior_older = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-60 days')
        AND posted_at < datetime('now', '-14 days')
        AND (LOWER(title) LIKE '%senior%' OR LOWER(title) LIKE '%lead%' OR LOWER(title) LIKE '%director%'
             OR LOWER(title) LIKE '%principal%' OR LOWER(title) LIKE '%staff%')
    """, (f"%{company}%",)).fetchone()[0]

    junior_older = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-60 days')
        AND posted_at < datetime('now', '-14 days')
        AND (LOWER(title) LIKE '%junior%' OR LOWER(title) LIKE '%intern%' OR LOWER(title) LIKE '%associate%'
             OR LOWER(title) LIKE '%entry%' OR LOWER(title) LIKE '%graduate%')
    """, (f"%{company}%",)).fetchone()[0]

    total_older_seniority = senior_older + junior_older
    total_recent_seniority = senior_recent + junior_recent

    if total_older_seniority > 3 and total_recent_seniority > 3:
        old_senior_ratio = senior_older / total_older_seniority
        new_senior_ratio = senior_recent / total_recent_seniority
        if old_senior_ratio > 0.5 and new_senior_ratio < 0.3:
            signals.append({
                "signal": "seniority_downshift",
                "severity": "medium",
                "detail": f"Senior role ratio dropped from {old_senior_ratio*100:.0f}% to {new_senior_ratio*100:.0f}% — possible cost cutting",
            })
            risk_score += 15

    # Signal 7: Role repost churn (posting same role repeatedly = can't fill or ghost)
    repost_churn = db.execute("""
        SELECT COUNT(*) FROM (
            SELECT company, title, COUNT(*) as cnt
            FROM jobs WHERE company LIKE ?
            AND posted_at >= datetime('now', '-60 days')
            GROUP BY company, title
            HAVING cnt >= 3
        )
    """, (f"%{company}%",)).fetchone()[0]

    if repost_churn > 5:
        signals.append({
            "signal": "role_repost_churn",
            "severity": "medium",
            "detail": f"{repost_churn} roles posted 3+ times in 60 days — can't fill or ghost pattern",
        })
        risk_score += 15
    elif repost_churn > 2:
        signals.append({
            "signal": "role_repost_churn",
            "severity": "low",
            "detail": f"{repost_churn} roles posted 3+ times in 60 days",
        })
        risk_score += 8

    risk_score = min(round(risk_score, 1), 100.0)

    # AI assessment
    ai_assessment = _ai_layoff_assessment(company, weekly, signals)

    result = {
        "company": company,
        "risk_score": risk_score,
        "risk_level": "critical" if risk_score >= 70 else "high" if risk_score >= 50 else "medium" if risk_score >= 25 else "low",
        "signals": signals,
        "weekly_trend": weekly,
        "total_historical_postings": total_ever,
        "recent_14d_postings": recent_count,
        "ai_assessment": ai_assessment,
    }

    # Cache result
    db.execute("""
        INSERT OR REPLACE INTO company_intel_cache (company, intel_data, layoff_risk_score, trajectory, computed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
    """, (company, json.dumps(result, default=str), risk_score,
          "contracting" if risk_score >= 50 else "stable"))
    db.commit()

    return result


def scan_layoff_risks(db: sqlite3.Connection, min_postings: int = 5) -> list[dict]:
    """Scan all companies with enough data for layoff risk signals."""
    companies = db.execute("""
        SELECT company, COUNT(*) as total FROM jobs
        GROUP BY company HAVING total >= ?
        ORDER BY total DESC LIMIT 50
    """, (min_postings,)).fetchall()

    results = []
    for row in companies:
        try:
            result = analyze_layoff_risk(row["company"], db)
            if result["risk_score"] > 0:
                results.append(result)
        except Exception:
            continue

    results.sort(key=lambda x: x["risk_score"], reverse=True)

    # Log as market signals
    for r in results:
        if r["risk_score"] >= 25:
            db.execute("""
                INSERT INTO market_signals (signal_type, company, severity, title, description, data_points)
                VALUES ('layoff_risk', ?, ?, ?, ?, ?)
            """, (
                r["company"], r["risk_level"],
                f"Layoff risk detected: {r['company']}",
                r.get("ai_assessment", f"Risk score: {r['risk_score']}"),
                json.dumps({"risk_score": r["risk_score"], "signals": r["signals"]}, default=str),
            ))
    db.commit()

    return results


def _ai_layoff_assessment(company: str, weekly_trend: list, signals: list) -> str:
    """Get AI narrative assessment of layoff risk."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return ""

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": f"""You are a corporate intelligence analyst specializing in workforce stability. Analyze this hiring data for {company} and provide a structured assessment.

Weekly hiring trend (last 90 days): {json.dumps(weekly_trend)}
Detected signals: {json.dumps(signals, default=str)}

Provide your analysis in this exact format:
1. STORY: What story does this hiring data tell? Is this company in trouble, restructuring, or healthy? (2-3 sentences)
2. DEPARTMENT RISK: Which department or function appears most at risk based on the data? (1 sentence)
3. PREDICTION: What's most likely to happen in the next 30-60 days? (1 sentence)
4. CONFIDENCE: How confident are you in this assessment? (high/medium/low with brief justification)

Be direct and actionable. If signals are concerning, say so clearly. If data is insufficient, say what's missing.""",
            }],
        )
        return response.content[0].text.strip()
    except Exception:
        return ""
