import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  ChevronDown,
  GripVertical,
  Trash2,
  Plus,
  FolderOpen,
  FolderClosed,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import type { ProposedFolder } from "@/shared/types";

interface Props {
  folders: ProposedFolder[];
  onChange: (folders: ProposedFolder[]) => void;
  isProtected: (name: string) => boolean;
}

export default function FolderTreeEditor({
  folders,
  onChange,
  isProtected,
}: Props) {
  const { t } = useTranslation();
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const prevFoldersLenRef = useRef(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (folders.length !== prevFoldersLenRef.current) {
      const set = new Set<number>();
      folders.forEach((f, i) => {
        if (f.children.length > 0) set.add(i);
      });
      setExpandedSet(set);
      prevFoldersLenRef.current = folders.length;
    }
  }, [folders]);

  function toggleExpanded(index: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleFolderRename(index: number, newName: string) {
    const updated = [...folders];
    updated[index] = { ...updated[index]!, name: newName };
    onChange(updated);
  }

  function handleFolderDelete(index: number) {
    const folder = folders[index];
    if (!folder || isProtected(folder.name)) return;
    onChange(folders.filter((_, i) => i !== index));
  }

  function handleChildRename(
    folderIndex: number,
    childIndex: number,
    newName: string,
  ) {
    const updated = [...folders];
    const folder = { ...updated[folderIndex]! };
    const children = [...folder.children];
    children[childIndex] = { ...children[childIndex]!, name: newName };
    folder.children = children;
    updated[folderIndex] = folder;
    onChange(updated);
  }

  function handleChildDelete(folderIndex: number, childIndex: number) {
    const updated = [...folders];
    const folder = { ...updated[folderIndex]! };
    folder.children = folder.children.filter((_, i) => i !== childIndex);
    updated[folderIndex] = folder;
    onChange(updated);
  }

  function handleAddChild(folderIndex: number) {
    const updated = [...folders];
    const folder = { ...updated[folderIndex]! };
    folder.children = [
      ...folder.children,
      { name: t("onboarding.step4.newSubcategory"), description: "" },
    ];
    updated[folderIndex] = folder;
    onChange(updated);
    setExpandedSet((prev) => new Set(prev).add(folderIndex));
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const folder = folders[index];
    if (folder && isProtected(folder.name)) return;
    setDragOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...folders];
    const [dragged] = updated.splice(dragIndex, 1);
    if (dragged) {
      updated.splice(index, 0, dragged);
      onChange(updated);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <ul className="space-y-1.5">
      {folders.map((folder, i) => {
        const locked = isProtected(folder.name);
        const isExpanded = expandedSet.has(i);
        const hasChildren = folder.children.length > 0;

        return (
          <li
            key={`folder-${i}`}
            draggable={!locked}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={`rounded-md border transition-colors ${
              dragOverIndex === i
                ? "border-primary bg-primary/5"
                : "border-border"
            } ${dragIndex === i ? "opacity-40" : ""}`}
          >
            <Collapsible
              open={isExpanded}
              onOpenChange={() => toggleExpanded(i)}
            >
              {/* Parent folder row */}
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                {!locked ? (
                  <span
                    className="cursor-grab text-muted-foreground select-none shrink-0"
                    title={t("onboarding.step4.dragHint")}
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="w-4 shrink-0" />
                )}

                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>

                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                ) : (
                  <FolderClosed className="h-4 w-4 text-amber-500 shrink-0" />
                )}

                <input
                  type="text"
                  value={folder.name}
                  onChange={(e) => handleFolderRename(i, e.target.value)}
                  className="flex-1 px-2 py-0.5 text-sm border border-transparent rounded bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors outline-none min-w-0"
                  data-testid={`folder-name-${i}`}
                />

                {hasChildren && !isExpanded && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                    {folder.children.length}
                  </span>
                )}

                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  ~{folder.estimated_count}
                </span>

                {!locked && (
                  <button
                    type="button"
                    onClick={() => handleAddChild(i)}
                    className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                    title={t("onboarding.step4.addSubcategory")}
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleFolderDelete(i)}
                  disabled={locked}
                  className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  data-testid={`folder-delete-${i}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>

              {/* Children */}
              <CollapsibleContent>
                {(hasChildren || !locked) && (
                  <div className="ml-[52px] mr-2 mb-2 space-y-1 border-l-2 border-muted pl-3">
                    {folder.children.map((child, ci) => (
                      <div
                        key={`child-${i}-${ci}`}
                        className="flex items-center gap-1.5 group"
                      >
                        <FolderClosed className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <input
                          type="text"
                          value={child.name}
                          onChange={(e) =>
                            handleChildRename(i, ci, e.target.value)
                          }
                          className="flex-1 px-2 py-0.5 text-xs border border-transparent rounded bg-transparent hover:border-input focus:border-input focus:bg-background transition-colors outline-none min-w-0"
                          data-testid={`child-name-${i}-${ci}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleChildDelete(i, ci)}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all shrink-0"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </li>
        );
      })}
    </ul>
  );
}
