import { NextResponse } from "next/server";
import { JiraConfig, JiraResult, createJiraTask } from "@/lib/jira";
import type { ActionItem } from "@/lib/types";

export const runtime = "nodejs";

interface CreateJiraRequest {
  tasks?: ActionItem[];
  config?: JiraConfig;
}

const JIRA_TIMEOUT = Number(process.env.JIRA_REQUEST_TIMEOUT_MS ?? 45000);

function toOptionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeLabels(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const labels = value
      .map((label) => (typeof label === "string" ? label.trim() : ""))
      .filter((label) => label.length > 0)
      .map((label) => label.replace(/\s+/g, "-"));
    return labels.length > 0 ? labels : undefined;
  }
  if (typeof value === "string") {
    return normalizeLabels(value.split(","));
  }
  return undefined;
}

function sanitizeJiraConfig(config: JiraConfig): JiraConfig {
  const baseUrlRaw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  const hasProtocol = /^https?:\/\//i.test(baseUrlRaw);
  const normalizedBaseUrl = baseUrlRaw.length === 0 ? "" : hasProtocol ? baseUrlRaw : `https://${baseUrlRaw}`;

  const email = typeof config.email === "string" ? config.email.trim() : "";
  const token = typeof config.token === "string" ? config.token.trim() : "";
  const projectKeyRaw = typeof config.projectKey === "string" ? config.projectKey.trim() : "";
  const projectKey = projectKeyRaw.toUpperCase().replace(/\s+/g, "");
  const descriptionRaw = typeof config.description === "string" ? config.description.trim() : "";
  const issueType = toOptionalTrimmed(config.issueType);
  const defaultAssignee = toOptionalTrimmed(config.defaultAssignee);
  const defaultPriority = toOptionalTrimmed(config.defaultPriority);
  const defaultLabels = normalizeLabels(config.defaultLabels);

  const syncAssignee = config.syncAssignee === false ? false : true;
  const syncDueDate = config.syncDueDate === false ? false : true;
  const syncPriority = config.syncPriority === false ? false : true;
  const syncLabels = config.syncLabels === false ? false : true;

  return {
    baseUrl: normalizedBaseUrl,
    email,
    token,
    projectKey,
    description: descriptionRaw.length > 0 ? descriptionRaw : undefined,
    issueType: issueType ?? "Task",
    defaultAssignee,
    defaultPriority,
    defaultLabels,
    syncAssignee,
    syncDueDate,
    syncPriority,
    syncLabels,
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

  for (const task of payload.tasks) {
    if (!task || typeof task.summary !== "string" || task.summary.trim().length === 0) {
      results.push({ summary: task?.summary ?? "", success: false, error: "Некорректное описание задачи" });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JIRA_TIMEOUT);
    try {
      const result = await createJiraTask(sanitizedConfig, task, controller.signal);
      results.push(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === "AbortError"
            ? "Таймаут запроса к Jira"
            : error.message
          : "Неизвестная ошибка";
      results.push({ summary: task.summary, success: false, error: message });
    } finally {
      clearTimeout(timer);
    }
  }

  const hasSuccess = results.some((r) => r.success);
  return NextResponse.json({ results }, { status: hasSuccess ? 200 : 502 });
}
