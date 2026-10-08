import { sql } from 'drizzle-orm';
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { LOCALES } from '../../i18n/locales';
import { PANTRY_STATUSES } from '../../types';

const id = () => integer('id').primaryKey({ autoIncrement: true });
const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch('subsec') * 1000)`);
const householdId = () =>
	integer('household_id')
		.notNull()
		.references(() => households.id, { onDelete: 'cascade' });

export const households = sqliteTable('households', {
	id: id(),
	name: text('name').notNull(),
	widgetToken: text('widget_token').notNull(),
	createdAt: createdAt()
});

export const users = sqliteTable(
	'users',
	{
		id: id(),
		householdId: householdId(),
		name: text('name').notNull(),
		passwordHash: text('password_hash').notNull(),
		isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
		locale: text('locale', { enum: LOCALES }).notNull().default('pt'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('users_name_unique').on(sql`lower(${t.name})`)]
);

export const sessions = sqliteTable('sessions', {
	// sha256 of the cookie token, so a leaked DB doesn't leak live sessions
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

export const invites = sqliteTable('invites', {
	id: text('id').primaryKey(),
	householdId: householdId(),
	createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	usedAt: integer('used_at', { mode: 'timestamp_ms' }),
	createdAt: createdAt()
});

export const categories = sqliteTable('categories', {
	id: id(),
	householdId: householdId(),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const products = sqliteTable(
	'products',
	{
		id: id(),
		householdId: householdId(),
		name: text('name').notNull(),
		categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
		unit: text('unit'),
		ean: text('ean'),
		createdAt: createdAt()
	},
	(t) => [index('products_household').on(t.householdId)]
);

export const stores = sqliteTable(
	'stores',
	{
		id: id(),
		householdId: householdId(),
		name: text('name').notNull()
	},
	(t) => [uniqueIndex('stores_name_unique').on(t.householdId, sql`lower(${t.name})`)]
);

export const productAliases = sqliteTable(
	'product_aliases',
	{
		id: id(),
		householdId: householdId(),
		storeId: integer('store_id')
			.notNull()
			.references(() => stores.id, { onDelete: 'cascade' }),
		normalizedName: text('normalized_name').notNull(),
		productId: integer('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' })
	},
	(t) => [uniqueIndex('aliases_unique').on(t.householdId, t.storeId, t.normalizedName)]
);

export const listItems = sqliteTable(
	'list_items',
	{
		id: id(),
		householdId: householdId(),
		productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }),
		text: text('text'),
		qty: text('qty'),
		note: text('note'),
		checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
		checkedAt: integer('checked_at', { mode: 'timestamp_ms' }),
		createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('list_items_household').on(t.householdId)]
);

export const pantryStatus = sqliteTable('pantry_status', {
	productId: integer('product_id')
		.primaryKey()
		.references(() => products.id, { onDelete: 'cascade' }),
	householdId: householdId(),
	status: text('status', { enum: PANTRY_STATUSES }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	lastRestockAt: integer('last_restock_at', { mode: 'timestamp_ms' })
});

export const RECEIPT_STATUSES = ['pending', 'parsed', 'failed', 'confirmed'] as const;
export const RECEIPT_PARSERS = ['rewe-ebon', 'rewe-online', 'vision'] as const;

export const receipts = sqliteTable('receipts', {
	id: id(),
	householdId: householdId(),
	uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
	kind: text('kind', { enum: ['pdf', 'photo'] }).notNull(),
	files: text('files', { mode: 'json' }).$type<string[]>().notNull(),
	status: text('status', { enum: RECEIPT_STATUSES }).notNull().default('pending'),
	rawOutput: text('raw_output'),
	parsed: text('parsed', { mode: 'json' }),
	parser: text('parser', { enum: RECEIPT_PARSERS }),
	error: text('error'),
	createdAt: createdAt()
});

export const purchases = sqliteTable(
	'purchases',
	{
		id: id(),
		householdId: householdId(),
		storeId: integer('store_id')
			.notNull()
			.references(() => stores.id),
		purchasedAt: integer('purchased_at', { mode: 'timestamp_ms' }).notNull(),
		totalCents: integer('total_cents').notNull(),
		receiptId: integer('receipt_id').references(() => receipts.id, { onDelete: 'set null' }),
		createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index('purchases_household_date').on(t.householdId, t.purchasedAt)]
);

export const LINE_KINDS = ['item', 'pfand', 'discount', 'fee'] as const;

export const purchaseLines = sqliteTable(
	'purchase_lines',
	{
		id: id(),
		purchaseId: integer('purchase_id')
			.notNull()
			.references(() => purchases.id, { onDelete: 'cascade' }),
		productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
		kind: text('kind', { enum: LINE_KINDS }).notNull().default('item'),
		rawName: text('raw_name').notNull(),
		qty: real('qty').notNull().default(1),
		unit: text('unit'),
		lineCents: integer('line_cents').notNull(),
		// negative or zero; already-applied discounts attached to this item
		discountCents: integer('discount_cents').notNull().default(0)
	},
	(t) => [index('purchase_lines_product').on(t.productId)]
);

export const suggestionDismissals = sqliteTable(
	'suggestion_dismissals',
	{
		householdId: householdId(),
		productId: integer('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' }),
		dismissedAt: integer('dismissed_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.householdId, t.productId] })]
);
