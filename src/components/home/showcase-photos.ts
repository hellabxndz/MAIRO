// Real photographs for the homepage's creative showcase, one per sample ad.
//
// Each picture is licensed stock photography (or the owner's own), never an
// image presented as a customer's product or result: the brands on the cards
// stay fictional and every card still says "Sample". A key without a photo
// keeps its drawn illustration (sample-creatives.tsx), so the section works
// with any number of these filled in.
//
// Files live in public/showcase/. Keep the credit and the link to the
// original, so where every picture came from can be checked.

export type ShowcasePhoto = {
  /** Path under public/, e.g. "/showcase/fashion.jpg". */
  src: string;
  /** What the photo shows, for screen readers. */
  alt: string;
  /** The photographer, as the source credits them. */
  credit: string;
  source: "Unsplash" | "Pexels" | "Owner";
  /** The photo's page at the source. */
  href?: string;
  /** CSS object-position, to keep the subject in frame when cropped. */
  focus?: string;
};

export const SHOWCASE_PHOTOS: Partial<Record<string, ShowcasePhoto>> = {};
