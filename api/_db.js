// api/_db.js
// Shared Neon/Postgres access. Exposed as methods on a plain object (not bare
// named function exports) specifically so tests can mock them via Node's
// built-in `node:test` mock.method(db, 'query', ...) / mock.method(db, 'withTransaction', ...)
// without a mocking framework or module-loader trickery.

import pg from "pg";

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export const db = {
  // Single query, outside any explicit transaction.
  async query(text, params) {
    return getPool().query(text, params);
  },

  // Runs `fn` with a dedicated client inside BEGIN/COMMIT, rolling back on
  // any thrown error. `fn` receives an object with the same `query` shape,
  // so callers don't need to know about pg's client/pool distinction.
  async withTransaction(fn) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await fn({ query: (text, params) => client.query(text, params) });
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Rollback failing (e.g. connection already dead) is not itself
        // actionable here; the original error is what matters to the caller.
      }
      throw err;
    } finally {
      client.release();
    }
  },
};
