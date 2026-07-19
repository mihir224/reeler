"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner } from "@/components/shared";
import { authFetch, dashboardFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await authFetch("/login", { method: "POST", body: { email, password } });
      await refresh();
      const next = searchParams.get("next");
      if (next) {
        router.push(next);
        return;
      }
      const apps = (await dashboardFetch("/apps")) as { apps: Array<{ id: string }> };
      router.push(apps.apps.length > 0 ? "/dashboard" : "/onboarding/app");
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Login failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f6f3ee] via-[#eef6f4] to-[#f8faf9]">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
        <Card className="w-full shadow-panel">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Log in to manage your apps and deliveries.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <MessageBanner message={message} />
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Logging in..." : "Log in"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link href="/signup" className="text-primary hover:underline">
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
