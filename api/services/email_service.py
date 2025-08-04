"""Email service using Resend."""
import logging

from api.config import get_settings

logger = logging.getLogger(__name__)


def _get_client():
    settings = get_settings()
    if not settings.resend_api_key:
        return None
    import resend
    resend.api_key = settings.resend_api_key
    return resend


def send_welcome_email(to_email: str, name: str):
    """Send welcome email to new users."""
    resend = _get_client()
    if not resend:
        logger.info(f"Email skipped (no API key): welcome to {to_email}")
        return

    settings = get_settings()
    resend.Emails.send({
        "from": settings.from_email,
        "to": to_email,
        "subject": f"Welcome to JobIntel, {name}!",
        "html": f"""
        <h2>Welcome to JobIntel!</h2>
        <p>Hi {name},</p>
        <p>You now have access to AI-powered hiring intelligence.</p>
        <p><a href="{settings.app_url}/dashboard">Go to your dashboard</a></p>
        <p>— The JobIntel Team</p>
        """,
    })


def send_weekly_report(to_email: str, name: str, report: dict):
    """Send weekly intelligence report via email — structured format with sections."""
    resend = _get_client()
    if not resend:
        logger.info(f"Email skipped (no API key): weekly report to {to_email}")
        return

    settings = get_settings()
    title = report.get("title", "Weekly Intelligence Report")
    summary = report.get("summary", "")
    sections = report.get("sections", [])
    hot_take = report.get("hot_take", "")
    public_slug = report.get("public_slug", "")

    # Build sections HTML
    sections_html = ""
    for section in sections:
        heading = section.get("heading", "")
        body = section.get("body", "")
        highlights = section.get("highlights", [])

        highlights_html = ""
        if highlights:
            highlights_html = "<ul>" + "".join(
                f"<li style='color:#a5b4fc;margin:4px 0'>{h}</li>" for h in highlights
            ) + "</ul>"

        # Convert markdown-style bold to HTML
        import re
        body_html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', body)
        body_html = body_html.replace('\n', '<br>')

        sections_html += f"""
        <div style="margin-bottom:24px;padding:16px;background:#1a1a2e;border-radius:8px;border-left:3px solid #6366f1">
            <h3 style="color:#e0e0ff;margin:0 0 8px 0;font-size:16px">{heading}</h3>
            <div style="color:#c0c0d0;font-size:14px;line-height:1.6">{body_html}</div>
            {highlights_html}
        </div>
        """

    # Hot take section
    hot_take_html = ""
    if hot_take:
        hot_take_html = f"""
        <div style="margin:24px 0;padding:16px;background:#2d1b4e;border-radius:8px;border:1px solid #7c3aed">
            <h3 style="color:#c4b5fd;margin:0 0 8px 0">Hot Take</h3>
            <p style="color:#e0d0ff;font-style:italic;margin:0">{hot_take}</p>
        </div>
        """

    # Public report link
    public_link_html = ""
    if public_slug:
        public_link_html = f"""
        <p style="text-align:center;margin:16px 0">
            <a href="{settings.app_url}/reports/weekly/{public_slug}"
               style="color:#818cf8;text-decoration:underline">View full report online</a>
            &nbsp;|&nbsp;
            <a href="{settings.app_url}/reports/weekly/{public_slug}"
               style="color:#818cf8;text-decoration:underline">Share this report</a>
        </p>
        """

    resend.Emails.send({
        "from": settings.from_email,
        "to": to_email,
        "subject": f"JobIntel: {title}",
        "html": f"""
        <div style="max-width:640px;margin:0 auto;background:#0a0a1a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px">
            <div style="text-align:center;margin-bottom:24px">
                <h1 style="color:#fff;font-size:24px;margin:0">Job<span style="color:#818cf8">Intel</span></h1>
                <p style="color:#888;font-size:12px;margin:4px 0">Weekly Intelligence Report</p>
            </div>

            <h2 style="color:#fff;font-size:20px;margin-bottom:8px">{title}</h2>
            <p style="color:#a0a0b0;font-size:15px;line-height:1.5;margin-bottom:24px">{summary}</p>

            {sections_html}
            {hot_take_html}
            {public_link_html}

            <hr style="border:none;border-top:1px solid #333;margin:24px 0">
            <p style="text-align:center;color:#666;font-size:12px">
                <a href="{settings.app_url}/dashboard" style="color:#818cf8">Dashboard</a> |
                <a href="{settings.app_url}/ghost-check" style="color:#818cf8">Ghost Checker</a> |
                <a href="{settings.app_url}/salary-check" style="color:#818cf8">Salary Check</a>
            </p>
            <p style="text-align:center;color:#555;font-size:11px">JobIntel — AI-Powered Hiring Intelligence</p>
        </div>
        """,
    })


def send_alert_notification(to_email: str, name: str, alert_type: str, payload: dict):
    """Send an alert trigger notification."""
    resend = _get_client()
    if not resend:
        logger.info(f"Email skipped (no API key): alert to {to_email}")
        return

    settings = get_settings()
    resend.Emails.send({
        "from": settings.from_email,
        "to": to_email,
        "subject": f"JobIntel Alert: {alert_type}",
        "html": f"""
        <h2>Alert Triggered: {alert_type}</h2>
        <p>Hi {name},</p>
        <p>Your alert has been triggered. Check your dashboard for details.</p>
        <p><a href="{settings.app_url}/dashboard">View alerts</a></p>
        <p>— JobIntel AI</p>
        """,
    })
