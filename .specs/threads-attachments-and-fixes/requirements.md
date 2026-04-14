# Requirements Document

## Introduction

This feature set adds thread/conversation grouping, attachment download and upload, ascending sort for message listing, and a fix for empty body on HTML-only messages to the imaprest REST API and MCP service. Together these capabilities enable digest-style workflows (grouping related emails), full attachment handling, chronological thread views, and reliable body extraction for all message types.

## Glossary

- **REST_API**: The Fastify-based HTTP service (`rest/`) that bridges HTTP requests to IMAP and SMTP operations.
- **MCP_Service**: The Model Context Protocol server (`mcp/`) that wraps the REST_API, exposing mail operations as tools for AI agents.
- **Thread**: A group of email messages linked by Message-ID, In-Reply-To, and References headers, representing a single conversation.
- **Message_ID**: The globally unique identifier assigned to an email by the originating mail server (the `Message-ID` header).
- **In_Reply_To**: An email header containing the Message_ID of the message being replied to.
- **References_Header**: An email header containing an ordered list of Message_IDs tracing the conversation history.
- **Thread_Endpoint**: The REST_API route that, given a mailbox and a Message_ID, returns all messages belonging to the same Thread.
- **Attachment**: A file embedded in an email message with a content disposition of "attachment" or an explicit filename.
- **Attachment_Endpoint**: The REST_API route that downloads a specific Attachment from a message by index.
- **Sort_Order**: A query parameter controlling whether message listing and search results are returned in ascending (oldest-first) or descending (newest-first) order.
- **ParsedMessage**: The structured object returned by `parseRawMessage` containing uid, date, from, to, cc, subject, text, html, attachments, messageId, and references.
- **HTML_Fallback**: The behaviour of extracting a plain-text representation from the HTML body when no dedicated text part exists in a multipart/alternative email.

## Requirements

### Requirement 1: Retrieve Thread by Message-ID

**User Story:** As an API consumer, I want to retrieve all messages in a conversation thread given a Message_ID, so that I can view the full context of an email exchange without manually chasing references.

#### Acceptance Criteria

1. WHEN a GET request is made to the Thread_Endpoint with a valid mailbox and Message_ID, THE REST_API SHALL return all messages in the mailbox whose Message_ID, In_Reply_To, or References_Header contain any Message_ID in the resolved thread.
2. THE REST_API SHALL return thread messages sorted in chronological order (oldest first) by the message date.
3. WHEN the provided Message_ID does not match any message in the mailbox, THE REST_API SHALL return an empty array with a 200 status code.
4. THE REST_API SHALL include for each thread message the same summary fields as the list endpoint: uid, from, subject, date, and seen status.
5. IF the IMAP server connection fails during thread retrieval, THEN THE REST_API SHALL return a 502 status code with a descriptive error message.
6. WHEN a GET request is made to the Thread_Endpoint without valid credentials, THE REST_API SHALL return a 401 status code.

### Requirement 2: MCP Thread Tool

**User Story:** As an AI agent, I want a `get_thread` MCP tool that retrieves a conversation thread, so that I can present grouped email chains to users and build digest summaries.

#### Acceptance Criteria

1. THE MCP_Service SHALL expose a `get_thread` tool that accepts a mailbox name and a Message_ID as parameters.
2. WHEN the `get_thread` tool is invoked, THE MCP_Service SHALL forward the request to the Thread_Endpoint and return the result.
3. WHEN the Thread_Endpoint returns an error status (>= 400), THE MCP_Service SHALL set `isError` to true in the tool response.

### Requirement 3: Download Attachment

**User Story:** As an API consumer, I want to download a specific attachment from an email message, so that I can access files sent via email.

#### Acceptance Criteria

1. WHEN a GET request is made to the Attachment_Endpoint with a valid mailbox, message UID, and attachment index, THE REST_API SHALL return the attachment binary content with the correct `Content-Type` header.
2. THE REST_API SHALL set the `Content-Disposition` response header to `attachment` with the original filename when the Attachment has a filename.
3. WHEN the attachment index is out of range, THE REST_API SHALL return a 404 status code with a descriptive error message.
4. WHEN the message UID does not exist, THE REST_API SHALL return a 404 status code.
5. WHEN the attachment index is not a non-negative integer, THE REST_API SHALL return a 400 status code.
6. WHEN a GET request is made to the Attachment_Endpoint without valid credentials, THE REST_API SHALL return a 401 status code.

### Requirement 4: MCP Download Attachment Tool

**User Story:** As an AI agent, I want a `download_attachment` MCP tool, so that I can retrieve file attachments from emails on behalf of users.

#### Acceptance Criteria

1. THE MCP_Service SHALL expose a `download_attachment` tool that accepts a mailbox name, message UID, and attachment index as parameters.
2. WHEN the `download_attachment` tool is invoked, THE MCP_Service SHALL forward the request to the Attachment_Endpoint and return the attachment content encoded as base64 text.
3. WHEN the Attachment_Endpoint returns an error status (>= 400), THE MCP_Service SHALL set `isError` to true in the tool response.

### Requirement 5: Send Message with Attachments

**User Story:** As an API consumer, I want to include file attachments when sending or replying to messages, so that I can share files via email through the API.

#### Acceptance Criteria

1. WHEN a POST request to the send endpoint includes an `attachments` array in the JSON body, THE REST_API SHALL send the email with each attachment included as a MIME attachment.
2. THE REST_API SHALL accept each attachment as an object with `filename` (string), `contentType` (string), and `content` (base64-encoded string) fields.
3. WHEN any attachment object is missing a required field (`filename`, `contentType`, or `content`), THE REST_API SHALL return a 400 status code with a descriptive error message.
4. WHEN a POST request to the reply endpoint includes an `attachments` array in the JSON body, THE REST_API SHALL send the reply with each attachment included as a MIME attachment.
5. WHEN the `attachments` field is omitted or is an empty array, THE REST_API SHALL send the message without attachments (preserving current behaviour).
6. WHEN the base64 `content` field of an attachment cannot be decoded, THE REST_API SHALL return a 400 status code with a descriptive error message.

### Requirement 6: MCP Send and Reply with Attachments

**User Story:** As an AI agent, I want the `send_email` and `reply_to_message` MCP tools to support attachments, so that I can send files on behalf of users.

#### Acceptance Criteria

1. THE MCP_Service SHALL add an optional `attachments` parameter to the `send_email` tool, accepting an array of objects with `filename`, `contentType`, and `content` fields.
2. THE MCP_Service SHALL add an optional `attachments` parameter to the `reply_to_message` tool, accepting an array of objects with `filename`, `contentType`, and `content` fields.
3. WHEN attachments are provided, THE MCP_Service SHALL include them in the forwarded request body to the REST_API.

### Requirement 7: Ascending Sort Order for Message Listing and Search

**User Story:** As an API consumer, I want to request messages in ascending (oldest-first) order, so that I can display chronological thread views without client-side reversal.

#### Acceptance Criteria

1. WHEN a `sort=asc` query parameter is provided on the list messages endpoint, THE REST_API SHALL return messages sorted by UID in ascending order (oldest first).
2. WHEN a `sort=asc` query parameter is provided on the search messages endpoint, THE REST_API SHALL return messages sorted by UID in ascending order (oldest first).
3. WHEN the `sort` parameter is omitted or set to `desc`, THE REST_API SHALL return messages in descending order (newest first), preserving current behaviour.
4. WHEN the `sort` parameter has a value other than `asc` or `desc`, THE REST_API SHALL return a 400 status code with a descriptive error message.
5. WHEN `sort=asc` is combined with cursor-based pagination, THE REST_API SHALL paginate forward from the cursor in ascending UID order, with `nextCursor` pointing to the next page of older-to-newer messages.

### Requirement 8: MCP Sort Parameter for Listing and Search Tools

**User Story:** As an AI agent, I want the `list_messages` and `search_messages` MCP tools to support a `sort` parameter, so that I can request chronological message ordering.

#### Acceptance Criteria

1. THE MCP_Service SHALL add an optional `sort` parameter (accepting `asc` or `desc`) to the `list_messages` tool.
2. THE MCP_Service SHALL add an optional `sort` parameter (accepting `asc` or `desc`) to the `search_messages` tool.
3. WHEN the `sort` parameter is provided, THE MCP_Service SHALL forward it as a query parameter to the REST_API.

### Requirement 9: Fix Empty Body for HTML-Only Messages

**User Story:** As an API consumer, I want `get_message` to return a usable text body for emails that only contain HTML, so that digest and summary workflows receive content instead of null.

#### Acceptance Criteria

1. WHEN a message has a `multipart/alternative` structure with only an HTML part and no plain-text part, THE REST_API SHALL populate the `text` field of the ParsedMessage with a markdown-flavoured plain-text conversion derived from the HTML content, preserving semantic structure (headings, bold, italic, links, lists).
2. WHEN a message has both a plain-text part and an HTML part, THE REST_API SHALL use the original plain-text part for the `text` field (preserving current behaviour).
3. WHEN a message has only a plain-text part, THE REST_API SHALL use it for the `text` field (preserving current behaviour).
4. THE REST_API SHALL preserve the `html` field unchanged regardless of whether HTML_Fallback is applied.
5. THE REST_API SHALL strip remaining HTML tags during HTML_Fallback to produce readable text with no raw HTML tag sequences.
