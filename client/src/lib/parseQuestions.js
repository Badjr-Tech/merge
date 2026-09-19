// Turns a pasted funder question list into structured questions.
//
// Handles: numbered/lettered/bulleted lines, section headers ("Section 2 — Statement of Need",
// "Program Design", "PART B:", "## Budget"), per-question limits ("(500 words)", "max 2,000 characters",
// "up to 250 words"), and wrapped lines that continue the previous numbered question.

const NUMBERING = /^\s*(?:\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,6}[.)]|[-*•–—]|#{1,6})\s+/;
const HEADER_WORD = /^(section|part|module|category|area|component|tab|page|step|question set|attachments?)\b/i;
const UPLOAD_SECTION = /attach|upload|document|supporting materials|required files|exhibits?/i;
const UPLOAD_VERB = /^(please\s+)?(upload|attach|submit|include|provide|enclose)\b\s*(a |an |the |your |one |two |three |copies? of |a copy of |copy of |most recent |current |signed |completed )*/i;
const DOC_NOUN = /\b(letters? of (?:support|commitment|intent|recommendation)|roster|financial statements?|financials|form 990|990|irs|audit|audited|certificate|certification|resume|résumé|cv|bylaws|determination letter|articles of incorporation|template|spreadsheet|w-?9|proof of|logo|photos?|org(?:anizational)? chart|memorandum|mou|signed agreement|attachment|exhibit|pdf|file)\b/i;

// Is this line asking for a file rather than a written answer?
export function looksLikeUpload(text, section, hasLimit) {
  const t = text.trim();
  if (hasLimit || /\?$/.test(t)) return false; // a word limit means a written answer
  if (/^(upload|attach)\b/i.test(t)) return true;
  if (section && UPLOAD_SECTION.test(section)) return true;
  const words = t.split(/\s+/).length;
  // "Most recent audited financials or Form 990" — noun phrase, no request verb
  if (words <= 12 && !/[.!]$/.test(t) && DOC_NOUN.test(t) && !/\b(describe|explain|list|how|what|why|who|when|which|provide a|summarize|discuss)\b/i.test(t)) return true;
  // "Submit a copy of your IRS determination letter." — request verb + document noun
  if (UPLOAD_VERB.test(t) && DOC_NOUN.test(t) && words <= 20 && !/\b(describe|explain|narrative|justif)/i.test(t)) return true;
  return false;
}

const LIMIT_PATTERNS = [
  /\(\s*(?:max(?:imum)?\.?|up to|limit:?|no more than|not to exceed)?\s*([\d,]+)\s*(words?|characters?|chars?)\s*(?:max(?:imum)?|limit)?\.?\s*\)/i,
  /\[\s*(?:max(?:imum)?\.?|up to|limit:?)?\s*([\d,]+)\s*(words?|characters?|chars?)\s*(?:max(?:imum)?|limit)?\s*\]/i,
  /[-–—,:]?\s*(?:max(?:imum)?\.?|up to|limit:?|no more than|not to exceed)\s+([\d,]+)\s+(words?|characters?|chars?)\.?\s*$/i,
  /[-–—,:]?\s*([\d,]+)[ -](words?|characters?|chars?)\s+(?:max(?:imum)?|limit|or less|or fewer)\.?\s*$/i,
];

export function extractLimit(text) {
  for (const re of LIMIT_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      if (n > 0) {
        const unit = /^c/i.test(m[2]) ? 'characters' : 'words';
        return { text: text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim(), maxLimit: n, limitUnit: unit };
      }
    }
  }
  return { text: text.trim(), maxLimit: null, limitUnit: 'words' };
}

function isNumbered(line) { return NUMBERING.test(line); }
function stripNumbering(line) { return line.replace(NUMBERING, '').trim(); }

function looksLikeHeader(raw) {
  const line = raw.trim();
  if (!line) return false;
  if (/^#{1,6}\s+/.test(line)) return true;
  if (isNumbered(line) && !/^#/.test(line)) return false; // numbered lines are questions
  if (/[?]$/.test(line)) return false;
  if (HEADER_WORD.test(line)) return true;
  if (/:$/.test(line)) return true;
  const words = line.split(/\s+/);
  const letters = line.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) return true; // ALL CAPS
  // Short title-case line with no sentence punctuation
  if (words.length <= 8 && !/[.!;]$/.test(line) && !/\b(please|describe|list|explain|provide|what|how|why|when|who|which)\b/i.test(line)) return true;
  return false;
}

function cleanHeader(line) {
  return line.replace(/^#{1,6}\s+/, '').replace(/:$/, '').trim();
}

export function parseQuestions(text) {
  const rawLines = String(text || '').replace(/\r/g, '').split('\n');
  const anyNumbered = rawLines.some(isNumbered);
  const out = [];
  let section = '';
  let pendingHeaders = []; // headers seen since the last question; a header followed by another header is a title, not a section

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    if (looksLikeHeader(line)) {
      pendingHeaders.push(cleanHeader(line));
      continue;
    }
    // Continuation of the previous question (wrapped text) when the list is numbered
    if (anyNumbered && !isNumbered(line) && out.length && !pendingHeaders.length) {
      const prev = out[out.length - 1];
      const merged = extractLimit(`${prev.text} ${line}`);
      out[out.length - 1] = { ...prev, ...merged, maxLimit: merged.maxLimit || prev.maxLimit, limitUnit: merged.maxLimit ? merged.limitUnit : prev.limitUnit };
      continue;
    }
    if (pendingHeaders.length) { section = pendingHeaders[pendingHeaders.length - 1]; pendingHeaders = []; }
    const q = extractLimit(stripNumbering(line));
    if (!q.text) continue;
    out.push({ text: q.text, section, maxLimit: q.maxLimit, limitUnit: q.limitUnit, type: looksLikeUpload(q.text, section, !!q.maxLimit) ? 'upload' : 'text' });
  }
  return out;
}

export default parseQuestions;
