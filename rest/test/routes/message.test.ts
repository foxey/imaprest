import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";
import * as parseLib from "../../src/lib/parse";

jest.mock("../../src/lib/imap");
jest.mock("../../src/lib/parse");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
};

const FAKE_PARSED_MESSAGE = {
  uid: 42,
  date: "2024-01-15T10:00:00.000Z",
  from: "Alice Example <alice@example.com>",
  to: ["bob@example.com"],
  cc: [],
  subject: "Hello there",
  text: "Plain text body",
  html: "<p>HTML body</p>",
  attachments: [],
};

describe("GET /mailboxes/:mailbox/messages/:uid", () => {
  let mockClient: {
    mailboxOpen: jest.Mock;
    fetch: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const fakeSource = Buffer.from("raw message source");

    async function* fakeMessages() {
      yield { uid: 42, source: fakeSource };
    }

    mockClient = {
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      fetch: jest.fn().mockReturnValue(fakeMessages()),
    };

    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
    (parseLib.parseRawMessage as jest.Mock).mockResolvedValue(FAKE_PARSED_MESSAGE);
  });

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 for a non-numeric uid", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/notanumber",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for uid of zero", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 200 with parsed message for a valid uid", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      uid: 42,
      from: "Alice Example <alice@example.com>",
      to: ["bob@example.com"],
      cc: [],
      subject: "Hello there",
      text: "Plain text body",
      html: "<p>HTML body</p>",
      attachments: [],
    });
    expect(mockClient.fetch).toHaveBeenCalledWith(
      [42],
      { uid: true, source: true },
      { uid: true }
    );
    expect(parseLib.parseRawMessage).toHaveBeenCalledWith(
      42,
      expect.any(Buffer),
      { includeHeaders: false }
    );
    await app.close();
  });

  it("passes includeHeaders: true when ?headers=true is set", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42?headers=true",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(parseLib.parseRawMessage).toHaveBeenCalledWith(
      42,
      expect.any(Buffer),
      { includeHeaders: true }
    );
    await app.close();
  });

  it("returns 404 when the message is not found", async () => {
    async function* emptyMessages() {}
    mockClient.fetch.mockReturnValue(emptyMessages());

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/99",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 404 when message has no source", async () => {
    async function* noSourceMessages() {
      yield { uid: 42, source: undefined };
    }
    mockClient.fetch.mockReturnValue(noSourceMessages());

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("disconnects the client even when an error occurs", async () => {
    mockClient.mailboxOpen.mockRejectedValue(new Error("connection failed"));

    const app = await buildApp();
    try {
      await app.inject({
        method: "GET",
        url: "/imaprest/mailboxes/INBOX/messages/42",
        headers: CRED_HEADERS,
      });
    } catch {
      // expected
    }
    expect(imapLib.disconnectImapClient).toHaveBeenCalled();
    await app.close();
  });
});
