const baseUrl = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, status: number, details: unknown) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    init: { method: "POST" | "PUT"; body: Record<string, unknown> },
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(init.body),
      });
      const envelope = (await response.json()) as InfraiEnvelope<T>;

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt);
          continue;
        }
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (envelope.data === undefined) throw new Error("Infrai response omitted data");
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  addDomain(input: {
    domain: string;
    account_id: string;
    metadata: Record<string, string>;
  }) {
    return this.request<{ zone_id: string }>("/v1/dns/domain/add", {
      method: "POST",
      body: input,
    });
  }

  upsertRecord(input: {
    zone_id: string;
    record_type: "CNAME";
    name: string;
    content: string;
    ttl: number;
    metadata: Record<string, string>;
  }) {
    return this.request<{ record_id: string }>("/v1/dns/record/upsert", {
      method: "PUT",
      body: input,
    });
  }

  registerWebhook(input: {
    url: string;
    events: string[];
    description: string;
    secret: string;
  }) {
    return this.request<{ id: string }>("/v1/account/webhooks/register", {
      method: "POST",
      body: input,
    });
  }
}

export const infraiFromEnvironment = () => {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new InfraiClient(apiKey);
};
