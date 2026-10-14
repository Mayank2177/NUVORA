import { EmployerShell } from "@/components/employer-shell";
import { redirect } from "next/navigation";
import { getInitialEmployerRecord, getInitialSession } from "@/lib/server-session";

export default async function EmployerWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getInitialSession();
  if (!user) redirect("/login");
  if (user.role !== "employer") redirect("/dashboard");
  const record = await getInitialEmployerRecord(user.id);
  if (!record) redirect("/employer/onboarding");
  return <EmployerShell record={record}>{children}</EmployerShell>;
}
