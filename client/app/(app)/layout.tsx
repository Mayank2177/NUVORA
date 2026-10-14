import { redirect } from "next/navigation";
import { SessionProvider } from "@/lib/auth";
import { getInitialSession } from "@/lib/server-session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getInitialSession();
  if (!user) redirect("/login");
  if (user.role === "employer") redirect("/employer");
  return (
    <SessionProvider value={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
