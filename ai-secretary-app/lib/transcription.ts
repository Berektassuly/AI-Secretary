const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveBaseUrl(rawBaseUrl: string | undefined): string {
  if (!rawBaseUrl) {
    return DEFAULT_OPENAI_BASE_URL;
  }
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    return DEFAULT_OPENAI_BASE_URL;
  }
  return trimmed.replace(/\/$/, "");
}

function buildTranscriptionEndpoint(): string {
  const baseUrl = resolveBaseUrl(process.env.OPENAI_BASE_URL);
  return `${baseUrl}/audio/transcriptions`;
}

function resolveModel(): string {
  const model = process.env.OPENAI_WHISPER_MODEL?.trim();
  return model && model.length > 0 ? model : DEFAULT_TRANSCRIPTION_MODEL;
}

function resolveLanguage(): string | undefined {
  const language = process.env.OPENAI_WHISPER_LANGUAGE?.trim();
  return language && language.length > 0 ? language : undefined;
}

function resolveTimeout(): number | undefined {
  return parsePositiveInteger(process.env.OPENAI_REQUEST_TIMEOUT_MS);
}

function normaliseFileName(file: File): string {
  if (file.name && file.name.trim().length > 0) {
    return file.name;
  }
  const extension = inferExtension(file.type);
  return `meeting-audio${extension}`;
}

function inferExtension(mimeType: string | undefined): string {
  const mapping: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
  };
  if (!mimeType) {
    return ".wav";
  }
  if (mapping[mimeType]) {
    return mapping[mimeType];
  }
  const subtype = mimeType.split("/").pop();
  return subtype ? `.${subtype}` : ".wav";
}

function safeParseJson<T>(payload: string): T | null {
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    console.warn("Failed to parse JSON response from OpenAI", error);
    return null;
  }
}

async function fetchWithOptionalTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number | undefined,
): Promise<Response> {
  if (!timeoutMs) {
    return fetch(url, init);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`OpenAI Whisper запрос превысил лимит ${timeoutMs} мс`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function transcribeAudioFile(file: File): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OpenAI Whisper не настроен: задайте переменную OPENAI_API_KEY");
  }

  const organisation = process.env.OPENAI_ORGANIZATION?.trim();
  const project = process.env.OPENAI_PROJECT?.trim();
  const language = resolveLanguage();
  const model = resolveModel();
  const timeout = resolveTimeout();
  const endpoint = buildTranscriptionEndpoint();

  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type || "application/octet-stream" });

  const formData = new FormData();
  formData.append("file", blob, normaliseFileName(file));
  formData.append("model", model);
  if (language) {
    formData.append("language", language);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (organisation) {
    headers["OpenAI-Organization"] = organisation;
  }
  if (project) {
    headers["OpenAI-Project"] = project;
  }

  let response: Response;
  try {
    response = await fetchWithOptionalTimeout(endpoint, { method: "POST", body: formData, headers }, timeout);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обратиться к OpenAI Whisper";
    throw new Error(`OpenAI Whisper запрос завершился с ошибкой: ${message}`);
  }

  const rawPayload = await response.text();
  const parsed = safeParseJson<{ text?: string; error?: { message?: string } }>(rawPayload);

  if (!response.ok) {
    const detail = parsed?.error?.message ?? parsed?.text ?? rawPayload || `HTTP ${response.status}`;
    throw new Error(`OpenAI Whisper вернул ошибку: ${detail}`);
  }

  const transcript = parsed?.text?.trim();
  if (!transcript) {
    throw new Error("OpenAI Whisper API вернул пустую транскрипцию");
  }
  return transcript;
}
