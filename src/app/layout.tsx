import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hypermind AlphaDesk",
  description: "Private AI crypto trading command center with paper-first safety controls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#0b0d0b]">{children}</body>
    </html>
  );
}
