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

describe("POST /mailboxes/:mailbox/messages/:uid/reply", () => {
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

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      payload: { text: "My reply" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 when X-SMTP-Host is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: {
        "x-mail-user": "user@example.com",
        "x-mail-password": "secret",
        "x-imap-host": "imap.example.com",
      },
      payload: { text: "My reply" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 for a non-numeric uid", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/notanumber/reply",
      headers: CRED_HEADERS,
      payload: { text: "My reply" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when neither text nor html is provided", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when original message is not found", async () => {
    async function* empty() {}
    mockClient.fetch.mockReturnValue(empty());

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/99/reply",
      headers: CRED_HEADERS,
      payload: { text: "My reply" },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 202 with queued:true on success", async () => {
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

  it("sets correct In-Reply-To and References headers", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: { text: "My reply" },
    });
    expect(smtpLib.sendMail).toHaveBeenCalledWith(
      { user: "user@example.com", password: "secret" },
      { host: "smtp.example.com", port: 587, tls: false },
      expect.objectContaining({
        from: "user@example.com",
        to: ["Alice Example <alice@example.com>"],
        subject: "Re: Hello there",
        inReplyTo: "<abc123@example.com>",
        references: ["<prev@example.com>", "<abc123@example.com>"],
      })
    );
    await app.close();
  });

  it("does not double-prefix Re: in subject", async () => {
    (parseLib.parseRawMessage as jest.Mock).mockResolvedValue({
      ...FAKE_ORIGINAL,
      subject: "Re: Hello there",
    });

    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: { text: "My reply" },
    });
    expect(smtpLib.sendMail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ subject: "Re: Hello there" })
    );
    await app.close();
  });

  it("handles message with no messageId gracefully", async () => {
    (parseLib.parseRawMessage as jest.Mock).mockResolvedValue({
      ...FAKE_ORIGINAL,
      messageId: null,
      references: [],
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/mailboxes/INBOX/messages/10/reply",
      headers: CRED_HEADERS,
      payload: { text: "My reply" },
    });
    expect(response.statusCode).toBe(202);
    expect(smtpLib.sendMail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        inReplyTo: null,
        references: [],
      })
    );
    await app.close();
  });
});
