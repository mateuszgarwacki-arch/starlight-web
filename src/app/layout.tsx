import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starlight Production System",
  description: "Production management for Starlight Design",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
