"""Outreach message generation service.

Generates personalized recruiting outreach (email/LinkedIn/InMail)
using Claude Sonnet, with a 3-message sequence limit per candidate.
"""
import json
import sqlite3
import uuid
from datetime import datetime

import anthropic

from api.config import get_settings

OUTREACH_PROMPT = """You are an expert tech recruiter writing personalized outreach.

CANDIDATE: {candidate_profile}
ROLE: {search_brief}
CHANNEL: {channel}
TONE: {tone}
SEQUENCE: {sequence_number} of 3
PREVIOUS MESSAGES: {prior_messages}
RECRUITER NOTES: {custom_notes}

Write a {channel} message that:
- Opens with something specific about their background (NOT "I came across your profile")
- Connects their experience to this specific role
- Includes 1-2 compelling reasons to be interested
- Has a clear, low-friction CTA
- Feels human, not templated
- For sequence 2+: references prior outreach and adds new value

Return ONLY valid JSON with no markdown fences:
{{"subject": "...", "body": "..."}}"""


def _get_client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def generate_outreach(
    recruiter_id: int,
    candidate_id: str,
    search_id: str | None,
    channel: str,
    tone: str,
    custom_notes: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Generate a personalized outreach message for a candidate.

    Returns dict matching OutreachResponse schema.
    """
    # Load candidate
    row = conn.execute(
        "SELECT * FROM candidates WHERE candidate_id = ?",
        (candidate_id,),
    ).fetchone()
    if not row:
        raise ValueError("Candidate not found")
    candidate = dict(row)

    # Check sequence count — max 3
    seq_count = conn.execute(
        """SELECT COUNT(*) FROM recruiter_outreach
           WHERE recruiter_id = ? AND candidate_id = ?""",
        (recruiter_id, candidate_id),
    ).fetchone()[0]

    if seq_count >= 3:
        raise ValueError("Maximum 3 outreach messages per candidate reached")

    sequence_number = seq_count + 1

    # Load prior messages for context
    prior_rows = conn.execute(
        """SELECT subject, body, channel, sequence_number FROM recruiter_outreach
           WHERE recruiter_id = ? AND candidate_id = ?
           ORDER BY sequence_number""",
        (recruiter_id, candidate_id),
    ).fetchall()
    prior_messages = json.dumps([dict(r) for r in prior_rows]) if prior_rows else "None"

    # Load search brief if available
    search_brief = "No specific role brief provided."
    if search_id:
        search_row = conn.execute(
            "SELECT brief, parsed_brief FROM recruiter_searches WHERE search_id = ?",
            (search_id,),
        ).fetchone()
        if search_row:
            search_brief = dict(search_row).get("brief", search_brief)

    # Build candidate profile string
    try:
        skills = json.loads(candidate.get("skills") or "[]")
    except (json.JSONDecodeError, TypeError):
        skills = []

    candidate_profile = (
        f"Name: {candidate['full_name']}\n"
        f"Headline: {candidate.get('headline', 'N/A')}\n"
        f"Current: {candidate.get('current_title', '?')} at {candidate.get('current_company', '?')}\n"
        f"Skills: {', '.join(skills)}\n"
        f"Experience: {candidate.get('experience_years', '?')} years\n"
        f"Location: {candidate.get('location', '?')}\n"
        f"Summary: {candidate.get('summary', 'N/A')}"
    )

    prompt = OUTREACH_PROMPT.format(
        candidate_profile=candidate_profile,
        search_brief=search_brief,
        channel=channel,
        tone=tone,
        sequence_number=sequence_number,
        prior_messages=prior_messages,
        custom_notes=custom_notes or "None",
    )

    # Fallback to template if no API key is configured
    settings = get_settings()
    if not settings.anthropic_api_key:
        role_title = candidate.get("current_title", "this role")
        candidate_name = candidate.get("full_name", "there")
        skill_list = ", ".join(skills[:3]) if skills else "your background"
        subject = f"Exciting {role_title} opportunity at [Company]"
        body = (
            f"Hi {candidate_name},\n\n"
            f"I came across your profile and was impressed by your experience "
            f"in {skill_list}. With {candidate.get('experience_years', 'several')} years "
            f"of experience, I believe you would be a strong fit for a {role_title} "
            f"position I am currently hiring for.\n\n"
            f"I would love to schedule a brief call to discuss this opportunity "
            f"and learn more about your career goals.\n\n"
            f"Would you be open to a quick 15-minute conversation this week?\n\n"
            f"Best regards"
        )
        outreach_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO recruiter_outreach
               (outreach_id, recruiter_id, candidate_id, search_id,
                sequence_number, channel, subject, body, tone, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')""",
            (
                outreach_id, recruiter_id, candidate_id, search_id,
                sequence_number, channel, subject, body, tone,
            ),
        )
        conn.commit()
        return {
            "outreach_id": outreach_id,
            "candidate_id": candidate_id,
            "subject": subject,
            "body": body,
            "sequence_number": sequence_number,
            "channel": channel,
            "tone": tone,
            "status": "draft",
            "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        }

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()

    # Parse JSON response
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    try:
        result = json.loads(text)
        subject = result.get("subject", "")
        body = result.get("body", text)
    except json.JSONDecodeError:
        subject = f"Opportunity: {candidate.get('current_title', 'Role')}"
        body = text

    outreach_id = str(uuid.uuid4())

    conn.execute(
        """INSERT INTO recruiter_outreach
           (outreach_id, recruiter_id, candidate_id, search_id,
            sequence_number, channel, subject, body, tone, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')""",
        (
            outreach_id, recruiter_id, candidate_id, search_id,
            sequence_number, channel, subject, body, tone,
        ),
    )
    conn.commit()

    return {
        "outreach_id": outreach_id,
        "candidate_id": candidate_id,
        "subject": subject,
        "body": body,
        "sequence_number": sequence_number,
        "channel": channel,
        "tone": tone,
        "status": "draft",
        "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
    }


def update_outreach_status(
    outreach_id: str,
    status: str,
    conn: sqlite3.Connection,
) -> dict:
    """Update outreach status to sent/opened/replied."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    timestamp_field = {
        "sent": "sent_at",
        "opened": "opened_at",
        "replied": "replied_at",
    }.get(status)

    if timestamp_field:
        conn.execute(
            f"UPDATE recruiter_outreach SET status = ?, {timestamp_field} = ? WHERE outreach_id = ?",
            (status, now, outreach_id),
        )
    else:
        conn.execute(
            "UPDATE recruiter_outreach SET status = ? WHERE outreach_id = ?",
            (status, outreach_id),
        )
    conn.commit()

    row = conn.execute(
        "SELECT * FROM recruiter_outreach WHERE outreach_id = ?",
        (outreach_id,),
    ).fetchone()
    return dict(row) if row else {}


def get_outreach_stats(recruiter_id: int, conn: sqlite3.Connection) -> dict:
    """Get outreach analytics for a recruiter."""
    total = conn.execute(
        "SELECT COUNT(*) FROM recruiter_outreach WHERE recruiter_id = ?",
        (recruiter_id,),
    ).fetchone()[0]
    drafts = conn.execute(
        "SELECT COUNT(*) FROM recruiter_outreach WHERE recruiter_id = ? AND status = 'draft'",
        (recruiter_id,),
    ).fetchone()[0]
    sent = conn.execute(
        "SELECT COUNT(*) FROM recruiter_outreach WHERE recruiter_id = ? AND status IN ('sent', 'opened', 'replied')",
        (recruiter_id,),
    ).fetchone()[0]
    opened = conn.execute(
        "SELECT COUNT(*) FROM recruiter_outreach WHERE recruiter_id = ? AND status IN ('opened', 'replied')",
        (recruiter_id,),
    ).fetchone()[0]
    replied = conn.execute(
        "SELECT COUNT(*) FROM recruiter_outreach WHERE recruiter_id = ? AND status = 'replied'",
        (recruiter_id,),
    ).fetchone()[0]

    return {
        "total": total,
        "drafts": drafts,
        "sent": sent,
        "opened": opened,
        "replied": replied,
        "open_rate": round(opened / sent * 100, 1) if sent > 0 else 0.0,
        "reply_rate": round(replied / sent * 100, 1) if sent > 0 else 0.0,
    }
