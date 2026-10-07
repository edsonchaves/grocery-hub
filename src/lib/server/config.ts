import path from 'node:path';

const env = process.env;

export const config = {
	dataDir: path.resolve(env.DATA_DIR ?? './data'),
	migrationsDir: path.resolve(env.MIGRATIONS_DIR ?? './drizzle'),
	publicUrl: env.PUBLIC_URL ?? '',
	anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
	anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
};
