import Link from "next/link";
import { ArrowRight, FlaskConical, LayoutDashboard, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f6f3ee] via-[#eef6f4] to-[#f8faf9]">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-8 px-6 py-16">
        <div className="space-y-4 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Reeler</p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Reliable event delivery for developers
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Sign up, register events and webhook endpoints, send signed deliveries, and monitor retries
            from a dashboard.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-4 w-4" />
                Get started
              </CardTitle>
              <CardDescription>Create an account and walk through onboarding.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/signup">
                  Sign up
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LogIn className="h-4 w-4" />
                Returning user
              </CardTitle>
              <CardDescription>Log in to your dashboard and apps.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Log in</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FlaskConical className="h-4 w-4" />
                Demo console
              </CardTitle>
              <CardDescription>Test ingestion, delivery, and replay with API keys.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" className="w-full">
                <Link href="/demo-console">Open demo console</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <LayoutDashboard className="h-4 w-4" />
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
