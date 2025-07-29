"""Shared response models."""
from pydantic import BaseModel
from typing import Any, Generic, TypeVar

T = TypeVar("T")


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int
    pages: int
