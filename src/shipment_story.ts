import { z } from "zod";

export const shipmentEventSchema = z.object({
  shipment_id: z.string().min(1),
  kind: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
  occurred_at: z.string().datetime(),
  proof_of_delivery: z
    .object({ object_key: z.string().min(1), content_type: z.string().min(1) })
    .optional(),
  exception: z.object({ code: z.string().min(1), note: z.string().min(1) }).optional(),
});

export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

export type ShipmentState = {
  status: "moving" | "delivered" | "needs_attention";
  proof_of_delivery?: ShipmentEvent["proof_of_delivery"];
  exception?: ShipmentEvent["exception"];
};

export function applyShipmentEvent(event: ShipmentEvent): ShipmentState {
  if (event.kind === "delivered") {
    if (!event.proof_of_delivery) {
      return {
        status: "needs_attention",
        exception: { code: "POD_REQUIRED", note: "Delivered scan needs proof of delivery" },
      };
    }
    return { status: "delivered", proof_of_delivery: event.proof_of_delivery };
  }
  if (event.kind === "exception") {
    return {
      status: "needs_attention",
      exception: event.exception ?? {
        code: "DETAIL_REQUIRED",
        note: "Exception scan needs operator detail",
      },
    };
  }
  return { status: "moving" };
}
