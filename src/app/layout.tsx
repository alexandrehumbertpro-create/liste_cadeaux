import type { Metadata } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";
export const metadata: Metadata = {
  title: "Kad’Humbert",
  description: "Pour les âmes en panne d’inspiration",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};
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
