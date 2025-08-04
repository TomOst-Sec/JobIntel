"""IPO signal detection — identifies pre-IPO hiring patterns via tiered signals."""
import json
import sqlite3

import anthropic

from api.config import get_settings


# Tiered signal system — different weights for different signal strengths
CRITICAL_SIGNALS = [
    "sec", "sox", "investor relations", "financial reporting",
    "public company", "securities", "10-k", "10-q", "s-1",
]
STRONG_SIGNALS = [
    "compliance", "regulatory", "general counsel", "controller",
    "corporate counsel", "governance", "treasury", "internal audit",
]
SUPPORTING_SIGNALS = [
    "board", "audit", "risk management", "corporate finance",
    "corporate communications", "corporate development",
]

POINTS_CRITICAL = 15
POINTS_STRONG = 8
POINTS_SUPPORTING = 3
CLUSTER_BONUS = 20  # 3+ critical signals in 30 days
EXECUTIVE_BURST_BONUS = 20  # 3+ C-level/VP roles in 30 days


def detect_ipo_signals(company: str, db: sqlite3.Connection) -> dict:
    """Analyze a company's hiring patterns for pre-IPO indicators using tiered signal system."""
    # Search for IPO-related roles by tier
    critical_roles = []
    strong_roles = []
    supporting_roles = []

    for pattern in CRITICAL_SIGNALS:
        rows = db.execute("""
            SELECT title, search_category, posted_at FROM jobs
            WHERE company LIKE ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
            AND posted_at >= datetime('now', '-90 days')
        """, (f"%{company}%", f"%{pattern}%", f"%{pattern}%")).fetchall()
        for r in rows:
            critical_roles.append({**dict(r), "matched_pattern": pattern, "tier": "critical"})

    for pattern in STRONG_SIGNALS:
        rows = db.execute("""
            SELECT title, search_category, posted_at FROM jobs
            WHERE company LIKE ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
            AND posted_at >= datetime('now', '-90 days')
        """, (f"%{company}%", f"%{pattern}%", f"%{pattern}%")).fetchall()
        for r in rows:
            strong_roles.append({**dict(r), "matched_pattern": pattern, "tier": "strong"})

    for pattern in SUPPORTING_SIGNALS:
        rows = db.execute("""
            SELECT title, search_category, posted_at FROM jobs
            WHERE company LIKE ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
            AND posted_at >= datetime('now', '-90 days')
        """, (f"%{company}%", f"%{pattern}%", f"%{pattern}%")).fetchall()
        for r in rows:
            supporting_roles.append({**dict(r), "matched_pattern": pattern, "tier": "supporting"})

    all_ipo_roles = critical_roles + strong_roles + supporting_roles

    # Deduplicate by title (same role may match multiple patterns)
    seen_titles = set()
    unique_roles = []
    for r in all_ipo_roles:
        if r["title"] not in seen_titles:
            seen_titles.add(r["title"])
            unique_roles.append(r)

    # Hiring velocity (scaling indicator)
    total_recent = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-30 days')
    """, (f"%{company}%",)).fetchone()[0]

    total_older = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-90 days')
        AND posted_at < datetime('now', '-30 days')
    """, (f"%{company}%",)).fetchone()[0]

    # Category diversity (scaling across many functions)
    category_count = db.execute("""
        SELECT COUNT(DISTINCT search_category) FROM jobs
        WHERE company LIKE ? AND posted_at >= datetime('now', '-30 days')
    """, (f"%{company}%",)).fetchone()[0]

    # Executive hiring burst (C-level/VP roles)
    exec_roles = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-30 days')
        AND (LOWER(title) LIKE '%chief%' OR LOWER(title) LIKE '%cto%'
             OR LOWER(title) LIKE '%cfo%' OR LOWER(title) LIKE '%coo%'
             OR LOWER(title) LIKE '%cmo%' OR LOWER(title) LIKE '%cro%'
             OR LOWER(title) LIKE '%vp %' OR LOWER(title) LIKE '%vice president%'
             OR LOWER(title) LIKE '%head of%' OR LOWER(title) LIKE '%svp%')
    """, (f"%{company}%",)).fetchone()[0]

    # Compute score using tiered system
    signals = []
    score = 0.0

    # Critical signal points
    unique_critical = len({r["title"] for r in critical_roles})
    if unique_critical > 0:
        points = unique_critical * POINTS_CRITICAL
        score += points
        signals.append({
            "signal": "critical_ipo_roles",
            "severity": "high",
            "detail": f"{unique_critical} critical IPO-related roles (SEC, SOX, investor relations, etc.)",
            "points": points,
            "roles": [r["title"] for r in critical_roles[:5]],
        })

    # Cluster bonus: 3+ critical signals in 30 days
    critical_in_30d = [r for r in critical_roles if _is_within_days(r.get("posted_at"), 30)]
    if len({r["title"] for r in critical_in_30d}) >= 3:
        score += CLUSTER_BONUS
        signals.append({
            "signal": "critical_signal_cluster",
            "severity": "high",
            "detail": f"3+ critical IPO roles posted within 30 days — strong pre-IPO indicator",
            "points": CLUSTER_BONUS,
        })

    # Strong signal points
    unique_strong = len({r["title"] for r in strong_roles})
    if unique_strong > 0:
        points = unique_strong * POINTS_STRONG
        score += points
        signals.append({
            "signal": "strong_ipo_roles",
            "severity": "medium",
            "detail": f"{unique_strong} strong IPO-indicator roles (compliance, regulatory, counsel, etc.)",
            "points": points,
            "roles": [r["title"] for r in strong_roles[:5]],
        })

    # Supporting signal points
    unique_supporting = len({r["title"] for r in supporting_roles})
    if unique_supporting > 0:
        points = unique_supporting * POINTS_SUPPORTING
        score += points
        signals.append({
            "signal": "supporting_ipo_roles",
            "severity": "low",
            "detail": f"{unique_supporting} supporting IPO-indicator roles (audit, risk, corporate dev, etc.)",
            "points": points,
        })

    # Rapid scaling
    if total_older > 0:
        growth = (total_recent - total_older / 2) / (total_older / 2) if total_older > 0 else 0
        if growth > 0.5:
            score += 15
            signals.append({
                "signal": "rapid_scaling",
                "severity": "medium",
                "detail": f"Hiring grew {growth*100:.0f}% in last 30 days vs prior period",
                "points": 15,
            })

    # Broad hiring across categories
    if category_count >= 5:
        score += 10
        signals.append({
            "signal": "broad_hiring",
            "severity": "medium",
            "detail": f"Hiring across {category_count} distinct categories — suggests broad scaling",
            "points": 10,
        })

    # Executive hiring burst
    if exec_roles >= 3:
        score += EXECUTIVE_BURST_BONUS
        signals.append({
            "signal": "executive_hiring_burst",
            "severity": "high",
            "detail": f"{exec_roles} C-level/VP/Head-of roles in 30 days — executive buildout for public readiness",
            "points": EXECUTIVE_BURST_BONUS,
        })

    # Normalize score to probability (0-1 range, capped at 0.95)
    # Score of 100 points = ~0.85 probability
    probability = min(round(score / 120, 2), 0.95)

    # AI assessment with timeline
    ai_assessment = _ai_ipo_assessment(company, signals, unique_roles, probability)

    result = {
        "company": company,
        "ipo_probability": probability,
        "raw_score": round(score, 1),
        "confidence": "high" if unique_critical >= 3 else "medium" if unique_critical >= 1 or unique_strong >= 2 else "low",
        "signals": signals,
        "ipo_related_roles": [
            {"title": r["title"], "pattern": r["matched_pattern"], "tier": r["tier"]}
            for r in unique_roles[:10]
        ],
        "signal_breakdown": {
            "critical_count": unique_critical,
            "strong_count": unique_strong,
            "supporting_count": unique_supporting,
        },
        "hiring_velocity": {
            "last_30d": total_recent,
            "prior_60d": total_older,
        },
        "category_diversity": category_count,
        "executive_roles_30d": exec_roles,
        "ai_assessment": ai_assessment,
    }

    # Cache
    db.execute("""
        INSERT OR REPLACE INTO company_intel_cache (company, intel_data, ipo_probability, trajectory, computed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
    """, (company, json.dumps(result, default=str), probability,
          "scaling" if probability >= 0.3 else "stable"))
    db.commit()

    # Log as market signal if significant
    if probability >= 0.2:
        db.execute("""
            INSERT INTO market_signals (signal_type, company, severity, title, description, data_points)
            VALUES ('ipo_signal', ?, ?, ?, ?, ?)
        """, (
            company,
            "high" if probability >= 0.4 else "medium",
            f"Pre-IPO signals detected: {company}",
            ai_assessment or f"IPO probability: {probability*100:.0f}%",
            json.dumps({"probability": probability, "signals": signals}, default=str),
        ))
        db.commit()

    return result


def scan_ipo_candidates(db: sqlite3.Connection, min_postings: int = 10) -> list[dict]:
    """Scan all active companies for IPO signals."""
    companies = db.execute("""
        SELECT company, COUNT(*) as total FROM jobs
        WHERE posted_at >= datetime('now', '-90 days')
        GROUP BY company HAVING total >= ?
        ORDER BY total DESC LIMIT 30
    """, (min_postings,)).fetchall()

    results = []
    for row in companies:
        try:
            result = detect_ipo_signals(row["company"], db)
            if result["ipo_probability"] > 0:
                results.append(result)
        except Exception:
            continue

    results.sort(key=lambda x: x["ipo_probability"], reverse=True)
    return results


def _is_within_days(posted_at: str | None, days: int) -> bool:
    """Check if a posted_at timestamp is within N days of now."""
    if not posted_at:
        return False
    try:
        from datetime import datetime
        posted = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        now = datetime.now(posted.tzinfo) if posted.tzinfo else datetime.now()
        return (now - posted).days <= days
    except (ValueError, TypeError):
        return False


def _ai_ipo_assessment(company: str, signals: list, ipo_roles: list, probability: float) -> str:
    """Get AI narrative assessment of IPO likelihood with timeline estimate."""
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
                "content": f"""You are a pre-IPO pattern analyst. Based on this hiring data for {company}, provide a structured IPO readiness assessment.

Current IPO probability score: {probability*100:.0f}%
Signals detected: {json.dumps(signals, default=str)}
IPO-related roles found: {json.dumps([r['title'] for r in ipo_roles[:8]])}

Provide your analysis in this format:
1. ASSESSMENT: Is this company showing genuine pre-IPO patterns or is this coincidental? (2-3 sentences)
2. TIMELINE: Based on these patterns, estimate how far out a potential IPO might be (6mo, 12mo, 18mo+, or "no clear timeline"). Compare to known pre-IPO patterns.
3. KEY INDICATORS: What are the 2-3 strongest signals, and what 1-2 signals are missing that would increase confidence?
4. CONFIDENCE: Rate your confidence (high/medium/low) with a brief justification.

Be specific about what the hiring patterns suggest. If signals are weak, say so clearly.""",
            }],
        )
        return response.content[0].text.strip()
    except Exception:
        return ""
