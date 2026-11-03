import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Course Atlas · Ohio State courses",
  description:
    "Explore current Ohio State classes, meeting times, and official teaching evaluations in one place.",
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
