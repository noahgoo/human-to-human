const MAX_CHARS = 14_000;
const HEAD = 10_000;
const TAIL = 4_000;

export function prepareResumeText(raw: string): string {
  let text = raw
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  text = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/https?:\/\/[^\s]+/gi, (url) =>
      /github\.com/i.test(url) ? url.replace(/https?:\/\//i, "").slice(0, 120) : "[url]",
    );

  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, HEAD)}\n[…truncated…]\n${text.slice(-TAIL)}`;
}
