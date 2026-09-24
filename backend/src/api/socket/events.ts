import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { appConfig } from "../../config/app";
import { bus } from "../../events";
import { getMetrics } from "../../monitors/metrics-collector";
import { executeQuery } from "../../router/query-router";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "../../types/socket";
import { logger } from "../../utils/logger";
import { uuid } from "../../utils/helpers";
import { verifyAccessToken } from "../../auth/tokens";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

let io: Server<ClientToServerEvents, ServerToClientEvents, never, SocketData> | null = null;

/** Fully verifies signed, unexpired access tokens from the handshake. */
const verifyHandshake = (token: unknown): { userId: string | null; ok: boolean } => {
  if (typeof token !== "string" || !token.length) return { userId: null, ok: false };
  try {
    const decoded = verifyAccessToken(token);
    return { userId: typeof decoded.sub === "string" ? decoded.sub : null, ok: typeof decoded.sub === "string" };
  } catch {
    return { userId: null, ok: false };
  }
};

export const registerSocketEvents = (httpServer: HttpServer): Server => {
  io = new Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>(httpServer, {
    cors: { origin: appConfig.corsOrigin, methods: ["GET", "POST"] },
  });

  io.use((socket, next) => {
    const { userId, ok } = verifyHandshake(socket.handshake.auth?.token);
    if (!ok) return next(new Error("Unauthorized socket handshake"));
    socket.data.userId = userId;
    socket.data.sessionId = `ws-${uuid()}`;
    next();
  });

  io.on("connection", (socket: AppSocket) => {
    logger.info("Socket connected", { id: socket.id, userId: socket.data.userId });
    let metricsTimer: ReturnType<typeof setInterval> | null = null;

    socket.on("subscribe:metrics", async ({ intervalMs } = {}) => {
      const interval = Math.max(1000, Math.min(intervalMs ?? 2000, 30_000));
      await socket.join("metrics");
      socket.emit("metrics:update", await getMetrics());
      metricsTimer = setInterval(async () => {
        socket.emit("metrics:update", await getMetrics());
      }, interval);
    });

    socket.on("unsubscribe:metrics", () => {
      if (metricsTimer) clearInterval(metricsTimer);
      metricsTimer = null;
      void socket.leave("metrics");
    });

    socket.on("subscribe:alerts", () => {
      void socket.join("alerts");
    });

    socket.on("execute:query", async (payload, ack) => {
      try {
        const { result } = await executeQuery(payload.sql, [], {
          sessionId: payload.sessionId ?? socket.data.sessionId,
        });
        ack?.({ success: true, data: result });
        io?.emit("query:executed", { sql: payload.sql, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ack?.({ success: false, error: message });
        socket.emit("query:executed", { sql: payload.sql, error: message });
      }
    });

    socket.on("disconnect", (reason) => {
      if (metricsTimer) clearInterval(metricsTimer);
      logger.info("Socket disconnected", { id: socket.id, reason });
    });
  });

  bus.onEvent("anomaly:detected", (alert) => io?.to("alerts").emit("alert:anomaly", alert));
  bus.onEvent("health:updated", (nodes) => io?.emit("health:update", nodes));

  logger.info("Socket.io handlers registered");
  return io;
};

export const getIo = (): Server | null => io;
