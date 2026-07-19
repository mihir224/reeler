"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner } from "@/components/shared";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await authFetch("/signup", { method: "POST", body: { name, email, password } });
      await refresh();
      router.push("/onboarding/app");
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Signup failed",
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
            <CardTitle>Create your account</CardTitle>
            <CardDescription>Start onboarding to create your first app.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <MessageBanner message={message} />
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating account..." : "Sign up"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
