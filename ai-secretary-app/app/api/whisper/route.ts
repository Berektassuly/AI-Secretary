import { NextResponse } from "next/server";
import { transcribeAudioFile } from "@/lib/transcription";
import { WHISPER_MAX_FILE_SIZE_BYTES } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ detail: "Файл не найден в запросе" }, { status: 400 });
  }

  if (file.size > WHISPER_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        detail: "Файл превышает лимит 25 МБ для Whisper API",
      },
      { status: 413 },
    );
  }

  try {
    const transcript = await transcribeAudioFile(file);
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Whisper transcription failed", error);
    const detail = error instanceof Error ? error.message : "Ошибка при обработке аудио (Whisper)";
    const status = error instanceof Error && detail.includes("не настроен") ? 500 : 502;
    return NextResponse.json({ detail }, { status });
  }
}
