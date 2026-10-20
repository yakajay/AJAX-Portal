import { Company } from '../models/company.model.js';

// What the PDF builders need to brand a document: the company's name and its letterhead image, if it uploaded one
export const loadBranding = async (companyId, fallbackName) => {
  const company = companyId ? await Company.findById(companyId).select('name +letterheadData letterheadContentType') : null;
  return {
    company: company?.name || fallbackName,
    letterhead: company?.letterheadData?.length ? company.letterheadData : null
  };
};

export const A4 = { width: 595.28, height: 841.89 };

// Draws the letterhead across the top of the current page, edge to edge, and returns the y just below it.
// Returns null (drawing nothing) when there is no usable image, so callers fall back to a text header.
export const drawLetterhead = (doc, image, maxHeight = 130) => {
  if (!image) return null;
  try {
    const opened = doc.openImage(image);
    const height = Math.min((A4.width * opened.height) / opened.width, maxHeight);
    doc.image(opened, 0, 0, { fit: [A4.width, height], align: 'center', valign: 'top' });
    return height;
  } catch {
    return null; // a corrupt image must never stop a payslip from being produced
  }
};

// Renders a company letter (date, addressee, subject, body, sign-off) on the company's letterhead
// and resolves with the PDF bytes.
export const buildLetterPdf = async ({ company, letterhead, date, recipient, subject, body, signatory }) => {
  const { default: PDFDocument } = await import('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60, info: { Title: subject, Author: company } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bannerBottom = drawLetterhead(doc, letterhead);
    const top = bannerBottom === null ? 60 : Math.round(bannerBottom) + 30;
    if (bannerBottom === null) doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text(company, 60, top);
    doc.y = bannerBottom === null ? top + 40 : top;

    doc.fontSize(10).font('Helvetica').fillColor('#000').text(date, { align: 'right' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').text(recipient.name);
    doc.font('Helvetica');
    if (recipient.designation) doc.text(recipient.designation);
    if (recipient.department) doc.text(recipient.department);
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(12).text(`Subject: ${subject}`);
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(11).text(body, { align: 'left', lineGap: 3 });
    doc.moveDown(3);
    doc.fontSize(10).text('Yours sincerely,');
    doc.moveDown(2.5);
    doc.font('Helvetica-Bold').text(signatory || company);
    doc.end();
  });
};
