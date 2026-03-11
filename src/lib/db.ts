import { Pool, types } from 'pg';

const dbUrl = process.env.DATABASE_URL || 'postgres://rexyap@localhost:5432/gainloft';
const isSupabase = dbUrl.includes('supabase');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  max: isSupabase ? 3 : 10,
});

// For Supabase transaction pooler: wrap query to avoid named prepared statements
const _query = pool.query.bind(pool);
pool.query = function (text: any, values?: any) {
  if (typeof text === 'string') {
    return _query({ text, values, name: '' });
  }
  if (text && typeof text === 'object' && text.text) {
    return _query({ ...text, name: '' });
  }
  return _query(text, values);
};

export default pool;
