import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, Stat } from "@/components/common";
import { sim } from "@/lib/sim";
import { fmtMs, truncate } from "@/lib/format";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Query Replay — pg-router-ai" },
      { name: "description", content: "Replay captured production traffic against a target database and compare results." },
      { property: "og:title", content: "Query Replay — pg-router-ai" },
      { property: "og:description", content: "Replay captured production traffic against a target database and compare results." },
    ],
  }),
  component: Replay,
});

interface Captured { sql: string; durationMs: number; offsetMs: number }
interface Outcome extends Captured { replayMs: number; match: boolean }

function demoCapture(): Captured[] {
  let off = 0;
  return Array.from({ length: 120 }, () => {
    off += Math.random() * 400;
    return { sql: sim.sampleQueries[Math.floor(Math.random() * sim.sampleQueries.length)]!, durationMs: 2 + Math.random() * 60, offsetMs: off };
  });
}

function Replay() {
  const [capture, setCapture] = useState<Captured[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [speed, setSpeed] = useState("1");
  const [target, setTarget] = useState("replica-1");
  const [done, setDone] = useState<Outcome[]>([]);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const onFile = async (f: File) => {
    const text = await f.text();
    try {
      const rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const t0 = new Date(rows[0].timestamp ?? 0).getTime();
      setCapture(rows.map((r) => ({ sql: r.sql ?? r.query, durationMs: Number(r.durationMs ?? r.duration ?? 5), offsetMs: new Date(r.timestamp ?? 0).getTime() - t0 })));
      setFileName(f.name);
      setDone([]);
    } catch {
      toast.error("Could not read file — expected JSON lines with sql, durationMs and timestamp");
    }
  };

  const start = async () => {
    if (!capture) return;
    setRunning(true); setDone([]); stop.current = false;
    const k = Number(speed);
    const t0 = performance.now();
    for (const q of capture) {
      if (stop.current) break;
      const wait = q.offsetMs / k - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 800)));
      const replayMs = q.durationMs * (0.6 + Math.random() * 0.9);
      setDone((d) => [...d, { ...q, replayMs, match: Math.random() > 0.04 }]);
    }
    setRunning(false);
  };

  const total = capture?.length ?? 0;
  const mismatches = done.filter((d) => !d.match).length;
  const avgDelta = done.length ? done.reduce((a, d) => a + (d.replayMs - d.durationMs), 0) / done.length : 0;

  return (
    <>
      <PageHeader title="Query replay" sub="Re-run captured traffic and diff results against the original run" />
      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <Panel title="Configure">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center hover:bg-muted/40">
            <Upload className="size-5 text-muted-foreground" />
            <span className="text-sm">{fileName || "Upload capture file (.jsonl)"}</span>
            <input type="file" accept=".jsonl,.json,.log,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <Button variant="link" size="sm" className="mt-1 px-0" onClick={() => { setCapture(demoCapture()); setFileName("demo-capture.jsonl"); setDone([]); }}>or load a demo capture</Button>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Speed</div>
              <ToggleGroup type="single" variant="outline" size="sm" value={speed} onValueChange={(v) => v && setSpeed(v)}>
                {["0.5", "1", "2", "10"].map((s) => <ToggleGroupItem key={s} value={s} className="font-mono text-xs">{s}×</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">Target database</div>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["primary", "replica-1", "replica-2"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {running ? (
              <Button variant="destructive" className="w-full" onClick={() => (stop.current = true)}><Square className="size-3.5" />Stop</Button>
            ) : (
              <Button className="w-full" disabled={!capture} onClick={start}><Play className="size-3.5" />Start replay ({total} queries)</Button>
            )}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Progress">
            <Progress value={total ? (done.length / total) * 100 : 0} className="h-2" />
            <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground"><span>{done.length}/{total} on {target}</span><span>{speed}× speed</span></div>
          </Panel>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Replayed" value={String(done.length)} />
            <Stat label="Mismatches" value={String(mismatches)} tone={mismatches ? "destructive" : "success"} />
            <Stat label="Avg Δ time" value={`${avgDelta >= 0 ? "+" : ""}${fmtMs(Math.abs(avgDelta))}`} tone={avgDelta > 5 ? "warning" : "success"} />
          </div>
          <Panel title="Result comparison">
            <div className="max-h-96 overflow-auto">
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 bg-card text-left text-muted-foreground"><tr><th className="pb-2 font-normal">Query</th><th className="pb-2 text-right font-normal">Original</th><th className="pb-2 text-right font-normal">Replay</th><th className="pb-2 text-right font-normal">Result</th></tr></thead>
                <tbody>
                  {[...done].reverse().slice(0, 200).map((d, i) => (
                    <tr key={i} className="border-t">
                      <td className="max-w-0 truncate py-1.5 pr-3">{truncate(d.sql, 70)}</td>
                      <td className="py-1.5 text-right">{fmtMs(d.durationMs)}</td>
                      <td className={`py-1.5 text-right ${d.replayMs > d.durationMs * 1.3 ? "text-warning" : ""}`}>{fmtMs(d.replayMs)}</td>
                      <td className={`py-1.5 pl-3 text-right ${d.match ? "text-success" : "text-destructive"}`}>{d.match ? "match" : "diff"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {done.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Load a capture and start the replay.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
