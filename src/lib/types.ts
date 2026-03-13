export interface Token {
  id: string;
  token_id: string;
  outcome: 'Yes' | 'No';
  label?: string;
  price: number;
}

export interface Market {
  id: string;
  condition_id: string;
  question_id: string;
  question: string;
  group_item_title?: string;
  description: string | null;
  category: string;
  tags?: { label: string; slug: string }[];
  slug: string;
  image_url: string | null;
  resolution_source: string | null;
  tokens: Token[];
  minimum_tick_size: number;
  minimum_order_size: number;
  active: boolean;
  closed: boolean;
  resolved: boolean;
  winning_outcome: string | null;
  resolved_at: string | null;
  accepting_orders: boolean;
  end_date_iso: string | null;
  volume: number;
  volume_24hr: number;
  volume_1wk?: number;
  volume_1mo?: number;
  liquidity: number;
  neg_risk?: boolean;
  best_bid?: number;
  best_ask?: number;
  spread?: number;
  last_trade_price?: number;
  price_change_1h?: number;
  price_change_24h?: number;
  price_change_1w?: number;
  price_change_1m?: number;
  competitive?: number;
  comment_count?: number;
  submitted_by?: string;
  created_at: string;
  related_markets?: { id: string; question: string; slug: string; tokens?: Token[]; volume?: number; resolved?: boolean; winning_outcome?: 'Yes' | 'No' | null }[];
}

export interface MatchTeam {
  name: string;
  abbr: string;
  logo: string;
  record?: string;
}

export interface MatchInfo {
  team1: MatchTeam;
  team2: MatchTeam;
  league: string;
  league_logo?: string;
  start_time: string;
  status: 'upcoming' | 'live' | 'final';
  status_detail?: string;
  event_image?: string;
  game_views?: number;
  score?: { team1: number; team2: number };
  best_of?: number;
  market_types: {
    id: string;
    tab?: string;
    label: string;
    volume: number;
    markets: { id: string; label: string; price: number }[];
    slider_values?: number[];
  }[];
}

export interface EventGroup {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  tags?: { label: string; slug: string }[];
  image_url: string | null;
  end_date_iso: string | null;
  volume: number;
  volume_24hr?: number;
  volume_1wk?: number;
  volume_1mo?: number;
  liquidity: number;
  comment_count?: number;
  competitive?: number;
  featured?: boolean;
  open_interest?: number;
  start_date?: string;
  created_at: string;
  markets: Market[];
  live?: boolean;
  reference_price?: number;
  time_windows?: { label: string; slug: string; status?: 'resolved' | 'live' | 'upcoming'; winning_outcome?: string | null }[];
  match?: MatchInfo;
}

export interface Order {
  id: string;
  user_id: string;
  market_id: string;
  token_id: string;
  side: 0 | 1;
  price: number;
  size: number;
  size_matched: number;
  status: string;
  time_in_force: 'GTC' | 'GTD';
  created_at: string;
}

export interface Trade {
  id: string;
  market_id: string;
  token_id: string;
  price: number;
  size: number;
  side: 0 | 1;
  created_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  market_id: string;
  token_id: string;
  shares: number;
  avg_price: number;
  realized_pnl: number;
  question: string;
  slug: string;
  outcome: 'Yes' | 'No';
  current_price: number;
}

export interface User {
  id: string;
  address: string;
  username: string | null;
  created_at: string;
}
