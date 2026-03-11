import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://rexyap@localhost:5432/gainloft',
});

export default pool;
