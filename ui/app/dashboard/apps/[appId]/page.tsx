"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner, ShowOnceSecret, StatusBadge } from "@/components/shared";
import { dashboardFetch, type ApiKeyMeta, type Delivery } from "@/lib/api";

export default function AppOverviewPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [label, setLabel] = useState("New key");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function load() {
    const [keysData, deliveriesData] = await Promise.all([
      dashboardFetch(`/apps/${appId}/api-keys`) as Promise<{ api_keys: ApiKeyMeta[] }>,
      dashboardFetch(`/apps/${appId}/deliveries`) as Promise<{ deliveries: Delivery[] }>,
    ]);
    setKeys(keysData.api_keys);
    setDeliveries(deliveriesData.deliveries.slice(0, 5));
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load app" }),
    );
  }, [appId]);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = (await dashboardFetch(`/apps/${appId}/api-keys`, {
        method: "POST",
        body: { label },
      })) as { api_key: string };
      setCreatedKey(response.api_key);
      await load();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create API key",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(keyId: string) {
    setBusy(true);
    try {
      await dashboardFetch(`/apps/${appId}/api-keys/${keyId}/revoke`, { method: "POST" });
      await load();
      setMessage({ kind: "success", text: "API key revoked" });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to revoke key",
      });
    } finally {
      setBusy(false);
    }
  }

  const failed = deliveries.filter((delivery) => delivery.status === "failed").length;

  return (
    <div className="space-y-4">
      <MessageBanner message={message} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">API keys</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{keys.filter((k) => !k.revoked_at).length}</CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">Recent deliveries</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{deliveries.length}</CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">Failed (recent)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-rose-700">{failed}</CardContent>
        </Card>
      </div>

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Raw keys are shown once at creation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {createdKey ? <ShowOnceSecret label="New API key" value={createdKey} /> : null}
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createKey}>
            <Field label="Label">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={busy} className="self-end">
              Create key
            </Button>
          </form>
          <ul className="space-y-2 text-sm">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <div className="font-medium">{key.label}</div>
                  <div className="font-mono text-xs text-muted-foreground">{key.id}</div>
                </div>
                {key.revoked_at ? (
                  <StatusBadge status="failed" />
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void revokeKey(key.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliveries yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {deliveries.map((delivery) => (
                <li key={delivery.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <div className="font-mono text-xs">{delivery.event_type}</div>
                    <div className="text-xs text-muted-foreground">{delivery.endpoint_url}</div>
                  </div>
                  <StatusBadge status={delivery.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
