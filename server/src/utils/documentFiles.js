// Which files may be attached to an HR document, and a check that the bytes match the claimed type
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const ZIP = (buf) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

export const DOCUMENT_TYPES = {
  'application/pdf': { ext: 'pdf', check: (b) => b.length > 5 && b.toString('latin1', 0, 5) === '%PDF-' },
  'image/png': { ext: 'png', check: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', check: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', check: ZIP },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', check: ZIP }
};

export const isAllowedUpload = (contentType, buf) => !!DOCUMENT_TYPES[contentType]?.check(buf);

// A safe download name: no path parts or odd characters, and the right extension for the verified type
export const safeFileName = (raw, contentType, fallback = 'document') => {
  let decoded = String(raw || '');
  try { decoded = decodeURIComponent(decoded); } catch { /* keep the raw header */ }
  const name = decoded.split(/[\\/]/).pop().replace(/[^\w .()-]/g, '_').replace(/^\.+/, '').trim().slice(0, 100);
  const ext = DOCUMENT_TYPES[contentType].ext;
  const base = (name || fallback).replace(/\.[A-Za-z0-9]{1,5}$/, '') || fallback;
  return `${base}.${ext}`;
};
