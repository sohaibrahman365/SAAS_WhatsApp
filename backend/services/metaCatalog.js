// META Product Catalog API client
// Fetches products from a Facebook/Instagram catalog via Graph API

const API_VERSION = 'v19.0';
const TIMEOUT = 10000;

// Shared Graph API helper — returns parsed JSON, throws on API errors
async function graphGet(endpoint, accessToken, timeout = TIMEOUT) {
  const url = `https://graph.facebook.com/${API_VERSION}/${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${accessToken}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'META API error');
  return json;
}

async function fetchCatalogProducts(catalogId, accessToken, limit = 100) {
  if (!catalogId || !accessToken) {
    throw new Error('META catalog ID and access token are required');
  }

  const json = await graphGet(
    `${catalogId}/products?fields=id,name,description,price,currency,image_url,url,availability,brand,category&limit=${limit}`,
    accessToken, 15000
  );

  const products = (json.data || []).map(item => ({
    name: item.name,
    description: item.description || null,
    price: parseMetaPrice(item.price),
    currency: item.currency,
    image_url: item.image_url || null,
    image_urls: item.image_url ? [item.image_url] : [],
    source_url: item.url || null,
    categories: item.category ? [item.category] : [],
    meta_product_id: item.id,
    availability: item.availability,
    brand: item.brand,
  }));

  return {
    products,
    paging: json.paging || null,
    total: products.length,
  };
}

function parseMetaPrice(priceStr) {
  if (!priceStr) return null;
  // META returns price as "1999 USD" or "19.99"
  const num = parseFloat(String(priceStr).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

// Extract Page ID from a Facebook page URL
function extractPageIdFromUrl(url) {
  if (!url) return null;
  // Handle formats: facebook.com/pagename, facebook.com/profile.php?id=123, fb.com/123
  const match = url.match(/facebook\.com\/(?:profile\.php\?id=)?([^/?&#]+)/i)
    || url.match(/fb\.com\/([^/?&#]+)/i);
  return match ? match[1] : null;
}

// Resolve a page name/slug to numeric Page ID using Graph API
async function resolvePageId(pageNameOrUrl, accessToken) {
  const pageName = extractPageIdFromUrl(pageNameOrUrl) || pageNameOrUrl;
  if (!pageName || !accessToken) return null;

  try {
    const json = await graphGet(`${pageName}?fields=id,name`, accessToken);
    return { id: json.id, name: json.name };
  } catch {
    return null;
  }
}

// Auto-discover catalog ID from a Page ID
// Tries business-level and page-level catalogs in parallel
async function discoverCatalogId(pageId, accessToken) {
  if (!pageId || !accessToken) return null;

  const catFields = 'fields=id,name,product_count&limit=5';

  // Run business lookup + page-level catalogs in parallel
  const [bizResult, pageResult] = await Promise.allSettled([
    graphGet(`${pageId}?fields=business`, accessToken).then(async (bizJson) => {
      if (!bizJson.business?.id) return [];
      const catJson = await graphGet(`${bizJson.business.id}/owned_product_catalogs?${catFields}`, accessToken);
      return catJson.data || [];
    }),
    graphGet(`${pageId}/product_catalogs?${catFields}`, accessToken).then(json => json.data || []),
  ]);

  // Prefer business-level catalogs, fall back to page-level
  const bizCatalogs = bizResult.status === 'fulfilled' ? bizResult.value : [];
  if (bizCatalogs.length > 0) return bizCatalogs;

  const pageCatalogs = pageResult.status === 'fulfilled' ? pageResult.value : [];
  return pageCatalogs;
}

// One-call lookup: paste FB URL + token → get page ID, catalogs, products
async function autoDiscoverMeta(pageUrl, accessToken) {
  const page = await resolvePageId(pageUrl, accessToken);
  if (!page) {
    return { error: 'Could not resolve Facebook page. Check the URL and token.' };
  }

  const catalogs = await discoverCatalogId(page.id, accessToken);

  let products = [];
  if (catalogs && catalogs.length > 0) {
    // Fetch products from the first catalog
    try {
      const result = await fetchCatalogProducts(catalogs[0].id, accessToken);
      products = result.products;
    } catch (e) {
      console.error('[metaCatalog] Products fetch failed for catalog', catalogs[0].id, e.message);
    }
  }

  return {
    page: { id: page.id, name: page.name },
    catalogs: catalogs || [],
    products,
    total_products: products.length,
  };
}

module.exports = { fetchCatalogProducts, autoDiscoverMeta, resolvePageId, discoverCatalogId };
