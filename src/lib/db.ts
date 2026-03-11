import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL || 'postgres://rexyap@localhost:5432/gainloft';
const isSupabase = dbUrl.includes('supabase');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
  max: isSupabase ? 5 : 10,
});

export default pool;
