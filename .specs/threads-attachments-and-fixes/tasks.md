# Implementation Plan: Threads, Attachments, Sort Order & HTML Body Fix

## Overview

Implements five capabilities: thread retrieval (native IMAP THREAD + fallback), attachment download, send/reply with attachments, ascending sort for list/search, and HTML-only body fix. Changes flow from lib layer → routes → MCP tools → tests, ensuring each step builds on the previous.

## Tasks

- [x] 1. Lib layer: HTML fallback, sort validation, attachment validation, and pagination sort support
  - [x] 1.1 Add `htmlToMarkdown` function and HTML fallback to `rest/src/lib/parse.ts`
    - Add a `htmlToMarkdown(html: string): string` function that converts HTML to markdown-flavoured plain text using regex replacements (headings, bold, italic, links, lists, blockquotes, code, entities)
    - Update `parseRawMessage` so that when `parsed.text` is undefined/null but `parsed.html` is a string, the `text` field is set to `htmlToMarkdown(parsed.html)` instead of `null`
    - The `html` field must remain unchanged regardless of fallback
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 1.2 Add `validateSortParam` and `validateAttachments` to `rest/src/lib/validate.ts`
    - Export `validateSortParam(sort?: string): 'asc' | 'desc'` — returns `'desc'` when omitted, throws on values other than `asc`/`desc`
    - Export `validateAttachments(attachments: unknown): ValidatedAttachment[]` — validates each object has `filename` (string), `contentType` (string), `content` (valid base64 string); decodes content to Buffer; throws descriptive errors for missing fields or invalid base64
    - Export the `ValidatedAttachment` interface: `{ filename: string; contentType: string; content: Buffer }`
    - _Requirements: 5.2, 5.3, 5.6, 7.4_

  - [x] 1.3 Extend `paginateUids` in `rest/src/lib/paginate.ts` with sort parameter
    - Add optional `sort?: 'asc' | 'desc'` parameter (default `'desc'`) to `paginateUids`
    - When `sort === 'asc'`: sort UIDs ascending, `nextCursor` = last (highest) UID on the page, `hasMore` = true if more UIDs exist beyond the page
    - Add `buildUidRangeCriteriaAsc(cursor: number | undefined): { uid?: string }` — with cursor C returns `{ uid: '${C+1}:*' }`, without cursor returns empty object
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [x] 1.4 Extend `MailOptions` and `sendMail` in `rest/src/lib/smtp.ts` with attachments
    - Add `MailAttachment` interface: `{ filename: string; contentType: string; content: Buffer }`
    - Add optional `attachments?: MailAttachment[]` to `MailOptions`
    - Map `MailAttachment[]` to nodemailer's attachment format in `sendMail`
    - _Requirements: 5.1, 5.4_

- [x] 2. Lib layer: Thread resolution module
  - [x] 2.1 Create `rest/src/lib/thread.ts`
    - Export `supportsThreadExtension(client: ImapFlow): boolean` — checks `client.capabilities` for `THREAD=REFERENCES`
    - Export `resolveThreadNative(client: ImapFlow, messageId: string): Promise<number[]>` — uses `client.exec('UID THREAD', ...)` to find all UIDs in the same thread as the seed message
    - Export `resolveThreadByHeaders(client: ImapFlow, messageId: string): Promise<number[]>` — iterative header-walking fallback using Message-ID, In-Reply-To, References
    - Export `getThread(client: ImapFlow, messageId: string, log: FastifyBaseLogger): Promise<ThreadMessage[]>` — tries native first (with try/catch fallback), fetches envelopes+flags, returns sorted chronologically
    - Export `ThreadMessage` interface: `{ uid, from, subject, date, seen }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Routes: Thread and attachment endpoints
  - [x] 4.1 Create `rest/src/routes/thread.ts`
    - Register `GET /mailboxes/:mailbox/thread/:messageId`
    - Extract credentials + IMAP config (401 on failure)
    - URL-decode `messageId` parameter
    - Create IMAP client, open mailbox, call `getThread(client, messageId, request.log)`
    - Return thread messages array (200, already sorted chronologically)
    - Disconnect in `finally`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 4.2 Create `rest/src/routes/attachments.ts`
    - Register `GET /mailboxes/:mailbox/messages/:uid/attachments/:index`
    - Extract credentials + IMAP config (401 on failure)
    - Validate UID (positive integer, 400) and index (non-negative integer, 400)
    - Fetch message source, parse with `simpleParser`, filter attachments (same logic as `parseRawMessage`)
    - If message not found → 404; if index out of range → 404
    - Set `Content-Type` and `Content-Disposition: attachment; filename="<filename>"` headers
    - Return binary content
    - Disconnect in `finally`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.3 Register new routes in `rest/src/app.ts`
    - Import and register `threadRoutes` and `attachmentRoutes`
    - _Requirements: 1.1, 3.1_

- [x] 5. Routes: Attachments on send and reply, sort on list and search
  - [x] 5.1 Add attachment support to `rest/src/routes/send.ts`
    - Add optional `attachments` field to `SendBody`
    - After existing validation, if `attachments` is present and non-empty, validate with `validateAttachments`
    - Pass validated attachments to `sendMail`
    - When `attachments` is omitted or empty, preserve current behaviour
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 5.2 Add attachment support to the reply handler in `rest/src/routes/messages.ts`
    - Add optional `attachments` field to `ReplyBody`
    - After existing validation, if `attachments` is present and non-empty, validate with `validateAttachments`
    - Pass validated attachments to `sendMail`
    - _Requirements: 5.4, 5.5, 5.6_

  - [x] 5.3 Add sort parameter to the list handler in `rest/src/routes/messages.ts`
    - Extract `sort` from query params, validate with `validateSortParam`
    - Pass sort direction to `paginateUids`
    - When `sort === 'asc'`, use `buildUidRangeCriteriaAsc` instead of `buildUidRangeCriteria` for cursor logic
    - _Requirements: 7.1, 7.3, 7.5_

  - [x] 5.4 Add sort parameter to `rest/src/routes/search.ts`
    - Extract `sort` from query params, validate with `validateSortParam`
    - Pass sort direction to `paginateUids`
    - When `sort === 'asc'`, adjust cursor UID range for ascending order
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. MCP tools: New and modified tools
  - [x] 7.1 Add `get_thread` tool to `mcp/src/app.ts`
    - Accepts `mailbox` (string) and `messageId` (string)
    - Delegates to `GET /mailboxes/:mailbox/thread/:messageId` (URL-encode messageId)
    - Returns response as text content block, sets `isError` on status >= 400
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.2 Add `download_attachment` tool to `mcp/src/app.ts`
    - Accepts `mailbox` (string), `uid` (number), `index` (number)
    - Delegates to `GET /mailboxes/:mailbox/messages/:uid/attachments/:index`
    - Encodes binary response as base64 text content
    - Sets `isError` on status >= 400
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 7.3 Add optional `attachments` parameter to `send_email` and `reply_to_message` tools in `mcp/src/app.ts`
    - `attachments`: optional array of `{ filename: string, contentType: string, content: string }` objects
    - When provided, include in the forwarded request body
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.4 Add optional `sort` parameter to `list_messages` and `search_messages` tools in `mcp/src/app.ts`
    - `sort`: optional enum `asc` | `desc`
    - Forward as query parameter when provided
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Unit tests for new routes
  - [x] 9.1 Write unit tests for thread endpoint (`rest/test/routes/thread.test.ts`)
    - 401 without credentials
    - 200 with empty array when Message-ID not found
    - 200 with thread messages sorted chronologically (native THREAD path)
    - 200 with thread messages sorted chronologically (fallback header-walking path)
    - Verify native path used when THREAD=REFERENCES capability present
    - Verify fallback path used when THREAD=REFERENCES absent
    - Response shape matches ThreadMessageSummary
    - 502 on IMAP connection failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 9.2 Write unit tests for attachment download (`rest/test/routes/attachments.test.ts`)
    - 401 without credentials
    - 400 for invalid UID
    - 400 for invalid attachment index (negative, non-numeric)
    - 404 for message not found
    - 404 for attachment index out of range
    - 200 with correct Content-Type and Content-Disposition headers
    - Binary content matches attachment data
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 9.3 Write unit tests for send with attachments (`rest/test/routes/send-attachments.test.ts`)
    - 202 with valid attachments
    - 400 for missing attachment fields
    - 400 for invalid base64 content
    - 202 without attachments (backward compatibility)
    - Verify sendMail called with decoded attachment buffers
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 9.4 Write unit tests for reply with attachments (`rest/test/routes/reply-attachments.test.ts`)
    - Same test cases as send-attachments applied to the reply endpoint
    - _Requirements: 5.4, 5.5, 5.6_

  - [x] 9.5 Write unit tests for sort on list endpoint (`rest/test/routes/messages-sort.test.ts`)
    - Messages returned in ascending order with sort=asc
    - Messages returned in descending order with sort=desc
    - Default descending when sort omitted
    - 400 for invalid sort value
    - Ascending pagination with cursor
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

  - [x] 9.6 Write unit tests for sort on search endpoint (`rest/test/routes/search-sort.test.ts`)
    - Same sort test cases as messages-sort
    - _Requirements: 7.2, 7.3, 7.4_

- [ ] 10. Property-based tests
  - [ ]* 10.1 Write property tests for pagination sort (`rest/test/lib/paginate-sort.property.test.ts`)
    - **Property 6: Sort direction controls UID ordering in pagination**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - **Property 8: Ascending pagination cursor walks forward through UIDs**
    - **Validates: Requirements 7.5**

  - [ ]* 10.2 Write property tests for sort validation (`rest/test/lib/validate-sort.property.test.ts`)
    - **Property 7: Invalid sort parameter is rejected**
    - **Validates: Requirements 7.4**

  - [ ]* 10.3 Write property tests for attachment validation (`rest/test/lib/validate-attachments.property.test.ts`)
    - **Property 4: Attachment validation rejects incomplete or invalid objects**
    - **Validates: Requirements 5.3, 5.6**
    - **Property 5: All provided attachments are forwarded to sendMail**
    - **Validates: Requirements 5.1, 5.4**

  - [ ]* 10.4 Write property tests for HTML fallback (`rest/test/lib/parse-html.property.test.ts`)
    - **Property 9: HTML fallback produces markdown text while preserving the html field**
    - **Validates: Requirements 9.1, 9.4, 9.5**
    - **Property 10: Existing text part is preserved when present**
    - **Validates: Requirements 9.2**

  - [ ]* 10.5 Write property tests for thread resolution (`rest/test/lib/thread.property.test.ts`)
    - **Property 1: Thread resolution collects all related messages**
    - **Validates: Requirements 1.1**
    - **Property 2: Thread messages are sorted chronologically**
    - **Validates: Requirements 1.2**

  - [ ]* 10.6 Write property test for invalid attachment index (`rest/test/lib/validate-attachment-index.property.test.ts`)
    - **Property 3: Invalid attachment index is rejected**
    - **Validates: Requirements 3.5**

- [x] 11. MCP tool tests
  - [x] 11.1 Add MCP tool tests to `mcp/test/tools.test.ts`
    - `get_thread` — verify correct URL construction, method, and error handling
    - `download_attachment` — verify URL, base64 encoding of response
    - `send_email` with attachments — verify attachments included in request body
    - `reply_to_message` with attachments — verify attachments included in request body
    - `list_messages` with sort — verify sort query parameter forwarded
    - `search_messages` with sort — verify sort query parameter forwarded
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 8.1, 8.2, 8.3_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases using Jest + app.inject()
- Lib-layer pure functions (paginate, validate, parse, thread) are tested independently of HTTP
