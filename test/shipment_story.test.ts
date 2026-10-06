import { describe, expect, it } from "vitest";
import { applyShipmentEvent } from "../src/shipment_story.js";

describe("shipment delivery decision", () => {
  it("routes a delivered scan without proof to exception handling", () => {
    const state = applyShipmentEvent({
      shipment_id: "ship_1042",
      kind: "delivered",
      occurred_at: "2026-09-25T08:30:00.000Z",
    });

    expect(state).toEqual({
      status: "needs_attention",
      exception: {
        code: "POD_REQUIRED",
        note: "Delivered scan needs proof of delivery",
      },
    });
  });
});
