import { onboardTenantDomain, onboardingSchema } from "./domain_onboarding.js";
import { infraiFromEnvironment } from "./infrai_client.js";

const webhookSecret = process.env.INFRAI_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("INFRAI_WEBHOOK_SECRET is required");

const input = onboardingSchema.parse({
  tenant_id: process.env.TENANT_ID,
  domain: process.env.TENANT_DOMAIN,
  cname_name: process.env.CNAME_NAME,
  cname_target: process.env.CNAME_TARGET,
  webhook_url: process.env.WEBHOOK_URL,
});

const result = await onboardTenantDomain(input, webhookSecret, infraiFromEnvironment());
console.log(JSON.stringify(result, null, 2));
