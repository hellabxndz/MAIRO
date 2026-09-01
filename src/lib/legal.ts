// Details that appear on the public legal pages. They live here rather than
// inline so the contact address and dates are changed in exactly one place —
// Meta's reviewers do check that the contact route on a privacy policy is real
// and reachable, and a stale address is a rejection.

export const LEGAL = {
  // The operating company behind MAIRO. This is the entity that appears on the
  // Meta business portfolio and must match business verification documents.
  companyName: "BLING Marketing",
  productName: "MAIRO",

  // CHANGE THIS to a monitored business address before submitting for App
  // Review. Meta may email it, and users have a legal right to reach you here.
  contactEmail: "hellabxndz11@gmail.com",

  // Bump when the substance changes, not for typo fixes.
  lastUpdated: "1 September 2026",

  // How long a deletion request takes to complete, stated as a promise on the
  // data deletion page. Keep the page and reality in agreement.
  deletionWindowDays: 30,
} as const;
