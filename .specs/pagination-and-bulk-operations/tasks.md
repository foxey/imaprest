# Tasks — Paginated Listing & Bulk Operations

- [x] 1. Create pagination and validation utilities
  - [x] 1.1 Create `rest/src/lib/paginate.ts`
    - Export `paginateUids(uids, limit)` — sorts descending, applies +1 overfetch logic, returns `{ uids, nextCursor, hasMore }`
    - Export `buildUidRangeCriteria(cursor, limit, uidNext)` — builds tight UID range for IMAP search
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 3.1, 3.3, 3.4_

  - [x] 1.2 Create `rest/src/lib/validate.ts`
    - Export `validatePaginationParams(cursor?, limit?)` — parses and validates cursor/limit, defaults limit to 50, caps at 100
    - Export `validateUidArray(uids)` — validates non-empty array of positive integers, max 100 entries
    - _Requirements: 2.1, 2.2, 2.3, 4.3, 4.4, 5.3, 5.4, 10.3, 10.4, 11.3, 11.4_

  - [x] 1.3 Install `fast-check` as a dev dependency in `rest/`
    - _Supports property-based testing for correctness properties_

  - [ ]* 1.4 Write property tests for validation logic (`rest/test/lib/validate.property.test.ts`)
    - **Property 4: Invalid pagination parameters are rejected**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - **Property 5: Invalid UID arrays are rejected**
    - **Validates: Requirements 4.3, 4.4, 5.3, 5.4, 10.3, 10.4, 11.3, 11.4**

- [x] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Add pagination to message listing endpoint
  - [x] 3.1 Update `rest/src/routes/messages.ts` GET `/mailboxes/:mailbox/messages` handler
    - Import `validatePaginationParams` from `validate.ts` and `paginateUids`, `buildUidRangeCriteria` from `paginate.ts`
    - Extract `cursor` and `limit` from query params, validate with `validatePaginationParams`
    - After `mailboxOpen`, use `buildUidRangeCriteria(cursor, limit, client.mailbox.uidNext)` to build the UID range criteria
    - Merge UID range criteria with any existing search criteria passed to `client.search()`
    - Pass search results through `paginateUids(uids, limit)` to get page slice and metadata
    - Fetch envelopes/flags only for the paged UIDs
    - Return `{ messages, nextCursor, hasMore }` instead of the bare array
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 13.1, 13.2, 13.3_

  - [ ]* 3.2 Write unit tests for paginated message listing (`rest/test/routes/messages-pagination.test.ts`)
    - 401 without credentials
    - Default limit of 50 when omitted
    - Cursor filtering (only UIDs < cursor returned)
    - Response shape `{ messages, nextCursor, hasMore }`
    - `hasMore: false` and `nextCursor: null` on last page
    - 400 for invalid cursor, invalid limit, limit > 100
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3_

- [ ] 4. Add pagination to search endpoint
  - [x] 4.1 Update `rest/src/routes/search.ts` GET `/mailboxes/:mailbox/messages/search` handler
    - Import `validatePaginationParams` from `validate.ts` and `paginateUids`, `buildUidRangeCriteria` from `paginate.ts`
    - Extract `cursor` and `limit` from query params, validate with `validatePaginationParams`
    - Use `buildUidRangeCriteria` for tight UID range, merge with existing search criteria
    - Pass search results through `paginateUids` for page slice and metadata
    - Return `{ messages, nextCursor, hasMore }` instead of the bare array
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 2.1, 2.2, 2.3_

  - [ ]* 4.2 Write unit tests for paginated search (`rest/test/routes/search-pagination.test.ts`)
    - Same pagination tests applied to the search endpoint
    - Cursor combined with search criteria
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement bulk mark endpoint
  - [x] 6.1 Create `rest/src/routes/bulk.ts` with PATCH `/mailboxes/:mailbox/messages` handler
    - Import `validateUidArray` from `validate.ts`
    - Extract and validate credentials/IMAP config (same pattern as existing routes)
    - Validate request body: `uids` via `validateUidArray`, `seen` and `flagged` as optional booleans, at least one required
    - Open mailbox, apply flag operations: `messageFlagsAdd`/`messageFlagsRemove` with `\\Seen` and/or `\\Flagged`
    - Return `{ uids, seen?, flagged? }` with HTTP 200
    - Disconnect IMAP client in `finally` block
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 13.1, 13.2, 13.3_

  - [x] 6.2 Register `bulkRoutes` in `rest/src/app.ts`
    - Import and register the new `bulkRoutes` plugin
    - _Requirements: 4.1, 5.1, 6.1_

  - [ ]* 6.3 Write unit tests for bulk mark (`rest/test/routes/bulk-mark.test.ts`)
    - 401 without credentials
    - 400 for missing/empty/invalid uids, missing seen and flagged, non-boolean seen or flagged
    - 200 with seen=true calls `messageFlagsAdd` with `\\Seen`
    - 200 with seen=false calls `messageFlagsRemove` with `\\Seen`
    - 200 with flagged=true/false calls appropriate flag methods
    - 200 with both seen and flagged applies both
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_

  - [ ]* 6.4 Write property test for bulk mark flag dispatch (`rest/test/routes/bulk-mark.property.test.ts`)
    - **Property 6: Bulk flag operations dispatch correct ImapFlow calls**
    - **Validates: Requirements 4.1, 4.2, 5.1, 5.2, 6.1, 6.2**

- [ ] 7. Implement bulk move endpoint
  - [x] 7.1 Add POST `/mailboxes/:mailbox/messages/move` handler to `rest/src/routes/bulk.ts`
    - Validate `uids` via `validateUidArray`, validate `destination` (non-empty string, differs from source mailbox)
    - Open mailbox, call `client.messageMove(uids, destination, { uid: true })`
    - Handle TRYCREATE errors → 404
    - Convert `result.uidMap` to `Record<string, number>` response
    - Return `{ uids: { srcUid: dstUid, ... } }` with HTTP 200
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 13.1, 13.2, 13.3_

  - [ ]* 7.2 Write unit tests for bulk move (`rest/test/routes/bulk-move.test.ts`)
    - 401 without credentials
    - 400 for missing/empty/invalid uids, missing destination, same source/destination
    - 404 for non-existent destination
    - 200 with UID mapping on success
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 7.3 Write property test for bulk move (`rest/test/routes/bulk-move.property.test.ts`)
    - **Property 7: Bulk move delegates to ImapFlow and returns UID mapping**
    - **Validates: Requirements 10.1, 10.2**

- [ ] 8. Implement bulk copy endpoint
  - [x] 8.1 Add POST `/mailboxes/:mailbox/messages/copy` handler to `rest/src/routes/bulk.ts`
    - Validate `uids` via `validateUidArray`, validate `destination` (non-empty string)
    - Open mailbox, call `client.messageCopy(uids, destination, { uid: true })`
    - Handle TRYCREATE errors → 404
    - Convert `result.uidMap` to `Record<string, number>` response
    - Return `{ uids: { srcUid: dstUid, ... } }` with HTTP 200
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 13.1, 13.2, 13.3_

  - [ ]* 8.2 Write unit tests for bulk copy (`rest/test/routes/bulk-copy.test.ts`)
    - Same validation tests as move (minus same-source check)
    - 200 with UID mapping on success
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 8.3 Write property test for bulk copy (`rest/test/routes/bulk-copy.property.test.ts`)
    - **Property 8: Bulk copy delegates to ImapFlow and returns UID mapping**
    - **Validates: Requirements 11.1, 11.2**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Update MCP server tools
  - [x] 10.1 Update `list_messages` and `search_messages` tools in `mcp/src/app.ts`
    - Add optional `cursor` parameter (z.number().int().positive().optional()) to both tools
    - Forward `cursor` as query parameter in the delegated GET request
    - The paginated response from the REST API is already returned as a text content block
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

  - [x] 10.2 Add `bulk_mark_messages` tool to `mcp/src/app.ts`
    - Accepts `mailbox` (string), `uids` (array of positive ints), optional `seen` (boolean), optional `flagged` (boolean)
    - Delegates to `PATCH /mailboxes/:mailbox/messages` on the REST API
    - Returns response as text content block, sets `isError` on status >= 400
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 10.3 Add `bulk_move_messages` and `bulk_copy_messages` tools to `mcp/src/app.ts`
    - `bulk_move_messages`: accepts `mailbox`, `uids`, `destination`; delegates to `POST /mailboxes/:mailbox/messages/move`
    - `bulk_copy_messages`: accepts `mailbox`, `uids`, `destination`; delegates to `POST /mailboxes/:mailbox/messages/copy`
    - Both return response as text content block, set `isError` on status >= 400
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases using Jest + app.inject()
- The `paginate.ts` and `validate.ts` pure functions are tested independently of HTTP, keeping property tests fast
