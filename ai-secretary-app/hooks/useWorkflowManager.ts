import { useCallback, useEffect, useState } from "react";
import type { JiraConfig, JiraResult } from "@/lib/jira";
import type { ActionItem, GoogleMeetImportPayload, ZoomImportPayload } from "@/lib/types";
import {
  clearMeetingHistory as clearStoredMeetingHistory,
  createMeetingSummary,
  loadMeetingHistory,
  persistMeetingSummary,
  replaceMeetingSummary,
  type MeetingSource,
  type MeetingSummary,
} from "@/lib/memory";

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
  tasks: ActionItem[];
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

async function nlpRequest(transcript: string): Promise<ActionItem[]> {
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
  const data = (await response.json()) as { tasks: ActionItem[] };
  return data.tasks;
}

async function ingestRequest(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<{ transcript: string; tasks: ActionItem[] }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const { detail } = (await response.json().catch(() => ({ detail: "Ошибка при импорте встречи" }))) as {
      detail?: string;
    };
    throw new Error(detail ?? "Ошибка при импорте встречи");
  }
  const data = (await response.json()) as { transcript: string; tasks: ActionItem[] };
  return {
    transcript: data.transcript,
    tasks: data.tasks.map((task) => ({
      ...task,
      labels: Array.isArray(task.labels) ? task.labels : [],
    })),
  };
}

export function useWorkflowManager() {
  const [state, setState] = useState<WorkflowState>(initialState);
  const [history, setHistory] = useState<MeetingSummary[]>([]);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadMeetingHistory());
  }, []);

  const persistMeeting = useCallback(
    (
      source: MeetingSource,
      transcript: string,
      tasks: ActionItem[],
      metadata?: Record<string, string | undefined | null>,
    ) => {
      if (!tasks || tasks.length === 0) {
        return;
      }
      const summary = createMeetingSummary({ source, transcript, tasks, metadata });
      setHistory((prev) => persistMeetingSummary(summary, prev));
      setActiveMeetingId(summary.id);
    },
    [],
  );

  const clearHistory = useCallback(() => {
    clearStoredMeetingHistory();
    setHistory([]);
    setActiveMeetingId(null);
  }, []);

  const updateHistoryWithJira = useCallback(
    (results: JiraResult[]) => {
      if (!activeMeetingId) {
        return;
      }
      if (!Array.isArray(results) || results.length === 0) {
        return;
      }
      setHistory((prev) => replaceMeetingSummary(activeMeetingId, (summary) => ({ ...summary, jiraResults: results }), prev));
    },
    [activeMeetingId],
  );

  const reset = useCallback(() => {
    setState({ ...initialState });
    setActiveMeetingId(null);
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
      persistMeeting("upload", transcript, tasks, { fileName: file.name });
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

  const startZoomImport = useCallback(
    async (payload: ZoomImportPayload) => {
      setState({
        ...initialState,
        status: "transcribing",
        progress: { stage: "Запрос записи Zoom...", percentage: 20 },
      });
      try {
        const { transcript, tasks } = await ingestRequest("/api/ingest/zoom", payload);
        persistMeeting("zoom", transcript, tasks, {
          meetingId: payload.meetingId,
          recordingType: payload.recordingType,
        });
        setState({
          status: "ready",
          transcript,
          tasks,
          jiraResults: [],
          errorMessage: null,
          progress: { stage: "Готово к интеграции с Jira", percentage: 90 },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        setState({
          status: "error",
          transcript: null,
          tasks: [],
          jiraResults: [],
          errorMessage: message,
          progress: { stage: "Произошла ошибка", percentage: 100 },
        });
      }
    },
    [],
  );

  const startGoogleImport = useCallback(
    async (payload: GoogleMeetImportPayload) => {
      setState({
        ...initialState,
        status: "transcribing",
        progress: { stage: "Загрузка записи Google Meet...", percentage: 20 },
      });
      try {
        const { transcript, tasks } = await ingestRequest("/api/ingest/google-meet", payload);
        persistMeeting("google", transcript, tasks, {
          fileId: payload.fileId,
        });
        setState({
          status: "ready",
          transcript,
          tasks,
          jiraResults: [],
          errorMessage: null,
          progress: { stage: "Готово к интеграции с Jira", percentage: 90 },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        setState({
          status: "error",
          transcript: null,
          tasks: [],
          jiraResults: [],
          errorMessage: message,
          progress: { stage: "Произошла ошибка", percentage: 100 },
        });
      }
    },
    [],
  );

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

        if (Array.isArray(data.results) && data.results.length > 0) {
          updateHistoryWithJira(data.results);
        }

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
    [state.tasks, updateHistoryWithJira],
  );

  return {
    state,
    history,
    actions: {
      startUpload,
      startZoomImport,
      startGoogleImport,
      submitToJira,
      clearHistory,
      reset,
    },
  };
}
