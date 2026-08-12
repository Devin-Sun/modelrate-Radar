const html = "<!doctype html>\n<html lang=\"zh-CN\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta name=\"theme-color\" content=\"#071018\" />\n    <meta name=\"description\" content=\"对比 OpenAI 与 Anthropic Claude 的全球订阅价格。\" />\n    <title>ModelRate Radar — 全球 AI 订阅价格</title>\n    <script type=\"module\" crossorigin src=\"/assets/index-D3BMSjoc.js\"></script>\n    <link rel=\"stylesheet\" crossorigin href=\"/assets/index-DizqAnIG.css\">\n  </head>\n  <body>\n    <div id=\"root\"></div>\n  </body>\n</html>\n";

const APP_STORE_PRODUCTS = {
  openai: { slug: "chatgpt", id: "6448311069" },
  anthropic: { slug: "claude-by-anthropic", id: "6473753684" }
};

const SUBSCRIPTION_PLANS = {"openai":[{"id":"free","name":"Free","billing":"免费","kind":"free"},{"id":"go","name":"Go","billing":"个人套餐","storeProduct":"ChatGPT Go","annualKind":"none"},{"id":"plus","name":"Plus","billing":"个人套餐","storeProduct":"ChatGPT Plus","annualStoreProduct":"ChatGPT Plus","annualStoreProductOccurrence":1},{"id":"pro5","name":"Pro 5x","billing":"个人套餐","storeProduct":"ChatGPT Pro 5x","annualKind":"none"},{"id":"pro20","name":"Pro 20x","billing":"个人套餐","storeProduct":"ChatGPT Pro 20x","annualKind":"none"}],"anthropic":[{"id":"free","name":"Free","billing":"免费","kind":"free"},{"id":"pro","name":"Pro","billing":"个人套餐","storeProduct":"Claude Pro - Monthly","annualStoreProduct":"Claude Pro - Annual"},{"id":"max5","name":"Max 5x","billing":"个人套餐","storeProduct":"Claude Max 5x - Monthly","annualKind":"none","minimumReferenceAmount":100,"minimumReferenceDisplay":"US$100 / 月 · 官网"},{"id":"max20","name":"Max 20x","billing":"个人套餐","storeProduct":"Claude Max 20x - Monthly","annualKind":"none","minimumReferenceAmount":200,"minimumReferenceDisplay":"US$200 / 月 · 官网"},{"id":"team","name":"Team","billing":"每席位 · 至少 5 席","kind":"reference","referenceAmount":30,"referenceDisplay":"US$30 / 月","annualReferenceAmount":300,"annualReferenceDisplay":"US$300 / 年"}]};
const REGION_CODES = ["AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE","YT","ZA","ZM","ZW"];

const priceCache = new Map();
const CACHE_MS = 30 * 60 * 1000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const decodeText = (value) => value
  .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/<[^>]+>/g, "")
  .trim();

const parseAmount = (display) => {
  const compactMultiplier = /juta/i.test(display) ? 1000000 : /ribu/i.test(display) ? 1000 : 1;
  const raw = display.replace(/[^0-9.,]/g, "");
  if (!raw) return null;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (compactMultiplier > 1 && (comma >= 0 || dot >= 0)) {
    const decimalIndex = Math.max(comma, dot);
    const compactValue = Number(raw.slice(0, decimalIndex).replace(/[.,]/g, "") + "." + raw.slice(decimalIndex + 1).replace(/[.,]/g, ""));
    return compactValue * compactMultiplier;
  }
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    return Number(raw.replace(thousands, "").replace(decimal, ".")) * compactMultiplier;
  }
  const separator = comma >= 0 ? "," : dot >= 0 ? "." : null;
  if (!separator) return Number(raw) * compactMultiplier;
  const parts = raw.split(separator);
  const last = parts.at(-1);
  const amount = last.length === 2
    ? Number(parts.slice(0, -1).join("") + "." + last)
    : Number(parts.join(""));
  return amount * compactMultiplier;
};

async function fetchStorePrice(provider, country) {
  const config = APP_STORE_PRODUCTS[provider];
  const source = "https://apps.apple.com/" + country.toLowerCase() + "/app/" + config.slug + "/id" + config.id;
  try {
    const response = await fetch(source, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ModelRateRadar/1.0)" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return { provider, status: "unavailable", source, httpStatus: response.status };
    const page = await response.text();
    const currency = page.match(/"priceCurrency":"([A-Z]{3})"/)?.[1] || null;
    const pairs = [...page.matchAll(/<div class="text-pair[^>]*><span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>/gi)]
      .map((match) => ({ name: decodeText(match[1]), display: decodeText(match[2]) }));
    const plans = SUBSCRIPTION_PLANS[provider].map((plan) => {
      if (plan.kind === "free") return { ...plan, status: "live", display: "免费", amount: 0, currency };
      if (plan.kind === "reference") {
        const savingPercent = plan.annualReferenceAmount
          ? Math.round((1 - plan.annualReferenceAmount / 12 / plan.referenceAmount) * 100)
          : null;
        return {
          ...plan,
          status: "reference",
          display: plan.referenceDisplay,
          amount: plan.referenceAmount,
          currency: "USD",
          annual: plan.annualReferenceAmount ? {
            status: "reference",
            display: plan.annualReferenceDisplay,
            amount: plan.annualReferenceAmount,
            currency: "USD",
            monthlyEquivalent: plan.annualReferenceAmount / 12,
            savingPercent
          } : { status: "none", display: "仅月付" }
        };
      }
      if (plan.kind === "quote") return { ...plan, status: "quote", display: "官网询价", amount: null, currency, annual: { status: "quote", display: "官网询价" } };
      const matchingMonthlyPairs = pairs.filter((item) => item.name === plan.storeProduct);
      const selected = matchingMonthlyPairs[plan.storeProductOccurrence || 0];
      const amount = selected ? parseAmount(selected.display) : null;
      const annualSelected = plan.annualStoreProduct
        ? pairs.filter((item) => item.name === plan.annualStoreProduct)[plan.annualStoreProductOccurrence || 0]
        : null;
      const annualAmount = annualSelected ? parseAmount(annualSelected.display) : null;
      const annual = annualSelected ? {
        status: "live",
        display: annualSelected.display,
        amount: annualAmount,
        currency,
        monthlyEquivalent: annualAmount / 12,
        savingPercent: amount ? Math.round((1 - annualAmount / 12 / amount) * 100) : null
      } : plan.annualKind === "login"
        ? { status: "login", display: "登录官网查看" }
        : { status: "none", display: "仅月付" };
      if (!selected) return { ...plan, status: "not_listed", display: "当地未列价", amount: null, currency, annual };
      return { ...plan, status: "live", display: selected.display, amount, currency, annual };
    });
    return {
      provider,
      status: "live",
      currency,
      plans,
      channel: "iOS App Store",
      source
    };
  } catch (error) {
    return { provider, status: "error", source, message: error?.name === "TimeoutError" ? "timeout" : "fetch_failed" };
  }
}

async function monitorCountry(country) {
  const cached = priceCache.get(country);
  if (cached && Date.now() - cached.timestamp < CACHE_MS) return { ...cached.value, cached: true };
  const prices = await Promise.all(Object.keys(APP_STORE_PRODUCTS).map((provider) => fetchStorePrice(provider, country)));
  const value = { country, checkedAt: new Date().toISOString(), prices, cached: false };
  priceCache.set(country, { timestamp: Date.now(), value });
  return value;
}

async function monitorSystem() {
  let rates = null;
  let fxUpdatedAt = null;
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    if (payload.result === "success") {
      rates = payload.rates;
      fxUpdatedAt = payload.time_last_update_utc;
    }
  } catch {}
  return {
    checkedAt: new Date().toISOString(),
    collector: "Apple App Store country storefronts",
    intervalMinutes: 30,
    rates,
    fxUpdatedAt
  };
}

const databaseKey = (env) => env?.SUPABASE_SECRET_KEY || env?.SUPABASE_SERVICE_ROLE_KEY;
const backendConfigured = (env) => Boolean(env?.SUPABASE_URL && databaseKey(env));

const supabaseHeaders = (env, extra = {}) => ({
  apikey: databaseKey(env),
  "content-type": "application/json",
  "user-agent": "ModelRateRadar/1.0",
  ...extra
});

async function supabaseRequest(env, path, options = {}) {
  if (!backendConfigured(env)) throw new Error("database_not_configured");
  const response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + path, {
    ...options,
    headers: supabaseHeaders(env, options.headers || {}),
    signal: options.signal || AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error("supabase_" + response.status + ":" + text.slice(0, 240));
  return text ? JSON.parse(text) : null;
}

async function fetchAllLatestPrices(env) {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await supabaseRequest(env,
      "/rest/v1/latest_prices?select=country,provider,plan_id,plan_name,billing_period,amount,currency,display,usd_amount,usd_monthly_equivalent,source,observed_at&order=observed_at.desc&offset=" + offset + "&limit=1000"
    );
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function normalizePriceRows(results, rates) {
  const normalized = [];
  for (const result of results) {
    for (const providerResult of result.prices || []) {
      for (const plan of providerResult.plans || []) {
        const monthlyRate = rates[plan.currency || providerResult.currency];
        if (plan.status === "live" && Number.isFinite(plan.amount) && plan.amount > 0 && monthlyRate) {
          normalized.push({
            country: result.country,
            provider: providerResult.provider,
            plan_id: plan.id,
            plan_name: plan.name,
            billing_period: "monthly",
            amount: plan.amount,
            currency: plan.currency || providerResult.currency,
            display: plan.display,
            usd_amount: plan.amount / monthlyRate,
            usd_monthly_equivalent: plan.amount / monthlyRate,
            source: providerResult.source,
            observed_at: result.checkedAt
          });
        }
        const annualRate = rates[plan.annual?.currency || plan.currency || providerResult.currency];
        if (plan.annual?.status === "live" && Number.isFinite(plan.annual.amount) && plan.annual.amount > 0 && annualRate) {
          normalized.push({
            country: result.country,
            provider: providerResult.provider,
            plan_id: plan.id,
            plan_name: plan.name,
            billing_period: "annual",
            amount: plan.annual.amount,
            currency: plan.annual.currency || plan.currency || providerResult.currency,
            display: plan.annual.display,
            usd_amount: plan.annual.amount / annualRate,
            usd_monthly_equivalent: plan.annual.amount / 12 / annualRate,
            source: providerResult.source,
            observed_at: result.checkedAt
          });
        }
      }
    }
  }
  return normalized;
}

async function claimScanBatch(env, limit) {
  return supabaseRequest(env, "/rest/v1/rpc/claim_scan_batch", {
    method: "POST",
    body: JSON.stringify({ p_regions: REGION_CODES, p_limit: Math.min(Math.max(limit || 10, 1), 10) })
  });
}

async function recordPriceRows(env, rows) {
  return supabaseRequest(env, "/rest/v1/rpc/record_price_rows", {
    method: "POST",
    body: JSON.stringify({ p_rows: rows })
  });
}

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

async function sendEmail(env, payload) {
  if (!env?.RESEND_API_KEY || !env?.ALERT_FROM_EMAIL) throw new Error("email_not_configured");
  const { idempotencyKey, ...emailPayload } = payload;
  const response = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.RESEND_API_KEY,
      "content-type": "application/json",
      "user-agent": "ModelRateRadar/1.0",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
    },
    body: JSON.stringify({ from: env.ALERT_FROM_EMAIL, ...emailPayload }),
    signal: AbortSignal.timeout(12000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error("resend_" + response.status + ":" + body.slice(0, 200));
  return JSON.parse(body);
}

async function processAlertDeliveries(env, origin) {
  if (!env?.RESEND_API_KEY || !env?.ALERT_FROM_EMAIL) return { processed: 0, sent: 0, skipped: "email_not_configured" };
  const deliveries = await supabaseRequest(env, "/rest/v1/rpc/claim_alert_deliveries", {
    method: "POST",
    body: JSON.stringify({ p_limit: 20 })
  });
  let sent = 0;
  for (const delivery of deliveries) {
    try {
      const unsubscribeUrl = origin + "/api/alerts/unsubscribe?token=" + delivery.unsubscribe_token;
      await sendEmail(env, {
        idempotencyKey: "price-alert-" + delivery.delivery_id,
        to: [delivery.email],
        subject: "AI 套餐降价提醒：" + delivery.plan_name + " 下降 " + delivery.drop_percent + "%",
        html: "<h2>检测到订阅价格下降</h2>" +
          "<p><strong>" + escapeHtml(delivery.provider) + " · " + escapeHtml(delivery.plan_name) + "</strong></p>" +
          "<p>地区：" + escapeHtml(delivery.country) + " · 计费：" + escapeHtml(delivery.billing_period) + "</p>" +
          "<p>原折合月价：US$" + Number(delivery.previous_usd_monthly).toFixed(2) +
          "<br>当前折合月价：US$" + Number(delivery.current_usd_monthly).toFixed(2) +
          "<br>降幅：" + Number(delivery.drop_percent).toFixed(2) + "%</p>" +
          "<p><a href='" + origin + "'>查看全球价格雷达</a></p>" +
          "<p style='font-size:12px;color:#667'><a href='" + unsubscribeUrl + "'>退订此提醒</a></p>"
      });
      await supabaseRequest(env, "/rest/v1/alert_deliveries?id=eq." + delivery.delivery_id, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      });
      sent += 1;
    } catch (error) {
      await supabaseRequest(env, "/rest/v1/alert_deliveries?id=eq." + delivery.delivery_id, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: "failed", last_error: String(error.message || error).slice(0, 400) })
      }).catch(() => {});
    }
  }
  return { processed: deliveries.length, sent };
}

async function runBackgroundScan(env, origin, requestedLimit) {
  const system = await monitorSystem();
  if (!system.rates) throw new Error("exchange_rates_unavailable");
  const countries = await claimScanBatch(env, requestedLimit);
  const results = await Promise.all(countries.map(monitorCountry));
  const rows = normalizePriceRows(results, system.rates);
  const stored = await recordPriceRows(env, rows);
  const alerts = await processAlertDeliveries(env, origin);
  const state = await supabaseRequest(env, "/rest/v1/scan_state?id=eq.1&select=*");
  return { countries, results: results.length, rows: rows.length, stored, alerts, scan: state[0] || null };
}

async function getGlobalSummary(env) {
  const [rows, state] = await Promise.all([
    fetchAllLatestPrices(env),
    supabaseRequest(env, "/rest/v1/scan_state?id=eq.1&select=*")
  ]);
  const minima = new Map();
  const monitored = new Set();
  let newest = null;
  for (const row of rows) {
    monitored.add(row.country);
    if (!newest || row.observed_at > newest) newest = row.observed_at;
    const key = row.provider + ":" + row.plan_id + ":" + row.billing_period;
    const current = minima.get(key);
    if (!current || Number(row.usd_monthly_equivalent) < Number(current.usd_monthly_equivalent)) minima.set(key, row);
  }
  return {
    configured: true,
    scan: state[0] || null,
    monitoredCountries: monitored.size,
    latestPriceRows: rows.length,
    newestObservationAt: newest,
    minima: [...minima.values()].sort((a, b) => Number(a.usd_monthly_equivalent) - Number(b.usd_monthly_equivalent))
  };
}

async function getPriceHistory(env, url) {
  const country = (url.searchParams.get("country") || "").toUpperCase();
  const provider = url.searchParams.get("provider") || "";
  const planId = url.searchParams.get("plan") || "";
  const billing = url.searchParams.get("billing") || "monthly";
  if (!/^[A-Z]{2}$/.test(country) || !APP_STORE_PRODUCTS[provider] || !/^[a-z0-9-]{1,40}$/.test(planId) || !["monthly", "annual"].includes(billing)) {
    throw new Error("invalid_history_query");
  }
  const path = "/rest/v1/price_observations?select=amount,currency,display,usd_amount,usd_monthly_equivalent,observed_at" +
    "&country=eq." + encodeURIComponent(country) + "&provider=eq." + encodeURIComponent(provider) +
    "&plan_id=eq." + encodeURIComponent(planId) + "&billing_period=eq." + billing +
    "&order=observed_at.desc&limit=180";
  return supabaseRequest(env, path);
}

async function createAlertSubscription(env, origin, request) {
  if (!backendConfigured(env)) throw new Error("database_not_configured");
  if (!env?.RESEND_API_KEY || !env?.ALERT_FROM_EMAIL) throw new Error("email_not_configured");
  const input = await request.json();
  const email = String(input.email || "").trim().toLowerCase();
  const provider = input.provider && APP_STORE_PRODUCTS[input.provider] ? input.provider : null;
  const planId = input.planId ? String(input.planId).trim() : null;
  const country = input.country ? String(input.country).toUpperCase() : null;
  const threshold = Number(input.thresholdPercent ?? 1);
  const validPlanIds = new Set((provider ? SUBSCRIPTION_PLANS[provider] : Object.values(SUBSCRIPTION_PLANS).flat()).map((plan) => plan.id));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (country && !REGION_CODES.includes(country)) || (planId && !validPlanIds.has(planId)) || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("invalid_alert_subscription");
  }
  const created = await supabaseRequest(env, "/rest/v1/alert_subscriptions", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ email, provider, plan_id: planId, country, threshold_percent: threshold })
  });
  const subscription = created[0];
  const confirmationUrl = origin + "/api/alerts/confirm?token=" + subscription.confirm_token;
  await sendEmail(env, {
    idempotencyKey: "confirm-alert-" + subscription.id,
    to: [email],
    subject: "确认订阅 ModelRate 降价提醒",
    html: "<h2>确认降价提醒</h2><p>点击下面的按钮确认订阅：</p>" +
      "<p><a href='" + confirmationUrl + "' style='display:inline-block;padding:10px 16px;background:#18b98b;color:white;text-decoration:none;border-radius:6px'>确认订阅</a></p>" +
      "<p>只有价格下降达到 " + threshold + "% 时才会通知你。</p>"
  });
  return { ok: true, message: "确认邮件已发送" };
}

async function updateSubscriptionByToken(env, token, action) {
  if (!/^[0-9a-f-]{36}$/i.test(token || "")) throw new Error("invalid_token");
  const isConfirm = action === "confirm";
  const field = isConfirm ? "confirm_token" : "unsubscribe_token";
  const update = isConfirm
    ? { status: "active", confirmed_at: new Date().toISOString() }
    : { status: "unsubscribed", unsubscribed_at: new Date().toISOString() };
  const statusFilter = isConfirm ? "&status=eq.pending" : "&status=neq.unsubscribed";
  const rows = await supabaseRequest(env, "/rest/v1/alert_subscriptions?" + field + "=eq." + token + statusFilter, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(update)
  });
  return rows.length > 0;
}

const messagePage = (title, message) => new Response("<!doctype html><meta charset='utf-8'><title>" + escapeHtml(title) +
  "</title><style>body{font-family:system-ui;background:#071018;color:#eaf3f3;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:520px;padding:36px;border:1px solid #234;border-radius:16px;background:#0d1d26}a{color:#2ce0b0}</style>" +
  "<main><h1>" + escapeHtml(title) + "</h1><p>" + escapeHtml(message) + "</p><a href='/'>返回价格雷达</a></main>",
  { headers: { "content-type": "text/html; charset=utf-8" } });

export default {
  async fetch(request, runtimeEnv) {
    const env = { ...(typeof process !== "undefined" && process.env ? process.env : {}), ...(runtimeEnv || {}) };
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (url.pathname === "/api/monitor" && request.method === "GET") return json(await monitorSystem());
    if (url.pathname === "/api/backend/status" && request.method === "GET") {
      if (!backendConfigured(env)) return json({ configured: false, ready: false, database: "not_configured", email: env?.RESEND_API_KEY && env?.ALERT_FROM_EMAIL ? "configured" : "not_configured", scheduler: "not_configured" });
      try {
        const state = (await supabaseRequest(env, "/rest/v1/scan_state?id=eq.1&select=last_batch_at,last_completed_at,last_error"))[0] || null;
        const lastBatchAge = state?.last_batch_at ? Date.now() - new Date(state.last_batch_at).getTime() : null;
        const scheduler = !env?.SCAN_SECRET ? "not_configured" : lastBatchAge === null ? "waiting" : lastBatchAge < 3 * 60 * 1000 ? "running" : "stale";
        return json({ configured: true, ready: true, database: "connected", email: env?.RESEND_API_KEY && env?.ALERT_FROM_EMAIL ? "connected" : "not_configured", scheduler, scan: state });
      } catch (error) {
        return json({ configured: true, ready: false, database: "error", email: env?.RESEND_API_KEY && env?.ALERT_FROM_EMAIL ? "connected" : "not_configured", scheduler: "unknown", error: String(error.message || error) });
      }
    }
    if (url.pathname === "/api/global" && request.method === "GET") {
      if (!backendConfigured(env)) return json({ configured: false, error: "database_not_configured" }, 503);
      try { return json(await getGlobalSummary(env)); }
      catch (error) { return json({ configured: true, error: String(error.message || error) }, 502); }
    }
    if (url.pathname === "/api/history" && request.method === "GET") {
      if (!backendConfigured(env)) return json({ configured: false, error: "database_not_configured" }, 503);
      try { return json({ configured: true, observations: await getPriceHistory(env, url) }); }
      catch (error) { return json({ configured: true, error: String(error.message || error) }, 400); }
    }
    if (url.pathname === "/api/jobs/scan" && request.method === "POST") {
      const authorization = request.headers.get("authorization") || "";
      if (!env?.SCAN_SECRET || authorization !== "Bearer " + env.SCAN_SECRET) return json({ error: "unauthorized" }, 401);
      if (!backendConfigured(env)) return json({ error: "database_not_configured" }, 503);
      try {
        const body = await request.json().catch(() => ({}));
        return json(await runBackgroundScan(env, url.origin, Number(body.limit) || 10));
      } catch (error) {
        await supabaseRequest(env, "/rest/v1/scan_state?id=eq.1", {
          method: "PATCH",
          headers: { prefer: "return=minimal" },
          body: JSON.stringify({ last_error: String(error.message || error).slice(0, 400) })
        }).catch(() => {});
        return json({ error: String(error.message || error) }, 500);
      }
    }
    if (url.pathname === "/api/alerts" && request.method === "POST") {
      try { return json(await createAlertSubscription(env, url.origin, request), 201); }
      catch (error) {
        const message = String(error.message || error);
        const status = message.includes("not_configured") ? 503 : 400;
        return json({ error: message }, status);
      }
    }
    if (url.pathname === "/api/alerts/confirm" && request.method === "GET") {
      try {
        const confirmed = await updateSubscriptionByToken(env, url.searchParams.get("token"), "confirm");
        return messagePage(confirmed ? "订阅已确认" : "链接无效", confirmed ? "今后检测到符合条件的降价时，我们会发送邮件。" : "没有找到对应的待确认订阅。");
      } catch { return messagePage("链接无效", "确认链接无效或已经过期。"); }
    }
    if (url.pathname === "/api/alerts/unsubscribe" && request.method === "GET") {
      try {
        const removed = await updateSubscriptionByToken(env, url.searchParams.get("token"), "unsubscribe");
        return messagePage(removed ? "已退订" : "链接无效", removed ? "你将不再收到此价格提醒。" : "没有找到对应的订阅。");
      } catch { return messagePage("链接无效", "退订链接无效。"); }
    }
    if (url.pathname === "/api/prices" && request.method === "GET") {
      const countries = (url.searchParams.get("countries") || "").toUpperCase().split(",").filter(Boolean);
      if (countries.length) {
        if (countries.length > 10 || countries.some((country) => !/^[A-Z]{2}$/.test(country))) {
          return json({ error: "invalid_countries" }, 400);
        }
        return json({ results: await Promise.all([...new Set(countries)].map(monitorCountry)) });
      }
      const country = (url.searchParams.get("country") || "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) return json({ error: "invalid_country" }, 400);
      return json(await monitorCountry(country));
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
