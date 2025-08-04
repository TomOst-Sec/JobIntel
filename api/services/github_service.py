"""GitHub Identity Engine — analyzes repos and computes Build Score.

Fetches GitHub profile + repos via API, extracts skills from languages
and topics, and computes a composite Build Score (0-100).
"""
import json
import math
import sqlite3
from datetime import datetime

import httpx

GITHUB_API = "https://api.github.com"

# Language → skill mapping
LANGUAGE_SKILLS: dict[str, list[str]] = {
    "Python": ["Python", "Backend"],
    "TypeScript": ["TypeScript", "Frontend"],
    "JavaScript": ["JavaScript", "Frontend"],
    "Rust": ["Rust", "Systems"],
    "Go": ["Go", "Backend"],
    "Java": ["Java", "Backend"],
    "C++": ["C++", "Systems"],
    "C": ["C", "Systems"],
    "C#": ["C#", ".NET"],
    "Ruby": ["Ruby", "Backend"],
    "PHP": ["PHP", "Backend"],
    "Swift": ["Swift", "iOS"],
    "Kotlin": ["Kotlin", "Android"],
    "Dart": ["Dart", "Flutter"],
    "Scala": ["Scala", "JVM"],
    "Elixir": ["Elixir", "Backend"],
    "Haskell": ["Haskell", "Functional"],
    "Shell": ["Shell", "DevOps"],
    "Dockerfile": ["Docker", "DevOps"],
    "HCL": ["Terraform", "DevOps"],
    "Jupyter Notebook": ["Data Science", "ML"],
    "R": ["R", "Data Science"],
    "CUDA": ["CUDA", "GPU", "ML"],
    "Solidity": ["Solidity", "Web3"],
}

# Topic → skill mapping
TOPIC_SKILLS: dict[str, str] = {
    "machine-learning": "ML",
    "deep-learning": "Deep Learning",
    "react": "React",
    "nextjs": "Next.js",
    "vue": "Vue",
    "angular": "Angular",
    "django": "Django",
    "flask": "Flask",
    "fastapi": "FastAPI",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "aws": "AWS",
    "gcp": "GCP",
    "azure": "Azure",
    "terraform": "Terraform",
    "graphql": "GraphQL",
    "postgresql": "PostgreSQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "elasticsearch": "Elasticsearch",
    "ci-cd": "CI/CD",
    "devops": "DevOps",
    "blockchain": "Blockchain",
    "web3": "Web3",
    "ai": "AI",
    "nlp": "NLP",
    "computer-vision": "Computer Vision",
    "data-science": "Data Science",
    "cybersecurity": "Security",
    "ios": "iOS",
    "android": "Android",
    "react-native": "React Native",
    "flutter": "Flutter",
}


def _gh_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def sync_github_profile(user_id: int, db: sqlite3.Connection) -> dict:
    """Sync GitHub data for a user who has linked their GitHub account."""
    # Get the stored GitHub OAuth token
    row = db.execute(
        """SELECT access_token_encrypted, provider_user_id, provider_name, provider_avatar_url
           FROM user_oauth_accounts
           WHERE user_id = ? AND provider = 'github'""",
        (user_id,),
    ).fetchone()

    if not row:
        raise ValueError("No GitHub account linked. Connect GitHub first via OAuth.")

    access_token = row["access_token_encrypted"]  # stored as plaintext for now
    if not access_token:
        raise ValueError("GitHub access token expired. Please re-link your GitHub account.")

    # Fetch GitHub profile
    profile = _fetch_profile(access_token)
    repos = _fetch_repos(access_token)
    languages = _analyze_languages(access_token, repos)
    events = _fetch_recent_events(profile["login"])
    skills = _extract_skills(languages, repos)
    build_score, breakdown = _compute_build_score(profile, repos, languages, events)

    # Store repos summary (top 20 by stars)
    top_repos = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:20]
    repos_summary = [
        {
            "name": r["name"],
            "full_name": r["full_name"],
            "description": r.get("description", ""),
            "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0),
            "language": r.get("language"),
            "topics": r.get("topics", []),
            "updated_at": r.get("updated_at"),
            "fork": r.get("fork", False),
        }
        for r in top_repos
    ]

    # Upsert into github_profiles
    now = datetime.utcnow().isoformat()
    db.execute(
        """INSERT INTO github_profiles
           (user_id, github_username, github_id, avatar_url, bio,
            public_repos, followers, following, total_stars,
            top_languages, repos_data, skills_extracted,
            build_score, build_score_breakdown, profile_url,
            last_synced_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
            github_username=excluded.github_username,
            avatar_url=excluded.avatar_url,
            bio=excluded.bio,
            public_repos=excluded.public_repos,
            followers=excluded.followers,
            following=excluded.following,
            total_stars=excluded.total_stars,
            top_languages=excluded.top_languages,
            repos_data=excluded.repos_data,
            skills_extracted=excluded.skills_extracted,
            build_score=excluded.build_score,
            build_score_breakdown=excluded.build_score_breakdown,
            profile_url=excluded.profile_url,
            last_synced_at=excluded.last_synced_at,
            updated_at=excluded.updated_at""",
        (
            user_id,
            profile["login"],
            str(profile["id"]),
            profile.get("avatar_url"),
            profile.get("bio"),
            profile.get("public_repos", 0),
            profile.get("followers", 0),
            profile.get("following", 0),
            sum(r.get("stargazers_count", 0) for r in repos),
            json.dumps(languages),
            json.dumps(repos_summary),
            json.dumps(skills),
            build_score,
            json.dumps(breakdown),
            profile.get("html_url"),
            now,
            now,
        ),
    )
    db.commit()

    return {
        "github_username": profile["login"],
        "build_score": build_score,
        "build_score_breakdown": breakdown,
        "top_languages": languages,
        "skills": skills,
        "public_repos": profile.get("public_repos", 0),
        "total_stars": sum(r.get("stargazers_count", 0) for r in repos),
        "followers": profile.get("followers", 0),
        "top_repos": repos_summary[:5],
        "synced_at": now,
    }


def get_github_profile(user_id: int, db: sqlite3.Connection) -> dict | None:
    """Get stored GitHub profile for a user."""
    row = db.execute(
        "SELECT * FROM github_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    if not row:
        return None

    result = dict(row)
    # Parse JSON fields
    for field in ("top_languages", "repos_data", "skills_extracted", "build_score_breakdown"):
        if result.get(field):
            try:
                result[field] = json.loads(result[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return result


def get_build_score(user_id: int, db: sqlite3.Connection) -> dict | None:
    """Get just the Build Score for a user (public endpoint)."""
    row = db.execute(
        """SELECT build_score, build_score_breakdown, github_username,
                  top_languages, skills_extracted, last_synced_at
           FROM github_profiles WHERE user_id = ?""",
        (user_id,),
    ).fetchone()
    if not row:
        return None

    result = dict(row)
    for field in ("build_score_breakdown", "top_languages", "skills_extracted"):
        if result.get(field):
            try:
                result[field] = json.loads(result[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return result


# ─── GitHub API Helpers ──────────────────────────────────────────────


def _fetch_profile(token: str) -> dict:
    """Fetch GitHub user profile."""
    resp = httpx.get(f"{GITHUB_API}/user", headers=_gh_headers(token), timeout=15)
    resp.raise_for_status()
    return resp.json()


def _fetch_repos(token: str, per_page: int = 100) -> list[dict]:
    """Fetch user's repositories (owned, not forks, sorted by updated)."""
    repos: list[dict] = []
    page = 1
    while True:
        resp = httpx.get(
            f"{GITHUB_API}/user/repos",
            headers=_gh_headers(token),
            params={
                "sort": "updated",
                "per_page": per_page,
                "page": page,
                "type": "owner",
            },
            timeout=15,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        # Filter out forks
        repos.extend(r for r in batch if not r.get("fork", False))
        if len(batch) < per_page:
            break
        page += 1
        if page > 3:  # Max 300 repos
            break
    return repos


def _analyze_languages(token: str, repos: list[dict]) -> dict[str, int]:
    """Aggregate language bytes across all repos."""
    totals: dict[str, int] = {}
    # Analyze top 30 repos by recency
    for repo in repos[:30]:
        try:
            resp = httpx.get(
                f"{GITHUB_API}/repos/{repo['full_name']}/languages",
                headers=_gh_headers(token),
                timeout=10,
            )
            if resp.status_code == 200:
                for lang, bytes_count in resp.json().items():
                    totals[lang] = totals.get(lang, 0) + bytes_count
        except Exception:
            continue
    # Sort by bytes descending
    return dict(sorted(totals.items(), key=lambda x: x[1], reverse=True))


def _fetch_recent_events(username: str) -> list[dict]:
    """Fetch recent public events (no auth needed)."""
    try:
        resp = httpx.get(
            f"{GITHUB_API}/users/{username}/events/public",
            params={"per_page": 100},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return []


def _extract_skills(languages: dict[str, int], repos: list[dict]) -> list[str]:
    """Extract unique skills from languages and repo topics."""
    skills: set[str] = set()

    # From languages
    for lang in languages:
        if lang in LANGUAGE_SKILLS:
            skills.update(LANGUAGE_SKILLS[lang])

    # From repo topics
    for repo in repos:
        for topic in repo.get("topics", []):
            topic_lower = topic.lower()
            if topic_lower in TOPIC_SKILLS:
                skills.add(TOPIC_SKILLS[topic_lower])

    return sorted(skills)


def _compute_build_score(
    profile: dict,
    repos: list[dict],
    languages: dict[str, int],
    events: list[dict],
) -> tuple[float, dict]:
    """Compute Build Score (0-100) with breakdown.

    Weights:
      Consistency (30%) — repo count, update frequency, event activity
      Quality     (25%) — total stars, avg stars per repo
      Breadth     (15%) — language diversity, topic diversity
      Collaboration (15%) — followers, forks received
      Impact      (15%) — total stars, top repo stars
    """
    total_repos = len(repos)
    total_stars = sum(r.get("stargazers_count", 0) for r in repos)
    total_forks = sum(r.get("forks_count", 0) for r in repos)
    followers = profile.get("followers", 0)
    total_events = len(events)

    # --- Consistency (30%) ---
    # Repos: 0-1=0, 5=30, 10=50, 20=70, 40+=90, 80+=100
    repo_score = min(100, _log_scale(total_repos, 80))
    # Events in last 90 days (proxy for recent activity)
    event_score = min(100, _log_scale(total_events, 100))
    consistency = repo_score * 0.5 + event_score * 0.5

    # --- Quality (25%) ---
    # Stars: 0=0, 10=30, 50=50, 200=70, 1000=85, 5000+=100
    star_score = min(100, _log_scale(total_stars, 5000))
    # Average stars per repo (quality density)
    avg_stars = total_stars / max(total_repos, 1)
    avg_star_score = min(100, _log_scale(avg_stars, 50))
    quality = star_score * 0.6 + avg_star_score * 0.4

    # --- Breadth (15%) ---
    num_languages = len(languages)
    lang_score = min(100, _log_scale(num_languages, 15))
    all_topics: set[str] = set()
    for r in repos:
        all_topics.update(r.get("topics", []))
    topic_score = min(100, _log_scale(len(all_topics), 30))
    breadth = lang_score * 0.6 + topic_score * 0.4

    # --- Collaboration (15%) ---
    follower_score = min(100, _log_scale(followers, 1000))
    fork_score = min(100, _log_scale(total_forks, 500))
    collaboration = follower_score * 0.5 + fork_score * 0.5

    # --- Impact (15%) ---
    top_repo_stars = max((r.get("stargazers_count", 0) for r in repos), default=0)
    top_star_score = min(100, _log_scale(top_repo_stars, 1000))
    impact = star_score * 0.4 + top_star_score * 0.6

    # Weighted total
    total = (
        consistency * 0.30
        + quality * 0.25
        + breadth * 0.15
        + collaboration * 0.15
        + impact * 0.15
    )

    breakdown = {
        "consistency": round(consistency, 1),
        "quality": round(quality, 1),
        "breadth": round(breadth, 1),
        "collaboration": round(collaboration, 1),
        "impact": round(impact, 1),
    }

    return round(total, 1), breakdown


def _log_scale(value: float, max_value: float) -> float:
    """Logarithmic scaling: maps value to 0-100 with diminishing returns."""
    if value <= 0:
        return 0.0
    return min(100.0, (math.log(1 + value) / math.log(1 + max_value)) * 100)
