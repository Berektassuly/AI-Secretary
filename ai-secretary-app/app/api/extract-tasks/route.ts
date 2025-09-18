import { NextResponse } from "next/server";
import { NLPServiceError, extractTasks } from "@/lib/nlp";

export const runtime = "nodejs";

interface ExtractTasksRequest {
  transcript?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: ExtractTasksRequest;
  try {
    payload = (await request.json()) as ExtractTasksRequest;
  } catch (error) {
    return NextResponse.json({ detail: "Некорректный JSON" }, { status: 400 });
  }

  if (!payload?.transcript || typeof payload.transcript !== "string") {
    return NextResponse.json({ detail: "Поле transcript обязательно" }, { status: 400 });
  }

  try {
    const tasks = await extractTasks(payload.transcript);
    return NextResponse.json({ tasks });
  } catch (error) {
    if (error instanceof NLPServiceError) {
      return NextResponse.json({ detail: error.message }, { status: 502 });
    }
    console.error("NLP service call failed", error);
    return NextResponse.json(
      { detail: "Внутренняя ошибка при вызове NLP-сервиса" },
      { status: 500 },
    );
  }
}
