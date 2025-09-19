import { Buffer } from "node:buffer";
import type { ActionItem } from "./types";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  projectKey: string;
  description?: string;
  issueType?: string;
  defaultAssignee?: string;
  defaultPriority?: string;
  defaultLabels?: string[];
  syncAssignee?: boolean;
  syncDueDate?: boolean;
  syncPriority?: boolean;
  syncLabels?: boolean;
}

export interface JiraResult {
  summary: string;
  success: boolean;
  issueKey?: string;
  issueUrl?: string;
  error?: string;
}

interface JiraIssuePayload {
  fields: {
    project: { key: string };
    summary: string;
    issuetype: { name: string };
    description?: unknown;
    assignee?: Record<string, string>;
    duedate?: string;
    priority?: { name: string };
    labels?: string[];
  };
}

function buildAuthHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function buildDescription(item: ActionItem, description?: string): unknown {
  const extraLines: string[] = [];
  if (item.assignee) {
    extraLines.push(`Исполнитель: ${item.assignee}`);
  }
  if (item.due) {
    extraLines.push(`Дедлайн: ${item.due}`);
  }
  if (item.priority) {
    extraLines.push(`Приоритет: ${item.priority}`);
  }
  if (item.labels.length > 0) {
    extraLines.push(`Метки: ${item.labels.join(", ")}`);
  }
  extraLines.push(`Уверенность модели: ${(item.confidence * 100).toFixed(0)}%`);
  if (description) {
    extraLines.push(description);
  }

  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: item.summary,
          },
        ],
      },
      ...extraLines.map((line) => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: line,
          },
        ],
      })),
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "— создано автоматически: AI Meeting Secretary",
          },
        ],
      },
    ],
  };
}

function normaliseLabels(item: ActionItem, config: JiraConfig): string[] | undefined {
  const fromConfig = Array.isArray(config.defaultLabels) ? config.defaultLabels : [];
  const fromTask = config.syncLabels === false ? [] : item.labels;
  const combined = new Set<string>();
  for (const label of [...fromConfig, ...fromTask]) {
    const trimmed = label.trim();
    if (trimmed) {
      combined.add(trimmed.replace(/\s+/g, "-"));
    }
  }
  return combined.size > 0 ? Array.from(combined) : undefined;
}

function resolveDueDate(item: ActionItem, config: JiraConfig): string | undefined {
  if (config.syncDueDate === false) {
    return undefined;
  }
  return item.due ?? undefined;
}

function resolvePriority(item: ActionItem, config: JiraConfig): string | undefined {
  if (config.syncPriority === false) {
    return config.defaultPriority ?? undefined;
  }
  return item.priority ?? config.defaultPriority ?? undefined;
}

function resolveAssignee(item: ActionItem, config: JiraConfig): Record<string, string> | undefined {
  const assigneeCandidate = config.syncAssignee === false ? config.defaultAssignee : item.assignee ?? config.defaultAssignee;
  if (!assigneeCandidate) {
    return undefined;
  }
  const trimmed = assigneeCandidate.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^[0-9a-f-]{24,}$/i.test(trimmed)) {
    return { accountId: trimmed };
  }
  if (trimmed.includes("@")) {
    return { emailAddress: trimmed };
  }
  return { name: trimmed };
}

export async function createJiraTask(
  config: JiraConfig,
  item: ActionItem,
  signal?: AbortSignal,
): Promise<JiraResult> {
  const url = new URL("/rest/api/3/issue", config.baseUrl).toString();
  const payload: JiraIssuePayload = {
    fields: {
      project: { key: config.projectKey },
      summary: item.summary.slice(0, 254),
      issuetype: { name: config.issueType ?? "Task" },
      description: buildDescription(item, config.description),
    },
  };

  const assignee = resolveAssignee(item, config);
  if (assignee) {
    payload.fields.assignee = assignee;
  }
  const due = resolveDueDate(item, config);
  if (due) {
    payload.fields.duedate = due;
  }
  const priority = resolvePriority(item, config);
  if (priority) {
    payload.fields.priority = { name: priority };
  }
  const labels = normaliseLabels(item, config);
  if (labels) {
    payload.fields.labels = labels;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(config.email, config.token),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      summary: item.summary,
      success: false,
      error: `Jira API error ${response.status}: ${body.slice(0, 500)}`,
    };
  }

  const data = (await response.json()) as { key?: string };
  const issueKey = data.key;
  return {
    summary: item.summary,
    success: true,
    issueKey,
    issueUrl: issueKey ? new URL(`/browse/${issueKey}`, config.baseUrl).toString() : undefined,
  };
}
