import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL || 'postgres://rexyap@localhost:5432/gainloft';
const isSupabase = dbUrl.includes('supabase');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  max: isSupabase ? 3 : 10,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// For Supabase transaction pooler: patch each client to use unnamed prepared statements
// This prevents pg from caching prepared statements that break across PgBouncer connections
if (isSupabase) {
  pool.on('connect', (client) => {
    const origQuery = client.query.bind(client);
    client.query = function (text: any, values?: any, callback?: any) {
      if (typeof text === 'string') {
        return origQuery({ text, values, name: '' }, callback);
      }
      if (text && typeof text === 'object' && text.text) {
        return origQuery({ ...text, name: '' }, values, callback);
      }
      return origQuery(text, values, callback);
    } as any;
  });
}

export default pool;
