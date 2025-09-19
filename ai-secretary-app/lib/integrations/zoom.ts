import type { ZoomImportPayload } from "@/lib/types";

interface ZoomRecordingFile {
  id: string;
  recording_type?: string;
  download_url: string;
  file_type?: string;
  file_extension?: string;
}

interface ZoomRecordingResponse {
  recording_files?: ZoomRecordingFile[];
  topic?: string;
  id?: number;
  uuid?: string;
}

function normalizeMimeType(file: ZoomRecordingFile): string {
  const extension = file.file_extension?.toLowerCase();
  const type = file.file_type?.toLowerCase();
  if (type === "mp4") {
    return "video/mp4";
  }
  if (type === "m4a" || extension === "m4a") {
    return "audio/mp4";
  }
  if (type === "m3u8") {
    return "application/vnd.apple.mpegurl";
  }
  if (extension === "mp3") {
    return "audio/mpeg";
  }
  if (extension === "wav") {
    return "audio/wav";
  }
  return "audio/mpeg";
}

function buildFileName(response: ZoomRecordingResponse, file: ZoomRecordingFile): string {
  const base = response.topic?.replace(/\s+/g, "-") ?? "zoom-recording";
  const extension = file.file_extension ? file.file_extension.toLowerCase() : "mp4";
  return `${base}-${file.id}.${extension}`;
}

function selectRecordingFile(response: ZoomRecordingResponse, recordingType?: string): ZoomRecordingFile | null {
  const files = response.recording_files ?? [];
  if (recordingType) {
    const preferred = files.find((file) => file.recording_type === recordingType);
    if (preferred) {
      return preferred;
    }
  }
  const audioOnly = files.find((file) => file.recording_type === "audio_only");
  if (audioOnly) {
    return audioOnly;
  }
  return files[0] ?? null;
}

export async function fetchZoomRecording(
  payload: ZoomImportPayload,
): Promise<{ data: ArrayBuffer; mimeType: string; fileName: string }> {
  const meetingId = encodeURIComponent(payload.meetingId);
  const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${payload.accessToken}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Zoom API error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as ZoomRecordingResponse;
  const recording = selectRecordingFile(data, payload.recordingType);
  if (!recording) {
    throw new Error("Не удалось найти запись встречи в Zoom");
  }

  const downloadUrl = new URL(recording.download_url);
  if (payload.passcode) {
    downloadUrl.searchParams.set("passwd", payload.passcode);
  }
  downloadUrl.searchParams.set("access_token", payload.accessToken);

  const downloadResponse = await fetch(downloadUrl.toString(), {
    headers: {
      Authorization: `Bearer ${payload.accessToken}`,
    },
  });

  if (!downloadResponse.ok) {
    throw new Error(`Zoom download error ${downloadResponse.status}`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  return {
    data: arrayBuffer,
    mimeType: normalizeMimeType(recording),
    fileName: buildFileName(data, recording),
  };
}
