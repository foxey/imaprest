# Requirements Document — Move/Copy Messages & Search

## Introduction

This document specifies two new features for the imaprest REST API: (1) moving and copying messages between IMAP mailboxes, and (2) full-text and structured search across messages. These features extend the existing MVP message management capabilities without changing the stateless, per-request credential model.

## Glossary

- **REST_API**: The Fastify HTTP service that bridges HTTP requests to IMAP/SMTP operations
- **MCP_Server**: The Model Context Protocol server that wraps the REST_API, exposing mail operations as tools for AI agents
- **IMAP_Client**: A per-request ImapFlow connection created from credential headers and torn down in a finally block
- **Message_UID**: The unique identifier assigned to a message within a specific IMAP mailbox
- **Source_Mailbox**: The IMAP mailbox from which a message is moved or copied
- **Destination_Mailbox**: The IMAP mailbox to which a message is moved or copied
- **Search_Criteria**: A set of filters (keyword, sender, date range, flags) used to locate messages via IMAP SEARCH
- **Search_Query**: The query parameters provided by the caller to the search endpoint, converted into Search_Criteria

---

## Requirements

### Requirement 1: Move Messages Between Mailboxes

**User Story:** As an API consumer, I want to move a message from one mailbox to another, so that I can organize email (e.g. move spam to inbox, archive messages, move to custom folders).

#### Acceptance Criteria

1. WHEN a POST request is received at `/mailboxes/:mailbox/messages/:uid/move` with a JSON body containing `destination`, THE REST_API SHALL move the message identified by Message_UID from Source_Mailbox to Destination_Mailbox using the IMAP MOVE command
2. WHEN the move operation succeeds, THE REST_API SHALL respond with HTTP 200 and a JSON body containing the new Message_UID assigned in the Destination_Mailbox
3. IF the Message_UID does not exist in the Source_Mailbox, THEN THE REST_API SHALL respond with HTTP 404 and an error message indicating the message was not found
4. IF the Destination_Mailbox does not exist on the IMAP server, THEN THE REST_API SHALL respond with HTTP 404 and an error message indicating the destination mailbox was not found
5. IF the `destination` field is missing or empty in the request body, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the destination is required
6. IF the `destination` is the same as the Source_Mailbox, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the source and destination must differ

### Requirement 2: Copy Messages Between Mailboxes

**User Story:** As an API consumer, I want to copy a message from one mailbox to another, so that I can duplicate messages across folders without removing the original.

#### Acceptance Criteria

1. WHEN a POST request is received at `/mailboxes/:mailbox/messages/:uid/copy` with a JSON body containing `destination`, THE REST_API SHALL copy the message identified by Message_UID from Source_Mailbox to Destination_Mailbox using the IMAP COPY command
2. WHEN the copy operation succeeds, THE REST_API SHALL respond with HTTP 200 and a JSON body containing the new Message_UID assigned in the Destination_Mailbox
3. WHEN the copy operation succeeds, THE REST_API SHALL retain the original message in the Source_Mailbox with its existing Message_UID unchanged
4. IF the Message_UID does not exist in the Source_Mailbox, THEN THE REST_API SHALL respond with HTTP 404 and an error message indicating the message was not found
5. IF the Destination_Mailbox does not exist on the IMAP server, THEN THE REST_API SHALL respond with HTTP 404 and an error message indicating the destination mailbox was not found
6. IF the `destination` field is missing or empty in the request body, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the destination is required

### Requirement 3: Search Messages

**User Story:** As an API consumer, I want to search messages across a mailbox by keyword, sender, subject, date range, and read status, so that I can find specific messages without fetching everything.

#### Acceptance Criteria

1. WHEN a GET request is received at `/mailboxes/:mailbox/messages/search` with query parameters, THE REST_API SHALL convert the Search_Query into IMAP SEARCH criteria and return matching message summaries
2. WHEN the `q` query parameter is provided, THE REST_API SHALL include a TEXT search criterion that matches the keyword against message headers and body content
3. WHEN the `from` query parameter is provided, THE REST_API SHALL include a FROM search criterion matching the sender address
4. WHEN the `subject` query parameter is provided, THE REST_API SHALL include a SUBJECT search criterion matching the subject line
5. WHEN the `since` query parameter is provided as an ISO 8601 date string, THE REST_API SHALL include a SINCE search criterion filtering to messages on or after that date
6. WHEN the `before` query parameter is provided as an ISO 8601 date string, THE REST_API SHALL include a BEFORE search criterion filtering to messages before that date
7. WHEN the `unseen` query parameter is set to `true`, THE REST_API SHALL include an UNSEEN search criterion filtering to unread messages only
8. WHEN multiple query parameters are provided, THE REST_API SHALL combine all criteria using AND logic
9. THE REST_API SHALL return search results as an array of message summaries containing uid, from, subject, date, and seen status
10. WHEN the `limit` query parameter is provided as a positive integer, THE REST_API SHALL cap the number of returned results to that value
11. WHEN no `limit` is provided, THE REST_API SHALL default to returning at most 50 results
12. THE REST_API SHALL sort search results by date descending, returning the most recent matches first

### Requirement 4: Search Query Validation

**User Story:** As an API consumer, I want clear error messages when I provide invalid search parameters, so that I can correct my requests.

#### Acceptance Criteria

1. IF the `since` query parameter is not a valid ISO 8601 date string, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the date format is invalid
2. IF the `before` query parameter is not a valid ISO 8601 date string, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the date format is invalid
3. IF both `since` and `before` are provided and `since` is on or after `before`, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the date range is invalid
4. IF the `limit` query parameter is not a positive integer, THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating the limit must be a positive integer
5. IF no search parameters are provided (no `q`, `from`, `subject`, `since`, `before`, or `unseen`), THEN THE REST_API SHALL respond with HTTP 400 and an error message indicating at least one search criterion is required

### Requirement 5: MCP Tool for Move Messages

**User Story:** As an AI agent, I want an MCP tool to move messages between mailboxes, so that I can organize email on behalf of the user.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose a `move_message` tool that accepts mailbox, uid, and destination parameters
2. WHEN the `move_message` tool is invoked, THE MCP_Server SHALL delegate to the REST_API move endpoint via an HTTP POST request
3. WHEN the REST_API returns a success response, THE MCP_Server SHALL return the response data as a text content block
4. WHEN the REST_API returns an error response (status >= 400), THE MCP_Server SHALL return the error with `isError` set to true

### Requirement 6: MCP Tool for Copy Messages

**User Story:** As an AI agent, I want an MCP tool to copy messages between mailboxes, so that I can duplicate messages across folders on behalf of the user.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose a `copy_message` tool that accepts mailbox, uid, and destination parameters
2. WHEN the `copy_message` tool is invoked, THE MCP_Server SHALL delegate to the REST_API copy endpoint via an HTTP POST request
3. WHEN the REST_API returns a success response, THE MCP_Server SHALL return the response data as a text content block
4. WHEN the REST_API returns an error response (status >= 400), THE MCP_Server SHALL return the error with `isError` set to true

### Requirement 7: MCP Tool for Search Messages

**User Story:** As an AI agent, I want an MCP tool to search messages by keyword, sender, date range, and other criteria, so that I can find specific messages on behalf of the user.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose a `search_messages` tool that accepts mailbox and optional parameters: q, from, subject, since, before, unseen, and limit
2. WHEN the `search_messages` tool is invoked, THE MCP_Server SHALL delegate to the REST_API search endpoint via an HTTP GET request with the parameters as query string values
3. WHEN the REST_API returns a success response, THE MCP_Server SHALL return the response data as a text content block
4. WHEN the REST_API returns an error response (status >= 400), THE MCP_Server SHALL return the error with `isError` set to true

### Requirement 8: Credential and Connection Handling for New Endpoints

**User Story:** As an API consumer, I want the new move, copy, and search endpoints to follow the same credential and connection patterns as existing endpoints, so that the API remains consistent.

#### Acceptance Criteria

1. THE REST_API SHALL require IMAP credential headers (X-Mail-User, X-Mail-Password, X-IMAP-Host) for the move, copy, and search endpoints
2. IF required IMAP credential headers are missing, THEN THE REST_API SHALL respond with HTTP 401 and an error message listing the missing headers
3. THE REST_API SHALL create a fresh IMAP_Client for each move, copy, or search request and disconnect the IMAP_Client in a finally block
4. IF the IMAP_Client fails to authenticate, THEN THE REST_API SHALL respond with HTTP 401
5. IF the IMAP_Client fails to connect to the server, THEN THE REST_API SHALL respond with HTTP 502
