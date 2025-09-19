import { NextResponse } from "next/server";
import { fetchZoomRecording } from "@/lib/integrations/zoom";
import { extractTasks } from "@/lib/nlp";
import { transcribeAudioBuffer } from "@/lib/transcription";

export const runtime = "nodejs";

interface ZoomIngestRequest {
  meetingId?: string;
  accessToken?: string;
  recordingType?: string;
  passcode?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: ZoomIngestRequest;
  try {
    payload = (await request.json()) as ZoomIngestRequest;
  } catch (error) {
    return NextResponse.json({ detail: "Некорректный JSON" }, { status: 400 });
  }

  if (!payload?.meetingId || !payload.accessToken) {
    return NextResponse.json({ detail: "meetingId и accessToken обязательны" }, { status: 400 });
  }

  try {
    const recording = await fetchZoomRecording({
      meetingId: payload.meetingId,
      accessToken: payload.accessToken,
      recordingType: payload.recordingType,
      passcode: payload.passcode,
    });
    const transcript = await transcribeAudioBuffer(recording.data, recording.fileName, recording.mimeType);
    const tasks = await extractTasks(transcript);
    return NextResponse.json({ transcript, tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось импортировать запись Zoom";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
