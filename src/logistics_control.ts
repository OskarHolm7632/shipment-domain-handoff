import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { hasValidSignature, onboardTenantDomain, onboardingSchema } from "./domain_onboarding.js";
import { InfraiError, infraiFromEnvironment } from "./infrai_client.js";
import { applyShipmentEvent, shipmentEventSchema } from "./shipment_story.js";

const webhookEventSchema = z.object({
  type: z.literal("dns.domain.verified"),
  data: z.object({ domain: z.string(), status: z.string() }),
});

const app = express();
const rawJson = express.raw({ type: "application/json" });
const json = express.json();
const client = infraiFromEnvironment();
const webhookSecret = process.env.INFRAI_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("INFRAI_WEBHOOK_SECRET is required");

app.post("/webhooks/infrai", rawJson, (req, res) => {
  const signature = req.header("x-infrai-signature") ?? "";
  if (!hasValidSignature(req.body, signature, webhookSecret)) {
    res.status(401).json({ error: "invalid signature" });
    return;
  }
  const event = webhookEventSchema.parse(JSON.parse(req.body.toString("utf8")));
  res.status(200).json({
    domain: event.data.domain,
    status: event.data.status === "verified" ? "ready" : "verification_pending",
  });
});

app.post("/tenants/domain", json, async (req, res, next) => {
  try {
    const input = onboardingSchema.parse(req.body);
    res.status(202).json(await onboardTenantDomain(input, webhookSecret, client));
  } catch (error) {
    next(error);
  }
});

app.post("/shipments/events", json, (req, res, next) => {
  try {
    const event = shipmentEventSchema.parse(req.body);
    res.status(200).json({ shipment_id: event.shipment_id, ...applyShipmentEvent(event) });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "invalid request", issues: error.issues });
    return;
  }
  if (error instanceof InfraiError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    res.status(status).json({ error: error.code, details: error.details });
    return;
  }
  res.status(500).json({ error: "request failed" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Logistics control listening on http://localhost:${port}`));
