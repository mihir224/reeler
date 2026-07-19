"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner } from "@/components/shared";
import { dashboardFetch, type CatalogEvent } from "@/lib/api";
import { getOnboardingAppId, setOnboardingEndpointSecret } from "@/lib/onboarding";

export default function OnboardingEndpointsPage() {
  const router = useRouter();
  const [appId, setAppId] = useState<string | null>(null);
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [url, setUrl] = useState("http://localhost:4000/webhook");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const id = getOnboardingAppId();
    if (!id) {
      router.replace("/onboarding/app");
      return;
    }
    setAppId(id);
    void loadEvents(id);
  }, [router]);

  async function loadEvents(id: string) {
    const data = (await dashboardFetch(`/apps/${id}/events`)) as { events: CatalogEvent[] };
    setEvents(data.events);
    setSelectedEvents(data.events.map((event) => event.name));
  }

  function toggleEvent(name: string) {
    setSelectedEvents((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!appId || selectedEvents.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = (await dashboardFetch(`/apps/${appId}/endpoints`, {
        method: "POST",
        body: { url, event_types: selectedEvents },
      })) as {
        verification?: { signing_secret?: string };
      };
      if (response.verification?.signing_secret) {
        setOnboardingEndpointSecret(response.verification.signing_secret);
      }
      router.push("/onboarding/credentials");
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to register endpoint",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>Register webhook endpoint</CardTitle>
        <CardDescription>Choose a URL and subscribed event types.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <MessageBanner message={message} />
          <Field label="Webhook URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} required />
          </Field>
          <Field label="Subscribed events">
            <div className="space-y-2 rounded-md border p-3">
              {events.map((event) => (
                <label key={event.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event.name)}
                    onChange={() => toggleEvent(event.name)}
                  />
                  <span className="font-mono">{event.name}</span>
                </label>
              ))}
            </div>
          </Field>
          <Button type="submit" disabled={busy || !appId || selectedEvents.length === 0}>
            Continue to credentials
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
