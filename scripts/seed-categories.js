const { initDatabase, query } = require('../config/database');

async function upsertCategory(name, slug, parentId = null) {
  const rows = await query(
    `INSERT INTO categories (name, slug, parent_id, created_at, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name, slug, parentId]
  );
  return rows[0];
}

async function main() {
  await initDatabase();
  const idols = await upsertCategory('Idols', 'idols', null);
  const ganesh = await upsertCategory('Ganesh', 'ganesh', idols.id);
  const standing = await upsertCategory('Standing Ganesh', 'standing-ganesh', ganesh.id);
  const products = await query(
    `SELECT id FROM products WHERE COALESCE(category_id, 0) = 0 ORDER BY id ASC LIMIT 12`
  );
  if (products.length > 0) {
    const ids = products.map(p => p.id);
    await query(
      `UPDATE products SET category_id = $1 WHERE id = ANY($2::int[])`,
      [standing.id, ids]
    );
  }
  console.log(JSON.stringify({ idols: idols.id, ganesh: ganesh.id, standing: standing.id, assigned: products.length }));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

