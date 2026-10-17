import { NextResponse } from "next/server";
import { generateStudyKit, geminiConfigured } from "@/lib/gemini";
import { insertDocument } from "@/lib/db";
import { getClientIp, uploadAllowed } from "@/lib/rate-limit";
import { makeSlug } from "@/lib/slug";
import type { StudyLanguage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Generation can take a while (large PDFs). Vercel Hobby clamps this;
// see README for the timeout note.
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_PAGES = 100;
const MAX_CHARS = 150_000;

const LANGUAGES: StudyLanguage[] = ["english", "amharic", "auto"];

export async function POST(req: Request) {
  try {
    // Abuse guard (no login by design): 5 uploads / hour / IP.
    const ip = getClientIp(req);
    if (!uploadAllowed(ip)) {
      return NextResponse.json(
        { error: "Rate limit: too many uploads from this address. Try again later." },
        { status: 429 },
      );
    }

    if (!geminiConfigured()) {
      return NextResponse.json(
        {
          error:
            "AI is not configured on this site (GEMINI_API_KEY is missing). The site owner needs to add a Gemini API key — see README. Uploads are disabled until then.",
        },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const rawTitle = form.get("title");
    const rawLanguage = form.get("language");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No PDF file was uploaded." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Maximum PDF size is 20 MB." },
        { status: 400 },
      );
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const language: StudyLanguage = LANGUAGES.includes(rawLanguage as StudyLanguage)
      ? (rawLanguage as StudyLanguage)
      : "auto";

    // Server-side PDF parsing. Only the extracted TEXT is stored — the
    // binary is never written to the database or disk.
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);

    if (parsed.numpages > MAX_PAGES) {
      return NextResponse.json(
        { error: `PDF has ${parsed.numpages} pages. Maximum is ${MAX_PAGES} pages.` },
        { status: 400 },
      );
    }
    const rawText = (parsed.text || "").trim();
    if (rawText.length < 50) {
      return NextResponse.json(
        {
          error:
            "Could not extract readable text from this PDF. It may be scanned images — try a PDF with selectable text.",
        },
        { status: 400 },
      );
    }
    const text = rawText.slice(0, MAX_CHARS);

    const title =
      typeof rawTitle === "string" && rawTitle.trim()
        ? rawTitle.trim().slice(0, 200)
        : file.name.replace(/\.pdf$/i, "").slice(0, 200) || "Untitled document";

    const kit = await generateStudyKit(text, language);

    // Short random slug; retry on the (very unlikely) collision.
    let slug = "";
    let saved = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      slug = makeSlug();
      try {
        await insertDocument(slug, title, language, text, kit);
        saved = true;
        break;
      } catch (e) {
        // A unique-violation means a slug collision — retry with a fresh slug.
        // Any other DB failure (e.g. Postgres not linked) is reported plainly.
        const msg = e instanceof Error ? e.message : "";
        if (!/duplicate key|unique/i.test(msg)) {
          throw new Error(
            "Database error: could not save the study kit. The site owner should check the Postgres connection.",
          );
        }
        if (attempt === 4) throw e;
      }
    }
    if (!saved) {
      throw new Error("Could not save the study kit. Please try again.");
    }

    const url = `/s/${slug}`;
    return NextResponse.json({ slug, url });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong while building the study kit.",
      },
      { status: 500 },
    );
  }
}
