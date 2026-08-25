export const PROVIDERS = {
  openai: {
    name: "OpenAI",
    product: "ChatGPT Plus",
    mark: "O",
    color: "#27e0ad",
    source: "https://openai.com/chatgpt/pricing/",
    signup: "https://chatgpt.com/"
  },
  anthropic: {
    name: "Anthropic",
    product: "Claude Pro",
    mark: "A",
    color: "#e99062",
    source: "https://www.anthropic.com/pricing",
    signup: "https://claude.ai/"
  }
};

export const ANTHROPIC_US_PRICING_SOURCE = "https://support.claude.com/en/articles/11049762-choose-a-claude-plan";
export const OPENAI_US_PRICING_SOURCE = "https://chatgpt.com/pricing";

export const COVERAGE_SUMMARY = {
  openai: {
    label: "官方支持清单",
    detail: "Web 与移动端支持国家/地区",
    note: "价格表仅展示已核价市场",
    source: "https://help.openai.com/en/articles/7947663-chatgpt-supported-countries"
  },
  anthropic: {
    label: "官方支持清单",
    detail: "Claude 可访问国家/地区",
    note: "Pro 方案以当地结账页为准",
    source: "https://support.claude.com/en/articles/8461763-where-can-i-access-claude"
  }
};

export const SUBSCRIPTION_PLANS = {
  openai: [
    { id: "go", name: "Go", billing: "个人套餐", storeProduct: "ChatGPT Go", annualKind: "none", usReferenceAmount: 8, usReferenceDisplay: "US$8 / 月 · 官网" },
    { id: "plus", name: "Plus", billing: "个人套餐", storeProduct: "ChatGPT Plus", annualStoreProduct: "ChatGPT Plus", annualStoreProductOccurrence: 1, usReferenceAmount: 20, usReferenceDisplay: "US$20 / 月 · 官网" },
    { id: "pro5", name: "Pro 5x", billing: "个人套餐", storeProduct: "ChatGPT Pro 5x", annualKind: "none", usReferenceAmount: 100, usReferenceDisplay: "US$100 / 月 · 官网" },
    { id: "pro20", name: "Pro 20x", billing: "个人套餐", storeProduct: "ChatGPT Pro 20x", annualKind: "none", usReferenceAmount: 200, usReferenceDisplay: "US$200 / 月 · 官网" }
  ],
  anthropic: [
    { id: "pro", name: "Pro", billing: "个人套餐", storeProduct: "Claude Pro - Monthly", annualStoreProduct: "Claude Pro - Annual", usReferenceAmount: 20, usReferenceDisplay: "US$20 / 月 · 官网", usAnnualReferenceAmount: 200, usAnnualReferenceDisplay: "US$200 / 年 · 官网" },
    { id: "max5", name: "Max 5x", billing: "个人套餐", storeProduct: "Claude Max 5x - Monthly", annualKind: "none", usReferenceAmount: 100, usReferenceDisplay: "US$100 / 月 · 官网" },
    { id: "max20", name: "Max 20x", billing: "个人套餐", storeProduct: "Claude Max 20x - Monthly", annualKind: "none", usReferenceAmount: 200, usReferenceDisplay: "US$200 / 月 · 官网" },
    { id: "team", name: "Team", billing: "每席位 · 至少 5 席", kind: "reference", referenceAmount: 30, referenceDisplay: "US$30 / 月", annualReferenceAmount: 300, annualReferenceDisplay: "US$300 / 年" }
  ]
};

// ISO 3166-1 alpha-2 complete directory. Availability is maintained separately
// from price observations so every country/territory stays discoverable even
// when a trustworthy local checkout price is not yet available.
export const ISO_REGION_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");

export const OFFICIAL_SUPPORT = {
  openai: new Set(`AL DZ AF AX AD AO AG AR AM AW AU AT AZ BS BH BD BB BE BZ BM BJ BT BO BA BW BR BN BG BF BI CV KH CM CA KY CF TD CL CO KM CG CD CR CI HR CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FO FJ FI FR GF PF TF GA GM GE DE GH GR GD GL GT GP GN GW GY HT VA HN HU IS IN ID IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MA MZ MM NA NR NP NL NC NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RE RO RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SR SE CH SD SJ TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VN WF YE ZM ZW`.split(" ")),
  anthropic: new Set(`AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV TD CL CO KM CG CR HR CZ DK DJ DM DO TL EC EG SV GQ EE SZ FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IQ IE IL IT CI JM JP JO KZ KE KI KW KG LA LV LB LS LR LI LT LU MG MW MY MV MT MP MH MR MU MX FM MD MC MN ME MA MZ NA NR NP NL NZ NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA CY RO RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB ZA KR ES LK SR SE CH TW TJ TZ TH TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VN ZM ZW`.split(" "))
};

export const AVAILABILITY_EXCEPTIONS = {};

export const REGION_META = {
  US: { name: "美国", flag: "🇺🇸", currency: "USD", sourceType: "官方公开" },
  GB: { name: "英国", flag: "🇬🇧", currency: "GBP", sourceType: "官方/结账页" },
  DE: { name: "德国", flag: "🇩🇪", currency: "EUR", sourceType: "含税观察" },
  JP: { name: "日本", flag: "🇯🇵", currency: "JPY", sourceType: "本地结账页" },
  IN: { name: "印度", flag: "🇮🇳", currency: "INR", sourceType: "本地结账页" },
  BR: { name: "巴西", flag: "🇧🇷", currency: "BRL", sourceType: "本地结账页" },
  SG: { name: "新加坡", flag: "🇸🇬", currency: "SGD", sourceType: "本地结账页" },
  AU: { name: "澳大利亚", flag: "🇦🇺", currency: "AUD", sourceType: "本地结账页" }
};

// Local checkout observations are deliberately isolated here so a server-side
// collector can replace them without changing the UI.
export const PRICE_SNAPSHOTS = [
  { provider: "openai", region: "US", amount: 20, confidence: "high", trend: -0.2 },
  { provider: "openai", region: "GB", amount: 20, confidence: "medium", trend: 0.4 },
  { provider: "openai", region: "DE", amount: 23, confidence: "medium", trend: 0.1 },
  { provider: "openai", region: "JP", amount: 3000, confidence: "medium", trend: -1.1 },
  { provider: "openai", region: "IN", amount: 1999, confidence: "medium", trend: 0.7 },
  { provider: "openai", region: "BR", amount: 99.9, confidence: "medium", trend: -2.3 },
  { provider: "openai", region: "SG", amount: 27.99, confidence: "medium", trend: -0.5 },
  { provider: "openai", region: "AU", amount: 32.99, confidence: "medium", trend: 0.2 },
  { provider: "anthropic", region: "US", amount: 20, confidence: "high", trend: -0.2 },
  { provider: "anthropic", region: "GB", amount: 18, confidence: "high", trend: 0.4 },
  { provider: "anthropic", region: "DE", amount: 22, confidence: "medium", trend: 0.1 },
  { provider: "anthropic", region: "JP", amount: 2940, confidence: "medium", trend: -1.0 },
  { provider: "anthropic", region: "IN", amount: 1999, confidence: "medium", trend: 0.7 },
  { provider: "anthropic", region: "BR", amount: 109.9, confidence: "medium", trend: -2.1 },
  { provider: "anthropic", region: "SG", amount: 29, confidence: "medium", trend: -0.4 },
  { provider: "anthropic", region: "AU", amount: 35, confidence: "medium", trend: 0.3 }
];

export const FALLBACK_RATES = {
  USD: 1,
  CNY: 6.7227,
  GBP: 0.74407,
  EUR: 0.868722,
  JPY: 157.167068,
  INR: 95.401315,
  BRL: 5.071137,
  SGD: 1.282601,
  AUD: 1.428829,
  PKR: 277.732404,
  PHP: 60.928773,
  NGN: 1364.773637
};
