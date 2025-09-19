import type { GoogleMeetImportPayload } from "@/lib/types";

interface DriveFileMetadata {
  name?: string;
  mimeType?: string;
}

export async function fetchGoogleMeetRecording(
  payload: GoogleMeetImportPayload,
): Promise<{ data: ArrayBuffer; mimeType: string; fileName: string }> {
  const metadataResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(payload.fileId)}?fields=name,mimeType`,
    {
      headers: {
        Authorization: `Bearer ${payload.accessToken}`,
      },
    },
  );

  if (!metadataResponse.ok) {
    const detail = await metadataResponse.text();
    throw new Error(`Google Drive API error ${metadataResponse.status}: ${detail.slice(0, 200)}`);
  }

  const metadata = (await metadataResponse.json()) as DriveFileMetadata;

  const downloadResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(payload.fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${payload.accessToken}`,
      },
    },
  );

  if (!downloadResponse.ok) {
    throw new Error(`Не удалось скачать запись из Google Drive: ${downloadResponse.status}`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  const fileName = metadata.name ? metadata.name.replace(/\s+/g, "-") : `google-meet-${payload.fileId}`;
  const mimeType = metadata.mimeType ?? "audio/mpeg";
  return { data: arrayBuffer, mimeType, fileName };
}
