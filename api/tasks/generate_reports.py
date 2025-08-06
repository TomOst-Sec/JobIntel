"""Background task to generate Claude-powered weekly intelligence reports."""
import json
import logging

from api.db.connection import get_db_connection

logger = logging.getLogger(__name__)


def generate_weekly_reports():
    """Generate the public weekly report and per-user personalized reports."""
    conn = get_db_connection()
    try:
        # Step 1: Generate public report (aggregated across all markets)
        _generate_public_report(conn)

        # Step 2: Generate per-user reports
        _generate_user_reports(conn)

    except Exception as e:
        logger.error(f"Weekly report generation failed: {e}")
    finally:
        conn.close()


def _generate_public_report(conn):
    """Generate the public weekly digest — visible to all, shareable."""
    from api.services.report_generator import (
        generate_weekly_data,
        generate_report_with_claude,
        store_report,
    )

    logger.info("Generating public weekly report...")
    data = generate_weekly_data(conn)
    report = generate_report_with_claude(data, report_type="public")
    report_id = store_report(conn, report, user_id=None, is_public=True)
    logger.info(f"Public weekly report generated (id={report_id}, {report.get('generation_time_ms', 0)}ms)")


def _generate_user_reports(conn):
    """Generate personalized reports for eligible users."""
    from api.services.report_generator import (
        generate_weekly_data,
        generate_report_with_claude,
        store_report,
    )

    # Find users with weekly_email feature
    users = conn.execute("""
        SELECT u.id, u.email, u.full_name, u.role, sp.features
        FROM users u
        JOIN user_subscriptions us ON us.user_id = u.id
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.status = 'active' AND u.is_active = 1
    """).fetchall()

    generated = 0
    for user in users:
        user_dict = dict(user)
        features = json.loads(user_dict["features"])
        if "weekly_email" not in features:
            continue

        try:
            # Use the same global data but generate a personalized report
            data = generate_weekly_data(conn)
            data["user_role"] = user_dict["role"]
            data["user_name"] = user_dict["full_name"]

            report = generate_report_with_claude(data, report_type="user")
            store_report(conn, report, user_id=user_dict["id"], is_public=False)
            generated += 1

            # Send email
            _send_report_email(user_dict, report)

        except Exception as e:
            logger.error(f"Report generation failed for user {user_dict['id']}: {e}")

    logger.info(f"Generated {generated} user weekly reports")


def _send_report_email(user: dict, report: dict):
    """Send the weekly report via email."""
    try:
        from api.services.email_service import send_weekly_report
        send_weekly_report(user["email"], user["full_name"], report)
    except Exception as e:
        logger.warning(f"Failed to email report to {user['email']}: {e}")
