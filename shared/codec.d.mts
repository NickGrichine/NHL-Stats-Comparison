export declare const CODEC_VERSION: number;

export interface ColumnarPayload {
  v: number;
  count: number;
  f: string[];
  r: unknown[][];
  [meta: string]: unknown;
}

export declare function encodeColumnar(
  rows: Record<string, unknown>[],
  options?: { fields?: string[]; meta?: Record<string, unknown> },
): ColumnarPayload;

export declare function decodeColumnar(payload: unknown): Record<string, unknown>[];

export declare function payloadMeta(payload: unknown): Record<string, unknown>;
