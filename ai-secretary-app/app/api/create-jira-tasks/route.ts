import { NextResponse } from "next/server";
import { JiraConfig, JiraResult, createJiraTask } from "@/lib/jira";

export const runtime = "nodejs";

interface CreateJiraRequest {
  tasks?: string[];
  config?: JiraConfig;
}

const JIRA_TIMEOUT = Number(process.env.JIRA_REQUEST_TIMEOUT_MS ?? 45000);

function sanitizeJiraConfig(config: JiraConfig): JiraConfig {
  const baseUrlRaw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  const hasProtocol = /^https?:\/\//i.test(baseUrlRaw);
  const normalizedBaseUrl = baseUrlRaw.length === 0 ? "" : hasProtocol ? baseUrlRaw : `https://${baseUrlRaw}`;

  const email = typeof config.email === "string" ? config.email.trim() : "";
  const token = typeof config.token === "string" ? config.token.trim() : "";
  const projectKeyRaw = typeof config.projectKey === "string" ? config.projectKey.trim() : "";
  const projectKey = projectKeyRaw.toUpperCase().replace(/\s+/g, "");
  const descriptionRaw = typeof config.description === "string" ? config.description.trim() : "";

  return {
    baseUrl: normalizedBaseUrl,
    email,
    token,
    projectKey,
    description: descriptionRaw.length > 0 ? descriptionRaw : undefined,
  };
}

function validateJiraConfig(config: JiraConfig): string | null {
  if (!config.baseUrl) {
    return "Базовый URL Jira обязателен";
  }

  try {
    // eslint-disable-next-line no-new
    new URL(config.baseUrl);
  } catch (error) {
    return "Некорректный базовый URL Jira";
  }

  if (!config.email) {
    return "E-mail пользователя Jira обязателен";
  }

  if (!config.token) {
    return "API token Jira обязателен";
  }

  if (!config.projectKey) {
    return "Ключ проекта Jira обязателен";
  }

  if (!/^[A-Z][A-Z0-9]*$/.test(config.projectKey)) {
    return "Ключ проекта Jira должен содержать только латинские заглавные буквы и цифры";
  }

  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: CreateJiraRequest;
  try {
    payload = (await request.json()) as CreateJiraRequest;
  } catch (error) {
    return NextResponse.json({ detail: "Некорректный JSON" }, { status: 400 });
  }

  if (!payload?.tasks || payload.tasks.length === 0) {
    return NextResponse.json({ detail: "Список задач пуст" }, { status: 400 });
  }

  if (!payload.config) {
    return NextResponse.json({ detail: "Конфигурация Jira обязательна" }, { status: 400 });
  }

  const sanitizedConfig = sanitizeJiraConfig(payload.config);
  const validationError = validateJiraConfig(sanitizedConfig);
  if (validationError) {
    return NextResponse.json({ detail: validationError }, { status: 400 });
  }

  const results: JiraResult[] = [];

  for (const summary of payload.tasks) {
    if (!summary || typeof summary !== "string") {
      results.push({ summary: String(summary), success: false, error: "Некорректное описание задачи" });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JIRA_TIMEOUT);
    try {
      const result = await createJiraTask(sanitizedConfig, summary, controller.signal);
      results.push(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === "AbortError"
            ? "Таймаут запроса к Jira"
            : error.message
          : "Неизвестная ошибка";
      results.push({ summary, success: false, error: message });
    } finally {
      clearTimeout(timer);
    }
  }

  const hasSuccess = results.some((r) => r.success);
  return NextResponse.json({ results }, { status: hasSuccess ? 200 : 502 });
}
