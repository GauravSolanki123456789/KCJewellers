-- B2B Pricelist module (separate from web_products catalogue)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reseller_pricelist_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reseller_pricelist_enabled IS
    'Admin toggle: reseller staff can manage B2B pricelist categories and WhatsApp share links.';

CREATE TABLE IF NOT EXISTS reseller_pricelist_categories (
    id SERIAL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_categories_owner
    ON reseller_pricelist_categories (owner_user_id, sort_order, name);

CREATE TABLE IF NOT EXISTS reseller_pricelist_subcategories (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES reseller_pricelist_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_subcategories_cat
    ON reseller_pricelist_subcategories (category_id, sort_order, name);

CREATE TABLE IF NOT EXISTS reseller_pricelist_products (
    id SERIAL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES reseller_pricelist_categories(id) ON DELETE CASCADE,
    subcategory_id INTEGER NOT NULL REFERENCES reseller_pricelist_subcategories(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    product_slug VARCHAR(255) NOT NULL,
    avg_weight NUMERIC(12, 3),
    slab_rates JSONB NOT NULL DEFAULT '{}'::jsonb,
    image_url TEXT,
    batch_id UUID,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (subcategory_id, product_slug)
);

CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_products_owner
    ON reseller_pricelist_products (owner_user_id, category_id, subcategory_id, is_active);

CREATE TABLE IF NOT EXISTS pricelist_shared_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    product_ids INTEGER[] NOT NULL DEFAULT '{}',
    selected_slab_key VARCHAR(64),
    slab_keys_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    hide_prices BOOLEAN NOT NULL DEFAULT false,
    hide_pdf BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricelist_shared_links_owner
    ON pricelist_shared_links (owner_user_id, created_at DESC);
