import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "@fontsource-variable/geist";
import "./globals.css";

export const metadata: Metadata = {
  title: "GATES 360 Camera",
  description: "Event display, certificate, and admin dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
