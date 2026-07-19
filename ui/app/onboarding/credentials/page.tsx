"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, MessageBanner, ShowOnceSecret } from "@/components/shared";
import { dashboardFetch } from "@/lib/api";
import { getOnboardingAppId, getOnboardingEndpointSecret } from "@/lib/onboarding";

export default function OnboardingCredentialsPage() {
  const router = useRouter();
  const [appId, setAppId] = useState<string | null>(null);
  const [label, setLabel] = useState("Production key");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [endpointSecret, setEndpointSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const id = getOnboardingAppId();
    if (!id) {
      router.replace("/onboarding/app");
      return;
    }
    setAppId(id);
    setEndpointSecret(getOnboardingEndpointSecret());
  }, [router]);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    if (!appId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = (await dashboardFetch(`/apps/${appId}/api-keys`, {
        method: "POST",
        body: { label },
      })) as { api_key: string };
      setApiKey(response.api_key);
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create API key",
      });
    } finally {
      setBusy(false);
    }
  }

  const sampleCurl =
    apiKey &&
    `curl -X POST http://localhost:3000/v1/events \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"event_type":"payment_success","payload":{"invoice_id":"inv_123"}}'`;

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>Your credentials</CardTitle>
        <CardDescription>These secrets are shown once. Copy them before continuing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <MessageBanner message={message} />
        {!apiKey ? (
          <form className="space-y-4" onSubmit={createKey}>
            <Field label="API key label">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={busy}>
              Generate API key
            </Button>
          </form>
        ) : (
          <ShowOnceSecret label="API key" value={apiKey} description="Use this key to ingest events via /v1/events." />
        )}
        {endpointSecret ? (
          <ShowOnceSecret
            label="Endpoint signing secret"
            value={endpointSecret}
            description="Use this to verify webhook signatures on your receiver."
          />
        ) : null}
        {sampleCurl ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Sample curl</div>
            <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">{sampleCurl}</pre>
          </div>
        ) : null}
        <Button
          disabled={!apiKey}
          onClick={() => router.push("/onboarding/complete")}
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
