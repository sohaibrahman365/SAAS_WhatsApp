// Website product scraper — extracts product data from URLs using cheerio
const cheerio = require('cheerio');

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

// Extract product-like data from a webpage
async function scrapeProducts(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const products = [];

  // Strategy 1: JSON-LD structured data (most reliable)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type'] === 'IndividualProduct') {
          products.push({
            name: item.name,
            description: item.description,
            price: parsePrice(item.offers?.price || item.offers?.[0]?.price),
            currency: item.offers?.priceCurrency || item.offers?.[0]?.priceCurrency,
            image_url: Array.isArray(item.image) ? item.image[0] : item.image,
            image_urls: Array.isArray(item.image) ? item.image : item.image ? [item.image] : [],
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
    products.push({
      name: ogTitle,
      description: ogDesc,
      price: parsePrice(ogPrice),
      image_url: resolveUrl(url, ogImage),
      image_urls: ogImage ? [resolveUrl(url, ogImage)] : [],
      source_url: url,
      source: 'og-meta',
    });
    return products;
  }

  // Strategy 3: Common CSS selectors for product grids
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
        products.push({
          name,
          description: $el.find('.description, .product-description, p').first().text().trim() || null,
          price: parsePrice(priceText),
          image_url: resolveUrl(url, imgSrc),
          image_urls: imgSrc ? [resolveUrl(url, imgSrc)] : [],
          source_url: link ? resolveUrl(url, link) : url,
          source: 'css-selector',
        });
      }
    });
    if (products.length > 0) break;
  }

  // Strategy 4: Fallback — grab all images with alt text as potential products
  if (products.length === 0) {
    $('img[alt]').each((_, el) => {
      const $img = $(el);
      const alt = $img.attr('alt')?.trim();
      const src = $img.attr('data-src') || $img.attr('src');
      if (alt && alt.length > 3 && src && !src.includes('logo') && !src.includes('icon')) {
        products.push({
          name: alt,
          description: null,
          price: null,
          image_url: resolveUrl(url, src),
          image_urls: src ? [resolveUrl(url, src)] : [],
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
