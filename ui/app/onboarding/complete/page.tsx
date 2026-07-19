"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearOnboardingState, getOnboardingAppId } from "@/lib/onboarding";

export default function OnboardingCompletePage() {
  const router = useRouter();
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    const id = getOnboardingAppId();
    if (!id) {
      router.replace("/onboarding/app");
      return;
    }
    setAppId(id);
    clearOnboardingState();
  }, [router]);

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>You are ready to deliver events</CardTitle>
        <CardDescription>Your app, event catalog, endpoint, and credentials are set up.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {appId ? (
          <Button asChild>
            <Link href={`/dashboard/apps/${appId}`}>Open app dashboard</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/demo-console">Try the demo console</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
