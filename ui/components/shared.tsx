"use client";

import { Clipboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "delivered") return <Badge variant="success">delivered</Badge>;
  if (status === "failed") return <Badge variant="danger">failed</Badge>;
  if (status === "retry_scheduled") return <Badge variant="warning">retry</Badge>;
  if (status === "in_progress") return <Badge variant="secondary">active</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="px-3 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

export function ShowOnceSecret({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  async function copy() {
    await navigator.clipboard.writeText(value);
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="text-sm font-medium text-amber-900">Shown once — copy and store securely</div>
      {description ? <p className="text-xs text-amber-800">{description}</p> : null}
      <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate font-mono text-sm">{value}</div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Clipboard className="mr-1 h-3 w-3" />
          Copy
        </Button>
      </div>
    </div>
  );
}

export function MessageBanner({
  message,
}: {
  message: { kind: "success" | "error"; text: string } | null;
}) {
  if (!message) return null;
  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        message.kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        message.kind === "error" && "border-rose-200 bg-rose-50 text-rose-900",
      )}
    >
      {message.text}
    </div>
  );
}
