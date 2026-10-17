import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lomi Askuala — Upload a PDF, get a study kit",
  description:
    "Upload a PDF and get flashcards, notes, quizzes, exam-likely questions and a tutor — all generated from your document.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a className="logo" href="/">
            Lomi <span>Askuala</span>
          </a>
          <a className="pill btn small secondary" href="/#upload">
            Upload a PDF
          </a>
        </header>
        {children}
        <footer className="footer">
          Lomi Askuala — every answer comes from your uploaded document.
        </footer>
      </body>
    </html>
  );
}
