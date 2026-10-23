const {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_FALLBACK_MODELS,
  AI_TIMEOUT_MS,
  AI_ENABLED
} = require('../config');
const logger = require('./logger');

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Error type that carries the HTTP status the API should answer with, so a
 * provider failure never surfaces to the browser as an opaque 500.
 */
class AIError extends Error {
  constructor(message, status = 502, code = 'ai_error') {
    super(message);
    this.name = 'AIError';
    this.status = status;
    this.code = code;
  }
}

function isEnabled() {
  return AI_ENABLED;
}

function modelsToTry() {
  const list = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(Boolean);
  return [...new Set(list)];
}

/** Gemini occasionally wraps JSON in a fenced block despite the mime type. */
function extractJson(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first > 0 || last < cleaned.length - 1) {
    if (first !== -1 && last !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return null;
  }
}

function classify(error) {
  const providerStatus = Number(error && error.status) || 0;
  const message = String((error && error.message) || '');

  if (providerStatus === 429) {
    return new AIError('The AI is busy right now. Please try again in a moment.', 429, 'rate_limited');
  }
  if (providerStatus === 401 || providerStatus === 403) {
    return new AIError('The AI service is not configured correctly.', 503, 'ai_not_configured');
  }
  if (providerStatus === 400 && /api key|api_key/i.test(message)) {
    return new AIError('The AI service is not configured correctly.', 503, 'ai_not_configured');
  }
  if (providerStatus === 404) {
    // Let the caller fall through to the next model in the list.
    return null;
  }
  return new AIError('The AI could not answer that. Please try again.', 502, 'ai_failed');
}

async function requestModel(model, { prompt, system, json, temperature, maxOutputTokens, schema }) {
  if (!GEMINI_API_KEY) {
    throw new AIError('AI is not enabled on this store.', 503, 'ai_disabled');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  if (json) {
    body.generationConfig.responseMimeType = 'application/json';
    if (schema) body.generationConfig.responseSchema = schema;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_ROOT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const apiError = new Error(
        (payload && payload.error && payload.error.message) || `Gemini responded ${res.status}`
      );
      apiError.status = res.status;
      throw apiError;
    }

    const candidate = payload && payload.candidates && payload.candidates[0];
    const parts = (candidate && candidate.content && candidate.content.parts) || [];
    const output = parts.map((p) => p && p.text ? p.text : '').join('').trim();

    if (!output) {
      const reason = (candidate && candidate.finishReason) || 'empty response';
      throw new AIError(`The AI returned no answer (${reason}).`, 502, 'ai_empty');
    }

    return output;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new AIError('The AI took too long to answer. Please try again.', 504, 'ai_timeout');
    }
    if (err instanceof AIError) throw err;
    const mapped = classify(err);
    if (mapped) throw mapped;
    // 404 from this model: signal the caller to try the next one.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask Gemini and return plain text.
 * Falls through the model list when a model is unavailable, so a retired
 * model name does not break the feature.
 */
async function callGemini(options = {}) {
  const {
    prompt,
    system = '',
    json = false,
    temperature = 0.6,
    maxOutputTokens = 900,
    schema
  } = options;

  if (!prompt || !String(prompt).trim()) {
    throw new AIError('Nothing was sent to the AI.', 400, 'empty_prompt');
  }

  const models = modelsToTry();
  let lastError = null;

  for (const model of models) {
    try {
      const output = await requestModel(model, { prompt, system, json, temperature, maxOutputTokens, schema });
      if (output) return output;
    } catch (err) {
      lastError = err;
      // Only a "model missing" condition is worth retrying with another model.
      if (err instanceof AIError && (err.code === 'ai_not_configured' || err.code === 'rate_limited')) {
        throw err;
      }
      if (err instanceof AIError && err.status === 404) {
        continue;
      }
      throw err;
    }
  }

  if (lastError) throw lastError;
  throw new AIError('The AI is unavailable right now.', 502, 'ai_unavailable');
}

/** Ask Gemini for structured JSON, returning null when it cannot be parsed. */
async function callGeminiJson(options = {}) {
  const output = await callGemini({ ...options, json: true });
  const parsed = extractJson(output);
  if (!parsed) {
    logger.warn('AI returned unparseable JSON', { preview: String(output).slice(0, 200) });
  }
  return parsed;
}

module.exports = {
  AIError,
  isEnabled,
  callGemini,
  callGeminiJson
};
