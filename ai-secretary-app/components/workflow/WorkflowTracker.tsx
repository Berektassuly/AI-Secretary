"use client";

import type { WorkflowProgress, WorkflowStatus } from "@/hooks/useWorkflowManager";
import clsx from "clsx";

interface WorkflowTrackerProps {
  status: WorkflowStatus;
  progress: WorkflowProgress;
}

const STEPS: { id: WorkflowStatus; label: string }[] = [
  { id: "uploading", label: "Загрузка" },
  { id: "transcribing", label: "Транскрипция" },
  { id: "extracting", label: "Извлечение задач" },
  { id: "ready", label: "Результаты" },
  { id: "submittingJira", label: "Отправка в Jira" },
  { id: "done", label: "Завершено" },
];

function isStepCompleted(current: WorkflowStatus, target: WorkflowStatus): boolean {
  const order = STEPS.map((step) => step.id);
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);
  if (current === "error") {
    return currentIndex >= targetIndex;
  }
  return currentIndex > targetIndex;
}

export function WorkflowTracker({ status, progress }: WorkflowTrackerProps) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg bg-white p-8 shadow">
      <h2 className="text-lg font-semibold text-slate-800">Текущий статус</h2>
      <p className="mt-2 text-sm text-slate-600">{progress.stage}</p>
      <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={clsx("h-full rounded-full bg-primary transition-all duration-500", {
            "bg-red-500": status === "error",
          })}
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </div>
      <ol className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-600 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.id}
            className={clsx("flex items-center gap-2 rounded-md border p-3", {
              "border-primary bg-primary/10 text-primary-700": isStepCompleted(status, step.id) || status === step.id,
              "border-slate-200": !isStepCompleted(status, step.id) && status !== step.id,
              "border-red-300 bg-red-50 text-red-700": status === "error" && step.id === "submittingJira",
            })}
          >
            <span
              className={clsx("flex h-5 w-5 items-center justify-center rounded-full border text-xs", {
                "border-primary bg-primary text-white": isStepCompleted(status, step.id),
                "border-slate-300": !isStepCompleted(status, step.id),
              })}
            >
              {isStepCompleted(status, step.id) ? "✓" : ""}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
