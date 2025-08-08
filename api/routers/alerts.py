"""Alert CRUD and trigger endpoints."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user
from api.models.alerts import AlertCreate, AlertUpdate, AlertResponse, AlertTriggerResponse
from api.services.alert_service import (
    create_alert, update_alert, delete_alert,
    get_user_alerts, get_triggers, mark_trigger_read,
)

router = APIRouter()


@router.post("", response_model=AlertResponse, status_code=201)
def create(
    body: AlertCreate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    alert = create_alert(user["id"], body.alert_type, body.conditions, body.delivery, db)
    return alert


@router.get("", response_model=list[AlertResponse])
def list_alerts(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    return get_user_alerts(user["id"], db)


@router.put("/{alert_id}", response_model=AlertResponse)
def update(
    alert_id: int,
    body: AlertUpdate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    try:
        return update_alert(alert_id, user["id"], body.model_dump(exclude_unset=True), db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{alert_id}", status_code=204)
def delete(
    alert_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    try:
        delete_alert(alert_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/triggers", response_model=list[AlertTriggerResponse])
def list_triggers(
    unread_only: bool = Query(False),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    return get_triggers(user["id"], unread_only, db)


@router.post("/triggers/{trigger_id}/read", status_code=204)
def mark_read(
    trigger_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    mark_trigger_read(trigger_id, user["id"], db)
