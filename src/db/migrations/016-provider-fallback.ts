import type Database from 'better-sqlite3';

import type { Migration } from './index.js';

export const migration016: Migration = {
  version: 16,
  name: 'provider-fallback',
  up(db: Database.Database) {
    try {
      db.exec(`ALTER TABLE container_configs ADD COLUMN provider_fallback TEXT`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  },
};
