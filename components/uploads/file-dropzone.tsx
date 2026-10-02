"use client";

import { useId, useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type DropzonePhase = "idle" | "uploading" | "processing" | "done" | "error";

export interface DropzoneFile {
  name: string;
  detail?: string;
  /** Overrides the dropzone phase for this row, so files already imported stay done. */
  status?: DropzonePhase;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

export function FileDropzone({
  accept,
  maxBytes,
  maxBytesByExtension,
  filterPicker = true,
  multiple = false,
  phase = "idle",
  progress = 0,
  error: externalError = null,
  files = [],
  onFiles,
  onAddFiles,
  onRemove,
  disabled = false,
  idleTitle,
  idleHint,
  processingLabel = "Working…",
  doneAnnouncement,
  replaceLabel = "Replace",
  addLabel = "Add files",
}: {
  accept: string[];
  maxBytes: number;
  maxBytesByExtension?: Record<string, number>;
  /** When false, the native dialog is unfiltered. macOS treats accept=".zip" as a package and then disables the CSV files inside it. */
  filterPicker?: boolean;
  multiple?: boolean;
  phase?: DropzonePhase;
  progress?: number;
  error?: string | null;
  files?: DropzoneFile[];
  onFiles: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
  onRemove?: () => void;
  disabled?: boolean;
  idleTitle: string;
  idleHint?: string;
  processingLabel?: string;
  doneAnnouncement?: string;
  replaceLabel?: string;
  addLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickMode = useRef<"replace" | "add">("replace");
  const errorId = useId();
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const error = localError ?? externalError;
  const busy = phase === "uploading" || phase === "processing";
  const showFiles = files.length > 0 && phase !== "idle";
  const acceptList = accept.map((item) => item.toLowerCase());

  function openPicker(mode: "replace" | "add") {
    pickMode.current = mode;
    inputRef.current?.click();
  }

  function validate(list: File[]): string | null {
    if (list.length === 0) return "Choose a file to upload.";
    if (!multiple && list.length > 1) return "Choose a single file.";
    for (const file of list) {
      const ext = extensionOf(file.name);
      if (!acceptList.includes(ext)) {
        return `${file.name} isn’t supported. Use ${accept.join(", ")}.`;
      }
      const limit = maxBytesByExtension?.[ext] ?? maxBytes;
      if (file.size > limit) {
        return `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(limit)}.`;
      }
    }
    return null;
  }

  function take(list: FileList | File[], mode: "replace" | "add") {
    const next = Array.from(list);
    const problem = validate(next);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    if (mode === "add" && onAddFiles) onAddFiles(next);
    else onFiles(next);
  }

  const announcement =
    phase === "uploading"
      ? `Uploading ${progress}%`
      : phase === "processing"
        ? processingLabel
        : phase === "done"
          ? doneAnnouncement || "Upload complete"
          : "";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={filterPicker ? accept.join(",") : undefined}
        multiple={multiple}
        onChange={(event) => {
          const mode = pickMode.current;
          pickMode.current = "replace";
          if (event.target.files) take(event.target.files, mode);
          event.target.value = "";
        }}
      />

      {!showFiles && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (!disabled && !busy) take(event.dataTransfer.files, "replace");
          }}
          className={cn(
            "rounded-xl border-2 border-dashed bg-muted/50 p-6 text-center transition-colors",
            dragOver ? "border-primary bg-muted" : "border-border",
          )}
        >
          <button
            type="button"
            disabled={disabled || busy}
            aria-describedby={error ? errorId : undefined}
            onClick={() => openPicker("replace")}
            className="flex w-full flex-col items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="mb-2.5 flex size-10 items-center justify-center rounded-full border bg-card shadow-1">
              <Upload className="size-5 text-copy" aria-hidden />
            </span>
            <span className="text-body font-medium text-foreground">{idleTitle}</span>
            {idleHint && <span className="mt-1 text-small text-muted-foreground">{idleHint}</span>}
          </button>
        </div>
      )}

      {showFiles && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (!disabled && !busy) take(event.dataTransfer.files, onAddFiles ? "add" : "replace");
          }}
          className={cn("space-y-2 rounded-xl", dragOver && "ring-2 ring-ring/40")}
        >
          <ul className="space-y-2">
            {files.map((file) => {
              const rowPhase = file.status ?? phase;
              const rowBusy = rowPhase === "uploading" || rowPhase === "processing";
              return (
              <li key={file.name} className="flex items-center gap-2.5 rounded-lg border bg-muted/50 px-3 py-2.5">
                {rowPhase === "done" ? (
                  <span className="text-success" aria-hidden>
                    ✓
                  </span>
                ) : rowBusy ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <FileText className="size-4 shrink-0 text-copy" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-mono text-code text-foreground">{file.name}</span>
                  {file.detail && <span className="block text-small text-muted-foreground">{file.detail}</span>}
                </span>
              </li>
              );
            })}
          </ul>
          {phase === "uploading" && (
            <div>
              <Progress value={progress} aria-label={`Uploading ${progress}%`} />
              <p className="mt-1.5 text-small text-copy">Uploading {progress}%</p>
            </div>
          )}
          {phase === "processing" && (
            <div>
              <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuetext={processingLabel}>
                <div className="h-full w-1/3 animate-pulse bg-primary" />
              </div>
              <p className="mt-1.5 text-small text-copy">{processingLabel}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {onAddFiles && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || busy}
                aria-describedby={error ? errorId : undefined}
                onClick={() => openPicker("add")}
              >
                {addLabel}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              aria-describedby={error ? errorId : undefined}
              onClick={() => openPicker("replace")}
            >
              {replaceLabel}
            </Button>
            {onRemove && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={onRemove}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-small text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
