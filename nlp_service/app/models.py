"""Pydantic models for the NLP service API."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .task_types import ActionItem


class TextInput(BaseModel):
    """Request payload for task extraction."""

    text: str = Field(..., min_length=1, description="Текст для анализа")


class ActionItemModel(BaseModel):
    """Structured representation returned to the frontend."""

    summary: str = Field(..., description="Короткое описание задачи")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Уверенность модели в том, что фраза является задачей")
    source: str | None = Field(default=None, description="Исходное предложение из транскрипта")
    assignee: str | None = Field(default=None, description="Ответственный исполнитель, если распознан")
    due: str | None = Field(default=None, description="Дедлайн в формате ISO 8601")
    priority: str | None = Field(default=None, description="Приоритет задачи")
    labels: list[str] = Field(default_factory=list, description="Набор ярлыков для Jira")

    @classmethod
    def from_entity(cls, item: ActionItem) -> "ActionItemModel":
        return cls(**item.to_payload())


class TasksOutput(BaseModel):
    """Response payload containing extracted tasks."""

    tasks: list[ActionItemModel]


class HealthResponse(BaseModel):
    """Simple health-check response."""

    status: str
