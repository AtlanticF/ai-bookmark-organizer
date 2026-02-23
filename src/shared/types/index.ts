export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface QueueTask {
  id: string;
  bookmarkId: string;
  title: string;
  url: string;
  status:
    | "pending"
    | "extracting"
    | "classifying"
    | "moving"
    | "done"
    | "error";
  tabId?: number;
  content?: string;
  targetFolder?: string;
  error?: string;
  createdAt: number;
}

export interface ArchiveRecord {
  bookmarkId: string;
  title: string;
  url: string;
  fromFolder: string;
  toFolder: string;
  timestamp: number;
}

export interface FolderNode {
  id: string;
  title: string;
  children?: FolderNode[];
}

export interface FolderTreeCache {
  tree: FolderNode[];
  lastUpdated: number;
}

export interface BulkProgress {
  total: number;
  completed: number;
  failed: number;
  status: "idle" | "running" | "done" | "error";
}

export interface ClassificationResponse {
  folder_path: string;
  is_new_folder: boolean;
  confidence: number;
  reason: string;
}

export interface ProposedFolder {
  name: string;
  description: string;
  children: { name: string; description: string }[];
  estimated_count: number;
}

export interface FolderStructureResponse {
  folders: ProposedFolder[];
  total_bookmarks: number;
  uncategorized_count: number;
}

export interface ContentExtractionResult {
  title: string;
  description: string;
  summary: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "PARSE_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(
    message: string,
    public code: ApiErrorCode,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ExtensionMessage =
  | { type: "EXTRACT_CONTENT" }
  | { type: "TEST_API_CONNECTION" }
  | { type: "START_BULK_ARCHIVE"; payload: { folders: ProposedFolder[] } }
  | { type: "RE_ARCHIVE_BOOKMARK"; payload: { bookmarkId: string } };

export interface StorageSchema {
  api_config: ApiConfig;
  task_queue: QueueTask[];
  archive_history: ArchiveRecord[];
  folder_tree_cache: FolderTreeCache;
  onboarding_completed: boolean;
  bulk_archive_progress: BulkProgress;
}
