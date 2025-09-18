"use client";

import { FileUploader } from "@/components/workflow/FileUploader";
import { JiraIntegrationForm } from "@/components/workflow/JiraIntegrationForm";
import { ResultsDashboard } from "@/components/workflow/ResultsDashboard";
import { WorkflowTracker } from "@/components/workflow/WorkflowTracker";
import { useWorkflowManager } from "@/hooks/useWorkflowManager";

const DEFAULT_JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_DEFAULT_BASE_URL ?? "";

export default function HomePage() {
  const {
    state,
    actions: { startUpload, submitToJira, reset },
  } = useWorkflowManager();

  const isProcessing =
    state.status === "uploading" ||
    state.status === "transcribing" ||
    state.status === "extracting" ||
    state.status === "submittingJira";

  const canStartNewFlow = state.status === "idle" || state.status === "error" || state.status === "done";

  return (
    <div className="space-y-10">
      {canStartNewFlow && (
        <FileUploader onUpload={startUpload} disabled={state.status === "submittingJira"} />
      )}

      {state.status === "error" && (
        <div className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          <h2 className="text-lg font-semibold">Процесс завершился с ошибкой</h2>
          <p className="mt-2 text-sm">{state.errorMessage ?? "Произошла неизвестная ошибка"}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90"
          >
            Попробовать снова
          </button>
        </div>
      )}

      {isProcessing && <WorkflowTracker status={state.status} progress={state.progress} />}

      {(state.status === "ready" ||
        state.status === "submittingJira" ||
        state.status === "done" ||
        (state.status === "error" && (state.tasks.length > 0 || state.transcript))) && (
        <ResultsDashboard
          transcript={state.transcript}
          tasks={state.tasks}
          jiraResults={state.jiraResults}
          status={state.status}
        />
      )}

      {(state.status === "ready" || state.status === "submittingJira") && (
        <JiraIntegrationForm
          onSubmit={submitToJira}
          disabled={state.status === "submittingJira"}
          defaultBaseUrl={DEFAULT_JIRA_BASE_URL}
        />
      )}

      {state.status === "done" && (
        <div className="mx-auto max-w-3xl rounded-lg border border-green-200 bg-green-50 p-6 text-green-700">
          <h2 className="text-lg font-semibold">Все операции завершены</h2>
          <p className="mt-2 text-sm">Вы можете просмотреть созданные задачи или запустить новый процесс.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90"
            >
              Запустить заново
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
