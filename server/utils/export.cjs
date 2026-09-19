// Builds PDF and DOCX versions of a project's merged narrative.
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

function sections(project) {
  if (project.narrativeText) {
    // Edited narrative: split on numbered headings "1. Question" produced by merge, else fall back to one block
    const parts = project.narrativeText.split(/\n(?=\d+\.\s|## )/).map(t => t.trim()).filter(Boolean);
    return parts.map((block, i) => {
      const h = block.match(/^##\s+(.+)$/m);
      if (h && block.trim().split('\n').length === 1) return { heading: h[1].trim() };
      const m = block.match(/^(\d+)\.\s+([^\n]+)\n+([\s\S]*)$/);
      if (m) return { n: parseInt(m[1], 10), question: m[2].trim(), answer: m[3].trim() || '[No answer provided]' };
      return { n: i + 1, question: '', answer: block };
    });
  }
  const out = [];
  let section = null;
  (project.questions || []).forEach((q, i) => {
    if ((q.section || null) !== section) { section = q.section || null; if (section) out.push({ heading: section }); }
    out.push({
      n: i + 1,
      question: q.text,
      answer: q.type === 'upload' ? (q.file ? `[Attachment: ${q.file.filename}]` : '[Attachment not uploaded yet]') : ((q.answer && q.answer.trim()) || '[No answer provided]'),
    });
  });
  return out;
}

function meta(project, company) {
  const parts = [];
  if (company && company.name) parts.push(company.name);
  if (project.deadlineDate) parts.push(`Due ${new Date(project.deadlineDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
  parts.push(`Exported ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
  return parts.join('  ·  ');
}

function buildPdf(project, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 }, info: { Title: project.name, Author: company ? company.name : 'Merge' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#0b2d65').text(project.name);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#6b6b6e').text(meta(project, company));
    if (project.description) { doc.moveDown(0.8); doc.font('Helvetica-Oblique').fontSize(11).fillColor('#3b3b3d').text(project.description); }
    doc.moveDown(0.5);
    doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#7fab61').lineWidth(1.5).stroke();
    doc.moveDown(1);

    sections(project).forEach(s => {
      if (doc.y > 660) doc.addPage();
      if (s.heading) { doc.font('Helvetica-Bold').fontSize(14).fillColor('#476c2e').text(s.heading); doc.moveDown(0.6); return; }
      if (s.question) { doc.font('Helvetica-Bold').fontSize(12).fillColor('#0b2d65').text(`${s.n}. ${s.question}`); doc.moveDown(0.3); }
      doc.font('Helvetica').fontSize(11).fillColor('#3b3b3d').text(s.answer, { lineGap: 3 });
      doc.moveDown(1);
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // let the footer sit inside the margin without spawning a page
      doc.font('Helvetica').fontSize(9).fillColor('#9a9a9e').text(`${project.name}  ·  Page ${i - range.start + 1} of ${range.count}`, 72, 740, { width: 468, align: 'center' });
    }
    doc.end();
  });
}

async function buildDocx(project, company) {
  const children = [
    new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: meta(project, company), color: '6B6B6E', size: 20 })], spacing: { after: 200 } }),
  ];
  if (project.description) children.push(new Paragraph({ children: [new TextRun({ text: project.description, italics: true })], spacing: { after: 300 } }));
  sections(project).forEach(s => {
    if (s.heading) { children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 160 } })); return; }
    if (s.question) children.push(new Paragraph({ text: `${s.n}. ${s.question}`, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } }));
    s.answer.split(/\n{2,}/).forEach(par => {
      children.push(new Paragraph({ children: [new TextRun({ text: par.replace(/\n/g, ' ') })], spacing: { after: 160 }, alignment: AlignmentType.LEFT }));
    });
  });
  const doc = new Document({
    creator: company ? company.name : 'Merge',
    title: project.name,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 40, bold: true, color: '0B2D65', font: 'Calibri' }, paragraph: { spacing: { after: 120 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: '476C2E', font: 'Calibri' } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: '0B2D65', font: 'Calibri' } },
      ],
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

function safeName(name) { return (name || 'proposal').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'proposal'; }

module.exports = { buildPdf, buildDocx, safeName };
