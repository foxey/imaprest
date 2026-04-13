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

describe("GET /mailboxes/:mailbox/messages", () => {
  let mockClient: {
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
      url: "/mailboxes/INBOX/messages",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with message array for no filters", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      uid: 1,
      from: "alice@example.com",
      subject: "Hello",
      seen: false,
    });
    expect(body[1]).toMatchObject({
      uid: 2,
      from: "bob@example.com",
      subject: "Re: Hello",
      seen: true,
    });
    expect(mockClient.search).toHaveBeenCalledWith({}, { uid: true });
    await app.close();
  });

  it("passes unseen=true as { seen: false } to search", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages?unseen=true",
      headers: CRED_HEADERS,
    });
    expect(mockClient.search).toHaveBeenCalledWith({ seen: false }, { uid: true });
    await app.close();
  });

  it("passes from filter to search criteria", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages?from=alice%40example.com",
      headers: CRED_HEADERS,
    });
    expect(mockClient.search).toHaveBeenCalledWith(
      { from: "alice@example.com" },
      { uid: true }
    );
    await app.close();
  });

  it("returns 400 for an invalid since date", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages?since=not-a-date",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns empty array when search finds no messages", async () => {
    mockClient.search.mockResolvedValue([]);
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/mailboxes/INBOX/messages",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual([]);
    await app.close();
  });
});
