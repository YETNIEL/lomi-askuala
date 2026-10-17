"use client";

import { useMemo, useRef, useState } from "react";
import type { StudyKit } from "@/lib/types";

type Tab = "notes" | "flashcards" | "quiz" | "exam" | "tutor";

// --- Tiny markdown-lite renderer for the summary notes ---
// Handles headings (#, ##, ###), "- " bullets, and **bold**. Everything
// else renders as a plain paragraph. No markdown library needed.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function renderNotes(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = (key: string) => {
    if (bullets.length) {
      out.push(
        <ul key={key}>
          {bullets.map((b, i) => (
            <li key={i}>{renderInline(b, `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t.startsWith("### ")) {
      flushBullets(`b-${idx}`);
      out.push(<h4 key={idx}>{renderInline(t.slice(4), `h-${idx}`)}</h4>);
    } else if (t.startsWith("## ")) {
      flushBullets(`b-${idx}`);
      out.push(<h3 key={idx}>{renderInline(t.slice(3), `h-${idx}`)}</h3>);
    } else if (t.startsWith("# ")) {
      flushBullets(`b-${idx}`);
      out.push(<h3 key={idx}>{renderInline(t.slice(2), `h-${idx}`)}</h3>);
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      bullets.push(t.slice(2));
    } else if (t === "") {
      flushBullets(`b-${idx}`);
    } else {
      flushBullets(`b-${idx}`);
      out.push(<p key={idx}>{renderInline(t, `p-${idx}`)}</p>);
    }
  });
  flushBullets("b-end");
  return out;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "notes", label: "📝 Notes" },
  { id: "flashcards", label: "🃏 Flashcards" },
  { id: "quiz", label: "✅ Quiz" },
  { id: "exam", label: "🎯 Exam Questions" },
  { id: "tutor", label: "🎓 Tutor" },
];

export default function StudyKit({ slug, kit }: { slug: string; kit: StudyKit }) {
  const [tab, setTab] = useState<Tab>("notes");

  // --- Flashcards ---
  const [order, setOrder] = useState<number[]>(() =>
    kit.flashcards.map((_, i) => i),
  );
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const currentCard = kit.flashcards[order[cardIdx]];

  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setCardIdx(0);
    setFlipped(false);
  };
  const mark = (isKnown: boolean) => {
    if (!currentCard) return;
    setKnown((prev) => {
      const next = new Set(prev);
      const realIdx = order[cardIdx];
      if (isKnown) next.add(realIdx);
      else next.delete(realIdx);
      return next;
    });
    setFlipped(false);
    setCardIdx((i) => Math.min(i + 1, Math.max(order.length - 1, 0)));
  };

  // --- Quiz ---
  const [quizIdx, setQuizIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const currentQ = kit.quiz[quizIdx];

  const checkAnswer = () => {
    if (selected === null || checked) return;
    if (selected === currentQ.correctIndex) setScore((s) => s + 1);
    setChecked(true);
  };
  const nextQuestion = () => {
    if (quizIdx + 1 >= kit.quiz.length) setQuizDone(true);
    else setQuizIdx((i) => i + 1);
    setSelected(null);
    setChecked(false);
  };
  const restartQuiz = () => {
    setQuizIdx(0);
    setSelected(null);
    setChecked(false);
    setScore(0);
    setQuizDone(false);
  };

  // --- Exam questions ---
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const toggleReveal = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // --- Tutor ---
  const [messages, setMessages] = useState<Array<{ role: "user" | "model"; text: string }>>([]);
  const [draft, setDraft] = useState("");
  const [tutorBusy, setTutorBusy] = useState(false);
  const [tutorError, setTutorError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const askTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || tutorBusy) return;
    setDraft("");
    setTutorError("");
    const nextMessages = [...messages, { role: "user" as const, text }];
    setMessages(nextMessages);
    setTutorBusy(true);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, messages: nextMessages }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        setTutorError(data.error || "Tutor failed. Please try again.");
      } else {
        setMessages([...nextMessages, { role: "model" as const, text: data.reply || "" }]);
      }
    } catch {
      setTutorError("Network error. Please try again.");
    } finally {
      setTutorBusy(false);
      setTimeout(
        () => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }),
        50,
      );
    }
  };

  const flashcardCount = useMemo(() => kit.flashcards.length, [kit]);

  return (
    <div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notes" && (
        <div className="tab-panel card">
          {kit.summaryNotes ? (
            <div className="notes">{renderNotes(kit.summaryNotes)}</div>
          ) : (
            <p className="empty">No notes were generated for this document.</p>
          )}
        </div>
      )}

      {tab === "flashcards" && (
        <div className="tab-panel">
          {flashcardCount === 0 ? (
            <p className="empty card">No flashcards were generated for this document.</p>
          ) : (
            <>
              <div className="flash-controls card">
                <span className="flash-progress">
                  Card {Math.min(cardIdx + 1, flashcardCount)} of {flashcardCount} ·{" "}
                  {known.size} marked known
                </span>
                <button className="btn small secondary" onClick={shuffle}>
                  🔀 Shuffle
                </button>
              </div>
              <div className="flash-scene">
                <div
                  className={`flash-card${flipped ? " flipped" : ""}`}
                  onClick={() => setFlipped((f) => !f)}
                  role="button"
                  aria-label="Flip flashcard"
                >
                  <div className="flash-face">
                    <div className="label">Question · tap to flip</div>
                    <div className="text">{currentCard?.question}</div>
                    <div className="source">Source: p. {currentCard?.sourcePage}</div>
                  </div>
                  <div className="flash-face back">
                    <div className="label">Answer · tap to flip back</div>
                    <div className="text">{currentCard?.answer}</div>
                    <div className="source">Source: p. {currentCard?.sourcePage}</div>
                  </div>
                </div>
                <div className="flash-spacer" />
              </div>
              <div className="flash-actions">
                <button className="btn small secondary" onClick={() => mark(false)}>
                  ✗ Don&apos;t know
                </button>
                <button className="btn small success" onClick={() => mark(true)}>
                  ✓ Know it
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "quiz" && (
        <div className="tab-panel card">
          {kit.quiz.length === 0 ? (
            <p className="empty">No quiz questions were generated for this document.</p>
          ) : quizDone ? (
            <div className="score-box">
              <div className="big">
                {score} / {kit.quiz.length}
              </div>
              <p>
                {score === kit.quiz.length
                  ? "Perfect score! 🎉"
                  : score >= kit.quiz.length / 2
                    ? "Good work — review the ones you missed and try again."
                    : "Keep going — check the notes and flashcards, then retry."}
              </p>
              <button className="btn" onClick={restartQuiz}>
                Retake quiz
              </button>
            </div>
          ) : (
            currentQ && (
              <>
                <div className="flash-progress">
                  Question {quizIdx + 1} of {kit.quiz.length} · Score: {score}
                </div>
                <p className="quiz-q">{currentQ.question}</p>
                {currentQ.options.map((opt, i) => {
                  let cls = "opt";
                  if (checked) {
                    if (i === currentQ.correctIndex) cls += " correct";
                    else if (i === selected) cls += " wrong";
                  } else if (selected === i) {
                    cls += " selected";
                  }
                  return (
                    <button
                      key={i}
                      className={cls}
                      disabled={checked}
                      onClick={() => setSelected(i)}
                    >
                      {String.fromCharCode(65 + i)}. {opt}
                    </button>
                  );
                })}
                {checked && (
                  <div className="explain">
                    <strong>
                      {selected === currentQ.correctIndex ? "✓ Correct!" : "✗ Not quite."}
                    </strong>{" "}
                    {currentQ.explanation}
                    <div className="source">Source: p. {currentQ.sourcePage}</div>
                  </div>
                )}
                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                  {!checked ? (
                    <button className="btn" disabled={selected === null} onClick={checkAnswer}>
                      Check answer
                    </button>
                  ) : (
                    <button className="btn" onClick={nextQuestion}>
                      {quizIdx + 1 >= kit.quiz.length ? "See score" : "Next question →"}
                    </button>
                  )}
                </div>
              </>
            )
          )}
        </div>
      )}

      {tab === "exam" && (
        <div className="tab-panel card">
          {kit.examQuestions.length === 0 ? (
            <p className="empty">No exam questions were generated for this document.</p>
          ) : (
            kit.examQuestions.map((q, i) => (
              <div className="exam-item" key={i}>
                <div className="q">
                  {i + 1}. {q.question}
                  <span className="topic">{q.topic}</span>
                </div>
                <div className="source">Source: p. {q.sourcePage}</div>
                <button
                  className="btn small secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => toggleReveal(i)}
                >
                  {revealed.has(i) ? "Hide model answer" : "Reveal model answer"}
                </button>
                {revealed.has(i) && (
                  <div className="model-answer">{q.modelAnswer}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "tutor" && (
        <div className="tab-panel card">
          <div className="chat-log" ref={logRef}>
            {messages.length === 0 && (
              <p className="empty">
                Ask anything about this document — the tutor answers only from
                its content, with page citations. If it&apos;s not in the document,
                it will say so.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role === "user" ? "user" : "model"}`}>
                {m.text}
              </div>
            ))}
            {tutorBusy && <div className="msg model">Thinking…</div>}
          </div>
          {tutorError && <div className="alert error">{tutorError}</div>}
          <form className="chat-form" onSubmit={askTutor}>
            <input
              className="chat-input"
              type="text"
              placeholder="Ask about this document…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={tutorBusy}
            />
            <button className="btn" type="submit" disabled={tutorBusy || !draft.trim()}>
              Send
            </button>
          </form>
          <div className="chat-note">
            The tutor uses only this document — it will not answer from outside knowledge.
          </div>
        </div>
      )}
    </div>
  );
}
