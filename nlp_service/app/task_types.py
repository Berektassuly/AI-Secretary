"""Domain entities used by the NLP service."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ActionItem:
    """Structured representation of an actionable meeting task."""

    summary: str
    confidence: float
    source: Optional[str] = None
    assignee: Optional[str] = None
    due: Optional[str] = None
    priority: Optional[str] = None
    labels: List[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, object]:
        """Convert the dataclass into a serialisable dictionary."""

        return {
            "summary": self.summary,
            "confidence": round(self.confidence, 4),
            "source": self.source,
            "assignee": self.assignee,
            "due": self.due,
            "priority": self.priority,
            "labels": list(self.labels),
        }
