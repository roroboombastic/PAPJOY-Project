const { Product, Category } = require('../models');
const logger = require('../utils/logger');
const { isEnabled, callGeminiJson, AIError } = require('../utils/gemini');

const MAX_CHAT_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 600;
const CATALOGUE_LIMIT = 80;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function cleanText(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength = 4000) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function cleanList(value, maxItems = 10, maxItemLength = 40) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const text = cleanText(item, maxItemLength).toLowerCase();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function handleError(res, err, context) {
  if (err instanceof AIError) {
    if (err.code === 'ai_not_configured') {
      logger.error('AI rejected the configured key', { context, code: err.code });
    } else if (err.code !== 'rate_limited') {
      logger.warn('AI request failed', { context, code: err.code, error: err.message });
    }
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  logger.error('AI endpoint crashed', { context, error: err.message });
  return res.status(500).json({ error: 'The AI request failed. Please try again.', code: 'ai_failed' });
}

function requireEnabled(res) {
  if (isEnabled()) return true;
  res.status(503).json({
    error: 'AI is not enabled on this store yet.',
    code: 'ai_disabled'
  });
  return false;
}

// ---------------------------------------------------------------------------
// GET /ai/status
// ---------------------------------------------------------------------------

function getStatus(req, res) {
  res.json({
    enabled: isEnabled(),
    features: {
      describe: true,
      generate: true,
      search: true,
      chat: true
    }
  });
}

// ---------------------------------------------------------------------------
// POST /ai/describe  (admin)
// Write copy for a product the admin has already started filling in.
// ---------------------------------------------------------------------------

const DESCRIBE_SYSTEM = `You are a senior e-commerce copywriter for PAP-JOY, an Indian footwear store.
Write copy that is accurate and specific, never hype.

Hard rules:
- Never invent materials, dimensions, certifications, brands, sizes or technologies that were not given to you.
- If a detail is unknown, leave it out rather than guessing.
- No emojis, no exclamation marks, no "revolutionary", "game-changing" or similar.
- Use Indian English spelling and INR context.
- If the product name is in Hindi or another language, write the description in that language.

Return ONLY valid JSON with exactly these keys:
{
  "shortDescription": "one line, max 160 characters",
  "description": "3 to 5 short paragraphs separated by \\n\\n, 120 to 220 words total",
  "tags": ["6 to 10 lowercase tags, single words or short phrases"],
  "seo": {
    "title": "max 60 characters",
    "description": "max 155 characters",
    "keywords": ["5 to 8 lowercase search phrases"]
  }
}`;

async function describeProduct(req, res) {
  if (!requireEnabled(res)) return;

  try {
    const { name, category, brand, price, attributes, existingDescription } = req.body || {};
    const productName = cleanText(name, 200);

    if (!productName) {
      return res.status(400).json({ error: 'A product name is required.', code: 'missing_name' });
    }

    const detailLines = [];
    detailLines.push(`Product name: ${productName}`);
    if (cleanText(category, 80)) detailLines.push(`Category: ${cleanText(category, 80)}`);
    if (cleanText(brand, 80)) detailLines.push(`Brand: ${cleanText(brand, 80)}`);
    if (money(price) > 0) detailLines.push(`Selling price: INR ${money(price)}`);
    if (Array.isArray(attributes)) {
      const attrs = attributes
        .filter((a) => a && cleanText(a.name, 40) && cleanText(a.value, 80))
        .slice(0, 12)
        .map((a) => `${cleanText(a.name, 40)}: ${cleanText(a.value, 80)}`);
      if (attrs.length) detailLines.push(`Known attributes: ${attrs.join('; ')}`);
    }
    if (cleanText(existingDescription, 600)) {
      detailLines.push(`Existing description to improve on: ${cleanText(existingDescription, 600)}`);
    }

    const result = await callGeminiJson({
      system: DESCRIBE_SYSTEM,
      prompt: `Write the product copy for this item.\n\n${detailLines.join('\n')}`,
      temperature: 0.7,
      maxOutputTokens: 1200
    });

    if (!result) {
      return res.status(502).json({ error: 'The AI could not produce usable copy. Please try again.', code: 'ai_bad_output' });
    }

    const seo = result.seo || {};

    res.json({
      shortDescription: cleanText(result.shortDescription, 200),
      description: cleanMultiline(result.description, 2500),
      tags: cleanList(result.tags, 10, 40),
      seo: {
        title: cleanText(seo.title, 70),
        description: cleanText(seo.description, 170),
        keywords: cleanList(seo.keywords, 8, 40)
      }
    });
  } catch (err) {
    handleError(res, err, 'describe');
  }
}

// ---------------------------------------------------------------------------
// POST /ai/generate-product  (admin)
// Turn a sentence into an editable product draft. Nothing is saved here.
// ---------------------------------------------------------------------------

const GENERATE_SYSTEM = `You are a product data assistant for PAP-JOY, an Indian footwear store.
A shop owner describes a product in plain language. Produce a draft product record.

Hard rules:
- Only use details the owner provided. Never invent materials, certifications or specifications.
- Where a detail is missing, write copy that is still true without it.
- No emojis. No hype. Indian English. Prices in INR.
- Leave brand empty unless the owner named a brand.

Return ONLY valid JSON with exactly these keys:
{
  "name": "clear product title, max 90 characters",
  "shortDescription": "one line, max 160 characters",
  "description": "3 to 5 short paragraphs separated by \\n\\n, 100 to 200 words",
  "brand": "brand name or an empty string",
  "categoryName": "the closest matching category from the list provided, or an empty string",
  "suggestedPrice": 0,
  "tags": ["6 to 10 lowercase tags"],
  "seo": {
    "title": "max 60 characters",
    "description": "max 155 characters",
    "keywords": ["5 to 8 lowercase search phrases"]
  }
}`;

async function generateProduct(req, res) {
  if (!requireEnabled(res)) return;

  try {
    const prompt = cleanText((req.body || {}).prompt, 800);
    if (prompt.length < 4) {
      return res.status(400).json({ error: 'Describe the product in a few words first.', code: 'missing_prompt' });
    }

    const categories = await Category.find({ isActive: { $ne: false } })
      .select('name')
      .limit(60)
      .lean();
    const categoryNames = categories.map((c) => c.name).filter(Boolean);

    const result = await callGeminiJson({
      system: GENERATE_SYSTEM,
      prompt: `Available categories: ${categoryNames.join(', ') || 'none'}\n\nOwner's description: ${prompt}`,
      temperature: 0.6,
      maxOutputTokens: 1200
    });

    if (!result) {
      return res.status(502).json({ error: 'The AI could not produce a usable draft. Please try again.', code: 'ai_bad_output' });
    }

    const name = cleanText(result.name, 120);
    if (!name) {
      return res.status(502).json({ error: 'The AI did not return a product name. Please try again.', code: 'ai_bad_output' });
    }

    // Match the suggested category against the real list so the form can select it.
    const wantedCategory = cleanText(result.categoryName, 80).toLowerCase();
    let matchedCategory = '';
    if (wantedCategory) {
      const match = categoryNames.find((c) => String(c).toLowerCase() === wantedCategory)
        || categoryNames.find((c) => String(c).toLowerCase().includes(wantedCategory))
        || categoryNames.find((c) => wantedCategory.includes(String(c).toLowerCase()));
      matchedCategory = match || '';
    }

    const seo = result.seo || {};

    res.json({
      name,
      slug: slugify(name),
      shortDescription: cleanText(result.shortDescription, 200),
      description: cleanMultiline(result.description, 2500),
      brand: cleanText(result.brand, 80),
      categoryName: matchedCategory,
      suggestedPrice: money(result.suggestedPrice) > 0 ? Math.round(money(result.suggestedPrice)) : 0,
      tags: cleanList(result.tags, 10, 40),
      seo: {
        title: cleanText(seo.title, 70),
        description: cleanText(seo.description, 170),
        keywords: cleanList(seo.keywords, 8, 40)
      }
    });
  } catch (err) {
    handleError(res, err, 'generate-product');
  }
}

// ---------------------------------------------------------------------------
// POST /ai/search  (public)
// Translate a sentence into the shop page's existing filter state.
// ---------------------------------------------------------------------------

const SEARCH_SYSTEM = `You convert a shopper's plain-language request into filters for a footwear catalogue.
You must never invent filters that the shopper did not imply.

Return ONLY valid JSON with exactly these keys:
{
  "keywords": "the words to match against product name and description, or an empty string",
  "category": "exactly one category name from the list provided, or an empty string",
  "minPrice": null or a number in INR,
  "maxPrice": null or a number in INR,
  "inStock": true or false,
  "sort": "newest" | "price-asc" | "price-desc" | "rating" | "discount",
  "explanation": "one short sentence describing what you searched for"
}

Rules:
- Only choose a category that appears in the provided list.
- A budget phrased as "under 2000" means maxPrice 2000. "Above 1500" means minPrice 1500.
- "Cheapest" implies sort "price-asc". "Best" or "top rated" implies sort "rating".
- If the shopper says nothing about stock, use inStock false.
- Keep keywords short and generic: colours, styles, occasions.`;

async function searchProducts(req, res) {
  if (!requireEnabled(res)) return;

  try {
    const query = cleanText((req.body || {}).query, 300);
    if (query.length < 2) {
      return res.status(400).json({ error: 'Type what you are looking for.', code: 'missing_query' });
    }

    const categories = await Category.find({ isActive: { $ne: false } })
      .select('name')
      .limit(60)
      .lean();
    const categoryNames = categories.map((c) => c.name).filter(Boolean);

    const result = await callGeminiJson({
      system: SEARCH_SYSTEM,
      prompt: `Categories available: ${categoryNames.join(', ') || 'none'}\n\nShopper request: ${query}`,
      temperature: 0.2,
      maxOutputTokens: 300
    });

    if (!result) {
      return res.status(502).json({ error: 'The AI could not understand that search. Please try again.', code: 'ai_bad_output' });
    }

    const wantedCategory = cleanText(result.category, 80).toLowerCase();
    const matchedCategory = categoryNames.find((c) => String(c).toLowerCase() === wantedCategory) || '';

    const allowedSorts = ['newest', 'price-asc', 'price-desc', 'rating', 'discount'];

    const minPrice = Number(result.minPrice);
    const maxPrice = Number(result.maxPrice);

    res.json({
      filters: {
        keywords: cleanText(result.keywords, 120),
        category: matchedCategory,
        minPrice: Number.isFinite(minPrice) && minPrice > 0 ? Math.round(minPrice) : null,
        maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? Math.round(maxPrice) : null,
        inStock: result.inStock === true,
        sort: allowedSorts.includes(result.sort) ? result.sort : 'newest'
      },
      explanation: cleanText(result.explanation, 160) || `Showing results for "${query}"`
    });
  } catch (err) {
    handleError(res, err, 'search');
  }
}

// ---------------------------------------------------------------------------
// POST /ai/chat  (public)
// Answer using only products that actually exist in the catalogue.
// ---------------------------------------------------------------------------

const CHAT_SYSTEM = `You are the PAP-JOY shopping assistant for an Indian footwear store.
You help shoppers find shoes from the catalogue below and nothing else.

Hard rules:
- ONLY mention products that appear in the catalogue. Never invent a product, price or stock level.
- Prices are in INR. If you mention a price, use the exact price from the catalogue.
- If nothing in the catalogue fits, say so plainly and suggest what to try instead. Do not pretend.
- Never promise delivery dates, discounts or availability that is not in the catalogue.
- Keep the reply under 70 words. Plain text, no markdown, no emojis.
- Reply in the same language the shopper used.

Return ONLY valid JSON with exactly these keys:
{
  "reply": "your answer to the shopper",
  "productIds": ["ids of at most 4 catalogue products you referred to, in order of relevance"]
}`;

async function chat(req, res) {
  if (!requireEnabled(res)) return;

  try {
    const rawMessages = (req.body || {}).messages;
    if (!Array.isArray(rawMessages) || !rawMessages.length) {
      return res.status(400).json({ error: 'No message was sent.', code: 'missing_message' });
    }

    const messages = rawMessages
      .slice(-MAX_CHAT_MESSAGES)
      .map((m) => ({
        role: m && m.role === 'assistant' ? 'assistant' : 'user',
        content: cleanText(m && m.content, MAX_MESSAGE_CHARS)
      }))
      .filter((m) => m.content);

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'No message was sent.', code: 'missing_message' });
    }

    const catalogue = await Product.find({ isActive: { $ne: false } })
      .select('name slug price categoryId brand tags inventory.quantity isFeatured createdAt')
      .populate('categoryId', 'name')
      .sort({ isFeatured: -1, createdAt: -1 })
      .limit(CATALOGUE_LIMIT)
      .lean();

    const catalogueLines = catalogue.map((p) => {
      const categoryName = p.categoryId && p.categoryId.name ? p.categoryId.name : 'Uncategorised';
      const stock = p.inventory && typeof p.inventory.quantity === 'number' ? p.inventory.quantity : 0;
      const tags = Array.isArray(p.tags) && p.tags.length ? ` | ${p.tags.slice(0, 4).join(', ')}` : '';
      const brand = p.brand ? ` | ${p.brand}` : '';
      return `${p._id} | ${p.name} | INR ${money(p.price)} | ${categoryName}${brand} | stock ${stock}${tags}`;
    });

    const conversation = messages
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Shopper'}: ${m.content}`)
      .join('\n');

    const result = await callGeminiJson({
      system: `${CHAT_SYSTEM}\n\nCatalogue (id | name | price | category | stock | tags):\n${catalogueLines.join('\n')}`,
      prompt: conversation,
      temperature: 0.5,
      maxOutputTokens: 500
    });

    if (!result) {
      return res.status(502).json({ error: 'The assistant could not answer that. Please try again.', code: 'ai_bad_output' });
    }

    const byId = new Map(catalogue.map((p) => [String(p._id), p]));
    const products = (Array.isArray(result.productIds) ? result.productIds : [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .slice(0, 4)
      .map((p) => ({
        id: String(p._id),
        slug: p.slug || '',
        name: p.name,
        price: money(p.price),
        brand: p.brand || '',
        category: p.categoryId && p.categoryId.name ? p.categoryId.name : '',
        inStock: !!(p.inventory && p.inventory.quantity > 0)
      }));

    res.json({
      reply: cleanText(result.reply, 800) || 'Sorry, I could not find an answer to that.',
      products
    });
  } catch (err) {
    handleError(res, err, 'chat');
  }
}

module.exports = {
  getStatus,
  describeProduct,
  generateProduct,
  searchProducts,
  chat
};
