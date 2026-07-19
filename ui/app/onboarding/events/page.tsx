"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, MessageBanner } from "@/components/shared";
import { dashboardFetch, type CatalogEvent } from "@/lib/api";
import { getOnboardingAppId } from "@/lib/onboarding";

export default function OnboardingEventsPage() {
  const router = useRouter();
  const [appId, setAppId] = useState<string | null>(null);
  const [name, setName] = useState("payment_success");
  const [description, setDescription] = useState("Payment completed successfully");
  const [events, setEvents] = useState<CatalogEvent[]>([]);
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
  }

  async function addEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!appId) return;
    setBusy(true);
    setMessage(null);
    try {
      await dashboardFetch(`/apps/${appId}/events`, {
        method: "POST",
        body: { name, description },
      });
      await loadEvents(appId);
      setMessage({ kind: "success", text: `Registered ${name}` });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to register event",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>Register event types</CardTitle>
        <CardDescription>Define the events your app will send to webhooks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <MessageBanner message={message} />
        <form className="space-y-4" onSubmit={addEvent}>
          <Field label="Event name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <Button type="submit" disabled={busy || !appId}>
            Add event type
          </Button>
        </form>
        {events.length > 0 ? (
          <ul className="space-y-2 rounded-md border p-3 text-sm">
            {events.map((event) => (
              <li key={event.id}>
                <span className="font-mono">{event.name}</span>
                {event.description ? <span className="text-muted-foreground"> — {event.description}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          variant="outline"
          disabled={events.length === 0}
          onClick={() => router.push("/onboarding/endpoints")}
        >
          Continue to endpoint
        </Button>
      </CardContent>
    </Card>
  );
}
