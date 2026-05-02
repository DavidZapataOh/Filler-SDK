/**
 * Dashboard SSE emitter.
 *
 * Spins a tiny `node:http` server on `DASHBOARD_PORT` exposing:
 *
 *   GET /events    → SSE stream. Every successful fill broadcasts a
 *                    `spread-captured` event with `{txHash, orderHash,
 *                    amountUSD, totalUSD, timestamp}`.
 *   GET /health    → `{ status: 'ok', clients: <n>, totalUSD }`.
 *
 * Sprint 05's dashboard subscribes to `/events` and renders the live
 * "spread captured" money counter. The contract is intentionally minimal
 * (one event type) so the dashboard's frontend stays simple.
 *
 * **Backpressure**: failed `res.write` (client disconnected mid-flight)
 * removes the client from the broadcast set silently. No queue / replay —
 * the dashboard's counter is monotonic-additive client-side, missed
 * events round-trip to "next page load reads the live total."
 */

import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';

import type { FillParams, FillResult, Intent } from '@filler-sdk/sdk';

export interface SpreadCapturedPayload {
  txHash: string;
  orderHash: string;
  /** Spread captured on this fill (USD, USDC-decimal convention). */
  amountUSD: number;
  /** Cumulative spread captured since the emitter started. */
  totalUSD: number;
  /** Block number — useful for the dashboard to dedupe. */
  blockNumber: string;
  /** UNIX timestamp (ms). */
  timestamp: number;
}

export interface DashboardEmitter {
  /** Start the HTTP server. Resolves once `listen` is fired. */
  start(): Promise<void>;
  /** Stop accepting connections + close existing. Idempotent. */
  stop(): Promise<void>;
  /** Broadcast a `spread-captured` event to every connected client. */
  emitSpreadCaptured(
    intent: Intent,
    params: FillParams,
    result: FillResult,
    spreadUSD: number,
  ): void;
  /** Number of currently-connected clients. */
  readonly clientCount: number;
  /** Cumulative spread broadcast since start. */
  readonly totalUSD: number;
}

export function createDashboardEmitter(port: number): DashboardEmitter {
  const clients = new Set<ServerResponse<IncomingMessage>>();
  let totalUSD = 0;
  let server: Server | undefined;

  function handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.url === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        // CORS: allow the dashboard (whatever origin) to subscribe.
        // Production deployments should tighten this to the dashboard's
        // exact origin via reverse proxy.
        'access-control-allow-origin': '*',
        'x-accel-buffering': 'no', // disable nginx buffering for live SSE
      });
      // Heartbeat on connect so the client knows we're alive.
      res.write(`event: connected\ndata: ${JSON.stringify({ totalUSD, clientCount: clients.size + 1 })}\n\n`);
      clients.add(res);
      req.on('close', () => {
        clients.delete(res);
      });
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          clients: clients.size,
          totalUSD,
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }

  return {
    async start() {
      if (server !== undefined) return;
      server = createServer(handle);
      await new Promise<void>((resolve, reject) => {
        server?.once('error', reject);
        server?.listen(port, '0.0.0.0', () => resolve());
      });
    },
    async stop() {
      if (server === undefined) return;
      // Close every SSE response so clients reconnect / shut down cleanly.
      for (const res of clients) {
        try {
          res.end();
        } catch {
          // ignore
        }
      }
      clients.clear();
      const s = server;
      server = undefined;
      await new Promise<void>((resolve) => s.close(() => resolve()));
    },
    emitSpreadCaptured(intent, _params, result, spreadUSD) {
      totalUSD += spreadUSD;
      const payload: SpreadCapturedPayload = {
        txHash: result.txHash,
        orderHash: intent.orderHash,
        amountUSD: spreadUSD,
        totalUSD,
        blockNumber: result.blockNumber.toString(),
        timestamp: Date.now(),
      };
      const frame = `event: spread-captured\ndata: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) {
        try {
          res.write(frame);
        } catch {
          // Failed write = client disconnected mid-flight; drop silently.
          clients.delete(res);
        }
      }
    },
    get clientCount() {
      return clients.size;
    },
    get totalUSD() {
      return totalUSD;
    },
  };
}
