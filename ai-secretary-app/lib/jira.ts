import { Buffer } from "node:buffer";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  projectKey: string;
  description?: string;
}

export interface JiraResult {
  summary: string;
  success: boolean;
  issueKey?: string;
  error?: string;
}

interface JiraIssuePayload {
  fields: {
    project: { key: string };
    summary: string;
    issuetype: { name: string };
    description?: unknown;
  };
}

function buildAuthHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function buildDescription(summary: string, description?: string): unknown {
  const text = description ?? summary;
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
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

export async function createJiraTask(
  config: JiraConfig,
  summary: string,
  signal?: AbortSignal,
): Promise<JiraResult> {
  const url = new URL("/rest/api/3/issue", config.baseUrl).toString();
  const payload: JiraIssuePayload = {
    fields: {
      project: { key: config.projectKey },
      summary: summary.slice(0, 254),
      issuetype: { name: "Task" },
      description: buildDescription(summary, config.description),
    },
  };

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
      summary,
      success: false,
      error: `Jira API error ${response.status}: ${body.slice(0, 500)}`,
    };
  }

  const data = (await response.json()) as { key?: string };
  return {
    summary,
    success: true,
    issueKey: data.key,
  };
}
