import { NextResponse } from "next/server";
import { JiraConfig, JiraResult, createJiraTask } from "@/lib/jira";

export const runtime = "nodejs";

interface CreateJiraRequest {
  tasks?: string[];
  config?: JiraConfig;
}

const JIRA_TIMEOUT = Number(process.env.JIRA_REQUEST_TIMEOUT_MS ?? 45000);

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

  const results: JiraResult[] = [];

  for (const summary of payload.tasks) {
    if (!summary || typeof summary !== "string") {
      results.push({ summary: String(summary), success: false, error: "Некорректное описание задачи" });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JIRA_TIMEOUT);
    try {
      const result = await createJiraTask(payload.config, summary, controller.signal);
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
