import { simpleParser, AddressObject } from "mailparser";

export interface Attachment {
  filename: string | null;
  contentType: string;
  size: number;
  contentId: string | null;
}

export interface ParsedMessage {
  uid: number;
  date: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  attachments: Attachment[];
  messageId: string | null;
  references: string[];
  received: string[];
}

export function htmlToMarkdown(html: string): string {
  return html
    // Block-level elements first
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, content) =>
      '#'.repeat(Number(level)) + ' ' + content.trim() + '\n\n')
    // Bold / strong
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    // Italic / em
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    // Strikethrough
    .replace(/<(s|strike|del)[^>]*>(.*?)<\/\1>/gi, '~~$2~~')
    // Code
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    // Links: <a href="url">text</a> → [text](url)
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // List items
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    // Strip <ul>, <ol> wrappers (adds spacing around list blocks)
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    // Blockquote
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, content) =>
      content.trim().split('\n').map((line: string) => '> ' + line).join('\n') + '\n\n')
    // Horizontal rule
    .replace(/<hr[^>]*\/?>/gi, '\n---\n')
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Paragraphs
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    // Divs as line breaks
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    // Strip remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatAddresses(
  addr: AddressObject | AddressObject[] | undefined
): string[] {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  return list
    .flatMap((a) => a.value)
    .map((e) => (e.name ? `${e.name} <${e.address ?? ""}>` : (e.address ?? "")))
    .filter((s) => s.length > 0);
}

export async function parseRawMessage(
  uid: number,
  source: Buffer
): Promise<ParsedMessage> {
  const parsed = await simpleParser(source);

  const receivedRaw = parsed.headers.get("received");
  const received = Array.isArray(receivedRaw)
    ? receivedRaw.map(String)
    : receivedRaw
      ? [String(receivedRaw)]
      : [];

  return {
    uid,
    date: parsed.date?.toISOString() ?? "",
    from: formatAddresses(parsed.from)[0] ?? "",
    to: formatAddresses(parsed.to as AddressObject | AddressObject[] | undefined),
    cc: formatAddresses(parsed.cc as AddressObject | AddressObject[] | undefined),
    subject: parsed.subject ?? "",
    text: parsed.text ?? (typeof parsed.html === 'string' ? htmlToMarkdown(parsed.html) : null),
    html: typeof parsed.html === "string" ? parsed.html : null,
    attachments: (parsed.attachments ?? [])
      .filter((a) => a.contentDisposition === "attachment" || !!a.filename)
      .map((a) => ({
        filename: a.filename ?? null,
        contentType: a.contentType,
        size: a.size ?? 0,
        contentId: a.contentId ?? null,
      })),
    messageId: parsed.messageId ?? null,
    references: Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [],
    received,
  };
}
