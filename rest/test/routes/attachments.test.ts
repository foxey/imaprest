import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";

jest.mock("../../src/lib/imap");
jest.mock("mailparser");

import { simpleParser } from "mailparser";

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
};

const FAKE_ATTACHMENT = {
  filename: "report.pdf",
  contentType: "application/pdf",
  contentDisposition: "attachment",
  content: Buffer.from("pdf-content"),
};

describe("GET /mailboxes/:mailbox/messages/:uid/attachments/:index", () => {
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

    (simpleParser as unknown as jest.Mock).mockResolvedValue({
      attachments: [FAKE_ATTACHMENT],
    });
  });

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42/attachments/0",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 for a non-numeric UID", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/abc/attachments/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for UID of zero", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/0/attachments/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for a negative attachment index", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42/attachments/-1",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for a non-numeric attachment index", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42/attachments/abc",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when message is not found", async () => {
    async function* emptyMessages() {}
    mockClient.fetch.mockReturnValue(emptyMessages());

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/99/attachments/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "Message not found" });
    await app.close();
  });

  it("returns 404 when attachment index is out of range", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42/attachments/5",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "Attachment not found" });
    await app.close();
  });

  it("returns 200 with correct Content-Type header", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42/attachments/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    await app.close();
  });

  it("returns 200 with Content-Disposition header containing filename", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42/attachments/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="report.pdf"'
    );
    await app.close();
  });

  it("returns binary content matching the attachment data", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes/INBOX/messages/42/attachments/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(Buffer.from(response.rawPayload)).toEqual(
      Buffer.from("pdf-content")
    );
    await app.close();
  });
});
