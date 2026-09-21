import { ChevronRight, File as FileIcon, Folder } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FileCoverage } from "../types";

interface FileCoverageTreeProps {
  files: FileCoverage[];
  onFileSelect: (file: FileCoverage) => void;
}

interface TreeNode {
  kind: "directory" | "file";
  /** Full path from the repository root, used for sorting and filtering. */
  path: string;
  /** Last path segment, shown in the table. */
  name: string;
  children: TreeNode[];
  statements: number;
  coveredStatements: number;
  lineRate: number;
  file?: FileCoverage;
}

type SortKey = "path" | "lineRate";

function rateVariant(lineRate: number) {
  if (lineRate >= 80) return "default";
  return lineRate >= 50 ? "secondary" : "destructive";
}

function normalizePath(file: FileCoverage): string {
  return (file.path || file.name).replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Coverage reports list a file more than once when several reports are merged
 * into one artifact. Keep the first occurrence so the tree shows one row per
 * file. Matching stays case-sensitive, so files that differ only by case are
 * never merged.
 */
export function dedupeFiles(files: FileCoverage[]): FileCoverage[] {
  const seen = new Set<string>();
  const unique: FileCoverage[] = [];
  for (const file of files) {
    const key = normalizePath(file);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }
  return unique;
}

/** Aggregate each directory from its children, weighted by statement counts. */
function aggregate(node: TreeNode): void {
  if (node.kind === "file") return;
  let statements = 0;
  let coveredStatements = 0;
  for (const child of node.children) {
    aggregate(child);
    statements += child.statements;
    coveredStatements += child.coveredStatements;
  }
  node.statements = statements;
  node.coveredStatements = coveredStatements;
  node.lineRate = statements === 0 ? 0 : (coveredStatements / statements) * 100;
}

function buildTree(files: FileCoverage[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const directories = new Map<string, TreeNode>();

  for (const file of files) {
    const segments = normalizePath(file).split("/").filter(Boolean);
    const fileName = segments.pop() ?? file.path;
    let siblings = roots;
    let directoryPath = "";

    for (const segment of segments) {
      directoryPath = directoryPath ? `${directoryPath}/${segment}` : segment;
      let directory = directories.get(directoryPath);
      if (!directory) {
        directory = {
          kind: "directory",
          path: directoryPath,
          name: segment,
          children: [],
          statements: 0,
          coveredStatements: 0,
          lineRate: 0,
        };
        directories.set(directoryPath, directory);
        siblings.push(directory);
      }
      siblings = directory.children;
    }

    siblings.push({
      kind: "file",
      path: directoryPath ? `${directoryPath}/${fileName}` : fileName,
      name: fileName,
      children: [],
      statements: file.statements,
      coveredStatements: file.coveredStatements,
      lineRate: file.lineRate,
      file,
    });
  }

  for (const root of roots) aggregate(root);
  return roots;
}

/** A matching directory keeps every descendant; a matching file keeps its ancestors. */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.path.toLowerCase().includes(query)) {
      result.push(node);
      continue;
    }
    if (node.kind === "file") continue;
    const children = filterTree(node.children, query);
    if (children.length > 0) result.push({ ...node, children });
  }

  return result;
}

function sortTree(
  nodes: TreeNode[],
  key: SortKey,
  descending: boolean,
): TreeNode[] {
  const direction = descending ? -1 : 1;
  const sorted = [...nodes].sort((a, b) => {
    // Directories always lead their level so the hierarchy stays readable.
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    const compare =
      key === "path" ? a.path.localeCompare(b.path) : a.lineRate - b.lineRate;
    return compare * direction || a.path.localeCompare(b.path);
  });
  return sorted.map((node) =>
    node.kind === "directory"
      ? { ...node, children: sortTree(node.children, key, descending) }
      : node,
  );
}

interface VisibleRow {
  node: TreeNode;
  depth: number;
}

function flatten(
  nodes: TreeNode[],
  collapsed: Set<string>,
  depth = 0,
): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.kind === "directory" && !collapsed.has(node.path)) {
      rows.push(...flatten(node.children, collapsed, depth + 1));
    }
  }
  return rows;
}

interface SortableHeadProps {
  label: string;
  column: SortKey;
  sort: { key: SortKey; descending: boolean };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}

function SortableHead({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: SortableHeadProps) {
  const active = sort.key === column;
  return (
    <TableHead
      aria-sort={
        active ? (sort.descending ? "descending" : "ascending") : "none"
      }
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        <span aria-hidden="true" className="text-muted-foreground">
          {active ? (sort.descending ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </TableHead>
  );
}

export function FileCoverageTree({
  files,
  onFileSelect,
}: FileCoverageTreeProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "path",
    descending: false,
  });

  const tree = useMemo(() => buildTree(dedupeFiles(files)), [files]);

  const rows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed ? filterTree(tree, trimmed) : tree;
    return flatten(sortTree(filtered, sort.key, sort.descending), collapsed);
  }, [tree, query, sort, collapsed]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : { key, descending: key === "lineRate" },
    );
  };

  const toggleDirectory = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div>
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter files..."
        aria-label="Filter files"
        className="mb-4 max-w-sm"
      />

      {rows.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-muted-foreground">
          {files.length === 0
            ? "No per-file coverage available"
            : `No files match "${query}"`}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table aria-label="File coverage tree">
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="File"
                  column="path"
                  sort={sort}
                  onSort={toggleSort}
                />
                <TableHead className="text-right">Lines</TableHead>
                <SortableHead
                  label="Coverage"
                  column="lineRate"
                  sort={sort}
                  onSort={toggleSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ node, depth }) => {
                const expanded =
                  node.kind === "directory" && !collapsed.has(node.path);
                const activate = () => {
                  if (node.kind === "directory") toggleDirectory(node.path);
                  else if (node.file) onFileSelect(node.file);
                };

                return (
                  <TableRow
                    key={node.path}
                    tabIndex={0}
                    aria-expanded={
                      node.kind === "directory" ? expanded : undefined
                    }
                    className="cursor-pointer"
                    onClick={activate}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      activate();
                    }}
                  >
                    <TableCell>
                      <span
                        className="flex items-center gap-2"
                        style={{ paddingLeft: `${depth * 16}px` }}
                      >
                        {node.kind === "directory" ? (
                          <>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                expanded && "rotate-90",
                              )}
                            />
                            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </>
                        ) : (
                          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="font-mono text-xs" title={node.path}>
                          {node.name}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {node.statements}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <Badge variant={rateVariant(node.lineRate)}>
                          {node.lineRate.toFixed(1)}%
                        </Badge>
                        <span className="h-1.5 w-full max-w-40 min-w-16 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              node.lineRate >= 80
                                ? "bg-emerald-500"
                                : node.lineRate >= 50
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                            )}
                            style={{ width: `${node.lineRate}%` }}
                          />
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
