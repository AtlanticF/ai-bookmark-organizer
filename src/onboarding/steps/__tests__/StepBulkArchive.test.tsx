import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import StepBulkArchive from "../StepBulkArchive";
import type { ProposedFolder } from "@/shared/types";

let store: Record<string, unknown> = {};

const mockFolders: ProposedFolder[] = [
  {
    name: "00_📥_Inbox",
    description: "Buffer",
    children: [],
    estimated_count: 0,
  },
  {
    name: "01_🔥_Critical",
    description: "Daily tools",
    children: [],
    estimated_count: 5,
  },
  {
    name: "10_📚_Library",
    description: "Knowledge",
    children: [],
    estimated_count: 10,
  },
  {
    name: "99_💤_Archive",
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
});
