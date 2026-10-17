"use client";

import { useRef, useState } from "react";

type Phase = "idle" | "uploading" | "generating" | "done" | "error";

const MAX_BYTES = 20 * 1024 * 1024;

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is too large. Maximum PDF size is 20 MB.");
      return;
    }
    setError("");
    setFile(f);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a PDF first.");
      return;
    }
    setError("");
    setCopied(false);
    setResultUrl("");
    setPhase("uploading");

    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("language", language);

    // Generation takes a while; show the generating state after a beat.
    const generatingTimer = setTimeout(() => setPhase("generating"), 1200);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; slug?: string; error?: string };
      clearTimeout(generatingTimer);
      if (!res.ok) {
        setPhase("error");
        setError(data.error || "Upload failed. Please try again.");
        return;
      }
      setResultUrl(window.location.origin + (data.url || `/s/${data.slug}`));
      setPhase("done");
    } catch {
      clearTimeout(generatingTimer);
      setPhase("error");
      setError("Network error. Please check your connection and try again.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the user can copy from the input.
    }
  }

  return (
    <div className="card" id="upload">
      <form onSubmit={submit}>
        <div
          className={`dropzone${dragging ? " drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          <div className="big">Drop your PDF here, or tap to browse</div>
          <div className="small">PDF only · max 20 MB · max 100 pages</div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {file && (
            <div className="file-row">
              📄 <strong>{file.name}</strong> — {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="title">Title (optional)</label>
          <input
            id="title"
            type="text"
            placeholder="e.g. Biology Chapter 4"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="field">
          <label htmlFor="language">Language of the study kit</label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="auto">Auto — follow the document&apos;s language</option>
            <option value="english">English</option>
            <option value="amharic">Amharic</option>
          </select>
        </div>

        <div className="field">
          <button
            className="btn"
            type="submit"
            disabled={phase === "uploading" || phase === "generating" || !file}
          >
            {phase === "uploading" || phase === "generating"
              ? "Building your study kit…"
              : "Generate study kit"}
          </button>
        </div>
      </form>

      {(phase === "uploading" || phase === "generating") && (
        <div className="progress-steps">
          <div className="done">✓ PDF uploaded</div>
          <div className="done">✓ Text extracted</div>
          <div>
            {phase === "generating"
              ? "⏳ AI is building your notes, flashcards, quiz and exam questions… this can take up to a minute."
              : "⏳ Reading your PDF…"}
          </div>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      {phase === "done" && resultUrl && (
        <div className="result-box">
          <div className="alert ok">Your study kit is ready! Share this link with anyone:</div>
          <div className="link-row">
            <input readOnly value={resultUrl} onFocus={(e) => e.target.select()} />
            <button className="btn small" type="button" onClick={copyLink}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <p style={{ marginTop: 12 }}>
            <a className="btn" href={new URL(resultUrl).pathname}>
              Open my study kit →
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
