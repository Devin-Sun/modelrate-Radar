import assert from "node:assert/strict";

const { default: worker } = await import("../dist/server/index.js?test=" + Date.now());
const nativeFetch = globalThis.fetch;
const recorded = { priceRows: [], emails: [] };

const latestRows = [
  { country: "US", provider: "openai", plan_id: "plus", plan_name: "Plus", billing_period: "monthly", amount: 20, currency: "USD", display: "$20", usd_amount: 20, usd_monthly_equivalent: 20, source: "official", observed_at: "2026-08-04T00:00:00Z" },
  { country: "US", provider: "openai", plan_id: "plus", plan_name: "Plus", billing_period: "annual", amount: 200, currency: "USD", display: "$200", usd_amount: 200, usd_monthly_equivalent: 16.67, source: "official", observed_at: "2026-08-04T00:00:00Z" },
  { country: "IN", provider: "openai", plan_id: "plus", plan_name: "Plus", billing_period: "monthly", amount: 1499, currency: "INR", display: "₹1,499", usd_amount: 17.1, usd_monthly_equivalent: 17.1, source: "official", observed_at: "2026-08-04T01:00:00Z" },
  { country: "ST", provider: "openai", plan_id: "plus", plan_name: "Plus", billing_period: "monthly", amount: 19.99, currency: "USD", display: "$19.99", usd_amount: 19.99, usd_monthly_equivalent: 19.99, source: "official", observed_at: "2026-08-04T02:00:00Z" },
  { country: "ST", provider: "openai", plan_id: "plus", plan_name: "Plus", billing_period: "annual", amount: 19.99, currency: "USD", display: "$19.99", usd_amount: 19.99, usd_monthly_equivalent: 1.67, source: "official", observed_at: "2026-08-04T02:00:00Z" }
];

const storePage = `
  <script type="application/ld+json">{"priceCurrency":"USD"}</script>
  <div class="text-pair"><span>ChatGPT Plus</span><span>$19.99</span></div>
  <div class="text-pair"><span>ChatGPT Plus</span><span>$200.00</span></div>
  <div class="text-pair"><span>Claude Pro - Monthly</span><span>$20.00</span></div>
  <div class="text-pair"><span>Claude Pro - Annual</span><span>$200.00</span></div>`;

const indonesiaStorePage = `
  <script type="application/ld+json">{"priceCurrency":"IDR"}</script>
  <div class="text-pair"><span>ChatGPT Go</span><span>Rp 75ribu</span></div>
  <div class="text-pair"><span>ChatGPT Plus</span><span>Rp 349ribu</span></div>
  <div class="text-pair"><span>ChatGPT Plus</span><span>Rp 3,499juta</span></div>
  <div class="text-pair"><span>ChatGPT Pro 5x</span><span>Rp 1,889juta</span></div>
  <div class="text-pair"><span>Claude Pro - Monthly</span><span>Rp 349ribu</span></div>
  <div class="text-pair"><span>Claude Pro - Annual</span><span>Rp 3,999juta</span></div>`;

const duplicateMonthlyStorePage = `
  <script type="application/ld+json">{"priceCurrency":"USD"}</script>
  <div class="text-pair"><span>ChatGPT Plus</span><span>$19.99</span></div>
  <div class="text-pair"><span>ChatGPT Plus</span><span>$19.99</span></div>`;

globalThis.fetch = async (input, options = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const method = options.method || "GET";
  if (url === "https://open.er-api.com/v6/latest/USD") {
    return Response.json({ result: "success", rates: { USD: 1, INR: 87.66 }, time_last_update_utc: "now" });
  }
  if (url.startsWith("https://apps.apple.com/")) return new Response(url.includes("/id/app/") ? indonesiaStorePage : url.includes("/st/app/") ? duplicateMonthlyStorePage : storePage);
  if (url === "https://mail.test/emails") {
    recorded.emails.push(JSON.parse(options.body));
    return Response.json({ id: "email-1" });
  }
  const parsed = new URL(url);
  if (parsed.origin !== "https://db.test") throw new Error("Unexpected fetch: " + url);
  if (parsed.pathname.endsWith("/rpc/claim_scan_batch")) return Response.json(["US"]);
  if (parsed.pathname.endsWith("/rpc/record_price_rows")) {
    recorded.priceRows.push(...JSON.parse(options.body).p_rows);
    return Response.json({ observations: recorded.priceRows.length, alerts_created: 0 });
  }
  if (parsed.pathname.endsWith("/rpc/claim_alert_deliveries")) return Response.json([]);
  if (parsed.pathname.endsWith("/latest_prices")) return Response.json(latestRows);
  if (parsed.pathname.endsWith("/price_observations")) return Response.json([latestRows[1]]);
  if (parsed.pathname.endsWith("/scan_state")) return Response.json([{ id: 1, cycle_number: 2, next_index: 10 }]);
  if (parsed.pathname.endsWith("/alert_subscriptions") && method === "POST") {
    return Response.json([{ id: "subscription-1", confirm_token: "00000000-0000-4000-8000-000000000001" }]);
  }
  if (parsed.pathname.endsWith("/alert_subscriptions") && method === "PATCH") return Response.json([{ id: "subscription-1" }]);
  if (parsed.pathname.endsWith("/alert_deliveries") && method === "PATCH") return new Response(null, { status: 204 });
  throw new Error("Unhandled database request: " + method + " " + url);
};

const env = {
  SUPABASE_URL: "https://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SCAN_SECRET: "scan-secret",
  RESEND_API_KEY: "resend-key",
  RESEND_API_URL: "https://mail.test/emails",
  ALERT_FROM_EMAIL: "ModelRate <alerts@example.com>"
};

try {
  const summaryResponse = await worker.fetch(new Request("https://site.test/api/global"), env);
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.monitoredCountries, 3);
  assert.equal(summary.minima.find((row) => row.billing_period === "monthly").country, "IN");
  assert.equal(summary.minima.find((row) => row.billing_period === "annual").country, "US");

  const statusResponse = await worker.fetch(new Request("https://site.test/api/backend/status"), env);
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).ready, true);

  const historyResponse = await worker.fetch(new Request("https://site.test/api/history?country=IN&provider=openai&plan=plus&billing=monthly"), env);
  assert.equal(historyResponse.status, 200);
  assert.equal((await historyResponse.json()).observations.length, 1);

  const indonesiaResponse = await worker.fetch(new Request("https://site.test/api/prices?country=ID"), env);
  assert.equal(indonesiaResponse.status, 200);
  const indonesia = await indonesiaResponse.json();
  assert.equal(indonesia.prices.length, 2);
  assert.equal(indonesia.prices.flatMap((item) => item.plans).some((plan) => plan.id === "free"), false);
  assert.equal(indonesia.prices.flatMap((item) => item.plans).some((plan) => ["business", "enterprise"].includes(plan.id)), false);
  assert.equal(indonesia.prices.find((item) => item.provider === "openai").plans.find((plan) => plan.id === "plus").amount, 349000);
  assert.equal(indonesia.prices.find((item) => item.provider === "openai").plans.find((plan) => plan.id === "plus").annual.amount, 3499000);
  assert.equal(indonesia.prices.find((item) => item.provider === "openai").plans.find((plan) => plan.id === "pro5").amount, 1889000);
  assert.equal(indonesia.prices.find((item) => item.provider === "anthropic").plans.find((plan) => plan.id === "pro").annual.amount, 3999000);

  const duplicateMonthlyResponse = await worker.fetch(new Request("https://site.test/api/prices?country=ST"), env);
  assert.equal(duplicateMonthlyResponse.status, 200);
  const duplicateMonthly = await duplicateMonthlyResponse.json();
  assert.equal(duplicateMonthly.prices.find((item) => item.provider === "openai").plans.find((plan) => plan.id === "plus").annual.status, "none");

  const alertResponse = await worker.fetch(new Request("https://site.test/api/alerts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reader@example.com", provider: "openai", planId: "plus", country: "IN", thresholdPercent: 5 })
  }), env);
  assert.equal(alertResponse.status, 201);
  assert.equal(recorded.emails.length, 1);

  const invalidAlertResponse = await worker.fetch(new Request("https://site.test/api/alerts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reader@example.com", provider: "openai", planId: "made-up-plan", country: "US" })
  }), env);
  assert.equal(invalidAlertResponse.status, 400);

  const scanResponse = await worker.fetch(new Request("https://site.test/api/jobs/scan", {
    method: "POST",
    headers: { authorization: "Bearer scan-secret", "content-type": "application/json" },
    body: JSON.stringify({ limit: 1 })
  }), env);
  assert.equal(scanResponse.status, 200);
  const scan = await scanResponse.json();
  assert.deepEqual(scan.countries, ["US"]);
  assert.ok(recorded.priceRows.some((row) => row.provider === "anthropic" && row.billing_period === "annual"));

  const confirmResponse = await worker.fetch(new Request("https://site.test/api/alerts/confirm?token=00000000-0000-4000-8000-000000000001"), env);
  assert.equal(confirmResponse.status, 200);
  assert.match(await confirmResponse.text(), /订阅已确认/);

  console.log("backend integration tests passed");
} finally {
  globalThis.fetch = nativeFetch;
}
