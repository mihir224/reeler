"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, MessageBanner } from "@/components/shared";
import { dashboardFetch, type CatalogEvent } from "@/lib/api";

export default function AppEventsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function load() {
    const data = (await dashboardFetch(`/apps/${appId}/events`)) as { events: CatalogEvent[] };
    setEvents(data.events);
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load events" }),
    );
  }, [appId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await dashboardFetch(`/apps/${appId}/events`, {
        method: "POST",
        body: { name, description },
      });
      setName("");
      setDescription("");
      await load();
      setMessage({ kind: "success", text: "Event type registered" });
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
        <CardTitle>Event catalog</CardTitle>
        <CardDescription>Registered event types for this app.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <MessageBanner message={message} />
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Event name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="order_created" required />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <Button type="submit" disabled={busy}>
            Add event type
          </Button>
        </form>
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="font-mono font-medium">{event.name}</div>
              {event.description ? <div className="text-muted-foreground">{event.description}</div> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
