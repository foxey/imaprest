import { hash } from "bcryptjs";
import { buildApp } from "../../src/app";
import { parseMessagePath } from "../../src/routes/messages";

jest.mock("../../src/auth/token-manager", () => ({
  getAccessToken: jest.fn().mockResolvedValue("mock-access-token"),
}));

const mockGraphGet = jest.fn();
const mockGraphPost = jest.fn();
const mockGraphPatch = jest.fn();
const mockGraphDelete = jest.fn();

jest.mock("../../src/graph/client", () => ({
  graphGet: (...args: unknown[]) => mockGraphGet(...args),
  graphPost: (...args: unknown[]) => mockGraphPost(...args),
  graphPatch: (...args: unknown[]) => mockGraphPatch(...args),
  graphDelete: (...args: unknown[]) => mockGraphDelete(...args),
}));

const VALID_PASSWORD = "test-password";

describe("parseMessagePath", () => {
  it("returns message for a bare ID", () => {
    expect(parseMessagePath("msg123")).toEqual({ type: "message", messageId: "msg123" });
  });

  it("returns message for a base64 ID with decoded slashes and equals", () => {
    // Simulates what find-my-way delivers after decoding %2F → /
    expect(parseMessagePath("ABC/DEF==")).toEqual({ type: "message", messageId: "ABC/DEF==" });
  });

  it("returns move for <id>/move", () => {
    expect(parseMessagePath("msg123/move")).toEqual({ type: "move", messageId: "msg123" });
  });

  it("returns move for base64 ID with slash + /move", () => {
    expect(parseMessagePath("ABC/DEF/move")).toEqual({ type: "move", messageId: "ABC/DEF" });
  });

  it("returns copy for <id>/copy", () => {
    expect(parseMessagePath("msg123/copy")).toEqual({ type: "copy", messageId: "msg123" });
  });

  it("returns attachments for <id>/attachments", () => {
    expect(parseMessagePath("msg123/attachments")).toEqual({
      type: "attachments",
      messageId: "msg123",
    });
  });

  it("returns attachment for <id>/attachments/<attachId>", () => {
    expect(parseMessagePath("msg123/attachments/att456")).toEqual({
      type: "attachment",
      messageId: "msg123",
      attachmentId: "att456",
    });
  });

  it("returns attachment when message ID contains decoded slashes", () => {
    expect(parseMessagePath("ABC/DEF/attachments/att456")).toEqual({
      type: "attachment",
      messageId: "ABC/DEF",
      attachmentId: "att456",
    });
  });
});

describe("Messages routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    process.env.SERVICE_PASSWORD_HASH = await hash(VALID_PASSWORD, 10);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({
    Authorization: `Basic ${Buffer.from(`:${VALID_PASSWORD}`).toString("base64")}`,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/msgraphrest/messages/msg1" });
    expect(res.statusCode).toBe(401);
  });

  // ── GET /messages/:id ───────────────────────────────────────────────────────

  describe("GET /msgraphrest/messages/:id", () => {
    it("returns a message for a simple ID", async () => {
      mockGraphGet.mockResolvedValue({ id: "msg1", subject: "Hello" });
      const res = await app.inject({
        method: "GET",
        url: "/msgraphrest/messages/msg1",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ id: "msg1" });
      expect(mockGraphGet).toHaveBeenCalledWith("/me/messages/msg1", "mock-access-token");
    });

    it("handles base64 message ID with encoded equals signs", async () => {
      // IDs like AAMkAGI2...== — the == is valid in a path segment
      const msgId = "AAMkAGI2==";
      mockGraphGet.mockResolvedValue({ id: msgId });
      const res = await app.inject({
        method: "GET",
        url: `/msgraphrest/messages/${msgId}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphGet).toHaveBeenCalledWith(
        `/me/messages/${encodeURIComponent(msgId)}`,
        "mock-access-token"
      );
    });

    it("handles base64 message ID with encoded slash (%2F)", async () => {
      // Microsoft Graph IDs can contain "/" — clients must URL-encode it as %2F.
      // find-my-way decodes %2F before routing, breaking named params; wildcard handles this.
      const rawId = "AAMkAGI2/base64==";
      const urlId = encodeURIComponent(rawId); // AAMkAGI2%2Fbase64%3D%3D
      mockGraphGet.mockResolvedValue({ id: rawId });
      const res = await app.inject({
        method: "GET",
        url: `/msgraphrest/messages/${urlId}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      // The decoded ID is re-encoded when calling Graph
      expect(mockGraphGet).toHaveBeenCalledWith(
        `/me/messages/${encodeURIComponent(rawId)}`,
        "mock-access-token"
      );
    });
  });

  // ── GET /messages/search ────────────────────────────────────────────────────

  describe("GET /msgraphrest/messages/search", () => {
    it("searches messages with the given query", async () => {
      mockGraphGet.mockResolvedValue({ value: [] });
      const res = await app.inject({
        method: "GET",
        url: "/msgraphrest/messages/search?q=invoice",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const callArg = mockGraphGet.mock.calls[0][0] as string;
      expect(callArg).toContain("invoice");
      expect(callArg).toContain("%24top=25");
    });
  });

  // ── GET /messages/:id/attachments ───────────────────────────────────────────

  describe("GET /msgraphrest/messages/:id/attachments", () => {
    it("lists attachments for a message", async () => {
      mockGraphGet.mockResolvedValue({ value: [{ id: "att1" }] });
      const res = await app.inject({
        method: "GET",
        url: "/msgraphrest/messages/msg1/attachments",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphGet).toHaveBeenCalledWith(
        "/me/messages/msg1/attachments",
        "mock-access-token"
      );
    });

    it("handles base64 ID with encoded slash in attachments route", async () => {
      const rawId = "ABC/DEF==";
      const urlId = encodeURIComponent(rawId);
      mockGraphGet.mockResolvedValue({ value: [] });
      const res = await app.inject({
        method: "GET",
        url: `/msgraphrest/messages/${urlId}/attachments`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphGet).toHaveBeenCalledWith(
        `/me/messages/${encodeURIComponent(rawId)}/attachments`,
        "mock-access-token"
      );
    });
  });

  // ── GET /messages/:id/attachments/:attachId ─────────────────────────────────

  describe("GET /msgraphrest/messages/:id/attachments/:attachId", () => {
    it("returns a specific attachment", async () => {
      mockGraphGet.mockResolvedValue({ id: "att1", name: "file.pdf" });
      const res = await app.inject({
        method: "GET",
        url: "/msgraphrest/messages/msg1/attachments/att1",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphGet).toHaveBeenCalledWith(
        "/me/messages/msg1/attachments/att1",
        "mock-access-token"
      );
    });
  });

  // ── POST /messages/:id/move ─────────────────────────────────────────────────

  describe("POST /msgraphrest/messages/:id/move", () => {
    it("moves a message to another folder", async () => {
      mockGraphPost.mockResolvedValue({ id: "msg1" });
      const res = await app.inject({
        method: "POST",
        url: "/msgraphrest/messages/msg1/move",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        payload: JSON.stringify({ destinationId: "inbox" }),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphPost).toHaveBeenCalledWith(
        "/me/messages/msg1/move",
        { destinationId: "inbox" },
        "mock-access-token"
      );
    });
  });

  // ── POST /messages/:id/copy ─────────────────────────────────────────────────

  describe("POST /msgraphrest/messages/:id/copy", () => {
    it("copies a message to another folder", async () => {
      mockGraphPost.mockResolvedValue({ id: "msg1-copy" });
      const res = await app.inject({
        method: "POST",
        url: "/msgraphrest/messages/msg1/copy",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        payload: JSON.stringify({ destinationId: "archive" }),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphPost).toHaveBeenCalledWith(
        "/me/messages/msg1/copy",
        { destinationId: "archive" },
        "mock-access-token"
      );
    });
  });

  // ── PATCH /messages/:id ─────────────────────────────────────────────────────

  describe("PATCH /msgraphrest/messages/:id", () => {
    it("marks a message as read", async () => {
      mockGraphPatch.mockResolvedValue({ id: "msg1", isRead: true });
      const res = await app.inject({
        method: "PATCH",
        url: "/msgraphrest/messages/msg1",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        payload: JSON.stringify({ isRead: true }),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphPatch).toHaveBeenCalledWith(
        "/me/messages/msg1",
        { isRead: true },
        "mock-access-token"
      );
    });

    it("handles base64 ID with encoded slash in PATCH (the original bug)", async () => {
      // This is the core regression test: before the wildcard fix, find-my-way would
      // decode %2F → "/" and the named param :messageId would not match, returning 404.
      const rawId = "AAMkAGI2/slashInId==";
      const urlId = encodeURIComponent(rawId);
      mockGraphPatch.mockResolvedValue({ id: rawId, isRead: true });
      const res = await app.inject({
        method: "PATCH",
        url: `/msgraphrest/messages/${urlId}`,
        headers: { ...authHeader(), "Content-Type": "application/json" },
        payload: JSON.stringify({ isRead: true }),
      });
      expect(res.statusCode).toBe(200);
      expect(mockGraphPatch).toHaveBeenCalledWith(
        `/me/messages/${encodeURIComponent(rawId)}`,
        { isRead: true },
        "mock-access-token"
      );
    });
  });

  // ── DELETE /messages/:id ────────────────────────────────────────────────────

  describe("DELETE /msgraphrest/messages/:id", () => {
    it("deletes a message and returns 204", async () => {
      mockGraphDelete.mockResolvedValue(undefined);
      const res = await app.inject({
        method: "DELETE",
        url: "/msgraphrest/messages/msg1",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(204);
      expect(mockGraphDelete).toHaveBeenCalledWith("/me/messages/msg1", "mock-access-token");
    });
  });

  // ── GET /mailboxes/:folderId/messages ───────────────────────────────────────

  describe("GET /msgraphrest/mailboxes/:folderId/messages", () => {
    it("lists messages in a folder with default top=25", async () => {
      mockGraphGet.mockResolvedValue({ value: [] });
      const res = await app.inject({
        method: "GET",
        url: "/msgraphrest/mailboxes/inbox/messages",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const callArg = mockGraphGet.mock.calls[0][0] as string;
      expect(callArg).toContain("/me/mailFolders/inbox/messages");
      expect(callArg).toContain("%24top=25");
    });

    it("forwards OData query params", async () => {
      mockGraphGet.mockResolvedValue({ value: [] });
      const res = await app.inject({
        method: "GET",
        url: "/msgraphrest/mailboxes/inbox/messages?$top=10&$filter=isRead+eq+false",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const callArg = mockGraphGet.mock.calls[0][0] as string;
      expect(callArg).toContain("isRead");
    });
  });

  // ── GET /conversations/:id/messages ─────────────────────────────────────────

  describe("GET /msgraphrest/conversations/:conversationId/messages", () => {
    it("fetches all messages in a conversation", async () => {
      mockGraphGet.mockResolvedValue({ value: [] });
      const res = await app.inject({
        method: "GET",
        url: "/msgraphrest/conversations/conv123/messages",
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const callArg = mockGraphGet.mock.calls[0][0] as string;
      expect(callArg).toContain("conversationId");
      expect(callArg).toContain("conv123");
    });
  });
});
