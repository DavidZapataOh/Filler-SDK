/**
 * OpenTelemetry tracing scaffold.
 *
 * `@opentelemetry/sdk-node` + auto-instrumentations are heavyweight peer-deps
 * (~5 packages, several MB compressed). They're irrelevant unless you ship to
 * a tracing backend (Jaeger / Tempo / Honeycomb / Datadog APM). We follow the
 * same pattern as `sentry.ts`: a typed scaffold + dynamic-import factory.
 *
 * To activate in production:
 *
 *     bun add @opentelemetry/sdk-node \
 *             @opentelemetry/exporter-trace-otlp-http \
 *             @opentelemetry/auto-instrumentations-node
 *     OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com:4318 bun run start
 *
 * If the env var is unset OR the packages aren't installed, `initTracing`
 * returns a no-op that closes cleanly on SIGTERM.
 */

export interface TracingHooks {
  /** Closes the SDK + flushes pending spans. Called from SIGTERM. */
  shutdown(): Promise<void>;
}

export const noopTracingHooks: TracingHooks = {
  async shutdown() {},
};

export interface InitTracingOptions {
  /** OTLP endpoint URL. Pass `process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? ''`. */
  endpoint: string;
  /** Service name reported in traces. */
  serviceName?: string;
  /** App version reported in traces. */
  serviceVersion?: string;
}

/**
 * Initialise OpenTelemetry if an OTLP endpoint is configured AND the SDK
 * packages are installed. Otherwise return the no-op hooks. Never throws.
 */
export async function initTracing(opts: InitTracingOptions): Promise<TracingHooks> {
  if (!opts.endpoint || opts.endpoint.length === 0) return noopTracingHooks;

  // Dynamic imports via string variables hide the specifiers from TypeScript's
  // resolver. The OTEL packages are intentionally NOT in our `dependencies`.
  type SdkNodeModule = {
    NodeSDK: new (cfg: Record<string, unknown>) => {
      start(): void;
      shutdown(): Promise<void>;
    };
  };
  type OtlpExporterModule = {
    OTLPTraceExporter: new (cfg: { url: string }) => unknown;
  };
  type AutoInstrumentationsModule = {
    getNodeAutoInstrumentations: () => unknown;
  };

  const sdkNodePkg = '@opentelemetry/sdk-node';
  const otlpPkg = '@opentelemetry/exporter-trace-otlp-http';
  const autoInstrPkg = '@opentelemetry/auto-instrumentations-node';

  let sdkNode: SdkNodeModule;
  let otlp: OtlpExporterModule;
  let autoInstr: AutoInstrumentationsModule;
  try {
    sdkNode = (await import(sdkNodePkg)) as unknown as SdkNodeModule;
    otlp = (await import(otlpPkg)) as unknown as OtlpExporterModule;
    autoInstr = (await import(autoInstrPkg)) as unknown as AutoInstrumentationsModule;
  } catch {
    // One or more packages not installed — silent fallback.
    return noopTracingHooks;
  }

  const sdk = new sdkNode.NodeSDK({
    serviceName: opts.serviceName ?? 'jit-hints',
    serviceVersion: opts.serviceVersion ?? 'dev',
    traceExporter: new otlp.OTLPTraceExporter({ url: opts.endpoint }),
    instrumentations: [autoInstr.getNodeAutoInstrumentations()],
  });
  sdk.start();

  return {
    async shutdown() {
      await sdk.shutdown();
    },
  };
}
