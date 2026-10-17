import { sql } from "@vercel/postgres";
import type { DocumentRow, StudyKit } from "./types";

// One table for everything. The PDF binary is never stored — only the
// extracted text and the generated kit.

export const CREATE_TABLE_SQL = `
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
`;

export async function ensureTable(): Promise<void> {
  await sql.query(CREATE_TABLE_SQL);
}

export async function insertDocument(
  slug: string,
  title: string,
  language: string,
  text: string,
  kit: StudyKit,
): Promise<void> {
  await ensureTable();
  await sql`
    INSERT INTO documents (slug, title, language, text, kit)
    VALUES (${slug}, ${title}, ${language}, ${text}, ${JSON.stringify(kit)}::jsonb)
  `;
}

export async function getDocumentBySlug(
  slug: string,
): Promise<DocumentRow | null> {
  await ensureTable();
  const { rows } = await sql`
    SELECT id, slug, title, language, text, kit, created_at
    FROM documents
    WHERE slug = ${slug}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0] as unknown as Record<string, unknown>;
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    language: String(row.language),
    text: String(row.text),
    kit: row.kit as StudyKit,
    created_at: String(row.created_at),
  };
}
