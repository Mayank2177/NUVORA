import { EmployerShell } from "@/components/employer-shell";

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  return <EmployerShell>{children}</EmployerShell>;
}