// Excel/CSV file parser — extracts product rows from uploaded files
const XLSX = require('xlsx');

// Parse an uploaded file buffer into product rows
function parseProductFile(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheets found in file');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
  if (rows.length === 0) throw new Error('File contains no data rows');

  return rows.map((row, i) => normalizeRow(row, i));
}

// Map common column name variants to our schema
function normalizeRow(row, index) {
  const get = (...keys) => {
    for (const k of keys) {
      const val = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
      if (val !== null && val !== undefined && val !== '') return val;
    }
    return null;
  };

  const name = get('name', 'product_name', 'product name', 'title', 'item', 'product');
  if (!name) return null;

  const price = parseFloat(get('price', 'unit_price', 'unit price', 'cost', 'amount') || '');

  return {
    name: String(name).trim(),
    description: get('description', 'desc', 'details', 'product_description') || null,
    price: isNaN(price) ? null : price,
    image_url: get('image_url', 'image', 'img', 'photo', 'picture', 'image url') || null,
    categories: parseArray(get('categories', 'category', 'tags', 'type')),
    region: get('region') || null,
    country: get('country') || null,
    city: get('city') || null,
    source_url: get('url', 'link', 'source_url', 'product_url') || null,
    _row: index + 2, // Excel row number (1-indexed header + 1)
  };
}

function parseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return String(val).split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

module.exports = { parseProductFile };
