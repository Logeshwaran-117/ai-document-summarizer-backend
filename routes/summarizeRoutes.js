const express = require("express");
const router = express.Router();

const upload = require("../middleware/upload");
const summarizeDocument = require("../controllers/summarizeController");

// This line is mandatory so Multer catches the PDF!
router.post("/summarize", upload.single("document"), summarizeDocument);

module.exports = router;