import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";
export const metadata: Metadata = {
  title: "La Hotte Humbert",
  description: "Pour les âmes en panne d’inspiration",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/app-icon.svg?v=3", apple: "/apple-touch-icon.png?v=3" },
};
export const viewport: Viewport = { themeColor: "#3155FF" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
