import { NextResponse } from "next/server";
import { fetchGoogleMeetRecording } from "@/lib/integrations/googleMeet";
import { extractTasks } from "@/lib/nlp";
import { transcribeAudioBuffer } from "@/lib/transcription";

export const runtime = "nodejs";

interface GoogleIngestRequest {
  fileId?: string;
  accessToken?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: GoogleIngestRequest;
  try {
    payload = (await request.json()) as GoogleIngestRequest;
  } catch (error) {
    return NextResponse.json({ detail: "Некорректный JSON" }, { status: 400 });
  }

  if (!payload?.fileId || !payload.accessToken) {
    return NextResponse.json({ detail: "fileId и accessToken обязательны" }, { status: 400 });
  }

  try {
    const recording = await fetchGoogleMeetRecording({
      fileId: payload.fileId,
      accessToken: payload.accessToken,
    });
    const transcript = await transcribeAudioBuffer(recording.data, recording.fileName, recording.mimeType);
    const tasks = await extractTasks(transcript);
    return NextResponse.json({ transcript, tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось импортировать запись Google Meet";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
