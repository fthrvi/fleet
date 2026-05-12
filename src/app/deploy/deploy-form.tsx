"use client";

import { useRef, useState, useTransition, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deployFiles } from "@/actions/deploy";
import type { Machine } from "@prisma/client";

interface Props {
  machines: Machine[];
}

interface QueuedFile {
  file: File;
  relPath: string;
}

export function DeployForm({ machines }: Props) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [destPath, setDestPath] = useState("~/uploads/");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  function addFiles(newFiles: QueuedFile[]) {
    setFiles((prev) => [...prev, ...newFiles]);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    const collected: QueuedFile[] = [];
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;
      // webkitGetAsEntry is the only way to recurse into dropped folders
      const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.();
      if (entry) tasks.push(walkEntry(entry, "", collected));
      else {
        const file = item.getAsFile();
        if (file) collected.push({ file, relPath: file.name });
      }
    }
    await Promise.all(tasks);
    addFiles(collected);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const arr = Array.from(e.target.files).map((f) => ({
      file: f,
      relPath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    }));
    addFiles(arr);
    e.target.value = "";
  }

  function totalBytes() {
    return files.reduce((s, f) => s + f.file.size, 0);
  }

  function deploy() {
    setError(null);
    if (files.length === 0 || selected.size === 0 || !destPath.trim()) {
      setError("Pick at least one file, one machine, and set a destination.");
      return;
    }
    start(async () => {
      const fd = new FormData();
      for (const qf of files) {
        // Force the webkitRelativePath into the File object so the server
        // action can use it to preserve directory structure
        Object.defineProperty(qf.file, "webkitRelativePath", {
          value: qf.relPath,
          configurable: true,
        });
        fd.append("files", qf.file);
      }
      fd.set("machineIds", JSON.stringify(Array.from(selected)));
      fd.set("destPath", destPath.trim());
      const r = await deployFiles(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/jobs/${r.jobId}`);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-12 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <div className="text-base font-medium">Drag files or folders here</div>
          <div className="text-xs text-muted-foreground">or click to choose:</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              Pick files
            </Button>
            <Button size="sm" variant="outline" onClick={() => dirInputRef.current?.click()}>
              Pick folder
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <input
            ref={dirInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            // @ts-expect-error - webkitdirectory is non-standard but supported in Chromium / Safari
            webkitdirectory=""
          />
        </div>

        {files.length > 0 && (
          <div className="rounded-md border border-border bg-card p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">
                {files.length} file{files.length === 1 ? "" : "s"}, {(totalBytes() / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                onClick={() => setFiles([])}
                className="text-muted-foreground hover:underline"
              >
                Clear
              </button>
            </div>
            <ul className="mono max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
              {files.slice(0, 30).map((f, i) => (
                <li key={i} className="truncate">
                  {f.relPath} ({(f.file.size / 1024).toFixed(1)} KB)
                </li>
              ))}
              {files.length > 30 && <li>… and {files.length - 30} more</li>}
            </ul>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Destination on each machine</label>
          <input
            type="text"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            placeholder="~/uploads/"
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Trailing slash matters. rsync copies the batch directory&apos;s contents into this path.
          </p>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium">
              Machines ({selected.size}/{machines.length})
            </label>
            <div className="space-x-2 text-xs">
              <button
                type="button"
                onClick={() => setSelected(new Set(machines.map((m) => m.id)))}
                className="text-primary hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-muted-foreground hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  selected.has(m.id) ? "border-primary bg-primary/5" : "border-input"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                      return next;
                    })
                  }
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.sshUser}@{m.tailscaleHost}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            disabled={pending || files.length === 0 || selected.size === 0 || !destPath.trim()}
            onClick={deploy}
          >
            {pending
              ? "Deploying…"
              : `Deploy ${files.length} file${files.length === 1 ? "" : "s"} to ${selected.size} machine${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: QueuedFile[]): Promise<void> {
  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ file, relPath: prefix + entry.name });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const all: FileSystemEntry[] = [];
    // readEntries returns in batches; loop until empty
    while (true) {
      const batch: FileSystemEntry[] = await new Promise((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      all.push(...batch);
    }
    for (const child of all) {
      await walkEntry(child, prefix + entry.name + "/", out);
    }
  }
}
