import type { StudyKit, StudyLanguage } from "./types";

// Gemini via plain REST fetch (no SDK needed).
// Key comes ONLY from GEMINI_API_KEY. No key is ever bundled in code.

const DEFAULT_MODEL = "gemini-3.8-flash";

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
        ...(jsonMode
          ? {
              responseMimeType: "application/json",
              // No extended reasoning for extraction-style JSON calls:
              // Gemini 3's default thinking can take tens of seconds and
              // blow Vercel's 60s function limit. These calls only
              // reformat document text, so thinking is unnecessary.
              thinkingConfig: { thinkingBudget: 0 },
            }
          : {}),
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

const NOTES_FLASHCARDS_HINT = `
Return ONLY a JSON object with exactly this shape (no markdown fences, no extra text):
{
  "summaryNotes": "markdown string: organized notes covering the document's key ideas, with section headings",
  "flashcards": [ { "question": "...", "answer": "...", "sourcePage": 1 } ]
}
Limits: at most 15 flashcards.
`;

const QUIZ_EXAM_HINT = `
Return ONLY a JSON object with exactly this shape (no markdown fences, no extra text):
{
  "quiz": [ { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "...", "sourcePage": 1 } ],
  "examQuestions": [ { "question": "...", "modelAnswer": "...", "topic": "...", "sourcePage": 1 } ]
}
Limits: at most 10 quiz questions, at most 6 exam questions.
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

function parseKitJson(raw: string): Record<string, unknown> {
  // Strip markdown fences if the model adds them despite JSON mode.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to the throw below
  }
  throw new Error("AI returned invalid JSON for the study kit.");
}

function normalizeFlashcards(input: unknown): StudyKit["flashcards"] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (f): f is StudyKit["flashcards"][number] =>
        !!f &&
        typeof (f as { question?: unknown }).question === "string" &&
        typeof (f as { answer?: unknown }).answer === "string",
    )
    .slice(0, 15)
    .map((f) => {
      const item = f as { question: string; answer: string; sourcePage?: unknown };
      return {
        question: item.question,
        answer: item.answer,
        sourcePage:
          typeof item.sourcePage === "number" && item.sourcePage > 0
            ? Math.round(item.sourcePage)
            : 1,
      };
    });
}

function normalizeQuiz(input: unknown): StudyKit["quiz"] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (q): q is StudyKit["quiz"][number] =>
        !!q &&
        typeof (q as { question?: unknown }).question === "string" &&
        Array.isArray((q as { options?: unknown }).options) &&
        (q as { options: unknown[] }).options.length === 4 &&
        typeof (q as { correctIndex?: unknown }).correctIndex === "number" &&
        (q as { correctIndex: number }).correctIndex >= 0 &&
        (q as { correctIndex: number }).correctIndex <= 3,
    )
    .slice(0, 10)
    .map((q) => {
      const item = q as {
        question: string;
        options: unknown[];
        correctIndex: number;
        explanation?: unknown;
        sourcePage?: unknown;
      };
      return {
        question: item.question,
        options: item.options.map(String),
        correctIndex: item.correctIndex,
        explanation: typeof item.explanation === "string" ? item.explanation : "",
        sourcePage:
          typeof item.sourcePage === "number" && item.sourcePage > 0
            ? Math.round(item.sourcePage)
            : 1,
      };
    });
}

function normalizeExamQuestions(input: unknown): StudyKit["examQuestions"] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (q): q is StudyKit["examQuestions"][number] =>
        !!q &&
        typeof (q as { question?: unknown }).question === "string" &&
        typeof (q as { modelAnswer?: unknown }).modelAnswer === "string",
    )
    .slice(0, 6)
    .map((q) => {
      const item = q as {
        question: string;
        modelAnswer: string;
        topic?: unknown;
        sourcePage?: unknown;
      };
      return {
        question: item.question,
        modelAnswer: item.modelAnswer,
        topic: typeof item.topic === "string" ? item.topic : "General",
        sourcePage:
          typeof item.sourcePage === "number" && item.sourcePage > 0
            ? Math.round(item.sourcePage)
            : 1,
      };
    });
}

export async function generateStudyKit(
  documentText: string,
  language: StudyLanguage,
): Promise<StudyKit> {
  const lang = languageInstruction(language);
  // Two parallel calls, each producing a smaller JSON payload. Wall-clock
  // time is roughly the slower call, not the sum — this keeps generation
  // inside Vercel's 60s function limit on the Hobby plan.
  const notesPrompt = `
You are a study assistant. From the document text below, build study notes + flashcards.
${GROUNDING_RULES}
${lang}
${NOTES_FLASHCARDS_HINT}

DOCUMENT TEXT (page numbers are approximate, based on extraction order;
use your best estimate of the page each fact came from):
---
${documentText}
---
`;
  const quizPrompt = `
You are a study assistant. From the document text below, build a quiz + exam-likely questions.
${GROUNDING_RULES}
${lang}
${QUIZ_EXAM_HINT}

DOCUMENT TEXT (page numbers are approximate, based on extraction order;
use your best estimate of the page each fact came from):
---
${documentText}
---
`;
  const [rawNotes, rawQuiz] = await Promise.all([
    callGemini([{ role: "user", parts: [{ text: notesPrompt }] }], true),
    callGemini([{ role: "user", parts: [{ text: quizPrompt }] }], true),
  ]);
  const parsedNotes = parseKitJson(rawNotes);
  const parsedQuiz = parseKitJson(rawQuiz);
  return {
    summaryNotes:
      typeof parsedNotes.summaryNotes === "string" ? parsedNotes.summaryNotes : "",
    flashcards: normalizeFlashcards(parsedNotes.flashcards),
    quiz: normalizeQuiz(parsedQuiz.quiz),
    examQuestions: normalizeExamQuestions(parsedQuiz.examQuestions),
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
