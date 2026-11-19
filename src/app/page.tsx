import { Dashboard } from "@/components/dashboard";
import { Landing } from "@/components/landing";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  return await currentUser() ? <Dashboard /> : <Landing />;
}
