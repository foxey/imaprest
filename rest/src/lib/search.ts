export interface SearchParams {
  unseen?: string;
  from?: string;
  subject?: string;
  since?: string;
}

export interface ImapSearchCriteria {
  seen?: boolean;
  from?: string;
  subject?: string;
  since?: Date;
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

  if (params.since) {
    const date = new Date(params.since);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid 'since' parameter — must be ISO-8601");
    }
    criteria.since = date;
  }

  return criteria;
}
