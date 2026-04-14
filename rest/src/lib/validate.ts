export interface ValidatedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

/**
 * Validates the sort query parameter.
 * Returns 'desc' when omitted, throws on values other than 'asc'/'desc'.
 */
export function validateSortParam(sort?: string): 'asc' | 'desc' {
  if (sort === undefined) return 'desc';
  if (sort === 'asc' || sort === 'desc') return sort;
  throw new Error("'sort' must be 'asc' or 'desc'");
}

/**
 * Validates an attachments array from a request body.
 * Each object must have filename (string), contentType (string), and content (valid base64 string).
 * Decodes content to Buffer.
 */
export function validateAttachments(attachments: unknown): ValidatedAttachment[] {
  if (!Array.isArray(attachments)) {
    throw new Error("Each attachment must have 'filename', 'contentType', and 'content'");
  }

  return attachments.map((att: unknown) => {
    if (
      typeof att !== 'object' || att === null ||
      typeof (att as any).filename !== 'string' ||
      typeof (att as any).contentType !== 'string' ||
      typeof (att as any).content !== 'string'
    ) {
      throw new Error("Each attachment must have 'filename', 'contentType', and 'content'");
    }

    const { filename, contentType, content } = att as { filename: string; contentType: string; content: string };

    // Validate base64: must match base64 character set and have correct padding
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length % 4 !== 0) {
      throw new Error('Attachment content must be valid base64');
    }

    return {
      filename,
      contentType,
      content: Buffer.from(content, 'base64'),
    };
  });
}

/**
 * Validates and parses pagination query parameters.
 * - cursor: optional, must be a positive integer if present
 * - limit: optional, must be a positive integer ≤ 100, defaults to 50
 */
export function validatePaginationParams(
  cursor?: string,
  limit?: string,
): { cursor?: number; limit: number } {
  const result: { cursor?: number; limit: number } = { limit: 50 };

  if (cursor !== undefined) {
    const num = Number(cursor);
    if (!Number.isInteger(num) || num <= 0) {
      throw new Error("'cursor' must be a positive integer");
    }
    result.cursor = num;
  }

  if (limit !== undefined) {
    const num = Number(limit);
    if (!Number.isInteger(num) || num <= 0) {
      throw new Error("'limit' must be a positive integer");
    }
    if (num > 100) {
      throw new Error("'limit' must not exceed 100");
    }
    result.limit = num;
  }

  return result;
}

/**
 * Validates a UID array from a request body.
 * - Must be a non-empty array of positive integers
 * - Maximum 100 entries
 */
export function validateUidArray(uids: unknown): number[] {
  if (!Array.isArray(uids) || uids.length === 0) {
    throw new Error("A non-empty array of UIDs is required");
  }

  if (uids.length > 100) {
    throw new Error("Maximum 100 UIDs per request");
  }

  for (const uid of uids) {
    if (typeof uid !== "number" || !Number.isInteger(uid) || uid <= 0) {
      throw new Error("All UIDs must be positive integers");
    }
  }

  return uids as number[];
}
