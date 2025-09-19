"use client";

import { useState } from "react";
import type { GoogleMeetImportPayload } from "@/lib/types";

interface GoogleMeetImportFormProps {
  onSubmit: (payload: GoogleMeetImportPayload) => Promise<void> | void;
  disabled?: boolean;
}

export function GoogleMeetImportForm({ onSubmit, disabled }: GoogleMeetImportFormProps) {
  const [form, setForm] = useState({
    fileId: "",
    accessToken: "",
  });
  const [error, setError] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.fileId || !form.accessToken) {
      setError("Укажите идентификатор файла записи и OAuth токен Google");
      return;
    }
    setError(null);
    await onSubmit({
      fileId: form.fileId.trim(),
      accessToken: form.accessToken.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-slate-800">Импорт записи Google Meet</h2>
      <p className="text-sm text-slate-500">
        Укажите идентификатор файла записи в Google Drive. Токен должен иметь доступ к чтению Drive (<code>https://www.googleapis.com/auth/drive.readonly</code>).
      </p>
      <div>
        <label htmlFor="fileId" className="block text-sm font-medium text-slate-700">
          File ID в Google Drive
        </label>
        <input
          id="fileId"
          name="fileId"
          value={form.fileId}
          onChange={handleChange}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="1A2b3C4d5E6f"
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
          placeholder="ya29.a0..."
          disabled={disabled}
          required
        />
        <p className="mt-1 text-xs text-slate-500">Токен используется разово для скачивания аудио с Google Drive.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Импортировать из Google Meet
      </button>
    </form>
  );
}
