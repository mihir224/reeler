import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reeler",
  description: "Onboarding and operations UI for reliable event delivery.",
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
