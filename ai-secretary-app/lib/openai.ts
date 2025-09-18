import { Buffer } from "node:buffer";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    const timeout = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 90000);
    client = new OpenAI({
      apiKey,
      timeout,
    });
  }
  return client;
}

export async function transcribeFileWithOpenAI(file: File): Promise<string> {
  const openai = getClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const preparedFile = await toFile(buffer, file.name || "meeting-audio", {
    type: file.type || "application/octet-stream",
  });
  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: preparedFile,
  });
  if (!response.text) {
    throw new Error("Empty transcription response from OpenAI Whisper API");
  }
  return response.text;
}


