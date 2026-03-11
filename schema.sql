-- GainLoft Database Schema
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS event_groups (
  id BIGSERIAL PRIMARY KEY,
  polymarket_id TEXT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'General',
  tags JSONB DEFAULT '[]',
  image_url TEXT,
  end_date_iso TEXT,
  volume NUMERIC DEFAULT 0,
  volume_24hr NUMERIC DEFAULT 0,
  liquidity NUMERIC DEFAULT 0,
  neg_risk BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_groups_polymarket_id
  ON event_groups (polymarket_id) WHERE polymarket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS markets (
  id BIGSERIAL PRIMARY KEY,
  polymarket_id TEXT,
  condition_id TEXT,
  question TEXT NOT NULL,
  group_item_title TEXT,
  description TEXT,
  category TEXT DEFAULT 'General',
  tags JSONB DEFAULT '[]',
  slug TEXT UNIQUE NOT NULL,
  image_url TEXT,
  resolution_source TEXT,
  minimum_tick_size NUMERIC DEFAULT 0.01,
  minimum_order_size NUMERIC DEFAULT 5,
  active BOOLEAN DEFAULT true,
  closed BOOLEAN DEFAULT false,
  resolved BOOLEAN DEFAULT false,
  accepting_orders BOOLEAN DEFAULT true,
  winning_outcome TEXT,
  resolved_at TIMESTAMPTZ,
  end_date_iso TEXT,
  volume NUMERIC DEFAULT 0,
  volume_24hr NUMERIC DEFAULT 0,
  liquidity NUMERIC DEFAULT 0,
  neg_risk BOOLEAN DEFAULT false,
  event_group_id BIGINT REFERENCES event_groups(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_polymarket_id
  ON markets (polymarket_id) WHERE polymarket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tokens (
  id BIGSERIAL PRIMARY KEY,
  market_id BIGINT NOT NULL REFERENCES markets(id),
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  price NUMERIC DEFAULT 0.5,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (market_id, outcome),
  UNIQUE (token_id)
);

CREATE INDEX IF NOT EXISTS idx_tokens_market_id ON tokens(market_id);
CREATE INDEX IF NOT EXISTS idx_markets_event_group_id ON markets(event_group_id);
CREATE INDEX IF NOT EXISTS idx_markets_slug ON markets(slug);
CREATE INDEX IF NOT EXISTS idx_event_groups_slug ON event_groups(slug);
