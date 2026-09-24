import type { AnomalyAlert } from "./ai";
import type { NodeHealth } from "./database";
import type { MetricsSnapshot } from "./metrics";
import type { QueryResult } from "./query";

export interface ClientToServerEvents {
  "subscribe:metrics": (payload: { intervalMs?: number }) => void;
  "unsubscribe:metrics": () => void;
  "subscribe:alerts": () => void;
  "execute:query": (
    payload: { sql: string; sessionId?: string },
    ack?: (response: { success: boolean; data?: QueryResult; error?: string }) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "metrics:update": (snapshot: MetricsSnapshot) => void;
  "health:update": (nodes: NodeHealth[]) => void;
  "alert:anomaly": (alert: AnomalyAlert) => void;
  "query:executed": (payload: { sql: string; result?: QueryResult; error?: string }) => void;
}

export interface SocketData {
  userId: string | null;
  sessionId: string;
}
