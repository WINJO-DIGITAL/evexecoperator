import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/hooks/useToast";
import { DEPLOYMENT_BRAND } from "@/lib/deploymentBrand";

export const metadata: Metadata = {
  title: `${DEPLOYMENT_BRAND.name} | Airport Transfer Calendar`,
  description: `Premium airport transfer management for ${DEPLOYMENT_BRAND.name} operators.`,
  applicationName: `${DEPLOYMENT_BRAND.name} Operator`,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: DEPLOYMENT_BRAND.name,
    statusBarStyle: "black",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#E9EBF2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#E9EBF2] text-[#0F1B33] antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
