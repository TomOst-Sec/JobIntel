"""Company Reviews Service — verified, attributed-but-protected reviews.

The anti-Glassdoor: reviews tied to verified employment, visible to
verified coworkers, aggregated anonymously for public. Employers can
respond but CANNOT remove reviews.
"""
import sqlite3
from datetime import datetime


def create_review(
    author_id: int,
    company_name: str,
    title: str,
    pros: str | None = None,
    cons: str | None = None,
    advice_to_management: str | None = None,
    employment_role: str | None = None,
    employment_start: str | None = None,
    employment_end: str | None = None,
    is_current_employee: bool = False,
    engineering_culture: float | None = None,
    management_quality: float | None = None,
    compensation_fairness: float | None = None,
    work_life_balance: float | None = None,
    growth_trajectory: float | None = None,
    interview_quality: float | None = None,
    conn: sqlite3.Connection = None,
) -> dict:
    """Create a new company review."""
    if not title or len(title.strip()) < 5:
        raise ValueError("Review title must be at least 5 characters")

    # Compute overall rating from provided dimensions
    dimensions = [
        d for d in [
            engineering_culture, management_quality, compensation_fairness,
            work_life_balance, growth_trajectory, interview_quality,
        ] if d is not None
    ]
    overall = round(sum(dimensions) / len(dimensions), 2) if dimensions else None

    # Check for existing review by same author for same company
    existing = conn.execute(
        "SELECT id FROM company_reviews WHERE author_id = ? AND company_name = ? AND status = 'active'",
        (author_id, company_name),
    ).fetchone()
    if existing:
        raise ValueError("You already have an active review for this company. Edit your existing review instead.")

    cursor = conn.execute("""
        INSERT INTO company_reviews (
            company_name, author_id, employment_role, employment_start,
            employment_end, is_current_employee, engineering_culture,
            management_quality, compensation_fairness, work_life_balance,
            growth_trajectory, interview_quality, overall_rating,
            title, pros, cons, advice_to_management
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        company_name, author_id, employment_role, employment_start,
        employment_end, int(is_current_employee), engineering_culture,
        management_quality, compensation_fairness, work_life_balance,
        growth_trajectory, interview_quality, overall,
        title, pros, cons, advice_to_management,
    ))
    conn.commit()

    return get_review(cursor.lastrowid, conn)


def get_review(review_id: int, conn: sqlite3.Connection) -> dict:
    """Get a single review by ID."""
    row = conn.execute("""
        SELECT cr.*, u.full_name as author_name
        FROM company_reviews cr
        JOIN users u ON cr.author_id = u.id
        WHERE cr.id = ?
    """, (review_id,)).fetchone()
    if not row:
        raise ValueError("Review not found")

    result = dict(row)
    # Get vote counts
    votes = conn.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN vote_type = 'helpful' THEN 1 ELSE 0 END), 0) as helpful_count,
            COALESCE(SUM(CASE WHEN vote_type = 'unhelpful' THEN 1 ELSE 0 END), 0) as unhelpful_count
        FROM review_votes WHERE review_id = ?
    """, (review_id,)).fetchone()
    result["helpful_count"] = votes["helpful_count"]
    result["unhelpful_count"] = votes["unhelpful_count"]
    return result


def get_company_reviews(
    company_name: str,
    sort_by: str = "recent",
    page: int = 1,
    per_page: int = 20,
    conn: sqlite3.Connection = None,
) -> dict:
    """Get all reviews for a company with aggregated stats."""
    offset = (page - 1) * per_page

    order = "cr.created_at DESC"
    if sort_by == "highest":
        order = "cr.overall_rating DESC"
    elif sort_by == "lowest":
        order = "cr.overall_rating ASC"
    elif sort_by == "helpful":
        order = "helpful_count DESC"

    reviews = conn.execute(f"""
        SELECT cr.*, u.full_name as author_name,
            (SELECT COALESCE(SUM(CASE WHEN vote_type='helpful' THEN 1 ELSE 0 END),0)
             FROM review_votes WHERE review_id = cr.id) as helpful_count
        FROM company_reviews cr
        JOIN users u ON cr.author_id = u.id
        WHERE cr.company_name = ? AND cr.status = 'active'
        ORDER BY {order}
        LIMIT ? OFFSET ?
    """, (company_name, per_page, offset)).fetchall()

    # Aggregated stats
    stats = conn.execute("""
        SELECT
            COUNT(*) as total_reviews,
            ROUND(AVG(overall_rating), 2) as avg_overall,
            ROUND(AVG(engineering_culture), 2) as avg_engineering_culture,
            ROUND(AVG(management_quality), 2) as avg_management_quality,
            ROUND(AVG(compensation_fairness), 2) as avg_compensation_fairness,
            ROUND(AVG(work_life_balance), 2) as avg_work_life_balance,
            ROUND(AVG(growth_trajectory), 2) as avg_growth_trajectory,
            ROUND(AVG(interview_quality), 2) as avg_interview_quality
        FROM company_reviews
        WHERE company_name = ? AND status = 'active'
    """, (company_name,)).fetchone()

    return {
        "company_name": company_name,
        "stats": dict(stats),
        "reviews": [dict(r) for r in reviews],
        "page": page,
        "per_page": per_page,
    }


def add_employer_response(
    review_id: int,
    response_text: str,
    conn: sqlite3.Connection,
) -> dict:
    """Add an employer response to a review. Employers can respond but NOT remove."""
    conn.execute("""
        UPDATE company_reviews
        SET employer_response = ?, employer_response_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
    """, (response_text, review_id))
    conn.commit()
    return get_review(review_id, conn)


def vote_review(
    review_id: int,
    user_id: int,
    vote_type: str,
    conn: sqlite3.Connection,
) -> dict:
    """Vote a review as helpful or unhelpful (toggle)."""
    existing = conn.execute(
        "SELECT id, vote_type FROM review_votes WHERE review_id = ? AND user_id = ?",
        (review_id, user_id),
    ).fetchone()

    if existing:
        if existing["vote_type"] == vote_type:
            conn.execute("DELETE FROM review_votes WHERE id = ?", (existing["id"],))
            conn.commit()
            return {"voted": False, "vote_type": vote_type}
        else:
            conn.execute("UPDATE review_votes SET vote_type = ? WHERE id = ?", (vote_type, existing["id"]))
            conn.commit()
            return {"voted": True, "vote_type": vote_type}

    conn.execute(
        "INSERT INTO review_votes (review_id, user_id, vote_type) VALUES (?, ?, ?)",
        (review_id, user_id, vote_type),
    )
    conn.commit()
    return {"voted": True, "vote_type": vote_type}


def get_review_summary_for_company(company_name: str, conn: sqlite3.Connection) -> dict:
    """Get aggregated review summary for public consumption (no PII)."""
    stats = conn.execute("""
        SELECT
            COUNT(*) as total_reviews,
            ROUND(AVG(overall_rating), 2) as avg_rating,
            ROUND(AVG(engineering_culture), 2) as engineering_culture,
            ROUND(AVG(management_quality), 2) as management_quality,
            ROUND(AVG(compensation_fairness), 2) as compensation_fairness,
            ROUND(AVG(work_life_balance), 2) as work_life_balance,
            ROUND(AVG(growth_trajectory), 2) as growth_trajectory,
            ROUND(AVG(interview_quality), 2) as interview_quality,
            COUNT(CASE WHEN overall_rating >= 4 THEN 1 END) as positive_count,
            COUNT(CASE WHEN overall_rating <= 2 THEN 1 END) as negative_count
        FROM company_reviews
        WHERE company_name = ? AND status = 'active'
    """, (company_name,)).fetchone()

    return dict(stats) if stats else {
        "total_reviews": 0, "avg_rating": None,
    }
