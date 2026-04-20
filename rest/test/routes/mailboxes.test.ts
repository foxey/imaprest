import { buildApp } from "../../src/app";
import * as imapLib from "../../src/lib/imap";

jest.mock("../../src/lib/imap");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-imap-host": "imap.example.com",
};

describe("GET /mailboxes", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const fakeEntries = [
      {
        path: "INBOX",
        name: "INBOX",
        delimiter: "/",
        flags: new Set<string>(["\\HasNoChildren"]),
        subscribed: true,
      },
      {
        path: "Sent",
        name: "Sent",
        delimiter: "/",
        flags: new Set<string>(["\\HasNoChildren"]),
        subscribed: true,
      },
    ];

    const mockClient = { list: jest.fn().mockResolvedValue(fakeEntries) };
    (imapLib.createImapClient as jest.Mock).mockResolvedValue(mockClient);
    (imapLib.disconnectImapClient as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when all credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/imaprest/mailboxes" });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({ error: expect.any(String) });
    await app.close();
  });

  it("returns 401 when X-IMAP-Host is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes",
      headers: { "x-mail-user": "user@example.com", "x-mail-password": "secret" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with mailbox array when credentials are present", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/imaprest/mailboxes",
      headers: CRED_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      path: "INBOX",
      name: "INBOX",
      delimiter: "/",
      flags: expect.arrayContaining(["\\HasNoChildren"]),
      subscribed: true,
    });
    await app.close();
  });
});

