// Gemini access with model fallback. Google retires model names over time; try the configured
// model first, then a list of current alternatives, and remember the first one that works.
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CANDIDATES = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash',
].filter(Boolean);

let working = null;

function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Fall through to the next model when this one is missing OR when its quota is exhausted
// (Google's free tier gives each model its own quota; some models have none at all).
function isModelMissing(err) {
  const status = err && (err.status || (err.response && err.response.status));
  const msg = String(err && err.message || '');
  return status === 404 || status === 429 || /not found|is not supported|no longer available|deprecated|quota|resource has been exhausted/i.test(msg);
}

// run(modelName => Promise<result>) — tries each candidate model until one succeeds.
async function withModel(run) {
  const order = working ? [working, ...CANDIDATES.filter(m => m !== working)] : CANDIDATES;
  let lastErr;
  for (const name of order) {
    try {
      const result = await run(name);
      working = name;
      return result;
    } catch (err) {
      lastErr = err;
      if (!isModelMissing(err)) throw err;
      console.warn(`Gemini model "${name}" unavailable, trying next.`);
    }
  }
  if (lastErr && (lastErr.status === 429 || /quota/i.test(String(lastErr.message)))) {
    const e = new Error('The AI service is over its usage limit right now. Try again in a minute, or check the Gemini API billing for this key.');
    e.status = 429;
    throw e;
  }
  throw lastErr || new Error('No Gemini model available');
}

function getModel(name, options) {
  return client().getGenerativeModel({ model: name, ...(options || {}) });
}

async function generateText(prompt, options) {
  return withModel(async (name) => {
    const model = getModel(name, options);
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}

async function chatReply({ systemInstruction, history, message }) {
  return withModel(async (name) => {
    const model = getModel(name, { systemInstruction });
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    return result.response.text();
  });
}

// Streams the reply: onChunk(text) is called as Gemini produces it. Resolves with the full text.
async function chatReplyStream({ systemInstruction, history, message, onChunk }) {
  return withModel(async (name) => {
    const model = getModel(name, { systemInstruction });
    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(message);
    let full = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) { full += text; onChunk(text); }
    }
    return full;
  });
}

module.exports = { withModel, getModel, generateText, chatReply, chatReplyStream, CANDIDATES };
