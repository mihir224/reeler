"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner, ShowOnceSecret } from "@/components/shared";
import { dashboardFetch, type CatalogEvent, type Endpoint } from "@/lib/api";

export default function AppEndpointsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [catalog, setCatalog] = useState<CatalogEvent[]>([]);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function load() {
    const [endpointData, eventData] = await Promise.all([
      dashboardFetch(`/apps/${appId}/endpoints`) as Promise<{ endpoints: Endpoint[] }>,
      dashboardFetch(`/apps/${appId}/events`) as Promise<{ events: CatalogEvent[] }>,
    ]);
    setEndpoints(endpointData.endpoints);
    setCatalog(eventData.events);
    setSelected(eventData.events.map((event) => event.name));
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load endpoints" }),
    );
  }, [appId]);

  function toggleEvent(name: string) {
    setSelected((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (selected.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = (await dashboardFetch(`/apps/${appId}/endpoints`, {
        method: "POST",
        body: { url, event_types: selected },
      })) as { verification?: { signing_secret?: string } };
      if (response.verification?.signing_secret) {
        setCreatedSecret(response.verification.signing_secret);
      }
      setUrl("");
      await load();
      setMessage({ kind: "success", text: "Endpoint saved" });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save endpoint",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>Webhook endpoints</CardTitle>
          <CardDescription>Signing secrets are shown once when an endpoint is first created.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MessageBanner message={message} />
          {createdSecret ? <ShowOnceSecret label="Signing secret" value={createdSecret} /> : null}
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Webhook URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" required />
            </Field>
            <Field label="Subscribed events">
              <div className="space-y-2 rounded-md border p-3">
                {catalog.map((event) => (
                  <label key={event.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(event.name)}
                      onChange={() => toggleEvent(event.name)}
                    />
                    <span className="font-mono">{event.name}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Button type="submit" disabled={busy || selected.length === 0}>
              Register endpoint
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>Active endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="rounded-md border px-3 py-2">
                <div>{endpoint.url}</div>
                <div className="font-mono text-xs text-muted-foreground">{endpoint.event_types.join(", ")}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
