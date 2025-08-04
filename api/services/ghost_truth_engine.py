"""Ghost Truth Engine — 6-type ghost job classification system.

Goes beyond a simple score to categorize ghost jobs:
  TYPE 1: PASSIVE GHOST — posted and forgotten
  TYPE 2: INSURANCE GHOST — legal/HR compliance posting
  TYPE 3: TALENT PIPELINE GHOST — collecting resumes for future
  TYPE 4: NARRATIVE GHOST — headcount for investors
  TYPE 5: COMPETITIVE INTELLIGENCE GHOST — watching talent market
  TYPE 6: EVERGREEN GHOST — always hiring, never closes
"""
import json
import sqlite3
from datetime import datetime

import anthropic

from api.config import get_settings


def _get_client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


GHOST_TYPES = {
    "PASSIVE": {
        "label": "Passive Ghost",
        "description": "Posted and forgotten — hiring manager moved on",
        "risk": "medium",
        "candidate_advice": "Apply if interested, but don't invest heavy prep. Follow up after 2 weeks.",
    },
    "INSURANCE": {
        "label": "Insurance Ghost",
        "description": "Posted for legal/HR compliance, not genuine hiring intent",
        "risk": "high",
        "candidate_advice": "Very unlikely to result in an actual hire. Skip unless you have an internal referral.",
    },
    "PIPELINE": {
        "label": "Pipeline Ghost",
        "description": "Building a talent pool, may hire if exceptional candidate appears",
        "risk": "medium",
        "candidate_advice": "Worth applying if you're a strong match — they DO occasionally hire, but timelines are long.",
    },
    "NARRATIVE": {
        "label": "Narrative Ghost",
        "description": "Burst of postings for investor/market optics, not real headcount",
        "risk": "very_high",
        "candidate_advice": "Wait 30-60 days. If they actually hire, roles will reopen with real urgency.",
    },
    "COMPETITIVE": {
        "label": "Competitive Intelligence Ghost",
        "description": "Watching what talent is available, not actively hiring",
        "risk": "high",
        "candidate_advice": "This posting is for market research, not hiring. Save your time.",
    },
    "EVERGREEN": {
        "label": "Evergreen Ghost",
        "description": "Same role reposted for months/years — perpetual pipeline",
        "risk": "variable",
        "candidate_advice": "Occasional real hires happen, but most applicants are ignored. High effort for low probability.",
    },
}


def classify_ghost_type(job_id: str, conn: sqlite3.Connection) -> dict:
    """Classify a job into one of 6 ghost types with evidence."""
    job_row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job_row:
        raise ValueError("Job not found")
    job = dict(job_row)

    company = (job.get("company") or "").lower()
    ghost_score = job.get("ghost_score", 0)

    # If score is very low, it's probably real
    if ghost_score < 15:
        return {
            "ghost_type": None,
            "ghost_type_confidence": 0.95,
            "ghost_classification_evidence": json.dumps([
                {"signal": "low_ghost_score", "detail": f"Ghost score is only {ghost_score}%"}
            ]),
            "ghost_candidate_advice": "This job appears to be a genuine, active posting. Apply with confidence.",
            "verdict": "likely_real",
        }

    # Collect signals for classification
    signals = []
    type_scores = {t: 0.0 for t in GHOST_TYPES}

    # --- Repost analysis ---
    repost_count = job.get("repost_count", 1) or 1
    if repost_count >= 6:
        # Check how long ago the first posting was
        oldest = conn.execute(
            """SELECT MIN(scraped_at) as oldest FROM jobs
               WHERE LOWER(company) = ? AND LOWER(title) = ?""",
            (company, (job.get("title") or "").lower()),
        ).fetchone()
        if oldest and oldest["oldest"]:
            try:
                oldest_date = datetime.fromisoformat(oldest["oldest"])
                days_since = (datetime.utcnow() - oldest_date).days
                if days_since > 180:
                    type_scores["EVERGREEN"] += 0.4
                    signals.append({
                        "signal": "evergreen_repost",
                        "detail": f"Reposted {repost_count} times over {days_since} days",
                        "weight": 0.4,
                    })
            except (ValueError, TypeError):
                pass

    if 3 <= repost_count < 6:
        type_scores["PASSIVE"] += 0.2
        signals.append({
            "signal": "moderate_repost",
            "detail": f"Reposted {repost_count} times — may have been forgotten",
            "weight": 0.2,
        })

    # --- Velocity spike analysis (Narrative Ghost detection) ---
    recent_7d = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ? AND scraped_at >= datetime('now', '-7 days')",
        (company,),
    ).fetchone()[0]
    baseline_30d = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ? AND scraped_at >= datetime('now', '-30 days')",
        (company,),
    ).fetchone()[0]
    weekly_baseline = baseline_30d / 4.3 if baseline_30d > 0 else 0
    if weekly_baseline > 0 and recent_7d > weekly_baseline * 3:
        type_scores["NARRATIVE"] += 0.35
        signals.append({
            "signal": "velocity_spike",
            "detail": f"{recent_7d} postings this week vs {weekly_baseline:.0f}/week baseline ({recent_7d/max(weekly_baseline,1):.1f}x)",
            "weight": 0.35,
        })

    # --- Staleness analysis ---
    posted_at = job.get("posted_at")
    days_open = 0
    if posted_at:
        try:
            posted_date = datetime.fromisoformat(posted_at)
            days_open = (datetime.utcnow() - posted_date).days
        except (ValueError, TypeError):
            pass

    if days_open > 60:
        type_scores["PASSIVE"] += 0.25
        signals.append({
            "signal": "long_open",
            "detail": f"Open for {days_open} days without closing",
            "weight": 0.25,
        })
    if days_open > 90:
        type_scores["INSURANCE"] += 0.15
        type_scores["PASSIVE"] += 0.1

    # --- Description analysis ---
    desc = (job.get("description") or "").lower()
    if "compliance" in desc or "equal opportunity" in desc and len(desc) < 500:
        type_scores["INSURANCE"] += 0.2
        signals.append({
            "signal": "compliance_language",
            "detail": "Heavy compliance language with short description",
            "weight": 0.2,
        })

    if "always looking" in desc or "future opportunities" in desc or "talent pool" in desc:
        type_scores["PIPELINE"] += 0.35
        signals.append({
            "signal": "pipeline_language",
            "detail": "Language suggests collecting resumes for future needs",
            "weight": 0.35,
        })

    # --- Overly specific/niche requirements (competitive intelligence) ---
    skills_raw = job.get("required_skills") or ""
    skill_count = len([s for s in skills_raw.split(",") if s.strip()])
    if skill_count > 12 and ghost_score > 40:
        type_scores["COMPETITIVE"] += 0.2
        signals.append({
            "signal": "hyper_specific_requirements",
            "detail": f"{skill_count} skills listed — may be mapping talent market",
            "weight": 0.2,
        })

    # --- No salary + vague title + large company ---
    if not job.get("salary_min") and days_open > 30:
        type_scores["INSURANCE"] += 0.1
        type_scores["PASSIVE"] += 0.1

    # Apply ghost score as a multiplier
    score_multiplier = ghost_score / 100
    for t in type_scores:
        type_scores[t] *= score_multiplier

    # Find winning type
    best_type = max(type_scores, key=type_scores.get)
    best_confidence = min(0.95, type_scores[best_type])

    if best_confidence < 0.1:
        return {
            "ghost_type": None,
            "ghost_type_confidence": 1 - ghost_score / 100,
            "ghost_classification_evidence": json.dumps(signals),
            "ghost_candidate_advice": "This job has some mixed signals but no clear ghost pattern.",
            "verdict": "suspicious" if ghost_score > 25 else "likely_real",
        }

    ghost_info = GHOST_TYPES[best_type]
    return {
        "ghost_type": best_type,
        "ghost_type_confidence": round(best_confidence, 2),
        "ghost_classification_evidence": json.dumps(signals),
        "ghost_candidate_advice": ghost_info["candidate_advice"],
        "verdict": "likely_ghost" if ghost_score >= 50 else "suspicious",
    }


def batch_classify_ghosts(conn: sqlite3.Connection, limit: int = 100) -> dict:
    """Classify ghost types for jobs that have ghost scores but no classification."""
    rows = conn.execute(
        """SELECT j.job_id FROM jobs j
           LEFT JOIN enriched_jobs ej ON j.job_id = ej.job_id
           WHERE j.ghost_score > 20
             AND (ej.ghost_type IS NULL OR ej.job_id IS NULL)
           ORDER BY j.ghost_score DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()

    results = {"classified": 0, "failed": 0}
    for row in rows:
        try:
            classification = classify_ghost_type(row["job_id"], conn)
            conn.execute(
                """INSERT OR REPLACE INTO enriched_jobs (job_id, ghost_type, ghost_type_confidence,
                   ghost_classification_evidence, ghost_candidate_advice, enrichment_status)
                   VALUES (?, ?, ?, ?, ?, 'completed')
                   ON CONFLICT(job_id) DO UPDATE SET
                   ghost_type = excluded.ghost_type,
                   ghost_type_confidence = excluded.ghost_type_confidence,
                   ghost_classification_evidence = excluded.ghost_classification_evidence,
                   ghost_candidate_advice = excluded.ghost_candidate_advice""",
                (
                    row["job_id"],
                    classification["ghost_type"],
                    classification["ghost_type_confidence"],
                    classification["ghost_classification_evidence"],
                    classification["ghost_candidate_advice"],
                ),
            )
            results["classified"] += 1
        except Exception:
            results["failed"] += 1
    conn.commit()
    return results


def get_ghost_type_stats(conn: sqlite3.Connection) -> dict:
    """Get aggregate stats on ghost types across the database."""
    rows = conn.execute(
        """SELECT ghost_type, COUNT(*) as cnt
           FROM enriched_jobs WHERE ghost_type IS NOT NULL
           GROUP BY ghost_type"""
    ).fetchall()
    stats = {t: 0 for t in GHOST_TYPES}
    stats["unclassified"] = 0
    total = 0
    for row in rows:
        r = dict(row)
        if r["ghost_type"] in stats:
            stats[r["ghost_type"]] = r["cnt"]
        total += r["cnt"]
    stats["total_classified"] = total
    return stats
