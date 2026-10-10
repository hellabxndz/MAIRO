import { Plus_Jakarta_Sans } from "next/font/google";

// The public site's typeface: the landing page, sign-up and sign-in, and the
// legal pages. One instance, so every public page sets type the same way and
// the browser downloads the font once.
export const brandFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });
