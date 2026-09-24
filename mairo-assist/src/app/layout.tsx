import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"),
  title: {
    default: "Mairo Assist — Your AI sales and customer service employee",
    template: "%s · Mairo Assist",
  },
  description:
    "Meet your new AI sales and customer service assistant. Turn customer questions into sales, manage orders, and provide support around the clock.",
  openGraph: {
    title: "Mairo Assist",
    description: "Your Business Never Stops. Neither Should Your AI Employee.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#04050d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
