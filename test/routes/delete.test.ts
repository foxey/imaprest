import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";

jest.mock("../../src/lib/imap");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
  "x-smtp-host": "smtp.example.com",
};

describe("DELETE /mailboxes/:mailbox/messages/:uid", () => {
  let mockClient: {
    mailboxOpen: jest.Mock;
    search: jest.Mock;
    messageMove: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([10]),
      messageMove: jest.fn().mockResolvedValue({ uidMap: new Map([[10, 11]]) }),
    };

    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/mailboxes/INBOX/messages/10",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 for a non-numeric uid", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/mailboxes/INBOX/messages/notanumber",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for uid zero", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/mailboxes/INBOX/messages/0",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when message is not found", async () => {
    mockClient.search.mockResolvedValue([]);

    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/mailboxes/INBOX/messages/99",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 204 on success", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    await app.close();
  });

  it("calls messageMove with Trash destination and uid option", async () => {
    const app = await buildApp();
    await app.inject({
      method: "DELETE",
      url: "/mailboxes/INBOX/messages/10",
      headers: CRED_HEADERS,
    });
    expect(mockClient.messageMove).toHaveBeenCalledWith([10], "Trash", { uid: true });
    await app.close();
  });

  it("opens the correct mailbox", async () => {
    const app = await buildApp();
    await app.inject({
      method: "DELETE",
      url: "/mailboxes/Sent/messages/10",
      headers: CRED_HEADERS,
    });
    expect(mockClient.mailboxOpen).toHaveBeenCalledWith("Sent");
    await app.close();
  });
});
