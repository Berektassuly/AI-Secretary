"""Core task extraction logic used by the FastAPI service."""

from __future__ import annotations

import logging
import os
import re
import threading
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

try:  # pragma: no cover - optional dependency guard
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
except Exception as exc:  # pragma: no cover - runtime fallback
    torch = None  # type: ignore[assignment]
    AutoModelForSequenceClassification = None  # type: ignore[assignment]
    AutoTokenizer = None  # type: ignore[assignment]
    logger.warning("Transformers stack is unavailable: %s", exc)


LANGUAGE_HYPOTHESES = {
    "ru": "Это конкретное поручение, которое нужно выполнить.",
    "en": "This is an actionable task to be done.",
}

VERB_RE = re.compile(
    r"(провести|подготовить|отправить|создать|написать|проверить|созвониться|добавить|исправить|закрыть|запланировать|"
    r"согласовать|обновить|описать|развернуть|подключить|оформить|назначить|организовать|презентовать|ожидать|"
    r"собрать|дать|выполнить|подтвердить|утвердить|поделиться|скинуть|зафиксировать|напомнить|подвести итоги|"
    r"review|plan|schedule|deploy|implement|prepare|send|create|write|check|fix|update|investigate|present|follow up)",
    flags=re.IGNORECASE,
)

COMPOUND_SEPARATORS = re.compile(
    r"\b(и|а также|затем|после этого|потом|далее|and then|and)\b",
    flags=re.IGNORECASE,
)

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|[\n\r]+|•\s*| - ")

MAX_TASK_WORDS = 16
MAX_TASK_LENGTH = 140


@dataclass
class ModelBundle:
    """Container that keeps tokenizer/model pairs in memory."""

    tokenizer: "AutoTokenizer"  # type: ignore[name-defined]
    model: "AutoModelForSequenceClassification"  # type: ignore[name-defined]


class ExtractionError(RuntimeError):
    """Raised when task extraction cannot be performed."""


class TaskExtractor:
    """High-level facade that encapsulates all extraction steps."""

    def __init__(self, entail_threshold: float = 0.60) -> None:
        self._entail_threshold = entail_threshold
        self._models: Dict[str, Optional[ModelBundle]] = {}
        self._lock = threading.Lock()
        self._initialised = False

    # ------------------------------------------------------------------
    # Lifecycle management
    # ------------------------------------------------------------------
    def startup(self) -> None:
        """Load heavy ML artefacts into memory."""

        with self._lock:
            if self._initialised:
                return
            self._models = self._load_models()
            self._initialised = True
            logger.info("TaskExtractor initialised with models: %s", list(self._models))

    def shutdown(self) -> None:
        """Placeholder for releasing resources."""

        with self._lock:
            self._models.clear()
            self._initialised = False
            logger.info("TaskExtractor has been shut down")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def extract_tasks(self, text: str) -> List[str]:
        if not text.strip():
            return []

        lang = detect_lang_code(text)
        candidates = candidate_actions(text)
        if not candidates:
            return []

        results: List[str] = []
        for candidate in candidates:
            cleaned = clean_candidate(candidate)
            if not cleaned:
                continue
            if self._should_keep(cleaned, lang):
                results.append(cleaned)

        # Deduplicate while preserving order
        seen: set[str] = set()
        deduped: List[str] = []
        for task in results:
            if task not in seen:
                seen.add(task)
                deduped.append(task)
        return deduped

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _should_keep(self, text: str, lang: str) -> bool:
        bundle = self._models.get("ru" if lang == "ru" else "en")
        if bundle is None:
            # No model available for language – fallback to heuristic acceptance
            return True

        if torch is None:
            return True

        inputs = bundle.tokenizer(
            [text],
            [LANGUAGE_HYPOTHESES.get(lang, LANGUAGE_HYPOTHESES["en"])],
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=256,
        )
        with torch.inference_mode():  # type: ignore[attr-defined]
            logits = bundle.model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1)
            entail_prob = float(probs[-1])
        return entail_prob >= self._entail_threshold

    def _load_models(self) -> Dict[str, Optional[ModelBundle]]:
        models: Dict[str, Optional[ModelBundle]] = {"ru": None, "en": None}
        if AutoTokenizer is None or AutoModelForSequenceClassification is None:
            logger.warning("Transformers are unavailable, skipping model loading")
            return models

        registry = {
            "ru": (
                os.getenv("RU_NLI_MODEL_DIR", "models/nli-ru"),
                os.getenv("RU_NLI_MODEL_NAME", "cointegrated/rubert-base-cased-nli-threeway"),
            ),
            "en": (
                os.getenv("EN_NLI_MODEL_DIR", "models/nli-en"),
                os.getenv("EN_NLI_MODEL_NAME", "facebook/bart-large-mnli"),
            ),
        }

        for lang, (local_dir, remote_name) in registry.items():
            path = local_dir if os.path.isdir(local_dir) else remote_name
            local_only = os.path.isdir(local_dir)
            try:
                tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=local_only)
                model = AutoModelForSequenceClassification.from_pretrained(
                    path, local_files_only=local_only
                )
                models[lang] = ModelBundle(tokenizer=tokenizer, model=model)
                logger.info("Loaded NLI model for %s from %s", lang, path)
            except Exception as exc:  # pragma: no cover - depends on environment
                models[lang] = None
                logger.warning("Failed to load NLI model for %s: %s", lang, exc)

        return models


# ----------------------------------------------------------------------
# Text processing utilities
# ----------------------------------------------------------------------

def detect_lang_code(text: str) -> str:
    """Rudimentary language detection between RU and EN."""

    cyr = sum("а" <= ch.lower() <= "я" or ch == "ё" for ch in text)
    lat = sum("a" <= ch.lower() <= "z" for ch in text)
    return "ru" if cyr >= lat else "en"


def split_sentences(text: str) -> Iterable[str]:
    for sentence in SENTENCE_SPLIT_RE.split(text.strip()):
        cleaned = sentence.strip(" \t-—•")
        if len(cleaned) > 2:
            yield cleaned


def expand_compounds(sentence: str) -> Iterable[str]:
    parts = [part.strip(" ,.;:—-") for part in COMPOUND_SEPARATORS.split(sentence)]
    for part in parts:
        if COMPOUND_SEPARATORS.fullmatch(part):
            continue
        if part:
            yield part


def candidate_actions(text: str) -> List[str]:
    results: List[str] = []
    for sentence in split_sentences(text):
        if VERB_RE.search(sentence) is None:
            continue
        for fragment in expand_compounds(sentence):
            normalized = re.sub(r"(?i)\b(нужно|надо|будет|давайте|давай|предлагаю|let's|let us)\s+", "", fragment)
            match = VERB_RE.search(normalized)
            if match:
                normalized = normalized[match.start() :]
            normalized = re.split(r"[.;!?]", normalized)[0].strip(" ,.;:—-")
            words = normalized.split()
            if len(words) > MAX_TASK_WORDS:
                normalized = " ".join(words[:MAX_TASK_WORDS])
            if len(normalized) >= 3:
                results.append(normalized)
    return results


def clean_candidate(candidate: str) -> str:
    cleaned = re.sub(r"(?i)^(прошу|нужно|надо|будет|давайте|давай|пожалуйста)\s+", "", candidate)
    cleaned = cleaned.strip(" -—•")
    cleaned = re.sub(r"[\.!\s]+$", "", cleaned)
    if len(cleaned) > MAX_TASK_LENGTH:
        cleaned = cleaned[:MAX_TASK_LENGTH]
    return cleaned
