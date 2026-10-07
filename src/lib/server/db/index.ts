import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { config } from '../config';
import * as schema from './schema';

export type Db = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;

export function openDb(file: string, migrationsDir = config.migrationsDir): Db {
	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: migrationsDir });
	return db;
}

let instance: Db | undefined;

export function getDb(): Db {
	if (!instance) {
		fs.mkdirSync(config.dataDir, { recursive: true });
		instance = openDb(path.join(config.dataDir, 'grocery-hub.db'));
	}
	return instance;
}
