"use client";

import Link from "next/link";
import { WizardStepper } from "@/components/wizard-stepper";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f6f3ee] via-[#eef6f4] to-[#f8faf9]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <div className="space-y-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Reeler
          </Link>
          <h1 className="text-2xl font-semibold">Onboarding</h1>
          <WizardStepper />
        </div>
        {children}
      </div>
    </main>
  );
}
