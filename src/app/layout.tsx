import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "OSU Eval Explorer",
  description:
    "Official Ohio State instructor and course evaluation search and comparison workspace.",
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
