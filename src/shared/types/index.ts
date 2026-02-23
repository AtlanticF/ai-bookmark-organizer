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

export type ExtensionMessage =
  | { type: "EXTRACT_CONTENT" }
  | { type: "TEST_API_CONNECTION" }
  | { type: "START_BULK_ARCHIVE"; payload: { folders: ProposedFolder[] } }
  | { type: "RE_ARCHIVE_BOOKMARK"; payload: { bookmarkId: string } };
