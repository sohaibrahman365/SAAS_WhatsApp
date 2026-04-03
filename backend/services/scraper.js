// Website product scraper — extracts product data from URLs using cheerio
const cheerio = require('cheerio');

// URL path segments to ignore when extracting categories
const NON_CATEGORY_SEGMENTS = new Set([
  'products', 'product', 'shop', 'store', 'p', 'item', 'items',
  'collections', 'collection', 'catalog', 'catalogue', 'buy',
  'detail', 'details', 'dp', 'gp', 'www', 'en', 'us', 'uk',
  'pages', 'page', 'index', 'home', 'search', 'cart', 'checkout',
]);

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GeniSearchBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

// Extract categories from URL path segments
// e.g. /electronics/phones/product.html → ["electronics", "phones"]
function extractCategoriesFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split('/').filter(Boolean);
    // Drop the last segment (usually the product page itself)
    if (segments.length > 0) segments.pop();
    return segments
      .map(s => s.replace(/[-_]/g, ' ').replace(/\.\w+$/, '').trim())
      .filter(s => s.length > 1 && !NON_CATEGORY_SEGMENTS.has(s.toLowerCase()));
  } catch {
    return [];
  }
}

// Top-level category extraction helper — tries multiple page-level signals
function extractPageCategories($, url) {
  const categories = [];

  // 1. Breadcrumb navigation
  const breadcrumbSelectors = [
    'nav[aria-label="breadcrumb"]',
    '.breadcrumb',
    '.breadcrumbs',
    '[class*="breadcrumb"]',
    'ol.breadcrumb',
    'ul.breadcrumb',
  ];
  for (const sel of breadcrumbSelectors) {
    const $bc = $(sel).first();
    if ($bc.length) {
      $bc.find('li, a, span').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 1 && !/home|main|all/i.test(text)) {
          categories.push(text);
        }
      });
      if (categories.length > 0) break;
    }
  }

  // Deduplicate breadcrumb entries (child elements often repeat parent text)
  const seen = new Set();
  const deduped = [];
  for (const cat of categories) {
    const key = cat.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(cat);
    }
  }
  if (deduped.length > 0) return deduped;

  // 2. Fall back to URL path segments
  const urlCats = extractCategoriesFromUrl(url);
  if (urlCats.length > 0) return urlCats;

  return [];
}

// Extract product-like data from a webpage
async function scrapeProducts(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const products = [];

  // Collect breadcrumb categories from JSON-LD (shared across products on page)
  let jsonLdBreadcrumbs = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of items) {
        if (item['@type'] === 'BreadcrumbList' && Array.isArray(item.itemListElement)) {
          const crumbs = item.itemListElement
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .map(e => e.name || e.item?.name)
            .filter(n => n && !/home|main|all/i.test(n));
          if (crumbs.length > 0) jsonLdBreadcrumbs = crumbs;
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  });

  // Strategy 1: JSON-LD structured data (most reliable)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type'] === 'IndividualProduct') {
          // Extract categories from JSON-LD product fields
          const itemCategories = [];
          if (item.category) {
            const cats = Array.isArray(item.category) ? item.category : [item.category];
            for (const c of cats) {
              const text = typeof c === 'string' ? c : c.name;
              if (text) itemCategories.push(text);
            }
          }
          if (item.productGroup) {
            itemCategories.push(item.productGroup);
          }
          // Use breadcrumb JSON-LD as fallback, then page-level extraction
          const categories = itemCategories.length > 0
            ? itemCategories
            : jsonLdBreadcrumbs.length > 0
              ? jsonLdBreadcrumbs
              : extractPageCategories($, url);

          products.push({
            name: item.name,
            description: item.description,
            price: parsePrice(item.offers?.price || item.offers?.[0]?.price),
            currency: item.offers?.priceCurrency || item.offers?.[0]?.priceCurrency,
            image_url: Array.isArray(item.image) ? item.image[0] : item.image,
            image_urls: Array.isArray(item.image) ? item.image : item.image ? [item.image] : [],
            categories,
            source_url: url,
            source: 'json-ld',
          });
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  });

  if (products.length > 0) return products;

  // Strategy 2: Open Graph meta tags (single product pages)
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const ogDesc = $('meta[property="og:description"]').attr('content');
  const ogPrice = $('meta[property="product:price:amount"]').attr('content');

  if (ogTitle && (ogImage || ogPrice)) {
    // Extract category from OG / product meta tags
    const ogCategories = [];
    const productCategory = $('meta[property="product:category"]').attr('content');
    if (productCategory) ogCategories.push(productCategory);
    const ogType = $('meta[property="og:type"]').attr('content');
    if (ogType && ogType !== 'product' && ogType !== 'website') ogCategories.push(ogType);
    const categories = ogCategories.length > 0 ? ogCategories : extractPageCategories($, url);

    products.push({
      name: ogTitle,
      description: ogDesc,
      price: parsePrice(ogPrice),
      image_url: resolveUrl(url, ogImage),
      image_urls: ogImage ? [resolveUrl(url, ogImage)] : [],
      categories,
      source_url: url,
      source: 'og-meta',
    });
    return products;
  }

  // Strategy 3: Common CSS selectors for product grids
  const pageCats = extractPageCategories($, url);
  const selectors = [
    '.product', '.product-card', '.product-item',
    '[data-product]', '.wc-block-grid__product',
    '.shopify-section .product-card', '.grid__item',
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const name = $el.find('h2, h3, h4, .product-title, .product-name, .card-title').first().text().trim();
      const img = $el.find('img').first();
      const imgSrc = img.attr('data-src') || img.attr('src');
      const priceText = $el.find('.price, .product-price, .amount, [class*="price"]').first().text().trim();
      const link = $el.find('a').first().attr('href');

      if (name && name.length > 2) {
        // Per-element category extraction
        const elCategories = [];
        // Check data-category attribute on the product container
        const dataCat = $el.attr('data-category') || $el.closest('[data-category]').attr('data-category');
        if (dataCat) elCategories.push(dataCat);
        // Check nearby category elements
        const catEl = $el.find('.product-category, .category, .product-type').first().text().trim();
        if (catEl) elCategories.push(catEl);
        const categories = elCategories.length > 0 ? elCategories : pageCats;

        products.push({
          name,
          description: $el.find('.description, .product-description, p').first().text().trim() || null,
          price: parsePrice(priceText),
          image_url: resolveUrl(url, imgSrc),
          image_urls: imgSrc ? [resolveUrl(url, imgSrc)] : [],
          categories,
          source_url: link ? resolveUrl(url, link) : url,
          source: 'css-selector',
        });
      }
    });
    if (products.length > 0) break;
  }

  // Strategy 4: Fallback — grab all images with alt text as potential products
  if (products.length === 0) {
    const urlCats = extractCategoriesFromUrl(url);
    $('img[alt]').each((_, el) => {
      const $img = $(el);
      const alt = $img.attr('alt')?.trim();
      const src = $img.attr('data-src') || $img.attr('src');
      if (alt && alt.length > 3 && src && !src.includes('logo') && !src.includes('icon')) {
        // Try to extract category from the image src path as well
        const imgCats = extractCategoriesFromUrl(resolveUrl(url, src) || url);
        const categories = imgCats.length > 0 ? imgCats : urlCats;

        products.push({
          name: alt,
          description: null,
          price: null,
          image_url: resolveUrl(url, src),
          image_urls: src ? [resolveUrl(url, src)] : [],
          categories,
          source_url: url,
          source: 'img-alt-fallback',
        });
      }
    });
  }

  return products;
}

function parsePrice(val) {
  if (!val) return null;
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function resolveUrl(base, relative) {
  if (!relative) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

module.exports = { scrapeProducts };
