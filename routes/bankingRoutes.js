const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { analyseBankingDocument } = require('../controllers/bankingController');
const BankingDocument = require('../models/BankingDocument');
const { answerBankingQuestion } = require('../services/bankingAiService');

// ── POST /api/banking/analyse ─────────────────────────────────────────────────
router.post('/analyse', upload.single('document'), analyseBankingDocument);

// ── GET /api/banking/history ──────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 12, 50);
    const search = (req.query.search || '').trim();
    const docType = req.query.type || 'all';

    const filter = { userId: req.user._id };
    if (search) filter.filename = { $regex: search, $options: 'i' };
    if (docType !== 'all') filter.documentType = docType;

    const total = await BankingDocument.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);

    const docs = await BankingDocument.find(filter)
      .select('-extractedText -transactions')
      .sort({ uploadedAt: -1 })
      .skip((safePage - 1) * limit)
      .limit(limit);

    res.json({ docs, total, page: safePage, totalPages });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch banking history' });
  }
});

// ── GET /api/banking/history/:id ──────────────────────────────────────────────
router.get('/history/:id', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const doc = await BankingDocument.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch document' });
  }
});

// ── DELETE /api/banking/history/:id ──────────────────────────────────────────
router.delete('/history/:id', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    await BankingDocument.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete document' });
  }
});

// ── GET /api/banking/history/:id/chat ────────────────────────────────────────
router.get('/history/:id/chat', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const doc = await BankingDocument.findOne({ _id: req.params.id, userId: req.user._id }).select('chatHistory');
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json(doc.chatHistory || []);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch chat history' });
  }
});

// ── POST /api/banking/history/:id/chat ───────────────────────────────────────
router.post('/history/:id/chat', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ message: 'Question required' });

    const doc = await BankingDocument.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Not found' });

    const answer = await answerBankingQuestion(
      doc.extractedText,
      doc.transactions || [],
      question,
      doc.chatHistory || []
    );

    doc.chatHistory.push({ role: 'user', text: question });
    doc.chatHistory.push({ role: 'assistant', text: answer });
    await doc.save();

    res.json({ answer, chatHistory: doc.chatHistory });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to get answer' });
  }
});

// ── GET /api/banking/history/:id/export ──────────────────────────────────────
// format=csv (default) | xlsx | txt | pdf | ppt
router.get('/history/:id/export', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const format = (req.query.format || 'csv').toLowerCase();
    const doc = await BankingDocument.findOne({ _id: req.params.id, userId: req.user._id })
      .select('transactions filename currency analytics summary accountName bankName periodStart periodEnd documentType');
    if (!doc) return res.status(404).json({ message: 'Not found' });

    const txs = doc.transactions || [];
    const safeName = (doc.filename || 'transactions').replace(/\.[^/.]+$/, '');
    const cur = doc.currency || 'USD';

    // ── CSV ──────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const header = 'Date,Description,Debit,Credit,Balance,Category,Reference,Anomaly\n';
      const rows = txs.map(t =>
        [t.date, `"${(t.description || '').replace(/"/g, '""')}"`,
         t.debit ?? '', t.credit ?? '', t.balance ?? '',
         t.category || '', t.reference || '', t.isAnomaly ? 'YES' : ''].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_transactions.csv"`);
      return res.send(header + rows);
    }

    // ── TXT ──────────────────────────────────────────────────────────────
    if (format === 'txt') {
      const A = doc.analytics || {};
      let out = `BANKING ANALYSIS REPORT\n${'='.repeat(60)}\n`;
      out += `File: ${doc.filename}\n`;
      out += `Bank: ${doc.bankName || 'N/A'} | Account: ${doc.accountName || 'N/A'}\n`;
      out += `Period: ${doc.periodStart || '—'} to ${doc.periodEnd || '—'}\n`;
      out += `Currency: ${cur}\n\n`;
      out += `SUMMARY\n${'-'.repeat(40)}\n`;
      out += `Total Credits: ${cur} ${(A.totalCredits || 0).toLocaleString(undefined, {minimumFractionDigits:2})}\n`;
      out += `Total Debits:  ${cur} ${(A.totalDebits || 0).toLocaleString(undefined, {minimumFractionDigits:2})}\n`;
      out += `Net Cash Flow: ${cur} ${(A.netCashFlow || 0).toLocaleString(undefined, {minimumFractionDigits:2})}\n`;
      out += `Transactions:  ${A.transactionCount || 0}\n`;
      out += `Anomalies:     ${A.anomalyCount || 0}\n\n`;
      if (doc.summary) {
        out += `AI EXECUTIVE SUMMARY\n${'-'.repeat(40)}\n`;
        out += doc.summary.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '') + '\n\n';
      }
      out += `TRANSACTIONS\n${'-'.repeat(40)}\n`;
      out += `${'Date'.padEnd(14)}${'Description'.padEnd(40)}${'Debit'.padStart(14)}${'Credit'.padStart(14)}${'Balance'.padStart(14)}\n`;
      out += '-'.repeat(96) + '\n';
      txs.forEach(t => {
        const desc = (t.description || '').slice(0, 38).padEnd(40);
        const deb = t.debit != null ? t.debit.toFixed(2).padStart(14) : ''.padStart(14);
        const cre = t.credit != null ? t.credit.toFixed(2).padStart(14) : ''.padStart(14);
        const bal = t.balance != null ? t.balance.toFixed(2).padStart(14) : ''.padStart(14);
        out += `${(t.date || '').padEnd(14)}${desc}${deb}${cre}${bal}\n`;
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_report.txt"`);
      return res.send(out);
    }

    // ── XLSX ─────────────────────────────────────────────────────────────
    if (format === 'xlsx') {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      // Sheet 1: Transactions
      const txRows = [['Date','Description','Category','Debit','Credit','Balance','Reference','Anomaly']];
      txs.forEach(t => txRows.push([
        t.date || '', t.description || '', t.category || '',
        t.debit ?? '', t.credit ?? '', t.balance ?? '',
        t.reference || '', t.isAnomaly ? 'YES' : 'NO'
      ]));
      const ws1 = XLSX.utils.aoa_to_sheet(txRows);
      ws1['!cols'] = [10,40,18,12,12,12,18,8].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws1, 'Transactions');

      // Sheet 2: Summary
      const A = doc.analytics || {};
      const sumRows = [
        ['Banking Analysis Report', ''],
        ['File', doc.filename], ['Bank', doc.bankName || ''], ['Account', doc.accountName || ''],
        ['Currency', cur], ['Period', `${doc.periodStart || '—'} to ${doc.periodEnd || '—'}`],
        [''], ['STATISTICS', ''],
        ['Total Credits', A.totalCredits || 0], ['Total Debits', A.totalDebits || 0],
        ['Net Cash Flow', A.netCashFlow || 0], ['Avg Transaction', A.avgTransactionAmount || 0],
        ['Largest Credit', A.largestCredit || 0], ['Largest Debit', A.largestDebit || 0],
        ['Transaction Count', A.transactionCount || 0], ['Anomalies', A.anomalyCount || 0],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
      ws2['!cols'] = [{ wch: 20 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

      // Sheet 3: Category Breakdown
      const _catBreakdown = A.categoryBreakdown instanceof Map ? Object.fromEntries(A.categoryBreakdown) : (A.categoryBreakdown || {});
      const catData = Object.entries(_catBreakdown);
      if (catData.length > 0) {
        const catRows = [['Category', 'Total Spend', 'Percentage']];
        const total = catData.reduce((s, [, v]) => s + v, 0);
        catData.sort(([,a],[,b]) => b-a).forEach(([cat, val]) => {
          catRows.push([cat, val, total > 0 ? `${((val/total)*100).toFixed(1)}%` : '0%']);
        });
        const ws3 = XLSX.utils.aoa_to_sheet(catRows);
        ws3['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'Categories');
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_analysis.xlsx"`);
      return res.send(buf);
    }

    // ── PDF ──────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const A = doc.analytics || {};
      const pdfDoc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      pdfDoc.on('data', c => chunks.push(c));
      pdfDoc.on('end', () => {
        const buf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}_report.pdf"`);
        res.send(buf);
      });

      // Header
      pdfDoc.fontSize(22).font('Helvetica-Bold').fillColor('#1e40af').text('Banking Analysis Report', { align: 'center' });
      pdfDoc.moveDown(0.5);
      pdfDoc.fontSize(11).font('Helvetica').fillColor('#6b7280').text(`${doc.filename}  |  ${doc.bankName || ''}  |  ${cur}`, { align: 'center' });
      pdfDoc.moveDown(1);

      // Stats boxes
      const fmt = n => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
      const stats = [
        ['Total Credits', `${cur} ${fmt(A.totalCredits)}`, '#10b981'],
        ['Total Debits', `${cur} ${fmt(A.totalDebits)}`, '#ef4444'],
        ['Net Cash Flow', `${cur} ${fmt(A.netCashFlow)}`, '#3b82f6'],
        ['Transactions', A.transactionCount || 0, '#6366f1'],
      ];
      const startX = 50, boxW = 115, boxH = 55, gap = 8;
      stats.forEach(([label, val, color], i) => {
        const x = startX + i * (boxW + gap);
        pdfDoc.roundedRect(x, pdfDoc.y, boxW, boxH, 6).fillAndStroke('#f8fafc', '#e2e8f0');
        pdfDoc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(label, x + 8, pdfDoc.y - boxH + 10, { width: boxW - 16 });
        pdfDoc.font('Helvetica-Bold').fontSize(13).fillColor(color).text(String(val), x + 8, pdfDoc.y - 28, { width: boxW - 16 });
      });
      pdfDoc.moveDown(4.5);

      // Summary
      if (doc.summary) {
        pdfDoc.fontSize(14).font('Helvetica-Bold').fillColor('#111827').text('AI Executive Summary');
        pdfDoc.moveDown(0.4);
        const cleaned = doc.summary.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '');
        pdfDoc.fontSize(9).font('Helvetica').fillColor('#374151').text(cleaned, { lineGap: 4 });
        pdfDoc.moveDown(1);
      }

      // Category breakdown
      const catData = Object.entries(A.categoryBreakdown instanceof Map ? Object.fromEntries(A.categoryBreakdown) : (A.categoryBreakdown || {})).sort(([,a],[,b]) => b-a).slice(0, 8);
      if (catData.length > 0) {
        pdfDoc.fontSize(14).font('Helvetica-Bold').fillColor('#111827').text('Spending by Category');
        pdfDoc.moveDown(0.4);
        const total = catData.reduce((s,[,v]) => s+v, 0);
        catData.forEach(([cat, val]) => {
          const pct = total > 0 ? ((val/total)*100).toFixed(1) : '0';
          pdfDoc.fontSize(9).font('Helvetica').fillColor('#374151').text(`${cat}`, 50, pdfDoc.y, { continued: true, width: 180 });
          pdfDoc.fillColor('#6b7280').text(`${cur} ${fmt(val)}  (${pct}%)`, { align: 'right', width: 300 });
        });
        pdfDoc.moveDown(1);
      }

      // Transaction table
      pdfDoc.fontSize(14).font('Helvetica-Bold').fillColor('#111827').text('Transactions');
      pdfDoc.moveDown(0.4);
      const tblX = 50, cols = [65, 175, 70, 65, 65, 65];
      const headers = ['Date', 'Description', 'Category', 'Debit', 'Credit', 'Balance'];
      // Header row
      let cx = tblX;
      pdfDoc.rect(tblX, pdfDoc.y, 495, 16).fill('#1e40af');
      headers.forEach((h, i) => {
        pdfDoc.fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff').text(h, cx + 3, pdfDoc.y - 13, { width: cols[i] - 6 });
        cx += cols[i];
      });
      pdfDoc.moveDown(0.2);

      txs.slice(0, 80).forEach((t, idx) => {
        if (pdfDoc.y > 760) pdfDoc.addPage();
        const rowY = pdfDoc.y;
        if (idx % 2 === 0) pdfDoc.rect(tblX, rowY, 495, 14).fill('#f8fafc');
        const cells = [
          t.date || '', (t.description || '').slice(0, 28),
          (t.category || '').slice(0, 14),
          t.debit != null ? fmt(t.debit) : '',
          t.credit != null ? fmt(t.credit) : '',
          t.balance != null ? fmt(t.balance) : '',
        ];
        cx = tblX;
        cells.forEach((cell, i) => {
          pdfDoc.fontSize(7).font('Helvetica').fillColor(t.isAnomaly ? '#c2410c' : '#374151')
            .text(cell, cx + 3, rowY + 3, { width: cols[i] - 6, ellipsis: true });
          cx += cols[i];
        });
        pdfDoc.moveDown(0.55);
      });

      if (txs.length > 80) {
        pdfDoc.moveDown(0.5).fontSize(8).fillColor('#6b7280').text(`... and ${txs.length - 80} more transactions (export XLSX for full list)`);
      }

      pdfDoc.end();
      return;
    }

    // ── PPT ──────────────────────────────────────────────────────────────
    if (format === 'ppt') {
      const pptxgen = require('pptxgenjs');
      const A = doc.analytics || {};
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';
      pres.title = `Banking Report - ${doc.filename}`;

      // ── Design tokens ──────────────────────────────────────────────────
      const C = {
        bgDark:   '0D1B2A',   // midnight navy (dominant)
        bgLight:  'F0F6FF',   // cool near-white content bg
        bgMid:    'E6EEF8',   // card alt
        accent:   '00B4D8',   // vivid cyan accent
        accentAlt:'0077B6',   // deeper teal
        green:    '10B981',   // credits / positive
        red:      'EF4444',   // debits / negative
        amber:    'F59E0B',   // anomaly / warning
        purple:   '8B5CF6',   // category 3
        textLight:'FFFFFF',
        textDark: '0D1B2A',
        textMuted:'4A6080',
        border:   'CBD5E1',
        card:     'FFFFFF',
        chart: ['00B4D8','10B981','F59E0B','EF4444','8B5CF6','06B6D4','F97316','84CC16'],
      };

      const fmt = n => n != null
        ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '0.00';

      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // Precompute category data
      const catRaw = A.categoryBreakdown instanceof Map
        ? Object.fromEntries(A.categoryBreakdown)
        : (A.categoryBreakdown || {});
      const catData = Object.entries(catRaw).sort(([,a],[,b]) => b - a).slice(0, 8);
      const catTotal = catData.reduce((s, [,v]) => s + v, 0);

      // Monthly flow
      const monthly = (A.monthlyFlow || []).slice(-6);

      // Count slides for footer
      const TOTAL =
        1  // cover
        + 1  // KPI dashboard
        + (monthly.length > 0 ? 1 : 0)   // cash flow chart
        + (catData.length > 0 ? 1 : 0)   // category doughnut
        + 1  // transaction table
        + (A.anomalyCount > 0 ? 1 : 0)   // anomalies
        + (doc.summary ? 1 : 0)           // AI summary
        + 1; // closing

      let sc = 0;

      function addFooter(s, docName, idx, total) {
        s.addText(docName, {
          x: 0.3, y: 5.32, w: 7, h: 0.22,
          fontSize: 8, color: C.textMuted, fontFace: 'Calibri',
        });
        s.addShape('roundRect', {
          x: 8.8, y: 5.25, w: 0.9, h: 0.3,
          fill: { color: C.accent }, line: { color: C.accent }, rectRadius: 0.15,
        });
        s.addText(`${idx} / ${total}`, {
          x: 8.8, y: 5.25, w: 0.9, h: 0.3,
          fontSize: 8.5, color: C.textLight, bold: true, align: 'center', valign: 'middle', fontFace: 'Calibri',
        });
      }

      // ── Slide 1: Cover ────────────────────────────────────────────────
      ++sc;
      const s1 = pres.addSlide();
      s1.background = { color: C.bgDark };

      // Decorative circles
      s1.addShape(pres.shapes.OVAL, { x: 7.2, y: -1.2, w: 4.5, h: 4.5, fill: { color: C.accent, transparency: 82 }, line: { color: C.accent, transparency: 82 } });
      s1.addShape(pres.shapes.OVAL, { x: -0.8, y: 3.8, w: 2.8, h: 2.8, fill: { color: C.accentAlt, transparency: 80 }, line: { color: C.accentAlt, transparency: 80 } });
      s1.addShape(pres.shapes.OVAL, { x: 4.5, y: 3.2, w: 1.2, h: 1.2, fill: { color: C.green, transparency: 85 }, line: { color: C.green, transparency: 85 } });

      // Tag line
      s1.addText('BANKING ANALYSIS REPORT', {
        x: 0.65, y: 1.2, w: 8.5, h: 0.44,
        fontSize: 11, color: C.accent, bold: true, charSpacing: 4, fontFace: 'Calibri',
      });

      // Main title
      const docTitle = (doc.filename || 'Financial Document').replace(/\.[^/.]+$/, '');
      s1.addText(docTitle, {
        x: 0.65, y: 1.65, w: 8.5, h: 1.3,
        fontSize: 36, color: C.textLight, bold: true, fontFace: 'Cambria', lineSpacing: 42,
      });

      // Meta details row
      const metaParts = [
        doc.bankName, doc.accountName, cur,
        doc.periodStart ? `${doc.periodStart} \u2013 ${doc.periodEnd}` : null,
      ].filter(Boolean);
      s1.addText(metaParts.join('  \u2022  '), {
        x: 0.65, y: 3.1, w: 8.5, h: 0.4,
        fontSize: 13, color: 'A0C4E0', fontFace: 'Calibri',
      });

      // Stats preview strip
      const previewMetrics = [
        { label: 'Credits', val: `${cur} ${fmt(A.totalCredits)}`, color: C.green },
        { label: 'Debits',  val: `${cur} ${fmt(A.totalDebits)}`,  color: C.red },
        { label: 'Net Flow',val: `${cur} ${fmt(A.netCashFlow)}`,  color: A.netCashFlow >= 0 ? C.accent : C.amber },
        { label: 'Txns',    val: String(A.transactionCount || 0), color: C.accent },
      ];
      previewMetrics.forEach((m, i) => {
        const x = 0.65 + i * 2.3;
        s1.addShape('roundRect', {
          x, y: 3.75, w: 2.1, h: 1.1,
          fill: { color: C.accent, transparency: 88 }, line: { color: C.accent, transparency: 55 }, rectRadius: 0.1,
        });
        s1.addText(m.val, {
          x, y: 3.82, w: 2.1, h: 0.48,
          fontSize: 14, color: m.color, bold: true, fontFace: 'Cambria', align: 'center', valign: 'middle',
        });
        s1.addText(m.label, {
          x, y: 4.32, w: 2.1, h: 0.28,
          fontSize: 9, color: 'A0C4E0', fontFace: 'Calibri', align: 'center',
        });
      });

      s1.addText(`Powered by AI Document Summarizer  \u2022  ${today}`, {
        x: 0.65, y: 5.05, w: 8.5, h: 0.28,
        fontSize: 9, color: '5A7A9A', fontFace: 'Calibri',
      });

      // ── Slide 2: KPI Dashboard ─────────────────────────────────────────
      ++sc;
      const s2 = pres.addSlide();
      s2.background = { color: C.bgDark };

      // Corner decorations
      s2.addShape(pres.shapes.OVAL, { x: 8.0, y: -0.8, w: 2.8, h: 2.8, fill: { color: C.accent, transparency: 82 }, line: { color: C.accent, transparency: 82 } });
      s2.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.5, w: 1.8, h: 1.8, fill: { color: C.accentAlt, transparency: 80 }, line: { color: C.accentAlt, transparency: 80 } });

      s2.addText('KEY PERFORMANCE INDICATORS', {
        x: 0.4, y: 0.22, w: 9.2, h: 0.4,
        fontSize: 10, color: C.accent, bold: true, charSpacing: 3, fontFace: 'Calibri',
      });

      const kpiItems = [
        { label: 'TOTAL CREDITS',    val: `${cur} ${fmt(A.totalCredits)}`,        color: C.green,    icon: '\u25B2' },
        { label: 'TOTAL DEBITS',     val: `${cur} ${fmt(A.totalDebits)}`,          color: C.red,      icon: '\u25BC' },
        { label: 'NET CASH FLOW',    val: `${cur} ${fmt(A.netCashFlow)}`,          color: A.netCashFlow >= 0 ? C.accent : C.amber, icon: '\u2194' },
        { label: 'TRANSACTIONS',     val: String(A.transactionCount || 0),         color: C.accent,   icon: '#' },
        { label: 'LARGEST CREDIT',   val: `${cur} ${fmt(A.largestCredit)}`,        color: C.green,    icon: '\u2B06' },
        { label: 'LARGEST DEBIT',    val: `${cur} ${fmt(A.largestDebit)}`,         color: C.red,      icon: '\u2B07' },
        { label: 'AVG TRANSACTION',  val: `${cur} ${fmt(A.avgTransactionAmount)}`, color: C.accent,   icon: '\u2248' },
        { label: 'ANOMALIES FOUND',  val: String(A.anomalyCount || 0),             color: A.anomalyCount > 0 ? C.amber : C.green, icon: '\u26A0' },
      ];

      const cols3 = 4, rows3 = 2;
      const gapX = 0.18, gapY = 0.18;
      const cW = (9.2 - gapX * (cols3 - 1)) / cols3;
      const cH = (4.45 - gapY * (rows3 - 1)) / rows3;

      kpiItems.forEach((m, i) => {
        const col = i % cols3, row = Math.floor(i / cols3);
        const x = 0.4 + col * (cW + gapX);
        const y = 0.78 + row * (cH + gapY);
        s2.addShape('roundRect', {
          x, y, w: cW, h: cH,
          fill: { color: m.color, transparency: 88 }, line: { color: m.color, transparency: 55 }, rectRadius: 0.12,
        });
        s2.addText(m.label, {
          x: x + 0.18, y: y + 0.12, w: cW - 0.36, h: 0.28,
          fontSize: 8.5, color: m.color, bold: true, fontFace: 'Calibri', charSpacing: 0.5,
        });
        s2.addText(m.val, {
          x: x + 0.18, y: y + 0.42, w: cW - 0.36, h: cH - 0.6,
          fontSize: 16, color: C.textLight, bold: true, fontFace: 'Cambria', valign: 'top', autoFit: true,
        });
        // Trend arrow in top-right
        s2.addText(m.icon, {
          x: x + cW - 0.38, y: y + 0.1, w: 0.28, h: 0.28,
          fontSize: 10, color: m.color, fontFace: 'Calibri', align: 'center',
        });
      });

      addFooter(s2, docTitle, sc, TOTAL);

      // ── Slide 3: Monthly Cash Flow (native chart) ─────────────────────
      if (monthly.length > 0) {
        ++sc;
        const s3 = pres.addSlide();
        s3.background = { color: C.bgLight };

        // Header region
        s3.addShape('roundRect', { x: 0, y: 0, w: 10, h: 1.2, fill: { color: C.bgDark }, line: { color: C.bgDark }, rectRadius: 0 });
        s3.addText('Monthly Cash Flow Analysis', {
          x: 0.4, y: 0.2, w: 8.5, h: 0.7,
          fontSize: 24, color: C.textLight, bold: true, fontFace: 'Cambria', valign: 'middle',
        });
        s3.addText('Credits vs Debits & Net Cash Flow Trend', {
          x: 0.4, y: 0.75, w: 8.5, h: 0.36,
          fontSize: 11, color: 'A0C4E0', fontFace: 'Calibri',
        });

        // Build multi-series bar chart (Credits + Debits)
        const barData = [
          {
            name: 'Credits',
            labels: monthly.map(m => m.month || ''),
            values: monthly.map(m => +(m.credits || 0).toFixed(2)),
          },
          {
            name: 'Debits',
            labels: monthly.map(m => m.month || ''),
            values: monthly.map(m => +(m.debits || 0).toFixed(2)),
          },
        ];

        s3.addChart(pres.ChartType.bar, barData, {
          x: 0.35, y: 1.32, w: 6.5, h: 3.8,
          barDir: 'col',
          barGrouping: 'clustered',
          chartColors: [C.green, C.red],
          showLegend: true,
          legendPos: 'b',
          legendFontSize: 10,
          legendFontColor: C.textDark,
          showValue: true,
          dataLabelFontSize: 7.5,
          dataLabelPosition: 'outEnd',
          dataLabelColor: C.textDark,
          catAxisLabelFontSize: 9,
          valAxisLabelFontSize: 8,
          catAxisLabelColor: C.textDark,
          valAxisLabelColor: C.textMuted,
          catGridLine: { style: 'none' },
          valGridLine: { style: 'dash', color: C.border, size: 0.5 },
          plotAreaBorderColor: C.border,
          chartAreaBorderColor: C.border,
          showTitle: true,
          title: 'Monthly Credits vs Debits',
          titleFontSize: 11,
          titleColor: C.textDark,
        });

        // Net flow line on right
        const netMax = Math.max(...monthly.map(m => Math.abs(m.net || 0)), 1);
        const netItems = monthly.map(m => ({
          label: m.month || '',
          net: m.net || 0,
          pct: m.net != null ? ((m.net / netMax) * 100).toFixed(0) : '0',
        }));

        const panelX = 7.1;
        s3.addShape('roundRect', {
          x: panelX, y: 1.35, w: 2.65, h: 3.75,
          fill: { color: C.card }, line: { color: C.border }, rectRadius: 0.1,
          shadow: { type: 'outer', color: '000000', blur: 8, offset: 2, angle: 45, opacity: 0.07 },
        });
        s3.addText('NET FLOW BY MONTH', {
          x: panelX + 0.15, y: 1.48, w: 2.35, h: 0.3,
          fontSize: 8.5, color: C.accent, bold: true, fontFace: 'Calibri', charSpacing: 0.5,
        });

        const itemH3 = 3.1 / Math.max(netItems.length, 1);
        netItems.forEach((item, i) => {
          const y3 = 1.85 + i * itemH3;
          const color3 = item.net >= 0 ? C.green : C.red;
          s3.addText(item.label, {
            x: panelX + 0.15, y: y3, w: 1.2, h: 0.25,
            fontSize: 8.5, color: C.textMuted, fontFace: 'Calibri',
          });
          s3.addText(`${item.net >= 0 ? '+' : ''}${fmt(item.net)}`, {
            x: panelX + 0.15, y: y3 + 0.24, w: 2.35, h: itemH3 - 0.3,
            fontSize: 12, color: color3, bold: true, fontFace: 'Cambria',
          });
        });

        addFooter(s3, docTitle, sc, TOTAL);
      }

      // ── Slide 4: Spending by Category (native doughnut) ───────────────
      if (catData.length > 0) {
        ++sc;
        const s4 = pres.addSlide();
        s4.background = { color: C.bgLight };

        s4.addShape('roundRect', { x: 0, y: 0, w: 10, h: 1.2, fill: { color: C.bgDark }, line: { color: C.bgDark }, rectRadius: 0 });
        s4.addText('Spending by Category', {
          x: 0.4, y: 0.2, w: 8.5, h: 0.7,
          fontSize: 24, color: C.textLight, bold: true, fontFace: 'Cambria', valign: 'middle',
        });
        s4.addText('Breakdown of total outflows by merchant / transaction category', {
          x: 0.4, y: 0.76, w: 8.5, h: 0.33,
          fontSize: 11, color: 'A0C4E0', fontFace: 'Calibri',
        });

        const pieData = [{
          name: 'Spending',
          labels: catData.map(([cat]) => cat.slice(0, 20)),
          values: catData.map(([, v]) => +v.toFixed(2)),
        }];

        s4.addChart(pres.ChartType.doughnut, pieData, {
          x: 0.35, y: 1.3, w: 4.8, h: 4.0,
          chartColors: C.chart.slice(0, catData.length),
          showLegend: false,
          showValue: true,
          dataLabelFontSize: 9,
          dataLabelColor: 'FFFFFF',
          holeSize: 50,
          showTitle: true,
          title: `Total: ${cur} ${fmt(catTotal)}`,
          titleFontSize: 11,
          titleColor: C.textDark,
        });

        // Side legend with amount + pct + progress bar
        const legX = 5.45;
        let legY = 1.35;
        const lH = Math.min(3.85 / Math.max(catData.length, 1), 0.72);
        catData.forEach(([cat, val], i) => {
          const pct = catTotal > 0 ? (val / catTotal) * 100 : 0;
          const cc = C.chart[i % C.chart.length];
          s4.addShape('roundRect', {
            x: legX, y: legY, w: 4.3, h: lH - 0.06,
            fill: { color: C.card }, line: { color: C.border }, rectRadius: 0.07,
            shadow: { type: 'outer', color: '000000', blur: 5, offset: 1, angle: 45, opacity: 0.06 },
          });
          // Colour swatch
          s4.addShape('roundRect', {
            x: legX + 0.12, y: legY + lH * 0.22, w: 0.22, h: 0.22,
            fill: { color: cc }, line: { color: cc }, rectRadius: 0.04,
          });
          s4.addText(cat, {
            x: legX + 0.44, y: legY + 0.04, w: 2.25, h: 0.26,
            fontSize: 9, color: C.textMuted, fontFace: 'Calibri', bold: true,
          });
          s4.addText(`${cur} ${fmt(val)}`, {
            x: legX + 0.44, y: legY + 0.26, w: 2.25, h: 0.26,
            fontSize: 11, color: C.textDark, fontFace: 'Cambria', bold: true,
          });
          // Percentage badge
          s4.addText(`${pct.toFixed(1)}%`, {
            x: legX + 3.6, y: legY + 0.1, w: 0.58, h: lH - 0.2,
            fontSize: 12, color: cc, fontFace: 'Cambria', bold: true, align: 'right', valign: 'middle',
          });
          // Progress bar
          if (lH > 0.55) {
            s4.addShape('roundRect', {
              x: legX + 0.44, y: legY + lH - 0.22, w: 3.2, h: 0.1,
              fill: { color: C.border }, line: { color: C.border }, rectRadius: 0.05,
            });
            const barW4 = Math.max((pct / 100) * 3.2, 0.08);
            s4.addShape('roundRect', {
              x: legX + 0.44, y: legY + lH - 0.22, w: barW4, h: 0.1,
              fill: { color: cc }, line: { color: cc }, rectRadius: 0.05,
            });
          }
          legY += lH;
        });

        addFooter(s4, docTitle, sc, TOTAL);
      }

      // ── Slide 5: Transaction Table ─────────────────────────────────────
      ++sc;
      const s5 = pres.addSlide();
      s5.background = { color: C.bgLight };

      s5.addShape('roundRect', { x: 0, y: 0, w: 10, h: 1.2, fill: { color: C.bgDark }, line: { color: C.bgDark }, rectRadius: 0 });
      s5.addText('Transaction Details', {
        x: 0.4, y: 0.2, w: 7, h: 0.7,
        fontSize: 24, color: C.textLight, bold: true, fontFace: 'Cambria', valign: 'middle',
      });
      s5.addText(`Showing top 15 of ${txs.length} transactions`, {
        x: 0.4, y: 0.76, w: 7, h: 0.33,
        fontSize: 11, color: 'A0C4E0', fontFace: 'Calibri',
      });

      // Summary chips in header
      const chipData = [
        { label: 'Total', val: String(txs.length), color: C.accent },
        { label: 'Anomalies', val: String(A.anomalyCount || 0), color: A.anomalyCount > 0 ? C.amber : C.green },
      ];
      chipData.forEach((chip, i) => {
        const cx5 = 7.8 + i * 1.05;
        s5.addShape('roundRect', {
          x: cx5, y: 0.28, w: 0.95, h: 0.55,
          fill: { color: chip.color, transparency: 80 }, line: { color: chip.color, transparency: 50 }, rectRadius: 0.08,
        });
        s5.addText(chip.val, {
          x: cx5, y: 0.28, w: 0.95, h: 0.3,
          fontSize: 13, color: C.textLight, bold: true, fontFace: 'Cambria', align: 'center', valign: 'middle',
        });
        s5.addText(chip.label, {
          x: cx5, y: 0.56, w: 0.95, h: 0.22,
          fontSize: 7.5, color: C.textLight, fontFace: 'Calibri', align: 'center',
        });
      });

      // Table
      const tCols5 = [
        { x: 0.15, w: 1.1  },  // Date
        { x: 1.3,  w: 3.65 },  // Description
        { x: 5.0,  w: 1.55 },  // Category
        { x: 6.6,  w: 1.55 },  // Debit
        { x: 8.2,  w: 1.65 },  // Credit
      ];
      const tHeaders5 = ['DATE', 'DESCRIPTION', 'CATEGORY', 'DEBIT', 'CREDIT'];

      // Header row
      s5.addShape('roundRect', {
        x: 0.15, y: 1.3, w: 9.7, h: 0.38,
        fill: { color: C.bgDark }, line: { color: C.bgDark }, rectRadius: 0.04,
      });
      tHeaders5.forEach((h, i) => {
        s5.addText(h, {
          x: tCols5[i].x + 0.06, y: 1.32, w: tCols5[i].w - 0.12, h: 0.34,
          fontSize: 8.5, color: C.accent, bold: true, fontFace: 'Calibri', charSpacing: 0.5, valign: 'middle',
        });
      });

      const topTx5 = txs.slice(0, 15);
      const rowH5 = 3.6 / Math.max(topTx5.length, 1);

      topTx5.forEach((t, ri) => {
        const ry = 1.72 + ri * rowH5;
        s5.addShape('roundRect', {
          x: 0.15, y: ry, w: 9.7, h: rowH5 - 0.03,
          fill: { color: ri % 2 === 1 ? C.bgMid : C.card }, line: { color: C.border }, rectRadius: 0.04,
        });
        if (t.isAnomaly) {
          s5.addShape('roundRect', {
            x: 0.15, y: ry, w: 9.7, h: rowH5 - 0.03,
            fill: { color: 'FFF7ED' }, line: { color: C.amber, transparency: 50 }, rectRadius: 0.04,
          });
        }
        const cells5 = [
          t.date || '',
          (t.description || '').slice(0, 42),
          (t.category || '').slice(0, 16),
          t.debit != null ? fmt(t.debit) : '',
          t.credit != null ? fmt(t.credit) : '',
        ];
        const textColors = [C.textMuted, C.textDark, C.textMuted, C.red, C.green];
        cells5.forEach((cell, ci) => {
          s5.addText(cell, {
            x: tCols5[ci].x + 0.06, y: ry + 0.03, w: tCols5[ci].w - 0.12, h: rowH5 - 0.08,
            fontSize: 7.5, color: textColors[ci], fontFace: 'Calibri', valign: 'middle',
          });
        });
      });

      addFooter(s5, docTitle, sc, TOTAL);

      // ── Slide 6: Anomaly Detection ─────────────────────────────────────
      if ((A.anomalyCount || 0) > 0) {
        ++sc;
        const anomalies = (A.anomalies || []).slice(0, 6);
        const s6 = pres.addSlide();
        s6.background = { color: C.bgLight };

        s6.addShape('roundRect', { x: 0, y: 0, w: 10, h: 1.2, fill: { color: C.bgDark }, line: { color: C.bgDark }, rectRadius: 0 });
        s6.addText('Anomaly Detection', {
          x: 0.4, y: 0.2, w: 7.5, h: 0.7,
          fontSize: 24, color: C.textLight, bold: true, fontFace: 'Cambria', valign: 'middle',
        });
        s6.addText(`${A.anomalyCount} unusual transactions flagged for review`, {
          x: 0.4, y: 0.76, w: 7.5, h: 0.33,
          fontSize: 11, color: 'A0C4E0', fontFace: 'Calibri',
        });

        // Anomaly count badge
        s6.addShape('roundRect', {
          x: 8.3, y: 0.22, w: 1.4, h: 0.65,
          fill: { color: C.amber, transparency: 75 }, line: { color: C.amber, transparency: 50 }, rectRadius: 0.1,
        });
        s6.addText(`${A.anomalyCount}`, {
          x: 8.3, y: 0.22, w: 1.4, h: 0.4,
          fontSize: 18, color: C.amber, bold: true, fontFace: 'Cambria', align: 'center', valign: 'middle',
        });
        s6.addText('FLAGGED', {
          x: 8.3, y: 0.58, w: 1.4, h: 0.2,
          fontSize: 7.5, color: C.amber, fontFace: 'Calibri', align: 'center', bold: true,
        });

        const cols6 = anomalies.length <= 3 ? 1 : 2;
        const rows6 = Math.ceil(anomalies.length / cols6);
        const gap6 = 0.2;
        const cW6 = cols6 === 1 ? 9.4 : (9.4 - gap6) / 2;
        const cH6 = Math.min((3.95 - gap6 * (rows6 - 1)) / rows6, 1.55);

        anomalies.forEach((a, i) => {
          const col6 = i % cols6, row6 = Math.floor(i / cols6);
          const x6 = 0.3 + col6 * (cW6 + gap6);
          const y6 = 1.3 + row6 * (cH6 + gap6);
          s6.addShape('roundRect', {
            x: x6, y: y6, w: cW6, h: cH6,
            fill: { color: 'FFF7ED' }, line: { color: 'FED7AA' }, rectRadius: 0.1,
          });
          s6.addText(`${a.date || ''}  \u2014  ${(a.description || '').slice(0, 38)}`, {
            x: x6 + 0.18, y: y6 + 0.08, w: cW6 - 0.36, h: 0.3,
            fontSize: 9.5, color: 'C2410C', bold: true, fontFace: 'Calibri',
          });
          s6.addText(a.reason || 'Unusual transaction pattern', {
            x: x6 + 0.18, y: y6 + 0.38, w: cW6 - 1.2, h: cH6 - 0.55,
            fontSize: 9, color: C.textMuted, fontFace: 'Calibri', valign: 'top',
          });
          if (a.amount != null) {
            s6.addText(`${cur} ${fmt(a.amount)}`, {
              x: x6 + cW6 - 1.3, y: y6 + 0.38, w: 1.1, h: cH6 - 0.55,
              fontSize: 13, color: 'C2410C', bold: true, fontFace: 'Cambria', align: 'right', valign: 'top',
            });
          }
        });

        addFooter(s6, docTitle, sc, TOTAL);
      }

      // ── Slide 7: AI Executive Summary ──────────────────────────────────
      if (doc.summary) {
        ++sc;
        const s7 = pres.addSlide();
        s7.background = { color: C.bgLight };

        s7.addShape('roundRect', { x: 0, y: 0, w: 10, h: 1.2, fill: { color: C.bgDark }, line: { color: C.bgDark }, rectRadius: 0 });
        s7.addText('AI Executive Summary', {
          x: 0.4, y: 0.2, w: 8, h: 0.7,
          fontSize: 24, color: C.textLight, bold: true, fontFace: 'Cambria', valign: 'middle',
        });
        s7.addText('AI-generated analysis of your financial document', {
          x: 0.4, y: 0.76, w: 8, h: 0.33,
          fontSize: 11, color: 'A0C4E0', fontFace: 'Calibri',
        });

        // Parse summary into bullet sections
        const cleaned7 = doc.summary
          .replace(/#{1,6}\s+/g, '\u2756 ')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .slice(0, 2000);

        const lines7 = cleaned7.split('\n').map(l => l.trim()).filter(Boolean);
        const bulletItems7 = lines7.map((line, i) => {
          const isSectionHeader = line.startsWith('\u2756');
          return {
            text: line.replace('\u2756 ', ''),
            options: {
              bullet: isSectionHeader ? false : { code: '25CF', color: C.accent },
              breakLine: i < lines7.length - 1,
              fontSize: isSectionHeader ? 12 : 11,
              bold: isSectionHeader,
              color: isSectionHeader ? C.accentAlt : C.textDark,
              paraSpaceAfter: isSectionHeader ? 6 : 3,
              paraSpaceBefore: isSectionHeader ? 8 : 0,
            },
          };
        });

        s7.addShape('roundRect', {
          x: 0.3, y: 1.3, w: 9.4, h: 3.9,
          fill: { color: C.card }, line: { color: C.border }, rectRadius: 0.1,
          shadow: { type: 'outer', color: '000000', blur: 8, offset: 2, angle: 45, opacity: 0.06 },
        });
        s7.addText(bulletItems7, {
          x: 0.5, y: 1.42, w: 9.0, h: 3.66,
          fontFace: 'Calibri', valign: 'top',
        });

        addFooter(s7, docTitle, sc, TOTAL);
      }

      // ── Slide 8: Closing ───────────────────────────────────────────────
      ++sc;
      const s8 = pres.addSlide();
      s8.background = { color: C.bgDark };

      s8.addShape(pres.shapes.OVAL, { x: -1.2, y: 2.2, w: 4.0, h: 4.0, fill: { color: C.accent, transparency: 82 }, line: { color: C.accent, transparency: 82 } });
      s8.addShape(pres.shapes.OVAL, { x: 8.6, y: -0.6, w: 2.8, h: 2.8, fill: { color: C.accentAlt, transparency: 80 }, line: { color: C.accentAlt, transparency: 80 } });
      s8.addShape(pres.shapes.OVAL, { x: 4.2, y: 1.8, w: 1.5, h: 1.5, fill: { color: C.green, transparency: 85 }, line: { color: C.green, transparency: 85 } });

      s8.addText('Analysis Complete', {
        x: 1, y: 1.4, w: 8, h: 1.1,
        fontSize: 42, color: C.textLight, bold: true, fontFace: 'Cambria', align: 'center',
      });

      const statLine8 = [
        `${A.transactionCount || 0} transactions analysed`,
        `${A.anomalyCount || 0} anomalies found`,
        `${catData.length} spending categories`,
      ].join('  \u2022  ');
      s8.addText(statLine8, {
        x: 1, y: 2.55, w: 8, h: 0.45,
        fontSize: 13, color: 'A0C4E0', align: 'center', fontFace: 'Calibri',
      });

      s8.addShape(pres.shapes.RECTANGLE, {
        x: 2.5, y: 3.15, w: 5.0, h: 0.04,
        fill: { color: C.accent, transparency: 55 }, line: { color: C.accent, transparency: 55 },
      });

      s8.addText('Generated by AI Document Summarizer', {
        x: 1, y: 3.3, w: 8, h: 0.35,
        fontSize: 10, color: '5A7A9A', align: 'center', fontFace: 'Calibri',
      });
      s8.addText(today, {
        x: 1, y: 3.65, w: 8, h: 0.3,
        fontSize: 10, color: '5A7A9A', align: 'center', fontFace: 'Calibri',
      });

      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tmpFile = path.join(os.tmpdir(), `${safeName}_report_${Date.now()}.pptx`);
      await pres.writeFile({ fileName: tmpFile });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_report.pptx"`);
      const fileBuffer = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      return res.send(fileBuffer);
    }

    res.status(400).json({ message: `Unknown format: ${format}` });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: `Export failed: ${err.message}` });
  }
});

module.exports = router;