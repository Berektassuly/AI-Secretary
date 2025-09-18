"""FastAPI entrypoint for the NLP task extraction service."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .logic import ExtractionError, TaskExtractor
from .models import HealthResponse, TasksOutput, TextInput

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("nlp_service")

extractor = TaskExtractor()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Load heavy artefacts once during start-up and release on shutdown."""

    try:
        extractor.startup()
        yield
    finally:
        extractor.shutdown()


app = FastAPI(
    title="AI Meeting Secretary NLP Service",
    version="1.0.0",
    description="Microservice responsible for extracting actionable tasks from transcripts.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"]
)


@app.post("/extract-tasks", response_model=TasksOutput)
async def extract_tasks(payload: TextInput, request: Request) -> TasksOutput:
    """Extract actionable tasks from the provided text."""

    logger.info(
        "extract_tasks request",
        extra={
            "client": request.client.host if request.client else None,
            "text_length": len(payload.text),
        },
    )
    try:
        tasks = extractor.extract_tasks(payload.text)
        logger.info("extraction completed", extra={"tasks_count": len(tasks)})
        return TasksOutput(tasks=tasks)
    except ExtractionError as exc:
        logger.exception("Extraction error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.exception("Unexpected extraction failure")
        raise HTTPException(status_code=500, detail="Internal error during extraction") from exc


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health-check endpoint used by orchestration."""

    return HealthResponse(status="ok")
