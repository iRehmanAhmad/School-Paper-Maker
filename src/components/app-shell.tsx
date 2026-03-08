"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/classes", label: "Classes" },
  { href: "/subjects", label: "Subjects" },
  { href: "/chapters", label: "Chapters" },
  { href: "/questions", label: "Questions" },
  { href: "/paper-generator", label: "Paper Generator" },
  { href: "/templates", label: "Templates" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 md:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4">
          <h1 className="mb-4 text-lg font-semibold">Paper Generator</h1>
          <nav className="space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm ${pathname === item.href ? "bg-blue-600 text-white" : "hover:bg-slate-100"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button className="mt-4 w-full" variant="secondary" onClick={logout}>
            Logout
          </Button>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}