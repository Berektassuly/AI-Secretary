"use client";

import { useState } from "react";
import type { JiraResult } from "@/lib/jira";
import type { WorkflowStatus } from "@/hooks/useWorkflowManager";

interface ResultsDashboardProps {
  transcript: string | null;
  tasks: string[];
  jiraResults: JiraResult[];
  status: WorkflowStatus;
}

export function ResultsDashboard({ transcript, tasks, jiraResults, status }: ResultsDashboardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tasks.join("\n"));
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
        <p className="mt-2 text-sm text-slate-500">{tasks.length > 0 ? "Проверьте задачи перед отправкой в Jira." : "Не удалось найти явных задач."}</p>
        <div className="mt-4 space-y-3">
          {tasks.length > 0 ? (
            tasks.map((task, index) => (
              <div key={`${task}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {task}
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
        <p className="mt-2 text-sm text-slate-500">Текст, полученный из аудиофайла.</p>
        <div className="mt-4 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          {transcript ? transcript : "Транскрипт отсутствует."}
        </div>
        {status === "done" && jiraResults.length > 0 && (
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-800">Результаты интеграции с Jira</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {jiraResults.map((result, index) => (
                <li key={`${result.summary}-${index}`} className="flex items-start justify-between gap-4">
                  <span className="text-slate-700">{result.summary}</span>
                  {result.success ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      Создано {result.issueKey ?? ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                      Ошибка: {result.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
