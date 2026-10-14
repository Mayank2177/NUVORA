import { redirect } from "next/navigation";
import { SessionProvider } from "@/lib/auth";
import { getInitialSession } from "@/lib/server-session";

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const user = await getInitialSession();
  if (!user) redirect("/login");
  if (user.role !== "employer") redirect("/dashboard");
  return <SessionProvider value={user}>{children}</SessionProvider>;
}
