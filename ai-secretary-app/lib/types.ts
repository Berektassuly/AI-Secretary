export interface ActionItem {
  summary: string;
  confidence: number;
  source?: string | null;
  assignee?: string | null;
  due?: string | null;
  priority?: string | null;
  labels: string[];
}

export interface ZoomImportPayload {
  meetingId: string;
  accessToken: string;
  recordingType?: string;
  passcode?: string;
}

export interface GoogleMeetImportPayload {
  fileId: string;
  accessToken: string;
}
