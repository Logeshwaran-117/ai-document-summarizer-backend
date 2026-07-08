const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const summarizeDocument = require('../controllers/summarizeController');
const { limitAction } = require('../middleware/planLimit');

router.post('/summarize', upload.single('document'), limitAction('summarize'), summarizeDocument);

module.exports = router;
