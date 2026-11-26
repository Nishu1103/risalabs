import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { AppProvider } from "@/components/app-context";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "CampusFest 2025 — Sponsorship Growth Center",
  description: "Sponsorship growth command center with snapshot analytics, pipeline & task management and a tool-calling AI copilot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
