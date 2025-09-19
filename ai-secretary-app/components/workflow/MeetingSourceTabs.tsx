"use client";

import { useState } from "react";
import { FileUploader } from "@/components/workflow/FileUploader";
import { GoogleMeetImportForm } from "@/components/workflow/GoogleMeetImportForm";
import { ZoomImportForm } from "@/components/workflow/ZoomImportForm";
import type { GoogleMeetImportPayload, ZoomImportPayload } from "@/lib/types";

type TabKey = "upload" | "zoom" | "google";

interface MeetingSourceTabsProps {
  onUpload: (file: File) => Promise<void> | void;
  onZoomImport: (payload: ZoomImportPayload) => Promise<void> | void;
  onGoogleImport: (payload: GoogleMeetImportPayload) => Promise<void> | void;
  disabled?: boolean;
}

const TABS: { id: TabKey; label: string; description: string }[] = [
  { id: "upload", label: "Локальный файл", description: "Загрузите запись вручную" },
  { id: "zoom", label: "Zoom", description: "Подключите облачную запись" },
  { id: "google", label: "Google Meet", description: "Возьмите запись из Google Drive" },
];

export function MeetingSourceTabs({ onUpload, onZoomImport, onGoogleImport, disabled }: MeetingSourceTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("upload");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${activeTab === tab.id ? "bg-primary text-white shadow" : "bg-white text-slate-700 shadow"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{TABS.find((tab) => tab.id === activeTab)?.description}</p>
      {activeTab === "upload" && <FileUploader onUpload={onUpload} disabled={disabled} />}
      {activeTab === "zoom" && <ZoomImportForm onSubmit={onZoomImport} disabled={disabled} />}
      {activeTab === "google" && <GoogleMeetImportForm onSubmit={onGoogleImport} disabled={disabled} />}
    </section>
  );
}
