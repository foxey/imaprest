import type { ImapFlow } from "imapflow";
import type { FastifyBaseLogger } from "fastify";
import { simpleParser } from "mailparser";

export interface ThreadMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

/**
 * Returns true if the connected IMAP server supports THREAD=REFERENCES (RFC 5256).
 */
export function supportsThreadExtension(client: ImapFlow): boolean {
  return client.capabilities.has("THREAD=REFERENCES");
}

/**
 * Recursively extract all UIDs from a nested thread structure.
 * The THREAD response is a nested array of numbers/arrays, e.g. [2, [3, 6, [4, 23]]]
 */
function extractUidsFromTree(node: unknown): number[] {
  if (typeof node === "number") return [node];
  if (Array.isArray(node)) {
    return node.flatMap(extractUidsFromTree);
  }
  return [];
}

/**
 * Find the sub-tree containing the target UID and return all UIDs from it.
 * Thread data is an array of top-level thread trees.
 */
function findThreadContaining(
  trees: unknown[],
  targetUid: number
): number[] {
  for (const tree of trees) {
    const uids = extractUidsFromTree(tree);
    if (uids.includes(targetUid)) return uids;
  }
  return [];
}

/**
 * Uses the native UID THREAD REFERENCES command to find all UIDs
 * in the same thread as the given messageId.
 * Requires THREAD=REFERENCES capability.
 */
export async function resolveThreadNative(
  client: ImapFlow,
  messageId: string
): Promise<number[]> {
  // First, find the seed message's UID by searching for its Message-ID header
  const seedUids = await client.search(
    { header: { "Message-ID": messageId } },
    { uid: true }
  );
  if (!seedUids || seedUids.length === 0) return [];

  const seedUid = seedUids[0];

  // Use exec() — ImapFlow's internal command dispatcher — to send UID THREAD
  const threadTrees: unknown[][] = [];
  const response = await (client as any).exec(
    "UID THREAD",
    [
      { type: "ATOM", value: "REFERENCES" },
      { type: "ATOM", value: "UTF-8" },
      { type: "ATOM", value: "ALL" },
    ],
    {
      untagged: {
        THREAD: async (untagged: any) => {
          if (untagged?.attributes) {
            threadTrees.push(untagged.attributes);
          }
        },
      },
    }
  );
  response.next();

  // Find the tree containing our seed UID
  const uids = findThreadContaining(threadTrees, seedUid);
  return uids.length > 0 ? uids : [seedUid];
}

/**
 * Client-side fallback: walks Message-ID / In-Reply-To / References
 * headers iteratively to collect all UIDs in the thread.
 */
export async function resolveThreadByHeaders(
  client: ImapFlow,
  messageId: string
): Promise<number[]> {
  // Search for the seed message by Message-ID header
  const seedUids = await client.search(
    { header: { "Message-ID": messageId } },
    { uid: true }
  );
  if (!seedUids || seedUids.length === 0) return [];

  const seedUid = seedUids[0];

  // Fetch the seed message's source to extract headers
  let seedSource: Buffer | undefined;
  for await (const msg of client.fetch(
    [seedUid],
    { uid: true, source: true },
    { uid: true }
  )) {
    seedSource = msg.source;
    break;
  }

  if (!seedSource) return [seedUid];

  const parsed = await simpleParser(seedSource);

  // Build the set of known Message-IDs
  const knownIds = new Set<string>();
  if (parsed.messageId) knownIds.add(parsed.messageId);
  if (parsed.inReplyTo) knownIds.add(parsed.inReplyTo);
  if (parsed.references) {
    const refs = Array.isArray(parsed.references)
      ? parsed.references
      : [parsed.references];
    for (const ref of refs) knownIds.add(ref);
  }

  const collectedUids = new Set<number>();
  collectedUids.add(seedUid);

  // Iteratively expand by searching for messages whose headers overlap
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of knownIds) {
      // Search by Message-ID header
      const byMsgId = await client.search(
        { header: { "Message-ID": id } },
        { uid: true }
      );
      if (byMsgId && byMsgId.length > 0) {
        for (const uid of byMsgId) {
          if (!collectedUids.has(uid)) {
            collectedUids.add(uid);
            changed = true;
          }
        }
      }

      // Search by In-Reply-To header
      const byReplyTo = await client.search(
        { header: { "In-Reply-To": id } },
        { uid: true }
      );
      if (byReplyTo && byReplyTo.length > 0) {
        for (const uid of byReplyTo) {
          if (!collectedUids.has(uid)) {
            collectedUids.add(uid);
            changed = true;
          }
        }
      }

      // Search by References header
      const byRefs = await client.search(
        { header: { References: id } },
        { uid: true }
      );
      if (byRefs && byRefs.length > 0) {
        for (const uid of byRefs) {
          if (!collectedUids.has(uid)) {
            collectedUids.add(uid);
            changed = true;
          }
        }
      }
    }

    // For any newly discovered UIDs, fetch their headers and add new IDs
    if (changed) {
      for (const uid of collectedUids) {
        let source: Buffer | undefined;
        for await (const msg of client.fetch(
          [uid],
          { uid: true, source: true },
          { uid: true }
        )) {
          source = msg.source;
          break;
        }
        if (!source) continue;

        const p = await simpleParser(source);
        let addedNew = false;
        if (p.messageId && !knownIds.has(p.messageId)) {
          knownIds.add(p.messageId);
          addedNew = true;
        }
        if (p.inReplyTo && !knownIds.has(p.inReplyTo)) {
          knownIds.add(p.inReplyTo);
          addedNew = true;
        }
        if (p.references) {
          const refs = Array.isArray(p.references)
            ? p.references
            : [p.references];
          for (const ref of refs) {
            if (!knownIds.has(ref)) {
              knownIds.add(ref);
              addedNew = true;
            }
          }
        }
        if (addedNew) changed = true;
      }
    }
  }

  return Array.from(collectedUids);
}

/**
 * High-level entry point: tries native THREAD first, falls back to header walking.
 * Returns thread messages sorted chronologically (oldest first).
 *
 * The native path is wrapped in a try/catch — if exec() is unavailable or
 * its signature changes in a future ImapFlow release, the error is caught
 * and the function transparently falls back to header-based resolution.
 */
export async function getThread(
  client: ImapFlow,
  messageId: string,
  log: FastifyBaseLogger
): Promise<ThreadMessage[]> {
  let uids: number[] = [];

  if (supportsThreadExtension(client)) {
    try {
      uids = await resolveThreadNative(client, messageId);
    } catch (err) {
      log.warn(
        { err },
        "Native IMAP THREAD failed, falling back to header-based resolution"
      );
      uids = await resolveThreadByHeaders(client, messageId);
    }
  } else {
    uids = await resolveThreadByHeaders(client, messageId);
  }

  if (uids.length === 0) return [];

  // Fetch envelopes + flags for all UIDs
  const messages: ThreadMessage[] = [];
  for await (const msg of client.fetch(
    uids,
    { uid: true, envelope: true, flags: true },
    { uid: true }
  )) {
    messages.push({
      uid: msg.uid,
      from: msg.envelope?.from?.[0]?.address ?? "",
      subject: msg.envelope?.subject ?? "",
      date: msg.envelope?.date?.toISOString() ?? "",
      seen: msg.flags?.has("\\Seen") ?? false,
    });
  }

  // Sort chronologically (oldest first)
  messages.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });

  return messages;
}
