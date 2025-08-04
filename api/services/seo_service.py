"""SEO Service — programmatic page generation and structured data.

Generates:
- Google Jobs JSON-LD structured data for every job
- Programmatic SEO pages for /jobs/[role]/[location] patterns
- Salary comparison pages for /salaries/[role]/[location]
- Company hiring pages
- Sitemap data
"""
import json
import re
import sqlite3
from datetime import datetime


def generate_job_structured_data(job: dict) -> dict:
    """Generate Google Jobs JSON-LD structured data for a single job.

    Follows https://developers.google.com/search/docs/appearance/structured-data/job-posting
    """
    posted_at = job.get("posted_at") or job.get("scraped_at") or datetime.utcnow().isoformat()

    structured = {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": job.get("title", ""),
        "description": job.get("description", ""),
        "datePosted": posted_at,
        "hiringOrganization": {
            "@type": "Organization",
            "name": job.get("company", ""),
        },
    }

    # Location
    location = job.get("location")
    if location:
        if "remote" in location.lower():
            structured["jobLocationType"] = "TELECOMMUTE"
        else:
            structured["jobLocation"] = {
                "@type": "Place",
                "address": {
                    "@type": "PostalAddress",
                    "addressLocality": location,
                },
            }

    # Salary
    if job.get("salary_min") and job["salary_min"] > 0:
        structured["baseSalary"] = {
            "@type": "MonetaryAmount",
            "currency": "USD",
            "value": {
                "@type": "QuantitativeValue",
                "minValue": job["salary_min"],
                "maxValue": job.get("salary_max") or job["salary_min"],
                "unitText": "YEAR",
            },
        }

    # Employment type
    emp_type = (job.get("employment_type") or "").lower()
    type_map = {
        "full_time": "FULL_TIME", "full-time": "FULL_TIME", "fulltime": "FULL_TIME",
        "part_time": "PART_TIME", "part-time": "PART_TIME",
        "contract": "CONTRACTOR",
        "internship": "INTERN",
        "temporary": "TEMPORARY",
    }
    for key, value in type_map.items():
        if key in emp_type:
            structured["employmentType"] = value
            break

    # Direct apply
    if job.get("apply_url"):
        structured["directApply"] = True

    return structured


def generate_seo_page(
    page_type: str,
    role: str | None,
    location: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Generate or refresh a programmatic SEO page.

    page_type: 'job_role_location', 'salary_role_location', 'company'
    """
    role_slug = _slugify(role) if role else None
    location_slug = _slugify(location) if location else None

    if page_type == "job_role_location":
        return _generate_job_role_page(role, location, role_slug, location_slug, conn)
    elif page_type == "salary_role_location":
        return _generate_salary_page(role, location, role_slug, location_slug, conn)
    else:
        return {"error": f"Unknown page type: {page_type}"}


def _generate_job_role_page(
    role: str | None,
    location: str | None,
    role_slug: str | None,
    location_slug: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Generate SEO page for /jobs/[role]/[location]."""
    conditions = ["1=1"]
    params: list = []

    if role:
        conditions.append("LOWER(title) LIKE ?")
        params.append(f"%{role.lower()}%")
    if location:
        conditions.append("LOWER(location) LIKE ?")
        params.append(f"%{location.lower()}%")

    where = " AND ".join(conditions)
    jobs = conn.execute(
        f"""SELECT job_id, title, company, location, salary_min, salary_max,
                   posted_at, ghost_score
            FROM jobs
            WHERE {where}
              AND scraped_at >= datetime('now', '-30 days')
            ORDER BY scraped_at DESC
            LIMIT 100""",
        params,
    ).fetchall()

    job_count = len(jobs)

    # Salary stats
    salaries = [
        (dict(j)["salary_min"] + (dict(j).get("salary_max") or dict(j)["salary_min"])) / 2
        for j in jobs if dict(j).get("salary_min") and dict(j)["salary_min"] > 0
    ]
    avg_min = None
    avg_max = None
    if salaries:
        sorted_sal = sorted(salaries)
        avg_min = round(sorted_sal[int(len(sorted_sal) * 0.25)]) if len(sorted_sal) > 1 else round(sorted_sal[0])
        avg_max = round(sorted_sal[min(int(len(sorted_sal) * 0.75), len(sorted_sal) - 1)])

    # Top companies
    company_counts: dict[str, int] = {}
    for j in jobs:
        comp = dict(j).get("company", "Unknown")
        company_counts[comp] = company_counts.get(comp, 0) + 1
    top_companies = sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    # Ghost-free jobs
    real_jobs = [j for j in jobs if (dict(j).get("ghost_score") or 0) < 30]

    title_parts = []
    if role:
        title_parts.append(f"{role} Jobs")
    else:
        title_parts.append("Tech Jobs")
    if location:
        title_parts.append(f"in {location}")
    title = " ".join(title_parts) + f" — {job_count} Open Positions"

    meta_desc = f"Find {job_count} {role or 'tech'} jobs"
    if location:
        meta_desc += f" in {location}"
    if avg_min and avg_max:
        meta_desc += f". Salary range: ${avg_min:,.0f}-${avg_max:,.0f}."
    meta_desc += " Ghost-job filtered. Updated daily."

    slug = "/".join(filter(None, [role_slug, location_slug]))

    content = {
        "job_count": job_count,
        "real_job_count": len(real_jobs),
        "salary_range": {"min": avg_min, "max": avg_max} if avg_min else None,
        "top_companies": [{"name": c, "count": n} for c, n in top_companies],
        "sample_jobs": [dict(j) for j in jobs[:20]],
    }

    # Upsert SEO page
    conn.execute(
        """INSERT OR REPLACE INTO seo_pages
           (page_type, slug, role_slug, location_slug, title, meta_description,
            content_json, job_count, avg_salary_min, avg_salary_max, last_generated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
        (
            "job_role_location", slug, role_slug, location_slug,
            title, meta_desc, json.dumps(content), job_count, avg_min, avg_max,
        ),
    )
    conn.commit()

    return {
        "page_type": "job_role_location",
        "slug": slug,
        "title": title,
        "meta_description": meta_desc,
        "content": content,
    }


def _generate_salary_page(
    role: str | None,
    location: str | None,
    role_slug: str | None,
    location_slug: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Generate SEO page for /salaries/[role]/[location]."""
    conditions = ["salary_min > 0"]
    params: list = []

    if role:
        conditions.append("LOWER(title) LIKE ?")
        params.append(f"%{role.lower()}%")
    if location:
        conditions.append("LOWER(location) LIKE ?")
        params.append(f"%{location.lower()}%")

    where = " AND ".join(conditions)
    rows = conn.execute(
        f"""SELECT salary_min, salary_max, company, title, location
            FROM jobs WHERE {where}
            ORDER BY salary_min""",
        params,
    ).fetchall()

    if not rows:
        return {
            "page_type": "salary_role_location",
            "slug": "/".join(filter(None, [role_slug, location_slug])),
            "title": f"{role or 'Tech'} Salaries",
            "content": {"data_points": 0},
        }

    salaries = sorted([
        (dict(r)["salary_min"] + (dict(r).get("salary_max") or dict(r)["salary_min"])) / 2
        for r in rows
    ])
    n = len(salaries)

    percentiles = {}
    if n > 0:
        percentiles = {
            "p10": round(salaries[int(n * 0.10)]) if n > 1 else None,
            "p25": round(salaries[int(n * 0.25)]) if n > 1 else round(salaries[0]),
            "p50": round(salaries[n // 2]),
            "p75": round(salaries[min(int(n * 0.75), n - 1)]),
            "p90": round(salaries[min(int(n * 0.90), n - 1)]) if n > 1 else None,
        }

    # Company salary comparison
    company_salaries: dict[str, list] = {}
    for r in rows:
        rd = dict(r)
        comp = rd["company"]
        mid = (rd["salary_min"] + (rd.get("salary_max") or rd["salary_min"])) / 2
        company_salaries.setdefault(comp, []).append(mid)

    company_comparison = sorted(
        [
            {"company": c, "avg_salary": round(sum(s) / len(s)), "data_points": len(s)}
            for c, s in company_salaries.items()
            if len(s) >= 2
        ],
        key=lambda x: x["avg_salary"],
        reverse=True,
    )[:15]

    # H1B comparison if available
    h1b_avg = None
    if role:
        h1b_row = conn.execute(
            """SELECT AVG(wage_annual) as avg_wage, COUNT(*) as cnt
               FROM h1b_salary_data
               WHERE job_title_normalized LIKE ?
                 AND case_status = 'Certified'""",
            (f"%{role.lower()[:30]}%",),
        ).fetchone()
        if h1b_row and h1b_row["cnt"] > 0:
            h1b_avg = round(h1b_row["avg_wage"])

    title_parts = [f"{role or 'Tech'} Salary Guide"]
    if location:
        title_parts.append(f"in {location}")
    title = " ".join(title_parts) + f" ({n} Data Points)"

    meta_desc = f"{role or 'Tech'} salary data from {n} jobs."
    if percentiles.get("p50"):
        meta_desc += f" Median: ${percentiles['p50']:,.0f}."
    if h1b_avg:
        meta_desc += f" H1B avg: ${h1b_avg:,.0f}."

    slug = "salaries/" + "/".join(filter(None, [role_slug, location_slug]))

    content = {
        "data_points": n,
        "percentiles": percentiles,
        "avg_salary": round(sum(salaries) / n) if n > 0 else None,
        "company_comparison": company_comparison,
        "h1b_avg": h1b_avg,
    }

    conn.execute(
        """INSERT OR REPLACE INTO seo_pages
           (page_type, slug, role_slug, location_slug, title, meta_description,
            content_json, job_count, avg_salary_min, avg_salary_max, last_generated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
        (
            "salary_role_location", slug, role_slug, location_slug,
            title, meta_desc, json.dumps(content), n,
            percentiles.get("p25"), percentiles.get("p75"),
        ),
    )
    conn.commit()

    return {
        "page_type": "salary_role_location",
        "slug": slug,
        "title": title,
        "meta_description": meta_desc,
        "content": content,
    }


def generate_sitemap_data(conn: sqlite3.Connection) -> list[dict]:
    """Generate sitemap entries for all SEO pages."""
    rows = conn.execute(
        """SELECT slug, page_type, last_generated_at, job_count
           FROM seo_pages
           WHERE job_count > 0
           ORDER BY job_count DESC"""
    ).fetchall()
    return [
        {
            "url": f"/{dict(r)['slug']}",
            "lastmod": dict(r)["last_generated_at"],
            "priority": 0.8 if dict(r)["job_count"] > 10 else 0.5,
            "changefreq": "daily",
        }
        for r in rows
    ]


def batch_generate_seo_pages(conn: sqlite3.Connection) -> dict:
    """Generate SEO pages for popular role/location combinations."""
    # Find top roles
    top_roles = conn.execute(
        """SELECT LOWER(title) as title_norm, COUNT(*) as cnt
           FROM jobs
           WHERE scraped_at >= datetime('now', '-30 days')
           GROUP BY LOWER(title)
           HAVING cnt >= 3
           ORDER BY cnt DESC
           LIMIT 50"""
    ).fetchall()

    # Find top locations
    top_locations = conn.execute(
        """SELECT LOWER(location) as loc_norm, COUNT(*) as cnt
           FROM jobs
           WHERE location IS NOT NULL AND location != ''
             AND scraped_at >= datetime('now', '-30 days')
           GROUP BY LOWER(location)
           HAVING cnt >= 3
           ORDER BY cnt DESC
           LIMIT 20"""
    ).fetchall()

    generated = 0

    # Role-only pages
    for role_row in top_roles:
        generate_seo_page("job_role_location", role_row["title_norm"], None, conn)
        generate_seo_page("salary_role_location", role_row["title_norm"], None, conn)
        generated += 2

    # Role + Location pages (top combos only)
    for role_row in top_roles[:20]:
        for loc_row in top_locations[:10]:
            generate_seo_page("job_role_location", role_row["title_norm"], loc_row["loc_norm"], conn)
            generate_seo_page("salary_role_location", role_row["title_norm"], loc_row["loc_norm"], conn)
            generated += 2

    return {"pages_generated": generated}


def get_seo_page(slug: str, conn: sqlite3.Connection) -> dict | None:
    """Retrieve a cached SEO page by slug."""
    row = conn.execute(
        "SELECT * FROM seo_pages WHERE slug = ?",
        (slug,),
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["content"] = json.loads(result["content_json"]) if result["content_json"] else {}
    return result


def get_seo_stats(conn: sqlite3.Connection) -> dict:
    """Get SEO page generation statistics."""
    rows = conn.execute(
        """SELECT page_type, COUNT(*) as cnt, SUM(job_count) as total_jobs
           FROM seo_pages
           GROUP BY page_type"""
    ).fetchall()

    return {
        "total_pages": sum(dict(r)["cnt"] for r in rows),
        "by_type": {dict(r)["page_type"]: {"count": dict(r)["cnt"], "total_jobs": dict(r)["total_jobs"]} for r in rows},
    }


# ═══════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════

def _slugify(text: str | None) -> str | None:
    """Convert text to URL-friendly slug."""
    if not text:
        return None
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")
