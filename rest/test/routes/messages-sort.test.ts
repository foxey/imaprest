import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";

jest.mock("../../src/lib/imap");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
};

const ALL_UIDS = [1, 5, 10, 20, 50];

function makeFakeMessages(uids: number[]) {
  return uids.map((uid, i) => ({
    uid,
    envelope: {
      from: [{ address: `user${uid}@example.com` }],
      subject: `Message ${uid}`,
      date: new Date(`2024-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`),
    },
    flags: new Set<string>([]),
  }));
}

function fakeAsyncIterator(messages: ReturnType<typeof makeFakeMessages>) {
  return (async function* () {
    for (const m of messages) yield m;
  })();
}

describe("GET /mailboxes/:mailbox/messages — sort parameter", () => {
  let mockClient: {
    mailbox: { uidNext: number };
    mailboxOpen: jest.Mock;
    search: jest.Mock;
    fetch: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      mailbox: { uidNext: 100 },
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([...ALL_UIDS]),
      fetch: jest.fn().mockImplementation((uids: number[]) =>
        fakeAsyncIterator(makeFakeMessages(uids))
      ),
    };

    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
  });

  // Validates: Requirements 7.1
  it("returns messages in ascending order with sort=asc", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages?sort=asc",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const uids = body.messages.map((m: any) => m.uid);
    expect(uids).toEqual([1, 5, 10, 20, 50]);
    await app.close();
  });

  // Validates: Requirements 7.3
  it("returns messages in descending order with sort=desc", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages?sort=desc",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const uids = body.messages.map((m: any) => m.uid);
    expect(uids).toEqual([50, 20, 10, 5, 1]);
    await app.close();
  });

  // Validates: Requirements 7.3
  it("defaults to descending order when sort is omitted", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const uids = body.messages.map((m: any) => m.uid);
    expect(uids).toEqual([50, 20, 10, 5, 1]);
    await app.close();
  });

  // Validates: Requirements 7.4
  it("returns 400 for invalid sort value", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages?sort=random",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/sort/i);
    await app.close();
  });

  // Validates: Requirements 7.5
  it("paginates forward in ascending order with cursor", async () => {
    // When sort=asc&cursor=5, the route uses buildUidRangeCriteriaAsc(5)
    // which produces { uid: '6:*' }. Mock search to return UIDs > 5.
    mockClient.search.mockResolvedValue([10, 20, 50]);

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages?sort=asc&cursor=5&limit=2",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const uids = body.messages.map((m: any) => m.uid);
    // limit=2, ascending: should get [10, 20], with hasMore=true
    expect(uids).toEqual([10, 20]);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe(20);
    await app.close();
  });
});
