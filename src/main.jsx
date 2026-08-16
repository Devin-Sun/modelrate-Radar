"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  Filter,
  Globe2,
  History,
  Info,
  LayoutDashboard,
  Mail,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X
} from "lucide-react";
import {
  AVAILABILITY_EXCEPTIONS,
  COVERAGE_SUMMARY,
  FALLBACK_RATES,
  ISO_REGION_CODES,
  OFFICIAL_SUPPORT,
  PRICE_SNAPSHOTS,
  PROVIDERS,
  REGION_META,
  SUBSCRIPTION_PLANS
} from "./data";

const zhRegionNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const enRegionNames = new Intl.DisplayNames(["en"], { type: "region" });
const flagFromCode = (code) => String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt()));

const availabilityFor = (provider, code) => {
  if (AVAILABILITY_EXCEPTIONS[provider]?.[code] === "workspace") {
    return { label: "仅 Workspace", kind: "limited" };
  }
  return OFFICIAL_SUPPORT[provider].has(code)
    ? { label: "官方支持", kind: "supported" }
    : { label: "未列入清单", kind: "unlisted" };
};

const money = (amount, currency) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2
  }).format(amount);

const usd = (amount) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(amount);

const annualComparison = (savingPercent) => {
  if (savingPercent > 0) return ` · 省 ${savingPercent}%`;
  if (savingPercent < 0) return ` · 比月付贵 ${Math.abs(savingPercent)}%`;
  return "";
};

const isPlausibleAnnualPrice = (monthlyAmount, annualAmount) => {
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || !Number.isFinite(annualAmount) || annualAmount <= 0) return false;
  const billedMonths = annualAmount / monthlyAmount;
  return billedMonths >= 6 && billedMonths <= 14;
};

const LOCAL_STORAGE_KEYS = {
  prices: "modelrate:latest-prices:v1",
  history: "modelrate:price-history:v1",
  alertRules: "modelrate:alert-rules:v1",
  alertEvents: "modelrate:alert-events:v1"
};

const CATALOG_PLAN_SORTS = [
  { value: "plan:openai:plus", provider: "openai", planId: "plus", label: "ChatGPT Plus" },
  { value: "plan:openai:pro5", provider: "openai", planId: "pro5", label: "ChatGPT Pro 5x" },
  { value: "plan:openai:pro20", provider: "openai", planId: "pro20", label: "ChatGPT Pro 20x" },
  { value: "plan:anthropic:pro", provider: "anthropic", planId: "pro", label: "Claude Pro" },
  { value: "plan:anthropic:max5", provider: "anthropic", planId: "max5", label: "Claude Max 5x" },
  { value: "plan:anthropic:max20", provider: "anthropic", planId: "max20", label: "Claude Max 20x" }
];

const readLocalJson = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
};

const writeLocalJson = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Browser storage may be unavailable or full; live scanning still works. */ }
};

const sanitizeCachedPrices = (cached) => Object.fromEntries(
  Object.entries(cached || {}).map(([country, result]) => [country, {
    ...result,
    prices: (result?.prices || []).filter((item) => PROVIDERS[item.provider]).map((item) => ({
      ...item,
      plans: (item.plans || []).filter((plan) => SUBSCRIPTION_PLANS[item.provider].some((current) => current.id === plan.id))
    }))
  }])
);

const isActivePlanRule = (rule) => !rule.provider || (PROVIDERS[rule.provider]
  && (!rule.planId || SUBSCRIPTION_PLANS[rule.provider].some((plan) => plan.id === rule.planId)));

const localHistoryKey = (country, provider, planId, billing = "monthly") => `${country}:${provider}:${planId}:${billing}`;

function ProviderMark({ id, size = "normal" }) {
  const provider = PROVIDERS[id];
  return (
    <span
      className={`provider-mark ${size}`}
      style={{ "--provider": provider.color }}
      aria-hidden="true"
    >
      {provider.mark}
    </span>
  );
}

function Sparkline({ provider, accent }) {
  const paths = {
    openai: "M1 24 C8 21, 12 25, 18 20 S28 15, 34 18 S43 13, 50 15 S60 7, 67 10 S76 5, 84 7",
    anthropic: "M1 23 C8 24, 13 18, 20 21 S29 12, 36 15 S45 11, 52 14 S61 6, 69 9 S78 7, 84 5"
  };
  return (
    <svg className="sparkline" viewBox="0 0 86 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={paths[provider]} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="84" cy={provider === "openai" ? 7 : 5} r="2.5" fill={accent} />
    </svg>
  );
}

function SideNav({ open, onClose, onAlerts, scanProgress }) {
  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-orbit"><span /></div>
          <div>
            <strong>ModelRate</strong>
            <small>全球价格雷达</small>
          </div>
          <button className="mobile-close" onClick={onClose} aria-label="关闭菜单"><X size={19} /></button>
        </div>
        <nav>
          <a className="nav-item active" href="#dashboard"><LayoutDashboard size={18} />价格总览</a>
          <a className="nav-item" href="#catalog"><Globe2 size={18} />完整地区目录</a>
          <button className="nav-item nav-button" onClick={() => { onAlerts(); onClose(); }}><Bell size={18} />降价提醒<span className="ready">本地</span></button>
          <a className="nav-item" href="#tools"><Sparkles size={18} />合规工具</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-card">
            <span className="sync-icon"><RefreshCw size={16} /></span>
            <div><strong>{scanProgress.running ? "全球扫描进行中" : "本地自动监测"}</strong><small>{scanProgress.completed} / {scanProgress.total} 个地区</small></div>
          </div>
          <a className="nav-item" href="#settings"><Settings size={18} />数据设置</a>
        </div>
      </aside>
      {open && <button className="sidebar-scrim" onClick={onClose} aria-label="关闭菜单" />}
    </>
  );
}

function StatCard({ label, value, note, icon: Icon, accent, children }) {
  return (
    <article className="stat-card">
      <div className="stat-heading">
        <span>{label}</span>
        <span className="stat-icon" style={{ "--accent": accent }}><Icon size={17} /></span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
      {children}
    </article>
  );
}

const planSortValue = (plan) => {
  if (Number.isFinite(plan.usd)) return plan.usd;
  if (plan.status === "quote") return Number.MAX_SAFE_INTEGER - 1;
  return Number.MAX_SAFE_INTEGER;
};

function PriceMonitorCell({ provider, plans, supported, scanning, country, onHistory }) {
  if (!supported) return <span className="monitor-unavailable">未开放</span>;
  const sortedPlans = [...(plans || [])].sort((a, b) => planSortValue(a) - planSortValue(b));
  const source = sortedPlans.find((plan) => plan.source)?.source || PROVIDERS[provider].source;
  const hasLiveStorePrice = sortedPlans.some((plan) => plan.kind === "live" && plan.amount > 0);

  return (
    <div className="plan-price-list">
      {sortedPlans.map((plan) => (
        <div className={`plan-price-row ${plan.status}`} key={plan.id}>
          <span className="plan-price-label"><strong>{plan.name}</strong><small>{plan.billing}</small>{plan.status === "live" && plan.amount > 0 && <button className="history-button" onClick={() => onHistory({ country, provider, plan })}><History size={10} />历史</button>}</span>
          <span className="plan-price-value">
            <span className="billing-price monthly">
              <em>月付</em><strong>{plan.display || (scanning ? "采集中…" : "暂未取得")}</strong>
              {Number.isFinite(plan.usd) && plan.usd > 0 && <small>{usd(plan.usd)} / 月</small>}
            </span>
            {plan.amount !== 0 && <span className={`billing-price annual ${plan.annual?.status || "none"}`}>
              <em>年付</em><strong>{plan.annual?.display || "仅月付"}</strong>
              {Number.isFinite(plan.annual?.usdMonthlyEquivalent) && <small>折合 {usd(plan.annual.usdMonthlyEquivalent)} / 月{annualComparison(plan.annual.savingPercent)}</small>}
            </span>}
          </span>
        </div>
      ))}
      <a className={hasLiveStorePrice ? "plan-source live" : "plan-source"} href={source} target="_blank" rel="noreferrer">
        {scanning ? <RefreshCw className="spin" size={10} /> : <i />}
        {scanning ? "正在同步当地价格" : hasLiveStorePrice ? "iOS 实时价" : "官方套餐信息"}
        <ExternalLink size={10} />
      </a>
    </div>
  );
}

export default function App() {
  const [rates, setRates] = useState(FALLBACK_RATES);
  const [rateStatus, setRateStatus] = useState("正在连接实时汇率");
  const [selectedProviders, setSelectedProviders] = useState(Object.keys(PROVIDERS));
  const [region, setRegion] = useState("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("price");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [emailAlias, setEmailAlias] = useState("");
  const [copied, setCopied] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState("ALL");
  const [catalogSort, setCatalogSort] = useState("name");
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [livePrices, setLivePrices] = useState(() => sanitizeCachedPrices(readLocalJson(LOCAL_STORAGE_KEYS.prices, {})));
  const [scanningCodes, setScanningCodes] = useState([]);
  const [collectorStatus, setCollectorStatus] = useState("正在连接价格监测器");
  const [backendStatus, setBackendStatus] = useState({ configured: false, database: "checking", email: "checking", scheduler: "checking" });
  const [globalSummary, setGlobalSummary] = useState(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertForm, setAlertForm] = useState({ email: "", provider: "", planId: "", country: "", thresholdPercent: 1 });
  const [alertMessage, setAlertMessage] = useState("");
  const [alertSending, setAlertSending] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyStatus, setHistoryStatus] = useState("");
  const [localAlertRules, setLocalAlertRules] = useState(() => readLocalJson(LOCAL_STORAGE_KEYS.alertRules, []).filter(isActivePlanRule));
  const [scanProgress, setScanProgress] = useState({ running: false, completed: 0, total: ISO_REGION_CODES.length });
  const livePricesRef = useRef(livePrices);
  const ratesRef = useRef(rates);
  const localAlertRulesRef = useRef(localAlertRules);
  const scanInProgressRef = useRef(false);

  useEffect(() => { ratesRef.current = rates; }, [rates]);
  useEffect(() => {
    livePricesRef.current = livePrices;
    writeLocalJson(LOCAL_STORAGE_KEYS.prices, livePrices);
  }, [livePrices]);
  useEffect(() => {
    localAlertRulesRef.current = localAlertRules;
    writeLocalJson(LOCAL_STORAGE_KEYS.alertRules, localAlertRules);
  }, [localAlertRules]);

  const fetchBackend = async () => {
    try {
      const statusResponse = await fetch("/api/backend/status", { cache: "no-store" });
      const status = await statusResponse.json();
      setBackendStatus(status);
      if (status.ready) {
        const summaryResponse = await fetch("/api/global", { cache: "no-store" });
        if (summaryResponse.ok) setGlobalSummary(await summaryResponse.json());
      }
    } catch {
      setBackendStatus({ configured: false, database: "offline", email: "offline", scheduler: "offline" });
    }
  };

  const fetchRates = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/monitor", { cache: "no-store" });
      if (!response.ok) throw new Error("rate service unavailable");
      const payload = await response.json();
      if (payload.rates) setRates({ ...FALLBACK_RATES, ...payload.rates, USD: 1 });
      setRateStatus(payload.rates ? "全球汇率已同步" : "汇率使用最近快照");
      setCollectorStatus("当地商店监测器在线");
    } catch {
      setRateStatus("使用最近一次汇率快照");
      setCollectorStatus("监测器暂时离线");
    } finally {
      setLastUpdated(new Date());
      window.setTimeout(() => setRefreshing(false), 450);
    }
  };

  const saveLocalHistory = (results) => {
    const history = readLocalJson(LOCAL_STORAGE_KEYS.history, {});
    const appendHistory = (key, price, currency, observedAt, monthlyDivisor = 1) => {
      if (price?.status !== "live" || !Number.isFinite(price.amount) || price.amount <= 0) return;
      const current = history[key] || [];
      const latest = current[0];
      if (latest && latest.amount === price.amount && latest.currency === currency) return;
      const fx = ratesRef.current[currency];
      history[key] = [{
        amount: price.amount,
        currency,
        display: price.display,
        usd_amount: fx ? price.amount / fx : null,
        usd_monthly_equivalent: fx ? price.amount / fx / monthlyDivisor : null,
        observed_at: observedAt
      }, ...current].slice(0, 60);
    };
    for (const result of results) {
      for (const providerResult of result.prices || []) {
        for (const plan of providerResult.plans || []) {
          const currency = plan.currency || providerResult.currency;
          appendHistory(localHistoryKey(result.country, providerResult.provider, plan.id), plan, currency, result.checkedAt);
          const annualCurrency = plan.annual?.currency || currency;
          appendHistory(localHistoryKey(result.country, providerResult.provider, plan.id, "annual"), plan.annual, annualCurrency, result.checkedAt, 12);
        }
      }
    }
    writeLocalJson(LOCAL_STORAGE_KEYS.history, history);
  };

  const detectLocalDrops = (previousPrices, results) => {
    const rules = localAlertRulesRef.current;
    if (!rules.length) return;
    const newEvents = [];
    for (const result of results) {
      const previousResult = previousPrices[result.country];
      if (!previousResult) continue;
      for (const providerResult of result.prices || []) {
        const previousProvider = previousResult.prices?.find((item) => item.provider === providerResult.provider);
        for (const plan of providerResult.plans || []) {
          const previousPlan = previousProvider?.plans?.find((item) => item.id === plan.id);
          const recordDrop = (currentPrice, previousPrice, billing, currency, previousCurrency) => {
            if (currentPrice?.status !== "live" || previousPrice?.status !== "live" || currency !== previousCurrency || !Number.isFinite(currentPrice.amount) || !Number.isFinite(previousPrice.amount) || currentPrice.amount >= previousPrice.amount) return;
            const dropPercent = (1 - currentPrice.amount / previousPrice.amount) * 100;
            const matched = rules.some((rule) => (!rule.provider || rule.provider === providerResult.provider)
              && (!rule.planId || rule.planId === plan.id)
              && (!rule.country || rule.country === result.country)
              && dropPercent >= Number(rule.thresholdPercent || 0));
            if (!matched) return;
            newEvents.push({
              id: crypto.randomUUID(), country: result.country, provider: providerResult.provider,
              planId: plan.id, planName: plan.name, billing, previousDisplay: previousPrice.display,
              currentDisplay: currentPrice.display, dropPercent, createdAt: result.checkedAt
            });
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              const billingLabel = billing === "annual" ? "年付" : "月付";
              new Notification(`${PROVIDERS[providerResult.provider].name} ${plan.name} ${billingLabel}降价 ${dropPercent.toFixed(1)}%`, {
                body: `${flagFromCode(result.country)} ${zhRegionNames.of(result.country)}：${previousPrice.display} → ${currentPrice.display}`,
                tag: `modelrate-${result.country}-${providerResult.provider}-${plan.id}-${billing}`
              });
            }
          };
          const currency = plan.currency || providerResult.currency;
          const previousCurrency = previousPlan?.currency || previousProvider?.currency;
          recordDrop(plan, previousPlan, "monthly", currency, previousCurrency);
          recordDrop(plan.annual, previousPlan?.annual, "annual", plan.annual?.currency || currency, previousPlan?.annual?.currency || previousCurrency);
        }
      }
    }
    if (newEvents.length) {
      const existing = readLocalJson(LOCAL_STORAGE_KEYS.alertEvents, []);
      writeLocalJson(LOCAL_STORAGE_KEYS.alertEvents, [...newEvents, ...existing].slice(0, 100));
      setCollectorStatus(`检测到 ${newEvents.length} 项符合规则的降价`);
    }
  };

  const applyScanResults = (results) => {
    detectLocalDrops(livePricesRef.current, results);
    saveLocalHistory(results);
    const next = { ...livePricesRef.current, ...Object.fromEntries(results.map((result) => [result.country, result])) };
    livePricesRef.current = next;
    setLivePrices(next);
  };

  const scanRegions = async (codes) => {
    const uniqueCodes = [...new Set(codes)].filter((code) => /^[A-Z]{2}$/.test(code));
    if (!uniqueCodes.length || scanInProgressRef.current) return;
    scanInProgressRef.current = true;
    setScanProgress({ running: true, completed: 0, total: uniqueCodes.length });
    setScanningCodes((current) => [...new Set([...current, ...uniqueCodes])]);
    for (let index = 0; index < uniqueCodes.length; index += 10) {
      const batch = uniqueCodes.slice(index, index + 10);
      try {
        const response = await fetch(`/api/prices?countries=${batch.join(",")}`, { cache: "no-store" });
        if (!response.ok) throw new Error("price collector unavailable");
        const payload = await response.json();
        applyScanResults(payload.results);
        setCollectorStatus(`全球扫描中 · ${Math.min(index + batch.length, uniqueCodes.length)} / ${uniqueCodes.length}`);
        setLastUpdated(new Date());
      } catch {
        const missing = batch.filter((code) => !livePricesRef.current[code]);
        if (missing.length) applyScanResults(missing.map((code) => ({
          country: code,
          checkedAt: new Date().toISOString(),
          prices: Object.keys(PROVIDERS).map((provider) => ({ provider, status: "error" }))
        })));
        setCollectorStatus("部分地区查价失败，保留上次结果并等待重试");
      } finally {
        setScanningCodes((current) => current.filter((code) => !batch.includes(code)));
        setScanProgress({ running: true, completed: Math.min(index + batch.length, uniqueCodes.length), total: uniqueCodes.length });
      }
    }
    scanInProgressRef.current = false;
    setScanProgress({ running: false, completed: uniqueCodes.length, total: uniqueCodes.length });
    setCollectorStatus(`全球扫描完成 · ${Object.keys(livePricesRef.current).length} 个地区已有结果`);
  };

  useEffect(() => {
    fetchRates();
    fetchBackend();
    const timer = window.setInterval(fetchRates, 30 * 60 * 1000);
    const backendTimer = window.setInterval(fetchBackend, 60 * 1000);
    return () => { window.clearInterval(timer); window.clearInterval(backendTimer); };
  }, []);

  useEffect(() => {
    scanRegions(ISO_REGION_CODES);
    const timer = window.setInterval(() => scanRegions(ISO_REGION_CODES), 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    const hydrated = PRICE_SNAPSHOTS.map((item) => {
      const meta = REGION_META[item.region];
      const fx = rates[meta.currency] || FALLBACK_RATES[meta.currency];
      return { ...item, meta, usd: item.amount / fx };
    }).filter((item) => {
      const provider = PROVIDERS[item.provider];
      const matchesProvider = selectedProviders.includes(item.provider);
      const matchesRegion = region === "ALL" || item.region === region;
      const haystack = `${item.meta.name} ${item.meta.currency} ${provider.name} ${provider.product}`.toLowerCase();
      return matchesProvider && matchesRegion && haystack.includes(query.toLowerCase());
    });

    return hydrated.sort((a, b) => {
      if (sort === "provider") return PROVIDERS[a.provider].name.localeCompare(PROVIDERS[b.provider].name);
      if (sort === "region") return a.meta.name.localeCompare(b.meta.name, "zh-CN");
      return a.usd - b.usd;
    });
  }, [rates, selectedProviders, region, query, sort]);

  const cheapest = rows[0];
  const overall = useMemo(() =>
    PRICE_SNAPSHOTS.map((item) => ({
      ...item,
      usd: item.amount / (rates[REGION_META[item.region].currency] || FALLBACK_RATES[REGION_META[item.region].currency])
    })).sort((a, b) => a.usd - b.usd)[0], [rates]);

  const averages = useMemo(() => Object.keys(PROVIDERS).map((provider) => {
    const items = PRICE_SNAPSHOTS.filter((item) => item.provider === provider);
    const avg = items.reduce((sum, item) => sum + item.amount / (rates[REGION_META[item.region].currency] || FALLBACK_RATES[REGION_META[item.region].currency]), 0) / items.length;
    return { provider, avg };
  }), [rates]);

  const getRegionPlanPrices = (code, provider) => {
    const live = livePrices[code]?.prices?.find((item) => item.provider === provider);
    if (live?.status === "live" && live.plans) return live.plans.map((plan) => {
      const fx = rates[plan.currency || live.currency];
      const annualFx = rates[plan.annual?.currency || plan.currency || live.currency];
      const annual = plan.annual?.status === "live" && !isPlausibleAnnualPrice(plan.amount, plan.annual.amount)
        ? { status: "none", display: "仅月付" }
        : plan.annual;
      return {
        ...plan,
        kind: "live",
        source: live.source,
        currency: plan.currency || live.currency,
        usd: Number.isFinite(plan.amount) && fx ? plan.amount / fx : null,
        annual: annual ? {
          ...annual,
          usdTotal: Number.isFinite(annual.amount) && annualFx ? annual.amount / annualFx : null,
          usdMonthlyEquivalent: Number.isFinite(annual.monthlyEquivalent) && annualFx ? annual.monthlyEquivalent / annualFx : null
        } : null
      };
    });

    const snapshot = PRICE_SNAPSHOTS.find((item) => item.region === code && item.provider === provider);
    const snapshotPlan = { openai: "plus", anthropic: "pro" }[provider];
    return SUBSCRIPTION_PLANS[provider].map((plan) => {
      if (plan.kind === "reference") return {
        ...plan,
        status: "reference",
        kind: "catalog",
        display: plan.referenceDisplay,
        amount: plan.referenceAmount,
        currency: "USD",
        usd: plan.referenceAmount,
        annual: plan.annualReferenceAmount ? {
          status: "reference",
          display: plan.annualReferenceDisplay,
          amount: plan.annualReferenceAmount,
          currency: "USD",
          usdTotal: plan.annualReferenceAmount,
          usdMonthlyEquivalent: plan.annualReferenceAmount / 12,
          savingPercent: Math.round((1 - plan.annualReferenceAmount / 12 / plan.referenceAmount) * 100)
        } : { status: "none", display: "仅月付" }
      };
      if (plan.kind === "quote") return { ...plan, status: "quote", kind: "catalog", display: "官网询价", amount: null, usd: null, annual: { status: "quote", display: "官网询价" } };
      if (snapshot && plan.id === snapshotPlan) {
        const meta = REGION_META[code];
        const fx = rates[meta.currency] || FALLBACK_RATES[meta.currency];
        return {
          ...plan,
          status: "live",
          kind: "snapshot",
          currency: meta.currency,
          display: money(snapshot.amount, meta.currency),
          amount: snapshot.amount,
          usd: snapshot.amount / fx,
          annual: plan.annualKind === "login" ? { status: "login", display: "登录官网查看" } : { status: "none", display: "仅月付" },
          source: PROVIDERS[provider].source
        };
      }
      return {
        ...plan,
        status: live ? "error" : "pending",
        kind: live ? "checked" : "catalog",
        display: live ? "暂未取得" : "等待当地价格",
        amount: null,
        usd: null,
        annual: plan.annualKind === "login" ? { status: "login", display: "登录官网查看" } : { status: "none", display: "仅月付" }
      };
    });
  };

  const lowestRegionPrice = (code) => Object.keys(PROVIDERS)
    .filter((provider) => availabilityFor(provider, code).kind !== "unlisted")
    .flatMap((provider) => getRegionPlanPrices(code, provider).map((plan) => ({ provider, plan })))
    .filter((item) => item.plan?.status === "live" && Number.isFinite(item.plan?.usd) && item.plan.usd > 0)
    .sort((a, b) => a.plan.usd - b.plan.usd)[0];

  const browserGlobalCheapest = ISO_REGION_CODES.flatMap((code) => Object.keys(PROVIDERS)
    .filter((provider) => availabilityFor(provider, code).kind !== "unlisted")
    .flatMap((provider) => getRegionPlanPrices(code, provider).map((plan) => ({ code, provider, plan }))))
    .filter((item) => item.plan?.status === "live" && Number.isFinite(item.plan?.usd) && item.plan.usd > 0)
    .sort((a, b) => a.plan.usd - b.plan.usd)[0];

  const storedGlobalCheapest = globalSummary?.minima?.filter((item) => Number(item.usd_monthly_equivalent) > 0)
    .sort((a, b) => Number(a.usd_monthly_equivalent) - Number(b.usd_monthly_equivalent))[0];
  const globalCheapest = storedGlobalCheapest ? {
    code: storedGlobalCheapest.country,
    provider: storedGlobalCheapest.provider,
    plan: { name: storedGlobalCheapest.plan_name, usd: Number(storedGlobalCheapest.usd_monthly_equivalent) }
  } : browserGlobalCheapest;

  const storedMinimums = useMemo(() => new Map((globalSummary?.minima || []).map((item) => [
    `${item.provider}:${item.plan_id}:${item.billing_period}`,
    item
  ])), [globalSummary]);

  const providerPlanMinimums = useMemo(() => Object.keys(PROVIDERS).map((provider) => ({
    provider,
    plans: SUBSCRIPTION_PLANS[provider].map((definition) => {
      if (definition.kind === "reference") return {
        ...definition,
        display: definition.referenceDisplay,
        usd: definition.referenceAmount,
        status: "reference",
        annualMinimum: definition.annualReferenceAmount ? {
          status: "reference",
          display: definition.annualReferenceDisplay,
          usdTotal: definition.annualReferenceAmount,
          usdMonthlyEquivalent: definition.annualReferenceAmount / 12,
          savingPercent: Math.round((1 - definition.annualReferenceAmount / 12 / definition.referenceAmount) * 100)
        } : { status: "none", display: "仅月付" }
      };
      if (definition.kind === "quote") return { ...definition, display: "官网询价", usd: null, status: "quote", annualMinimum: { status: "quote", display: "官网询价" } };
      const observedPlans = Object.entries(livePrices).flatMap(([code, result]) => {
        if (availabilityFor(provider, code).kind === "unlisted") return [];
        const providerResult = result.prices?.find((item) => item.provider === provider);
        const plan = providerResult?.plans?.find((item) => item.id === definition.id);
        return plan ? [{ code, providerResult, plan }] : [];
      });
      const candidates = observedPlans.flatMap(({ code, providerResult, plan }) => {
        const fx = rates[plan.currency || providerResult.currency];
        if (plan.status !== "live" || !Number.isFinite(plan.amount) || plan.amount <= 0 || !fx) return [];
        return [{ code, ...plan, usd: plan.amount / fx }];
      }).sort((a, b) => a.usd - b.usd);
      const annualCandidates = observedPlans.flatMap(({ code, providerResult, plan }) => {
        const fx = rates[plan.annual?.currency || plan.currency || providerResult.currency];
        if (plan.annual?.status !== "live" || !Number.isFinite(plan.annual.amount) || plan.annual.amount <= 0 || !fx) return [];
        return [{
          code,
          ...plan.annual,
          usdTotal: plan.annual.amount / fx,
          usdMonthlyEquivalent: plan.annual.amount / 12 / fx
        }];
      }).sort((a, b) => a.usdMonthlyEquivalent - b.usdMonthlyEquivalent);
      const annualMinimum = annualCandidates[0] || (definition.annualKind === "login"
        ? { status: "login", display: "登录官网查看" }
        : { status: "none", display: "仅月付" });
      const storedMonthly = storedMinimums.get(`${provider}:${definition.id}:monthly`);
      const storedAnnual = storedMinimums.get(`${provider}:${definition.id}:annual`);
      const databaseAnnual = storedAnnual ? {
        status: "live",
        code: storedAnnual.country,
        display: storedAnnual.display,
        usdTotal: Number(storedAnnual.usd_amount),
        usdMonthlyEquivalent: Number(storedAnnual.usd_monthly_equivalent)
      } : annualMinimum;
      const monthlyMinimum = [
        ...candidates.map((candidate) => ({ ...candidate, status: "live" })),
        ...(storedMonthly ? [{ code: storedMonthly.country, display: storedMonthly.display, usd: Number(storedMonthly.usd_monthly_equivalent), status: "live" }] : []),
        ...(definition.minimumReferenceAmount ? [{
          code: "US",
          display: definition.minimumReferenceDisplay,
          usd: definition.minimumReferenceAmount,
          status: "reference"
        }] : [])
      ].filter((candidate) => Number.isFinite(candidate.usd) && candidate.usd > 0)
        .sort((a, b) => a.usd - b.usd)[0];
      return monthlyMinimum
        ? { ...definition, ...monthlyMinimum, annualMinimum: databaseAnnual }
        : { ...definition, display: "暂无当地价", usd: null, status: "pending", annualMinimum };
    }).sort((a, b) => planSortValue(a) - planSortValue(b))
  })), [livePrices, rates, storedMinimums]);

  const openHistory = async (target) => {
    setHistoryTarget(target);
    setHistoryRows([]);
    if (!backendStatus.ready) {
      const localHistory = readLocalJson(LOCAL_STORAGE_KEYS.history, {});
      const monthly = (localHistory[localHistoryKey(target.country, target.provider, target.plan.id)] || []).map((item) => ({ ...item, billing_period: "monthly" }));
      const annual = (localHistory[localHistoryKey(target.country, target.provider, target.plan.id, "annual")] || []).map((item) => ({ ...item, billing_period: "annual" }));
      const observations = [...monthly, ...annual].sort((a, b) => new Date(b.observed_at) - new Date(a.observed_at));
      setHistoryRows(observations);
      setHistoryStatus(observations.length ? "" : "本浏览器尚未记录到这个套餐的价格变化。");
      return;
    }
    setHistoryStatus("正在读取历史价格…");
    try {
      const queryString = new URLSearchParams({ country: target.country, provider: target.provider, plan: target.plan.id, billing: "monthly" });
      const response = await fetch(`/api/history?${queryString}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "history_unavailable");
      setHistoryRows(payload.observations || []);
      setHistoryStatus(payload.observations?.length ? "" : "后台尚未积累这个套餐的价格记录。");
    } catch (error) {
      setHistoryStatus(String(error.message || error).includes("not_configured") ? "价格历史数据库尚未连接。" : "历史价格暂时无法读取。");
    }
  };

  const submitAlert = async (event) => {
    event.preventDefault();
    setAlertSending(true);
    setAlertMessage("");
    if (!backendStatus.ready) {
      const rule = {
        id: crypto.randomUUID(),
        provider: alertForm.provider || null,
        planId: alertForm.planId || null,
        country: alertForm.country || null,
        thresholdPercent: Number(alertForm.thresholdPercent || 0),
        createdAt: new Date().toISOString()
      };
      setLocalAlertRules((current) => [...current, rule]);
      let notificationNote = "规则已保存在当前浏览器。保持网页定期打开即可继续监测。";
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        notificationNote = permission === "granted" ? "规则已保存，浏览器通知已开启。" : "规则已保存；浏览器通知未授权，降价记录仍会保存在本机。";
      } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        notificationNote = "规则已保存，浏览器通知已开启。";
      }
      setAlertMessage(notificationNote);
      setAlertSending(false);
      return;
    }
    try {
      const response = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(alertForm) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "alert_unavailable");
      setAlertMessage("确认邮件已发送，请点击邮件中的链接启用提醒。");
    } catch (error) {
      setAlertMessage(String(error.message || error).includes("not_configured") ? "提醒服务尚未连接数据库或发信服务。" : "订阅失败，请稍后重试。");
    } finally {
      setAlertSending(false);
    }
  };

  const catalogRows = useMemo(() => {
    const planSort = CATALOG_PLAN_SORTS.find((option) => option.value === catalogSort);
    return ISO_REGION_CODES.map((code) => {
      const liveChecked = livePrices[code]?.prices?.some((price) => price.status === "live");
      const lowest = lowestRegionPrice(code);
      const selectedPlan = planSort
        ? getRegionPlanPrices(code, planSort.provider).find((plan) => plan.id === planSort.planId)
        : null;
      return {
        code,
        name: zhRegionNames.of(code),
        englishName: enRegionNames.of(code),
        flag: flagFromCode(code),
        priced: Boolean(REGION_META[code]) || liveChecked,
        lowestUsd: lowest?.plan.usd ?? Number.POSITIVE_INFINITY,
        selectedPlanUsd: selectedPlan?.status === "live" && Number.isFinite(selectedPlan.usd) && selectedPlan.usd > 0
          ? selectedPlan.usd
          : Number.POSITIVE_INFINITY
      };
    }).filter((item) => {
      const needle = catalogQuery.trim().toLowerCase();
      const isRegionCode = /^[a-z]{2}$/.test(needle);
      const matchesQuery = !needle || (isRegionCode
        ? item.code.toLowerCase() === needle
        : `${item.code} ${item.name} ${item.englishName}`.toLowerCase().includes(needle));
      const matchesFilter = catalogFilter === "ALL"
        || (catalogFilter === "PRICED" && item.priced)
        || (PROVIDERS[catalogFilter] && OFFICIAL_SUPPORT[catalogFilter].has(item.code));
      return matchesQuery && matchesFilter;
    }).sort((a, b) => {
      if (catalogSort === "priceAsc") return a.lowestUsd - b.lowestUsd || a.name.localeCompare(b.name, "zh-CN");
      if (planSort) return a.selectedPlanUsd - b.selectedPlanUsd || a.name.localeCompare(b.name, "zh-CN");
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [catalogQuery, catalogFilter, catalogSort, livePrices, rates]);

  const visibleCatalogRows = catalogExpanded || catalogQuery || catalogFilter !== "ALL"
    ? catalogRows
    : catalogRows.slice(0, 50);

  const toggleProvider = (provider) => {
    setSelectedProviders((current) =>
      current.includes(provider)
        ? current.length === 1 ? current : current.filter((item) => item !== provider)
        : [...current, provider]
    );
  };

  const generateAlias = () => {
    const words = ["radar", "orbit", "signal", "atlas", "pixel", "nova"];
    const word = words[Math.floor(Math.random() * words.length)];
    const token = crypto.randomUUID().slice(0, 8);
    setEmailAlias(`${word}+${token}@example.com`);
    setCopied(false);
  };

  const copyAlias = async () => {
    if (!emailAlias) return;
    await navigator.clipboard.writeText(emailAlias);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="app-shell">
      <SideNav open={menuOpen} onClose={() => setMenuOpen(false)} onAlerts={() => setAlertOpen(true)} scanProgress={scanProgress} />
      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu size={21} /></button>
          <div className="search-wrap">
            <Search size={17} />
            <input value={catalogQuery} onChange={(event) => { setCatalogQuery(event.target.value); window.location.hash = "catalog"; }} placeholder="搜索国家、地区或代码…" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <span className="live-pill"><i />LIVE</span>
            <button className="icon-button" onClick={() => setAlertOpen(true)} aria-label="降价提醒"><Bell size={19} />{localAlertRules.length > 0 && <i />}</button>
            <div className="avatar">M</div>
          </div>
        </header>

        <div className="content" id="dashboard">
          <section className="page-title">
            <div>
              <div className="eyebrow"><span /> GLOBAL SUBSCRIPTION INTELLIGENCE</div>
              <h1>全球 AI 订阅价格雷达</h1>
              <p>按国家查询两款官方应用的月付与年付价格，并以实时汇率比较实际成本和年付折扣。</p>
            </div>
            <button className="refresh-button" onClick={() => { fetchRates(); scanRegions(ISO_REGION_CODES); }} disabled={refreshing || scanProgress.running}>
              <RefreshCw className={refreshing || scanProgress.running ? "spin" : ""} size={17} />
              {scanProgress.running ? `扫描 ${scanProgress.completed}/${scanProgress.total}` : refreshing ? "同步中…" : "扫描全球"}
            </button>
          </section>

          <section className="stats-grid">
            <StatCard label="监测服务" value="2" note="OpenAI · Anthropic" icon={SlidersHorizontal} accent="#38e2b3">
              <div className="provider-stack">
                {Object.keys(PROVIDERS).map((id) => <ProviderMark key={id} id={id} size="small" />)}
              </div>
            </StatCard>
            <StatCard label="国家与地区目录" value="249" note={`${Object.keys(livePrices).length} 个地区已有本地缓存`} icon={Globe2} accent="#7aa7ff">
              <div className="flag-row">🌍 <span>完整收录</span></div>
            </StatCard>
            <StatCard
              label="当前最低可比价"
              value={globalCheapest ? usd(globalCheapest.plan.usd) : usd(overall.usd)}
              note={globalCheapest ? `${flagFromCode(globalCheapest.code)} ${zhRegionNames.of(globalCheapest.code)} · ${PROVIDERS[globalCheapest.provider].name} ${globalCheapest.plan.name}` : `${REGION_META[overall.region].flag} ${REGION_META[overall.region].name}`}
              icon={ArrowDownRight}
              accent="#ffd56a"
            >
              <span className="saving-pill">汇率口径</span>
            </StatCard>
            <StatCard label="全球自动扫描" value={scanProgress.running ? `${scanProgress.completed}/${scanProgress.total}` : scanProgress.completed ? "已完成" : "准备中"} note={scanProgress.running ? "网页打开期间持续采集当地价格" : "每 30 分钟重新扫描并计算最低价"} icon={ShieldCheck} accent="#bd8cff">
              <div className="timestamp">{lastUpdated ? `最近更新 ${lastUpdated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "正在启动首次扫描"}</div>
            </StatCard>
          </section>

          <section className="panel coverage-panel">
            <div className="panel-heading">
              <div><h2>两家厂商月付 / 年付最低价</h2><p>比较官网公开价与当前已监测的 {Object.keys(livePrices).length} 个国家和地区的 iOS 当地价；年付按总价和折合月价同时展示。</p></div>
              <span className="coverage-verified"><ShieldCheck size={14} />实时汇率折算</span>
            </div>
            <div className="coverage-grid">
              {providerPlanMinimums.map(({ provider: id, plans }) => {
                const coverage = COVERAGE_SUMMARY[id];
                return <article className="coverage-card plan-minimum-card" key={id}>
                  <div className="coverage-card-top">
                    <ProviderMark id={id} />
                    <div><strong>{PROVIDERS[id].name}</strong><small>{SUBSCRIPTION_PLANS[id].length} 个账户套餐</small></div>
                  </div>
                  <div className="plan-minimum-list">
                    {plans.map((plan) => <div className={`plan-minimum-row ${plan.status}`} key={plan.id}>
                      <span><strong>{plan.name}</strong><small>{plan.billing}</small></span>
                      <span className="minimum-price-stack">
                        <strong><em>月付最低</em>{Number.isFinite(plan.usd) && plan.usd > 0 ? usd(plan.usd) : plan.display}</strong>
                        {plan.code && <small>{flagFromCode(plan.code)} {zhRegionNames.of(plan.code)} · {plan.display}</small>}
                        <strong className={`annual-minimum ${plan.annualMinimum?.status || "none"}`}>
                          <em>年付最低</em>{Number.isFinite(plan.annualMinimum?.usdTotal) ? `${usd(plan.annualMinimum.usdTotal)} / 年` : plan.annualMinimum?.display || "仅月付"}
                        </strong>
                        {plan.annualMinimum?.code && <small>{flagFromCode(plan.annualMinimum.code)} {zhRegionNames.of(plan.annualMinimum.code)} · {plan.annualMinimum.display}</small>}
                        {Number.isFinite(plan.annualMinimum?.usdMonthlyEquivalent) && <small>折合 {usd(plan.annualMinimum.usdMonthlyEquivalent)} / 月{annualComparison(plan.annualMinimum.savingPercent)}</small>}
                      </span>
                    </div>)}
                  </div>
                  <a href={PROVIDERS[id].source || coverage.source} target="_blank" rel="noreferrer">查看官方套餐说明 <ExternalLink size={14} /></a>
                </article>;
              })}
            </div>
          </section>

          <section className="panel catalog-panel" id="catalog">
            <div className="panel-heading catalog-heading">
              <div><h2>全球价格监测表</h2><p>完整目录与价格明细已合并；每个套餐同时显示月付、年付总价、折合月价和折扣。</p></div>
              <span className="catalog-total"><i />{collectorStatus}</span>
            </div>
            <div className="catalog-toolbar">
              <label className="catalog-search"><Search size={16} /><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="搜索中文名、英文名或代码…" />{catalogQuery && <button onClick={() => setCatalogQuery("")} aria-label="清除搜索"><X size={15} /></button>}</label>
              <label className="select-control catalog-select"><Filter size={15} /><select value={catalogFilter} onChange={(event) => setCatalogFilter(event.target.value)}><option value="ALL">全部 249 项</option><option value="openai">ChatGPT 可用地区</option><option value="anthropic">Claude 可用地区</option><option value="PRICED">已有价格</option></select><ChevronDown size={14} /></label>
              <label className="select-control catalog-select sort-select"><ArrowDownRight size={15} /><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value)}><option value="name">按国家 / 地区</option><option value="priceAsc">最低付费套餐：从低到高</option>{CATALOG_PLAN_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}：从低到高</option>)}</select><ChevronDown size={14} /></label>
            </div>
            <div className="table-scroll catalog-scroll">
              <table className="catalog-table">
                <thead><tr><th><span className="region-column-head">国家 / 地区</span></th>{Object.entries(PROVIDERS).map(([provider, details]) => <th key={provider}><div className={`provider-column-head ${provider}`}><ProviderMark id={provider} size="tiny" /><div><strong>{details.name} 全部套餐</strong><small>{SUBSCRIPTION_PLANS[provider].length} 个订阅级别</small></div></div></th>)}<th><span className="lowest-column-head">本地区最低付费套餐</span></th></tr></thead>
                <tbody>
                  {visibleCatalogRows.map((item) => {
                    const lowest = lowestRegionPrice(item.code);
                    const scanning = scanningCodes.includes(item.code);
                    return (
                      <tr key={item.code}>
                        <td><div className="region-cell"><span>{item.flag}</span><div><strong>{item.name}</strong><small>{item.englishName} · {item.code}</small>{livePrices[item.code] && <em>监测于 {new Date(livePrices[item.code].checkedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</em>}</div></div></td>
                        {Object.keys(PROVIDERS).map((provider) => <td key={provider}><PriceMonitorCell country={item.code} provider={provider} plans={getRegionPlanPrices(item.code, provider)} supported={availabilityFor(provider, item.code).kind !== "unlisted"} scanning={scanning} onHistory={openHistory} /></td>)}
                        <td>{lowest ? <div className="lowest-cell"><strong>{usd(lowest.plan.usd)}</strong><span><ProviderMark id={lowest.provider} size="tiny" />{PROVIDERS[lowest.provider].name} {lowest.plan.name}</span><small>{lowest.plan.display}</small></div> : <span className="monitor-loading queued"><RefreshCw className={scanning ? "spin" : ""} size={13} />{scanning ? "自动采集中" : "暂无付费价格"}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!visibleCatalogRows.length && <div className="empty-state">没有找到相符的国家或地区。</div>}
            </div>
            <footer className="catalog-footer">
              <span><Info size={14} />年付只展示官方明确提供的价格；“仅月付”表示该套餐当前无年付选项，“登录官网查看”表示公开页面未提供当地金额。</span>
              {!catalogExpanded && !catalogQuery && catalogFilter === "ALL" ? <button onClick={() => setCatalogExpanded(true)}>显示全部 249 项 <ChevronDown size={14} /></button> : <span>当前显示 {visibleCatalogRows.length} 项</span>}
            </footer>
          </section>

          <section className="compliance-banner" id="tools">
            <div className="compliance-icon"><ShieldCheck size={23} /></div>
            <div><h3>合规注册助手</h3><p>生成不可投递的测试邮箱别名，并从官方入口注册。请使用真实所在地与有效邮箱完成购买。</p></div>
            <button onClick={() => { setModalOpen(true); if (!emailAlias) generateAlias(); }}>打开工具 <ArrowUpRight size={16} /></button>
          </section>

          <footer className="site-footer">
            <span>ModelRate Radar · 数据仅供比较，不构成购买建议</span>
            <span>官方来源 · 实时汇率 · 透明口径</span>
          </footer>
        </div>
      </main>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tool-title">
            <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="关闭"><X size={19} /></button>
            <span className="modal-badge"><Mail size={18} /></span>
            <h2 id="tool-title">合规注册助手</h2>
            <p>下面的地址属于保留域名，无法接收邮件，仅适合表单和界面测试。正式注册时请换成你本人可验证的真实邮箱。</p>
            <label className="alias-label">测试邮箱别名</label>
            <div className="alias-box"><code>{emailAlias}</code><button onClick={copyAlias}>{copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? "已复制" : "复制"}</button></div>
            <button className="generate-button" onClick={generateAlias}><RefreshCw size={16} />换一个测试别名</button>
            <div className="rule-box"><ShieldCheck size={18} /><span>不自动创建账号，不绕过地区、身份、支付或服务条款限制。</span></div>
            <div className="official-links">
              {Object.entries(PROVIDERS).map(([id, provider]) => <a key={id} href={provider.signup} target="_blank" rel="noreferrer"><ProviderMark id={id} size="tiny" />{provider.name} 官方入口<ExternalLink size={14} /></a>)}
            </div>
          </div>
        </div>
      )}

      {alertOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAlertOpen(false)}>
          <form className="modal alert-modal" onSubmit={submitAlert}>
            <button type="button" className="modal-close" onClick={() => setAlertOpen(false)} aria-label="关闭"><X size={19} /></button>
            <span className="modal-badge"><Bell size={18} /></span>
            <h2>订阅降价提醒</h2>
            <p>{backendStatus.ready ? "价格下降达到你设置的幅度时发送邮件。首次订阅需要点击邮件确认。" : "提醒规则保存在当前浏览器。网页打开并完成扫描后，如发现降价会发送浏览器通知。"}</p>
            <div className="form-grid">
              {backendStatus.ready && <label className="wide">邮箱<input required type="email" value={alertForm.email} onChange={(event) => setAlertForm({ ...alertForm, email: event.target.value })} placeholder="name@example.com" /></label>}
              <label>厂商<select value={alertForm.provider} onChange={(event) => setAlertForm({ ...alertForm, provider: event.target.value, planId: "" })}><option value="">全部厂商</option>{Object.entries(PROVIDERS).map(([id, provider]) => <option key={id} value={id}>{provider.name}</option>)}</select></label>
              <label>套餐<select value={alertForm.planId} onChange={(event) => setAlertForm({ ...alertForm, planId: event.target.value })}><option value="">全部套餐</option>{(alertForm.provider ? SUBSCRIPTION_PLANS[alertForm.provider] : Object.values(SUBSCRIPTION_PLANS).flat()).filter((plan, index, list) => list.findIndex((item) => item.id === plan.id && item.name === plan.name) === index).map((plan) => <option key={`${plan.id}-${plan.name}`} value={plan.id}>{plan.name}</option>)}</select></label>
              <label>地区<select value={alertForm.country} onChange={(event) => setAlertForm({ ...alertForm, country: event.target.value })}><option value="">全球任意地区</option>{ISO_REGION_CODES.map((code) => <option key={code} value={code}>{flagFromCode(code)} {zhRegionNames.of(code)} · {code}</option>)}</select></label>
              <label>最低降幅<input type="number" min="0" max="100" step="0.1" value={alertForm.thresholdPercent} onChange={(event) => setAlertForm({ ...alertForm, thresholdPercent: event.target.value })} /><span className="input-suffix">%</span></label>
            </div>
            <button className="generate-button" disabled={alertSending}>{alertSending ? <RefreshCw className="spin" size={16} /> : <Bell size={16} />}{alertSending ? "正在保存…" : backendStatus.ready ? "发送确认邮件" : "保存本地提醒"}</button>
            {alertMessage && <div className="form-message">{alertMessage}</div>}
            {!backendStatus.ready && localAlertRules.length > 0 && <div className="local-rule-list">
              <strong>已启用 {localAlertRules.length} 条本地规则</strong>
              {localAlertRules.map((rule) => <div key={rule.id}>
                <span>{rule.country ? `${flagFromCode(rule.country)} ${zhRegionNames.of(rule.country)}` : "全球"} · {rule.provider ? PROVIDERS[rule.provider].name : "全部厂商"} · 降 {rule.thresholdPercent}%</span>
                <button type="button" onClick={() => setLocalAlertRules((current) => current.filter((item) => item.id !== rule.id))}>删除</button>
              </div>)}
            </div>}
          </form>
        </div>
      )}

      {historyTarget && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setHistoryTarget(null)}>
          <div className="modal history-modal">
            <button className="modal-close" onClick={() => setHistoryTarget(null)} aria-label="关闭"><X size={19} /></button>
            <span className="modal-badge"><History size={18} /></span>
            <h2>{flagFromCode(historyTarget.country)} {zhRegionNames.of(historyTarget.country)} · {historyTarget.plan.name}</h2>
            <p>{PROVIDERS[historyTarget.provider].name} 月付价格历史，{backendStatus.ready ? "最多显示最近 180 次记录。" : "保存在当前浏览器，最多记录最近 60 次价格变化。"}</p>
            {historyStatus && <div className="history-empty">{historyStatus}</div>}
            {!!historyRows.length && <div className="history-list">{historyRows.slice(0, 30).map((row, index) => <div key={`${row.observed_at}-${index}`}><span>{new Date(row.observed_at).toLocaleString("zh-CN")} · {row.billing_period === "annual" ? "年付" : "月付"}</span><strong>{row.display}</strong><small>{Number(row.usd_monthly_equivalent) > 0 ? `折合 ${usd(Number(row.usd_monthly_equivalent))} / 月` : "等待汇率换算"}</small></div>)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
