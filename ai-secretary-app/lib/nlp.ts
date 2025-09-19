import type { ActionItem } from "./types";

const DEFAULT_BASE_URL = process.env.NLP_SERVICE_URL ?? "http://nlp-service:8000";
const REQUEST_TIMEOUT = Number(process.env.NLP_SERVICE_REQUEST_TIMEOUT_MS ?? 45000);
const RETRY_COUNT = Number(process.env.NLP_SERVICE_RETRY_COUNT ?? 2);

export interface TaskExtractionResponse {
  tasks: ActionItem[];
}

export class NLPServiceError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "NLPServiceError";
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    return response;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new NLPServiceError("Превышено время ожидания ответа от NLP-сервиса");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractTasks(transcript: string): Promise<ActionItem[]> {
  const url = `${DEFAULT_BASE_URL.replace(/\/$/, "")}/extract-tasks`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        body: JSON.stringify({ text: transcript }),
      });
      if (!response.ok) {
        throw new NLPServiceError(`Ошибка NLP-сервиса: ${response.status}`, response.status ?? undefined);
      }
      const data = (await response.json()) as TaskExtractionResponse;
      return data.tasks.map((task) => ({
        ...task,
        labels: Array.isArray(task.labels) ? task.labels : [],
      }));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_COUNT) {
        break;
      }
    }
  }
  if (lastError instanceof NLPServiceError) {
    throw lastError;
  }
  throw new NLPServiceError("Не удалось связаться с NLP-сервисом");
}
