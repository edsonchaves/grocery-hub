import { expect, test, type Browser } from '@playwright/test';

const PASSWORD = 'password1';

async function login(browser: Browser, name: string) {
	const page = await (await browser.newContext()).newPage();
	await page.goto('/login');
	await page.getByLabel(/nome|name/i).fill(name);
	await page.getByLabel(/senha|password/i).fill(PASSWORD);
	await page.getByRole('button', { name: /entrar|log in/i }).click();
	await expect(page).toHaveURL('/');
	return page;
}

test('first run creates the admin', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL('/setup');
	await page.getByLabel('Nome da casa').fill('Casa');
	await page.getByLabel('Nome', { exact: true }).fill('Ana');
	await page.getByLabel('Senha').fill(PASSWORD);
	await page.getByRole('button', { name: 'Criar' }).click();
	await expect(page.getByRole('heading', { name: 'Lista de compras' })).toBeVisible();
});

test('admin invites a member', async ({ browser }) => {
	const admin = await login(browser, 'Ana');
	await admin.goto('/settings');
	await admin.getByRole('button', { name: 'Gerar link de convite' }).click();
	const link = await admin.getByRole('textbox', { name: /Link/ }).inputValue();
	expect(link).toContain('/invite/');

	const member = await (await browser.newContext({ locale: 'de-DE' })).newPage();
	await member.goto(new URL(link).pathname);
	await expect(member.getByRole('heading', { name: 'Haushalt beitreten' })).toBeVisible();
	await member.getByLabel('Name').fill('Bea');
	await member.getByLabel('Passwort').fill(PASSWORD);
	await member.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(member.getByRole('heading', { name: 'Einkaufsliste' })).toBeVisible();
});

test('anonymous login page follows browser language', async ({ browser }) => {
	const page = await (await browser.newContext({ locale: 'de-DE' })).newPage();
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
});

test('anonymous API request gets 401', async ({ request }) => {
	const res = await request.get('/api/list');
	expect(res.status()).toBe(401);
});

test('two members see list changes live', async ({ browser }) => {
	const a = await login(browser, 'Ana');
	const b = await login(browser, 'Bea');

	await a.getByPlaceholder('Adicionar item…').fill('Kaffee');
	await a.keyboard.press('Enter');
	await expect(b.getByRole('checkbox', { name: 'Kaffee' })).toBeVisible({ timeout: 2000 });

	await a.getByRole('checkbox', { name: 'Kaffee' }).check();
	await expect(b.getByRole('checkbox', { name: 'Kaffee' })).toBeChecked({ timeout: 2000 });
});

test('plan a week and prepare shopping', async ({ browser }) => {
	const page = await login(browser, 'Ana');
	await page.goto('/week');
	await page.getByRole('button', { name: 'Planejar semana' }).click();
	await expect(page).toHaveURL(/\/week\/\d{4}-\d{2}-\d{2}$/);

	await page.getByRole('button', { name: '+ Adicionar' }).nth(1).click();
	await page.getByPlaceholder('Prato ou produto…').fill('Strogonoff');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/dishes\/\d+/);

	await page.getByLabel('Qtd').last().fill('400');
	await page.getByPlaceholder('Adicionar ingrediente…').fill('Frango');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Frango')).toBeVisible();
	await page.getByPlaceholder('Adicionar ingrediente…').fill('Creme de leite');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Creme de leite')).toBeVisible();
	await page.getByRole('link', { name: /Voltar/ }).click();

	await expect(page.getByRole('link', { name: 'Strogonoff' })).toBeVisible();
	await page.getByRole('link', { name: /Preparar compra/ }).click();
	const ask = (name: string) => page.getByRole('listitem').filter({ hasText: name });
	await ask('Frango').getByLabel('Não tem').check();
	await ask('Creme de leite').getByLabel('Tem', { exact: true }).check();
	await page.getByRole('button', { name: 'Adicionar à lista' }).click();

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('checkbox', { name: /Frango/ })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: /Creme de leite/ })).toHaveCount(0);
});
