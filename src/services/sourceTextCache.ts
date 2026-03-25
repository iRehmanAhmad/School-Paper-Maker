const SOURCE_TEXT_PREFIX = "pg_source_text_";
const MAX_TEXT_LENGTH = 450_000;

function keyForHash(fileHash: string) {
  return `${SOURCE_TEXT_PREFIX}${fileHash}`;
}

export function cacheSourceText(fileHash: string, text: string) {
  const cleanHash = (fileHash || "").trim();
  const cleanText = (text || "").trim();
  if (!cleanHash || !cleanText) return;
  localStorage.setItem(keyForHash(cleanHash), cleanText.slice(0, MAX_TEXT_LENGTH));
}

export function readCachedSourceText(fileHash: string) {
  const cleanHash = (fileHash || "").trim();
  if (!cleanHash) return "";
  return localStorage.getItem(keyForHash(cleanHash)) || "";
}

export function removeCachedSourceText(fileHash: string) {
  const cleanHash = (fileHash || "").trim();
  if (!cleanHash) return;
  localStorage.removeItem(keyForHash(cleanHash));
}
