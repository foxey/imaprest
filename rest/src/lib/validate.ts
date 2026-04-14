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
