import { Market, EventGroup, Token, MatchInfo } from './types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// ── Polymarket API response types ──────────────────────────────────────────

export interface PMTag {
  id: string;
  label: string;
  slug: string;
}

export interface PMMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  resolutionSource: string;
  endDate: string;
  startDate: string;
  image: string;
  icon: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  active: boolean;
  closed: boolean;
  clobTokenIds: string[];
  groupItemTitle: string;
  liquidity: string;
  orderPriceMinTickSize: number;
  orderMinSize: number;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  spread: number;
  questionID?: string;
  acceptingOrders?: boolean;
  acceptedOrdersTimestamp?: string;
  groupItemThreshold?: number;
}

export interface PMEvent {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  startDate: string;
  creationDate: string;
  endDate: string;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  liquidity: number;
  volume: number;
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  commentCount: number;
  negRisk: boolean;
  competitive: number;
  markets: PMMarket[];
  tags: PMTag[];
  createdAt: string;
  updatedAt: string;
  seriesSlug?: string;
}

// ── Simple in-memory cache ─────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30s

function getCached<T>(key: string, ttl: number = CACHE_TTL): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Category mapper ────────────────────────────────────────────────────────

/** Use the first tag label directly from Polymarket to stay in sync */
function pickCategory(tags: PMTag[]): string {
  if (!tags?.length) return 'General';
  return tags[0].label;
}

// ── Mappers ────────────────────────────────────────────────────────────────

/** Parse a field that may be a JSON string or already an array */
function parseArr(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

/** Check if a sub-market is a placeholder (no price data, never traded) */
function isPlaceholder(pm: PMMarket): boolean {
  const prices = parseArr(pm.outcomePrices);
  return prices.length === 0;
}

/** Detect if a market is resolved by checking if closed + prices are 0/1 */
function detectResolved(pm: PMMarket): { resolved: boolean; winningOutcome: string | null } {
  if (!pm.closed) return { resolved: false, winningOutcome: null };
  const prices = parseArr(pm.outcomePrices);
  const outcomes = parseArr(pm.outcomes);
  // A resolved market has prices at exactly 0 or 1
  const allSettled = prices.length > 0 && prices.every(p => {
    const v = parseFloat(p);
    return v === 0 || v === 1;
  });
  if (!allSettled) return { resolved: pm.closed, winningOutcome: null };
  const winnerIdx = prices.findIndex(p => parseFloat(p) === 1);
  const winningOutcome = winnerIdx >= 0 ? (outcomes[winnerIdx] || null) : null;
  return { resolved: true, winningOutcome };
}

/** Detect resolved state for multi-outcome events */
function detectEventResolved(event: PMEvent): { resolved: boolean; winningOutcome: string | null } {
  if (!event.closed) return { resolved: false, winningOutcome: null };
  // Check if all sub-markets are resolved
  const allClosed = event.markets.every(m => m.closed);
  if (!allClosed) return { resolved: false, winningOutcome: null };
  // Find the winning sub-market (the one with Yes price = 1)
  for (const m of event.markets) {
    const prices = parseArr(m.outcomePrices);
    if (parseFloat(prices[0] || '0') === 1) {
      return { resolved: true, winningOutcome: m.groupItemTitle || m.question };
    }
  }
  return { resolved: true, winningOutcome: null };
}

function mapTokens(pm: PMMarket): Token[] {
  const outcomes = parseArr(pm.outcomes);
  const prices = parseArr(pm.outcomePrices);
  const tokenIds = parseArr(pm.clobTokenIds);
  if (!outcomes.length) return [
    { id: `${pm.id}-0`, token_id: `${pm.id}-0`, outcome: 'Yes', price: 0.5 },
    { id: `${pm.id}-1`, token_id: `${pm.id}-1`, outcome: 'No', price: 0.5 },
  ];
  return outcomes.map((outcome, i) => ({
    id: tokenIds[i] || `${pm.id}-${i}`,
    token_id: tokenIds[i] || `${pm.id}-${i}`,
    outcome: (outcome === 'Yes' || outcome === 'No' ? outcome : i === 0 ? 'Yes' : 'No') as 'Yes' | 'No',
    price: parseFloat(prices[i] || '0'),
    label: (outcome !== 'Yes' && outcome !== 'No') ? outcome : (pm.groupItemTitle || undefined),
  }));
}

function mapTags(tags: PMTag[]): { label: string; slug: string }[] {
  if (!tags?.length) return [];
  return tags.map(t => ({ label: t.label, slug: t.slug }));
}

/** Map a Polymarket event (binary) → our Market type */
export function mapToMarket(event: PMEvent, subMarket?: PMMarket): Market {
  const m = subMarket || event.markets?.[0];
  if (!m) {
    return {
      id: event.id,
      condition_id: '',
      question_id: '',
      question: event.title,
      description: event.description || null,
      category: pickCategory(event.tags),
      tags: mapTags(event.tags),
      slug: event.slug,
      image_url: event.image || null,
      resolution_source: null,
      tokens: [
        { id: '0', token_id: '0', outcome: 'Yes', price: 0.5 },
        { id: '1', token_id: '1', outcome: 'No', price: 0.5 },
      ],
      minimum_tick_size: 0.01,
      minimum_order_size: 5,
      active: event.active,
      closed: event.closed,
      resolved: event.closed,
      winning_outcome: null,
      resolved_at: null,
      accepting_orders: event.active && !event.closed,
      end_date_iso: event.endDate || null,
      volume: event.volume || 0,
      volume_24hr: event.volume24hr || 0,
      liquidity: event.liquidity || 0,
      created_at: event.createdAt || event.creationDate || new Date().toISOString(),
    };
  }

  const resolution = detectResolved(m);

  return {
    id: m.id,
    condition_id: m.conditionId || '',
    question_id: m.questionID || '',
    question: subMarket ? (m.groupItemTitle || m.question) : event.title,
    group_item_title: m.groupItemTitle || undefined,
    description: m.description || event.description || null,
    category: pickCategory(event.tags),
    tags: mapTags(event.tags),
    slug: subMarket ? m.slug : event.slug,
    image_url: event.image || m.image || null,
    resolution_source: m.resolutionSource || null,
    tokens: mapTokens(m),
    minimum_tick_size: m.orderPriceMinTickSize || 0.01,
    minimum_order_size: m.orderMinSize || 5,
    active: m.active && !m.closed,
    closed: m.closed,
    resolved: resolution.resolved,
    winning_outcome: resolution.winningOutcome,
    resolved_at: m.closed ? (event.endDate || null) : null,
    accepting_orders: m.active && !m.closed,
    end_date_iso: m.endDate || event.endDate || null,
    volume: m.volume ? parseFloat(m.volume) : 0,
    volume_24hr: event.volume24hr || 0,
    liquidity: m.liquidity ? parseFloat(m.liquidity) : 0,
    created_at: event.createdAt || event.creationDate || new Date().toISOString(),
  };
}

/** Map multi-outcome Polymarket event → our EventGroup */
export function mapToEventGroup(event: PMEvent): EventGroup {
  const filtered = event.markets.filter(m => !isPlaceholder(m));

  // Sort sub-markets to match Polymarket display order:
  // negRisk (league winners, elections): sort by Yes price descending
  // non-negRisk (thresholds like crude oil, Bitcoin): sort by groupItemThreshold ascending
  if (event.negRisk) {
    const mapped = filtered.map(m => mapToMarket(event, m));
    mapped.sort((a, b) => {
      const aYes = a.tokens.find(t => t.outcome === 'Yes')?.price ?? 0;
      const bYes = b.tokens.find(t => t.outcome === 'Yes')?.price ?? 0;
      return bYes - aYes;
    });
    return buildEventGroup(event, mapped);
  } else {
    filtered.sort((a, b) => (a.groupItemThreshold ?? 999) - (b.groupItemThreshold ?? 999));
    const mapped = filtered.map(m => mapToMarket(event, m));
    return buildEventGroup(event, mapped);
  }

  function buildEventGroup(ev: PMEvent, markets: Market[]): EventGroup {
    return {
      id: ev.id,
      title: ev.title,
      slug: ev.slug,
      description: ev.description || null,
      category: pickCategory(ev.tags),
      tags: mapTags(ev.tags),
      image_url: ev.image || null,
      end_date_iso: ev.endDate || null,
      volume: ev.volume || 0,
      liquidity: ev.liquidity || 0,
      created_at: ev.createdAt || ev.creationDate || new Date().toISOString(),
      markets,
    };
  }
}

/** Individual sport athlete → 3-letter country code (lowercase) for Polymarket country flags */
const ATHLETE_COUNTRIES: Record<string, string> = {
  // ── ATP Top Players ──
  'Jannik Sinner': 'ita', 'Alexander Zverev': 'deu', 'Carlos Alcaraz': 'esp',
  'Novak Djokovic': 'srb', 'Taylor Fritz': 'usa', 'Casper Ruud': 'nor',
  'Daniil Medvedev': 'rus', 'Alex de Minaur': 'aus', 'Andrey Rublev': 'rus',
  'Grigor Dimitrov': 'bgr', 'Tommy Paul': 'usa', 'Jack Draper': 'gbr',
  'Holger Rune': 'dnk', 'Stefanos Tsitsipas': 'grc', 'Frances Tiafoe': 'usa',
  'Ben Shelton': 'usa', 'Felix Auger-Aliassime': 'can', 'Sebastian Korda': 'usa',
  'Hubert Hurkacz': 'pol', 'Lorenzo Musetti': 'ita', 'Ugo Humbert': 'fra',
  'Arthur Fils': 'fra', 'Karen Khachanov': 'rus', 'Francisco Cerundolo': 'arg',
  'Matteo Berrettini': 'ita', 'Alejandro Tabilo': 'chl', 'Denis Shapovalov': 'can',
  'Thanasi Kokkinakis': 'aus', 'Nick Kyrgios': 'aus', 'Gael Monfils': 'fra',
  'Joao Fonseca': 'bra', 'Learner Tien': 'usa', 'Brandon Nakashima': 'usa',
  'Alejandro Davidovich Fokina': 'esp', 'Marcos Giron': 'usa',
  'Tomas Machac': 'cze', 'Jiri Lehecka': 'cze', 'Flavio Cobolli': 'ita',
  'Matteo Arnaldi': 'ita', 'Giovanni Mpetshi Perricard': 'fra',
  'Alexander Bublik': 'kaz', 'Jordan Thompson': 'aus', 'Jan-Lennard Struff': 'deu',
  'Miomir Kecmanovic': 'srb', 'Nuno Borges': 'prt', 'Tallon Griekspoor': 'nld',
  'Alexei Popyrin': 'aus', 'Roman Safiullin': 'rus', 'Luciano Darderi': 'ita',
  'Daniel Altmaier': 'deu', 'Sumit Nagal': 'ind', 'Borna Coric': 'hrv',
  'Aleksandar Vukic': 'aus', 'Billy Harris': 'gbr', 'Tomas Barrios': 'chl',
  'Raphael Collignon': 'bel', 'Daniel Merida Aguilar': 'esp',
  'Adrian Mannarino': 'fra', 'Christopher Eubanks': 'usa', 'Jakub Mensik': 'cze',
  'Luca Nardi': 'ita', 'Roberto Bautista Agut': 'esp', 'Stan Wawrinka': 'che',
  'Andy Murray': 'gbr', 'Dominic Thiem': 'aut', 'Kei Nishikori': 'jpn',
  'Yoshihito Nishioka': 'jpn', 'Zhizhen Zhang': 'chn', 'Juncheng Shang': 'chn',
  'Rinky Hijikata': 'aus', 'Luca Van Assche': 'fra', 'Harold Mayot': 'fra',
  'Rafael Nadal': 'esp', 'Roger Federer': 'che', 'Dominik Koepfer': 'deu',
  'Sebastian Baez': 'arg', 'Tomas Etcheverry': 'arg', 'Pedro Martinez': 'esp',
  'Pablo Carreno Busta': 'esp', 'Mariano Navone': 'arg', 'Facundo Diaz Acosta': 'arg',
  'Thiago Seyboth Wild': 'bra', 'Fabian Marozsan': 'hun',
  // ── WTA Top Players ──
  'Aryna Sabalenka': 'blr', 'Iga Swiatek': 'pol', 'Coco Gauff': 'usa',
  'Jessica Pegula': 'usa', 'Jasmine Paolini': 'ita', 'Qinwen Zheng': 'chn',
  'Elena Rybakina': 'kaz', 'Emma Navarro': 'usa', 'Daria Kasatkina': 'rus',
  'Barbora Krejcikova': 'cze', 'Danielle Collins': 'usa', 'Mirra Andreeva': 'rus',
  'Diana Shnaider': 'rus', 'Anna Kalinskaya': 'rus', 'Donna Vekic': 'hrv',
  'Madison Keys': 'usa', 'Jelena Ostapenko': 'lva', 'Liudmila Samsonova': 'rus',
  'Marta Kostyuk': 'ukr', 'Paula Badosa': 'esp', 'Leylah Fernandez': 'can',
  'Victoria Azarenka': 'blr', 'Naomi Osaka': 'jpn', 'Karolina Muchova': 'cze',
  'Beatriz Haddad Maia': 'bra', 'Caroline Garcia': 'fra', 'Maria Sakkari': 'grc',
  'Elina Svitolina': 'ukr', 'Amanda Anisimova': 'usa', 'Victoria Mboko': 'can',
  'Lulu Sun': 'nzl', 'Anastasia Pavlyuchenkova': 'rus', 'Caroline Wozniacki': 'dnk',
  'Sloane Stephens': 'usa', 'Bianca Andreescu': 'can', 'Clara Tauson': 'dnk',
  'Linda Noskova': 'cze', 'Katie Boulter': 'gbr', 'Xinyu Wang': 'chn',
  'Yue Yuan': 'chn', 'Xiyu Wang': 'chn', 'Olga Danilovic': 'srb',
  'Sara Sorribes Tormo': 'esp', 'Lucia Bronzetti': 'ita',
  // ── UFC / MMA Fighters ──
  'Jon Jones': 'usa', 'Islam Makhachev': 'rus', 'Alex Pereira': 'bra',
  'Dricus du Plessis': 'zaf', 'Ilia Topuria': 'esp', 'Sean O\'Malley': 'usa',
  'Merab Dvalishvili': 'geo', 'Alexandre Pantoja': 'bra', 'Belal Muhammad': 'usa',
  'Leon Edwards': 'gbr', 'Max Holloway': 'usa', 'Alexander Volkanovski': 'aus',
  'Charles Oliveira': 'bra', 'Dustin Poirier': 'usa', 'Justin Gaethje': 'usa',
  'Kamaru Usman': 'nga', 'Conor McGregor': 'irl', 'Jorge Masvidal': 'usa',
  'Nate Diaz': 'usa', 'Israel Adesanya': 'nzl', 'Robert Whittaker': 'aus',
  'Sean Strickland': 'usa', 'Jiri Prochazka': 'cze', 'Jamahal Hill': 'usa',
  'Tom Aspinall': 'gbr', 'Ciryl Gane': 'fra', 'Stipe Miocic': 'usa',
  'Valentina Shevchenko': 'kgz', 'Amanda Nunes': 'bra', 'Zhang Weili': 'chn',
  'Rose Namajunas': 'usa', 'Alexa Grasso': 'mex', 'Raquel Pennington': 'usa',
  'Paddy Pimblett': 'gbr', 'Michael Chandler': 'usa', 'Beneil Dariush': 'usa',
  'Movsar Evloev': 'rus', 'Yair Rodriguez': 'mex', 'Arnold Allen': 'gbr',
  'Shavkat Rakhmonov': 'kaz', 'Jack Della Maddalena': 'aus',
  'Magomed Ankalaev': 'rus', 'Aleksandar Rakic': 'aut', 'Khamzat Chimaev': 'swe',
  'Bo Nickal': 'usa', 'Caio Borralho': 'bra', 'Nassourdine Imavov': 'fra',
  'Josh Emmett': 'usa', 'Kevin Vallejos': 'arg', 'Kayla Harrison': 'usa',
  'Ian Machado Garry': 'irl', 'Gilbert Burns': 'bra', 'Colby Covington': 'usa',
  'Petr Yan': 'rus', 'Cory Sandhagen': 'usa', 'Marlon Vera': 'ecu',
  'Song Yadong': 'chn', 'Brandon Moreno': 'mex', 'Amir Albazi': 'swe',
  'Kai Kara-France': 'nzl', 'Brandon Royval': 'usa', 'Muhammad Mokaev': 'gbr',
  'Renato Moicano': 'bra', 'Benoit Saint Denis': 'fra', 'Dan Hooker': 'nzl',
  'Rafael Fiziev': 'kaz', 'Matt Frevola': 'usa', 'Arman Tsarukyan': 'arm',
  // ── Boxing ──
  'Canelo Alvarez': 'mex', 'Terence Crawford': 'usa', 'Naoya Inoue': 'jpn',
  'Oleksandr Usyk': 'ukr', 'Tyson Fury': 'gbr', 'Gervonta Davis': 'usa',
  'Devin Haney': 'usa', 'Shakur Stevenson': 'usa', 'Ryan Garcia': 'usa',
  'Jermell Charlo': 'usa', 'Errol Spence Jr': 'usa', 'David Benavidez': 'usa',
  'Dmitry Bivol': 'kgz', 'Artur Beterbiev': 'rus', 'Anthony Joshua': 'gbr',
  'Daniel Dubois': 'gbr', 'Zhilei Zhang': 'chn', 'Filip Hrgovic': 'hrv',
  'Vasiliy Lomachenko': 'ukr', 'Emanuel Navarrete': 'mex', 'Jesse Rodriguez': 'usa',
  'Juan Francisco Estrada': 'mex', 'Junto Nakatani': 'jpn', 'Kazuto Ioka': 'jpn',
  'Vergil Ortiz Jr': 'usa', 'Jaron Ennis': 'usa', 'Tim Tszyu': 'aus',
  'Sebastian Fundora': 'usa', 'Jake Paul': 'usa', 'Mike Tyson': 'usa',
  'Katie Taylor': 'irl', 'Amanda Serrano': 'pri', 'Claressa Shields': 'usa',
  // ── Chess ──
  'Magnus Carlsen': 'nor', 'Ding Liren': 'chn', 'Fabiano Caruana': 'usa',
  'Hikaru Nakamura': 'usa', 'Ian Nepomniachtchi': 'rus', 'Alireza Firouzja': 'fra',
  'Praggnanandhaa': 'ind', 'Wei Yi': 'chn', 'Anish Giri': 'nld',
  'Dommaraju Gukesh': 'ind', 'Nodirbek Abdusattorov': 'uzb',
  'Vincent Keymer': 'deu', 'Arjun Erigaisi': 'ind', 'Leinier Dominguez': 'usa',
  // ── Golf ──
  'Scottie Scheffler': 'usa', 'Xander Schauffele': 'usa', 'Rory McIlroy': 'gbr',
  'Jon Rahm': 'esp', 'Viktor Hovland': 'nor', 'Collin Morikawa': 'usa',
  'Ludvig Aberg': 'swe', 'Wyndham Clark': 'usa', 'Patrick Cantlay': 'usa',
  'Brooks Koepka': 'usa', 'Bryson DeChambeau': 'usa', 'Dustin Johnson': 'usa',
  'Jordan Spieth': 'usa', 'Justin Thomas': 'usa', 'Cameron Smith': 'aus',
  'Tommy Fleetwood': 'gbr', 'Shane Lowry': 'irl', 'Hideki Matsuyama': 'jpn',
  'Sahith Theegala': 'usa', 'Tony Finau': 'usa', 'Sam Burns': 'usa',
  'Sungjae Im': 'kor', 'Tom Kim': 'kor', 'Min Woo Lee': 'aus',
  'Robert MacIntyre': 'gbr', 'Keegan Bradley': 'usa', 'Matt Fitzpatrick': 'gbr',
  'Cameron Young': 'usa', 'Russell Henley': 'usa', 'Max Homa': 'usa',
  'Tiger Woods': 'usa', 'Phil Mickelson': 'usa',
  // ── Table Tennis ──
  'Fan Zhendong': 'chn', 'Ma Long': 'chn', 'Wang Chuqin': 'chn',
  'Hugo Calderano': 'bra', 'Tomokazu Harimoto': 'jpn', 'Lin Yun-Ju': 'twn',
  'Liam Pitchford': 'gbr', 'Dimitrij Ovtcharov': 'deu', 'Truls Moregardh': 'swe',
  'Timo Boll': 'deu', 'Patrick Franziska': 'deu', 'Quadri Aruna': 'nga',
  'Felix Lebrun': 'fra', 'Alexis Lebrun': 'fra', 'Liang Jingkun': 'chn',
  'Sun Yingsha': 'chn', 'Chen Meng': 'chn', 'Wang Manyu': 'chn',
  'Hina Hayata': 'jpn', 'Mima Ito': 'jpn', 'Shin Yubin': 'kor',
};

/** Tags that indicate individual (non-team) sports → use country flags */
const INDIVIDUAL_SPORT_TAGS = new Set([
  'tennis', 'ufc', 'boxing', 'mma', 'chess', 'golf', 'table-tennis',
  'ping-pong', 'f1', 'cycling', 'athletics', 'swimming', 'gymnastics',
  'badminton', 'fencing', 'wrestling', 'judo', 'taekwondo', 'karate',
]);

/** Country name → 3-letter code for international team matchups (WBC, Olympics, etc.) */
const COUNTRY_CODES: Record<string, string> = {
  'USA': 'usa', 'United States': 'usa', 'Italy': 'ita', 'Canada': 'can',
  'Japan': 'jpn', 'South Korea': 'kor', 'Korea': 'kor', 'Netherlands': 'nld',
  'Israel': 'isr', 'Puerto Rico': 'pri', 'Dominican Republic': 'dom',
  'Venezuela': 'ven', 'Mexico': 'mex', 'Cuba': 'cub', 'Panama': 'pan',
  'Colombia': 'col', 'Australia': 'aus', 'Brazil': 'bra', 'China': 'chn',
  'Chinese Taipei': 'twn', 'Taiwan': 'twn', 'Germany': 'deu', 'France': 'fra',
  'Spain': 'esp', 'Great Britain': 'gbr', 'United Kingdom': 'gbr', 'England': 'gbr',
  'Argentina': 'arg', 'India': 'ind', 'Pakistan': 'pak', 'South Africa': 'zaf',
  'New Zealand': 'nzl', 'West Indies': 'wif', 'Sri Lanka': 'lka',
  'Bangladesh': 'bgd', 'Afghanistan': 'afg', 'Ireland': 'irl', 'Scotland': 'gbr',
  'Czech Republic': 'cze', 'Czechia': 'cze',
  'Nicaragua': 'nic', 'Nigeria': 'nga', 'Philippines': 'phl', 'Thailand': 'tha',
  'Sweden': 'swe', 'Norway': 'nor', 'Denmark': 'dnk',
  'Finland': 'fin', 'Russia': 'rus', 'Poland': 'pol', 'Austria': 'aut',
  'Switzerland': 'che', 'Belgium': 'bel', 'Portugal': 'prt', 'Greece': 'grc',
  'Turkey': 'tur', 'Croatia': 'hrv', 'Serbia': 'srb', 'Romania': 'rou',
  'Hungary': 'hun', 'Ukraine': 'ukr', 'Slovakia': 'svk', 'Slovenia': 'svn',
  'Bulgaria': 'bgr', 'Egypt': 'egy', 'Morocco': 'mar', 'Kenya': 'ken',
  'Ghana': 'gha', 'Cameroon': 'cmr', 'Senegal': 'sen', 'Tunisia': 'tun',
  'Algeria': 'dza', 'Chile': 'chl', 'Peru': 'per', 'Ecuador': 'ecu',
  'Uruguay': 'ury', 'Paraguay': 'pry', 'Bolivia': 'bol', 'Jamaica': 'jam',
  'Trinidad and Tobago': 'tto', 'Costa Rica': 'cri', 'Honduras': 'hnd',
  'El Salvador': 'slv', 'Guatemala': 'gtm', 'Iran': 'irn', 'Iraq': 'irq',
  'Saudi Arabia': 'sau', 'UAE': 'are', 'Qatar': 'qat', 'Kuwait': 'kwt',
  'Indonesia': 'idn', 'Malaysia': 'mys', 'Singapore': 'sgp', 'Vietnam': 'vnm',
};

function getPlayerCountry(name: string): string {
  if (ATHLETE_COUNTRIES[name]) return ATHLETE_COUNTRIES[name];
  // Check if name is a country
  if (COUNTRY_CODES[name]) return COUNTRY_CODES[name];
  // Try partial match (last name)
  const lastName = name.split(' ').pop() || '';
  for (const [player, country] of Object.entries(ATHLETE_COUNTRIES)) {
    if (player.endsWith(lastName)) return country;
  }
  return '';
}

/** Detect if a Polymarket event is a sports/esports match and build MatchInfo */
export function buildMatchInfo(event: PMEvent): MatchInfo | null {
  const hasSportsTag = event.tags?.some(t =>
    ['sports', 'esports'].includes(t.slug)
  );
  if (!hasSportsTag) return null;

  // Parse title: "Sport: Team1 vs Team2 (BO5) - League" or "Team1 vs. Team2"
  // Sport prefix can be multi-word: "United Rugby Championship:", "UFC Fight Night:", "Dota 2:"
  const vsMatch = event.title.match(/^(?:(.+?):\s+)?(.+?)\s+vs\.?\s+(.+?)(?:\s+\(BO(\d+)\))?(?:\s+-\s+(.+))?$/i);
  if (!vsMatch) return null;

  const [, sport, team1Name, team2Raw, bestOfStr, leagueInfo] = vsMatch;
  // team2Raw may have trailing info like "(BO5) - LPL Playoffs" or "(Featherweight, Main Card)"
  const team2Name = team2Raw.replace(/\s*\((?:BO\d+|[^)]*(?:weight|Card|Round)[^)]*)\).*$/, '').trim();

  // Derive abbreviations from slug pattern: "sport-t1abbr-t2abbr-date"
  const slugParts = event.slug.split('-');
  let abbr1 = team1Name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  let abbr2 = team2Name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  if (slugParts.length >= 3) {
    abbr1 = slugParts[1]?.toUpperCase() || abbr1;
    abbr2 = slugParts[2]?.toUpperCase() || abbr2;
  }

  // Determine league from title suffix or tag labels (auto, not hardcoded)
  const GENERIC_TAGS = new Set(['sports', 'esports', 'games']);
  let league = leagueInfo?.trim() || '';
  if (!league) {
    // Use the tag label directly from Polymarket (e.g., tag.label = "League of Legends")
    for (const t of (event.tags || [])) {
      if (GENERIC_TAGS.has(t.slug)) continue;
      if (t.label) { league = t.label; break; }
    }
  }
  if (!league) league = sport || 'Sports';

  // Team logos from Polymarket S3 bucket (available for NBA, NHL, MLB, NFL)
  // Tennis uses country flags instead of team logos
  const LOGO_LEAGUES = new Set(['NBA', 'NHL', 'MLB', 'NFL']);
  const logoLeague = LOGO_LEAGUES.has(league) ? league : '';
  const S3_BASE = 'https://polymarket-upload.s3.us-east-2.amazonaws.com';
  const isIndividualSport = event.tags?.some(t => INDIVIDUAL_SPORT_TAGS.has(t.slug));
  let logo1 = logoLeague ? `${S3_BASE}/${logoLeague}+Team+Logos/${abbr1}.png` : '';
  let logo2 = logoLeague ? `${S3_BASE}/${logoLeague}+Team+Logos/${abbr2}.png` : '';
  if (!logoLeague) {
    // Individual sports (tennis, UFC, etc.) or country-vs-country matchups (WBC, Olympics)
    const c1 = getPlayerCountry(team1Name);
    const c2 = getPlayerCountry(team2Name);
    if (isIndividualSport || (c1 && c2)) {
      if (c1) logo1 = `${S3_BASE}/country-flags/${c1}.png`;
      if (c2) logo2 = `${S3_BASE}/country-flags/${c2}.png`;
    }
  }

  // Determine match status:
  //   closed=true → FINAL
  //   end_date < now + prices settled → FINAL (match over, result known)
  //   end_date < now + prices NOT settled → LIVE (match in progress or result pending)
  //   Some sub-markets have settled prices while others are active → LIVE
  //   Otherwise → UPCOMING
  const endDate = new Date(event.endDate);
  const now = new Date();
  const hoursPast = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);
  let status: 'upcoming' | 'live' | 'final' = 'upcoming';
  if (event.closed || hoursPast > 3) {
    status = 'final';
  } else if (endDate < now) {
    // End date passed but within 3 hours — check if result is already decided
    const nonPH = event.markets.filter(m => !isPlaceholder(m));
    const hasDecisivePrice = nonPH.some(m => {
      const prices = parseArr(m.outcomePrices);
      const p = parseFloat(prices[0] || '0.5');
      return p > 0.92 || p < 0.08;
    });
    status = hasDecisivePrice ? 'final' : 'live';
  } else {
    // Detect in-progress matches: if any "Game X Winner" market has settled
    // (price near 0 or 1) while the Match Winner is still active, match is live
    const nonPlaceholder = event.markets.filter(m => !isPlaceholder(m));
    if (nonPlaceholder.length >= 3) {
      const hasSettledGame = nonPlaceholder.some(m => {
        const title = m.groupItemTitle || m.question || '';
        if (!/^Game \d+ Winner$/i.test(title)) return false;
        const prices = parseArr(m.outcomePrices);
        const p = parseFloat(prices[0] || '0.5');
        return p < 0.02 || p > 0.98;
      });
      if (hasSettledGame) {
        status = 'live';
      } else {
        // Fallback: if any sub-market is settled while others are active
        const settledCount = nonPlaceholder.filter(m => {
          const prices = parseArr(m.outcomePrices);
          const p = parseFloat(prices[0] || '0.5');
          return p < 0.02 || p > 0.98;
        }).length;
        const activeCount = nonPlaceholder.length - settledCount;
        if (settledCount >= 1 && activeCount > 0) {
          status = 'live';
        }
      }
    }
  }

  // Group sub-markets into market_types
  const marketTypes: MatchInfo['market_types'] = [];
  const markets = event.markets.filter(m => !isPlaceholder(m));

  // Find Match Winner / Moneyline market
  // Esports: groupItemTitle === 'Match Winner'
  // Traditional sports (NBA): no groupItemTitle, question matches event title
  // UFC/MMA: groupItemTitle contains "vs" (e.g., "Josh Emmett vs. Kevin Vallejos")
  // Soccer: each outcome is a separate sub-market (team1, draw, team2)
  const matchWinner = markets.find(m =>
    m.groupItemTitle === 'Match Winner' || m.question === 'Match Winner'
  ) || markets.find(m =>
    !m.groupItemTitle && m.question === event.title
  ) || markets.find(m =>
    /\bvs\.?\b/i.test(m.groupItemTitle || '') && /\bvs\.?\b/i.test(m.question || '')
    && !/draw/i.test(m.groupItemTitle || '')
  );
  if (matchWinner) {
    const prices = parseArr(matchWinner.outcomePrices);
    marketTypes.push({
      id: 'match-winner',
      tab: 'game-lines',
      label: 'Moneyline',
      volume: parseFloat(matchWinner.volume || '0'),
      markets: [
        { id: `${matchWinner.id}-0`, label: team1Name, price: parseFloat(prices[0] || '0.5') },
        { id: `${matchWinner.id}-1`, label: team2Name, price: parseFloat(prices[1] || '0.5') },
      ],
    });
  } else {
    // Soccer-style 3-way: each outcome (team1/draw/team2) is its own sub-market
    const t1Market = markets.find(m => m.groupItemTitle === team1Name || m.question === team1Name);
    const t2Market = markets.find(m => m.groupItemTitle === team2Name || m.question === team2Name);
    if (t1Market && t2Market) {
      const t1Prices = parseArr(t1Market.outcomePrices);
      const t2Prices = parseArr(t2Market.outcomePrices);
      const winnerMarkets: { id: string; label: string; price: number }[] = [
        { id: `${t1Market.id}-0`, label: team1Name, price: parseFloat(t1Prices[0] || '0.5') },
        { id: `${t2Market.id}-0`, label: team2Name, price: parseFloat(t2Prices[0] || '0.5') },
      ];
      // Add draw if available
      const drawMarket = markets.find(m =>
        (m.groupItemTitle || m.question || '').toLowerCase().startsWith('draw')
      );
      if (drawMarket) {
        const drawPrices = parseArr(drawMarket.outcomePrices);
        winnerMarkets.push({
          id: `${drawMarket.id}-0`, label: 'Draw', price: parseFloat(drawPrices[0] || '0.5'),
        });
      }
      marketTypes.push({
        id: 'match-winner',
        tab: 'game-lines',
        label: 'Winner',
        volume: parseFloat(t1Market.volume || '0') + parseFloat(t2Market.volume || '0'),
        markets: winnerMarkets,
      });
    }
  }

  // Spread markets (traditional sports: "Spread -2.5", "Spread +1.5", etc.)
  const spreads = markets
    .filter(m => /^Spread\s/i.test(m.groupItemTitle || ''))
    .sort((a, b) => {
      const aVal = parseFloat((a.groupItemTitle || '').match(/-?[\d.]+/)?.[0] || '0');
      const bVal = parseFloat((b.groupItemTitle || '').match(/-?[\d.]+/)?.[0] || '0');
      return aVal - bVal;
    });
  for (const sp of spreads) {
    const prices = parseArr(sp.outcomePrices);
    const label = sp.groupItemTitle || sp.question;
    marketTypes.push({
      id: `spread-${sp.id}`,
      tab: 'game-lines',
      label,
      volume: parseFloat(sp.volume || '0'),
      markets: [
        { id: `${sp.id}-0`, label: team1Name, price: parseFloat(prices[0] || '0.5') },
        { id: `${sp.id}-1`, label: team2Name, price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // Team-based spread markets: "TeamName (-1.5)", "TeamName (+1.5)" (soccer/traditional sports "More Markets")
  const teamSpreads = markets
    .filter(m => {
      const title = m.groupItemTitle || '';
      return /\(-?\d+\.?\d*\)\s*$/.test(title) && !spreads.includes(m);
    })
    .sort((a, b) => {
      const aVal = parseFloat((a.groupItemTitle || '').match(/(-?\d+\.?\d*)\)$/)?.[1] || '0');
      const bVal = parseFloat((b.groupItemTitle || '').match(/(-?\d+\.?\d*)\)$/)?.[1] || '0');
      return aVal - bVal;
    });
  for (const sp of teamSpreads) {
    const prices = parseArr(sp.outcomePrices);
    const label = sp.groupItemTitle || sp.question;
    marketTypes.push({
      id: `spread-${sp.id}`,
      tab: 'game-lines',
      label,
      volume: parseFloat(sp.volume || '0'),
      markets: [
        { id: `${sp.id}-0`, label: 'Yes', price: parseFloat(prices[0] || '0.5') },
        { id: `${sp.id}-1`, label: 'No', price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // Both Teams to Score
  const btts = markets.find(m =>
    (m.groupItemTitle || m.question || '').toLowerCase().includes('both teams to score')
  );
  if (btts) {
    const prices = parseArr(btts.outcomePrices);
    marketTypes.push({
      id: `btts-${btts.id}`,
      tab: 'game-lines',
      label: 'Both Teams to Score',
      volume: parseFloat(btts.volume || '0'),
      markets: [
        { id: `${btts.id}-0`, label: 'Yes', price: parseFloat(prices[0] || '0.5') },
        { id: `${btts.id}-1`, label: 'No', price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // Over/Under markets (traditional sports: "O/U 222.5", "O/U 0.5 Rounds", etc.)
  const ouPoints = markets
    .filter(m => /^O\/U\s[\d.]+/i.test(m.groupItemTitle || '') && !/Games$/i.test(m.groupItemTitle || ''))
    .sort((a, b) => {
      const aVal = parseFloat((a.groupItemTitle || '').match(/([\d.]+)/)?.[1] || '0');
      const bVal = parseFloat((b.groupItemTitle || '').match(/([\d.]+)/)?.[1] || '0');
      return aVal - bVal;
    });
  for (const ou of ouPoints) {
    const prices = parseArr(ou.outcomePrices);
    const label = ou.groupItemTitle || ou.question;
    marketTypes.push({
      id: `ou-points-${ou.id}`,
      tab: 'totals',
      label,
      volume: parseFloat(ou.volume || '0'),
      markets: [
        { id: `${ou.id}-0`, label: 'Over', price: parseFloat(prices[0] || '0.5') },
        { id: `${ou.id}-1`, label: 'Under', price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // Game Winner markets (Game 1, Game 2, etc.)
  const gameWinners = markets
    .filter(m => /^Game \d+ Winner$/i.test(m.groupItemTitle || m.question))
    .sort((a, b) => {
      const aNum = parseInt((a.groupItemTitle || a.question).match(/\d+/)?.[0] || '0');
      const bNum = parseInt((b.groupItemTitle || b.question).match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });
  for (const gw of gameWinners) {
    const prices = parseArr(gw.outcomePrices);
    const label = gw.groupItemTitle || gw.question;
    marketTypes.push({
      id: `game-winner-${label}`,
      tab: 'game-lines',
      label,
      volume: parseFloat(gw.volume || '0'),
      markets: [
        { id: `${gw.id}-0`, label: team1Name, price: parseFloat(prices[0] || '0.5') },
        { id: `${gw.id}-1`, label: team2Name, price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // Game Handicap markets
  const handicaps = markets.filter(m =>
    (m.groupItemTitle || m.question).toLowerCase().includes('handicap')
  );
  for (const h of handicaps) {
    const prices = parseArr(h.outcomePrices);
    const label = h.groupItemTitle || h.question;
    marketTypes.push({
      id: `handicap-${h.id}`,
      tab: 'game-lines',
      label,
      volume: parseFloat(h.volume || '0'),
      markets: [
        { id: `${h.id}-0`, label: 'Yes', price: parseFloat(prices[0] || '0.5') },
        { id: `${h.id}-1`, label: 'No', price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // O/U Games markets
  const ouGames = markets.filter(m =>
    /^O\/U \d+\.\d+ Games$/i.test(m.groupItemTitle || m.question)
  );
  for (const ou of ouGames) {
    const prices = parseArr(ou.outcomePrices);
    const label = ou.groupItemTitle || ou.question;
    marketTypes.push({
      id: `ou-games-${ou.id}`,
      tab: 'game-lines',
      label,
      volume: parseFloat(ou.volume || '0'),
      markets: [
        { id: `${ou.id}-0`, label: 'Over', price: parseFloat(prices[0] || '0.5') },
        { id: `${ou.id}-1`, label: 'Under', price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // Total Kills O/U — each line as its own card (Polymarket layout)
  const killsMarkets = markets
    .filter(m => (m.groupItemTitle || m.question).toLowerCase().includes('total kills'))
    .sort((a, b) => {
      // Sort by game number, then by O/U value
      const aGame = parseInt((a.groupItemTitle || a.question).match(/Game (\d+)/i)?.[1] || '0');
      const bGame = parseInt((b.groupItemTitle || b.question).match(/Game (\d+)/i)?.[1] || '0');
      if (aGame !== bGame) return aGame - bGame;
      const aVal = parseFloat((a.groupItemTitle || a.question).match(/([\d.]+)/)?.[1] || '0');
      const bVal = parseFloat((b.groupItemTitle || b.question).match(/([\d.]+)/)?.[1] || '0');
      return aVal - bVal;
    });
  for (const km of killsMarkets) {
    const label = km.groupItemTitle || km.question;
    const prices = parseArr(km.outcomePrices);
    marketTypes.push({
      id: `kills-${km.id}`,
      tab: 'totals',
      label,
      volume: parseFloat(km.volume || '0'),
      markets: [
        { id: `${km.id}-0`, label: 'Over', price: parseFloat(prices[0] || '0.5') },
        { id: `${km.id}-1`, label: 'Under', price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  // First Blood markets
  const firstBloods = markets.filter(m =>
    (m.groupItemTitle || m.question).toLowerCase().includes('first blood')
  ).sort((a, b) => {
    const aNum = parseInt((a.groupItemTitle || a.question).match(/\d+/)?.[0] || '0');
    const bNum = parseInt((b.groupItemTitle || b.question).match(/\d+/)?.[0] || '0');
    return aNum - bNum;
  });
  for (const fb of firstBloods) {
    const prices = parseArr(fb.outcomePrices);
    const label = fb.groupItemTitle || fb.question;
    marketTypes.push({
      id: `first-blood-${fb.id}`,
      tab: 'totals',
      label,
      volume: parseFloat(fb.volume || '0'),
      markets: [
        { id: `${fb.id}-0`, label: team1Name, price: parseFloat(prices[0] || '0.5') },
        { id: `${fb.id}-1`, label: team2Name, price: parseFloat(prices[1] || '0.5') },
      ],
    });
  }

  if (marketTypes.length === 0) return null;

  return {
    team1: { name: team1Name, abbr: abbr1, logo: logo1 },
    team2: { name: team2Name, abbr: abbr2, logo: logo2 },
    event_image: event.image || '',
    league,
    start_time: event.endDate || event.startDate,
    status,
    best_of: bestOfStr ? parseInt(bestOfStr) : undefined,
    market_types: marketTypes,
  };
}

/** For home page grid: map any event → a single Market card representation */
export function mapToMarketCard(event: PMEvent): Market {
  const isMulti = isMultiOutcomeEvent(event);

  if (!isMulti) {
    return mapToMarket(event);
  }

  const eventResolution = detectEventResolved(event);
  const isResolved = eventResolution.resolved;

  // Multi-outcome: create Market with multiple tokens for card display
  // - Always filter out placeholders (no price data)
  // - For active events: also filter out closed/eliminated sub-markets
  // - For resolved events: keep all non-placeholder sub-markets to show winner
  const filtered = event.markets.filter(m => {
    if (isPlaceholder(m)) return false;
    if (isResolved) return true;
    const prices = parseArr(m.outcomePrices);
    const yesPrice = parseFloat(prices[0] || '0');
    return !m.closed && yesPrice > 0;
  });

  // Sort to match Polymarket display order:
  // negRisk: by price descending | non-negRisk: by groupItemThreshold ascending
  if (event.negRisk) {
    filtered.sort((a, b) => {
      const aPrice = parseFloat(parseArr(a.outcomePrices)[0] || '0');
      const bPrice = parseFloat(parseArr(b.outcomePrices)[0] || '0');
      return bPrice - aPrice;
    });
  } else {
    filtered.sort((a, b) => (a.groupItemThreshold ?? 999) - (b.groupItemThreshold ?? 999));
  }

  const tokens: Token[] = filtered.map((m) => {
    const prices = parseArr(m.outcomePrices);
    const tokenIds = parseArr(m.clobTokenIds);
    return {
      id: tokenIds[0] || m.id,
      token_id: tokenIds[0] || m.id,
      outcome: 'Yes' as const,
      label: m.groupItemTitle || m.question,
      price: parseFloat(prices[0] || '0'),
    };
  });

  return {
    id: event.id,
    condition_id: event.markets[0]?.conditionId || '',
    question_id: '',
    question: event.title,
    description: event.description || null,
    category: pickCategory(event.tags),
    tags: mapTags(event.tags),
    slug: event.slug,
    image_url: event.image || null,
    resolution_source: null,
    tokens,
    minimum_tick_size: 0.01,
    minimum_order_size: 5,
    active: event.active && !event.closed,
    closed: event.closed,
    resolved: eventResolution.resolved,
    winning_outcome: eventResolution.winningOutcome,
    resolved_at: event.closed ? (event.endDate || null) : null,
    accepting_orders: event.active && !event.closed,
    end_date_iso: event.endDate || null,
    volume: event.volume || 0,
    volume_24hr: event.volume24hr || 0,
    liquidity: event.liquidity || 0,
    neg_risk: event.negRisk || false,
    created_at: event.createdAt || event.creationDate || new Date().toISOString(),
  };
}

/** Is this event multi-outcome (multiple sub-markets)? */
export function isMultiOutcomeEvent(event: PMEvent): boolean {
  return event.markets.length > 1;
}

// ── Server-side fetch functions ────────────────────────────────────────────

export async function fetchEvents(params: {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  order?: string;
  ascending?: boolean;
  tag_slug?: string;
} = {}): Promise<PMEvent[]> {
  const sp = new URLSearchParams();
  sp.set('limit', String(params.limit ?? 20));
  if (params.offset) sp.set('offset', String(params.offset));
  if (params.active !== undefined) sp.set('active', String(params.active));
  if (params.closed !== undefined) sp.set('closed', String(params.closed));
  if (params.order) sp.set('order', params.order);
  if (params.ascending !== undefined) sp.set('ascending', String(params.ascending));
  if (params.tag_slug) sp.set('tag_slug', params.tag_slug);

  const cacheKey = `events:${sp.toString()}`;
  const cached = getCached<PMEvent[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${GAMMA_API}/events?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
  const data: PMEvent[] = await res.json();
  setCache(cacheKey, data);
  return data;
}

export async function fetchEventBySlug(slug: string): Promise<PMEvent | null> {
  const cacheKey = `event:${slug}`;
  const cached = getCached<PMEvent[]>(cacheKey, 10_000); // 10s cache for fresh data
  if (cached) return cached[0] || null;

  // Try event slug first
  const res = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}&limit=1`, { cache: 'no-store' });
  if (!res.ok) return null;
  const events: PMEvent[] = await res.json();
  if (events.length > 0) {
    setCache(cacheKey, events);
    return events[0];
  }

  // Try ticker
  const res2 = await fetch(`${GAMMA_API}/events?ticker=${encodeURIComponent(slug)}&limit=1`, { cache: 'no-store' });
  if (!res2.ok) return null;
  const events2: PMEvent[] = await res2.json();
  if (events2.length > 0) {
    setCache(cacheKey, events2);
    return events2[0];
  }

  return null;
}

/** Fetch live CLOB bid/ask prices for multiple tokens in one batch request */
export async function fetchLivePrices(tokenIds: string[]): Promise<Record<string, { bid: number; ask: number; mid: number }>> {
  if (!tokenIds.length) return {};

  const sorted = [...tokenIds].sort();
  const cacheKey = `prices-live:${sorted.join(',')}`;
  const cached = getCached<Record<string, { bid: number; ask: number; mid: number }>>(cacheKey, 5_000);
  if (cached) return cached;

  try {
    // POST /prices returns both BUY (best bid) and SELL (best ask) per token
    const body = tokenIds.flatMap(token_id => [
      { token_id, side: 'buy' },
      { token_id, side: 'sell' },
    ]);
    const res = await fetch(`${CLOB_API}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const data: Record<string, { BUY?: string; SELL?: string }> = await res.json();
    const result: Record<string, { bid: number; ask: number; mid: number }> = {};
    for (const [id, prices] of Object.entries(data)) {
      const bid = parseFloat(prices.BUY || '0') || 0;
      const ask = parseFloat(prices.SELL || '0') || 0;
      result[id] = { bid, ask, mid: (bid + ask) / 2 };
    }
    setCache(cacheKey, result);
    return result;
  } catch {
    return {};
  }
}

/** Fetch CLOB price history (OHLC) */
export async function fetchPriceHistory(
  tokenId: string,
  interval: string = 'max',
  fidelity: number = 60
): Promise<{ t: number; p: number }[]> {
  const cacheKey = `prices:${tokenId}:${interval}:${fidelity}`;
  const cached = getCached<{ t: number; p: number }[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `${CLOB_API}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const history = data.history || [];
  setCache(cacheKey, history);
  return history;
}

/** Fetch related events in the same series */
export async function fetchRelatedEvents(event: PMEvent): Promise<{
  slug: string;
  title: string;
  endDate: string;
  closed: boolean;
  winning_outcome: string | null;
}[]> {
  const cacheKey = `related:${event.slug}`;
  const cached = getCached<{ slug: string; title: string; endDate: string; closed: boolean; winning_outcome: string | null }[]>(cacheKey, 60_000);
  if (cached) return cached;

  let matches: PMEvent[] = [];

  // Strategy 1: Use /series endpoint (returns ALL events in a series including past ones)
  if (event.seriesSlug) {
    try {
      const res = await fetch(
        `${GAMMA_API}/series?slug=${encodeURIComponent(event.seriesSlug)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const seriesData = await res.json();
        if (Array.isArray(seriesData) && seriesData[0]?.events) {
          // Series events may not have full `markets` array — build related list directly
          const seriesEvents: { slug: string; title: string; endDate: string; closed: boolean }[] = seriesData[0].events;
          const seriesMatches = seriesEvents
            .filter(e => e.slug !== event.slug)
            .map(e => ({
              slug: e.slug,
              title: e.title,
              endDate: e.endDate || '',
              closed: e.closed,
              winning_outcome: null as string | null,
            }))
            .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
          if (seriesMatches.length > 0) {
            setCache(cacheKey, seriesMatches);
            return seriesMatches;
          }
        }
      }
    } catch { /* fall through to tag-based strategy */ }
  }

  // Strategy 2: Fallback to tag + title matching
  if (matches.length === 0 && event.tags?.length) {
    const titleBase = event.title.replace(/\s+in\s+\w+\??$/, '').trim();
    for (const tag of event.tags) {
      const res = await fetch(
        `${GAMMA_API}/events?tag_slug=${encodeURIComponent(tag.slug)}&limit=100&order=volume&ascending=false`,
        { cache: 'no-store' }
      );
      if (!res.ok) continue;
      const allEvents: PMEvent[] = await res.json();
      const tagMatches = allEvents.filter(e => {
        if (e.slug === event.slug) return false;
        const otherBase = e.title.replace(/\s+in\s+\w+\??$/, '').trim();
        return otherBase === titleBase;
      });
      if (tagMatches.length > matches.length) {
        matches = tagMatches;
      }
    }
  }

  const related = matches.map(e => {
    const resolution = detectEventResolved(e);
    return {
      slug: e.slug,
      title: e.title,
      endDate: e.endDate || '',
      closed: e.closed,
      winning_outcome: resolution.winningOutcome,
    };
  }).sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());

  setCache(cacheKey, related);
  return related;
}
