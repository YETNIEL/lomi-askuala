import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <main className="container">
      <section className="hero">
        <h1>Upload a PDF, get a study kit.</h1>
        <p>
          Flashcards, notes, quizzes, exam-likely questions and a tutor — all
          generated from <strong>your</strong> document. Share one link, study anywhere.
        </p>
        <p className="sub">
          Grounded by design: every answer comes from the uploaded PDF, with the page it came from.
        </p>
      </section>

      <section className="section">
        <UploadForm />
      </section>

      <section className="section card">
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <h3>Upload a PDF</h3>
            <p>Lecture notes, a chapter, a full module — up to 20 MB / 100 pages.</p>
          </div>
          <div className="step">
            <div className="num">2</div>
            <h3>Get a link</h3>
            <p>We build your study kit and give you one shareable link.</p>
          </div>
          <div className="step">
            <div className="num">3</div>
            <h3>Study &amp; share</h3>
            <p>Anyone with the link can flip cards, take the quiz, and ask the tutor.</p>
          </div>
        </div>
      </section>

      <section className="section card">
        <h2 style={{ marginTop: 0 }}>What&apos;s in every kit</h2>
        <div className="features">
          <div className="feature">
            <h3>📝 Notes</h3>
            <p>Organized summary notes covering the document&apos;s key ideas.</p>
          </div>
          <div className="feature">
            <h3>🃏 Flashcards</h3>
            <p>Up to 30 flip cards with page citations, Know / Don&apos;t know tracking, and shuffle.</p>
          </div>
          <div className="feature">
            <h3>✅ Quiz</h3>
            <p>Up to 15 multiple-choice questions with instant feedback, explanations, and a final score.</p>
          </div>
          <div className="feature">
            <h3>🎯 Exam-likely questions</h3>
            <p>Up to 10 questions an examiner could ask, each with a model answer and topic tag.</p>
          </div>
          <div className="feature">
            <h3>🎓 Tutor</h3>
            <p>Ask anything about the document. The tutor answers only from your PDF — and says so when something isn&apos;t in it.</p>
          </div>
          <div className="feature">
            <h3>🌍 English &amp; Amharic</h3>
            <p>Generate the kit in English, Amharic, or the document&apos;s own language.</p>
          </div>
        </div>
      </section>

      <section className="section card">
        <h2 style={{ marginTop: 0 }}>No hallucination by design</h2>
        <p>
          The AI is instructed to use <strong>only</strong> the text of your uploaded
          document. Every flashcard, quiz question, and exam question carries the page
          number it came from, and anything not supported by the document is left out.
          The tutor refuses to answer from outside knowledge — if it&apos;s not in your
          PDF, it tells you so instead of inventing an answer.
        </p>
      </section>
    </main>
  );
}
