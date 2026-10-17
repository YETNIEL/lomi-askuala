import { randomBytes } from "crypto";

// Short random slug for shareable study links, e.g. /s/k7q2x9mz
export function makeSlug(length = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += alphabet[bytes[i] % alphabet.length];
  }
  return slug;
}
