"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  KeyRound,
  Play,
  Radar,
  RefreshCcw,
  RotateCcw,
  Send,
  Server,
  ShieldCheck,
  TerminalSquare,
  Webhook,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Delivery = {
  id: string;
  event_id: string;
  event_type: string;
  endpoint_url: string;
  status: string;
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  last_response_code: number | null;
  created_at: string;
};

type ReceiverEvent = {
  event_id: string | null;
  timestamp: string | null;
  signature_present: boolean;
  duplicate: boolean;
  payload: unknown;
  received_at: number;
};

type Health = "unknown" | "ok" | "down";

const DEFAULT_PAYLOAD = JSON.stringify(
  {
    invoice_id: "inv_123",
    amount: 4999,
    currency: "usd",
    customer_id: "cus_demo_001",
  },
  null,
  2,
);

export function DemoConsole() {
  const [platformUrl, setPlatformUrl] = useState("http://localhost:3000");
  const [receiverUrl, setReceiverUrl] = useState("http://localhost:4000");
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("http://localhost:4000/webhook");
  const [eventTypes, setEventTypes] = useState("payment_success");
  const [eventType, setEventType] = useState("payment_success");
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [receiverEvents, setReceiverEvents] = useState<ReceiverEvent[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [platformHealth, setPlatformHealth] = useState<Health>("unknown");
  const [receiverHealth, setReceiverHealth] = useState<Health>("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastEndpointId, setLastEndpointId] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("webhook-demo-config");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setPlatformUrl(parsed.platformUrl ?? "http://localhost:3000");
      setReceiverUrl(parsed.receiverUrl ?? "http://localhost:4000");
      setApiKey(parsed.apiKey ?? "");
      setEndpointUrl(parsed.endpointUrl ?? "http://localhost:4000/webhook");
    } catch {
      // Ignore invalid local storage state.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "webhook-demo-config",
      JSON.stringify({ platformUrl, receiverUrl, apiKey, endpointUrl }),
    );
  }, [platformUrl, receiverUrl, apiKey, endpointUrl]);

  const filteredDeliveries = useMemo(() => {
    if (selectedStatus === "all") return deliveries;
    return deliveries.filter((delivery) => delivery.status === selectedStatus);
  }, [deliveries, selectedStatus]);

  const stats = useMemo(() => {
    const delivered = deliveries.filter((delivery) => delivery.status === "delivered").length;
    const failed = deliveries.filter((delivery) => delivery.status === "failed").length;
    const pending = deliveries.filter((delivery) =>
      ["pending", "retry_scheduled", "in_progress"].includes(delivery.status),
    ).length;
    return { delivered, failed, pending };
  }, [deliveries]);

  async function checkHealth() {
    setBusy("health");
    setMessage(null);
    const [platform, receiver] = await Promise.all([healthcheck(platformUrl), healthcheck(receiverUrl)]);
    setPlatformHealth(platform ? "ok" : "down");
    setReceiverHealth(receiver ? "ok" : "down");
    setMessage({
      kind: platform && receiver ? "success" : "error",
      text: platform && receiver ? "Both services are reachable." : "One or more services are not reachable.",
    });
    setBusy(null);
  }

  async function registerEndpoint() {
    setBusy("endpoint");
    setMessage(null);
    try {
      const response = await platformFetch("/v1/endpoints", {
        method: "POST",
        body: {
          url: endpointUrl,
          event_types: eventTypes
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        },
      });
      setLastEndpointId(response.endpoint.id);
      setMessage({
        kind: "success",
        text: response.verification
          ? `Endpoint registered: ${response.endpoint.id}. Copy the signing secret now; it will not be shown again.`
          : `Endpoint already existed; subscriptions updated: ${response.endpoint.id}`,
      });
      await refreshDeliveries();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function sendEvent() {
    setBusy("event");
    setMessage(null);
    try {
      const response = await platformFetch("/v1/events", {
        method: "POST",
        body: {
          event_type: eventType,
          payload: JSON.parse(payload),
        },
      });
      setLastEventId(response.event_id);
      setMessage({
        kind: "success",
        text: `Event accepted with ${response.delivery_count} delivery row(s).`,
      });
      window.setTimeout(() => {
        void refreshAll();
      }, 900);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function refreshAll() {
    setBusy("refresh");
    setMessage(null);
    await Promise.all([refreshDeliveries(), refreshReceiverEvents()]);
    setBusy(null);
  }

  async function refreshDeliveries() {
    try {
      const response = await platformFetch("/v1/deliveries");
      setDeliveries(response.deliveries ?? []);
    } catch (error) {
      showError(error);
    }
  }

  async function refreshReceiverEvents() {
    try {
      const response = await fetch("/api/receiver/events", {
        headers: {
          "x-receiver-url": receiverUrl,
        },
        cache: "no-store",
      });
      const parsed = await parseResponse(response);
      setReceiverEvents(parsed.events ?? []);
    } catch (error) {
      showError(error);
    }
  }

  async function replayDelivery(deliveryId: string) {
    setBusy(deliveryId);
    setMessage(null);
    try {
      await platformFetch(`/v1/deliveries/${deliveryId}/replay`, { method: "POST" });
      setMessage({ kind: "success", text: "Delivery replay queued." });
      await refreshDeliveries();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function platformFetch(path: string, options: { method?: string; body?: unknown } = {}) {
    const normalizedApiKey = normalizeApiKey(apiKey);
    if (!normalizedApiKey) throw new Error("Add the platform API key first.");
    const response = await fetch(`/api/platform${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${normalizedApiKey}`,
        "x-platform-url": platformUrl,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
    return parseResponse(response);
  }

  async function healthcheck(target: string) {
    try {
      const response = await fetch(`/api/healthcheck?target=${encodeURIComponent(target)}`, {
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function showError(error: unknown) {
    setMessage({
      kind: "error",
      text: error instanceof Error ? error.message : "Something went wrong.",
    });
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-lg border border-border bg-card px-4 py-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Webhook className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-normal">Reeler Demo Console</h1>
                <Badge variant="outline">Local demo</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Register a receiver, publish an event, and watch delivery state move through the system.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Platform" value={platformHealth} />
            <StatusPill label="Receiver" value={receiverHealth} />
            <Button variant="outline" onClick={checkHealth} disabled={busy === "health"}>
              <Radar className="mr-2 h-4 w-4" />
              Check
            </Button>
            <Button onClick={refreshAll} disabled={busy === "refresh"}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </header>

        {message ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
              message.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800",
            )}
          >
            {message.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {message.text}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Runtime Config
                </CardTitle>
                <CardDescription>Saved locally in this browser.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Platform API">
                  <Input value={platformUrl} onChange={(event) => setPlatformUrl(event.target.value)} />
                </Field>
                <Field label="Receiver service">
                  <Input value={receiverUrl} onChange={(event) => setReceiverUrl(event.target.value)} />
                </Field>
                <Field label="API key">
                  <Input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    type="password"
                    placeholder="whsec_..."
                  />
                </Field>
                <div className="rounded-md border bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
                  Run the platform on <span className="font-medium text-foreground">:3000</span>, receiver on{" "}
                  <span className="font-medium text-foreground">:4000</span>, and this UI on{" "}
                  <span className="font-medium text-foreground">:3001</span>.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  Flow Snapshot
                </CardTitle>
                <CardDescription>Current local state from the API and receiver.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Metric label="Delivered" value={stats.delivered} tone="success" />
                <Metric label="Pending or retrying" value={stats.pending} tone="warning" />
                <Metric label="Failed" value={stats.failed} tone="danger" />
                <Metric label="Receiver events" value={receiverEvents.length} tone="neutral" />
                <Separator />
                <CopyLine label="Last endpoint" value={lastEndpointId} />
                <CopyLine label="Last event" value={lastEventId} />
              </CardContent>
            </Card>
          </aside>

          <div className="grid min-w-0 grid-cols-1 gap-5">
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    1. Register Receiver Endpoint
                  </CardTitle>
                  <CardDescription>Create a delivery target in the platform for a cataloged event type.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Webhook URL">
                    <Input value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} />
                  </Field>
                  <Field label="Subscribed event types">
                    <Input value={eventTypes} onChange={(event) => setEventTypes(event.target.value)} />
                  </Field>
                  <Button className="w-full" onClick={registerEndpoint} disabled={busy === "endpoint"}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Register Endpoint
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-primary" />
                    2. Publish Event
                  </CardTitle>
                  <CardDescription>Ingest a registered event and let the worker deliver it asynchronously.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Event type">
                    <Input value={eventType} onChange={(event) => setEventType(event.target.value)} />
                  </Field>
                  <Field label="Payload">
                    <Textarea
                      className="min-h-[172px] font-mono text-xs"
                      value={payload}
                      onChange={(event) => setPayload(event.target.value)}
                    />
                  </Field>
                  <Button className="w-full" onClick={sendEvent} disabled={busy === "event"}>
                    <Play className="mr-2 h-4 w-4" />
                    Send Event
                  </Button>
                </CardContent>
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <Card className="min-w-0">
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      Delivery Ledger
                    </CardTitle>
                    <CardDescription>Rows are created by ingestion and advanced by the worker.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["all", "pending", "delivered", "failed"].map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={selectedStatus === status ? "default" : "outline"}
                        onClick={() => setSelectedStatus(status)}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-md border">
                    <div className="grid grid-cols-[1fr_120px_92px_86px] bg-muted px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                      <span>Delivery</span>
                      <span>Status</span>
                      <span>Attempts</span>
                      <span>Action</span>
                    </div>
                    <div className="max-h-[420px] overflow-auto">
                      {filteredDeliveries.length === 0 ? (
                        <EmptyState text="No deliveries yet. Register an endpoint, send an event, then refresh." />
                      ) : (
                        filteredDeliveries.map((delivery) => (
                          <div
                            key={delivery.id}
                            className="grid grid-cols-[1fr_120px_92px_86px] items-center gap-3 border-t px-3 py-3 text-sm"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{delivery.event_type}</div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">{delivery.endpoint_url}</div>
                              <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{delivery.id}</div>
                            </div>
                            <StatusBadge status={delivery.status} />
                            <span className="text-sm tabular-nums">{delivery.attempt_count}</span>
                            <Button
                              size="icon"
                              variant="outline"
                              disabled={delivery.status !== "failed" || busy === delivery.id}
                              onClick={() => replayDelivery(delivery.id)}
                              title="Replay failed delivery"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-primary" />
                    Receiver Inbox
                  </CardTitle>
                  <CardDescription>What the FastAPI receiver actually saw.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[460px] space-y-3 overflow-auto">
                    {receiverEvents.length === 0 ? (
                      <EmptyState text="No received events yet. Start the receiver and send a matching event." />
                    ) : (
                      receiverEvents.map((event, index) => (
                        <div key={`${event.event_id}-${index}`} className="rounded-md border bg-background p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="truncate font-mono text-xs">{event.event_id ?? "no-event-id"}</span>
                            <div className="flex shrink-0 gap-1">
                              {event.signature_present ? <Badge variant="success">signed</Badge> : <Badge variant="outline">unsigned</Badge>}
                              {event.duplicate ? <Badge variant="warning">duplicate</Badge> : null}
                            </div>
                          </div>
                          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs leading-5">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                <FlowStep icon={Send} title="Ingest" detail="API persists event and delivery rows" />
                <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                <FlowStep icon={RefreshCcw} title="Deliver" detail="Worker claims due rows and signs requests" />
                <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                <FlowStep icon={CheckCircle2} title="Observe" detail="Inspect receiver events and delivery state" />
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: Health }) {
  const ok = value === "ok";
  const down = value === "down";
  return (
    <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          ok && "bg-emerald-500",
          down && "bg-rose-500",
          value === "unknown" && "bg-slate-300",
        )}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "delivered") return <Badge variant="success">delivered</Badge>;
  if (status === "failed") return <Badge variant="danger">failed</Badge>;
  if (status === "retry_scheduled") return <Badge variant="warning">retry</Badge>;
  if (status === "in_progress") return <Badge variant="secondary">active</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "success" && "text-emerald-700",
          tone === "warning" && "text-amber-700",
          tone === "danger" && "text-rose-700",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CopyLine({ label, value }: { label: string; value: string | null }) {
  async function copy() {
    if (value) await navigator.clipboard.writeText(value);
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <button
        className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left font-mono text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={copy}
        disabled={!value}
        title="Copy"
      >
        <span className="truncate">{value ?? "not available"}</span>
        <Clipboard className="h-3 w-3 shrink-0" />
      </button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-3 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function FlowStep({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let parsed: any = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(parsed.error ?? parsed.detail ?? `Request failed with ${response.status}`);
  }
  return parsed;
}

function normalizeApiKey(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "").trim();
}
