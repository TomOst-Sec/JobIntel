"""Synthetic candidate profile generator.

Bootstraps candidate profiles from existing job data.
No Claude API calls — purely deterministic for speed.
"""
import hashlib
import json
import random
import sqlite3
import uuid

FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Christopher", "Karen", "Charles", "Lisa", "Daniel", "Nancy",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
    "Steven", "Dorothy", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna",
    "Kenneth", "Michelle", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa",
    "Timothy", "Deborah", "Ronald", "Stephanie", "Edward", "Rebecca", "Jason", "Sharon",
    "Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
    "Nicholas", "Angela", "Eric", "Shirley", "Jonathan", "Anna", "Stephen", "Brenda",
    "Larry", "Pamela", "Justin", "Emma", "Scott", "Nicole", "Brandon", "Helen",
    "Benjamin", "Samantha", "Samuel", "Katherine", "Raymond", "Christine", "Gregory", "Debra",
    "Frank", "Rachel", "Alexander", "Carolyn", "Patrick", "Janet", "Jack", "Catherine",
    "Dennis", "Maria", "Jerry", "Heather", "Tyler", "Diane", "Aaron", "Ruth",
    "Jose", "Julie", "Nathan", "Olivia", "Henry", "Joyce", "Douglas", "Virginia",
    "Peter", "Victoria", "Zachary", "Kelly", "Kyle", "Lauren", "Noah", "Christina",
    "Ethan", "Joan", "Jeremy", "Evelyn", "Walter", "Judith", "Christian", "Megan",
    "Keith", "Andrea", "Roger", "Cheryl", "Terry", "Hannah", "Austin", "Jacqueline",
    "Sean", "Martha", "Gerald", "Gloria", "Carl", "Teresa", "Dylan", "Ann",
    "Harold", "Sara", "Jordan", "Madison", "Jesse", "Frances", "Bryan", "Kathryn",
    "Lawrence", "Janice", "Arthur", "Jean", "Gabriel", "Abigail", "Bruce", "Alice",
    "Logan", "Judy", "Albert", "Sophia", "Willie", "Grace", "Alan", "Denise",
    "Eugene", "Amber", "Russell", "Doris", "Vincent", "Marilyn", "Philip", "Danielle",
    "Bobby", "Beverly", "Johnny", "Isabella", "Bradley", "Theresa", "Roy", "Diana",
    "Ralph", "Natalie", "Craig", "Brittany", "Elijah", "Charlotte", "Liam", "Marie",
    "Mason", "Kayla", "Aiden", "Alexis", "Owen", "Lori",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill",
    "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell",
    "Mitchell", "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz",
    "Parker", "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales",
    "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson",
    "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward",
    "Richardson", "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray",
    "Mendoza", "Ruiz", "Hughes", "Price", "Alvarez", "Castillo", "Sanders", "Patel",
    "Myers", "Long", "Ross", "Foster", "Jimenez", "Powell", "Jenkins", "Perry",
    "Russell", "Sullivan", "Bell", "Coleman", "Butler", "Henderson", "Barnes", "Gonzales",
    "Fisher", "Vasquez", "Simmons", "Griffin", "Aguilar", "Morton", "Kennedy", "Marshall",
    "Herrera", "Foster", "Alexander", "Stone", "Spencer", "Hawkins", "Dunn", "Perkins",
    "Hudson", "Spencer", "Gardner", "Stephens", "Payne", "Pierce", "Berry", "Matthews",
    "Arnold", "Wagner", "Willis", "Ray", "Watkins", "Olson", "Carroll", "Duncan",
    "Snyder", "Hart", "Cunningham", "Bradley", "Lane", "Andrews", "Ruiz", "Harper",
    "Fox", "Riley", "Armstrong", "Carpenter", "Weaver", "Greene", "Lawrence", "Elliott",
    "Chavez", "Sims", "Austin", "Peters", "Kelley", "Franklin", "Lawson", "Fields",
    "Gutierrez", "Ryan", "Schmidt", "Carr", "Vasquez", "Castillo", "Wheeler", "Chapman",
    "Oliver", "Montgomery", "Richards", "Williamson", "Johnston", "Banks", "Meyer", "Bishop",
    "McCoy", "Howell", "Alvarez", "Morrison", "Hansen", "Fernandez", "Garza", "Harvey",
    "Little", "Burton", "Stanley", "Nguyen", "George", "Jacobs", "Reid", "Fuller",
]

TITLE_LEVEL_MAP = {
    "intern": (0, 1),
    "junior": (1, 3),
    "jr": (1, 3),
    "associate": (1, 4),
    "mid": (3, 6),
    "senior": (6, 10),
    "sr": (6, 10),
    "lead": (8, 12),
    "staff": (8, 12),
    "principal": (10, 15),
    "director": (10, 15),
    "head": (10, 15),
    "vp": (12, 20),
    "vice president": (12, 20),
    "cto": (15, 25),
    "ceo": (15, 25),
    "chief": (15, 25),
}

AVAILABILITY_WEIGHTS = ["active"] * 40 + ["passive"] * 45 + ["not_looking"] * 15

HEADLINE_TEMPLATES = [
    "{title} at {company}",
    "Former {title} | Open to opportunities",
    "{title} | {skills_str}",
    "{experience_years}+ years in {skills_first}",
]


def _derive_experience(title: str) -> int:
    """Derive experience years from title keywords."""
    title_lower = title.lower()
    for keyword, (lo, hi) in TITLE_LEVEL_MAP.items():
        if keyword in title_lower:
            return random.randint(lo, hi)
    # Default: mid-level
    return random.randint(3, 7)


def _parse_skills(raw_skills: str | None) -> list[str]:
    """Parse comma-separated or JSON skills into a clean list."""
    if not raw_skills:
        return []
    raw_skills = raw_skills.strip()
    if raw_skills.startswith("["):
        try:
            return [s.strip() for s in json.loads(raw_skills) if s.strip()]
        except (json.JSONDecodeError, TypeError):
            pass
    return [s.strip() for s in raw_skills.split(",") if s.strip()]


def _name_from_hash(seed: str, idx: int) -> tuple[str, str]:
    """Deterministic name from a hash seed + index."""
    h = hashlib.md5(f"{seed}:{idx}".encode()).hexdigest()
    first_idx = int(h[:4], 16) % len(FIRST_NAMES)
    last_idx = int(h[4:8], 16) % len(LAST_NAMES)
    return FIRST_NAMES[first_idx], LAST_NAMES[last_idx]


def seed_candidates(conn: sqlite3.Connection, count: int = 500) -> int:
    """Generate synthetic candidate profiles from existing job data.

    Returns the number of candidates inserted.
    """
    conn.row_factory = sqlite3.Row
    # Gather distinct job data
    rows = conn.execute("""
        SELECT DISTINCT company, title, required_skills,
               salary_min, salary_max, location, country, is_remote
        FROM jobs
        WHERE title IS NOT NULL AND company IS NOT NULL
        ORDER BY RANDOM()
        LIMIT ?
    """, (count * 2,)).fetchall()

    if not rows:
        return 0

    seen = set()
    candidates = []
    rng = random.Random(42)  # Deterministic seed for reproducibility

    for row in rows:
        job = dict(row)
        company = job["company"] or "Unknown"
        title = job["title"] or "Software Engineer"
        raw_skills = job.get("required_skills")
        skills = _parse_skills(raw_skills)
        salary_min = job.get("salary_min")
        salary_max = job.get("salary_max")
        location = job.get("location") or "Remote"
        country = job.get("country") or "US"
        is_remote = job.get("is_remote", 1)

        # Generate 1-3 candidates per job
        variants = rng.randint(1, 3)
        for vi in range(variants):
            dedup_key = (company, title, vi)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            first, last = _name_from_hash(f"{company}:{title}", vi)
            full_name = f"{first} {last}"
            experience_years = _derive_experience(title)
            availability = rng.choice(AVAILABILITY_WEIGHTS)

            # Salary variation +/- 10%
            c_sal_min = round(salary_min * rng.uniform(0.9, 1.1), -3) if salary_min else None
            c_sal_max = round(salary_max * rng.uniform(0.9, 1.1), -3) if salary_max else None

            skills_str = ", ".join(skills[:3]) if skills else "software engineering"
            skills_first = skills[0] if skills else "technology"
            template = rng.choice(HEADLINE_TEMPLATES)
            headline = template.format(
                title=title,
                company=company,
                skills_str=skills_str,
                skills_first=skills_first,
                experience_years=experience_years,
            )

            avail_blurb = {
                "active": "Actively looking for new opportunities.",
                "passive": "Open to hearing about the right role.",
                "not_looking": "Not currently looking but always networking.",
            }.get(availability, "")

            summary = (
                f"{experience_years}+ years building {skills_str} solutions. "
                f"Currently {title} at {company}. {avail_blurb}"
            )

            email_domain = company.lower().replace(" ", "").replace(",", "")[:20]
            email = f"{first.lower()}.{last.lower()}@{email_domain}.com"

            candidate_id = str(uuid.uuid4())

            profile_data = json.dumps({
                "source_company": company,
                "source_title": title,
                "generated": True,
            })

            candidates.append((
                candidate_id,
                full_name,
                email,
                headline,
                summary,
                json.dumps(skills),
                experience_years,
                company,
                title,
                location,
                country,
                1 if is_remote else 0,
                c_sal_min,
                c_sal_max,
                availability,
                "synthetic",
                profile_data,
            ))

            if len(candidates) >= count:
                break
        if len(candidates) >= count:
            break

    # Bulk insert
    inserted = 0
    for c in candidates:
        try:
            conn.execute(
                """INSERT INTO candidates
                   (candidate_id, full_name, email, headline, summary, skills,
                    experience_years, current_company, current_title, location,
                    country, is_remote_ok, salary_min, salary_max, availability,
                    source, profile_data)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                c,
            )
            inserted += 1
        except sqlite3.IntegrityError:
            pass  # Duplicate candidate_id — skip
    conn.commit()
    return inserted
