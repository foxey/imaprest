import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";
import * as threadLib from "../../src/lib/thread";

jest.mock("../../src/lib/imap");
jest.mock("../../src/lib/thread");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
};

const FAKE_THREAD: threadLib.ThreadMessage[] = [
  {
    uid: 10,
    from: "alice@example.com",
    subject: "Hello",
    date: "2024-06-01T10:00:00.000Z",
    seen: true,
  },
  {
    uid: 15,
    from: "bob@example.com",
    subject: "Re: Hello",
    date: "2024-06-01T11:00:00.000Z",
    seen: false,
  },
  {
    uid: 22,
    from: "alice@example.com",
    subject: "Re: Hello",
    date: "2024-06-01T12:00:00.000Z",
    seen: false,
  },
];

describe("GET /mailboxes/:mailbox/thread/:messageId", () => {
  let mockClient: { mailboxOpen: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
    };

    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
    (threadLib.getThread as jest.Mock).mockResolvedValue(FAKE_THREAD);
  });

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/thread/%3Cabc%40example.com%3E",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with empty array when Message-ID not found", async () => {
    (threadLib.getThread as jest.Mock).mockResolvedValue([]);

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/thread/%3Cunknown%40example.com%3E",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual([]);
    await app.close();
  });

  it("returns 200 with thread messages sorted chronologically", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/thread/%3Cabc%40example.com%3E",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveLength(3);

    // Verify chronological order (oldest first)
    for (let i = 1; i < body.length; i++) {
      expect(new Date(body[i].date).getTime()).toBeGreaterThanOrEqual(
        new Date(body[i - 1].date).getTime()
      );
    }
    await app.close();
  });

  it("response shape matches ThreadMessageSummary", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/thread/%3Cabc%40example.com%3E",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    for (const msg of body) {
      expect(msg).toEqual(
        expect.objectContaining({
          uid: expect.any(Number),
          from: expect.any(String),
          subject: expect.any(String),
          date: expect.any(String),
          seen: expect.any(Boolean),
        })
      );
    }
    await app.close();
  });

  it("URL-decodes the messageId parameter", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/thread/%3Cabc%40example.com%3E",
      headers: CRED_HEADERS,
    });

    expect(threadLib.getThread).toHaveBeenCalledWith(
      mockClient,
      "<abc@example.com>",
      expect.anything()
    );
    await app.close();
  });

  it("calls getThread with the client, decoded messageId, and logger", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/thread/%3Cabc%40example.com%3E",
      headers: CRED_HEADERS,
    });

    expect(threadLib.getThread).toHaveBeenCalledTimes(1);
    expect(threadLib.getThread).toHaveBeenCalledWith(
      mockClient,
      "<abc@example.com>",
      expect.objectContaining({ info: expect.any(Function) })
    );
    await app.close();
  });

  it("returns 502 on IMAP connection failure", async () => {
    (imapLib.createImapClient as jest.Mock).mockRejectedValue(
      new Error("Connection refused")
    );

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/thread/%3Cabc%40example.com%3E",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "Failed to connect to IMAP server",
    });
    await app.close();
  });

  it("opens the correct mailbox before calling getThread", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/Sent/thread/%3Cabc%40example.com%3E",
      headers: CRED_HEADERS,
    });

    expect(mockClient.mailboxOpen).toHaveBeenCalledWith("Sent");
    await app.close();
  });
});

