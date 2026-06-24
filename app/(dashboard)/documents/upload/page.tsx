"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

type State = "idle" | "uploading" | "success" | "error";

export default function UploadPage() {
  const [state, setState] = useState<State>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleFile(f: File) {
    if (!["application/pdf", "image/png", "image/jpeg"].includes(f.type)) {
      setError("Only PDF, PNG, and JPG files are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File size must be under 10 MB.");
      return;
    }
    setFile(f);
    setError("");
  }

  async function handleUpload() {
    if (!file) return;
    setState("uploading");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      setState("success");
      setTimeout(() => router.push("/documents"), 1500);
    } catch {
      setState("error");
      setError("Upload failed. Please try again.");
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Upload Payslip</h1>
        <p className="text-sm text-gray-500 mt-0.5">PDF, PNG, or JPG · Max 10 MB</p>
      </div>

      <Card>
        <CardBody>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={clsx(
              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 cursor-pointer transition-colors",
              dragging ? "border-brand-400 bg-brand-50" : "border-gray-200 hover:border-gray-300",
            )}
          >
            <input ref={inputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

            {state === "success" ? (
              <CheckCircle className="h-12 w-12 text-green-500" />
            ) : file ? (
              <FileText className="h-12 w-12 text-brand-500" />
            ) : (
              <Upload className="h-12 w-12 text-gray-300" />
            )}

            <p className="mt-3 text-sm font-medium text-gray-700">
              {state === "success" ? "Uploaded! Redirecting…" : file ? file.name : "Drop your payslip here or click to browse"}
            </p>
            {file && state !== "success" && (
              <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {file && state !== "success" && (
            <Button
              onClick={handleUpload}
              loading={state === "uploading"}
              className="w-full mt-4"
            >
              {state === "uploading" ? "Uploading…" : "Upload & Process"}
            </Button>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-gray-400 text-center">
        Your documents are encrypted at rest. OCR extraction runs server-side — nothing is shared with third parties.
      </p>
    </div>
  );
}
