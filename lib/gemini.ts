import type { StudyKit, StudyLanguage } from "./types";

// Gemini via plain REST fetch (no SDK needed).
// Key comes ONLY from GEMINI_API_KEY. No key is ever bundled in code.

const DEFAULT_MODEL = "gemini-2.0-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

interface GeminiPart {
  text: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string; status?: string };
}

async function callGemini(
  contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }>,
  jsonMode: boolean,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "AI is not configured: GEMINI_API_KEY is missing. See README for how to get a free key.",
    );
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.2, // low temperature: factual, grounded output
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(
      `Gemini API error (${res.status}): ${data.error?.message || "unknown error"}`,
    );
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .join("");
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

// ---------------------------------------------------------------------------
// Grounding rules, shared by kit generation and the tutor.
// These are the whole point of the product: the model may use ONLY the
// provided document text. Anything not supported by the text is omitted,
// and the tutor must say so plainly instead of inventing an answer.
// ---------------------------------------------------------------------------

const GROUNDING_RULES = `
GROUNDING RULES — FOLLOW THEM STRICTLY:
1. Use ONLY the document text provided below. Do NOT use outside knowledge,
   training data, or assumptions about the topic.
2. Every flashcard, quiz question, and exam question MUST come from a
   specific part of the document, and MUST carry the 1-based page number
   it came from as "sourcePage".
3. If the document does not contain enough material for a requested item,
   OMIT that item rather than inventing one. Never pad with made-up content.
4. Do not copy long passages verbatim; rephrase into short study items.
5. If a fact is ambiguous in the document, say it is ambiguous or omit it.
`;

const KIT_SCHEMA_HINT = `
Return ONLY a JSON object with exactly this shape (no markdown fences, no extra text):
{
  "summaryNotes": "markdown string: organized notes covering the document's key ideas, with section headings",
  "flashcards": [ { "question": "...", "answer": "...", "sourcePage": 1 } ],
  "quiz": [ { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "...", "sourcePage": 1 } ],
  "examQuestions": [ { "question": "...", "modelAnswer": "...", "topic": "...", "sourcePage": 1 } ]
}
Limits: at most 30 flashcards, at most 15 quiz questions, at most 10 exam questions.
Quiz "options" must have exactly 4 entries and "correctIndex" must be 0-3.
`;

function languageInstruction(language: StudyLanguage): string {
  if (language === "amharic") {
    return "Write ALL generated content (notes, flashcards, quiz, exam questions) in Amharic.";
  }
  if (language === "english") {
    return "Write ALL generated content in English.";
  }
  return "Write ALL generated content in the same language as the document (follow the document's language).";
}

export async function generateStudyKit(
  documentText: string,
  language: StudyLanguage,
): Promise<StudyKit> {
  const prompt = `
You are a study assistant. From the document text below, build a study kit.
${GROUNDING_RULES}
${languageInstruction(language)}
${KIT_SCHEMA_HINT}

DOCUMENT TEXT (page numbers are approximate, based on extraction order;
use your best estimate of the page each fact came from):
---
${documentText}
---
`;
  const raw = await callGemini(
    [{ role: "user", parts: [{ text: prompt }] }],
    true,
  );
  // Strip markdown fences if the model adds them despite JSON mode.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI returned invalid JSON for the study kit.");
  }
  const kit = parsed as Partial<StudyKit>;
  // Defensive normalization + caps, so a sloppy response can't break the UI.
  return {
    summaryNotes: typeof kit.summaryNotes === "string" ? kit.summaryNotes : "",
    flashcards: Array.isArray(kit.flashcards)
      ? kit.flashcards
          .filter(
            (f): f is StudyKit["flashcards"][number] =>
              !!f && typeof f.question === "string" && typeof f.answer === "string",
          )
          .slice(0, 30)
          .map((f) => ({
            question: f.question,
            answer: f.answer,
            sourcePage:
              typeof f.sourcePage === "number" && f.sourcePage > 0
                ? Math.round(f.sourcePage)
                : 1,
          }))
      : [],
    quiz: Array.isArray(kit.quiz)
      ? kit.quiz
          .filter(
            (q): q is StudyKit["quiz"][number] =>
              !!q &&
              typeof q.question === "string" &&
              Array.isArray(q.options) &&
              q.options.length === 4 &&
              typeof q.correctIndex === "number" &&
              q.correctIndex >= 0 &&
              q.correctIndex <= 3,
          )
          .slice(0, 15)
          .map((q) => ({
            question: q.question,
            options: q.options.map(String),
            correctIndex: q.correctIndex,
            explanation: typeof q.explanation === "string" ? q.explanation : "",
            sourcePage:
              typeof q.sourcePage === "number" && q.sourcePage > 0
                ? Math.round(q.sourcePage)
                : 1,
          }))
      : [],
    examQuestions: Array.isArray(kit.examQuestions)
      ? kit.examQuestions
          .filter(
            (q): q is StudyKit["examQuestions"][number] =>
              !!q && typeof q.question === "string" && typeof q.modelAnswer === "string",
          )
          .slice(0, 10)
          .map((q) => ({
            question: q.question,
            modelAnswer: q.modelAnswer,
            topic: typeof q.topic === "string" ? q.topic : "General",
            sourcePage:
              typeof q.sourcePage === "number" && q.sourcePage > 0
                ? Math.round(q.sourcePage)
                : 1,
          }))
      : [],
  };
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

// Tutor: answers ONLY from the stored document text.
export async function tutorReply(
  documentText: string,
  history: ChatMessage[],
  language: string,
): Promise<string> {
  const langNote =
    language === "amharic"
      ? "Answer in Amharic."
      : language === "english"
        ? "Answer in English."
        : "Answer in the same language as the document.";
  const systemPrompt = `
You are a tutor for ONE specific document. ${langNote}
${GROUNDING_RULES}
TUTOR RULES:
- Answer ONLY from the document text below. Do NOT use outside knowledge.
- When you state a fact from the document, cite its page like (p. N).
- If the question cannot be answered from the document, say plainly:
  "That is not covered in this document." Then offer to help with a topic
  that IS in the document. Never invent an answer.
- Be generous and clear: explain step by step, give an example from the
  document when one exists, and end by asking the student a short check
  question when that helps them learn.
- Keep answers focused and readable; use short paragraphs or bullets.

DOCUMENT TEXT:
---
${documentText}
---
`;
  const contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [
    { role: "user", parts: [{ text: systemPrompt }] },
    // Keep only the last few turns so the request stays within limits.
    ...history.slice(-10).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
  ];
  return callGemini(contents, false);
}
