"use client";

import { useMemo, useState } from "react";
import type { MeetingSummary, MeetingSource } from "@/lib/memory";
import type { ActionItem } from "@/lib/types";

interface MeetingHistoryPanelProps {
  history: MeetingSummary[];
  onClear: () => void;
}

const SOURCE_LABELS: Record<MeetingSource, string> = {
  upload: "Локальный файл",
  zoom: "Zoom Cloud Recording",
  google: "Google Meet",
};

const METADATA_LABELS: Record<string, string> = {
  fileName: "Файл",
  meetingId: "ID встречи",
  fileId: "Google Drive ID",
  recordingType: "Тип записи",
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildClipboard(tasks: ActionItem[]): string {
  return tasks
    .map((task, index) => {
      const metaParts: string[] = [];
      if (task.assignee) {
        metaParts.push(`ответственный: ${task.assignee}`);
      }
      if (task.due) {
        metaParts.push(`дедлайн: ${task.due}`);
      }
      if (task.priority) {
        metaParts.push(`приоритет: ${task.priority}`);
      }
      if (task.labels && task.labels.length > 0) {
        metaParts.push(`метки: ${task.labels.join(", ")}`);
      }
      const suffix = metaParts.length > 0 ? ` (${metaParts.join("; ")})` : "";
      return `${index + 1}. ${task.summary}${suffix}`;
    })
    .join("\n");
}

export function MeetingHistoryPanel({ history, onClear }: MeetingHistoryPanelProps) {
  const [copiedMeetingId, setCopiedMeetingId] = useState<string | null>(null);

  const preparedHistory = useMemo(() => history.slice(0, 10), [history]);

  if (preparedHistory.length === 0) {
    return null;
  }

  const handleCopy = async (summary: MeetingSummary) => {
    const clipboard = buildClipboard(summary.tasks);
    if (!clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(clipboard);
      setCopiedMeetingId(summary.id);
      setTimeout(() => setCopiedMeetingId(null), 2000);
    } catch (error) {
      setCopiedMeetingId(null);
    }
  };

  return (
    <section className="rounded-lg bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">История встреч</h2>
          <p className="text-sm text-slate-500">
            Система запоминает последние {preparedHistory.length} обработанных встреч. История хранится только в вашем браузере.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Очистить историю
        </button>
      </div>
      <div className="mt-6 space-y-4">
        {preparedHistory.map((meeting) => (
          <article
            key={meeting.id}
            className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">{SOURCE_LABELS[meeting.source]}</p>
                <p className="text-xs text-slate-500">{formatTimestamp(meeting.createdAt)}</p>
                {meeting.metadata && (
                  <dl className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                    {Object.entries(meeting.metadata).map(([key, value]) => (
                      <div key={`${meeting.id}-${key}`}>
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">
                          {METADATA_LABELS[key] ?? key}
                        </dt>
                        <dd className="text-slate-600">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(meeting)}
                className="rounded-md border border-primary bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/10"
              >
                {copiedMeetingId === meeting.id ? "Скопировано" : "Скопировать задачи"}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              {meeting.transcriptPreview || "Транскрипт не сохранён."}
            </p>
            <div className="space-y-2">
              {meeting.tasks.slice(0, 4).map((task, index) => (
                <div key={`${meeting.id}-task-${index}`} className="rounded border border-slate-200 bg-white p-3 text-xs">
                  <p className="font-medium text-slate-700">{task.summary}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    {typeof task.confidence === "number" && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                        {(task.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {task.assignee && <span>👤 {task.assignee}</span>}
                    {task.due && <span>🗓 {task.due}</span>}
                    {task.priority && <span>⚡ {task.priority}</span>}
                    {task.labels && task.labels.length > 0 && <span>🏷 {task.labels.join(", ")}</span>}
                  </div>
                </div>
              ))}
              {meeting.tasks.length > 4 && (
                <p className="text-xs text-slate-500">… и ещё {meeting.tasks.length - 4} задач(и)</p>
              )}
            </div>
            {meeting.jiraResults && meeting.jiraResults.length > 0 && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-green-700">Jira синхронизация</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {meeting.jiraResults.map((result, index) => (
                    <li key={`${meeting.id}-jira-${index}`} className="flex flex-wrap items-center gap-2 text-slate-600">
                      <span className="font-medium">{result.summary}</span>
                      {result.success ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-700">
                          {result.issueKey ?? "Создано"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Ошибка</span>
                      )}
                      {result.issueUrl && (
                        <a
                          href={result.issueUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Открыть
                        </a>
                      )}
                      {!result.success && result.error && (
                        <span className="text-[11px] text-red-600">
                          {result.error.length > 80 ? `${result.error.slice(0, 77)}…` : result.error}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
