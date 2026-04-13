# Implementation Plan: Move/Copy Messages & Search

## Overview

Implement move, copy, and search endpoints for the REST API, extend the search library with validation and new criteria fields, and add corresponding MCP tools. Each task builds incrementally — library extensions first, then routes, then MCP integration, with tests alongside each component.

## Tasks

- [x] 1. Extend search library with new fields and validation
  - [x] 1.1 Add `q`, `before` fields to `SearchParams` and `ImapSearchCriteria` interfaces, and update `buildSearchCriteria` to map `q` → `body` and `before` → `before` Date
    - Extend existing interfaces in `rest/src/lib/search.ts`
    - Add `body` field mapping for full-text search
    - Add `before` Date field mapping with ISO 8601 parsing and validation
    - _Requirements: 3.2, 3.6_

  - [x] 1.2 Implement `validateSearchParams()` in `rest/src/lib/search.ts`
    - Validate `since` and `before` are valid ISO 8601 date strings
    - Validate `since < before` when both are provided
    - Validate `limit` is a positive integer when provided
    - Validate at least one search criterion is present (`q`, `from`, `subject`, `since`, `before`, or `unseen`)
    - Export the function for use by the search route
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 1.3 Write property test: Search criteria building faithfulness
    - **Property 1: Search criteria building faithfulness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
    - Create `rest/test/lib/search.property.test.ts`
    - Generate random valid `SearchParams` objects with fast-check, verify `buildSearchCriteria` output maps each provided field correctly and contains no extra fields

  - [ ]* 1.4 Write property test: Invalid date strings are rejected
    - **Property 2: Invalid date strings are rejected**
    - **Validates: Requirements 4.1, 4.2**
    - Generate arbitrary non-date strings, verify `validateSearchParams` throws for `since` and `before`

  - [ ]* 1.5 Write property test: Invalid date ranges are rejected
    - **Property 3: Invalid date ranges are rejected**
    - **Validates: Requirements 4.3**
    - Generate date pairs where `since >= before`, verify `validateSearchParams` throws

  - [ ]* 1.6 Write property test: Invalid limit values are rejected
    - **Property 4: Invalid limit values are rejected**
    - **Validates: Requirements 4.4**
    - Generate non-positive-integer strings (negative, zero, floats, non-numeric), verify `validateSearchParams` throws

- [x] 2. Implement move and copy routes
  - [x] 2.1 Create `rest/src/routes/move-copy.ts` with move and copy POST handlers
    - Register `POST /mailboxes/:mailbox/messages/:uid/move` and `POST /mailboxes/:mailbox/messages/:uid/copy`
    - Extract credentials and IMAP config, validate UID, validate `destination` body field
    - Move handler: verify message exists, call `client.messageMove()`, extract new UID from `uidMap`, return `{ uid }`
    - Copy handler: verify message exists, call `client.messageCopy()`, extract new UID from `uidMap`, return `{ uid }`
    - Move-specific: reject when destination equals source mailbox
    - Catch ImapFlow errors for non-existent destination mailbox → 404
    - Disconnect IMAP client in `finally` block
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.1, 8.2, 8.3_

  - [x] 2.2 Register move-copy routes in `rest/src/app.ts`
    - Import `moveCopyRoutes` and register via `app.register()`
    - _Requirements: 1.1, 2.1_

  - [ ]* 2.3 Write unit tests for move endpoint in `rest/test/routes/move.test.ts`
    - Test 401 for missing credentials, 400 for invalid UID, 400 for missing destination, 400 for same source/destination, 404 for message not found, 404 for destination mailbox not found, 200 with new UID on success
    - Follow existing `buildApp()` + `app.inject()` + `jest.mock('../../src/lib/imap')` pattern
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.1, 8.2_

  - [ ]* 2.4 Write unit tests for copy endpoint in `rest/test/routes/copy.test.ts`
    - Test 401 for missing credentials, 400 for invalid UID, 400 for missing destination, 404 for message not found, 404 for destination mailbox not found, 200 with new UID on success
    - Follow existing test pattern
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.1, 8.2_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement search route
  - [x] 4.1 Create `rest/src/routes/search.ts` with GET handler
    - Register `GET /mailboxes/:mailbox/messages/search`
    - Extract credentials and IMAP config
    - Call `validateSearchParams()` for input validation (400 on failure)
    - Call `buildSearchCriteria()` to convert query params to IMAP criteria
    - Open mailbox, run `client.search(criteria, { uid: true })`
    - Sort UIDs descending, cap to `limit` (default 50)
    - Fetch envelope + flags for capped UIDs, build `MessageSummary[]`
    - Return results sorted by date descending
    - Disconnect IMAP client in `finally` block
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.2, 8.3_

  - [x] 4.2 Register search route in `rest/src/app.ts`
    - Import `searchRoutes` and register via `app.register()`
    - _Requirements: 3.1_

  - [ ]* 4.3 Write unit tests for search endpoint in `rest/test/routes/search.test.ts`
    - Test 401 for missing credentials, 400 for no criteria, 400 for invalid dates, 400 for invalid date range, 400 for invalid limit, 200 with message summaries, default limit of 50, results sorted by date descending, empty array when no matches
    - Follow existing test pattern
    - _Requirements: 3.1, 3.9, 3.10, 3.11, 3.12, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.4 Write property test: Search results sorted by date descending
    - **Property 5: Search results are sorted by date descending**
    - **Validates: Requirements 3.12**
    - Generate random `MessageSummary` arrays, pass through sorting logic, verify each consecutive pair has date <= preceding date
    - Add to `rest/test/lib/search.property.test.ts`

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add MCP tools for move, copy, and search
  - [x] 6.1 Add `move_message`, `copy_message`, and `search_messages` tool registrations in `mcp/src/app.ts`
    - `move_message(mailbox, uid, destination)` → `POST /mailboxes/:mailbox/messages/:uid/move` with `{ destination }` body, using IMAP headers
    - `copy_message(mailbox, uid, destination)` → `POST /mailboxes/:mailbox/messages/:uid/copy` with `{ destination }` body, using IMAP headers
    - `search_messages(mailbox, q?, from?, subject?, since?, before?, unseen?, limit?)` → `GET /mailboxes/:mailbox/messages/search?...` with query params, using IMAP headers
    - Follow existing `callImaprest()` → `{ content, isError }` pattern
    - Use zod schemas for parameter validation matching existing tool patterns
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

  - [ ]* 6.2 Write MCP tool tests for move_message, copy_message, and search_messages in `mcp/test/tools.test.ts`
    - Add test cases following existing pattern: mock `fetch`, invoke tool, verify correct HTTP method/URL/headers/body, verify response formatting and `isError` flag
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

- [x] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests target the pure functions in `rest/src/lib/search.ts` using fast-check
- Unit tests use the existing `buildApp()` + `app.inject()` + `jest.mock()` pattern
- MCP tests follow the existing `fetch` spy + in-memory transport pattern
