import type { FolderNode } from "@/shared/types";

export interface FlatBookmark {
  id: string;
  title: string;
  url: string;
  parentId: string;
}

export async function getFullTree(): Promise<FolderNode[]> {
  const tree = await chrome.bookmarks.getTree();
  return normalizeTree(tree);
}

function normalizeTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): FolderNode[] {
  return nodes
    .filter((n) => !n.url)
    .map((n) => ({
      id: n.id,
      title: n.title,
      children: n.children ? normalizeTree(n.children) : undefined,
    }));
}

export function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): FlatBookmark[] {
  const result: FlatBookmark[] = [];

  function walk(list: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const node of list) {
      if (node.url) {
        result.push({
          id: node.id,
          title: node.title,
          url: node.url,
          parentId: node.parentId ?? "0",
        });
      }
      if (node.children) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return result;
}

export async function findFolderByPath(
  path: string,
): Promise<string | null> {
  const parts = path.split("/");
  const tree = await chrome.bookmarks.getTree();
  const allRootChildren = (tree[0]?.children ?? []).flatMap(
    (root) => root.children ?? [],
  );

  let currentChildren = allRootChildren;

  for (const part of parts) {
    const match = currentChildren.find(
      (n) => !n.url && n.title === part,
    );
    if (!match) return null;
    if (part === parts[parts.length - 1]) return match.id;
    currentChildren = match.children ?? [];
  }

  return null;
}

export async function ensureFolderExists(
  path: string,
  parentId?: string,
): Promise<string> {
  const parts = path.split("/");
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0]?.children?.[0];
  let currentParentId = parentId ?? bookmarksBar?.id ?? "1";
  let currentChildren: chrome.bookmarks.BookmarkTreeNode[] =
    parentId
      ? (await chrome.bookmarks.getTree())[0]?.children ?? []
      : bookmarksBar?.children ?? [];

  for (const part of parts) {
    const existing = currentChildren.find(
      (n) => !n.url && n.title === part,
    );
    if (existing) {
      currentParentId = existing.id;
      currentChildren = existing.children ?? [];
    } else {
      const created = await chrome.bookmarks.create({
        parentId: currentParentId,
        title: part,
      });
      currentParentId = created.id;
      currentChildren = [];
    }
  }

  return currentParentId;
}

export function buildTreeForPrompt(
  nodes: FolderNode[],
  indent = 0,
): string {
  const lines: string[] = [];
  for (const node of nodes) {
    if (!node.title) continue;
    lines.push(`${"  ".repeat(indent)}${node.title}`);
    if (node.children) {
      lines.push(buildTreeForPrompt(node.children, indent + 1));
    }
  }
  return lines.filter(Boolean).join("\n");
}
