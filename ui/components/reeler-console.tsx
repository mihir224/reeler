"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type View = "login" | "signup" | "onboarding" | "dashboard";

type User = {
  id: string;
  email: string;
  name: string;
};

type AppRecord = {
  id: string;
  name: string;
  created_at: string;
};

type CatalogEvent = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type EndpointRecord = {
  id: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

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

type AppStats = {
  event_catalog_count: number;
  endpoint_count: number;
  event_count: number;
  failed_delivery_count: number;
};

type AppCredentials = {
  id: string;
  label: string;
  api_key: string;
};

type EndpointVerification = {
  scheme: string;
  signing_secret: string;
  signature_header: string;
  timestamp_header: string;
  event_id_header: string;
};

const PLATFORM_URL_KEY = "reeler-platform-url";
const TOKEN_KEY = "reeler-dashboard-token";

export function ReelerConsole({ view }: { view: View }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);
  const [platformUrl, setPlatformUrl] = useState("http://localhost:3000");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [appCredentials, setAppCredentials] = useState<AppCredentials | null>(null);
  const [endpointVerification, setEndpointVerification] = useState<EndpointVerification | null>(null);
  const [signupForm, setSignupForm] = useState({ name: "", email: "", password: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [appForm, setAppForm] = useState({ name: "", api_key_label: "Production key" });
  const [catalogDraft, setCatalogDraft] = useState("payment_success|Payment collected\ninvoice_failed|Invoice payment failed");
  const [endpointForm, setEndpointForm] = useState({
    url: "http://localhost:4000/webhook",
    event_types: "payment_success",
  });

  useEffect(() => {
    const savedPlatformUrl = window.localStorage.getItem(PLATFORM_URL_KEY);
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (savedPlatformUrl) setPlatformUrl(savedPlatformUrl);
    if (savedToken) setToken(savedToken);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PLATFORM_URL_KEY, platformUrl);
  }, [platformUrl]);

  useEffect(() => {
    if (!isHydrated) return;

    if (!token) {
      setUser(null);
      setApps([]);
      setSelectedAppId(null);
      if (view === "dashboard" || view === "onboarding") {
        router.replace("/login");
      }
      return;
    }

    window.localStorage.setItem(TOKEN_KEY, token);
    void bootstrap();
  }, [isHydrated, token, view]);

  useEffect(() => {
    if (!selectedAppId || !token || (view !== "dashboard" && view !== "onboarding")) return;
    void loadAppData(selectedAppId);
  }, [selectedAppId, token, view]);

  async function bootstrap() {
    try {
      const me = await platformFetch("/auth/me");
      setUser(me.user);
      const nextApps = await platformFetch("/dashboard/apps");
      setApps(nextApps.apps ?? []);
      const firstAppId = nextApps.apps?.[0]?.id ?? null;
      setSelectedAppId((current) => current ?? firstAppId);
      if (view === "login" || view === "signup") {
        router.replace(firstAppId ? "/dashboard" : "/onboarding");
      }
    } catch {
      handleLogout(false);
    }
  }

  async function loadAppData(appId: string) {
    try {
      const [appResponse, eventResponse, endpointResponse, deliveryResponse] = await Promise.all([
        platformFetch(`/dashboard/apps/${appId}`),
        platformFetch(`/dashboard/apps/${appId}/events`),
        platformFetch(`/dashboard/apps/${appId}/endpoints`),
        platformFetch(`/dashboard/apps/${appId}/deliveries`),
      ]);
      setStats(appResponse.stats);
      setEvents(eventResponse.events ?? []);
      setEndpoints(endpointResponse.endpoints ?? []);
      setDeliveries(deliveryResponse.deliveries ?? []);
    } catch (error) {
      showError(error);
    }
  }

  async function handleSignup() {
    setBusy("signup");
    setMessage(null);
    try {
      const response = await publicFetch("/auth/signup", signupForm);
      setToken(response.token);
      setUser(response.user);
      router.replace("/onboarding");
      setMessage({ kind: "success", text: "Account created. Let’s register your first app." });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function handleLogin() {
    setBusy("login");
    setMessage(null);
    try {
      const response = await publicFetch("/auth/login", loginForm);
      setToken(response.token);
      setUser(response.user);
      router.replace("/dashboard");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function createApp() {
    setBusy("app");
    setMessage(null);
    try {
      const response = await platformFetch("/dashboard/apps", {
        method: "POST",
        body: appForm,
      });
      setAppCredentials(response.credentials);
      setApps((current) => [response.app, ...current]);
      setSelectedAppId(response.app.id);
      setMessage({
        kind: "success",
        text: "App created. Copy the API key now, because it will not be shown again.",
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveEventCatalog() {
    if (!selectedAppId) return;
    setBusy("catalog");
    setMessage(null);
    try {
      const body = catalogDraft
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, description] = line.split("|");
          return { name: name.trim(), description: (description ?? name).trim() };
        });

      const response = await platformFetch(`/dashboard/apps/${selectedAppId}/events`, {
        method: "POST",
        body,
      });
      setEvents(response.events ?? []);
      setMessage({ kind: "success", text: "Event catalog saved." });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function createEndpoint() {
    if (!selectedAppId) return;
    setBusy("endpoint");
    setMessage(null);
    try {
      const response = await platformFetch(`/dashboard/apps/${selectedAppId}/endpoints`, {
        method: "POST",
        body: {
          url: endpointForm.url,
          event_types: endpointForm.event_types
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        },
      });
      setEndpointVerification(response.verification);
      setEndpoints((current) => [response.endpoint, ...current.filter((item) => item.id !== response.endpoint.id)]);
      setMessage({
        kind: "success",
        text: response.verification
          ? "Endpoint registered. Copy the signing secret now, because it will not be shown again."
          : "Endpoint updated.",
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function replayDelivery(deliveryId: string) {
    setBusy(deliveryId);
    try {
      await platformFetch(`/dashboard/deliveries/${deliveryId}/replay`, { method: "POST" });
      setMessage({ kind: "success", text: "Failed delivery moved back to pending." });
      if (selectedAppId) await loadAppData(selectedAppId);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  function handleLogout(announce = true) {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setApps([]);
    setSelectedAppId(null);
    setEvents([]);
    setEndpoints([]);
    setDeliveries([]);
    setStats(null);
    if (announce) setMessage({ kind: "success", text: "Signed out." });
    if (pathname !== "/login") router.push("/login");
  }

  function showError(error: unknown) {
    setMessage({
      kind: "error",
      text: error instanceof Error ? error.message : "Something went wrong.",
    });
  }

  if (view === "login" || view === "signup") {
    return (
      <AuthShell
        title={view === "login" ? "Welcome back" : "Create your Reeler account"}
        description={
          view === "login"
            ? "Use your email and password to access onboarding and the delivery dashboard."
            : "JWT-based user auth powers the dashboard, while API keys remain scoped to event ingestion."
        }
        platformUrl={platformUrl}
        setPlatformUrl={setPlatformUrl}
        message={message}
      >
        {view === "signup" ? (
          <div className="space-y-4">
            <Field label="Full name">
              <Input
                value={signupForm.name}
                onChange={(event) => setSignupForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={signupForm.email}
                onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={signupForm.password}
                onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))}
              />
            </Field>
            <Button className="w-full" onClick={handleSignup} disabled={busy === "signup"}>
              Create account
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account? <Link href="/login" className="text-primary underline-offset-4 hover:underline">Sign in</Link>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              />
            </Field>
            <Button className="w-full" onClick={handleLogin} disabled={busy === "login"}>
              Sign in
            </Button>
            <p className="text-sm text-muted-foreground">
              Need an account? <Link href="/signup" className="text-primary underline-offset-4 hover:underline">Create one</Link>
            </p>
          </div>
        )}
      </AuthShell>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[28px] border border-border/70 bg-card/95 p-6 shadow-panel">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <Badge variant="outline" className="w-fit border-teal-200 bg-teal-50 text-teal-700">
                Reeler control plane
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {view === "onboarding" ? "Ship your first webhook app" : "Own delivery operations in one place"}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {view === "onboarding"
                    ? "Create the app, define the event catalog, register endpoints, and capture one-time credentials without leaving the browser."
                    : "JWT gets you into the dashboard, API keys ingest events, and delivery health stays visible without exposing secrets again."}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
                <div className="font-medium">{user?.name ?? "Unknown user"}</div>
                <div className="text-muted-foreground">{user?.email ?? "No account loaded"}</div>
              </div>
              <Button variant="outline" asChild>
                <Link href="/demo-console">Demo console</Link>
              </Button>
              <Button variant="ghost" onClick={() => handleLogout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </header>

        {message ? (
          <Flash kind={message.kind} text={message.text} />
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="overflow-hidden rounded-[24px]">
            <CardHeader className="border-b border-border/70 bg-muted/40">
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutDashboard className="h-4 w-4 text-primary" />
                Workspace
              </CardTitle>
              <CardDescription>Switch apps, refresh data, and move between onboarding and operations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <Field label="Platform API">
                <Input value={platformUrl} onChange={(event) => setPlatformUrl(event.target.value)} />
              </Field>
              <div className="space-y-2">
                <Label>Apps</Label>
                <div className="space-y-2">
                  {apps.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                      No apps yet. Start in onboarding.
                    </div>
                  ) : (
                    apps.map((app) => (
                      <button
                        key={app.id}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors",
                          selectedAppId === app.id ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40",
                        )}
                        onClick={() => setSelectedAppId(app.id)}
                      >
                        <div>
                          <div className="font-medium">{app.name}</div>
                          <div className="text-xs text-muted-foreground">{new Date(app.created_at).toLocaleString()}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant={view === "onboarding" ? "default" : "outline"} asChild className="flex-1">
                  <Link href="/onboarding">Onboarding</Link>
                </Button>
                <Button variant={view === "dashboard" ? "default" : "outline"} asChild className="flex-1">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {view === "onboarding" ? (
            <div className="grid gap-6">
              <Card className="rounded-[24px]">
                <CardHeader>
                  <CardTitle>1. Create your app</CardTitle>
                  <CardDescription>This is the only moment the app API key will be shown.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <Field label="App name">
                    <Input
                      value={appForm.name}
                      onChange={(event) => setAppForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Payments service"
                    />
                  </Field>
                  <Field label="Initial API key label">
                    <Input
                      value={appForm.api_key_label}
                      onChange={(event) => setAppForm((current) => ({ ...current, api_key_label: event.target.value }))}
                    />
                  </Field>
                  <div className="lg:col-span-2">
                    <Button onClick={createApp} disabled={busy === "app" || !appForm.name.trim()}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Register app
                    </Button>
                  </div>
                  {appCredentials ? (
                    <SecretCard
                      title="App API key"
                      description="Copy this key into your producer once. Reeler stores only its hash."
                      secret={appCredentials.api_key}
                    />
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-[24px]">
                <CardHeader>
                  <CardTitle>2. Define the event catalog</CardTitle>
                  <CardDescription>One event per line as `event_name|Human readable description`.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    className="min-h-[180px] font-mono text-sm"
                    value={catalogDraft}
                    onChange={(event) => setCatalogDraft(event.target.value)}
                  />
                  <Button onClick={saveEventCatalog} disabled={busy === "catalog" || !selectedAppId}>
                    Save catalog
                  </Button>
                  <CompactList
                    title="Registered events"
                    items={events.map((event) => `${event.name} - ${event.description}`)}
                    empty="No event types saved yet."
                  />
                </CardContent>
              </Card>

              <Card className="rounded-[24px]">
                <CardHeader>
                  <CardTitle>3. Register a webhook endpoint</CardTitle>
                  <CardDescription>This is the only moment the endpoint signing secret will be shown.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <Field label="Webhook URL">
                    <Input
                      value={endpointForm.url}
                      onChange={(event) => setEndpointForm((current) => ({ ...current, url: event.target.value }))}
                    />
                  </Field>
                  <Field label="Event types">
                    <Input
                      value={endpointForm.event_types}
                      onChange={(event) => setEndpointForm((current) => ({ ...current, event_types: event.target.value }))}
                    />
                  </Field>
                  <div className="lg:col-span-2">
                    <Button onClick={createEndpoint} disabled={busy === "endpoint" || !selectedAppId}>
                      Register endpoint
                    </Button>
                  </div>
                  {endpointVerification ? (
                    <SecretCard
                      title="Endpoint signing secret"
                      description={`Use ${endpointVerification.signature_header}, ${endpointVerification.timestamp_header}, and ${endpointVerification.event_id_header} to verify incoming signatures.`}
                      secret={endpointVerification.signing_secret}
                    />
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-teal-200 bg-teal-50/60">
                <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-teal-900">4. Complete</div>
                    <p className="text-sm text-teal-800">
                      Once your app, event catalog, and first endpoint exist, you’re ready for the live dashboard.
                    </p>
                  </div>
                  <Button asChild disabled={!selectedAppId || events.length === 0 || endpoints.length === 0}>
                    <Link href="/dashboard">
                      Open dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-4">
                <StatCard label="Catalog events" value={stats?.event_catalog_count ?? 0} />
                <StatCard label="Endpoints" value={stats?.endpoint_count ?? 0} />
                <StatCard label="Events ingested" value={stats?.event_count ?? 0} />
                <StatCard label="Failed deliveries" value={stats?.failed_delivery_count ?? 0} tone="danger" />
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <Card className="rounded-[24px]">
                  <CardHeader>
                    <CardTitle>Event catalog</CardTitle>
                    <CardDescription>Explicit app contract for accepted event types.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CompactList
                      title="Events"
                      items={events.map((event) => `${event.name} - ${event.description}`)}
                      empty="No event catalog entries yet."
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-[24px]">
                  <CardHeader>
                    <CardTitle>Webhook endpoints</CardTitle>
                    <CardDescription>Secrets are intentionally omitted after registration.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CompactList
                      title="Endpoints"
                      items={endpoints.map((endpoint) => `${endpoint.url} - ${endpoint.event_types.join(", ")}`)}
                      empty="No endpoints registered yet."
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-[24px]">
                <CardHeader>
                  <CardTitle>Recent deliveries</CardTitle>
                  <CardDescription>Replay is only available for failed rows.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deliveries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      No deliveries yet for this app.
                    </div>
                  ) : (
                    deliveries.map((delivery) => (
                      <div
                        key={delivery.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="font-medium">{delivery.event_type}</div>
                          <div className="text-xs text-muted-foreground">{delivery.endpoint_url}</div>
                          <div className="text-xs text-muted-foreground">
                            Attempts: {delivery.attempt_count} · Status: {delivery.status}
                          </div>
                          {delivery.last_error ? (
                            <div className="text-xs text-rose-700">{delivery.last_error}</div>
                          ) : null}
                        </div>
                        <Button
                          variant="outline"
                          disabled={delivery.status !== "failed" || busy === delivery.id}
                          onClick={() => replayDelivery(delivery.id)}
                        >
                          Replay failed delivery
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      </div>
    </main>
  );

  async function publicFetch(path: string, body: unknown) {
    const response = await fetch(`/api/platform${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-platform-url": platformUrl,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return parseResponse(response);
  }

  async function platformFetch(path: string, options: { method?: string; body?: unknown } = {}) {
    const response = await fetch(`/api/platform${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-platform-url": platformUrl,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
    return parseResponse(response);
  }
}

function AuthShell({
  title,
  description,
  platformUrl,
  setPlatformUrl,
  message,
  children,
}: {
  title: string;
  description: string;
  platformUrl: string;
  setPlatformUrl: (value: string) => void;
  message: { kind: "success" | "error"; text: string } | null;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_35%),linear-gradient(135deg,_rgba(245,158,11,0.18),_transparent_40%)] px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-border/70 bg-card/90 p-8 shadow-panel">
          <Badge variant="outline" className="mb-5 border-amber-200 bg-amber-50 text-amber-700">
            Reliable event delivery
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">{description}</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <PitchCard title="JWT user auth" body="Dashboard access is stateless and fast to integrate." />
            <PitchCard title="One-time secrets" body="API keys and signing secrets are revealed once and never listed again." />
            <PitchCard title="Operator visibility" body="See catalog, endpoints, failures, and replay controls in one flow." />
          </div>
        </div>

        <Card className="rounded-[32px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              Control plane access
            </CardTitle>
            <CardDescription>Point the UI at the platform API, then authenticate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Platform API">
              <Input value={platformUrl} onChange={(event) => setPlatformUrl(event.target.value)} />
            </Field>
            {message ? <Flash kind={message.kind} text={message.text} /> : null}
            {children}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PitchCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-primary" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function Flash({ kind, text }: { kind: "success" | "error"; text: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm",
        kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800",
      )}
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        <span>{text}</span>
      </div>
    </div>
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

function SecretCard({ title, description, secret }: { title: string; description: string; secret: string }) {
  async function copySecret() {
    await navigator.clipboard.writeText(secret);
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:col-span-2">
      <div className="text-sm font-semibold text-amber-900">{title}</div>
      <p className="mt-1 text-sm text-amber-800">{description}</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-950">{secret}</code>
        <Button variant="outline" onClick={copySecret}>
          Copy
        </Button>
      </div>
    </div>
  );
}

function CompactList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item} className="rounded-xl border border-border bg-background px-3 py-3 text-sm">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <Card className="rounded-[20px]">
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn("mt-3 text-3xl font-semibold", tone === "danger" && "text-rose-700")}>{value}</div>
      </CardContent>
    </Card>
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
