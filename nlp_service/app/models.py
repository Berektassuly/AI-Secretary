"""Pydantic models for the NLP service API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TextInput(BaseModel):
    """Request payload for task extraction."""

    text: str = Field(..., min_length=1, description="Текст для анализа")


class TasksOutput(BaseModel):
    """Response payload containing extracted tasks."""

    tasks: list[str]


class HealthResponse(BaseModel):
    """Simple health-check response."""

    status: str
