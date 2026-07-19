"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const steps = [
  { href: "/onboarding/app", label: "App" },
  { href: "/onboarding/events", label: "Events" },
  { href: "/onboarding/endpoints", label: "Endpoint" },
  { href: "/onboarding/credentials", label: "Credentials" },
  { href: "/onboarding/complete", label: "Finish" },
];

export function WizardStepper() {
  const pathname = usePathname();
  const activeIndex = steps.findIndex((step) => pathname.startsWith(step.href));

  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, index) => (
        <li key={step.href}>
          <Link
            href={step.href}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
              index <= activeIndex
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {index + 1}. {step.label}
          </Link>
        </li>
      ))}
    </ol>
  );
}
