// Shared types for a generated study kit.
// Every item carries a `sourcePage` (1-based page of the uploaded PDF it
// came from) — that is the grounding mechanism: nothing in the kit is
// allowed to come from outside the document.

export interface Flashcard {
  question: string;
  answer: string;
  sourcePage: number;
}

export interface QuizQuestion {
  question: string;
  options: string[]; // exactly 4
  correctIndex: number; // 0..3
  explanation: string;
  sourcePage: number;
}

export interface ExamQuestion {
  question: string;
  modelAnswer: string;
  topic: string;
  sourcePage: number;
}

export interface StudyKit {
  summaryNotes: string; // markdown
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  examQuestions: ExamQuestion[];
}

export type StudyLanguage = "english" | "amharic" | "auto";

export interface DocumentRow {
  id: number;
  slug: string;
  title: string;
  language: string;
  text: string;
  kit: StudyKit;
  created_at: string;
}
