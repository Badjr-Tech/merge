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

// Gemini 2.5 models think before answering, and those hidden thinking tokens come out of the
// same maxOutputTokens budget as the reply. Measured: a 252-token cap was spent 238 on
// thinking, leaving 10 for the answer, which arrived as four words.
//
// thinkingConfig.thinkingBudget is sent but this SDK version does not reliably pass it on —
// the same call reports hundreds of thinking tokens with it set. So the cap itself has to
// carry the cost: THINKING_ALLOWANCE is added to whatever the caller asks for. Billing is on
// tokens actually produced, so a ceiling that is never reached costs nothing.
const THINKING_ALLOWANCE = 2000;

function getModel(name, options) {
  const opts = options || {};
  const caller = opts.generationConfig || {};
  const generationConfig = {
    thinkingConfig: { thinkingBudget: 0 },
    ...caller,
    ...(caller.maxOutputTokens ? { maxOutputTokens: caller.maxOutputTokens + THINKING_ALLOWANCE } : {}),
  };
  return client().getGenerativeModel({ model: name, ...opts, generationConfig });
}

async function generateText(prompt, options) {
  return withModel(async (name) => {
    const model = getModel(name, options);
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}

async function chatReply({ systemInstruction, history, message, generationConfig }) {
  return withModel(async (name) => {
    const model = getModel(name, { systemInstruction, ...(generationConfig ? { generationConfig } : {}) });
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    return result.response.text();
  });
}

// Streams the reply: onChunk(text) is called as Gemini produces it. Resolves with the full text.
// onFinish({ finishReason }) fires once the stream ends. 'MAX_TOKENS' means the model was
// cut off mid-thought rather than finishing, which the caller needs to know so it does not
// present half a sentence as a finished draft.
async function chatReplyStream({ systemInstruction, history, message, onChunk, onFinish, generationConfig }) {
  return withModel(async (name) => {
    const model = getModel(name, { systemInstruction, ...(generationConfig ? { generationConfig } : {}) });
    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(message);
    let full = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) { full += text; onChunk(text); }
    }
    if (onFinish) {
      let finishReason = null;
      try {
        const response = await result.response;
        finishReason = (response.candidates || [])[0]?.finishReason || null;
      } catch { /* the text is what matters; the reason is a nicety */ }
      onFinish({ finishReason });
    }
    return full;
  });
}

module.exports = { withModel, getModel, generateText, chatReply, chatReplyStream, CANDIDATES };
