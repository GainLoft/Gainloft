/**
 * Category configuration.
 *
 * Bidirectional mapping between our local URL slugs and Polymarket tag slugs.
 * Only needed for categories where our slug differs from Polymarket's.
 * New Polymarket categories use their slug directly (no mapping needed).
 */

// Our local URL slug → Polymarket tag slug (only for differences)
const LOCAL_TO_PM: Record<string, string> = {
  culture: 'pop-culture',
  climate: 'climate-science',
  mentions: 'mention-markets',
};

// Polymarket tag slug → our local URL slug (only for differences)
const PM_TO_LOCAL: Record<string, string> = {
  'pop-culture': 'culture',
  'climate-science': 'climate',
  'mention-markets': 'mentions',
};

/** Convert our local URL slug to Polymarket tag slug */
export function localSlugToPmTag(localSlug: string): string {
  return LOCAL_TO_PM[localSlug] || localSlug;
}

/** Convert Polymarket tag slug to our local URL slug */
export function pmTagToLocalSlug(pmTag: string): string {
  return PM_TO_LOCAL[pmTag] || pmTag;
}

/** Convert a slug to a human-readable display label */
export function slugToLabel(slug: string): string {
  const LABEL_OVERRIDES: Record<string, string> = {
    'pop-culture': 'Culture',
    'climate-science': 'Climate & Science',
    'mention-markets': 'Mentions',
    culture: 'Culture',
    climate: 'Climate & Science',
    mentions: 'Mentions',
  };
  if (LABEL_OVERRIDES[slug]) return LABEL_OVERRIDES[slug];
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Legacy exports (used by home page tabs, etc.) ──

export const CATEGORY_MAP: Record<string, string> = {
  Politics: 'politics',
  Sports: 'sports',
  Crypto: 'crypto',
  Iran: 'iran',
  Finance: 'finance',
  Geopolitics: 'geopolitics',
  Tech: 'tech',
  Culture: 'pop-culture',
  Economy: 'economy',
  Climate: 'climate',
  Mentions: 'mention-markets',
  Elections: 'elections',
  Music: 'music',
  Esports: 'esports',
};

export const CATEGORIES = Object.keys(CATEGORY_MAP) as readonly string[];

export type Category = keyof typeof CATEGORY_MAP;

/** Get the Polymarket tag slug for a category label */
export function getCategorySlug(label: string): string {
  return CATEGORY_MAP[label] || label.toLowerCase();
}
