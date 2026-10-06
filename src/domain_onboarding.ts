import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

export const onboardingSchema = z.object({
  tenant_id: z.string().min(1),
  domain: z.string().min(3),
  cname_name: z.string().min(1),
  cname_target: z.string().min(3),
  webhook_url: z.string().url(),
});

export async function onboardTenantDomain(
  input: z.infer<typeof onboardingSchema>,
  webhookSecret: string,
  client: InfraiClient,
) {
  const onboardingId = `${input.tenant_id}:${input.domain}`;
  const domain = await client.addDomain({
    domain: input.domain,
    account_id: input.tenant_id,
    metadata: { onboarding_id: onboardingId },
  });
  const record = await client.upsertRecord({
    zone_id: domain.zone_id,
    record_type: "CNAME",
    name: input.cname_name,
    content: input.cname_target,
    ttl: 300,
    metadata: { onboarding_id: onboardingId },
  });
  const webhook = await client.registerWebhook({
    url: input.webhook_url,
    events: ["dns.domain.verified"],
    description: `Domain verification for ${input.tenant_id}`,
    secret: webhookSecret,
  });
  return {
    tenant_id: input.tenant_id,
    domain: input.domain,
    zone_id: domain.zone_id,
    record_id: record.record_id,
    webhook_id: webhook.id,
    status: "verification_pending" as const,
  };
}

export function hasValidSignature(rawBody: Buffer, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}
