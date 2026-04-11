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

  return {
    uid,
    date: parsed.date?.toISOString() ?? "",
    from: formatAddresses(parsed.from)[0] ?? "",
    to: formatAddresses(parsed.to as AddressObject | AddressObject[] | undefined),
    cc: formatAddresses(parsed.cc as AddressObject | AddressObject[] | undefined),
    subject: parsed.subject ?? "",
    text: parsed.text ?? null,
    html: typeof parsed.html === "string" ? parsed.html : null,
    attachments: (parsed.attachments ?? [])
      .filter((a) => a.contentDisposition === "attachment" || !!a.filename)
      .map((a) => ({
        filename: a.filename ?? null,
        contentType: a.contentType,
        size: a.size ?? 0,
        contentId: a.contentId ?? null,
      })),
  };
}
