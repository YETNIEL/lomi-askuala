import { NextResponse } from "next/server";
import { getDocumentBySlug } from "@/lib/db";
import { geminiConfigured, tutorReply, type ChatMessage } from "@/lib/gemini";
import { getClientIp, tutorAllowed } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTEXT_CHARS = 120_000;

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!tutorAllowed(ip)) {
      return NextResponse.json(
        { error: "Rate limit: too many tutor messages. Try again later." },
        { status: 429 },
      );
    }

    if (!geminiConfigured()) {
      return NextResponse.json(
        { error: "AI is not configured on this site (GEMINI_API_KEY is missing)." },
        { status: 503 },
      );
    }

    const body = (await req.json()) as {
      slug?: unknown;
      messages?: unknown;
    };
    const slug = typeof body.slug === "string" ? body.slug : "";
    if (!slug) {
      return NextResponse.json({ error: "Missing document slug." }, { status: 400 });
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }
    const messages: ChatMessage[] = body.messages
      .filter(
        (m): m is ChatMessage =>
          !!m &&
          typeof m === "object" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "model") &&
          typeof (m as ChatMessage).text === "string",
      )
      .map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return NextResponse.json(
        { error: "The last message must be from the student." },
        { status: 400 },
      );
    }

    let doc;
    try {
      doc = await getDocumentBySlug(slug);
    } catch {
      return NextResponse.json(
        { error: "Database is not reachable. The site owner should check the Postgres connection." },
        { status: 503 },
      );
    }
    if (!doc) {
      return NextResponse.json({ error: "Study kit not found." }, { status: 404 });
    }

    const reply = await tutorReply(
      doc.text.slice(0, MAX_CONTEXT_CHARS),
      messages,
      doc.language,
    );
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Tutor failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Something went wrong with the tutor.",
      },
      { status: 500 },
    );
  }
}
