import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	// one shared database: the setup test must run first
	workers: 1,
	use: { baseURL: 'http://localhost:4173', ...devices['Pixel 7'], locale: 'pt-BR' },
	webServer: {
		command: 'rm -rf test-results/e2e-data && npm run build && npm run preview -- --port 4173',
		port: 4173,
		env: { DATA_DIR: 'test-results/e2e-data', TZ: 'UTC' }
	}
});
