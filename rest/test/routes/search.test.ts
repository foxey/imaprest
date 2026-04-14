import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";

jest.mock("../../src/lib/imap");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
};

const FAKE_MESSAGES = [
  {
    uid: 1,
    envelope: {
      from: [{ address: "alice@example.com" }],
      subject: "Hello",
      date: new Date("2024-01-15T10:00:00Z"),
    },
    flags: new Set<string>([]),
  },
  {
    uid: 2,
    envelope: {
      from: [{ address: "bob@example.com" }],
      subject: "Re: Hello",
      date: new Date("2024-01-16T12:00:00Z"),
    },
    flags: new Set<string>(["\\Seen"]),
  },
];

describe("GET /mailboxes/:mailbox/messages/search", () => {
  let mockClient: {
    mailbox: { uidNext: number };
    mailboxOpen: jest.Mock;
    search: jest.Mock;
    fetch: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    async function* fakeMessages() {
      for (const m of FAKE_MESSAGES) yield m;
    }

    mockClient = {
      mailbox: { uidNext: 100 },
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([1, 2]),
      fetch: jest.fn().mockReturnValue(fakeMessages()),
    };

    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search?q=test",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with paginated response shape", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search?q=test",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("messages");
    expect(body).toHaveProperty("nextCursor");
    expect(body).toHaveProperty("hasMore");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages).toHaveLength(2);
    await app.close();
  });

  it("returns empty paginated response when search finds no messages", async () => {
    mockClient.search.mockResolvedValue([]);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search?q=test",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });
    await app.close();
  });

  it("returns 400 for invalid cursor", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search?q=test&cursor=abc",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/cursor/i);
    await app.close();
  });

  it("returns 400 for invalid limit", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search?q=test&limit=-5",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/limit/i);
    await app.close();
  });

  it("returns 400 when limit exceeds 100", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search?q=test&limit=200",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/limit/i);
    await app.close();
  });

  it("returns 400 when no search criteria provided", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("merges UID range criteria with search criteria", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages/search?from=alice%40example.com",
      headers: CRED_HEADERS,
    });
    expect(mockClient.search).toHaveBeenCalledWith(
      expect.objectContaining({ from: "alice@example.com", uid: expect.any(String) }),
      { uid: true }
    );
    await app.close();
  });
});
