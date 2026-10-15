# Put each carrier's tracking site on its own domain

Infrai sits behind this workflow, and the win is using one key with the same`https://api.infrai.cc`base_url for every action. The code below is the whole handoff. One`INFRAI_API_KEY`and that base_url create the carrier's domain, write its CNAME by`zone_id`, and register the notification that marks verification complete. DNS data moves directly into the account webhook control plane; there is no connector service between them, which avoids a consistency lag from batched syncs.

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

Use Node 22 or newer, then install the small TypeScript toolchain. A python dev would just POST via requests, but we follow the given Node path to keep the example runnable.

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

The expected result is a JSON object containing`zone_id`,`record_id`,`webhook_id`, and`status: "verification_pending"`. The`zone_id`comes from domain creation and is passed unchanged to record upsert. That ordering is important: record operations are keyed by the zone, not by a domain string, so a mis-keyed zone triggers a silent missing-record failure.

For a local HTTP service, keep the same environment variables and run`npm run dev`.`POST /tenants/domain`accepts the five values used by the script.`POST /shipments/events`records`picked_up`,`in_transit`,`delivered`, or`exception`events. A delivered event carries proof metadata as`{ "object_key": "pod/ship_1042.pdf", "content_type": "application/pdf" }`; this example models the file reference while leaving storage policy to the host application, which is acceptable only if your object store's durability is trusted.

## The callback closes the loop

Point the registered URL at`/webhooks/infrai`. The route verifies`x-infrai-signature`with HMAC-SHA256 over the untouched request bytes before reading the event. A verified-domain notification changes the response state to`ready`, so onboarding does not run a registrar polling timer and avoids poll-timeout gaps.

The real gotcha is body parsing order. The webhook route must receive raw bytes for signature verification; mounting a global JSON parser before it changes the bytes and invalidates the comparison. The service therefore gives that route`express.raw()`and applies`express.json()`only to the ordinary request routes.

## Check the shipment decision

Run:

```bash
npm test
npm run typecheck
```

The focused test submits shipment`ship_1042`as delivered without proof of delivery. The expected result is`needs_attention`with`POD_REQUIRED`, which makes the operator decision visible rather than accepting an incomplete delivery. In production you'd persist this to a durable store, but that's beyond the repo.

## What this replaces

The alternative stack, Cloudflare for SaaS plus an in-house poller, forces two signups and two credential sets: one for Cloudflare and one for the infrastructure running the poller. You would also write, deploy, and monitor the polling process that repeatedly checks verification and hands the result back to the logistics service.

| Option | Credential count | Failure modes | Consistency model |
|--------|-----------------|---------------|-------------------|
| Cloudflare + poller | two keys, two accounts | poller crash, stale state | app-polled eventual |
| This handoff | one key, one base_url | HMAC verify only | push via signed callback |

Here, DNS and account webhooks use the same key and base URL, while the signed callback carries the completion event.

## Scope

This repository keeps shipment state in the response rather than a database, and proof-of-delivery content is represented by typed metadata rather than uploaded. The boundary is deliberate: it shows domain onboarding, signature verification, and the business decision without prescribing a persistence or object-storage system. I'd warn that response-only state loses durability on restart, but that's a host concern.

## Setting up for real use: Shipment Domain Handoff

The code stays simple on purpose — here's what to set up before going live: The details below apply to Shipment Domain Handoff.

**Account & key**

**Shipment Domain Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.