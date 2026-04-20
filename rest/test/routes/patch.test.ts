import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";

jest.mock("../../src/lib/imap");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
  "x-smtp-host": "smtp.example.com",
};

describe("PATCH /mailboxes/:mailbox/messages/:uid", () => {
  let mockClient: {
    mailboxOpen: jest.Mock;
    search: jest.Mock;
    messageFlagsAdd: jest.Mock;
    messageFlagsRemove: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([10]),
      messageFlagsAdd: jest.fn().mockResolvedValue(true),
      messageFlagsRemove: jest.fn().mockResolvedValue(true),
    };

    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/10",
      payload: { seen: true },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 for a non-numeric uid", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/notanumber",
      headers: CRED_HEADERS,
      payload: { seen: true },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when seen is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when seen is not a boolean", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
      payload: { seen: "yes" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when message is not found", async () => {
    mockClient.search.mockResolvedValue([]);

    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/99",
      headers: CRED_HEADERS,
      payload: { seen: true },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 200 with { uid, seen: true } when marking as seen", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
      payload: { seen: true },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ uid: 10, seen: true });
    await app.close();
  });

  it("returns 200 with { uid, seen: false } when marking as unseen", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
      payload: { seen: false },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ uid: 10, seen: false });
    await app.close();
  });

  it("calls messageFlagsAdd with \\Seen when seen=true", async () => {
    const app = await buildApp();
    await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
      payload: { seen: true },
    });
    expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith([10], ["\\Seen"], { uid: true });
    expect(mockClient.messageFlagsRemove).not.toHaveBeenCalled();
    await app.close();
  });

  it("calls messageFlagsRemove with \\Seen when seen=false", async () => {
    const app = await buildApp();
    await app.inject({
      method: "PATCH",
      url: "/imaprest/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
      payload: { seen: false },
    });
    expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith([10], ["\\Seen"], { uid: true });
    expect(mockClient.messageFlagsAdd).not.toHaveBeenCalled();
    await app.close();
  });
});
