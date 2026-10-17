# StudyKit AI

A public AI-based study website. Anyone uploads a PDF, gets a unique
shareable link, and opening that link shows **notes, flashcards, a quiz,
exam-likely questions, and a tutor** — all generated from that PDF.

**Grounding rule (the core of the product):** the AI is instructed to use
ONLY the text of the uploaded document. Every flashcard, quiz question,
and exam question carries the page number it came from, and anything not
supported by the document is left out. The tutor answers only from the
document and says plainly when something is not covered instead of
inventing an answer.

## How it works

| Step | What happens |
| --- | --- |
| Upload (`/api/upload`) | PDF is parsed server-side (text only — the binary is never stored). Text is truncated to ~150k chars, max 20 MB / 100 pages. |
| Generate | One Gemini call returns a structured JSON study kit: summary notes (markdown), up to 30 flashcards, up to 15 quiz questions, up to 10 exam-likely questions — each with a `sourcePage`. |
| Share | The document + kit are stored in Postgres under a short random slug. The user gets a link like `https://your-site.vercel.app/s/k7q2x9mz`. |
| Study (`/s/[slug]`) | Tabs: Notes · Flashcards (flip, Know / Don't know, shuffle) · Quiz (instant feedback + score) · Exam Questions (reveal model answer) · Tutor (chat). |
| Tutor (`/api/tutor`) | Answers only from the stored document text, with page citations. |

No login. Abuse guards: file size / page / char limits, item caps, and a
best-effort per-IP rate limit (5 uploads/hour, 30 tutor messages/hour,
in-memory — resets on redeploy, per instance).

## Get a FREE Gemini API key

1. Go to **Google AI Studio**: https://aistudio.google.com
2. Sign in with a Google account.
3. Click **Get API key** → **Create API key** (free tier — no card needed).
4. Copy the key. You will paste it into Vercel as `GEMINI_API_KEY`.

The default model is `gemini-2.0-flash`. Override it with `GEMINI_MODEL`
if you want a different Gemini model.

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in GEMINI_API_KEY in .env.local.
# For the database, easiest: `vercel link` then `vercel env pull .env.local`
# (pulls your linked Vercel Postgres credentials into .env.local).
npm run dev
# Open http://localhost:3000
```

## Database

The app creates the table automatically on first upload
(`CREATE TABLE IF NOT EXISTS` in the upload route), so there is no
separate setup step. For reference, the schema is:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  text TEXT NOT NULL,
  kit JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documents_slug_idx ON documents (slug);
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In [Vercel](https://vercel.com) → **Add New → Project** → import the repo.
3. **Storage → Create Database → Postgres** → create and link it to the project
   (this auto-adds the `POSTGRES_*` variables).
4. **Settings → Environment Variables** → add:
   - `GEMINI_API_KEY` = your key from Google AI Studio
   - `GEMINI_MODEL` = `gemini-2.0-flash` (optional — this is the default)
5. **Deploy.** Open the deployed URL and upload a test PDF.
6. If uploads fail with *"AI is not configured"*, the `GEMINI_API_KEY`
   variable is missing — add it and redeploy.

**Timeout note:** study-kit generation can take up to a minute for large
PDFs. The upload route sets `maxDuration = 60`. On the Vercel Hobby plan
functions are clamped to shorter runtimes, so very large PDFs may time out
there — use smaller PDFs, or a Pro plan for longer generation.

## Project structure

```
app/
  page.tsx              Landing page + upload form
  s/[slug]/page.tsx     Public study page (server component)
  api/upload/route.ts   PDF parse → Gemini kit → store → return link
  api/tutor/route.ts    Grounded tutor chat for one document
components/
  UploadForm.tsx        Drag-and-drop upload + progress + copy link
  StudyKit.tsx          Tabs: Notes / Flashcards / Quiz / Exam / Tutor
lib/
  db.ts                 Postgres: table + insert + fetch by slug
  gemini.ts             Gemini REST client + grounding prompts
  rate-limit.ts         Best-effort per-IP limits (in-memory)
  slug.ts               Random share slugs
  types.ts              StudyKit types
```

## Limits

- PDF: max 20 MB, max 100 pages, text truncated to ~150k chars.
- Kit: max 30 flashcards, 15 quiz questions, 10 exam questions.
- Tutor context: document text truncated to ~120k chars, last 10 turns.
