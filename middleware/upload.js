const multer = require("multer");
const path = require("path");

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                           // .xls
  "application/octet-stream",                                           // .xlsx on some OSes
  "text/csv",
  "application/csv",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".txt", ".docx",
  ".jpg", ".jpeg", ".png", ".webp", ".gif",
  ".xlsx", ".xls", ".csv",
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  // Accept if EITHER the MIME type OR the extension is recognised —
  // browsers report Excel MIME types inconsistently across OSes.
  if (ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.originalname}. Allowed: PDF, DOCX, TXT, XLSX, XLS, CSV, JPG, PNG, WEBP`
      ),
      false
    );
  }
};

const upload = multer({
  storage: multer.memoryStorage(), // keeps file as Buffer in file.buffer — required by extractText.js
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = upload;
