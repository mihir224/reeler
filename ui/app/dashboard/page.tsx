"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner } from "@/components/shared";
import { dashboardFetch, type App } from "@/lib/api";

export default function DashboardPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function loadApps() {
    const data = (await dashboardFetch("/apps")) as { apps: App[] };
    setApps(data.apps);
  }

  useEffect(() => {
    void loadApps().catch((error) =>
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load apps" }),
    );
  }, []);

  async function createApp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await dashboardFetch("/apps", { method: "POST", body: { name } });
      setName("");
      await loadApps();
      setMessage({ kind: "success", text: "App created" });
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
    <div className="space-y-4">
      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>Your apps</CardTitle>
          <CardDescription>Manage event catalogs, endpoints, API keys, and deliveries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MessageBanner message={message} />
          {apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No apps yet. Create one below or finish onboarding.</p>
          ) : (
            <ul className="space-y-2">
              {apps.map((app) => (
                <li key={app.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <div className="font-medium">{app.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{app.id}</div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/apps/${app.id}`}>Open</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>Create app</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createApp}>
            <Field label="App name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={busy} className="self-end">
              Create
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
