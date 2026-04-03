// META Product Catalog API client
// Fetches products from a Facebook/Instagram catalog via Graph API

const API_VERSION = 'v19.0';

async function fetchCatalogProducts(catalogId, accessToken, limit = 100) {
  if (!catalogId || !accessToken) {
    throw new Error('META catalog ID and access token are required');
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${catalogId}/products?fields=id,name,description,price,currency,image_url,url,availability,brand,category&limit=${limit}&access_token=${accessToken}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();

  if (json.error) {
    throw new Error(json.error.message || 'META API error');
  }

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

module.exports = { fetchCatalogProducts };
