import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import StepBulkArchive from "../StepBulkArchive";
import type { ProposedFolder } from "@/shared/types";

vi.mock("@/background/ai-classifier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/background/ai-classifier")>();
  return {
    ...actual,
    generateFolderStructure: vi.fn(),
    batchClassifyBookmarks: vi.fn(),
    batchRenameBookmarks: vi.fn(),
    pruneBookmarks: vi.fn(),
    decideFolderMerge: vi.fn(),
  };
});

let store: Record<string, unknown> = {};

const mockFolders: ProposedFolder[] = [
  {
    name: "📥_Inbox",
    description: "Buffer",
    children: [],
    estimated_count: 0,
  },
  {
    name: "🔥_Critical",
    description: "Daily tools",
    children: [],
    estimated_count: 5,
  },
  {
    name: "📚_Library",
    description: "Knowledge",
    children: [{ name: "AI", description: "AI stuff" }],
    estimated_count: 10,
  },
  {
    name: "💤_Archive",
    description: "Cold storage",
    children: [],
    estimated_count: 0,
  },
];

beforeEach(() => {
  store = {};
  vi.clearAllMocks();

  vi.mocked(chrome.storage.local.get).mockImplementation(
    async (keys?: string | string[] | null) => {
      if (typeof keys === "string") return { [keys]: store[keys] };
      return store;
    },
  );

  vi.mocked(chrome.storage.local.set).mockImplementation(
    async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
  );

  (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  (chrome.storage.onChanged.removeListener as ReturnType<typeof vi.fn>).mockImplementation(() => {});

  vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([
    {
      id: "0",
      title: "",
      children: [
        {
          id: "1",
          title: "Bookmarks Bar",
          children: [
            {
              id: "10",
              title: "Test Bookmark",
              url: "https://test.com",
            },
          ],
        },
      ],
    },
  ] as chrome.bookmarks.BookmarkTreeNode[]);
});

describe("StepBulkArchive", () => {
  it("renders backup phase initially", () => {
    render(
      <StepBulkArchive
        folderStructure={[]}
        setFolderStructure={vi.fn()}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/Download Backup/i)).toBeInTheDocument();
    expect(screen.getByText(/Analyze & Clean Up/i)).toBeInTheDocument();
  });

  it("shows backup done indicator after download", async () => {
    const user = userEvent.setup();

    render(
      <StepBulkArchive
        folderStructure={[]}
        setFolderStructure={vi.fn()}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Download Backup/i));

    await waitFor(() => {
      expect(screen.getByText(/Backup downloaded/i)).toBeInTheDocument();
    });
  });

  it("renders folder editor in editing phase", () => {
    render(
      <StepBulkArchive
        folderStructure={mockFolders}
        setFolderStructure={vi.fn()}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );
  });

  it("cannot delete Inbox (00_) folder", () => {
    let folders = [...mockFolders];
    const setFolderStructure = vi.fn((f: ProposedFolder[]) => {
      folders = f;
    });

    render(
      <StepBulkArchive
        folderStructure={folders}
        setFolderStructure={setFolderStructure}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );
  });

  it("Back button calls onBack", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();

    render(
      <StepBulkArchive
        folderStructure={[]}
        setFolderStructure={vi.fn()}
        onComplete={vi.fn()}
        onBack={onBack}
      />,
    );

    const backButtons = screen.getAllByRole("button", { name: /^Back$/i });
    await user.click(backButtons[backButtons.length - 1]!);
    expect(onBack).toHaveBeenCalled();
  });

  it("enters renaming phase after prune with no candidates", async () => {
    const user = userEvent.setup();
    const { pruneBookmarks, batchRenameBookmarks } = await import("@/background/ai-classifier");
    vi.mocked(pruneBookmarks).mockResolvedValue([]);
    vi.mocked(batchRenameBookmarks).mockResolvedValue([
      { url: "https://test.com", newTitle: "[Tool] Test | Test #dev" },
    ]);

    render(
      <StepBulkArchive
        folderStructure={[]}
        setFolderStructure={vi.fn()}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Analyze & Clean Up/i));

    await waitFor(() => {
      expect(screen.getByText(/Generate Structure/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Generate Structure/i));

    await waitFor(() => {
      expect(screen.getByText(/Bookmark Rename Preview/i)).toBeInTheDocument();
    });
  });

  it("shows rename preview with editable inputs", async () => {
    const user = userEvent.setup();
    const { pruneBookmarks, batchRenameBookmarks } = await import("@/background/ai-classifier");
    vi.mocked(pruneBookmarks).mockResolvedValue([]);
    vi.mocked(batchRenameBookmarks).mockResolvedValue([
      { url: "https://test.com", newTitle: "[Tool] Test Page | Test #dev" },
    ]);

    render(
      <StepBulkArchive
        folderStructure={[]}
        setFolderStructure={vi.fn()}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Analyze & Clean Up/i));
    await waitFor(() => {
      expect(screen.getByText(/Generate Structure/i)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Generate Structure/i));

    await waitFor(() => {
      const input = screen.getByTestId("rename-input-0") as HTMLInputElement;
      expect(input.value).toBe("[Tool] Test Page | Test #dev");
    });
  });

  it("applies rename and proceeds to analyzing on confirm", async () => {
    const user = userEvent.setup();
    const { pruneBookmarks, batchRenameBookmarks, generateFolderStructure } = await import("@/background/ai-classifier");
    vi.mocked(pruneBookmarks).mockResolvedValue([]);
    vi.mocked(batchRenameBookmarks).mockResolvedValue([
      { url: "https://test.com", newTitle: "[Tool] Test Renamed | Site" },
    ]);
    vi.mocked(generateFolderStructure).mockResolvedValue({
      folders: mockFolders,
      total_bookmarks: 1,
      uncategorized_count: 0,
    });

    const setFolderStructure = vi.fn();

    render(
      <StepBulkArchive
        folderStructure={[]}
        setFolderStructure={setFolderStructure}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Analyze & Clean Up/i));
    await waitFor(() => {
      expect(screen.getByText(/Generate Structure/i)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Generate Structure/i));

    await waitFor(() => {
      expect(screen.getByText(/Bookmark Rename Preview/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Apply Renames/i));

    await waitFor(() => {
      expect(chrome.bookmarks.update).toHaveBeenCalledWith("10", {
        title: "[Tool] Test Renamed | Site",
      });
    });
  });

  it("skips rename and goes to analyzing", async () => {
    const user = userEvent.setup();
    const { pruneBookmarks, batchRenameBookmarks, generateFolderStructure } = await import("@/background/ai-classifier");
    vi.mocked(pruneBookmarks).mockResolvedValue([]);
    vi.mocked(batchRenameBookmarks).mockResolvedValue([
      { url: "https://test.com", newTitle: "[Tool] Test | Test" },
    ]);
    vi.mocked(generateFolderStructure).mockResolvedValue({
      folders: mockFolders,
      total_bookmarks: 1,
      uncategorized_count: 0,
    });

    const setFolderStructure = vi.fn();

    render(
      <StepBulkArchive
        folderStructure={[]}
        setFolderStructure={setFolderStructure}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByText(/Analyze & Clean Up/i));
    await waitFor(() => {
      expect(screen.getByText(/Generate Structure/i)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Generate Structure/i));

    await waitFor(() => {
      expect(screen.getByText(/Bookmark Rename Preview/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Skip, keep original names/i));

    await waitFor(() => {
      expect(setFolderStructure).toHaveBeenCalled();
    });
  });
});
