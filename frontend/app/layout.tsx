// Type-only imports help TypeScript check our code; they do not run in the browser.
import type { Metadata } from "next";
import type { ReactNode } from "react";
// Apply our shared styles to the page inside this layout.
import "./globals.css";

// Next.js uses these values for the browser-tab title and description metadata.
export const metadata: Metadata = {
  title: "Japanese Voice Trainer",
  description: "A Japanese conversation learning project.",
};

// Next.js wraps each page with this layout. children is the page content.
// ReactNode describes content React can render. The layout supplies html and body.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
