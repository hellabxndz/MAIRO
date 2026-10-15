import { Inter } from "next/font/google";

// The public site's reading face: the landing page, the free plan, sign-up
// and sign-in, and the legal pages. Headings are Geist (the display face,
// loaded in app/layout.tsx and set in globals.css), so the site and the app
// share one heading voice. One instance, so every public page sets type the
// same way and the browser downloads the font once.
export const brandFont = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
