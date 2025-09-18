"use client";

import { useState } from "react";
import { WHISPER_MAX_FILE_SIZE_BYTES } from "@/lib/constants";

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void> | void;
  disabled?: boolean;
}

const MAX_SIZE_MB = Math.round(WHISPER_MAX_FILE_SIZE_BYTES / (1024 * 1024));

export function FileUploader({ onUpload, disabled }: FileUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > WHISPER_MAX_FILE_SIZE_BYTES) {
      setError(`Размер файла превышает ${MAX_SIZE_MB} МБ`);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setError("Пожалуйста, выберите файл для загрузки");
      return;
    }
    setError(null);
    await onUpload(selectedFile);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6 rounded-lg bg-white p-8 shadow">
      <div>
        <label htmlFor="meeting-file" className="block text-sm font-medium text-slate-700">
          Загрузите аудио- или видеофайл встречи
        </label>
        <input
          id="meeting-file"
          type="file"
          name="file"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          disabled={disabled}
          className="mt-2 w-full rounded-md border border-slate-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p className="mt-2 text-sm text-slate-500">Поддерживаются форматы mp3, mp4, wav и др. Лимит — {MAX_SIZE_MB} МБ.</p>
      </div>
      {selectedFile && (
        <div className="rounded-md border border-dashed border-primary/50 bg-primary/5 p-4 text-sm text-slate-600">
          <p className="font-medium">Выбранный файл:</p>
          <p className="mt-1 break-all text-slate-700">{selectedFile.name}</p>
          <p className="text-xs text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} МБ</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={disabled || !selectedFile}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Начать обработку
      </button>
    </form>
  );
}
