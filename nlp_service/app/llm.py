"""Open-source LLM powered enrichment of extracted tasks."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Any, Optional

from .task_types import ActionItem

logger = logging.getLogger(__name__)

try:  # pragma: no cover - optional dependency guard
    from transformers import (  # type: ignore[import-not-found]
        AutoModelForCausalLM,
        AutoTokenizer,
        pipeline,
    )
except Exception as exc:  # pragma: no cover - runtime fallback
    AutoModelForCausalLM = None  # type: ignore[assignment]
    AutoTokenizer = None  # type: ignore[assignment]
    pipeline = None  # type: ignore[assignment]
    logger.warning("Transformers text-generation stack unavailable: %s", exc)


RELATIVE_KEYWORDS = {
    "сегодня": 0,
    "завтра": 1,
    "послезавтра": 2,
    "tomorrow": 1,
    "today": 0,
    "next week": 7,
    "next sprint": 14,
}

WEEKDAY_INDEX = {
    "понедельник": 0,
    "вторник": 1,
    "среда": 2,
    "четверг": 3,
    "пятница": 4,
    "суббота": 5,
    "воскресенье": 6,
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

LABEL_KEYWORDS = {
    "design": ["design", "макет", "ui", "ux"],
    "research": ["research", "исслед"],
    "development": ["deploy", "развер", "develop", "implement", "код"],
    "documentation": ["докум", "опис", "document"],
    "sales": ["client", "клиент", "sales", "предлож"],
    "marketing": ["маркет", "кампан", "ads"],
    "ops": ["infra", "инфра", "ops", "поддерж"],
}

MONTH_NAME_MAP = {
    "январ": 1,
    "феврал": 2,
    "март": 3,
    "апрел": 4,
    "май": 5,
    "мая": 5,
    "июн": 6,
    "июл": 7,
    "август": 8,
    "сентябр": 9,
    "октябр": 10,
    "ноябр": 11,
    "декабр": 12,
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}

DATE_PATTERNS = ["%d.%m.%Y", "%d.%m.%y", "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"]


def _resolve_llm_path() -> tuple[str, bool]:
    local_dir = os.getenv("OPEN_SOURCE_LLM_DIR")
    if local_dir and os.path.isdir(local_dir):
        return local_dir, True
    model_id = os.getenv("OPEN_SOURCE_LLM_ID", "TinyLlama/TinyLlama-1.1B-Chat-v1.0")
    return model_id, False


class LLMTaskEnricher:
    """Use an open-source LLM (TinyLlama by default) to enrich tasks."""

    def __init__(self) -> None:
        self._generator: Any = None
        self._tokenizer: Any = None
        self._max_new_tokens = int(os.getenv("OPEN_SOURCE_LLM_MAX_NEW_TOKENS", "256"))
        self._temperature = float(os.getenv("OPEN_SOURCE_LLM_TEMPERATURE", "0.0"))
        self._disabled = os.getenv("OPEN_SOURCE_LLM_DISABLED") == "1"

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def startup(self) -> None:
        if self._generator is not None:
            return
        if self._disabled:
            logger.info("Open-source LLM enrichment explicitly disabled via OPEN_SOURCE_LLM_DISABLED")
            return
        if pipeline is None or AutoTokenizer is None or AutoModelForCausalLM is None:
            logger.warning("Transformers pipeline is unavailable, falling back to heuristics")
            return

        model_path, local_only = _resolve_llm_path()
        try:
            tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=local_only)
            model = AutoModelForCausalLM.from_pretrained(model_path, local_files_only=local_only)
            self._generator = pipeline(
                "text-generation",
                model=model,
                tokenizer=tokenizer,
                device_map="auto" if hasattr(model, "to") else None,
                max_new_tokens=self._max_new_tokens,
                temperature=self._temperature,
                do_sample=self._temperature > 0,
            )
            self._tokenizer = tokenizer
            logger.info("Loaded open-source LLM for enrichment from %s", model_path)
        except Exception as exc:  # pragma: no cover - depends on environment
            self._generator = None
            self._tokenizer = None
            logger.warning("Failed to initialise open-source LLM: %s", exc)

    def shutdown(self) -> None:
        self._generator = None
        self._tokenizer = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def enrich(self, item: ActionItem, context: str) -> ActionItem:
        if self._generator is None:
            return self._fallback_enrich(item, context)

        prompt = self._build_prompt(item.summary, context)
        try:
            outputs = self._generator(
                prompt,
                max_new_tokens=self._max_new_tokens,
                pad_token_id=self._tokenizer.eos_token_id if self._tokenizer else None,
            )
        except Exception as exc:  # pragma: no cover - runtime fallback
            logger.warning("Open-source LLM enrichment failed: %s", exc)
            return self._fallback_enrich(item, context)

        generated = outputs[0]["generated_text"] if outputs else ""
        cleaned = generated[len(prompt) :] if generated.startswith(prompt) else generated
        payload = self._extract_json(cleaned)
        if payload is None:
            logger.debug("LLM returned non-JSON payload: %s", cleaned)
            return self._fallback_enrich(item, context)

        enriched = ActionItem(
            summary=item.summary,
            confidence=item.confidence,
            source=item.source,
            assignee=self._safe_strip(payload.get("assignee")),
            due=self._normalise_due(payload.get("due")),
            priority=self._safe_strip(payload.get("priority")),
            labels=self._normalise_labels(payload.get("labels")),
        )
        return enriched

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _build_prompt(task: str, context: str) -> str:
        return (
            "You are an assistant that prepares Jira tasks from meeting transcripts.\n"
            "Analyse the action item highlighted below and respond with a compact JSON object that contains the keys"
            " summary, assignee, due, priority and labels.\n"
            "- summary: rephrase the task in 1 short sentence (<= 20 words).\n"
            "- assignee: person responsible, based on names or mentions. Use null if unknown.\n"
            "- due: ISO date (YYYY-MM-DD) if a deadline is present, otherwise null.\n"
            "- priority: High/Medium/Low (or other Jira-friendly value) derived from urgency cues.\n"
            "- labels: array of 1-3 lowercase tags with no spaces.\n"
            "Meeting context: "
            f"{context}\n"
            "Action item: "
            f"{task}\n"
            "JSON:"
        )

    @staticmethod
    def _safe_strip(value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _normalise_labels(self, value: Any) -> list[str]:
        if value is None:
            return self._heuristic_labels("")
        if isinstance(value, list):
            labels = [str(item).strip().lower().replace(" ", "-") for item in value if str(item).strip()]
        else:
            labels = [str(value).strip().lower().replace(" ", "-")]
        labels = [label for label in labels if label]
        return labels or self._heuristic_labels("")

    def _normalise_due(self, value: Any) -> Optional[str]:
        if value in (None, "", "null", "None"):
            return None
        if isinstance(value, (int, float)):
            try:
                return datetime.utcfromtimestamp(float(value)).date().isoformat()
            except Exception:  # pragma: no cover - defensive
                return None
        if isinstance(value, dict):
            date_candidate = value.get("date") or value.get("due")
            return self._normalise_due(date_candidate)
        if isinstance(value, list) and value:
            return self._normalise_due(value[0])
        if isinstance(value, str):
            text = value.strip()
            parsed_relative = self._parse_relative_keyword(text.lower())
            if parsed_relative:
                return parsed_relative
            explicit = self._parse_explicit_date(text)
            if explicit:
                return explicit
        return None

    def _parse_relative_keyword(self, text: str) -> Optional[str]:
        today = datetime.utcnow().date()
        for key, offset in RELATIVE_KEYWORDS.items():
            if key in text:
                return (today + timedelta(days=offset)).isoformat()
        for key, weekday_index in WEEKDAY_INDEX.items():
            if key in text:
                days_ahead = (weekday_index - today.weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7
                return (today + timedelta(days=days_ahead)).isoformat()
        return None

    def _heuristic_labels(self, text: str) -> list[str]:
        detected: set[str] = set()
        lower_text = text.lower()
        for label, patterns in LABEL_KEYWORDS.items():
            if any(pattern in lower_text for pattern in patterns):
                detected.add(label)
        return sorted(detected)

    def _fallback_enrich(self, item: ActionItem, context: str) -> ActionItem:
        summary = self._fallback_summary(item.summary)
        priority = self._fallback_priority(item.summary)
        due = self._heuristic_due(context, item.summary)
        assignee = self._heuristic_assignee(context, item.summary)
        labels = self._heuristic_labels(item.summary + " " + context)
        return ActionItem(
            summary=summary,
            confidence=item.confidence,
            source=item.source,
            assignee=assignee,
            due=due,
            priority=priority,
            labels=labels,
        )

    @staticmethod
    def _fallback_summary(summary: str) -> str:
        summary = summary.strip()
        if len(summary.split()) <= 20:
            return summary
        return " ".join(summary.split()[:20])

    @staticmethod
    def _fallback_priority(text: str) -> Optional[str]:
        lower = text.lower()
        if any(word in lower for word in ["urgent", "сроч", "критич"]):
            return "High"
        if any(word in lower for word in ["потом", "later", "low priority"]):
            return "Low"
        return "Medium"

    def _heuristic_due(self, context: str, summary: str) -> Optional[str]:
        text = f"{summary}. {context}".lower()
        for keyword, offset in RELATIVE_KEYWORDS.items():
            if keyword in text:
                return (datetime.utcnow().date() + timedelta(days=offset)).isoformat()
        date_pattern = re.search(r"(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)", text)
        if date_pattern:
            explicit = self._parse_explicit_date(date_pattern.group(1))
            if explicit:
                return explicit
        for keyword, weekday_index in WEEKDAY_INDEX.items():
            if keyword in text:
                today = datetime.utcnow().date()
                days_ahead = (weekday_index - today.weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7
                return (today + timedelta(days=days_ahead)).isoformat()
        return None

    @staticmethod
    def _heuristic_assignee(context: str, summary: str) -> Optional[str]:
        pattern = re.compile(r"(@?[A-ZА-ЯЁ][a-zа-яё]+)")
        for chunk in (summary, context):
            match = pattern.search(chunk)
            if match:
                value = match.group(1).lstrip("@")
                if value.lower() not in {"we", "i", "он", "она", "они"}:
                    return value
        return None

    @staticmethod
    def _extract_json(text: str) -> Optional[dict[str, Any]]:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        candidate = match.group(0)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            try:
                cleaned = candidate.replace("'", '"')
                return json.loads(cleaned)
            except Exception:  # pragma: no cover - depends on input
                return None

    def _parse_explicit_date(self, text: str) -> Optional[str]:
        cleaned = text.strip()
        for pattern in DATE_PATTERNS:
            try:
                parsed = datetime.strptime(cleaned, pattern)
                year = parsed.year if parsed.year != 1900 else datetime.utcnow().year
                parsed = parsed.replace(year=year)
                return parsed.date().isoformat()
            except ValueError:
                continue

        month_match = re.search(r"(\d{1,2})\s+([A-Za-zА-Яа-яё]+)", cleaned)
        if month_match:
            day = int(month_match.group(1))
            month_token = month_match.group(2).lower()
            for token, month in MONTH_NAME_MAP.items():
                if token in month_token:
                    year_match = re.search(r"(\d{4})", cleaned)
                    year = int(year_match.group(1)) if year_match else datetime.utcnow().year
                    try:
                        candidate_date = datetime(year, month, day)
                    except ValueError:
                        return None
                    if candidate_date.date() < datetime.utcnow().date():
                        candidate_date = candidate_date.replace(year=year + 1)
                    return candidate_date.date().isoformat()
        return None
