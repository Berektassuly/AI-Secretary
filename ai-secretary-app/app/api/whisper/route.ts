import { NextResponse } from "next/server";
import { transcribeFileWithWhisper } from "@/lib/openai";
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
    const transcript = await transcribeFileWithWhisper(file);
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Whisper transcription failed", error);
    return NextResponse.json(
      { detail: "Ошибка при обращении к OpenAI Whisper API" },
      { status: 502 },
    );
  }
}
