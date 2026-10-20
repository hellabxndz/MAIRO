// Pictures for the homepage's creative showcase, one per sample ad.
//
// Each is either a 3D product render made for this page (source "Render":
// modelled, lit and rendered with Blender, of products for the cards'
// fictional brands) or licensed stock photography or the owner's own. None is
// presented as a customer's product or result: the brands stay fictional and
// every card still says "Sample". A key without a picture keeps its drawn
// illustration (sample-creatives.tsx), so the section works with any number
// of these filled in.
//
// Files live in public/showcase/. For a photograph, keep the credit and the
// link to the original, so where every picture came from can be checked.

export type ShowcasePhoto = {
  /** Path under public/, e.g. "/showcase/fashion.jpg". */
  src: string;
  /** What the photo shows, for screen readers. */
  alt: string;
  /** The photographer, as the source credits them. */
  credit: string;
  source: "Render" | "Unsplash" | "Pexels" | "Owner";
  /** The photo's page at the source. */
  href?: string;
  /** CSS object-position, to keep the subject in frame when cropped. */
  focus?: string;
  /** The headline's colour on this picture: dark type where the picture is light behind it. White by default, over a scrim. */
  ink?: "dark" | "light";
};

const render = (key: string, alt: string, extra: Partial<ShowcasePhoto> = {}): ShowcasePhoto => ({
  src: `/showcase/${key}.jpg`,
  alt,
  credit: "MAIRO",
  source: "Render",
  ...extra,
});

export const SHOWCASE_PHOTOS: Partial<Record<string, ShowcasePhoto>> = {
  fashion: render("fashion", "Three folded overshirts stacked on a warm studio backdrop: green check on top, then oatmeal wool and rust check.", { ink: "dark" }),
  fitness: render("fitness", "Two black hex dumbbells and a blue steel water bottle on a dark rubber gym floor."),
  skincare: render("skincare", "An amber serum bottle and a frosted pump bottle on a stone plinth, with a small jar in front, on a blush backdrop.", { ink: "dark" }),
  local: render("local", "Chrome drain pipes and shut-off valves under a sink, with a wrench and a cloth on the cabinet floor."),
  luxury: render("luxury", "A gold ring with a round diamond in an open ring box of navy velvet."),
  realestate: render("realestate", "A brass key and a silver key on a ring beside a small wooden house-shaped tag, on pale marble.", { ink: "dark" }),
  online: render("online", "Two glazed stoneware mugs, sage and cream, a rust bowl and a kraft gift box on a walnut table."),
  furniture: render("furniture", "A sage green two-seat sofa with a rust cushion and a round side table, in afternoon sun through a window.", { ink: "dark" }),
  services: render("services", "A printed financial statement, a calculator, a pen and a coffee on a navy desk mat."),
};
