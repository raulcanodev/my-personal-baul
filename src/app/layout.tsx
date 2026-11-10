import "@/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";

import { ThemeProvider } from "@/components/baul/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "Baúl · Tu espacio personal",
  description: "Tus finanzas y tus cosas, en un lugar tranquilo.",
  applicationName: "Baúl",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Baúl", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a17" },
  ],
  viewportFit: "cover",
  // Android: the keyboard shrinks the layout (and 100dvh), so dialogs fit above it
  interactiveWidget: "resizes-content",
  width: "device-width",
  initialScale: 1,
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geist.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TRPCReactProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster position="top-center" />
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
