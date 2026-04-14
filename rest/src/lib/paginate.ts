export interface PaginateResult {
  uids: number[];
  nextCursor: number | null;
  hasMore: boolean;
}

/**
 * Pure pagination over a UID array (already filtered by UID range from IMAP search).
 * Sorts descending (newest first), applies +1 overfetch logic.
 */
export function paginateUids(uids: number[], limit: number): PaginateResult {
  const sorted = [...uids].sort((a, b) => b - a);

  if (sorted.length > limit) {
    return {
      uids: sorted.slice(0, limit),
      nextCursor: sorted[limit - 1],
      hasMore: true,
    };
  }

  return {
    uids: sorted,
    nextCursor: null,
    hasMore: false,
  };
}

/**
 * Builds the tight UID range criteria for IMAP search.
 * - With cursor: { uid: `${max(1, cursor-limit-1)}:${cursor-1}` }
 * - Without cursor (first page): uses uidNext as upper bound
 * - Returns empty object if no results are possible (cursor=1 or uidNext=1)
 */
export function buildUidRangeCriteria(
  cursor: number | undefined,
  limit: number,
  uidNext: number,
): { uid?: string } {
  if (cursor !== undefined) {
    if (cursor <= 1) return {};
    const lower = Math.max(1, cursor - limit - 1);
    const upper = cursor - 1;
    return { uid: `${lower}:${upper}` };
  }

  if (uidNext <= 1) return {};
  const lower = Math.max(1, uidNext - limit - 1);
  const upper = uidNext - 1;
  return { uid: `${lower}:${upper}` };
}
