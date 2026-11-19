import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ConnectionsProvider, StatusLine } from "@/components/connections-provider";
import { currentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snowball · Your debt, in focus",
  description: "Connect your credit cards and take the first step toward paying down debt.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const signedIn = !!await currentUser();
  return <html lang="en"><body>
    <ConnectionsProvider enabled={signedIn}>
      <AppHeader signedIn={signedIn} />
      <main className="page"><StatusLine />{children}</main>
    </ConnectionsProvider>
  </body></html>;
}
