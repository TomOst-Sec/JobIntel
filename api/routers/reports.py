"""Report endpoints."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user
from api.models.reports import ReportMeta, ReportContent
from api.services.report_service import generate_report, get_user_reports, get_report

router = APIRouter()


@router.post("", response_model=ReportContent, status_code=201)
def create_report(
    market_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate an on-demand report."""
    return generate_report(user["id"], market_id, db)


@router.get("", response_model=list[ReportMeta])
def list_reports(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List user's generated reports."""
    return get_user_reports(user["id"], db)


@router.get("/{report_id}", response_model=ReportContent)
def get_report_detail(
    report_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a specific report with full content."""
    try:
        return get_report(report_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
