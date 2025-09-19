import { useCallback, useState } from "react";
import type { JiraConfig, JiraResult } from "@/lib/jira";

export type WorkflowStatus =
  | "idle"
  | "uploading"
  | "transcribing"
  | "extracting"
  | "ready"
  | "submittingJira"
  | "done"
  | "error";

export interface WorkflowProgress {
  stage: string;
  percentage: number;
}

export interface WorkflowState {
  status: WorkflowStatus;
  transcript: string | null;
  tasks: string[];
  jiraResults: JiraResult[];
  errorMessage: string | null;
  progress: WorkflowProgress;
}

const initialState: WorkflowState = {
  status: "idle",
  transcript: null,
  tasks: [],
  jiraResults: [],
  errorMessage: null,
  progress: { stage: "Ожидание загрузки", percentage: 0 },
};

async function whisperRequest(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/whisper", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const { detail } = (await response.json().catch(() => ({ detail: "Ошибка транскрипции" }))) as {
      detail?: string;
    };
    throw new Error(detail ?? "Ошибка при обращении к OpenAI Whisper API");
  }
  const data = (await response.json()) as { transcript: string };
  return data.transcript;
}

async function nlpRequest(transcript: string): Promise<string[]> {
  const response = await fetch("/api/extract-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  if (!response.ok) {
    const { detail } = (await response.json().catch(() => ({ detail: "Ошибка NLP" }))) as {
      detail?: string;
    };
    throw new Error(detail ?? "Ошибка при анализе текста");
  }
  const data = (await response.json()) as { tasks: string[] };
  return data.tasks;
}

export function useWorkflowManager() {
  const [state, setState] = useState<WorkflowState>(initialState);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const startUpload = useCallback(async (file: File) => {
    setState({
      ...initialState,
      status: "uploading",
      progress: { stage: "Загрузка файла...", percentage: 10 },
    });
    try {
      setState((prev) => ({
        ...prev,
        status: "transcribing",
        progress: { stage: "Транскрипция (может занять несколько минут)...", percentage: 35 },
      }));
      const transcript = await whisperRequest(file);
      setState((prev) => ({
        ...prev,
        transcript,
        status: "extracting",
        progress: { stage: "Анализ текста и извлечение задач...", percentage: 65 },
      }));
      const tasks = await nlpRequest(transcript);
      setState((prev) => ({
        ...prev,
        tasks,
        status: "ready",
        progress: { stage: "Готово к интеграции с Jira", percentage: 90 },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: message,
        progress: { stage: "Произошла ошибка", percentage: prev.progress.percentage },
      }));
    }
  }, []);

  const submitToJira = useCallback(
    async (config: JiraConfig) => {
      if (state.tasks.length === 0) {
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: "Нет задач для отправки в Jira",
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        status: "submittingJira",
        errorMessage: null,
        progress: { stage: "Отправка задач в Jira...", percentage: 95 },
      }));

      try {
        const response = await fetch("/api/create-jira-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: state.tasks, config }),
        });
        const data = (await response.json().catch(() => ({ results: [] }))) as {
          results: JiraResult[];
          detail?: string;
        };

        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            status: "done",
            jiraResults: data.results ?? [],
            errorMessage: data.detail ?? "Часть задач не удалось создать в Jira",
            progress: { stage: "Процесс завершён с ошибками", percentage: 100 },
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          status: "done",
          jiraResults: data.results,
          progress: { stage: "Процесс завершён", percentage: 100 },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: message,
          progress: { stage: "Произошла ошибка", percentage: prev.progress.percentage },
        }));
      }
    },
    [state.tasks],
  );

  return {
    state,
    actions: {
      startUpload,
      submitToJira,
      reset,
    },
  };
}
