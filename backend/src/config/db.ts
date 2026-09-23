import mysql from 'mysql2/promise';
import { env } from './env';

let pool: mysql.Pool | null = null;

/** Shared MySQL connection pool (users / roles / user_roles for Stage 5A). */
export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      // DB identifiers are trusted (migrations); values always parameterised.
      namedPlaceholders: false,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
