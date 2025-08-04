"""Market Signals Engine — multi-source intelligence for hiring market trends.

Processes signals from multiple sources to generate actionable market intelligence:
- Hiring velocity changes (acceleration/deceleration per company)
- Salary trend detection (rising/falling by role/location)
- Ghost job epidemic detection (company-level and market-level)
- Layoff precursor signals
- Emerging skill demand shifts
- Geographic hiring pattern changes
"""
import json
import sqlite3
from datetime import datetime, timedelta


# ═══════════════════════════════════════════════════
# SIGNAL TYPES
# ═══════════════════════════════════════════════════

SIGNAL_TYPES = {
    "hiring_surge": {
        "label": "Hiring Surge",
        "description": "Company posting velocity significantly above baseline",
        "severity": "info",
    },
    "hiring_freeze": {
        "label": "Hiring Freeze Signal",
        "description": "Company posting velocity dropped sharply",
        "severity": "warning",
    },
    "salary_spike": {
        "label": "Salary Spike",
        "description": "Compensation for this role/location rising above trend",
        "severity": "info",
    },
    "salary_compression": {
        "label": "Salary Compression",
        "description": "Salary ranges narrowing — may indicate budget pressure",
        "severity": "warning",
    },
    "ghost_epidemic": {
        "label": "Ghost Job Epidemic",
        "description": "Company's ghost rate significantly above market average",
        "severity": "critical",
    },
    "layoff_precursor": {
        "label": "Layoff Precursor",
        "description": "Hiring pattern matches pre-layoff signatures",
        "severity": "critical",
    },
    "skill_demand_shift": {
        "label": "Skill Demand Shift",
        "description": "Rapid change in demand for specific skills",
        "severity": "info",
    },
    "remote_shift": {
        "label": "Remote Policy Change",
        "description": "Company shifting toward/away from remote work",
        "severity": "info",
    },
    "market_cooling": {
        "label": "Market Cooling",
        "description": "Overall hiring velocity declining across multiple companies",
        "severity": "warning",
    },
    "market_heating": {
        "label": "Market Heating",
        "description": "Overall hiring velocity increasing across multiple companies",
        "severity": "info",
    },
}


def detect_company_velocity_signals(
    conn: sqlite3.Connection, lookback_days: int = 90
) -> list[dict]:
    """Detect hiring surge and freeze signals per company."""
    signals = []

    # Get companies with enough data
    companies = conn.execute(
        """SELECT LOWER(company) as company_norm, company, COUNT(*) as total
           FROM jobs
           WHERE scraped_at >= datetime('now', ?)
           GROUP BY LOWER(company)
           HAVING total >= 5
           ORDER BY total DESC
           LIMIT 200""",
        (f"-{lookback_days} days",),
    ).fetchall()

    for row in companies:
        company_norm = row["company_norm"]
        company_name = row["company"]

        # Recent 14 days vs prior 14 days
        recent = conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ? AND scraped_at >= datetime('now', '-14 days')",
            (company_norm,),
        ).fetchone()[0]

        prior = conn.execute(
            """SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ?
               AND scraped_at >= datetime('now', '-28 days')
               AND scraped_at < datetime('now', '-14 days')""",
            (company_norm,),
        ).fetchone()[0]

        if prior == 0 and recent > 3:
            signals.append(_make_signal(
                "hiring_surge", company_name,
                f"New burst: {recent} postings in 14 days with no prior activity",
                impact_score=0.7,
            ))
        elif prior > 0:
            ratio = recent / prior
            if ratio >= 2.5 and recent >= 5:
                signals.append(_make_signal(
                    "hiring_surge", company_name,
                    f"{ratio:.1f}x posting velocity ({recent} vs {prior} in prior 2 weeks)",
                    impact_score=min(0.9, ratio / 5),
                ))
            elif ratio <= 0.3 and prior >= 5:
                signals.append(_make_signal(
                    "hiring_freeze", company_name,
                    f"Posting velocity dropped to {ratio:.0%} of baseline ({recent} vs {prior})",
                    impact_score=min(0.9, (1 - ratio)),
                ))

    return signals


def detect_salary_signals(
    conn: sqlite3.Connection, lookback_days: int = 60
) -> list[dict]:
    """Detect salary spikes and compression by role."""
    signals = []

    # Get roles with salary data in recent and older windows
    roles = conn.execute(
        """SELECT LOWER(title) as title_norm, title,
                  COUNT(*) as cnt
           FROM jobs
           WHERE salary_min > 0
             AND scraped_at >= datetime('now', ?)
           GROUP BY LOWER(title)
           HAVING cnt >= 3
           ORDER BY cnt DESC
           LIMIT 100""",
        (f"-{lookback_days} days",),
    ).fetchall()

    for row in roles:
        title_norm = row["title_norm"]
        title_display = row["title"]

        # Recent median
        recent_salaries = conn.execute(
            """SELECT salary_min, salary_max FROM jobs
               WHERE LOWER(title) = ? AND salary_min > 0
                 AND scraped_at >= datetime('now', '-30 days')
               ORDER BY salary_min""",
            (title_norm,),
        ).fetchall()

        # Older median (30-90 days ago)
        older_salaries = conn.execute(
            """SELECT salary_min, salary_max FROM jobs
               WHERE LOWER(title) = ? AND salary_min > 0
                 AND scraped_at >= datetime('now', '-90 days')
                 AND scraped_at < datetime('now', '-30 days')
               ORDER BY salary_min""",
            (title_norm,),
        ).fetchall()

        if len(recent_salaries) >= 3 and len(older_salaries) >= 3:
            recent_mid = _median_salary(recent_salaries)
            older_mid = _median_salary(older_salaries)

            if older_mid > 0:
                change_pct = (recent_mid - older_mid) / older_mid * 100
                if change_pct > 12:
                    signals.append(_make_signal(
                        "salary_spike", None,
                        f"{title_display}: salary up {change_pct:.0f}% "
                        f"(${older_mid:,.0f} -> ${recent_mid:,.0f} median)",
                        impact_score=min(0.9, change_pct / 30),
                        metadata={"role": title_display, "change_pct": round(change_pct, 1)},
                    ))
                elif change_pct < -10:
                    signals.append(_make_signal(
                        "salary_compression", None,
                        f"{title_display}: salary down {abs(change_pct):.0f}% "
                        f"(${older_mid:,.0f} -> ${recent_mid:,.0f} median)",
                        impact_score=min(0.9, abs(change_pct) / 25),
                        metadata={"role": title_display, "change_pct": round(change_pct, 1)},
                    ))

    return signals


def detect_ghost_epidemic_signals(conn: sqlite3.Connection) -> list[dict]:
    """Detect companies with abnormally high ghost rates."""
    signals = []

    # Market-wide ghost rate
    total_jobs = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE scraped_at >= datetime('now', '-90 days')"
    ).fetchone()[0]
    ghost_jobs = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE ghost_score >= 50 AND scraped_at >= datetime('now', '-90 days')"
    ).fetchone()[0]
    market_ghost_rate = ghost_jobs / max(total_jobs, 1)

    # Per-company ghost rates
    companies = conn.execute(
        """SELECT LOWER(company) as company_norm, company,
                  COUNT(*) as total,
                  SUM(CASE WHEN ghost_score >= 50 THEN 1 ELSE 0 END) as ghosts
           FROM jobs
           WHERE scraped_at >= datetime('now', '-90 days')
           GROUP BY LOWER(company)
           HAVING total >= 5
           ORDER BY total DESC
           LIMIT 200"""
    ).fetchall()

    for row in companies:
        ghost_rate = row["ghosts"] / max(row["total"], 1)
        if ghost_rate > max(0.3, market_ghost_rate * 2) and row["ghosts"] >= 3:
            signals.append(_make_signal(
                "ghost_epidemic", row["company"],
                f"{ghost_rate:.0%} of postings are likely ghosts "
                f"({row['ghosts']}/{row['total']}) — market avg is {market_ghost_rate:.0%}",
                impact_score=min(0.95, ghost_rate),
                metadata={"ghost_rate": round(ghost_rate, 3), "ghost_count": row["ghosts"]},
            ))

    return signals


def detect_skill_demand_shifts(
    conn: sqlite3.Connection, lookback_days: int = 60
) -> list[dict]:
    """Detect emerging or declining skill demand."""
    signals = []

    # Get skills from recent jobs
    recent_skills: dict[str, int] = {}
    older_skills: dict[str, int] = {}

    recent_jobs = conn.execute(
        """SELECT required_skills FROM jobs
           WHERE required_skills IS NOT NULL AND required_skills != ''
             AND scraped_at >= datetime('now', '-30 days')"""
    ).fetchall()

    older_jobs = conn.execute(
        """SELECT required_skills FROM jobs
           WHERE required_skills IS NOT NULL AND required_skills != ''
             AND scraped_at >= datetime('now', ?)
             AND scraped_at < datetime('now', '-30 days')""",
        (f"-{lookback_days} days",),
    ).fetchall()

    for row in recent_jobs:
        for skill in (row["required_skills"] or "").split(","):
            skill = skill.strip().lower()
            if skill and len(skill) > 1:
                recent_skills[skill] = recent_skills.get(skill, 0) + 1

    for row in older_jobs:
        for skill in (row["required_skills"] or "").split(","):
            skill = skill.strip().lower()
            if skill and len(skill) > 1:
                older_skills[skill] = older_skills.get(skill, 0) + 1

    # Normalize by total job counts
    recent_total = max(len(recent_jobs), 1)
    older_total = max(len(older_jobs), 1)

    all_skills = set(recent_skills.keys()) | set(older_skills.keys())
    for skill in all_skills:
        recent_pct = recent_skills.get(skill, 0) / recent_total * 100
        older_pct = older_skills.get(skill, 0) / older_total * 100

        if older_pct > 2 and recent_pct > older_pct * 1.5 and recent_skills.get(skill, 0) >= 5:
            signals.append(_make_signal(
                "skill_demand_shift", None,
                f"'{skill}' demand surging: {older_pct:.1f}% -> {recent_pct:.1f}% of postings",
                impact_score=min(0.8, (recent_pct - older_pct) / 20),
                metadata={"skill": skill, "trend": "rising", "recent_pct": round(recent_pct, 1)},
            ))
        elif recent_pct > 0 and older_pct > 3 and recent_pct < older_pct * 0.5:
            signals.append(_make_signal(
                "skill_demand_shift", None,
                f"'{skill}' demand declining: {older_pct:.1f}% -> {recent_pct:.1f}% of postings",
                impact_score=min(0.6, (older_pct - recent_pct) / 15),
                metadata={"skill": skill, "trend": "declining", "recent_pct": round(recent_pct, 1)},
            ))

    return signals


def detect_layoff_precursors(conn: sqlite3.Connection) -> list[dict]:
    """Detect pre-layoff hiring patterns.

    Common patterns:
    - Sudden hiring freeze after sustained growth
    - Spike in senior/leadership departures (indirect)
    - Shift from full-time to contractor postings
    - Closing roles in expensive locations while opening cheaper ones
    """
    signals = []

    companies = conn.execute(
        """SELECT LOWER(company) as company_norm, company, COUNT(*) as total
           FROM jobs
           WHERE scraped_at >= datetime('now', '-90 days')
           GROUP BY LOWER(company)
           HAVING total >= 10
           ORDER BY total DESC
           LIMIT 100"""
    ).fetchall()

    for row in companies:
        cn = row["company_norm"]

        # Pattern: Hiring then sudden stop
        month1 = conn.execute(
            """SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ?
               AND scraped_at >= datetime('now', '-30 days')""",
            (cn,),
        ).fetchone()[0]
        month2 = conn.execute(
            """SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ?
               AND scraped_at >= datetime('now', '-60 days')
               AND scraped_at < datetime('now', '-30 days')""",
            (cn,),
        ).fetchone()[0]
        month3 = conn.execute(
            """SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ?
               AND scraped_at >= datetime('now', '-90 days')
               AND scraped_at < datetime('now', '-60 days')""",
            (cn,),
        ).fetchone()[0]

        # Was growing, then crashed
        if month3 > 5 and month2 > month3 * 0.8 and month1 < month2 * 0.3:
            signals.append(_make_signal(
                "layoff_precursor", row["company"],
                f"Hiring collapsed: {month3} -> {month2} -> {month1} postings over 3 months",
                impact_score=0.8,
                metadata={"months": [month3, month2, month1]},
            ))

        # Pattern: Shift to contractors
        ft_recent = conn.execute(
            """SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ?
               AND scraped_at >= datetime('now', '-30 days')
               AND (LOWER(title) NOT LIKE '%contract%' AND LOWER(description) NOT LIKE '%contract%')""",
            (cn,),
        ).fetchone()[0]
        contract_recent = conn.execute(
            """SELECT COUNT(*) FROM jobs WHERE LOWER(company) = ?
               AND scraped_at >= datetime('now', '-30 days')
               AND (LOWER(title) LIKE '%contract%' OR LOWER(description) LIKE '%contract%')""",
            (cn,),
        ).fetchone()[0]

        if contract_recent > 3 and ft_recent > 0:
            contract_ratio = contract_recent / (ft_recent + contract_recent)
            if contract_ratio > 0.4:
                signals.append(_make_signal(
                    "layoff_precursor", row["company"],
                    f"{contract_ratio:.0%} of recent postings are contract/temp roles — "
                    f"possible workforce restructuring",
                    impact_score=0.6,
                    metadata={"contract_ratio": round(contract_ratio, 2)},
                ))

    return signals


def generate_market_snapshot(conn: sqlite3.Connection) -> dict:
    """Generate a full market snapshot combining all signal types."""
    all_signals = []
    all_signals.extend(detect_company_velocity_signals(conn))
    all_signals.extend(detect_salary_signals(conn))
    all_signals.extend(detect_ghost_epidemic_signals(conn))
    all_signals.extend(detect_skill_demand_shifts(conn))
    all_signals.extend(detect_layoff_precursors(conn))

    # Sort by impact
    all_signals.sort(key=lambda s: s["impact_score"], reverse=True)

    # Summary stats
    total_jobs_30d = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE scraped_at >= datetime('now', '-30 days')"
    ).fetchone()[0]
    total_jobs_90d = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE scraped_at >= datetime('now', '-90 days')"
    ).fetchone()[0]
    companies_hiring = conn.execute(
        "SELECT COUNT(DISTINCT LOWER(company)) FROM jobs WHERE scraped_at >= datetime('now', '-30 days')"
    ).fetchone()[0]
    avg_salary = conn.execute(
        """SELECT AVG((salary_min + COALESCE(salary_max, salary_min)) / 2) FROM jobs
           WHERE salary_min > 0 AND scraped_at >= datetime('now', '-30 days')"""
    ).fetchone()[0]

    # Group by signal type
    by_type: dict[str, list] = {}
    for s in all_signals:
        by_type.setdefault(s["signal_type"], []).append(s)

    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "summary": {
            "total_jobs_30d": total_jobs_30d,
            "total_jobs_90d": total_jobs_90d,
            "companies_hiring": companies_hiring,
            "avg_salary": round(avg_salary) if avg_salary else None,
            "total_signals": len(all_signals),
            "critical_signals": sum(1 for s in all_signals if s.get("severity") == "critical"),
        },
        "signals": all_signals[:50],
        "signals_by_type": {k: v[:10] for k, v in by_type.items()},
    }


def get_company_signals(company: str, conn: sqlite3.Connection) -> list[dict]:
    """Get all market signals related to a specific company."""
    company_lower = company.lower().strip()
    signals = []

    # Velocity
    for s in detect_company_velocity_signals(conn):
        if s.get("company") and s["company"].lower() == company_lower:
            signals.append(s)

    # Ghost
    for s in detect_ghost_epidemic_signals(conn):
        if s.get("company") and s["company"].lower() == company_lower:
            signals.append(s)

    # Layoff
    for s in detect_layoff_precursors(conn):
        if s.get("company") and s["company"].lower() == company_lower:
            signals.append(s)

    signals.sort(key=lambda s: s["impact_score"], reverse=True)
    return signals


def get_role_signals(role: str, conn: sqlite3.Connection) -> list[dict]:
    """Get salary and demand signals for a specific role."""
    role_lower = role.lower().strip()
    signals = []

    for s in detect_salary_signals(conn):
        meta = s.get("metadata", {})
        if meta.get("role", "").lower() == role_lower:
            signals.append(s)

    for s in detect_skill_demand_shifts(conn):
        meta = s.get("metadata", {})
        if meta.get("skill", "").lower() in role_lower:
            signals.append(s)

    return signals


# ═══════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════

def _make_signal(
    signal_type: str,
    company: str | None,
    detail: str,
    impact_score: float = 0.5,
    metadata: dict | None = None,
) -> dict:
    info = SIGNAL_TYPES.get(signal_type, {})
    return {
        "signal_type": signal_type,
        "label": info.get("label", signal_type),
        "severity": info.get("severity", "info"),
        "company": company,
        "detail": detail,
        "impact_score": round(impact_score, 2),
        "metadata": metadata or {},
        "detected_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
    }


def _median_salary(rows: list) -> float:
    salaries = sorted([
        (dict(r)["salary_min"] + (dict(r).get("salary_max") or dict(r)["salary_min"])) / 2
        for r in rows
    ])
    n = len(salaries)
    if n == 0:
        return 0
    return salaries[n // 2]
