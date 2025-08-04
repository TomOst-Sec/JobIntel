"""Translation Service — language detection and technical translation for non-English jobs.

Uses Claude for high-quality technical translations with domain-specific
term preservation (framework names, company names, skill identifiers).
Falls back to template-based summaries when no API calls are desired.
"""
import json
import re
import sqlite3
from datetime import datetime

import anthropic

from api.config import get_settings


# Language detection heuristics (character ranges + common words)
LANGUAGE_PATTERNS = {
    "he": {
        "chars": r"[\u0590-\u05FF]",  # Hebrew
        "words": ["משרה", "דרישות", "ניסיון", "חברה", "תואר"],
    },
    "hi": {
        "chars": r"[\u0900-\u097F]",  # Devanagari
        "words": ["अनुभव", "कंपनी", "नौकरी"],
    },
    "ar": {
        "chars": r"[\u0600-\u06FF]",  # Arabic
        "words": ["الخبرة", "وظيفة", "الشركة", "المتطلبات"],
    },
    "zh": {
        "chars": r"[\u4E00-\u9FFF]",  # Chinese
        "words": ["经验", "公司", "要求", "职位"],
    },
    "ja": {
        "chars": r"[\u3040-\u309F\u30A0-\u30FF]",  # Hiragana + Katakana
        "words": ["経験", "会社", "開発"],
    },
    "ko": {
        "chars": r"[\uAC00-\uD7AF]",  # Korean Hangul
        "words": ["경험", "회사", "개발"],
    },
    "de": {
        "chars": None,
        "words": ["Berufserfahrung", "Anforderungen", "Stellenbeschreibung", "Unternehmen", "und", "Erfahrung"],
    },
    "fr": {
        "chars": None,
        "words": ["expérience", "entreprise", "exigences", "poste", "compétences"],
    },
    "es": {
        "chars": None,
        "words": ["experiencia", "empresa", "requisitos", "puesto", "habilidades"],
    },
    "pt": {
        "chars": None,
        "words": ["experiência", "empresa", "requisitos", "vaga", "habilidades", "você"],
    },
    "uk": {
        "chars": r"[\u0400-\u04FF]",  # Cyrillic (broad)
        "words": ["досвід", "вимоги", "компанія", "вакансія"],
    },
    "pl": {
        "chars": None,
        "words": ["doświadczenie", "wymagania", "firma", "stanowisko", "umiejętności"],
    },
    "ru": {
        "chars": r"[\u0400-\u04FF]",
        "words": ["опыт", "требования", "компания", "вакансия"],
    },
}


def detect_language(text: str) -> str:
    """Detect language of text. Returns ISO 639-1 code or 'en'."""
    if not text or len(text.strip()) < 20:
        return "en"

    text_lower = text.lower()

    # Check character-based patterns first (most reliable)
    for lang, patterns in LANGUAGE_PATTERNS.items():
        if patterns["chars"]:
            matches = re.findall(patterns["chars"], text)
            if len(matches) > len(text) * 0.1:
                return lang

    # Fall back to word-based detection
    scores: dict[str, int] = {}
    for lang, patterns in LANGUAGE_PATTERNS.items():
        score = sum(1 for w in patterns["words"] if w.lower() in text_lower)
        if score > 0:
            scores[lang] = score

    if scores:
        best_lang = max(scores, key=scores.get)  # type: ignore[arg-type]
        if scores[best_lang] >= 2:
            return best_lang

    return "en"


def translate_job(
    job_id: str,
    title: str,
    description: str,
    requirements: str | None,
    skills: list[str] | None,
    source_language: str | None,
    conn: sqlite3.Connection,
    use_ai: bool = True,
) -> dict:
    """Translate a non-English job posting to English.

    Returns dict with translated fields. Caches in translation_cache table.
    """
    # Check cache first
    cached = conn.execute(
        "SELECT * FROM translation_cache WHERE job_id = ? LIMIT 1",
        (job_id,),
    ).fetchone()
    if cached:
        return dict(cached)

    # Detect language if not provided
    combined_text = f"{title} {description or ''}"
    if not source_language:
        source_language = detect_language(combined_text)

    if source_language == "en":
        return {
            "job_id": job_id,
            "source_language": "en",
            "translated_title": title,
            "translated_description": description,
            "translated_requirements": requirements,
            "translated_skills": json.dumps(skills) if skills else None,
            "translation_method": "none",
            "translation_quality": 1.0,
        }

    if use_ai:
        result = _translate_with_claude(
            job_id, title, description, requirements, skills, source_language
        )
    else:
        result = _translate_basic(
            job_id, title, description, requirements, skills, source_language
        )

    # Cache translation
    conn.execute(
        """INSERT OR REPLACE INTO translation_cache
           (job_id, source_language, translated_title, translated_description,
            translated_requirements, translated_skills, translation_method,
            translation_quality)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            job_id, source_language,
            result["translated_title"],
            result["translated_description"],
            result["translated_requirements"],
            result["translated_skills"],
            result["translation_method"],
            result["translation_quality"],
        ),
    )
    conn.commit()

    return result


def _translate_with_claude(
    job_id: str,
    title: str,
    description: str,
    requirements: str | None,
    skills: list[str] | None,
    source_language: str,
) -> dict:
    """Translate using Claude with technical term preservation."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = f"""Translate this job posting from {source_language} to English.

IMPORTANT RULES:
- Preserve company names, product names, and framework/tool names exactly (e.g., "React", "AWS", "Kubernetes")
- Preserve salary figures and currencies
- Translate technical terms to their standard English equivalents
- Keep the professional tone

TITLE: {title}

DESCRIPTION:
{description or '(none)'}

REQUIREMENTS:
{requirements or '(none)'}

SKILLS: {', '.join(skills) if skills else '(none)'}

Return JSON:
{{
    "translated_title": "...",
    "translated_description": "...",
    "translated_requirements": "...",
    "translated_skills": ["skill1", "skill2", ...]
}}"""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        # Extract JSON
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        parsed = json.loads(text)
        return {
            "job_id": job_id,
            "source_language": source_language,
            "translated_title": parsed.get("translated_title", title),
            "translated_description": parsed.get("translated_description", description),
            "translated_requirements": parsed.get("translated_requirements", requirements),
            "translated_skills": json.dumps(parsed.get("translated_skills", skills)),
            "translation_method": "claude",
            "translation_quality": 0.9,
        }
    except Exception:
        return _translate_basic(job_id, title, description, requirements, skills, source_language)


def _translate_basic(
    job_id: str,
    title: str,
    description: str,
    requirements: str | None,
    skills: list[str] | None,
    source_language: str,
) -> dict:
    """Basic fallback: return originals with language tag."""
    return {
        "job_id": job_id,
        "source_language": source_language,
        "translated_title": f"[{source_language.upper()}] {title}",
        "translated_description": description,
        "translated_requirements": requirements,
        "translated_skills": json.dumps(skills) if skills else None,
        "translation_method": "passthrough",
        "translation_quality": 0.1,
    }


def batch_translate(conn: sqlite3.Connection, limit: int = 50, use_ai: bool = True) -> dict:
    """Translate untranslated non-English jobs."""
    # Find jobs not yet translated
    rows = conn.execute(
        """SELECT j.job_id, j.title, j.description, j.required_skills
           FROM jobs j
           LEFT JOIN translation_cache tc ON j.job_id = tc.job_id
           WHERE tc.job_id IS NULL
           ORDER BY j.scraped_at DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()

    results = {"translated": 0, "skipped_english": 0, "failed": 0}
    for row in rows:
        r = dict(row)
        combined = f"{r['title']} {r.get('description', '') or ''}"
        lang = detect_language(combined)

        if lang == "en":
            results["skipped_english"] += 1
            continue

        try:
            skills = [s.strip() for s in (r.get("required_skills") or "").split(",") if s.strip()]
            translate_job(
                r["job_id"], r["title"], r.get("description", ""),
                None, skills, lang, conn, use_ai=use_ai,
            )
            results["translated"] += 1
        except Exception:
            results["failed"] += 1

    return results


def get_translation_stats(conn: sqlite3.Connection) -> dict:
    """Get translation statistics."""
    rows = conn.execute(
        """SELECT source_language, translation_method, COUNT(*) as cnt,
                  AVG(translation_quality) as avg_quality
           FROM translation_cache
           GROUP BY source_language, translation_method"""
    ).fetchall()

    by_language: dict[str, dict] = {}
    total = 0
    for row in rows:
        r = dict(row)
        lang = r["source_language"]
        if lang not in by_language:
            by_language[lang] = {"count": 0, "methods": {}}
        by_language[lang]["count"] += r["cnt"]
        by_language[lang]["methods"][r["translation_method"]] = {
            "count": r["cnt"],
            "avg_quality": round(r["avg_quality"], 2) if r["avg_quality"] else None,
        }
        total += r["cnt"]

    return {"total_translations": total, "by_language": by_language}
