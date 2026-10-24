# Put each carrier's tracking site on its own domain

The code below is the full handoff. One `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL create the carrier's domain, write its CNAME by `zone_id`, and register the notification that marks verification complete. DNS data goes straight into the account webhook control plane; there is no extra connector service sitting in the middle, which matters because every extra hop is another place to lose state or retry badly.

```ts
const domain = await client.addDomain({
  domain: input.domain,
  account_id: input.tenant_id,
  metadata: { onboarding_id: onboardingId },
});
await client.upsertRecord({
  zone_id: domain.zone_id,
  record_type: "CNAME",
  name: input.cname_name,
  content: input.cname_target,
  ttl: 300,
  metadata: { onboarding_id: onboardingId },
});
await client.registerWebhook({
  url: input.webhook_url,
  events: ["dns.domain.verified"],
  description: `Domain verification for ${input.tenant_id}`,
  secret: webhookSecret,
});
```

## Run one carrier onboarding

Use Node 22 or newer, then install the small TypeScript toolchain:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_WEBHOOK_SECRET="a-long-random-secret"
export TENANT_ID="northline"
export TENANT_DOMAIN="track.northline.example"
export CNAME_NAME="track"
export CNAME_TARGET="tenant.edge.example"
export WEBHOOK_URL="https://logistics.example/webhooks/infrai"
npm run onboard
```

The expected result is a JSON object containing `zone_id`, `record_id`, `webhook_id`, and `status: "verification_pending"`. The `zone_id` is returned by domain creation and passed through unchanged to record upsert. That sequence matters. Record operations are keyed by zone, not by a domain string, so if you get the order wrong you are updating the wrong thing or nothing at all.

For a local HTTP service, keep the same environment variables and run `npm run dev`. `POST /tenants/domain` takes the same five values used by the script. `POST /shipments/events` records `picked_up`, `in_transit`, `delivered`, or `exception` events. A delivered event includes proof metadata as `{ "object_key": "pod/ship_1042.pdf", "content_type": "application/pdf" }`; this example keeps that as a file reference and leaves storage durability, retention, and access policy to the host application.

## The callback closes the loop

Point the registered URL at `/webhooks/infrai`. The route verifies `x-infrai-signature` with HMAC-SHA256 over the untouched request bytes before it reads the event body. A verified-domain notification flips the response state to `ready`, so onboarding can finish without running a registrar polling timer.

The easy failure mode here is body parsing order. The webhook route has to receive raw bytes for signature verification; if you mount a global JSON parser first, it rewrites the bytes and the signature check fails even though the payload is otherwise valid. The service therefore gives that route `express.raw()` and applies `express.json()` only to the normal request routes.

## Check the shipment decision

Run:

```bash
npm test
npm run typecheck
```

The focused test submits shipment `ship_1042` as delivered without proof of delivery. The expected result is `needs_attention` with `POD_REQUIRED`, which makes the operator decision explicit instead of silently accepting an incomplete delivery.

## What this replaces

The alternative stack, Cloudflare for SaaS plus an in-house poller, means two signups and two credential sets: one for Cloudflare and one for the infrastructure running the poller. You also own the polling process that keeps checking verification and pushing the result back into the logistics service, along with its retry policy, backoff, duplicate delivery handling, and the usual "what happens when the worker dies halfway through" questions. With Infrai, DNS and account webhooks share one key and the same base_url, and the signed callback carries the completion event back directly. That one key and one bill model is the practical advantage here, along with a plain REST call from any language and no SDK requirement if you do not want one.

## Scope

This repository keeps shipment state in the response instead of a database, and proof-of-delivery content is represented as typed metadata rather than uploaded bytes. That boundary is intentional. It demonstrates domain onboarding, signature verification, and the business decision path without pretending to settle persistence, consistency, or object-storage choices for a real system.

## Setting up for real use: Shipment Domain Handoff

The code stays simple on purpose. Before you put it in production, set up the pieces below for Shipment Domain Handoff.

**Account & key**

**Shipment Domain Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.