import type { JiraResult } from "./jira";
import type { ActionItem } from "./types";

export type MeetingSource = "upload" | "zoom" | "google";

export interface MeetingSummary {
  id: string;
  source: MeetingSource;
  createdAt: string;
  transcript: string;
  transcriptPreview: string;
  tasks: ActionItem[];
  metadata?: Record<string, string>;
  jiraResults?: JiraResult[];
}

interface CreateMeetingSummaryOptions {
  source: MeetingSource;
  transcript: string;
  tasks: ActionItem[];
  metadata?: Record<string, string | undefined | null>;
}

const STORAGE_KEY = "ai-secretary.meeting-history.v1";
const HISTORY_LIMIT = 10;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function createPreview(transcript: string): string {
  const trimmed = transcript.trim();
  if (trimmed.length <= 280) {
    return trimmed;
  }
  return `${trimmed.slice(0, 280)}…`;
}

function normaliseString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function sanitiseLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const labels = value
    .map((label) => (typeof label === "string" ? label.trim() : ""))
    .filter((label) => label.length > 0)
    .map((label) => label.replace(/\s+/g, "-"));
  return Array.from(new Set(labels));
}

function sanitiseActionItem(raw: unknown): ActionItem {
  const candidate = (raw ?? {}) as Partial<ActionItem>;
  return {
    summary: normaliseString(candidate.summary) ?? "",
    confidence: clampConfidence(candidate.confidence),
    source: normaliseString(candidate.source),
    assignee: normaliseString(candidate.assignee),
    due: normaliseString(candidate.due),
    priority: normaliseString(candidate.priority),
    labels: sanitiseLabels(candidate.labels),
  };
}

function sanitiseMetadata(metadata: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }
  const entries: [string, string][] = [];
  for (const [key, rawValue] of Object.entries(metadata)) {
    const value = normaliseString(rawValue);
    if (value) {
      entries.push([key, value]);
    }
  }
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries);
}

function sanitiseJiraResult(raw: unknown): JiraResult | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<JiraResult>;
  const summary = normaliseString(candidate.summary) ?? "";
  if (!summary) {
    return null;
  }
  return {
    summary,
    success: Boolean(candidate.success),
    issueKey: normaliseString(candidate.issueKey) ?? undefined,
    issueUrl: normaliseString(candidate.issueUrl) ?? undefined,
    error: normaliseString(candidate.error) ?? undefined,
  };
}

function sanitiseJiraResults(raw: unknown): JiraResult[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const results = raw
    .map((item) => sanitiseJiraResult(item))
    .filter((item): item is JiraResult => item !== null);
  return results.length > 0 ? results : undefined;
}

function sanitiseMeetingSummary(raw: unknown): MeetingSummary {
  const candidate = (raw ?? {}) as Partial<MeetingSummary> & {
    metadata?: Record<string, unknown>;
  };
  const transcript = normaliseString(candidate.transcript) ?? "";
  const source: MeetingSource = candidate.source && ["upload", "zoom", "google"].includes(candidate.source)
    ? (candidate.source as MeetingSource)
    : "upload";
  const id = normaliseString(candidate.id) ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdAt = normaliseString(candidate.createdAt) ?? new Date().toISOString();

  const tasks = Array.isArray(candidate.tasks)
    ? candidate.tasks.map((task) => sanitiseActionItem(task))
    : [];

  const metadata = sanitiseMetadata(candidate.metadata);
  const jiraResults = sanitiseJiraResults(candidate.jiraResults);

  return {
    id,
    source,
    createdAt,
    transcript,
    transcriptPreview: createPreview(candidate.transcriptPreview ?? transcript),
    tasks,
    metadata,
    jiraResults,
  };
}

function readRawHistory(): unknown {
  if (!isBrowser()) {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored);
  } catch (error) {
    console.warn("Failed to read meeting history from localStorage", error);
    return [];
  }
}

function writeHistory(history: MeetingSummary[]): MeetingSummary[] {
  if (!isBrowser()) {
    return history;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn("Failed to persist meeting history", error);
  }
  return history;
}

export function loadMeetingHistory(): MeetingSummary[] {
  const raw = readRawHistory();
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => sanitiseMeetingSummary(item)).slice(0, HISTORY_LIMIT);
}

export function createMeetingSummary(options: CreateMeetingSummaryOptions): MeetingSummary {
  const summary = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source: options.source,
    createdAt: new Date().toISOString(),
    transcript: options.transcript,
    transcriptPreview: createPreview(options.transcript),
    tasks: options.tasks.map((task) => sanitiseActionItem(task)),
    metadata: sanitiseMetadata(options.metadata),
    jiraResults: undefined,
  } satisfies MeetingSummary;
  return sanitiseMeetingSummary(summary);
}

export function persistMeetingSummary(
  summary: MeetingSummary,
  existingHistory?: MeetingSummary[],
): MeetingSummary[] {
  const baseHistory = existingHistory ? existingHistory.map((item) => sanitiseMeetingSummary(item)) : loadMeetingHistory();
  const sanitisedSummary = sanitiseMeetingSummary(summary);
  const withoutDuplicate = baseHistory.filter(
    (item) => !(item.source === sanitisedSummary.source && item.transcript === sanitisedSummary.transcript),
  );
  const next = [sanitisedSummary, ...withoutDuplicate].slice(0, HISTORY_LIMIT);
  return writeHistory(next);
}

export function replaceMeetingSummary(
  id: string,
  updater: (summary: MeetingSummary) => MeetingSummary,
  existingHistory?: MeetingSummary[],
): MeetingSummary[] {
  const baseHistory = existingHistory ? existingHistory.map((item) => sanitiseMeetingSummary(item)) : loadMeetingHistory();
  const next = baseHistory.map((item) => {
    if (item.id !== id) {
      return item;
    }
    return sanitiseMeetingSummary(updater(item));
  });
  return writeHistory(next);
}

export function clearMeetingHistory(): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear meeting history", error);
  }
}
