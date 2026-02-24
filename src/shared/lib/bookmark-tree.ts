import type { EmptyFolder, FolderNode } from "@/shared/types";

export interface FlatBookmark {
  id: string;
  title: string;
  url: string;
  parentId: string;
}

function stripNumericPrefix(name: string): string {
  return name.replace(/^\d+([._]\d+)*_/, "");
}

function matchFolderTitle(
  folderTitle: string,
  searchName: string,
): boolean {
  if (folderTitle === searchName) return true;
  return stripNumericPrefix(folderTitle) === searchName ||
    stripNumericPrefix(folderTitle) === stripNumericPrefix(searchName);
}

function findMatchingFolder(
  children: chrome.bookmarks.BookmarkTreeNode[],
  name: string,
): chrome.bookmarks.BookmarkTreeNode | undefined {
  return (
    children.find((n) => !n.url && n.title === name) ??
    children.find((n) => !n.url && matchFolderTitle(n.title, name))
  );
}

export async function getFullTree(): Promise<FolderNode[]> {
  const tree = await chrome.bookmarks.getTree();
  const userFolders = (tree[0]?.children ?? []).flatMap(
    (root) => root.children ?? [],
  );
  return normalizeTree(userFolders);
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
    const match = findMatchingFolder(currentChildren, part);
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
    const existing = findMatchingFolder(currentChildren, part);
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

export async function findEmptyFolders(
  excludeNames: string[],
): Promise<EmptyFolder[]> {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0]?.children?.[0];
  if (!bookmarksBar?.children) return [];

  const empties: EmptyFolder[] = [];
  const excludeSet = new Set(excludeNames);

  function isExcluded(title: string): boolean {
    return excludeSet.has(title);
  }

  function walk(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    pathPrefix: string,
  ) {
    for (const node of nodes) {
      if (node.url) continue;
      const path = pathPrefix ? `${pathPrefix}/${node.title}` : node.title;
      if (isExcluded(node.title)) continue;

      const children = node.children ?? [];
      const hasBookmarks = children.some((c) => !!c.url);
      const childFolders = children.filter((c) => !c.url);

      if (!hasBookmarks && childFolders.length === 0) {
        empties.push({ id: node.id, title: node.title, path });
      } else {
        walk(childFolders, path);
      }
    }
  }

  walk(bookmarksBar.children, "");
  return empties;
}

export async function removeFolders(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await chrome.bookmarks.removeTree(id);
    } catch {
      // folder may already be gone
    }
  }
}

export async function reorderChildrenByName(
  parentId: string,
): Promise<void> {
  const children = await chrome.bookmarks.getChildren(parentId);
  const folders = children.filter((c) => !c.url);

  const sorted = [...folders].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true }),
  );

  for (let i = 0; i < sorted.length; i++) {
    await chrome.bookmarks.move(sorted[i]!.id, { parentId, index: i });
  }
}

export async function reorderAllFolders(): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0]?.children?.[0];
  if (!bookmarksBar) return;

  await reorderChildrenByName(bookmarksBar.id);

  const refreshed = await chrome.bookmarks.getChildren(bookmarksBar.id);
  for (const child of refreshed) {
    if (!child.url) {
      await reorderChildrenByName(child.id);
    }
  }
}

export function sortFoldersByPrefix<
  T extends { name: string; children?: { name: string }[] },
>(folders: T[]): T[] {
  const sorted = [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  for (const folder of sorted) {
    if (folder.children && folder.children.length > 1) {
      folder.children = [...folder.children].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
    }
  }
  return sorted;
}

export interface DuplicatePrefixGroup {
  prefix: string;
  folders: { id: string; title: string; bookmarkCount: number }[];
}

export async function findDuplicatePrefixFolders(): Promise<DuplicatePrefixGroup[]> {
  const tree = await chrome.bookmarks.getTree();
  const bookmarksBar = tree[0]?.children?.[0];
  if (!bookmarksBar?.children) return [];

  const byPrefix = new Map<string, { id: string; title: string; bookmarkCount: number }[]>();

  for (const node of bookmarksBar.children) {
    if (node.url) continue;
    const match = node.title.match(/^(\d+)/);
    if (!match?.[1]) continue;
    const prefix = match[1];
    const list = byPrefix.get(prefix) ?? [];
    const bookmarkCount = countBookmarksRecursive(node);
    list.push({ id: node.id, title: node.title, bookmarkCount });
    byPrefix.set(prefix, list);
  }

  const duplicates: DuplicatePrefixGroup[] = [];
  for (const [prefix, folders] of byPrefix) {
    if (folders.length > 1) {
      duplicates.push({ prefix, folders });
    }
  }
  return duplicates;
}

function countBookmarksRecursive(node: chrome.bookmarks.BookmarkTreeNode): number {
  let count = 0;
  for (const child of node.children ?? []) {
    if (child.url) count++;
    else count += countBookmarksRecursive(child);
  }
  return count;
}

export async function mergeFoldersInto(
  keepFolderId: string,
  removeFolderIds: string[],
): Promise<void> {
  for (const folderId of removeFolderIds) {
    const children = await chrome.bookmarks.getChildren(folderId);
    for (const child of children) {
      await chrome.bookmarks.move(child.id, { parentId: keepFolderId });
    }
    try {
      await chrome.bookmarks.removeTree(folderId);
    } catch {
      // already removed
    }
  }
}

export function buildTreeForPrompt(
  nodes: FolderNode[],
  indent = 0,
): string {
  const lines: string[] = [];
  for (const node of nodes) {
    if (!node.title) {
      if (node.children) {
        lines.push(buildTreeForPrompt(node.children, indent));
      }
      continue;
    }
    lines.push(`${"  ".repeat(indent)}${node.title}`);
    if (node.children) {
      lines.push(buildTreeForPrompt(node.children, indent + 1));
    }
  }
  return lines.filter(Boolean).join("\n");
}
