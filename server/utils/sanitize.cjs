// Very small HTML sanitizer for the notes editor: keeps basic formatting tags, strips everything else.
const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'a', 'div', 'span']);

function sanitizeHtml(html) {
  if (!html) return '';
  let out = String(html).slice(0, 200000);
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<(script|style|iframe|object|embed|form|input|textarea|button|svg|math)[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    const closing = m.startsWith('</');
    if (closing) return `</${t}>`;
    if (t === 'a') {
      const href = (attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i) || [])[1] || '';
      const safe = /^(https?:\/\/|mailto:)/i.test(href) ? href.replace(/"/g, '') : '';
      return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">` : '<a>';
    }
    return `<${t}>`;
  });
  return out;
}

module.exports = { sanitizeHtml };
