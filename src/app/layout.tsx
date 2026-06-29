import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Premium pairing: Inter for UI text, JetBrains Mono for financial figures.
// Loaded as CSS variables so globals.css can map --font-sans / --font-mono and
// numbers stay tabular without layout shift.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

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
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full bg-[#06070a]">{children}</body>
    </html>
  );
}
