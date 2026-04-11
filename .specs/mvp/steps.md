# imaprest — implementation steps

Status legend: ⬜ not started · 🔄 in progress · 👀 in review · ✅ done

---

## Step 1 — project scaffold ✅ done

**Goal**: Establish the repo skeleton so CI passes on an empty but well-formed project.

**Files**
- `package.json` — deps, scripts
- `tsconfig.json` + `tsconfig.build.json`
- `eslint.config.mjs`
- `jest.config.ts`
- `.github/workflows/ci.yml`
- `Dockerfile` (multi-stage)
- `src/server.ts` — entry point, reads `PORT`
- `src/app.ts` — `buildApp()` factory, registers routes, redacts password header in logs
- `src/routes/health.ts` — `GET /health → 200 { status: "ok" }`
- `test/routes/health.test.ts` — uses `app.inject()`

**Definition of done**
- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes (health route test)
- `npm run build` produces `dist/`
- CI workflow green on push
- `curl http://localhost:3000/health` → `{"status":"ok"}`

---

## Step 2 — credential middleware + `GET /mailboxes` ✅ done

**Goal**: Validate credential headers on every request and list IMAP mailboxes.

**Files**
- `src/lib/credentials.ts` — extract + validate `X-Mail-*` / `X-IMAP-*` headers, return typed object or throw `401`
- `src/lib/imap.ts` — thin wrapper: `connect(creds)` → `ImapClient`, `disconnect(client)`
- `src/routes/mailboxes.ts` — `GET /mailboxes` → lists all mailboxes via IMAP `LIST "" "*"`
- `test/routes/mailboxes.test.ts` — mock `src/lib/imap.ts`, assert shape + 401 on missing creds

**Definition of done**
- Missing / malformed credential headers → `401 { error: "..." }`
- Valid creds + live IMAP → array of mailbox objects
- Unit tests pass (imap lib mocked)

---

## Step 3 — `GET /mailboxes/:mailbox/messages` ✅ done

**Goal**: List messages in a mailbox with optional filters.

**Files**
- `src/routes/messages.ts` — `GET /mailboxes/:mailbox/messages`
  - query params: `?unseen=true`, `?from=`, `?subject=`, `?since=` (ISO-8601)
  - returns array of message summaries (uid, from, subject, date, seen)
- `src/lib/search.ts` — build IMAP SEARCH criteria from query params
- `test/routes/messages.test.ts`

**Definition of done**
- No filters → all messages in mailbox
- Filter combos produce correct IMAP SEARCH criteria
- Unit tests pass

---

## Step 4 — `GET /mailboxes/:mailbox/messages/:uid` ✅ done

**Goal**: Fetch a single message with headers + body.

**Files**
- extend `src/routes/messages.ts` — `GET /mailboxes/:mailbox/messages/:uid`
  - returns `{ uid, from, to, subject, date, text, html, attachments[] }`
- `src/lib/parse.ts` — parse raw RFC 822 message into structured object
- `test/routes/message.test.ts`

**Definition of done**
- Plain-text, HTML, and mixed messages all parsed correctly
- Attachments list includes filename + content-type (no body)
- Unit tests pass

---

## Step 5 — `POST /send`, `POST /mailboxes/:mailbox/messages/:uid/reply` ✅ done

**Goal**: Send new messages and reply to existing ones.

**Files**
- `src/lib/smtp.ts` — `sendMail(creds, mail)` via SMTP
- `src/routes/send.ts` — `POST /send` → compose + send
- extend `src/routes/messages.ts` — `POST …/:uid/reply` → fetch original, build reply, send
- `test/routes/send.test.ts`, `test/routes/reply.test.ts`

**Definition of done**
- `POST /send` with valid body → `202 { queued: true }`
- Reply sets correct `In-Reply-To` and `References` headers
- Missing required fields → `400`
- Unit tests pass (SMTP mocked)

---

## Step 6 — `DELETE /mailboxes/:mailbox/messages/:uid`, `PATCH …/:uid` ✅ done

**Goal**: Move messages to Trash and toggle the \Seen flag.

**Files**
- extend `src/routes/messages.ts`
  - `DELETE …/:uid` → move to Trash mailbox
  - `PATCH …/:uid` — body `{ seen: boolean }` → set/clear `\Seen` flag
- `test/routes/delete.test.ts`, `test/routes/patch.test.ts`

**Definition of done**
- `DELETE` moves message to Trash (IMAP MOVE or COPY+EXPUNGE)
- `PATCH { seen: true }` sets `\Seen`; `{ seen: false }` clears it
- `404` if uid not found
- Unit tests pass