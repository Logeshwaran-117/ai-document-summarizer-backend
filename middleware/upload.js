/**
 * middleware/upload.js
 *
 * Shared multer config for all document uploads (Banking, Summarize, etc).
 * Accepts: PDF, Word (doc/docx), Excel (xls/xlsx), CSV, plain text, and
 * common image formats (for scanned statements / photographed documents).
 */
const multer = require('multer');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — matches server.js error handler message

// Map of accepted MIME types -> friendly label (used for the fileFilter error message)
const ALLOWED_MIME_TYPES = {
  'application/pdf': 'PDF',
  'text/csv': 'CSV',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'text/plain': 'Text',
  'image/png': 'Image',
  'image/jpeg': 'Image',
  'image/jpg': 'Image',
  'image/webp': 'Image',
};

// Some browsers/OSes send generic or missing MIME types for csv/txt/docx etc,
// so we also allow-list by extension as a fallback.
const ALLOWED_EXTENSIONS = ['.pdf', '.csv', '.xlsx', '.xls', '.txt', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp'];

function fileFilter(req, file, cb) {
  const ext = '.' + file.originalname.split('.').pop().toLowerCase();
  const mimeOk = Object.prototype.hasOwnProperty.call(ALLOWED_MIME_TYPES, file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeOk || extOk) {
    return cb(null, true);
  }

  const err = new Error(
    `Unsupported file type "${file.mimetype || ext}". Allowed: PDF, Word, Excel, CSV, TXT, or image (PNG/JPG/WEBP).`
  );
  err.status = 400;
  return cb(err);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = upload;