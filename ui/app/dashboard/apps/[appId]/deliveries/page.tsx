"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, MessageBanner, StatusBadge } from "@/components/shared";
import { dashboardFetch, type Delivery } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AppDeliveriesPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function load(status?: string) {
    const query = status && status !== "all" ? `?status=${status}` : "";
    const data = (await dashboardFetch(`/apps/${appId}/deliveries${query}`)) as { deliveries: Delivery[] };
    setDeliveries(data.deliveries);
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load deliveries" }),
    );
  }, [appId]);

  const filtered = useMemo(() => {
    if (selectedStatus === "all") return deliveries;
    return deliveries.filter((delivery) => delivery.status === selectedStatus);
  }, [deliveries, selectedStatus]);

  async function replay(deliveryId: string) {
    setBusy(deliveryId);
    setMessage(null);
    try {
      await dashboardFetch(`/deliveries/${deliveryId}/replay`, { method: "POST" });
      await load(selectedStatus === "all" ? undefined : selectedStatus);
      setMessage({ kind: "success", text: "Replay queued" });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Replay failed",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>Delivery ledger</CardTitle>
        <CardDescription>Inspect delivery state and replay failed deliveries.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MessageBanner message={message} />
        <div className="flex flex-wrap gap-2">
          {["all", "failed", "pending", "delivered"].map((status) => (
            <Button
              key={status}
              size="sm"
              variant={selectedStatus === status ? "default" : "outline"}
              onClick={() => {
                setSelectedStatus(status);
                void load(status === "all" ? undefined : status);
              }}
            >
              {status}
            </Button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState text="No deliveries match this filter." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Endpoint</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((delivery) => (
                  <tr key={delivery.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{delivery.event_type}</td>
                    <td className={cn("px-3 py-2 text-xs", "max-w-[240px] truncate")}>{delivery.endpoint_url}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={delivery.status} />
                    </td>
                    <td className="px-3 py-2">{delivery.attempt_count}</td>
                    <td className="px-3 py-2">
                      {delivery.status === "failed" ? (
                        <Button size="sm" variant="outline" disabled={busy === delivery.id} onClick={() => void replay(delivery.id)}>
                          Replay
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
