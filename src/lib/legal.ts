// Details that appear on the public legal pages. They live here rather than
// inline so the contact address and dates are changed in exactly one place —
// Meta's reviewers do check that the contact route on a privacy policy is real
// and reachable, and a stale address is a rejection.

export const LEGAL = {
  // The operating company behind MAIRO. This is the entity that appears on the
  // Meta business portfolio and must match business verification documents.
  companyName: "BLING Marketing",
  productName: "MAIRO",

  // Where customers, Meta's reviewers and anyone exercising a privacy right
  // reach a person. Set NEXT_PUBLIC_SUPPORT_EMAIL to a monitored address on a
  // domain the business owns (e.g. support@ on mairo.io, once its mail is set
  // up) and every legal page, error message and support link follows. Until
  // then, the address that has always been published here.
  contactEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "hellabxndz11@gmail.com",

  // Bump when the substance changes, not for typo fixes.
  lastUpdated: "9 October 2026",

  // How long a deletion request takes to complete, stated as a promise on the
  // data deletion page. Keep the page and reality in agreement.
  deletionWindowDays: 30,
} as const;
