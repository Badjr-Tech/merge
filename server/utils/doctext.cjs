// Pulls readable text out of an uploaded document, so the assistant can use what is in the
// file cabinet instead of only what someone has retyped into the Organization page.
//
// Scanned PDFs with no text layer come back empty. That is reported rather than treated as a
// failure, because the upload itself still worked and the person needs to know why the
// document is not being read.

// Parsing happens in the request, so a very large file is left alone rather than holding the
// upload open. The text of a document this size is already far past what any prompt can use.
const MAX_EXTRACT_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60000;

const READABLE = ['pdf', 'docx', 'txt', 'md'];

function extension(filename) {
  return String(filename || '').split('.').pop().toLowerCase();
}

function canExtract(filename, bytes) {
  if (typeof bytes === 'number' && bytes > MAX_EXTRACT_BYTES) return false;
  return READABLE.includes(extension(filename));
}

function tidy(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

// Returns the text, or null when the document holds none that can be read. Never throws:
// a document that cannot be parsed should not fail the upload it came with.
async function extractText(buffer, filename) {
  if (!buffer || !buffer.length) return null;
  const ext = extension(filename);
  try {
    if (ext === 'pdf') return tidy((await require('pdf-parse')(buffer)).text) || null;
    if (ext === 'docx') return tidy((await require('mammoth').extractRawText({ buffer })).value) || null;
    if (ext === 'txt' || ext === 'md') return tidy(buffer.toString('utf8')) || null;
  } catch (err) {
    console.error(`Could not read text from ${filename}:`, err.message);
  }
  return null;
}

module.exports = { canExtract, extractText, MAX_EXTRACT_BYTES, MAX_TEXT_CHARS, READABLE };
