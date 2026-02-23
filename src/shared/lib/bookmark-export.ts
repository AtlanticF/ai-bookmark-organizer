function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeToHtml(
  node: chrome.bookmarks.BookmarkTreeNode,
  indent: number,
): string {
  const pad = "    ".repeat(indent);

  if (node.url) {
    const addDate = node.dateAdded
      ? Math.floor(node.dateAdded / 1000)
      : "";
    return `${pad}<DT><A HREF="${escapeHtml(node.url)}"${addDate ? ` ADD_DATE="${addDate}"` : ""}>${escapeHtml(node.title)}</A>\n`;
  }

  const children = node.children ?? [];
  let html = `${pad}<DT><H3>${escapeHtml(node.title)}</H3>\n`;
  html += `${pad}<DL><p>\n`;
  for (const child of children) {
    html += nodeToHtml(child, indent + 1);
  }
  html += `${pad}</DL><p>\n`;
  return html;
}

export async function exportBookmarksAsHtml(): Promise<string> {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  if (!root) return "";

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
  html += `<!-- This is an automatically generated file.\n`;
  html += `     It will be read and overwritten.\n`;
  html += `     DO NOT EDIT! -->\n`;
  html += `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
  html += `<TITLE>Bookmarks</TITLE>\n`;
  html += `<H1>Bookmarks</H1>\n`;
  html += `<DL><p>\n`;

  for (const child of root.children ?? []) {
    html += nodeToHtml(child, 1);
  }

  html += `</DL><p>\n`;
  return html;
}

export function downloadHtmlFile(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
