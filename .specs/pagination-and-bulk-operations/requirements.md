# Requirements Document — Paginated Listing & Bulk Operations

## Introduction

This document specifies three new features for the imaprest REST API: (1) cursor-based pagination for message listing endpoints to handle large mailboxes efficiently, (2) bulk mark operations to flag or unflag multiple messages in a single request, and (3) bulk move/copy operations to move or copy multiple messages to another mailbox in a single request. All features extend the existing message management capabilities and are exposed through the REST API and the MCP server. The stateless, per-request credential model is preserved.

## Glossary

- **REST_API**: The Fastify HTTP service that bridges HTTP requests to IMAP/SMTP operations
- **MCP_Server**: The Model Context Protocol server that wraps the REST_API, exposing mail operations as tools for AI agents
- **IMAP_Client**: A per-request ImapFlow connection created from credential headers and torn down in a finally block
- **Message_UID**: The unique identifier assigned to a message within a specific IMAP mailbox
- **Cursor**: A Message_UID value used as a pagination anchor; the response returns messages with UIDs strictly less than the Cursor value (i.e. older messages)
- **Page_Size**: The maximum number of message summaries returned in a single paginated response, controlled by the `limit` query parameter
- **Pagination_Metadata**: A JSON object included in paginated responses containing `nextCursor` (the UID to pass as `cursor` for the next page) and `hasMore` (boolean indicating whether additional pages exist)
- **Bulk_Mark_Request**: A JSON request body containing a list of Message_UIDs and the flag operations to apply
- **Flag_Operation**: An action that adds or removes an IMAP flag (e.g. `\Seen`, `\Flagged`) on one or more messages
- **Bulk_Move_Request**: A JSON request body containing a list of Message_UIDs and a destination mailbox for a move operation
- **Bulk_Copy_Request**: A JSON request body containing a list of Message_UIDs and a destination mailbox for a copy operation
- **UID_Map**: A mapping of source Message_UIDs to their new UIDs in the destination mailbox, returned by IMAP after a move or copy operation

---

## Requirements

### Requirement 1: Cursor-Based Pagination for Message Listing

**User Story:** As an API consumer, I want to paginate through messages in a mailbox using a cursor, so that I can efficiently browse large mailboxes without fetching all messages at once.

#### Acceptance Criteria

1. WHEN a GET request is received at `/mailboxes/:mailbox/messages` with a `cursor` query parameter set to a valid Message_UID, THE REST_API SHALL return only messages with UIDs strictly less than the Cursor value, sorted by UID descending
2. WHEN a GET request is received at `/mailboxes/:mailbox/messages` without a `cursor` query parameter, THE REST_API SHALL return messages starting from the most recent, sorted by UID descending
3. WHEN a `limit` query parameter is provided as a positive integer, THE REST_API SHALL return at most that number of message summaries per page
4. WHEN no `limit` query parameter is provided, THE REST_API SHALL default the Page_Size to 50
5. THE REST_API SHALL include Pagination_Metadata in the response body as a JSON object with the shape `{ "messages": [...], "nextCursor": <uid|null>, "hasMore": <boolean> }`
6. WHEN the number of messages matching the query exceeds the Page_Size, THE REST_API SHALL set `nextCursor` to the UID of the last message in the current page and set `hasMore` to true
7. WHEN there are no more messages beyond the current page, THE REST_API SHALL set `nextCursor` to null and set `hasMore` to false

### Requirement 2: Pagination Parameter Validation

**User Story:** As an API consumer, I want clear error messages when I provide invalid pagination parameters, so that I can correct my requests.

#### Acceptance Criteria

1. IF the `cursor` query parameter is present and is not a positive integer, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the cursor must be a positive integer
2. IF the `limit` query parameter is present and is not a positive integer, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the limit must be a positive integer
3. IF the `limit` query parameter exceeds 100, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the maximum allowed limit is 100

### Requirement 3: Cursor-Based Pagination for Search Results

**User Story:** As an API consumer, I want to paginate through search results using the same cursor mechanism, so that large result sets from search queries are browsable.

#### Acceptance Criteria

1. WHEN a GET request is received at `/mailboxes/:mailbox/messages/search` with a `cursor` query parameter, THE REST_API SHALL apply the cursor filter in addition to the existing search criteria, returning only matching messages with UIDs strictly less than the Cursor value
2. WHEN a GET request is received at `/mailboxes/:mailbox/messages/search` without a `cursor` query parameter, THE REST_API SHALL return matching messages starting from the most recent
3. THE REST_API SHALL include Pagination_Metadata in the search response body with the same shape as the message listing endpoint: `{ "messages": [...], "nextCursor": <uid|null>, "hasMore": <boolean> }`
4. WHEN the `limit` query parameter is provided, THE REST_API SHALL cap search results to that value; WHEN omitted, THE REST_API SHALL default to 50

### Requirement 4: Bulk Mark Messages as Seen or Unseen

**User Story:** As an API consumer, I want to mark multiple messages as seen or unseen in a single request, so that I can efficiently manage read status across a mailbox.

#### Acceptance Criteria

1. WHEN a PATCH request is received at `/mailboxes/:mailbox/messages` with a JSON body containing `uids` (an array of Message_UIDs) and `seen` (a boolean), THE REST_API SHALL add the `\Seen` flag to all specified messages when `seen` is true, or remove the `\Seen` flag from all specified messages when `seen` is false
2. WHEN the bulk mark operation succeeds, THE REST_API SHALL respond with HTTP 200 and a JSON body containing `{ "uids": [...], "seen": <boolean> }` reflecting the applied state
3. IF the `uids` field is missing, not an array, or is an empty array, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that a non-empty array of UIDs is required
4. IF any value in the `uids` array is not a positive integer, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating all UIDs must be positive integers
5. IF the `seen` field is missing or is not a boolean, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that `seen` must be a boolean
6. IF one or more of the specified Message_UIDs do not exist in the mailbox, THEN THE REST_API SHALL apply the flag operation to the UIDs that do exist and respond with HTTP 200
7. IF the `uids` array contains more than 100 entries, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the maximum number of UIDs per request is 100

### Requirement 5: Bulk Flag and Unflag Messages

**User Story:** As an API consumer, I want to add or remove the `\Flagged` flag on multiple messages in a single request, so that I can star or unstar messages in bulk.

#### Acceptance Criteria

1. WHEN a PATCH request is received at `/mailboxes/:mailbox/messages` with a JSON body containing `uids` (an array of Message_UIDs) and `flagged` (a boolean), THE REST_API SHALL add the `\Flagged` flag to all specified messages when `flagged` is true, or remove the `\Flagged` flag from all specified messages when `flagged` is false
2. WHEN the bulk flag operation succeeds, THE REST_API SHALL respond with HTTP 200 and a JSON body containing `{ "uids": [...], "flagged": <boolean> }` reflecting the applied state
3. IF the `uids` field is missing, not an array, or is an empty array, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that a non-empty array of UIDs is required
4. IF any value in the `uids` array is not a positive integer, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating all UIDs must be positive integers
5. IF the `flagged` field is missing or is not a boolean, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that `flagged` must be a boolean

### Requirement 6: Combined Bulk Mark Operations

**User Story:** As an API consumer, I want to set both `seen` and `flagged` in a single bulk request, so that I can apply multiple flag changes without making separate calls.

#### Acceptance Criteria

1. WHEN a PATCH request to `/mailboxes/:mailbox/messages` includes both `seen` and `flagged` fields alongside `uids`, THE REST_API SHALL apply both flag operations to all specified messages in a single request
2. WHEN both operations succeed, THE REST_API SHALL respond with HTTP 200 and a JSON body containing `{ "uids": [...], "seen": <boolean>, "flagged": <boolean> }`
3. IF the request body contains `uids` but neither `seen` nor `flagged`, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating at least one of `seen` or `flagged` is required

### Requirement 7: MCP Tool for Paginated Message Listing

**User Story:** As an AI agent, I want the list_messages tool to support pagination, so that I can browse large mailboxes page by page.

#### Acceptance Criteria

1. THE MCP_Server SHALL update the `list_messages` tool to accept optional `cursor` and `limit` parameters
2. WHEN the `list_messages` tool is invoked with a `cursor` parameter, THE MCP_Server SHALL include the cursor as a query parameter in the delegated GET request to the REST_API
3. WHEN the REST_API returns a paginated response, THE MCP_Server SHALL return the full response (including `messages`, `nextCursor`, and `hasMore`) as a text content block

### Requirement 8: MCP Tool for Paginated Search

**User Story:** As an AI agent, I want the search_messages tool to support pagination, so that I can page through large search result sets.

#### Acceptance Criteria

1. THE MCP_Server SHALL update the `search_messages` tool to accept an optional `cursor` parameter
2. WHEN the `search_messages` tool is invoked with a `cursor` parameter, THE MCP_Server SHALL include the cursor as a query parameter in the delegated GET request to the REST_API
3. WHEN the REST_API returns a paginated search response, THE MCP_Server SHALL return the full response (including `messages`, `nextCursor`, and `hasMore`) as a text content block

### Requirement 9: MCP Tool for Bulk Mark Operations

**User Story:** As an AI agent, I want an MCP tool to mark multiple messages as seen/unseen and flagged/unflagged in bulk, so that I can manage message flags efficiently on behalf of the user.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose a `bulk_mark_messages` tool that accepts `mailbox`, `uids`, and optional `seen` and `flagged` parameters
2. WHEN the `bulk_mark_messages` tool is invoked, THE MCP_Server SHALL delegate to the REST_API bulk PATCH endpoint via an HTTP PATCH request
3. WHEN the REST_API returns a success response, THE MCP_Server SHALL return the response data as a text content block
4. WHEN the REST_API returns an error response (status >= 400), THE MCP_Server SHALL return the error with `isError` set to true

### Requirement 10: Bulk Move Messages

**User Story:** As an API consumer, I want to move multiple messages to another mailbox in a single request, so that I can reorganize messages efficiently.

#### Acceptance Criteria

1. WHEN a POST request is received at `/mailboxes/:mailbox/messages/move` with a JSON body containing `uids` (an array of Message_UIDs) and `destination` (a string), THE REST_API SHALL move all specified messages from the source mailbox to the destination mailbox
2. WHEN the bulk move operation succeeds, THE REST_API SHALL respond with HTTP 200 and a JSON body containing `{ "uids": { "<sourceUid>": <destinationUid>, ... } }` mapping each source UID to its new UID in the destination mailbox
3. IF the `uids` field is missing, not an array, or is an empty array, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that a non-empty array of UIDs is required
4. IF any value in the `uids` array is not a positive integer, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating all UIDs must be positive integers
5. IF the `destination` field is missing or is not a non-empty string, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that `destination` is required
6. IF the `destination` is the same as the source mailbox, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating source and destination must differ
7. IF the destination mailbox does not exist, THEN THE REST_API SHALL respond with HTTP 404 and an error message indicating the destination mailbox was not found
8. IF the `uids` array contains more than 100 entries, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the maximum number of UIDs per request is 100
9. IF one or more of the specified Message_UIDs do not exist in the source mailbox, THEN THE REST_API SHALL move the UIDs that do exist and include only those in the UID mapping response

### Requirement 11: Bulk Copy Messages

**User Story:** As an API consumer, I want to copy multiple messages to another mailbox in a single request, so that I can duplicate messages across mailboxes efficiently.

#### Acceptance Criteria

1. WHEN a POST request is received at `/mailboxes/:mailbox/messages/copy` with a JSON body containing `uids` (an array of Message_UIDs) and `destination` (a string), THE REST_API SHALL copy all specified messages from the source mailbox to the destination mailbox
2. WHEN the bulk copy operation succeeds, THE REST_API SHALL respond with HTTP 200 and a JSON body containing `{ "uids": { "<sourceUid>": <destinationUid>, ... } }` mapping each source UID to its new UID in the destination mailbox
3. IF the `uids` field is missing, not an array, or is an empty array, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that a non-empty array of UIDs is required
4. IF any value in the `uids` array is not a positive integer, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating all UIDs must be positive integers
5. IF the `destination` field is missing or is not a non-empty string, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating that `destination` is required
6. IF the destination mailbox does not exist, THEN THE REST_API SHALL respond with HTTP 404 and an error message indicating the destination mailbox was not found
7. IF the `uids` array contains more than 100 entries, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the maximum number of UIDs per request is 100
8. IF one or more of the specified Message_UIDs do not exist in the source mailbox, THEN THE REST_API SHALL copy the UIDs that do exist and include only those in the UID mapping response

### Requirement 12: MCP Tool for Bulk Move/Copy Operations

**User Story:** As an AI agent, I want MCP tools to move or copy multiple messages in bulk, so that I can reorganize mailboxes efficiently on behalf of the user.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose a `bulk_move_messages` tool that accepts `mailbox`, `uids`, and `destination` parameters
2. WHEN the `bulk_move_messages` tool is invoked, THE MCP_Server SHALL delegate to the REST_API bulk move endpoint via an HTTP POST request to `/mailboxes/:mailbox/messages/move`
3. THE MCP_Server SHALL expose a `bulk_copy_messages` tool that accepts `mailbox`, `uids`, and `destination` parameters
4. WHEN the `bulk_copy_messages` tool is invoked, THE MCP_Server SHALL delegate to the REST_API bulk copy endpoint via an HTTP POST request to `/mailboxes/:mailbox/messages/copy`
5. WHEN the REST_API returns a success response, THE MCP_Server SHALL return the UID mapping as a text content block
6. WHEN the REST_API returns an error response (status >= 400), THE MCP_Server SHALL return the error with `isError` set to true

### Requirement 13: Credential and Connection Handling for New Endpoints

**User Story:** As an API consumer, I want the new pagination and bulk mark endpoints to follow the same credential and connection patterns as existing endpoints, so that the API remains consistent.

#### Acceptance Criteria

1. THE REST_API SHALL require IMAP credential headers (X-Mail-User, X-Mail-Password, X-IMAP-Host, X-IMAP-Port, X-IMAP-TLS) for the paginated listing, bulk mark, and bulk move/copy endpoints
2. IF required IMAP credential headers are missing, THEN THE REST_API SHALL respond with HTTP 401 and an error message listing the missing headers
3. THE REST_API SHALL create a fresh IMAP_Client for each paginated listing, bulk mark, or bulk move/copy request and disconnect the IMAP_Client in a finally block
