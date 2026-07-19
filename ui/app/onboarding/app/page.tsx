"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner } from "@/components/shared";
import { dashboardFetch } from "@/lib/api";
import { setOnboardingAppId } from "@/lib/onboarding";

export default function OnboardingAppPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const app = (await dashboardFetch("/apps", {
        method: "POST",
        body: { name },
      })) as { id: string };
      setOnboardingAppId(app.id);
      router.push("/onboarding/events");
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create app",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>Create your first app</CardTitle>
        <CardDescription>Apps isolate events, endpoints, and API keys.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <MessageBanner message={message} />
          <Field label="App name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments service" required />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating..." : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
