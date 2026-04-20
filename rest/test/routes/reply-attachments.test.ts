import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";
import * as parseLib from "../../src/lib/parse";
import * as smtpLib from "../../src/lib/smtp";

jest.mock("../../src/lib/imap");
jest.mock("../../src/lib/parse");
jest.mock("../../src/lib/smtp");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
  "x-smtp-host": "smtp.example.com",
};

const FAKE_ORIGINAL = {
  uid: 10,
  date: "2024-01-15T10:00:00.000Z",
  from: "Alice Example <alice@example.com>",
  to: ["user@example.com"],
  cc: [],
  subject: "Hello there",
  text: "Original body",
  html: null,
  attachments: [],
  messageId: "<abc123@example.com>",
  references: ["<prev@example.com>"],
};

describe("POST /mailboxes/:mailbox/messages/:uid/reply — attachments", () => {
  let mockClient: {
    mailboxOpen: jest.Mock;
    fetch: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const fakeSource = Buffer.from("raw message source");

    async function* fakeMessages() {
      yield { uid: 10, source: fakeSource };
    }

    mockClient = {
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      fetch: jest.fn().mockReturnValue(fakeMessages()),
    };

    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
    (parseLib.parseRawMessage as jest.Mock).mockResolvedValue(FAKE_ORIGINAL);
    (smtpLib.sendMail as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 202 with valid attachments", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: {
        text: "My reply",
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: Buffer.from("hello").toString("base64"),
          },
        ],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ queued: true });
    await app.close();
  });

  it("returns 400 when attachment missing filename", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: {
        text: "My reply",
        attachments: [{ contentType: "text/plain", content: "aGVsbG8=" }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when attachment missing contentType", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: {
        text: "My reply",
        attachments: [{ filename: "test.txt", content: "aGVsbG8=" }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when attachment missing content", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: {
        text: "My reply",
        attachments: [{ filename: "test.txt", contentType: "text/plain" }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for invalid base64 content", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: {
        text: "My reply",
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: "!!!invalid!!!",
          },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 202 without attachments (backward compatibility)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: { text: "My reply" },
    });
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ queued: true });
    await app.close();
  });

  it("returns 202 with empty attachments array", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: { text: "My reply", attachments: [] },
    });
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ queued: true });
    await app.close();
  });

  it("calls sendMail with decoded attachment buffers", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: {
        text: "My reply",
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: "aGVsbG8=",
          },
        ],
      },
    });

    expect(smtpLib.sendMail).toHaveBeenCalledWith(
      { user: "user@example.com", password: "secret" },
      { host: "smtp.example.com", port: 587, tls: false },
      expect.objectContaining({
        from: "user@example.com",
        to: ["Alice Example <alice@example.com>"],
        subject: "Re: Hello there",
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: Buffer.from("hello"),
          },
        ],
      })
    );
    await app.close();
  });
});
