// Gemini access with model fallback. Google retires model names over time; try the configured
// model first, then a list of current alternatives, and remember the first one that works.
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Every one of these was confirmed working against this project's key. The 2.x names that
// used to head this list now return 404 with "no longer available to new users" — they were
// still in the models listing, so only an actual generateContent call reveals it. Google's
// own error names gemini-3.8-flash as the replacement.
const CANDIDATES = [
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
].filter(Boolean);

let working = null;
// Models this key cannot use at all. A 404 will not change within the life of a process, so
// it is learned once instead of costing a failed round trip on every call.
const missing = new Set();

function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Both of these mean "try the next model", but they mean different things afterwards: a
// missing model is gone for good, while an exhausted quota refills. Treating them alike is
// what quietly pinned this app to an older model.
function errKind(err) {
  const status = err && (err.status || (err.response && err.response.status));
  const msg = String((err && err.message) || '');
  if (status === 404 || /not found|is not supported|no longer available|deprecated/i.test(msg)) return 'missing';
  if (status === 429 || /quota|resource has been exhausted|rate limit/i.test(msg)) return 'quota';
  return 'other';
}

// run(modelName => Promise<result>) — tries each candidate model until one succeeds.
async function withModel(run) {
  const order = (working ? [working, ...CANDIDATES.filter(m => m !== working)] : CANDIDATES)
    .filter(m => !missing.has(m));
  let lastErr;
  let fellBackOnQuota = false;
  for (const name of order) {
    try {
      const result = await run(name);
      // Only remember a model that answered on its own merits. One reached by falling past an
      // exhausted quota is a stand-in for this call, not the model to prefer from now on —
      // remembering it is how a temporary limit turned into a permanent downgrade.
      if (!fellBackOnQuota) working = name;
      return result;
    } catch (err) {
      lastErr = err;
      const kind = errKind(err);
      if (kind === 'other') throw err;
      if (working === name) working = null;
      if (kind === 'missing') {
        missing.add(name);
        console.warn(`Gemini model "${name}" is not available to this API key; skipping it from here on.`);
      } else {
        fellBackOnQuota = true;
        console.warn(`Gemini model "${name}" is over its quota; falling back for this call only.`);
      }
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
