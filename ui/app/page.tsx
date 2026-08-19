import Link from "next/link";
import { ArrowRight, LockKeyhole, RadioTower, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="rounded-[36px] border border-border/70 bg-card/95 p-8 shadow-panel sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-700">
                <Webhook className="h-4 w-4" />
                Reeler onboarding
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                  Bring apps onto Reeler without leaking operational secrets.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  User access is JWT-based, API keys are revealed once during app registration, and endpoint signing
                  secrets are shown only when the endpoint is first created.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/signup">
                    Start onboarding
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Open dashboard</Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link href="/demo-console">Demo console</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <HighlightCard icon={LockKeyhole} title="JWT control plane" body="Sign up and sign in to the operator UI without a server-side session table." />
              <HighlightCard icon={RadioTower} title="Explicit event catalog" body="Register event types before producers or endpoints can use them." />
              <HighlightCard icon={Webhook} title="One-time credentials" body="API keys and signing secrets never reappear in list endpoints after creation." />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function HighlightCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card className="rounded-[24px]">
      <CardContent className="flex gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="font-semibold">{title}</div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}
