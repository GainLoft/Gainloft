import { Pool, QueryConfig } from 'pg';

const dbUrl = process.env.DATABASE_URL || 'postgres://rexyap@localhost:5432/gainloft';
const isSupabase = dbUrl.includes('supabase');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  max: isSupabase ? 3 : 10,
});

// Wrap pool.query to disable prepared statements for Supabase transaction pooler
const originalQuery = pool.query.bind(pool) as typeof pool.query;
if (isSupabase) {
  // @ts-expect-error - override query to disable prepared statements
  pool.query = (textOrConfig: string | QueryConfig, values?: any[]) => {
    if (typeof textOrConfig === 'string') {
      return originalQuery({ text: textOrConfig, values, name: undefined } as QueryConfig);
    }
    return originalQuery({ ...textOrConfig, name: undefined } as QueryConfig);
  };
}

export default pool;
