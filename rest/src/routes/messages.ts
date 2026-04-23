import { FastifyInstance, FastifyRequest } from "fastify";
import { getAccessToken } from "../auth/token-manager";
import { graphGet, graphPost, graphPatch, graphDelete } from "../graph/client";

interface FolderParams {
  folderId: string;
}

interface WildcardParams {
  "*": string;
}

interface ListMessagesQuery {
  $top?: string;
  $skip?: string;
  $filter?: string;
  $search?: string;
  $orderby?: string;
  $select?: string;
}

interface MoveBody {
  destinationId: string;
}

type MessagePathResult =
  | { type: "message"; messageId: string }
  | { type: "attachments"; messageId: string }
  | { type: "attachment"; messageId: string; attachmentId: string }
  | { type: "move"; messageId: string }
  | { type: "copy"; messageId: string };

/**
 * Parse the wildcard portion of a /messages/* route.
 *
 * Fastify / find-my-way decodes %2F to "/" before routing, which breaks named
 * params for Microsoft Graph message IDs that contain "/" when URL-encoded.
 * A single wildcard route captures the entire sub-path, letting us dispatch here.
 *
 * Recognised patterns (checked in order):
 *   <id>/move            → { type: "move" }
 *   <id>/copy            → { type: "copy" }
 *   <id>/attachments     → { type: "attachments" }
 *   <id>/attachments/<a> → { type: "attachment" }
 *   <id>                 → { type: "message" }
 */
export function parseMessagePath(raw: string): MessagePathResult {
  if (raw.endsWith("/move")) return { type: "move", messageId: raw.slice(0, -5) };
  if (raw.endsWith("/copy")) return { type: "copy", messageId: raw.slice(0, -5) };
  if (raw.endsWith("/attachments")) return { type: "attachments", messageId: raw.slice(0, -12) };
  const attachIdx = raw.lastIndexOf("/attachments/");
  if (attachIdx !== -1) {
    return {
      type: "attachment",
      messageId: raw.slice(0, attachIdx),
      attachmentId: raw.slice(attachIdx + 13),
    };
  }
  return { type: "message", messageId: raw };
}

function getPassword(request: FastifyRequest): string {
  return (request as FastifyRequest & { servicePassword: string }).servicePassword;
}

export async function messagesRoutes(app: FastifyInstance): Promise<void> {
  // List messages in a folder
  app.get<{ Params: FolderParams; Querystring: ListMessagesQuery }>(
    "/mailboxes/:folderId/messages",
    async (request, reply) => {
      const accessToken = await getAccessToken(getPassword(request));
      const { folderId } = request.params;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(request.query)) {
        if (v !== undefined) params.set(k, v);
      }
      if (!params.has("$top")) params.set("$top", "25");
      const qs = params.toString();
      const data = await graphGet(
        `/me/mailFolders/${folderId}/messages${qs ? `?${qs}` : ""}`,
        accessToken
      );
      return reply.send(data);
    }
  );

  // Get conversation thread (all messages in a conversation)
  app.get<{ Params: { conversationId: string } }>(
    "/conversations/:conversationId/messages",
    async (request, reply) => {
      const accessToken = await getAccessToken(getPassword(request));
      const data = await graphGet(
        `/me/messages?$filter=conversationId eq '${encodeURIComponent(request.params.conversationId)}'&$orderby=receivedDateTime asc`,
        accessToken
      );
      return reply.send(data);
    }
  );

  // Search messages — static route registered before wildcard so find-my-way gives it priority
  app.get<{ Querystring: { q: string; $top?: string } }>(
    "/messages/search",
    async (request, reply) => {
      const accessToken = await getAccessToken(getPassword(request));
      const params = new URLSearchParams({
        $search: `"${request.query.q}"`,
        $top: request.query.$top ?? "25",
      });
      const data = await graphGet(`/me/messages?${params.toString()}`, accessToken);
      return reply.send(data);
    }
  );

  // GET /messages/* — get message, list attachments, or get a specific attachment.
  // Using a wildcard instead of named params (:messageId) so that base64 message IDs
  // containing "%" or "/" (decoded from %2F by find-my-way before route matching) are
  // captured correctly. The extracted ID is re-encoded with encodeURIComponent before
  // being forwarded to the Graph API.
  app.get<{ Params: WildcardParams }>(
    "/messages/*",
    async (request, reply) => {
      const accessToken = await getAccessToken(getPassword(request));
      const parsed = parseMessagePath(request.params["*"]);

      if (parsed.type === "message") {
        const data = await graphGet(
          `/me/messages/${encodeURIComponent(parsed.messageId)}`,
          accessToken
        );
        return reply.send(data);
      }

      if (parsed.type === "attachments") {
        const data = await graphGet(
          `/me/messages/${encodeURIComponent(parsed.messageId)}/attachments`,
          accessToken
        );
        return reply.send(data);
      }

      if (parsed.type === "attachment") {
        const data = await graphGet(
          `/me/messages/${encodeURIComponent(parsed.messageId)}/attachments/${encodeURIComponent(parsed.attachmentId)}`,
          accessToken
        );
        return reply.send(data);
      }

      return reply.status(404).send({ error: "Not found" });
    }
  );

  // POST /messages/* — move or copy a message
  app.post<{ Params: WildcardParams; Body: MoveBody }>(
    "/messages/*",
    async (request, reply) => {
      const accessToken = await getAccessToken(getPassword(request));
      const parsed = parseMessagePath(request.params["*"]);

      if (parsed.type === "move") {
        const data = await graphPost(
          `/me/messages/${encodeURIComponent(parsed.messageId)}/move`,
          { destinationId: request.body.destinationId },
          accessToken
        );
        return reply.send(data);
      }

      if (parsed.type === "copy") {
        const data = await graphPost(
          `/me/messages/${encodeURIComponent(parsed.messageId)}/copy`,
          { destinationId: request.body.destinationId },
          accessToken
        );
        return reply.send(data);
      }

      return reply.status(404).send({ error: "Not found" });
    }
  );

  // PATCH /messages/* — update a message (e.g. mark as read/unread)
  app.patch<{ Params: WildcardParams; Body: Record<string, unknown> }>(
    "/messages/*",
    async (request, reply) => {
      const accessToken = await getAccessToken(getPassword(request));
      const parsed = parseMessagePath(request.params["*"]);

      if (parsed.type !== "message") {
        return reply.status(404).send({ error: "Not found" });
      }

      const data = await graphPatch(
        `/me/messages/${encodeURIComponent(parsed.messageId)}`,
        request.body,
        accessToken
      );
      return reply.send(data);
    }
  );

  // DELETE /messages/* — delete a message
  app.delete<{ Params: WildcardParams }>(
    "/messages/*",
    async (request, reply) => {
      const accessToken = await getAccessToken(getPassword(request));
      const parsed = parseMessagePath(request.params["*"]);

      if (parsed.type !== "message") {
        return reply.status(404).send({ error: "Not found" });
      }

      await graphDelete(
        `/me/messages/${encodeURIComponent(parsed.messageId)}`,
        accessToken
      );
      return reply.status(204).send();
    }
  );
}
