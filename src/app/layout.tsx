import type { Metadata, Viewport } from "next";
import { brand } from "@/lib/brand";
import "./globals.css";

function metadataBase(): URL {
  const candidates = [
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      const value = candidate.trim();
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return new URL(url.origin);
      }
    } catch {
      // Ignore invalid deployment configuration and try the next known origin.
    }
  }

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  applicationName: brand.name,
  title: {
    default: brand.title,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  openGraph: {
    type: "website",
    siteName: brand.name,
    title: brand.title,
    description: brand.description,
    locale: "en_US",
    alternateLocale: "zh_CN",
    images: [
      {
        url: brand.assets.social,
        width: 1200,
        height: 630,
        alt: "Course Atlas thinking campus mascot in Ohio State scarlet and gray",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: brand.title,
    description: brand.description,
    images: [
      {
        url: brand.assets.social,
        alt: "Course Atlas thinking campus mascot in Ohio State scarlet and gray",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: brand.name,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: brand.themeColor,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
