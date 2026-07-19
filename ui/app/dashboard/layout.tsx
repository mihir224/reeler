"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, LayoutDashboard, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

function navLink(href: string, label: string, pathname: string) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const appMatch = pathname.match(/^\/dashboard\/apps\/([^/]+)/);
  const appId = appMatch?.[1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f3ee] via-[#eef6f4] to-[#f8faf9]">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-4 rounded-lg border bg-card p-4 shadow-panel">
          <div>
            <Link href="/" className="text-sm font-medium text-primary">
              Reeler
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">{user?.name ?? "Dashboard"}</p>
          </div>
          <nav className="flex flex-col gap-1">
            {navLink("/dashboard", "Apps", pathname)}
            {appId ? (
              <>
                {navLink(`/dashboard/apps/${appId}`, "Overview", pathname)}
                {navLink(`/dashboard/apps/${appId}/events`, "Events", pathname)}
                {navLink(`/dashboard/apps/${appId}/endpoints`, "Endpoints", pathname)}
                {navLink(`/dashboard/apps/${appId}/deliveries`, "Deliveries", pathname)}
              </>
            ) : null}
            {navLink("/dashboard/profile", "Profile", pathname)}
          </nav>
          <div className="space-y-2 border-t pt-4">
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/demo-console">
                <FlaskConical className="mr-2 h-4 w-4" />
                Demo console
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => void logout().then(() => (window.location.href = "/"))}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>
        <main className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
            {user ? (
              <>
                <span>·</span>
                <User className="h-4 w-4" />
                {user.email}
              </>
            ) : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
