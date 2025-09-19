"use client";

import { useState } from "react";
import type { JiraConfig } from "@/lib/jira";

interface JiraIntegrationFormProps {
  onSubmit: (config: JiraConfig) => Promise<void> | void;
  disabled?: boolean;
  defaultBaseUrl?: string;
}

export function JiraIntegrationForm({ onSubmit, disabled, defaultBaseUrl }: JiraIntegrationFormProps) {
  const [config, setConfig] = useState<JiraConfig>({
    baseUrl: defaultBaseUrl ?? "",
    email: "",
    token: "",
    projectKey: "",
    description: undefined,
    issueType: "Task",
    defaultAssignee: "",
    defaultPriority: "",
    defaultLabels: [],
    syncAssignee: true,
    syncDueDate: true,
    syncPriority: true,
    syncLabels: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [labelsInput, setLabelsInput] = useState("");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    const nextValue =
      name === "projectKey" ? value.toUpperCase().replace(/\s+/g, "") : value;
    if (name === "defaultLabels") {
      setLabelsInput(nextValue);
      const labels = nextValue
        .split(",")
        .map((label) => label.trim())
        .filter((label) => label.length > 0);
      setConfig((prev) => ({ ...prev, defaultLabels: labels }));
      return;
    }
    setConfig((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handleToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setConfig((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config.baseUrl || !config.email || !config.token || !config.projectKey) {
      setError("Пожалуйста, заполните обязательные поля");
      return;
    }
    setError(null);
    await onSubmit({
      ...config,
      issueType: config.issueType?.trim() || "Task",
      defaultAssignee: config.defaultAssignee?.trim() || undefined,
      defaultPriority: config.defaultPriority?.trim() || undefined,
      defaultLabels: config.defaultLabels && config.defaultLabels.length > 0 ? config.defaultLabels : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-slate-800">Интеграция с Jira</h2>
      <p className="mt-2 text-sm text-slate-500">Мы рекомендуем использовать токен API Atlassian и сервисный аккаунт.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="baseUrl" className="block text-sm font-medium text-slate-700">
            Базовый URL Jira
          </label>
          <input
            id="baseUrl"
            name="baseUrl"
            value={config.baseUrl}
            onChange={handleChange}
            placeholder="https://your-company.atlassian.net"
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            E-mail пользователя
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={config.email}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label htmlFor="token" className="block text-sm font-medium text-slate-700">
            API Token
          </label>
          <input
            id="token"
            name="token"
            type="password"
            value={config.token}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <label htmlFor="projectKey" className="block text-sm font-medium text-slate-700">
            Ключ проекта
          </label>
          <input
            id="projectKey"
            name="projectKey"
            value={config.projectKey}
            onChange={handleChange}
            placeholder="AI"
            autoCapitalize="characters"
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Используйте ключ проекта из Jira (обычно состоит из заглавных латинских букв и цифр).
          </p>
        </div>
        <div>
          <label htmlFor="issueType" className="block text-sm font-medium text-slate-700">
            Тип задачи
          </label>
          <input
            id="issueType"
            name="issueType"
            value={config.issueType ?? ""}
            onChange={handleChange}
            placeholder="Task"
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">Например: Task, Story, Bug — в зависимости от схемы проекта.</p>
        </div>
        <div>
          <label htmlFor="defaultAssignee" className="block text-sm font-medium text-slate-700">
            Исполнитель по умолчанию
          </label>
          <input
            id="defaultAssignee"
            name="defaultAssignee"
            value={config.defaultAssignee ?? ""}
            onChange={handleChange}
            placeholder="accountId или @username"
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">Используется, если модель не смогла определить исполнителя.</p>
        </div>
        <div>
          <label htmlFor="defaultPriority" className="block text-sm font-medium text-slate-700">
            Приоритет по умолчанию
          </label>
          <select
            id="defaultPriority"
            name="defaultPriority"
            value={config.defaultPriority ?? ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
          >
            <option value="">Использовать значение из модели</option>
            <option value="Highest">Highest</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="Lowest">Lowest</option>
          </select>
        </div>
        <div>
          <label htmlFor="defaultLabels" className="block text-sm font-medium text-slate-700">
            Метки по умолчанию
          </label>
          <input
            id="defaultLabels"
            name="defaultLabels"
            value={labelsInput}
            onChange={handleChange}
            placeholder="meeting, automation"
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">Перечислите через запятую — будут добавлены ко всем созданным задачам.</p>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium text-slate-700">
            Описание (опционально)
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={config.description ?? ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">
            Этот текст будет добавлен в каждую задачу перед служебной подписью.
          </p>
        </div>
      </div>
      <fieldset className="mt-6 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
        <legend className="px-2 text-sm font-semibold text-slate-700">Использовать данные, извлечённые моделью</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="syncAssignee"
            checked={config.syncAssignee !== false}
            onChange={handleToggle}
            disabled={disabled}
          />
          Подставлять исполнителя из транскрипта (если найден)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="syncDueDate"
            checked={config.syncDueDate !== false}
            onChange={handleToggle}
            disabled={disabled}
          />
          Заполнять поле дедлайна
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="syncPriority"
            checked={config.syncPriority !== false}
            onChange={handleToggle}
            disabled={disabled}
          />
          Сохранять определённый приоритет
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="syncLabels"
            checked={config.syncLabels !== false}
            onChange={handleToggle}
            disabled={disabled}
          />
          Добавлять ярлыки, найденные моделью
        </label>
      </fieldset>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Отправить задачи в Jira
      </button>
    </form>
  );
}
