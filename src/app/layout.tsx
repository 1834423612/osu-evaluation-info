import { DraftGuard } from "@/components/forms/draft-guard";
import { Suspense } from "react";
import { ProductAnalytics } from "@/components/analytics/product-analytics";
import { SyncProvider } from "@/components/sync/sync-provider";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import {
  analyticsBeforeSend,
  captureLinkCapability,
  analyticsAssetUrl,
} from "@/lib/analytics/privacy";
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

const socialImageAlt = `${brand.names.en} — ${brand.slogan.en.join(" ")}`;

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
            __html: `(${captureLinkCapability.toString()})(); try {
              var debugSession = JSON.parse(sessionStorage.getItem("course-atlas:debug:session:v1") || "null");
              if (debugSession && debugSession.expiresAt > Date.now()) window.__COURSE_ATLAS_DEBUG__ = debugSession.flags;
            } catch (_) {}
            window.umamiBeforeSend = ${analyticsBeforeSend.toString()};`,
          }}
        />
        <DraftGuard />
        <SyncProvider />
        <Suspense fallback={null}>
          <ProductAnalytics />
        </Suspense>
        {children}
        <UmamiAnalytics
          websiteId={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? ""}
          trackerUrl={analyticsAssetUrl(
            process.env.NEXT_PUBLIC_UMAMI_TRACKER_URL ?? "",
            process.env.NEXT_PUBLIC_UMAMI_ASSET_VERSION ?? "3.5.0",
          )}
          recorderUrl={analyticsAssetUrl(
            process.env.NEXT_PUBLIC_UMAMI_RECORDER_URL ?? "",
            process.env.NEXT_PUBLIC_UMAMI_ASSET_VERSION ?? "3.5.0",
          )}
          release={process.env.NEXT_PUBLIC_BUILD_SHA ?? "development"}
          environment={
            process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ??
            (process.env.NODE_ENV === "production"
              ? "production"
              : "development")
          }
        />
      </body>
    </html>
  );
}
