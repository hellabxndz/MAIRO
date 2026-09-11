import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// What a search engine, a social network and a browser tab each see.
//
// metadataBase is the load-bearing one and its absence is invisible until it
// matters: without it Next emits relative URLs for the social image, and every
// preview card — every share, in every app — renders as a broken image while
// the page itself looks fine.
//
// The title says both networks now. It said "Meta ads" alone, which stopped
// being true the day TikTok shipped, and the one sentence a stranger decides
// on should not undersell the product.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "MAIRO — Meta and TikTok ads that run themselves",
    // Every other page appends to this rather than replacing it, so a tab
    // reads "Pricing · MAIRO" instead of a bare word with no owner.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "MAIRO — Meta and TikTok ads that run themselves",
    description: SITE_DESCRIPTION,
    url: siteUrl(),
  },
  twitter: {
    card: "summary_large_image",
    title: "MAIRO — Meta and TikTok ads that run themselves",
    description: SITE_DESCRIPTION,
  },
  alternates: { canonical: "/" },
  // The page is dark end to end. Telling the browser so means the scrollbar,
  // the form controls and the space above a bounced scroll are dark too,
  // rather than flashing white on the way in.
  colorScheme: "dark",
};

export const viewport = {
  themeColor: "#07070a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-white">{children}</body>
    </html>
  );
}
