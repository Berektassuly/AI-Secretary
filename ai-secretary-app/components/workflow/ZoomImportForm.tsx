"use client";

import { useState } from "react";
import type { ZoomImportPayload } from "@/lib/types";

interface ZoomImportFormProps {
  onSubmit: (payload: ZoomImportPayload) => Promise<void> | void;
  disabled?: boolean;
}

const RECORDING_TYPES = [
  { value: "audio_only", label: "Только аудио" },
  { value: "shared_screen_with_speaker_view", label: "Экран + докладчик" },
  { value: "active_speaker", label: "Активный докладчик" },
];

export function ZoomImportForm({ onSubmit, disabled }: ZoomImportFormProps) {
  const [form, setForm] = useState({
    meetingId: "",
    accessToken: "",
    recordingType: RECORDING_TYPES[0].value,
    passcode: "",
  });
  const [error, setError] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.meetingId || !form.accessToken) {
      setError("Укажите идентификатор встречи и OAuth токен Zoom");
      return;
    }
    setError(null);
    await onSubmit({
      meetingId: form.meetingId.trim(),
      accessToken: form.accessToken.trim(),
      recordingType: form.recordingType,
      passcode: form.passcode.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-slate-800">Импорт записи Zoom</h2>
      <p className="text-sm text-slate-500">
        Используйте OAuth access token с областью <code>recording:read</code>. Сервис загрузит аудио автоматически и передаст его
        в пайплайн.
      </p>
      <div>
        <label htmlFor="meetingId" className="block text-sm font-medium text-slate-700">
          Идентификатор встречи или UUID
        </label>
        <input
          id="meetingId"
          name="meetingId"
          value={form.meetingId}
          onChange={handleChange}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="123456789"
          disabled={disabled}
          required
        />
      </div>
      <div>
        <label htmlFor="accessToken" className="block text-sm font-medium text-slate-700">
          OAuth токен доступа
        </label>
        <input
          id="accessToken"
          name="accessToken"
          value={form.accessToken}
          onChange={handleChange}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="eyJhbGciOi..."
          disabled={disabled}
          required
        />
        <p className="mt-1 text-xs text-slate-500">Токен не сохраняется и используется только для текущего запроса.</p>
      </div>
      <div>
        <label htmlFor="recordingType" className="block text-sm font-medium text-slate-700">
          Тип записи
        </label>
        <select
          id="recordingType"
          name="recordingType"
          value={form.recordingType}
          onChange={handleChange}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          disabled={disabled}
        >
          {RECORDING_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="passcode" className="block text-sm font-medium text-slate-700">
          Пароль записи (если требуется)
        </label>
        <input
          id="passcode"
          name="passcode"
          value={form.passcode}
          onChange={handleChange}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="abcd1234"
          disabled={disabled}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Импортировать из Zoom
      </button>
    </form>
  );
}
