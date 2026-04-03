const express = require('express');
const multer  = require('multer');
const pool    = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { resolveTenantId } = require('../middleware/tenantScope');
const { scrapeProducts }   = require('../services/scraper');
const { parseProductFile } = require('../services/fileParser');
const { fetchCatalogProducts } = require('../services/metaCatalog');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── POST /api/product-imports/scrape ────────────────────────
// Scrape products from a website URL (preview, not saved yet)
router.post('/scrape', requireAuth, requirePermission('products', 'create'), async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const products = await scrapeProducts(url);
    res.json({ source: 'website', url, products, count: products.length });
  } catch (err) {
    if (err.message.includes('Failed to fetch')) {
      return res.status(400).json({ error: `Could not reach URL: ${err.message}` });
    }
    next(err);
  }
});

// ── POST /api/product-imports/upload ────────────────────────
// Parse an uploaded Excel/CSV file (preview, not saved yet)
router.post('/upload', requireAuth, requirePermission('products', 'create'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const products = parseProductFile(req.file.buffer, req.file.originalname);
    const valid = products.filter(Boolean);
    res.json({
      source: 'file',
      filename: req.file.originalname,
      products: valid,
      count: valid.length,
      skipped: products.length - valid.length,
    });
  } catch (err) {
    if (err.message.includes('No sheets') || err.message.includes('no data')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ── POST /api/product-imports/meta ──────────────────────────
// Fetch products from META product catalog (preview)
router.post('/meta', requireAuth, requirePermission('products', 'create'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { catalogId, accessToken } = req.body;

    // Use provided credentials or fall back to tenant settings
    let catId = catalogId;
    let token = accessToken;

    if (!catId || !token) {
      const { rows } = await pool.query(
        'SELECT meta_catalog_id, meta_access_token FROM tenant_settings WHERE tenant_id = $1',
        [tenantId]
      );
      if (rows[0]) {
        catId = catId || rows[0].meta_catalog_id;
        token = token || rows[0].meta_access_token;
      }
    }

    if (!catId || !token) {
      return res.status(400).json({ error: 'META catalog ID and access token are required. Configure them in Settings or provide in request.' });
    }

    const result = await fetchCatalogProducts(catId, token);
    res.json({ source: 'meta', ...result });
  } catch (err) {
    if (err.message.includes('META API')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ── POST /api/product-imports/confirm ───────────────────────
// Save selected products to the database (after preview)
router.post('/confirm', requireAuth, requirePermission('products', 'create'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const { products, source, sourceUrl, fileName } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'No products to import' });
    }

    // Create import record
    const { rows: imports } = await pool.query(`
      INSERT INTO product_imports (tenant_id, source, source_url, file_name, status, total_found, created_by)
      VALUES ($1, $2, $3, $4, 'processing', $5, $6)
      RETURNING *
    `, [tenantId, source || 'website', sourceUrl || null, fileName || null, products.length, req.user.userId]);

    const importId = imports[0].id;
    let imported = 0;

    for (const p of products) {
      try {
        await pool.query(`
          INSERT INTO products (tenant_id, name, price, description, image_url, image_urls, categories, source_url, import_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING
        `, [
          tenantId,
          p.name,
          p.price ?? null,
          p.description || null,
          p.image_url || null,
          JSON.stringify(p.image_urls || []),
          JSON.stringify(p.categories || []),
          p.source_url || null,
          importId,
        ]);
        imported++;
      } catch (err) {
        console.error(`[import] Failed to insert product "${p.name}":`, err.message);
      }
    }

    // Update import record
    await pool.query(`
      UPDATE product_imports SET status = 'completed', total_imported = $1, completed_at = NOW()
      WHERE id = $2
    `, [imported, importId]);

    res.status(201).json({
      import_id: importId,
      total_found: products.length,
      total_imported: imported,
      failed: products.length - imported,
    });
  } catch (err) { next(err); }
});

// ── GET /api/product-imports ────────────────────────────────
// List import history for the tenant
router.get('/', requireAuth, requirePermission('products', 'view'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const { rows } = await pool.query(`
      SELECT pi.*, u.name AS created_by_name
        FROM product_imports pi
        LEFT JOIN users u ON u.id = pi.created_by
       WHERE pi.tenant_id = $1
       ORDER BY pi.created_at DESC
       LIMIT 50
    `, [tenantId]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
