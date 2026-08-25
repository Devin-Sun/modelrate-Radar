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
  ANTHROPIC_US_PRICING_SOURCE,
  AVAILABILITY_EXCEPTIONS,
  COVERAGE_SUMMARY,
  FALLBACK_RATES,
  ISO_REGION_CODES,
  OFFICIAL_SUPPORT,
  OPENAI_US_PRICING_SOURCE,
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
  history: "modelrate:price-history:v1",
  alertRules: "modelrate:alert-rules:v1",
  alertEvents: "modelrate:alert-events:v1"
};

const DEFAULT_PLAN_IDS = { openai: "plus", anthropic: "pro" };

const PROVIDER_PAGES = {
  openai: {
    path: "/openai",
    navLabel: "OpenAI / ChatGPT",
    title: "OpenAI 全球订阅价格",
    description: "按国家查询 ChatGPT 各档套餐的月付与年付价格，并以实时汇率比较实际成本和年付折扣。",
    tableTitle: "ChatGPT 全球价格监测表",
    product: "ChatGPT"
  },
  anthropic: {
    path: "/claude",
    navLabel: "Anthropic / Claude",
    title: "Claude 全球订阅价格",
    description: "按国家查询 Claude 各档套餐的月付与年付价格，并以实时汇率比较实际成本和年付折扣。",
    tableTitle: "Claude 全球价格监测表",
    product: "Claude"
  }
};

const providerFromPath = (pathname) => pathname.replace(/\/+$/, "") === PROVIDER_PAGES.anthropic.path ? "anthropic" : "openai";

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

function SideNav({ open, onClose, onAlerts, scanProgress, activeProvider, onProviderChange }) {
  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-orbit"><span /></div>
          <div>
            <strong>AI Price Radar</strong>
            <small>AI 订阅价格雷达</small>
          </div>
          <button className="mobile-close" onClick={onClose} aria-label="关闭菜单"><X size={19} /></button>
        </div>
        <nav>
          {Object.entries(PROVIDER_PAGES).map(([provider, page]) => (
            <button className={`nav-item nav-button ${activeProvider === provider ? "active" : ""}`} key={provider} onClick={() => onProviderChange(provider)}>
              <ProviderMark id={provider} size="tiny" />{page.navLabel}
            </button>
          ))}
          <button className="nav-item nav-button" onClick={() => { onAlerts(); onClose(); }}><Bell size={18} />降价提醒<span className="ready">本地</span></button>
          <a className="nav-item" href="#tools"><Sparkles size={18} />合规工具</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-card">
            <span className="sync-icon"><RefreshCw size={16} /></span>
            <div><strong>{scanProgress.running ? "全球扫描进行中" : "数据库每日快照"}</strong><small>{scanProgress.completed} / {scanProgress.total} 个地区</small></div>
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
        {scanning ? "正在同步当地价格" : hasLiveStorePrice ? "当地公开价" : "官方套餐信息"}
        <ExternalLink size={10} />
      </a>
    </div>
  );
}

const formatRelativePercent = (percent) => Math.abs(percent) >= 10 ? Math.abs(percent).toFixed(0) : Math.abs(percent).toFixed(1);
const usMonthlyBaseline = (plan) => Number.isFinite(plan?.usReferenceAmount) ? plan.usReferenceAmount : plan?.usd;
const usAnnualBaseline = (plan) => Number.isFinite(plan?.usAnnualReferenceAmount) ? plan.usAnnualReferenceAmount : plan?.annual?.usdTotal;
const officialUsPricingSource = (provider) => provider === "openai" ? OPENAI_US_PRICING_SOURCE : ANTHROPIC_US_PRICING_SOURCE;

const relativeToUs = (localAmount, usAmount, isUnitedStates) => {
  if (!Number.isFinite(localAmount) || localAmount <= 0 || !Number.isFinite(usAmount) || usAmount <= 0) return null;
  if (isUnitedStates) return { kind: "baseline", label: "美国基准价" };
  const percent = (1 - localAmount / usAmount) * 100;
  if (Math.abs(percent) < 0.05) return { kind: "same", label: "与美国同价" };
  const formatted = formatRelativePercent(percent);
  return percent > 0
    ? { kind: "discount", label: `优惠 ${formatted}%` }
    : { kind: "premium", label: `贵 ${formatted}%` };
};

function UsPriceComparisonCell({ country, plans, usPlans, scanning }) {
  const usPlanMap = new Map((usPlans || []).map((plan) => [plan.id, plan]));
  return (
    <div className="us-comparison-list">
      {(plans || []).map((plan) => {
        const usPlan = usPlanMap.get(plan.id);
        const usMonthly = usMonthlyBaseline(usPlan);
        const monthly = relativeToUs(plan.usd, usMonthly, country === "US");
        const usAnnualTotal = usAnnualBaseline(usPlan);
        const hasUsAnnual = Number.isFinite(usAnnualTotal) && usAnnualTotal > 0;
        const annual = hasUsAnnual
          ? relativeToUs(plan.annual?.usdTotal, usAnnualTotal, country === "US")
          : null;
        return (
          <div className="us-comparison-row" key={plan.id}>
            <strong>{plan.name}</strong>
            <div className="us-comparison-values">
              <span className={monthly?.kind || "unavailable"}><em>月付</em>{monthly?.label || (scanning ? "扫描中" : "暂无可比价格")}</span>
              {hasUsAnnual && <span className={annual?.kind || "unavailable"}><em>年付</em>{annual?.label || (scanning ? "扫描中" : "当地暂无年付价")}</span>}
            </div>
            {monthly && country !== "US" && <small>当地 {usd(plan.usd)} · 美国官网 {usd(usMonthly)}</small>}
            {annual && country !== "US" && <small>年付当地 {usd(plan.annual.usdTotal)} · 美国官网 {usd(usAnnualTotal)}</small>}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [activeProvider, setActiveProvider] = useState(() => providerFromPath(typeof window === "undefined" ? "/openai" : window.location.pathname));
  const [rates, setRates] = useState(FALLBACK_RATES);
  const [rateStatus, setRateStatus] = useState("正在连接实时汇率");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [emailAlias, setEmailAlias] = useState("");
  const [copied, setCopied] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState("ALL");
  const [catalogSort, setCatalogSort] = useState("priceAsc");
  const [selectedPlanId, setSelectedPlanId] = useState(() => DEFAULT_PLAN_IDS[activeProvider]);
  const [selectedBilling, setSelectedBilling] = useState("monthly");
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [livePrices, setLivePrices] = useState({});
  const [scanningCodes, setScanningCodes] = useState([]);
  const [collectorStatus, setCollectorStatus] = useState("正在读取数据库价格");
  const [backendStatus, setBackendStatus] = useState({ configured: false, database: "checking", email: "checking", scheduler: "checking" });
  const [globalSummary, setGlobalSummary] = useState(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertForm, setAlertForm] = useState({ email: "", provider: activeProvider, planId: "", country: "", thresholdPercent: 1 });
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
  const activePage = PROVIDER_PAGES[activeProvider];
  const activePlanDefinition = SUBSCRIPTION_PLANS[activeProvider].find((plan) => plan.id === selectedPlanId)
    || SUBSCRIPTION_PLANS[activeProvider][0];
  const activePlanTabs = SUBSCRIPTION_PLANS[activeProvider].flatMap((plan) => {
    const monthly = [{ planId: plan.id, billing: "monthly", label: `${activePage.product} ${plan.name}`, period: "月付" }];
    const hasAnnual = Boolean(plan.annualStoreProduct || plan.annualReferenceAmount || plan.usAnnualReferenceAmount);
    return hasAnnual ? [...monthly, { planId: plan.id, billing: "annual", label: `${activePage.product} ${plan.name}`, period: "年付" }] : monthly;
  });
  const activeRegionCodes = ISO_REGION_CODES.filter((code) => availabilityFor(activeProvider, code).kind !== "unlisted");
  const monitoredActiveRegionCount = activeRegionCodes.filter((code) => livePrices[code]?.prices?.some((price) => price.provider === activeProvider && price.status === "live")).length;
  const alertRegionCodes = ISO_REGION_CODES.filter((code) => alertForm.provider
    ? availabilityFor(alertForm.provider, code).kind !== "unlisted"
    : Object.keys(PROVIDERS).some((provider) => availabilityFor(provider, code).kind !== "unlisted"));

  const changeProviderPage = (provider) => {
    if (!PROVIDER_PAGES[provider]) return;
    setActiveProvider(provider);
    setCatalogQuery("");
    setCatalogFilter("ALL");
    setCatalogSort("priceAsc");
    setSelectedPlanId(DEFAULT_PLAN_IDS[provider]);
    setSelectedBilling("monthly");
    setCatalogExpanded(false);
    setAlertForm((current) => ({ ...current, provider, planId: "" }));
    setMenuOpen(false);
    if (window.location.pathname !== PROVIDER_PAGES[provider].path) {
      window.history.pushState({ provider }, "", PROVIDER_PAGES[provider].path);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => { ratesRef.current = rates; }, [rates]);
  useEffect(() => {
    livePricesRef.current = livePrices;
  }, [livePrices]);
  useEffect(() => {
    localAlertRulesRef.current = localAlertRules;
    writeLocalJson(LOCAL_STORAGE_KEYS.alertRules, localAlertRules);
  }, [localAlertRules]);

  useEffect(() => {
    const syncProviderFromUrl = () => {
      const provider = providerFromPath(window.location.pathname);
      setActiveProvider(provider);
      setCatalogFilter("ALL");
      setCatalogSort("priceAsc");
      setSelectedPlanId(DEFAULT_PLAN_IDS[provider]);
      setSelectedBilling("monthly");
      setAlertForm((current) => ({ ...current, provider, planId: "" }));
    };
    if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
      window.history.replaceState({ provider: activeProvider }, "", PROVIDER_PAGES[activeProvider].path + window.location.hash);
    }
    window.addEventListener("popstate", syncProviderFromUrl);
    return () => window.removeEventListener("popstate", syncProviderFromUrl);
  }, []);

  useEffect(() => {
    document.title = `${activePage.title} — AI Price Radar`;
  }, [activePage.title]);

  const fetchBackend = async () => {
    try {
      const statusResponse = await fetch("/api/backend/status", { cache: "no-store" });
      const status = await statusResponse.json();
      setBackendStatus(status);
      if (status.ready) {
        const summaryResponse = await fetch("/api/global", { cache: "no-store" });
        if (!summaryResponse.ok) throw new Error("database prices unavailable");
        const summary = await summaryResponse.json();
        setGlobalSummary(summary);
        if (Array.isArray(summary.results)) {
          const databasePrices = sanitizeCachedPrices(Object.fromEntries(summary.results.map((result) => [result.country, result])));
          livePricesRef.current = databasePrices;
          setLivePrices(databasePrices);
          setScanProgress({ running: false, completed: summary.monitoredCountries || 0, total: ISO_REGION_CODES.length });
          setCollectorStatus(`已从数据库加载 · ${summary.monitoredCountries || 0} 个地区`);
          if (summary.newestObservationAt) setLastUpdated(new Date(summary.newestObservationAt));
        }
      } else {
        setCollectorStatus("数据库尚未连接，当前仅显示内置参考数据");
      }
    } catch {
      setBackendStatus({ configured: false, database: "offline", email: "offline", scheduler: "offline" });
      setCollectorStatus("数据库读取失败，当前仅显示内置参考数据");
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
    } catch {
      setRateStatus("使用最近一次汇率快照");
    } finally {
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
        const response = await fetch(`/api/prices?countries=${batch.join(",")}&fresh=1&persist=1`, { cache: "no-store" });
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
    setCollectorStatus(`全球扫描完成并已写入数据库 · ${Object.keys(livePricesRef.current).length} 个地区已有结果`);
    await fetchBackend();
  };

  useEffect(() => {
    fetchRates();
    fetchBackend();
    const timer = window.setInterval(fetchRates, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const providerFallbackCheapest = useMemo(() =>
    backendStatus.database !== "checking" && backendStatus.database !== "connected" ? PRICE_SNAPSHOTS.filter((item) => item.provider === activeProvider).map((item) => ({
      ...item,
      usd: item.amount / (rates[REGION_META[item.region].currency] || FALLBACK_RATES[REGION_META[item.region].currency])
    })).sort((a, b) => a.usd - b.usd)[0] : null, [activeProvider, backendStatus.database, rates]);

  const getRegionPlanPrices = (code, provider) => {
    const live = livePrices[code]?.prices?.find((item) => item.provider === provider);
    if (live?.status === "live" && live.plans) return live.plans.map((plan) => {
      if (code === "US" && Number.isFinite(plan.usReferenceAmount)) return {
        ...plan,
        status: "reference",
        kind: "reference",
        display: plan.usReferenceDisplay,
        amount: plan.usReferenceAmount,
        currency: "USD",
        usd: plan.usReferenceAmount,
        source: officialUsPricingSource(provider),
        annual: Number.isFinite(plan.usAnnualReferenceAmount) ? {
          status: "reference",
          display: plan.usAnnualReferenceDisplay,
          amount: plan.usAnnualReferenceAmount,
          currency: "USD",
          usdTotal: plan.usAnnualReferenceAmount,
          usdMonthlyEquivalent: plan.usAnnualReferenceAmount / 12,
          savingPercent: Math.round((1 - plan.usAnnualReferenceAmount / 12 / plan.usReferenceAmount) * 100)
        } : { status: "none", display: "仅月付" }
      };
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

    const snapshot = backendStatus.database !== "checking" && backendStatus.database !== "connected"
      ? PRICE_SNAPSHOTS.find((item) => item.region === code && item.provider === provider)
      : null;
    const snapshotPlan = { openai: "plus", anthropic: "pro" }[provider];
    return SUBSCRIPTION_PLANS[provider].map((plan) => {
      if (code === "US" && Number.isFinite(plan.usReferenceAmount)) return {
        ...plan,
        status: "reference",
        kind: "reference",
        display: plan.usReferenceDisplay,
        amount: plan.usReferenceAmount,
        currency: "USD",
        usd: plan.usReferenceAmount,
        annual: Number.isFinite(plan.usAnnualReferenceAmount) ? {
          status: "reference",
          display: plan.usAnnualReferenceDisplay,
          amount: plan.usAnnualReferenceAmount,
          currency: "USD",
          usdTotal: plan.usAnnualReferenceAmount,
          usdMonthlyEquivalent: plan.usAnnualReferenceAmount / 12,
          savingPercent: Math.round((1 - plan.usAnnualReferenceAmount / 12 / plan.usReferenceAmount) * 100)
        } : { status: "none", display: "仅月付" },
        source: officialUsPricingSource(provider)
      };
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

  const lowestRegionPrice = (code) => availabilityFor(activeProvider, code).kind !== "unlisted"
    ? getRegionPlanPrices(code, activeProvider)
      .map((plan) => ({ provider: activeProvider, plan }))
      .filter((item) => item.plan?.status === "live" && Number.isFinite(item.plan?.usd) && item.plan.usd > 0)
      .sort((a, b) => a.plan.usd - b.plan.usd)[0]
    : null;

  const usComparisonPlans = getRegionPlanPrices("US", activeProvider);

  const browserGlobalCheapest = activeRegionCodes
    .flatMap((code) => getRegionPlanPrices(code, activeProvider).map((plan) => ({ code, provider: activeProvider, plan })))
    .filter((item) => item.plan?.status === "live" && Number.isFinite(item.plan?.usd) && item.plan.usd > 0)
    .sort((a, b) => a.plan.usd - b.plan.usd)[0];

  const storedGlobalCheapest = globalSummary?.minima?.filter((item) => item.provider === activeProvider && Number(item.usd_monthly_equivalent) > 0)
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

  const providerPlanMinimums = useMemo(() => [activeProvider].map((provider) => ({
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
      const officialAnnual = Number.isFinite(definition.usAnnualReferenceAmount) ? {
        status: "reference",
        code: "US",
        display: definition.usAnnualReferenceDisplay,
        usdTotal: definition.usAnnualReferenceAmount,
        usdMonthlyEquivalent: definition.usAnnualReferenceAmount / 12,
        savingPercent: Math.round((1 - definition.usAnnualReferenceAmount / 12 / definition.usReferenceAmount) * 100)
      } : null;
      const lowestAnnual = [databaseAnnual, officialAnnual]
        .filter((candidate) => Number.isFinite(candidate?.usdMonthlyEquivalent) && candidate.usdMonthlyEquivalent > 0)
        .sort((a, b) => a.usdMonthlyEquivalent - b.usdMonthlyEquivalent)[0]
        || databaseAnnual;
      const monthlyMinimum = [
        ...candidates.map((candidate) => ({ ...candidate, status: "live" })),
        ...(storedMonthly ? [{ code: storedMonthly.country, display: storedMonthly.display, usd: Number(storedMonthly.usd_monthly_equivalent), status: "live" }] : []),
        ...(definition.usReferenceAmount ? [{
          code: "US",
          display: definition.usReferenceDisplay,
          usd: definition.usReferenceAmount,
          status: "reference"
        }] : [])
      ].filter((candidate) => Number.isFinite(candidate.usd) && candidate.usd > 0)
        .sort((a, b) => a.usd - b.usd)[0];
      return monthlyMinimum
        ? { ...definition, ...monthlyMinimum, annualMinimum: lowestAnnual }
        : { ...definition, display: "暂无当地价", usd: null, status: "pending", annualMinimum };
    }).sort((a, b) => planSortValue(a) - planSortValue(b))
  })), [activeProvider, livePrices, rates, storedMinimums]);

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

  const allCatalogRows = useMemo(() => {
    const usSelectedPlan = usComparisonPlans.find((plan) => plan.id === selectedPlanId);
    const usComparable = selectedBilling === "annual"
      ? (Number.isFinite(usAnnualBaseline(usSelectedPlan)) ? usAnnualBaseline(usSelectedPlan) / 12 : null)
      : usMonthlyBaseline(usSelectedPlan);
    const rawRows = activeRegionCodes.map((code) => {
      const selectedPlan = getRegionPlanPrices(code, activeProvider).find((plan) => plan.id === selectedPlanId);
      const isUsOfficialReference = code === "US" && selectedPlan?.status === "reference";
      const monthlyUsd = (selectedPlan?.status === "live" || isUsOfficialReference) && Number.isFinite(selectedPlan?.usd) && selectedPlan.usd > 0
        ? selectedPlan?.usd
        : null;
      const annualUsd = (selectedPlan?.annual?.status === "live" || (isUsOfficialReference && selectedPlan?.annual?.status === "reference")) && Number.isFinite(selectedPlan.annual.usdTotal) && selectedPlan.annual.usdTotal > 0
        ? selectedPlan.annual.usdTotal
        : null;
      const comparableUsd = selectedBilling === "annual" && Number.isFinite(annualUsd)
        ? annualUsd / 12
        : selectedBilling === "monthly" ? monthlyUsd : null;
      const comparison = relativeToUs(comparableUsd, usComparable, code === "US");
      return {
        code,
        name: zhRegionNames.of(code),
        englishName: enRegionNames.of(code),
        flag: flagFromCode(code),
        selectedPlan,
        price: selectedBilling === "annual" ? selectedPlan?.annual : selectedPlan,
        priced: Number.isFinite(comparableUsd) && comparableUsd > 0,
        comparableUsd: Number.isFinite(comparableUsd) && comparableUsd > 0 ? comparableUsd : Number.POSITIVE_INFINITY,
        comparison,
        hasDiscount: comparison?.kind === "discount"
      };
    });
    const rankedCodes = rawRows.filter((item) => item.priced)
      .sort((a, b) => a.comparableUsd - b.comparableUsd)
      .map((item) => item.code);
    return rawRows.map((item) => ({ ...item, rank: item.priced ? rankedCodes.indexOf(item.code) + 1 : null }));
  }, [activeProvider, selectedPlanId, selectedBilling, livePrices, rates]);

  const catalogRows = useMemo(() => allCatalogRows.filter((item) => {
      const needle = catalogQuery.trim().toLowerCase();
      const isRegionCode = /^[a-z]{2}$/.test(needle);
      const matchesQuery = !needle || (isRegionCode
        ? item.code.toLowerCase() === needle
        : `${item.code} ${item.name} ${item.englishName}`.toLowerCase().includes(needle));
      const matchesFilter = catalogFilter === "ALL"
        || (catalogFilter === "PRICED" && item.priced)
        || (catalogFilter === "DEALS" && item.hasDiscount);
      return matchesQuery && matchesFilter;
    }).sort((a, b) => {
      if (catalogSort === "priceAsc") return a.comparableUsd - b.comparableUsd || a.name.localeCompare(b.name, "zh-CN");
      return a.name.localeCompare(b.name, "zh-CN");
    }), [allCatalogRows, catalogQuery, catalogFilter, catalogSort]);

  const pricedCatalogRows = allCatalogRows.filter((item) => item.priced).sort((a, b) => a.comparableUsd - b.comparableUsd);
  const catalogMinimum = pricedCatalogRows[0];
  const catalogMaximum = pricedCatalogRows.at(-1);
  const catalogSaving = catalogMinimum && catalogMaximum && catalogMaximum.comparableUsd > 0
    ? Math.round((1 - catalogMinimum.comparableUsd / catalogMaximum.comparableUsd) * 100)
    : null;
  const distributionRows = pricedCatalogRows.slice(0, 8);
  const distributionMaximum = distributionRows.at(-1)?.comparableUsd;

  const visibleCatalogRows = catalogExpanded || catalogQuery || catalogFilter !== "ALL"
    ? catalogRows
    : catalogRows.slice(0, 50);

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
      <SideNav open={menuOpen} onClose={() => setMenuOpen(false)} onAlerts={() => setAlertOpen(true)} scanProgress={scanProgress} activeProvider={activeProvider} onProviderChange={changeProviderPage} />
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
              <div className="provider-page-switcher" aria-label="选择厂商">
                {Object.entries(PROVIDER_PAGES).map(([provider, page]) => <button key={provider} className={activeProvider === provider ? "active" : ""} aria-pressed={activeProvider === provider} onClick={() => changeProviderPage(provider)}><ProviderMark id={provider} size="tiny" />{page.product}</button>)}
              </div>
              <div className="eyebrow"><span /> GLOBAL SUBSCRIPTION INTELLIGENCE</div>
              <h1>{activePage.title}</h1>
              <p>{activePage.description}</p>
            </div>
            <button className="refresh-button" onClick={() => { fetchRates(); scanRegions(ISO_REGION_CODES); }} disabled={refreshing || scanProgress.running}>
              <RefreshCw className={refreshing || scanProgress.running ? "spin" : ""} size={17} />
              {scanProgress.running ? `扫描 ${scanProgress.completed}/${scanProgress.total}` : refreshing ? "同步中…" : "扫描全球"}
            </button>
          </section>

          <section className="stats-grid">
            <StatCard label="当前厂商" value={activePage.product} note={PROVIDERS[activeProvider].name} icon={SlidersHorizontal} accent={PROVIDERS[activeProvider].color}>
              <div className="provider-stack">
                <ProviderMark id={activeProvider} size="small" />
              </div>
            </StatCard>
            <StatCard label="可用国家与地区" value={activeRegionCodes.length} note={`${monitoredActiveRegionCount} 个地区已有 ${activePage.product} 价格`} icon={Globe2} accent="#7aa7ff">
              <div className="flag-row">🌍 <span>仅显示官方支持地区</span></div>
            </StatCard>
            <StatCard
              label="当前最低可比价"
              value={globalCheapest ? usd(globalCheapest.plan.usd) : providerFallbackCheapest ? usd(providerFallbackCheapest.usd) : "等待价格"}
              note={globalCheapest ? `${flagFromCode(globalCheapest.code)} ${zhRegionNames.of(globalCheapest.code)} · ${PROVIDERS[globalCheapest.provider].name} ${globalCheapest.plan.name}` : providerFallbackCheapest ? `${REGION_META[providerFallbackCheapest.region].flag} ${REGION_META[providerFallbackCheapest.region].name}` : "正在采集当前厂商价格"}
              icon={ArrowDownRight}
              accent="#ffd56a"
            >
              <span className="saving-pill">汇率口径</span>
            </StatCard>
            <StatCard label="每日数据库扫描" value={scanProgress.running ? `${scanProgress.completed}/${scanProgress.total}` : "每日 00:00"} note={scanProgress.running ? "手动扫描全球并同步写入数据库" : "北京时间每天 00:00 启动；打开页面只读取数据库"} icon={ShieldCheck} accent="#bd8cff">
              <div className="timestamp">{lastUpdated ? `数据库最近更新 ${lastUpdated.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "正在读取数据库快照"}</div>
            </StatCard>
          </section>

          <section className="panel coverage-panel">
            <div className="panel-heading">
              <div><h2>{activePage.product} 月付 / 年付最低价</h2><p>比较官网公开价与当前已监测的 {monitoredActiveRegionCount} / {activeRegionCodes.length} 个支持地区的当地公开价；年付按总价和折合月价同时展示。</p></div>
              <span className="coverage-verified"><ShieldCheck size={14} />实时汇率折算</span>
            </div>
            <div className="coverage-grid single-provider">
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

          <section className="panel catalog-panel compact-catalog" id="catalog">
            <div className="panel-heading catalog-heading">
              <div><h2>{activePage.product} {activePlanDefinition.name} 全球价格</h2><p>选择套餐与付款周期，直接比较各地区当地原价、美元折算价和相对美国价格。</p></div>
              <span className="catalog-total"><i />{collectorStatus}</span>
            </div>
            <div className={`plan-tab-strip ${activeProvider}`} role="tablist" aria-label="选择订阅套餐">
              {activePlanTabs.map((option) => {
                const active = selectedPlanId === option.planId && selectedBilling === option.billing;
                return <button key={`${option.planId}:${option.billing}`} type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={() => { setSelectedPlanId(option.planId); setSelectedBilling(option.billing); setCatalogSort("priceAsc"); setCatalogExpanded(false); }}>
                  <span>{option.label}</span><small>{option.period}</small>
                </button>;
              })}
            </div>
            <div className="catalog-toolbar">
              <label className="catalog-search"><Search size={16} /><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="搜索中文名、英文名或代码…" />{catalogQuery && <button onClick={() => setCatalogQuery("")} aria-label="清除搜索"><X size={15} /></button>}</label>
              <label className="select-control catalog-select"><Filter size={15} /><select value={catalogFilter} onChange={(event) => setCatalogFilter(event.target.value)}><option value="ALL">全部 {activeRegionCodes.length} 项</option><option value="DEALS">低于美国的优惠地区</option><option value="PRICED">{activePlanDefinition.name} 已有价格</option></select><ChevronDown size={14} /></label>
              <label className="select-control catalog-select sort-select"><ArrowDownRight size={15} /><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value)}><option value="priceAsc">{activePlanDefinition.name} {selectedBilling === "annual" ? "年付" : "月付"}：从低到高</option><option value="name">按国家 / 地区</option></select><ChevronDown size={14} /></label>
            </div>
            <div className="catalog-comparison-layout">
              <div className="table-scroll catalog-scroll">
                <table className={`catalog-table simple-price-table ${activeProvider}`}>
                  <thead><tr><th>排名</th><th><span className="region-column-head">国家 / 地区</span></th><th>当地原价</th><th>美元折算</th><th>相对美国</th><th>状态</th></tr></thead>
                  <tbody>
                    {visibleCatalogRows.map((item) => {
                      const scanning = scanningCodes.includes(item.code);
                      return (
                        <tr className={`${item.rank === 1 ? "best-price-row" : ""} ${item.hasDiscount ? "deal-region" : ""}`} key={item.code}>
                          <td><span className="price-rank">{item.rank || "—"}</span></td>
                          <td><div className="region-cell"><span>{item.flag}</span><div><strong>{item.name}</strong><small>{item.englishName} · {item.code}</small></div></div></td>
                          <td><div className="local-price-stack"><strong>{item.price?.display || (scanning ? "采集中…" : "暂未取得")}</strong>{selectedBilling === "annual" && item.priced && <small>年付总价</small>}</div></td>
                          <td><div className="converted-price"><strong>{item.priced ? usd(item.comparableUsd) : "—"}</strong><small>/ 月</small></div></td>
                          <td>{item.comparison ? <span className={`us-price-badge ${item.comparison.kind}`}>{item.comparison.label}</span> : <span className="comparison-empty">—</span>}</td>
                          <td>{item.priced ? <div className="price-row-actions"><span className={item.rank === 1 ? "price-status lowest" : "price-status verified"}>{item.rank === 1 ? "最低" : "已核价"}</span>{item.selectedPlan?.status === "live" && <button className="history-button compact" onClick={() => openHistory({ country: item.code, provider: activeProvider, plan: item.selectedPlan })}><History size={11} />历史</button>}</div> : <span className="monitor-loading queued"><RefreshCw className={scanning ? "spin" : ""} size={12} />{scanning ? "采集中" : "待核价"}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!visibleCatalogRows.length && <div className="empty-state">没有找到相符的国家或地区。</div>}
              </div>
              <aside className="price-insight-column">
                <div className="minimum-summary-card">
                  <span>最低价格</span>
                  <strong>{catalogMinimum ? usd(catalogMinimum.comparableUsd) : "暂无"}</strong>
                  <small className="price-period-label">{selectedBilling === "annual" ? "年付折合每月" : "每月"}</small>
                  {catalogMinimum && <div className="minimum-region"><span>{catalogMinimum.flag}</span>{catalogMinimum.name}</div>}
                  {Number.isFinite(catalogSaving) && <small className="saving-comparison"><ArrowDownRight size={14} />比最高价省 {catalogSaving}%</small>}
                </div>
                <div className="distribution-card">
                  <div className="distribution-heading"><strong>价格分布</strong><span>最低 8 个地区</span></div>
                  <div className="distribution-list">
                    {distributionRows.map((item, index) => <div className="distribution-row" key={item.code}>
                      <span>{item.code}</span><i><b className={index === 0 ? "minimum" : ""} style={{ width: `${Math.max(12, item.comparableUsd / (distributionMaximum || item.comparableUsd) * 100)}%` }} /></i><em>{usd(item.comparableUsd)}</em>
                    </div>)}
                  </div>
                </div>
              </aside>
            </div>
            <footer className="catalog-footer">
              <span><Info size={14} />当前展示 {activePlanDefinition.name} {selectedBilling === "annual" ? "年付" : "月付"}；年付统一按折合月价排序，相对美国价格使用同档官方价。</span>
              {!catalogExpanded && !catalogQuery && catalogFilter === "ALL" ? <button onClick={() => setCatalogExpanded(true)}>显示全部 {activeRegionCodes.length} 项 <ChevronDown size={14} /></button> : <span>当前显示 {visibleCatalogRows.length} 项</span>}
            </footer>
          </section>

          <section className="compliance-banner" id="tools">
            <div className="compliance-icon"><ShieldCheck size={23} /></div>
            <div><h3>合规注册助手</h3><p>生成不可投递的测试邮箱别名，并从官方入口注册。请使用真实所在地与有效邮箱完成购买。</p></div>
            <button onClick={() => { setModalOpen(true); if (!emailAlias) generateAlias(); }}>打开工具 <ArrowUpRight size={16} /></button>
          </section>

          <footer className="site-footer">
            <span>AI Price Radar · 数据仅供比较，不构成购买建议</span>
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
              <a href={PROVIDERS[activeProvider].signup} target="_blank" rel="noreferrer"><ProviderMark id={activeProvider} size="tiny" />{PROVIDERS[activeProvider].name} 官方入口<ExternalLink size={14} /></a>
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
            <p>{backendStatus.ready ? "价格下降达到你设置的幅度时发送邮件。首次订阅需要点击邮件确认。" : "提醒规则保存在当前浏览器。手动点击扫描全球后，如发现降价会发送浏览器通知。"}</p>
            <div className="form-grid">
              {backendStatus.ready && <label className="wide">邮箱<input required type="email" value={alertForm.email} onChange={(event) => setAlertForm({ ...alertForm, email: event.target.value })} placeholder="name@example.com" /></label>}
              <label>厂商<select value={alertForm.provider} onChange={(event) => { const provider = event.target.value; setAlertForm({ ...alertForm, provider, planId: "", country: !provider || !alertForm.country || availabilityFor(provider, alertForm.country).kind !== "unlisted" ? alertForm.country : "" }); }}><option value="">全部厂商</option>{Object.entries(PROVIDERS).map(([id, provider]) => <option key={id} value={id}>{provider.name}</option>)}</select></label>
              <label>套餐<select value={alertForm.planId} onChange={(event) => setAlertForm({ ...alertForm, planId: event.target.value })}><option value="">全部套餐</option>{(alertForm.provider ? SUBSCRIPTION_PLANS[alertForm.provider] : Object.values(SUBSCRIPTION_PLANS).flat()).filter((plan, index, list) => list.findIndex((item) => item.id === plan.id && item.name === plan.name) === index).map((plan) => <option key={`${plan.id}-${plan.name}`} value={plan.id}>{plan.name}</option>)}</select></label>
              <label>地区<select value={alertForm.country} onChange={(event) => setAlertForm({ ...alertForm, country: event.target.value })}><option value="">全球任意可用地区</option>{alertRegionCodes.map((code) => <option key={code} value={code}>{flagFromCode(code)} {zhRegionNames.of(code)} · {code}</option>)}</select></label>
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
