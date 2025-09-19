"use client";

import { useMemo, useState } from "react";
import type { JiraResult } from "@/lib/jira";
import type { WorkflowStatus } from "@/hooks/useWorkflowManager";
import type { ActionItem } from "@/lib/types";

interface ResultsDashboardProps {
  transcript: string | null;
  tasks: ActionItem[];
  jiraResults: JiraResult[];
  status: WorkflowStatus;
}

export function ResultsDashboard({ transcript, tasks, jiraResults, status }: ResultsDashboardProps) {
  const [copied, setCopied] = useState(false);

  const formattedClipboard = useMemo(() => {
    if (!tasks || tasks.length === 0) {
      return "";
    }
    return tasks
      .map((task, index) => {
        const parts: string[] = [];
        if (task.assignee) {
          parts.push(`ответственный: ${task.assignee}`);
        }
        if (task.due) {
          parts.push(`дедлайн: ${task.due}`);
        }
        if (task.priority) {
          parts.push(`приоритет: ${task.priority}`);
        }
        if (task.labels && task.labels.length > 0) {
          parts.push(`метки: ${task.labels.join(", ")}`);
        }
        const meta = parts.length > 0 ? ` (${parts.join("; ")})` : "";
        return `${index + 1}. ${task.summary}${meta}`;
      })
      .join("\n");
  }, [tasks]);

  const handleCopy = async () => {
    try {
      if (!formattedClipboard) {
        return;
      }
      await navigator.clipboard.writeText(formattedClipboard);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-800">Извлечённые задачи</h2>
        <p className="mt-2 text-sm text-slate-500">
          {tasks.length > 0
            ? "Проверьте структуру и назначенных исполнителей перед синхронизацией."
            : "Не удалось найти явных задач."}
        </p>
        <div className="mt-4 space-y-3">
          {tasks.length > 0 ? (
            tasks.map((task, index) => (
              <div
                key={`${task.summary}-${index}`}
                className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-800">{task.summary}</p>
                    {task.source && <p className="mt-1 text-xs text-slate-500">Источник: «{task.source}»</p>}
                  </div>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                    {(task.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  {task.assignee && (
                    <div>
                      <dt className="font-semibold text-slate-500">Ответственный</dt>
                      <dd className="text-slate-700">{task.assignee}</dd>
                    </div>
                  )}
                  {task.due && (
                    <div>
                      <dt className="font-semibold text-slate-500">Дедлайн</dt>
                      <dd className="text-slate-700">{task.due}</dd>
                    </div>
                  )}
                  {task.priority && (
                    <div>
                      <dt className="font-semibold text-slate-500">Приоритет</dt>
                      <dd className="text-slate-700">{task.priority}</dd>
                    </div>
                  )}
                  {task.labels.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-slate-500">Метки</dt>
                      <dd className="mt-1 flex flex-wrap gap-2">
                        {task.labels.map((label) => (
                          <span
                            key={label}
                            className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700"
                          >
                            {label}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Добавьте больше контекста в исходную встречу или попробуйте другую запись.</p>
          )}
        </div>
        {tasks.length > 0 && (
          <button
            type="button"
            onClick={handleCopy}
            className="mt-4 rounded-md border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-primary/10"
          >
            {copied ? "Скопировано" : "Скопировать список"}
          </button>
        )}
      </section>

      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-800">Транскрипт встречи</h2>
        <p className="mt-2 text-sm text-slate-500">Текст, полученный из аудиофайла или облачной записи.</p>
        <div className="mt-4 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          {transcript ? transcript : "Транскрипт отсутствует."}
        </div>
        {status === "done" && jiraResults.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold text-slate-800">Результаты интеграции с Jira</h3>
            <ul className="space-y-2 text-sm">
              {jiraResults.map((result, index) => (
                <li
                  key={`${result.summary}-${index}`}
                  className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-slate-700">{result.summary}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {result.success ? (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        Создано {result.issueKey ?? ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                        Ошибка: {result.error}
                      </span>
                    )}
                    {result.issueUrl && (
                      <a
                        href={result.issueUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Открыть задачу
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
