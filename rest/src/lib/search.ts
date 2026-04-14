export interface SearchParams {
  q?: string;
  unseen?: string;
  from?: string;
  subject?: string;
  since?: string;
  before?: string;
  limit?: string;
}

export interface ImapSearchCriteria {
  seen?: boolean;
  from?: string;
  subject?: string;
  body?: string;
  sentSince?: Date;
  sentBefore?: Date;
}

export function validateSearchParams(params: SearchParams): void {
  if (params.since) {
    const date = new Date(params.since);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid 'since' parameter — must be ISO-8601");
    }
  }

  if (params.before) {
    const date = new Date(params.before);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid 'before' parameter — must be ISO-8601");
    }
  }

  if (params.since && params.before) {
    const sinceDate = new Date(params.since);
    const beforeDate = new Date(params.before);
    if (sinceDate >= beforeDate) {
      throw new Error("Invalid date range — 'since' must be before 'before'");
    }
  }

  if (params.limit !== undefined) {
    const num = Number(params.limit);
    if (!Number.isInteger(num) || num <= 0) {
      throw new Error("'limit' must be a positive integer");
    }
  }

  const hasAnyCriterion =
    params.q ||
    params.from ||
    params.subject ||
    params.since ||
    params.before ||
    params.unseen;

  if (!hasAnyCriterion) {
    throw new Error("At least one search criterion is required");
  }
}

export function buildSearchCriteria(params: SearchParams): ImapSearchCriteria {
  const criteria: ImapSearchCriteria = {};

  if (params.unseen === "true") {
    criteria.seen = false;
  }

  if (params.from) {
    criteria.from = params.from;
  }

  if (params.subject) {
    criteria.subject = params.subject;
  }

  if (params.q) {
    criteria.body = params.q;
  }

  if (params.since) {
    const date = new Date(params.since);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid 'since' parameter — must be ISO-8601");
    }
    criteria.sentSince = date;
  }

  if (params.before) {
    const date = new Date(params.before);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid 'before' parameter — must be ISO-8601");
    }
    criteria.sentBefore = date;
  }

  return criteria;
}
