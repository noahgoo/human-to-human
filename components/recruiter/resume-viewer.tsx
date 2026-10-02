"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ResumeViewer({
  available,
  fileName,
  textContent,
}: {
  available: boolean;
  fileName: string | null;
  textContent: string | null;
}) {
  function download() {
    if (!textContent) return;
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const base = (fileName ?? "resume").replace(/\.[^.]+$/, "");
    anchor.download = `${base}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.message("Originals are mocked in this demo. Downloaded the extracted text instead.");
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-1 lg:sticky lg:top-24">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3">Resume</h2>
        {available && (
          <Button type="button" variant="outline" size="sm" onClick={download}>
            <Download />
            Download original
          </Button>
        )}
      </div>
      {available && textContent ? (
        <div className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-body text-copy">
          {textContent}
        </div>
      ) : (
        <p className="text-body text-muted-foreground">Resume removed by applicant</p>
      )}
    </section>
  );
}
