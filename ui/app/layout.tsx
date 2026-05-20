import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Webhook Relay Console",
  description: "Demo console for testing reliable webhook delivery end to end.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
