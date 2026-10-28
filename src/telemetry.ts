import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { trace, SpanStatusCode, type Span, type Attributes } from "@opentelemetry/api";
import { ExportResultCode, hrTimeToMilliseconds, type ExportResult } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { config } from "./config.js";

/** Formato gravado em JSONL — é a fonte do painel e do relatório semanal. */
export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  start: string;
  durationMs: number;
  status: "OK" | "ERROR" | "UNSET";
  attributes: Attributes;
}

export function toRecord(span: ReadableSpan): SpanRecord {
  const ctx = span.spanContext();
  const parent = (span as unknown as { parentSpanContext?: { spanId: string } }).parentSpanContext;
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: parent?.spanId ?? null,
    name: span.name,
    start: new Date(hrTimeToMilliseconds(span.startTime)).toISOString(),
    durationMs: Math.round(hrTimeToMilliseconds(span.duration) * 100) / 100,
    status: span.status.code === SpanStatusCode.ERROR ? "ERROR" : span.status.code === SpanStatusCode.OK ? "OK" : "UNSET",
    attributes: span.attributes,
  };
}

/** Exporter OpenTelemetry que grava cada span como uma linha JSON. */
export class JsonlSpanExporter implements SpanExporter {
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
  }
  export(spans: ReadableSpan[], done: (result: ExportResult) => void) {
    try {
      appendFileSync(this.file, spans.map((s) => JSON.stringify(toRecord(s))).join("\n") + "\n");
      done({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      done({ code: ExportResultCode.FAILED, error: error as Error });
    }
  }
  shutdown() {
    return Promise.resolve();
  }
}

export function readSpanRecords(file = config.otel.tracesFile): SpanRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SpanRecord);
}

let provider: NodeTracerProvider | undefined;

export async function initTelemetry(options: { tracesFile?: string; extraExporters?: SpanExporter[] } = {}) {
  if (provider) return provider;
  const processors: SpanProcessor[] = [
    new SimpleSpanProcessor(new JsonlSpanExporter(options.tracesFile ?? config.otel.tracesFile)),
    ...(options.extraExporters ?? []).map((e) => new SimpleSpanProcessor(e)),
  ];
  if (config.otel.console) processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  if (config.otel.otlpEndpoint) {
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    processors.push(
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${config.otel.otlpEndpoint.replace(/\/$/, "")}/v1/traces` })),
    );
  }
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": "rag-captacao-demo", "service.version": "1.0.0" }),
    spanProcessors: processors,
  });
  provider.register();
  return provider;
}

export async function shutdownTelemetry() {
  await provider?.forceFlush();
  await provider?.shutdown();
  provider = undefined;
}

export const tracer = () => trace.getTracer("rag-captacao-demo");

/** Executa fn dentro de um span ativo, registrando erro e status. */
export async function withSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}
