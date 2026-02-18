import type { Metadata, Viewport } from "next";
import "./globals.css";
import OfflineIndicator from "./components/OfflineIndicator";
export const metadata: Metadata = {
  title: "Яриші",
  description: "Спільні списки покупок та справ для всієї сімʼї",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Яриші",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a1a",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body>
        <OfflineIndicator />
        {children}
      </body>
    </html>
  );
}
