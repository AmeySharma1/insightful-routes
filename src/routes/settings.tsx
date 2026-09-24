import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, StatusDot } from "@/components/common";
import { sim, useSim } from "@/lib/sim";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — pg-router-ai" },
      { name: "description", content: "Manage database nodes, AI models, alert thresholds and preferences." },
      { property: "og:title", content: "Settings — pg-router-ai" },
      { property: "og:description", content: "Manage database nodes, AI models, alert thresholds and preferences." },
    ],
  }),
  component: Settings,
});

const thresholdSchema = z.object({
  slowMs: z.coerce.number().int().min(1, "Must be at least 1").max(60000),
  lagMs: z.coerce.number().int().min(10, "Must be at least 10").max(600000),
  window: z.coerce.number().int().min(50, "Must be at least 50").max(100000),
});
const nodeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,32}$/, "Lowercase letters, numbers and dashes"),
  host: z.string().regex(/^[\w.-]+:\d{2,5}$/, "Use host:port"),
});

function Settings() {
  const thresholds = useSim((s) => s.thresholds);
  const nodes = useSim((s) => s.nodes);
  const connected = useSim((s) => s.connected);
  const [model, setModel] = useState("gemini-2.5-flash");
  const [embed, setEmbed] = useState("all-MiniLM-L6-v2");

  const t = useForm({ resolver: zodResolver(thresholdSchema), defaultValues: thresholds });
  const n = useForm({ resolver: zodResolver(nodeSchema), defaultValues: { id: "", host: "" } });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Database nodes" className="lg:col-span-2">
          <div className="space-y-2">
            {nodes.map((node) => (
              <div key={node.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                <StatusDot status={node.status} />
                <span className="font-mono text-sm">{node.id}</span>
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{node.host}</span>
                <span className="rounded bg-muted px-1.5 font-mono text-[10px] uppercase">{node.role}</span>
                {node.role === "replica" && (
                  <Button size="icon" variant="ghost" className="ml-auto size-7" aria-label={`Remove ${node.id}`} onClick={() => sim.setNodes(nodes.filter((x) => x.id !== node.id))}><Trash2 className="size-3.5" /></Button>
                )}
              </div>
            ))}
          </div>
          <form className="mt-3 flex flex-wrap items-start gap-2" onSubmit={n.handleSubmit((v) => {
            if (nodes.some((x) => x.id === v.id)) return n.setError("id", { message: "Name already used" });
            sim.setNodes([...nodes, { id: v.id, host: v.host, role: "replica", status: "healthy", lagMs: 0, connections: 0, maxConnections: 150, latencyMs: 2, queriesRouted: 0 }]);
            n.reset(); toast.success(`Replica ${v.id} added`);
          })}>
            <div><Input placeholder="replica-3" {...n.register("id")} className="w-40" /><p className="mt-1 text-xs text-destructive">{n.formState.errors.id?.message}</p></div>
            <div><Input placeholder="pg-replica-3.internal:5432" {...n.register("host")} className="w-64" /><p className="mt-1 text-xs text-destructive">{n.formState.errors.host?.message}</p></div>
            <Button type="submit" variant="secondary">Add replica</Button>
          </form>
        </Panel>

        <Panel title="Thresholds">
          <form className="space-y-3" onSubmit={t.handleSubmit((v) => { sim.setThresholds(v); toast.success("Thresholds saved"); })}>
            {([["slowMs", "Slow query threshold (ms)"], ["lagMs", "Replica lag threshold (ms)"], ["window", "Anomaly detection window (queries)"]] as const).map(([k, label]) => (
              <div key={k}>
                <Label htmlFor={k} className="text-xs">{label}</Label>
                <Input id={k} type="number" className="mt-1 font-mono" {...t.register(k)} />
                <p className="mt-1 text-xs text-destructive">{t.formState.errors[k]?.message}</p>
              </div>
            ))}
            <Button type="submit">Save thresholds</Button>
          </form>
        </Panel>

        <div className="space-y-3">
          <Panel title="AI models">
            <div className="space-y-3">
              <div><Label className="text-xs">Query optimizer</Label>
                <Select value={model} onValueChange={setModel}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem><SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem><SelectItem value="heuristic">Heuristic only (no AI)</SelectItem></SelectContent></Select>
              </div>
              <div><Label className="text-xs">Anomaly embeddings</Label>
                <Select value={embed} onValueChange={setEmbed}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all-MiniLM-L6-v2">all-MiniLM-L6-v2</SelectItem><SelectItem value="bge-small-en">bge-small-en</SelectItem><SelectItem value="local-hash">Local hash (offline)</SelectItem></SelectContent></Select>
              </div>
            </div>
          </Panel>
          <Panel title="Preferences">
            <div className="flex items-center justify-between">
              <div><div className="text-sm">Live updates</div><div className="text-xs text-muted-foreground">Stream metrics and alerts every 2 seconds</div></div>
              <Switch checked={connected} onCheckedChange={sim.setConnected} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
