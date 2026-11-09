import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { UmamiAnalytics } from "@/components/analytics/umami-analytics";
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

const socialImageAlt = `${brand.name} — ${brand.slogan.en.join(" ")} ${brand.slogan.zh.join("")}`;

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
        alt: socialImageAlt,
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
        alt: socialImageAlt,
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
      <body>
        <Script
          id="umami-url-filter"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.umamiBeforeSend = function(type, payload) {
              if (!payload || typeof payload !== "object") return payload;
              for (const field of ["url", "referrer"]) {
                if (typeof payload[field] !== "string" || !payload[field]) continue;
                try {
                  const url = new URL(payload[field], window.location.origin);
                  const params = new URLSearchParams();
                  for (const [key, value] of url.searchParams) {
                    if (/^utm_(source|medium|campaign|term|content)$/i.test(key)) params.append(key, value);
                  }
                  url.search = params.toString();
                  payload[field] = url.href;
                } catch {}
              }
              return payload;
            };`,
          }}
        />
        {children}
        <Analytics />
        <UmamiAnalytics
          websiteId={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? ""}
          trackerUrl={process.env.NEXT_PUBLIC_UMAMI_TRACKER_URL ?? ""}
          recorderUrl={process.env.NEXT_PUBLIC_UMAMI_RECORDER_URL ?? ""}
        />
      </body>
    </html>
  );
}
