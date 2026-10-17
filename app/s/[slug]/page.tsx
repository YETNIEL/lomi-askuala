import { notFound } from "next/navigation";
import { getDocumentBySlug } from "@/lib/db";
import StudyKit from "@/components/StudyKit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function StudyPage({
  params,
}: {
  params: { slug: string };
}) {
  let doc = null;
  let dbError = false;
  try {
    doc = await getDocumentBySlug(params.slug);
  } catch (e) {
    // Database unreachable / not configured (e.g. Postgres not linked yet).
    console.error("Failed to load study kit:", e);
    dbError = true;
  }
  if (dbError) {
    return (
      <main className="container">
        <div className="card">
          <h1>Study kit unavailable</h1>
          <p>
            This site&apos;s database is not reachable right now. The site owner
            needs to link a Vercel Postgres database (see README) and try again.
          </p>
          <p>
            <a href="/">← Back to upload</a>
          </p>
        </div>
      </main>
    );
  }
  if (!doc) notFound();

  return (
    <main className="container">
      <div className="card">
        <div className="doc-head">
          <h1>{doc.title}</h1>
          <a className="btn small secondary" href="/">
            ← New upload
          </a>
        </div>
        <div className="meta">
          {doc.kit.flashcards.length} flashcards · {doc.kit.quiz.length} quiz
          questions · {doc.kit.examQuestions.length} exam questions · Language:{" "}
          {doc.language}
        </div>
      </div>
      <StudyKit slug={doc.slug} kit={doc.kit} />
    </main>
  );
}
