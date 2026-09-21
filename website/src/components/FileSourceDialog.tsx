import { Activity, AlertCircle, Pencil, RefreshCw } from "lucide-react";
import Prism from "prismjs";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-java";
import "prismjs/components/prism-markdown";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { githubService } from "../services/githubAPI";
import type { FileCoverage } from "../types";

// Highlighting is driven from React state, not from a DOMContentLoaded sweep.
Prism.manual = true;

interface FileSourceDialogProps {
  file: FileCoverage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  ref: string;
}

type LineState = "covered" | "partial" | "missed" | "neutral";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  md: "markdown",
  markdown: "markdown",
};

const LINE_TINTS: Record<LineState, string> = {
  covered: "bg-emerald-500/15",
  partial: "bg-amber-500/15",
  missed: "bg-red-500/15",
  neutral: "",
};

const GUTTER_TINTS: Record<LineState, string> = {
  covered: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  missed: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
};

const LEGEND: Array<{ state: Exclude<LineState, "neutral">; label: string }> = [
  { state: "covered", label: "Covered" },
  { state: "partial", label: "Partial" },
  { state: "missed", label: "Missed" },
];

function languageFor(path: string): string | null {
  const name = path.split("/").pop() ?? "";
  if (!name.includes(".")) return null;
  const extension = name.split(".").pop() ?? "";
  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Prism tokenizes per line so each rendered line keeps its own coverage tint. */
function highlightLine(line: string, language: string | null): string {
  const grammar = language ? Prism.languages[language] : undefined;
  if (!language || !grammar) return escapeHtml(line);
  return Prism.highlight(line, grammar, language);
}

function lineStates(file: FileCoverage, lineCount: number): LineState[] {
  const counts = new Map(
    file.lines.map((line) => [line.lineNumber, line.count]),
  );
  const missing = new Set(file.missingLines);
  const partial = new Set(file.partialLines);

  return Array.from({ length: lineCount }, (_, index) => {
    const lineNumber = index + 1;
    if (missing.has(lineNumber)) return "missed";
    if (partial.has(lineNumber)) return "partial";
    return (counts.get(lineNumber) ?? 0) > 0 ? "covered" : "neutral";
  });
}

export function FileSourceDialog({
  file,
  open,
  onOpenChange,
  owner,
  repo,
  ref,
}: FileSourceDialogProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  // A manually entered path applies only to the file it was entered for.
  const [override, setOverride] = useState<{
    key: string;
    path: string;
  } | null>(null);

  const filePath = file?.path ?? "";
  const fileKey = `${filePath}@${ref}`;
  const overridePath = override?.key === fileKey ? override.path : null;
  const path = overridePath ?? filePath;
  const loadedPath = resolvedPath ?? overridePath ?? filePath;
  // The coverage report and the repository can spell the same file differently.
  const pathMismatch = content !== null && loadedPath !== filePath;
  const showPathEditor = pathMismatch || error !== null;

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setResolvedPath(null);

    githubService
      .getFileContent(owner, repo, path, ref)
      .then((result) => {
        if (cancelled) return;
        setContent(result.content);
        setResolvedPath(result.resolvedPath ?? null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, path, owner, repo, ref, attempt]);

  // A closed dialog starts over, so the next file loads its reported path.
  useEffect(() => {
    if (open) return;
    setOverride(null);
    setDraft(null);
    setEditingPath(false);
  }, [open]);

  const loadEnteredPath = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = (draft ?? loadedPath).trim();
    if (!next) return;
    setOverride({ key: fileKey, path: next });
    setAttempt((current) => current + 1);
  };

  const language = useMemo(() => languageFor(path), [path]);

  const lines = useMemo(() => {
    if (content === null || content === "") return [];
    return (content.endsWith("\n") ? content.slice(0, -1) : content).split(
      "\n",
    );
  }, [content]);

  const states = useMemo(
    () => (file ? lineStates(file, lines.length) : []),
    [file, lines.length],
  );

  const highlighted = useMemo(
    () => lines.map((line) => highlightLine(line, language)),
    [lines, language],
  );

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle className="font-mono text-sm break-all">
              {file.path}
            </DialogTitle>
            <Badge
              variant={
                file.lineRate >= 80
                  ? "default"
                  : file.lineRate >= 50
                    ? "secondary"
                    : "destructive"
              }
            >
              {file.lineRate.toFixed(1)}%
            </Badge>
          </div>
          <DialogDescription>
            {file.coveredStatements}/{file.statements} statements covered at
            commit {ref.substring(0, 7)}.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            {LEGEND.map(({ state, label }) => (
              <Badge
                key={state}
                variant="outline"
                className={cn(LINE_TINTS[state], GUTTER_TINTS[state])}
              >
                {label}
              </Badge>
            ))}
          </div>
        </DialogHeader>



        {showPathEditor && (
          <div className="rounded-md border p-3">
            {pathMismatch && (
              <p className="text-sm text-muted-foreground">
                This file was loaded from a different path than the coverage report:{" "}
                <span className="font-mono break-all text-foreground">
                  {loadedPath}
                </span>
              </p>
            )}
            {editingPath ? (
              <form
                onSubmit={loadEnteredPath}
                className="flex flex-wrap items-end gap-2"
              >
                <div className="min-w-64 flex-1 space-y-1">
                  <Label htmlFor="source-path">File path</Label>
                  <Input
                    id="source-path"
                    value={draft ?? loadedPath}
                    onChange={(event) => setDraft(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </div>
                <Button type="submit" size="sm">
                  Load source
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingPath(false);
                    setDraft(null);
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingPath(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit path
              </Button>
            )}
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not load source</AlertTitle>
            <AlertDescription>
              <span className="block">{error}</span>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setAttempt((current) => current + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : loading || content === null ? (
          <div className="flex h-[200px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 animate-spin" />
            Loading source...
          </div>
        ) : lines.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            This file is empty at this commit
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <pre className="min-w-full font-mono text-xs leading-5">
              {lines.map((_, index) => (
                <div
                  // Line number is the only stable identity for a source line.
                  key={index + 1}
                  data-state={states[index]}
                  className={cn("flex", LINE_TINTS[states[index]])}
                >
                  <span
                    className={cn(
                      "w-12 shrink-0 border-r border-border/60 px-2 text-right select-none",
                      GUTTER_TINTS[states[index]],
                    )}
                  >
                    {index + 1}
                  </span>
                  <code
                    className={cn(
                      "px-3 whitespace-pre",
                      language ? `language-${language}` : undefined,
                    )}
                    dangerouslySetInnerHTML={{ __html: highlighted[index] }}
                  />
                </div>
              ))}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
