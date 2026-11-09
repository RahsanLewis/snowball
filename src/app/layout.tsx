import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snowball · Your debt, in focus",
  description: "Connect your credit cards and take the first step toward paying down debt.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
