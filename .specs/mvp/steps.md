# imaprest — Implementation Steps

Each step targets a separate PR and leaves the application in a runnable, testable state.

---

## Step 1 — Project scaffold + `GET /health`

**Goal:** a compiling, linting, tested, containerised skeleton with a single live endpoint.

### Files
```
package.json
tsconfig.json
eslint.config.mjs
jest.config.ts
.github/workflows/ci.yml
Dockerfile
src/server.ts          # process entry point — binds PORT
src/app.ts             # Fastify app factory — registers plugins + routes
src/routes/health.ts   # GET /health → 200 { "status": "ok" }
test/routes/health.test.ts
```

### CI checks
`tsc --noEmit` · `eslint src` · `jest` · `npm audit --audit-level=high`

### Definition of done
```bash
docker build -t imaprest .
docker run --rm -p 3000:3000 imaprest
curl http://localhost:3000/health          # → {"status":"ok"}
```

---

## Step 2 — Credential middleware + `GET /mailboxes`

**Goal:** first real IMAP operation; validates that the credential injection model works end-to-end.

### Files added / modified
```
src/types/index.ts               # ImapCredentials, SmtpCredentials interfaces
src/middleware/credentials.ts    # onRequest hook — extracts & validates headers, attaches to request
src/services/imap.ts             # ImapFlow connection helper + listMailboxes()
src/routes/mailboxes.ts          # GET /mailboxes
test/middleware/credentials.test.ts
test/routes/mailboxes.test.ts    # mock ImapFlow
```

### Definition of done
```bash
curl -H "X-Mail-User: user@example.com"      -H "X-Mail-Password: secret"      -H "X-IMAP-Host: imap.example.com"      http://localhost:3000/mailboxes
# → 200 [{"path":"INBOX","delimiter":"/","flags":[]}, ...]

curl http://localhost:3000/mailboxes      # missing headers
# → 400 {"error":"Missing required header: X-Mail-User"}
```

---

## Step 3 — `GET /messages`

**Goal:** server-side IMAP `SEARCH` with filtering; never loads full message bodies.

### Files added / modified
```
src/services/imap.ts             # + searchMessages(creds, mailbox, filters, limit)
src/routes/messages.ts           # GET /messages
test/routes/messages.test.ts
```

### Query parameters
| Parameter  | Type    | Default   | IMAP mapping          |
|------------|---------|-----------|-----------------------|
| `mailbox`  | string  | `"INBOX"` | mailbox name          |
| `unseen`   | boolean | —         | `UNSEEN`              |
| `since`    | date    | —         | `SINCE DD-Mon-YYYY`   |
| `limit`    | integer | `50`      | slice of UID list     |

### Definition of done
```bash
curl -H "..."      "http://localhost:3000/messages?unseen=true&limit=10"
# → 200 [{"uid":42,"date":"2026-04-11T...","from":"...","subject":"...","seen":false,"size":1234}, ...]

curl -H "..."      "http://localhost:3000/messages?since=2026-04-01&limit=5"
# → 200 [...]
```

---

## Step 4 — `GET /messages/:uid`

**Goal:** full message fetch including plain-text, HTML, and attachment metadata (no body download for attachments).

### Files added / modified
```
src/services/imap.ts             # + fetchMessage(creds, mailbox, uid)
src/routes/messages.ts           # + GET /messages/:uid
test/routes/messages.test.ts     # + uid fetch cases
```

### Definition of done
```bash
curl -H "..." http://localhost:3000/messages/42
# → 200 {
#     "uid": 42,
#     "date": "2026-04-11T10:00:00Z",
#     "from": "Alice <alice@example.com>",
#     "to": ["me@example.com"],
#     "cc": [],
#     "subject": "Hello",
#     "text": "Hi there",
#     "html": "<p>Hi there</p>",
#     "attachments": [{"filename":"doc.pdf","contentType":"application/pdf","size":20480,"contentId":null}]
#   }

curl -H "..." http://localhost:3000/messages/99999
# → 404 {"error":"Message not found"}
```

---

## Step 5 — `PATCH /messages/:uid` + `DELETE /messages/:uid`

**Goal:** message state management — mark seen/unseen, delete.

### Files added / modified
```
src/services/imap.ts             # + setFlags(creds, mailbox, uid, flags)
                                 # + deleteMessage(creds, mailbox, uid)
src/routes/messages.ts           # + PATCH /messages/:uid
                                 # + DELETE /messages/:uid
test/routes/messages.test.ts     # + patch + delete cases
```

### Request body (`PATCH`)
```json
{ "seen": true }
```

### Definition of done
```bash
curl -X PATCH -H "..." -H "Content-Type: application/json"      -d '{"seen":true}'      http://localhost:3000/messages/42
# → 204 No Content

curl -X DELETE -H "..." http://localhost:3000/messages/42
# → 204 No Content

curl -X DELETE -H "..." http://localhost:3000/messages/42
# → 404 {"error":"Message not found"}
```

---

## Step 6 — `POST /send`

**Goal:** outbound email via SMTP; completes the full read-and-write API surface.

### Files added / modified
```
src/services/smtp.ts             # nodemailer transporter + sendMessage()
src/routes/send.ts               # POST /send
test/routes/send.test.ts
```

### Request body
```json
{
  "from":    "me@example.com",
  "to":      ["alice@example.com"],
  "cc":      [],
  "subject": "Hello",
  "text":    "Hi Alice",
  "html":    "<p>Hi Alice</p>"
}
```

### Definition of done
```bash
curl -X POST      -H "X-Mail-User: me@example.com"      -H "X-Mail-Password: secret"      -H "X-SMTP-Host: smtp.example.com"      -H "Content-Type: application/json"      -d '{"from":"me@example.com","to":["alice@example.com"],"subject":"Test","text":"Hi"}'      http://localhost:3000/send
# → 202 {"messageId":"<abc123@example.com>"}
```

After this step, all seven endpoints defined in `requirements.md` are implemented and the service is ready for integration with NanoClaw.
