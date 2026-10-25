import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { APP_NAME } from "@/lib/app-config";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Roster, tactical board, and substitution planning for a soccer coach's teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
