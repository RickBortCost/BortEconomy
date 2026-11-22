// Filtro di pertinenza per le notizie generali: tiene solo economia, finanza e mercati.
//
// Punteggio sul titolo (e sulla fonte):
//   +3  fonte specializzata in economia/finanza
//   +2  termine forte (borsa, indici, banche centrali, inflazione, utili, spread, …)
//   +1  termine debole (aziende, miliardi, investimenti, prezzi, …)
//   −4  termine estraneo (sport, offerte commerciali, meteo, cronaca, ricette, gossip, prove auto, …)
// Una notizia passa con punteggio ≥ 2. Le notizie per singola società non passano da qui.

const FIN_SOURCES = [
  // Italia
  "il sole 24 ore", "milano finanza", "mf ", "borsa italiana", "investing.com", "teleborsa", "soldionline", "money.it", "finanzaonline",
  "wall street italia", "borsaitaliana", "trend-online", "affaritaliani economia", "l'economia", "economy", "bebeez", "finanza report", "qui finanza", "quifinanza", "websim", "market insight",
  // Internazionali
  "bloomberg", "reuters", "cnbc", "marketwatch", "financial times", "wall street journal", "wsj", "barron", "yahoo finance", "seeking alpha", "morningstar",
  "business insider", "the economist", "fortune", "forbes", "kiplinger", "investopedia", "thestreet", "benzinga", "zacks", "motley fool", "fxstreet", "kitco", "coindesk",
  "financial post", "globe and mail", "australian financial review", "afr.com", "economic times", "livemint", "mint", "moneycontrol", "business standard", "financial express",
  "nikkei", "caixin", "scmp business", "city a.m.", "this is money",
  // Germania / Svizzera
  "handelsblatt", "finanzen.net", "börse online", "boerse.de", "stock3", "wirtschaftswoche", "manager magazin", "capital", "der aktionär", "deraktionaer", "onvista", "finanzen.ch", "cash.ch", "fuw", "finanz und wirtschaft", "börsen-zeitung", "ariva", "4investors",
  // Francia / Spagna / Portogallo-Brasile
  "les echos", "boursorama", "zonebourse", "bfm bourse", "bfm business", "la tribune", "investir", "capital.fr", "l'agefi", "agefi",
  "expansión", "expansion", "cinco días", "cinco dias", "el economista", "eleconomista", "bolsamania", "invertia",
  "valor econômico", "valor economico", "infomoney", "exame", "money times", "estadão economia",
  // Asia
  "日本経済新聞", "日経", "東洋経済", "ダイヤモンド", "ブルームバーグ", "ロイター", "財経", "财经", "新浪财经", "东方财富", "证券时报", "第一财经", "21世纪经济报道",
  "한국경제", "매일경제", "머니투데이", "이데일리", "서울경제", "연합인포맥스",
];

// Termini per lingua: [forti, deboli, estranei]
// Parole intere (o, per le lingue con parole composte, solo con confine iniziale), compatibili con lettere accentate.
const W = (src, whole) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})${whole ? "(?![\\p{L}\\p{N}])" : ""}`, "iu");
const CJK = (src) => new RegExp(src, "u");
const T = {
  it: [
    W(String.raw`in borsa|borsa (di milano|italiana|di francoforte|di new york|di londra|di tokyo)|borse|piazza affari|ftse|mib|nasdaq|dow jones|s&p|wall street|spread|btp|bund|bce|fed|banca centrale|banche centrali|tassi|tasso|inflazione|deflazione|pil|recessione|crescita economica|azionari[oa]?|titoli azionari|obbligazion\w*|bond|rendiment\w*|dividend\w*|utili|trimestral\w*|semestral\w*|bilanci?o|fatturato|ricavi|ipo|opa|ops|fusion[ei]|acquisizion[ei]|quotazion\w*|listino|mercat[oi] finanziar\w*|mercati|petrolio|brent|gas naturale|cambio|euro\/dollaro|dollaro|criptovalut\w*|bitcoin|istat|disoccupazione|occupazione|export|import|dazi|debito pubblico|manovra|legge di bilancio|fisco|tasse|imposte|mutui|prestiti|credito|banca|banche|bancari\w*|assicurazion\w*|investiment\w*|investitori|risparmio|risparmiatori|prezzi|consumi|industria|industriale|produzione|confindustria|bankitalia|consob|sec|antitrust|bollette|energia|rating|moody|fitch|standard & poor|economia|economic\w*|finanz\w*|pensioni|salari|stipendi`, true),
    W(String.raw`borsa|azioni|titoli|aziend\w*|impres\w*|conti|banco|filial\w*|miliard\w*|milion\w*|ceo|amministratore delegato|crisi|prezzo|costi|mercato|vendite|ordini|stabiliment\w*|lavoratori|sindacat\w*|startup|manager|gruppo|holding|governo|ministro dell'economia|giorgetti`, true),
    W(String.raw`black friday|(acquista|vende) azioni per|mercati di previsione|borsa di studio|borsa schermata|azioni violente|moda|shopping|furt[oi]|arrest\w*|offert[ae] (amazon|del giorno|imperdibil\w*)|sconti?|codice sconto|coupon|calcio|serie a|champions|juventus|inter|milan|napoli|tennis|sinner|formula 1|f1|motogp|meteo|previsioni del tempo|ricett\w*|oroscopo|gossip|vip|reality|grande fratello|sanremo|film|serie tv|netflix|tronista|incidente|omicidio|arrestat\w*|carabinieri|polizia|prova su strada|restyling|test drive|recensione|in prova|anni alla guida|tutorial|come fare|trucchi|smartphone in offerta|matrimonio|bambini|scuola|mensa|chiesa|papa`, true),
  ],
  en: [
    W(String.raw`stocks?|shares|equit(y|ies)|market(s)?|wall street|nasdaq|dow|s&p|ftse|nikkei|sensex|nifty|asx|tsx|bonds?|treasur(y|ies)|yields?|fed|federal reserve|ecb|bank of england|boj|rba|rbi|central banks?|interest rates?|rate (cut|hike)s?|inflation|cpi|gdp|recession|economy|economic|earnings|revenue|profit|guidance|dividends?|ipo|merger|acquisition|takeover|buyback|valuation|investors?|investing|fund|etf|hedge fund|oil|crude|brent|gold price|commodit(y|ies)|currency|dollar|euro|yen|forex|bitcoin|crypto|tariffs?|trade deal|trade war|deficit|debt|budget|tax(es)?|jobs report|payrolls|unemployment|labor market|consumer spending|retail sales|housing market|mortgage rates?|bank(s|ing)?|lender|credit|rating|moody's|fitch|sec|antitrust|bull market|bear market|sell-?off|rally|correction|volatility|financial|finance`, true),
    W(String.raw`compan(y|ies)|billion|million|ceo|cfo|firm|business|industry|prices?|costs?|sales|layoffs?|jobs|startup|deal|wages|salary|spending|consumers?`, true),
    W(String.raw`black friday deals|(sells|buys|acquires) \$[\d.,]+[mk]? (in|of|worth of) (stock|shares)|stock price, news|quote & history|deals? (on|live)|best deals|on sale|discount code|coupon|nfl|nba|mlb|nhl|soccer|football|super bowl|touchdown|playoffs?|weather|forecast storm|recipe|horoscope|celebrity|kardashian|movie|tv show|netflix series|crash kills|shooting|murder|arrested|police say|lanes (open|closed)|traffic|how to (clean|sanitize|cook)|diner|wedding|review: `, true),
  ],
  de: [
    W(String.raw`börse|aktie|aktien|dax|mdax|tecdax|dow jones|nasdaq|s&p|wall street|anleihe|rendite|zinsen|zins|ezb|us-notenbank|notenbank|leitzins|inflation|konjunktur|wirtschaft|bip|rezession|quartalszahlen|bilanz|umsatz|gewinn|dividende|börsengang|übernahme|fusion|anleger|investor|fonds|etf|ölpreis|goldpreis|rohstoff|devisen|dollar|bitcoin|krypto|zölle|haushalt|schulden|steuer|arbeitsmarkt|arbeitslos|ifo|bank|banken|kredit|rating|finanz|kurs|kurse|börsentermine`, false),
    W(String.raw`unternehmen|konzern|milliard|million|chef|ceo|preise|kosten|stellenabbau|jobs|industrie|mittelstand|insolvenz|pleite`, false),
    W(String.raw`black friday|(verkauft|erwirbt|veräußert) aktien (für|im wert)|kochstories|rabatt|reduziert|versand gratis|gutschein|schnäppchen|angebot(e)? (bei|von|ab)|deals|tarif mit|sonderregal|bundesliga|fußball|bvb|formel 1|wetter|rezept|horoskop|promi|unfall|polizei|festgenommen|gezerrt|weihnachtsmarkt|glühwein|e-bike für|lebensmittelwarnung|rückruf`, false),
  ],
  fr: [
    W(String.raw`bourse|action|actions|cac 40|marchés?|wall street|nasdaq|obligation|taux|bce|fed|banque centrale|inflation|croissance|pib|récession|résultats|chiffre d'affaires|bénéfice|dividende|introduction en bourse|fusion|acquisition|rachat|investisseurs?|fonds|etf|pétrole|cours de l'or|devises|euro(?!p)|dollar|bitcoin|crypto|droits de douane|budget|dette|impôts?|fiscal|chômage|emploi|banques?|crédit|notation|économie|économique|financ`, false),
    W(String.raw`entreprises?|groupe|milliards?|millions?|pdg|prix|coûts|ventes|industrie|usine|licenciements`, false),
    W(String.raw`black friday|promo|soldes|bon plan|football|ligue 1|psg|rugby|tennis|météo|recette|horoscope|people|faits divers|accident|meurtre|interpellé`, false),
  ],
  es: [
    W(String.raw`bolsa|acciones|ibex|mercados?|wall street|nasdaq|bonos?|prima de riesgo|tipos de interés|bce|fed|banco central|inflación|ipc|pib|recesión|economía|económic|resultados|beneficio|facturación|ingresos|dividendo|opa|salida a bolsa|fusión|adquisición|inversores?|fondos?|etf|petróleo|brent|oro|divisas|euro(?!p)|dólar|bitcoin|cripto|aranceles|presupuestos?|deuda|impuestos?|hacienda|paro|empleo|banca|bancos?|crédito|hipotecas?|financ`, false),
    W(String.raw`empresas?|compañía|millones|miles de millones|consejero delegado|precios?|costes|ventas|industria|despidos`, false),
    W(String.raw`black friday|ofertas|chollos?|descuentos?|fútbol|liga|real madrid|barça|tenis|tiempo|lluvias|receta|horóscopo|famosos|sucesos|accidente|detenido`, false),
  ],
  pt: [
    W(String.raw`bolsa|ações|ibovespa|mercados?|wall street|juros|selic|copom|banco central|fed|inflação|ipca|pib|recessão|economia|econômic|resultados?|lucro|receita|balanço|dividendos?|ipo|fusão|aquisição|investidores?|fundos?|petróleo|dólar|câmbio|bitcoin|cripto|tarifas|orçamento|dívida|impostos?|fiscal|desemprego|emprego|bancos?|crédito|financ`, false),
    W(String.raw`empresas?|companhia|bilhões|milhões|presidente-executivo|ceo|preços?|custos|vendas|indústria|demissões`, false),
    W(String.raw`black friday|ofertas|promoção|cupom|futebol|brasileirão|flamengo|corinthians|palmeiras|novela|bbb|receita de|horóscopo|famosos|acidente|polícia|preso`, false),
  ],
  ja: [CJK(String.raw`株|日経平均|東証|市場|相場|円安|円高|為替|金利|日銀|利上げ|利下げ|物価|インフレ|GDP|景気|決算|増益|減益|配当|上場|買収|合併|投資家|債券|国債|原油|金価格|経済|財政|税|雇用|賃金|銀行`), CJK(String.raw`企業|億円|兆円|社長|価格|業績|売上`), CJK(String.raw`プロ野球|サッカー|大谷|天気|レシピ|占い|芸能|事件|逮捕|株価・株式情報|指数情報・推移|住み続けたい`)],
  zh: [CJK(String.raw`股市|股票|A股|港股|美股|上证|深证|沪深|指数|市场|汇率|人民币|利率|央行|降息|加息|通胀|CPI|GDP|经济|财报|营收|利润|分红|上市|IPO|并购|收购|投资者|基金|债券|国债|原油|黄金|关税|财政|税|就业|银行|金融|证券`), CJK(String.raw`企业|公司|亿元|万亿|董事长|价格|销售`), CJK(String.raw`足球|篮球|天气|食谱|星座|明星|娱乐|事故|逮捕`)],
  ko: [CJK(String.raw`증시|주식|코스피|코스닥|주가|시장|환율|원화|금리|한국은행|한은|기준금리|인플레이션|물가|GDP|성장률|경제|실적|영업이익|매출|순이익|배당|상장|IPO|인수|합병|투자자|펀드|채권|국채|유가|금값|관세|재정|세금|고용|은행|금융|증권`), CJK(String.raw`기업|억원|조원|대표|가격|판매`), CJK(String.raw`축구|야구|날씨|레시피|운세|연예|아이돌|사고|체포`)],
};
T.nl = T.en; // fallback

const isFinSource = (s) => { const x = ` ${String(s).toLowerCase()} `; return FIN_SOURCES.some((f) => x.includes(f)); };

export function financeScore(item) {
  const [strong, weak, off] = T[item.lang] ?? T.en;
  const t = item.title;
  let s = 0;
  if (isFinSource(item.source)) s += 3;
  const strongHits = new Set((t.match(new RegExp(strong.source, `${strong.flags}g`)) ?? []).map((m) => m.toLowerCase())).size;
  s += Math.min(strongHits, 2) * 2;
  const weakHits = new Set((t.match(new RegExp(weak.source, `${weak.flags}g`)) ?? []).map((m) => m.toLowerCase())).size;
  s += Math.min(weakHits, 2);
  if (off.test(t)) s -= 4;
  return s;
}
export const isFinance = (item) => financeScore(item) >= 2;
