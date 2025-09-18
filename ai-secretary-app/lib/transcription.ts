import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const whisperCppBinary = process.env.WHISPER_CPP_BINARY;
const whisperCppModel = process.env.WHISPER_CPP_MODEL;
const whisperCppLanguage = process.env.WHISPER_CPP_LANGUAGE;
const whisperCppThreads = parsePositiveInteger(process.env.WHISPER_CPP_THREADS);
const whisperCppEnabled = parseBoolean(process.env.WHISPER_CPP_ENABLED, true);
const whisperCppTimeoutMs = parseTimeout(process.env.WHISPER_CPP_TIMEOUT_MS);

const MAX_STDERR_LOG_LENGTH = 2000;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  return !["false", "0", "no"].includes(normalized);
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseTimeout(value: string | undefined): number | undefined {
  if (!value) {
    return 300_000; // 5 minutes by default
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isWhisperCppAvailable(): boolean {
  return Boolean(whisperCppEnabled && whisperCppBinary && whisperCppModel);
}

function getFileExtension(name: string | undefined): string {
  if (!name) {
    return "";
  }
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) {
    return "";
  }
  return name.slice(lastDot);
}

async function runWhisperCpp(binary: string, args: string[], timeoutMs?: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderrBuffer = "";
    let completed = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    const rejectOnce = (error: Error) => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      reject(error);
    };

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrBuffer = `${stderrBuffer}${chunk}`;
      if (stderrBuffer.length > MAX_STDERR_LOG_LENGTH) {
        stderrBuffer = stderrBuffer.slice(-MAX_STDERR_LOG_LENGTH);
      }
    });

    child.on("error", (error) => {
      rejectOnce(new Error(`Failed to start whisper.cpp binary: ${error.message}`));
    });

    child.on("close", (code) => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      if (code === 0) {
        resolve();
      } else {
        const trimmedStderr = stderrBuffer.trim();
        const details = trimmedStderr ? `: ${trimmedStderr}` : "";
        reject(new Error(`whisper.cpp exited with code ${code}${details}`));
      }
    });

    if (timeoutMs && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        child.kill("SIGKILL");
        rejectOnce(new Error(`whisper.cpp timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    }
  });
}

async function transcribeFileWithWhisperCpp(file: File): Promise<string> {
  if (!whisperCppBinary || !whisperCppModel) {
    throw new Error("whisper.cpp binary or model path is not configured");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "whisper-"));
  const extension = getFileExtension(file.name);
  const inputFileName = `${randomUUID()}${extension || ".tmp"}`;
  const inputFilePath = join(tempDir, inputFileName);
  const outputBasePath = join(tempDir, "transcript");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputFilePath, buffer);

    const args = ["-m", whisperCppModel, "-f", inputFilePath, "-otxt", "-of", outputBasePath];
    if (whisperCppLanguage) {
      args.push("-l", whisperCppLanguage);
    }
    if (whisperCppThreads !== undefined) {
      args.push("-t", String(whisperCppThreads));
    }

    await runWhisperCpp(whisperCppBinary, args, whisperCppTimeoutMs);

    const transcriptPath = `${outputBasePath}.txt`;
    const transcriptRaw = await readFile(transcriptPath, "utf8");
    const transcript = transcriptRaw.replace(/\r?\n/g, "\n").trim();
    if (!transcript) {
      throw new Error("whisper.cpp produced an empty transcription");
    }
    return transcript;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown whisper.cpp error";
    throw new Error(`whisper.cpp transcription failed: ${message}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function transcribeAudioFile(file: File): Promise<string> {
  if (!isWhisperCppAvailable()) {
    throw new Error(
      "Локальный движок Whisper не настроен: укажите переменные WHISPER_CPP_BINARY и WHISPER_CPP_MODEL",
    );
  }

  try {
    return await transcribeFileWithWhisperCpp(file);
  } catch (error) {
    console.error("Whisper.cpp transcription failed", error);
    throw error instanceof Error ? error : new Error("Whisper.cpp transcription failed");
  }
}
