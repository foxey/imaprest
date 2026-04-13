# Design — Move/Copy Messages & Search

## Overview

This feature adds three new capabilities to the imaprest REST API and MCP server:

1. **Move messages** between IMAP mailboxes via `POST /mailboxes/:mailbox/messages/:uid/move`
2. **Copy messages** between IMAP mailboxes via `POST /mailboxes/:mailbox/messages/:uid/copy`
3. **Search messages** with structured criteria via `GET /mailboxes/:mailbox/messages/search`

All three follow the existing stateless, per-request credential model. Each request creates a fresh ImapFlow client, performs the operation, and disconnects in a `finally` block. The MCP server gets three new tools (`move_message`, `copy_message`, `search_messages`) that proxy to these REST endpoints.

The move and copy operations delegate directly to ImapFlow's `messageMove` and `messageCopy` methods, which return a `CopyResponseObject` containing a `uidMap` (source UID → destination UID mapping). The search endpoint extends the existing `buildSearchCriteria` function in `rest/src/lib/search.ts` to support additional criteria (`q` for full-text, `subject`, `before`) and adds validation logic for date ranges and required parameters.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Fastify HTTP                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  /mailboxes/:mailbox/messages/:uid/move   POST        │  │
│  │  /mailboxes/:mailbox/messages/:uid/copy   POST        │  │
│  │  /mailboxes/:mailbox/messages/search      GET         │  │
│  └──────────────────────┬─────────────────────────────────┘  │
│                         │                                    │
│              ┌──────────┴──────────┐                         │
│              │   lib/search.ts     │  (query → IMAP criteria)│
│              │   lib/imap.ts       │  (client lifecycle)     │
│              │   lib/credentials.ts│  (header extraction)    │
│              └──────────┬──────────┘                         │
└─────────────────────────┼────────────────────────────────────┘
                          ▼
                     IMAP server
                  (messageMove / messageCopy / search + fetch)
```

The move and copy routes live in a new file `rest/src/routes/move-copy.ts` registered via `app.register()` in `app.ts`. The search route lives in a new file `rest/src/routes/search.ts`. This keeps the existing `messages.ts` file focused on CRUD + reply and avoids bloating it further.

The MCP server (`mcp/src/app.ts`) adds three new tool registrations that build the appropriate HTTP request and delegate to the REST API.

## Components and Interfaces

### New Route: `rest/src/routes/move-copy.ts`

Registers two POST endpoints that share the same credential extraction and UID validation pattern used by existing message routes.

```typescript
// POST /mailboxes/:mailbox/messages/:uid/move
// POST /mailboxes/:mailbox/messages/:uid/copy
interface MoveCopyParams {
  mailbox: string;
  uid: string;
}

interface MoveCopyBody {
  destination?: unknown;
}

// Success response for both move and copy
interface MoveCopyResponse {
  uid: number; // new UID in destination mailbox
}
```

**Move handler flow:**
1. Extract credentials + IMAP config (401 on failure)
2. Parse and validate UID (400 if invalid)
3. Validate `destination` in body (400 if missing/empty, 400 if same as source)
4. Create IMAP client → open source mailbox
5. Verify message exists via `client.search({ uid: String(uid) })` (404 if not found)
6. Call `client.messageMove([uid], destination, { uid: true })`
7. Extract new UID from `result.uidMap` → respond 200 `{ uid: newUid }`
8. Disconnect in `finally`

**Copy handler flow:**
Same as move, except:
- No check that destination differs from source (copying within the same mailbox is valid)
- Calls `client.messageCopy([uid], destination, { uid: true })`
- Original message remains in source mailbox

**Error handling for non-existent destination mailbox:**
ImapFlow throws an error when the destination mailbox doesn't exist. The route catches this and returns 404 with an appropriate message.

### New Route: `rest/src/routes/search.ts`

Registers a GET endpoint for structured search.

```typescript
// GET /mailboxes/:mailbox/messages/search
interface SearchQuerystring {
  q?: string;
  from?: string;
  subject?: string;
  since?: string;
  before?: string;
  unseen?: string;
  limit?: string;
}
```

**Search handler flow:**
1. Extract credentials + IMAP config (401 on failure)
2. Validate search parameters via `validateSearchParams()` (400 on failure)
3. Build IMAP search criteria via extended `buildSearchCriteria()`
4. Create IMAP client → open mailbox
5. `client.search(criteria, { uid: true })` → get matching UIDs
6. Sort UIDs descending (highest = newest), cap to `limit` (default 50)
7. Fetch envelope + flags for the capped UIDs
8. Return `MessageSummary[]` sorted by date descending
9. Disconnect in `finally`

### Extended `rest/src/lib/search.ts`

The existing `SearchParams` and `buildSearchCriteria` are extended:

```typescript
export interface SearchParams {
  q?: string;        // NEW — maps to ImapFlow's `body` criterion
  from?: string;
  subject?: string;  // NEW
  since?: string;
  before?: string;   // NEW — maps to ImapFlow's `before` criterion
  unseen?: string;
  limit?: string;
}

export interface ImapSearchCriteria {
  seen?: boolean;
  from?: string;
  subject?: string;  // NEW
  body?: string;     // NEW — full-text search via IMAP TEXT/BODY
  since?: Date;
  before?: Date;     // NEW
}
```

A new `validateSearchParams()` function is added to handle validation logic (date format, date range, limit, at-least-one-criterion) separately from criteria building. This keeps `buildSearchCriteria` focused on mapping params to IMAP criteria.

```typescript
export function validateSearchParams(params: SearchParams): void {
  // Validates: since/before are valid ISO 8601, since < before, 
  // limit is positive integer, at least one search criterion present
}
```

### MCP Tools (in `mcp/src/app.ts`)

Three new tool registrations following the existing pattern:

- `move_message(mailbox, uid, destination)` → `POST /mailboxes/:mailbox/messages/:uid/move`
- `copy_message(mailbox, uid, destination)` → `POST /mailboxes/:mailbox/messages/:uid/copy`
- `search_messages(mailbox, q?, from?, subject?, since?, before?, unseen?, limit?)` → `GET /mailboxes/:mailbox/messages/search?...`

Each tool follows the same `callImaprest()` → return `{ content, isError }` pattern as existing tools.

## Data Models

### Request/Response Shapes

**Move request:**
```
POST /mailboxes/INBOX/messages/42/move
Body: { "destination": "Archive" }
→ 200 { "uid": 108 }
```

**Copy request:**
```
POST /mailboxes/INBOX/messages/42/copy
Body: { "destination": "Important" }
→ 200 { "uid": 109 }
```

**Search request:**
```
GET /mailboxes/INBOX/messages/search?q=invoice&from=alice@example.com&since=2024-01-01&limit=20
→ 200 [
  { "uid": 55, "from": "alice@example.com", "subject": "Invoice #123", "date": "2024-06-15T10:00:00Z", "seen": true },
  ...
]
```

### ImapFlow `CopyResponseObject` (returned by `messageMove` / `messageCopy`)

```typescript
interface CopyResponseObject {
  path: string;           // destination mailbox path
  uidValidity: bigint;    // destination UIDVALIDITY
  uidMap: Map<number, number>; // source UID → destination UID
}
```

### `MessageSummary` (reused from existing messages route)

```typescript
interface MessageSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;    // ISO 8601
  seen: boolean;
}
```

### IMAP Search Criteria Mapping

| Query Parameter | ImapFlow SearchObject Field | Notes |
|---|---|---|
| `q` | `body` | Full-text search against message body content |
| `from` | `from` | Sender address substring match |
| `subject` | `subject` | Subject line substring match |
| `since` | `since` | Messages on or after this date |
| `before` | `before` | Messages before this date |
| `unseen=true` | `seen: false` | Unread messages only |


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The testable properties for this feature center on the pure functions in `rest/src/lib/search.ts` — specifically `buildSearchCriteria` and `validateSearchParams`. These are pure functions with a large input space (arbitrary string combinations for query params, dates, limits) that benefit from property-based testing. The route handlers and MCP tools are integration-level and tested with example-based tests using mocks.

### Property 1: Search criteria building faithfulness

*For any* valid combination of search parameters (q, from, subject, since, before, unseen), `buildSearchCriteria` SHALL produce an IMAP criteria object where every provided parameter maps to its corresponding field (`q` → `body`, `from` → `from`, `subject` → `subject`, `since` → `since` Date, `before` → `before` Date, `unseen=true` → `seen: false`), and no extra fields are present for parameters that were not provided.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

### Property 2: Invalid date strings are rejected

*For any* string that is not a valid ISO 8601 date, `validateSearchParams` SHALL throw a validation error when that string is provided as the `since` or `before` parameter.

**Validates: Requirements 4.1, 4.2**

### Property 3: Invalid date ranges are rejected

*For any* pair of valid dates where `since` is on or after `before`, `validateSearchParams` SHALL throw a validation error indicating the date range is invalid.

**Validates: Requirements 4.3**

### Property 4: Invalid limit values are rejected

*For any* string that is not a positive integer (e.g., negative numbers, zero, floats, non-numeric strings), `validateSearchParams` SHALL throw a validation error indicating the limit must be a positive integer.

**Validates: Requirements 4.4**

### Property 5: Search results are sorted by date descending

*For any* set of message summaries returned by the search endpoint, each consecutive pair of messages SHALL have a date that is less than or equal to the preceding message's date.

**Validates: Requirements 3.12**

## Error Handling

All new endpoints follow the existing error mapping pattern:

| Condition | HTTP Status | Error Message |
|---|---|---|
| Missing IMAP credential headers | 401 | `Missing required headers: ...` |
| Invalid UID (non-numeric, zero, negative) | 400 | `Invalid UID — must be a positive integer` |
| Missing/empty `destination` in move/copy body | 400 | `'destination' is required` |
| Source equals destination (move only) | 400 | `Source and destination mailbox must differ` |
| Message UID not found in source mailbox | 404 | `Message not found` |
| Destination mailbox not found | 404 | `Destination mailbox not found` |
| Invalid `since`/`before` date format | 400 | `Invalid 'since' parameter — must be ISO-8601` |
| `since` >= `before` | 400 | `Invalid date range — 'since' must be before 'before'` |
| Invalid `limit` | 400 | `'limit' must be a positive integer` |
| No search criteria provided | 400 | `At least one search criterion is required` |
| IMAP authentication failure | 401 | `Authentication failed` |
| IMAP connection failure | 502 | `Failed to connect to IMAP server` |

All error responses use the standard shape: `{ "error": "human-readable message" }`

**Destination mailbox detection:** When ImapFlow's `messageMove` or `messageCopy` throws due to a non-existent destination, the error message typically contains "TRYCREATE" or indicates the mailbox doesn't exist. The route handler catches these and maps them to 404.

## Testing Strategy

### Unit Tests (Example-Based)

Tests use the existing pattern: `buildApp()` + `app.inject()` with `jest.mock('../../src/lib/imap')`.

**New test files:**
- `rest/test/routes/move.test.ts` — move endpoint tests
- `rest/test/routes/copy.test.ts` — copy endpoint tests
- `rest/test/routes/search.test.ts` — search endpoint tests

**Move endpoint tests:**
- 401 when credential headers are missing
- 400 for invalid UID
- 400 when destination is missing/empty
- 400 when destination equals source mailbox
- 404 when message not found
- 404 when destination mailbox not found (mock messageMove to throw)
- 200 with new UID on success
- Verify `client.messageMove` called with correct args

**Copy endpoint tests:**
- 401 when credential headers are missing
- 400 for invalid UID
- 400 when destination is missing/empty
- 404 when message not found
- 404 when destination mailbox not found
- 200 with new UID on success
- Verify `client.messageCopy` called with correct args
- Verify original message is not deleted

**Search endpoint tests:**
- 401 when credential headers are missing
- 400 when no search criteria provided
- 400 for invalid date formats
- 400 for invalid date range
- 400 for invalid limit
- 200 with message summaries on success
- Verify correct IMAP search criteria passed to client
- Verify default limit of 50
- Verify results sorted by date descending
- Empty array when no matches

### Property-Based Tests

Property tests use [fast-check](https://github.com/dubzzz/fast-check) with Jest. Each test runs a minimum of 100 iterations.

**Test file:** `rest/test/lib/search.property.test.ts`

Tests target the pure functions `buildSearchCriteria` and `validateSearchParams` in `rest/src/lib/search.ts`.

Each property test is tagged with a comment:
```typescript
// Feature: move-copy-and-search, Property 1: Search criteria building faithfulness
```

**Property tests:**
1. **Criteria building faithfulness** — Generate random valid SearchParams objects, verify output criteria maps each provided field correctly and contains no extra fields
2. **Invalid date rejection** — Generate random non-date strings, verify validateSearchParams throws for since/before
3. **Invalid date range rejection** — Generate date pairs where since >= before, verify validateSearchParams throws
4. **Invalid limit rejection** — Generate non-positive-integer strings, verify validateSearchParams throws
5. **Date descending sort** — Generate random MessageSummary arrays, pass through the sorting logic, verify output is sorted by date descending

### MCP Tests

MCP tool tests follow the existing pattern in `mcp/test/tools.test.ts` — mock `fetch` globally, invoke tools, verify correct HTTP calls and response formatting. Add test cases for `move_message`, `copy_message`, and `search_messages`.
