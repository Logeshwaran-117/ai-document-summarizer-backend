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
    if (!doc) return res.status(404).json({ message: 'Banking document not found' });

    if (!doc.chatHistory) doc.chatHistory = [];

    const answer = await answerBankingQuestion(
      doc.extractedText,
      doc.transactions || [],
      question.trim(),
      doc.chatHistory
    );

    doc.chatHistory.push({ role: 'user', text: question.trim() });
    doc.chatHistory.push({ role: 'assistant', text: answer });
    await doc.save();

    res.json({ answer, chatHistory: doc.chatHistory });
  } catch (err) {
    console.error('[bankingRoutes] Chat error:', err);
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

    // ── PPT ──────────────────────────────────────────────────────────────
    if (format === 'ppt') {
      const pptxgen = require('pptxgenjs');
      const A = doc.analytics || {};
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';
      pres.title = `Banking Report - ${doc.filename}`;

      // ── Design tokens ─────────────────────────────────────────────────
      const C = {
        navy:     '0A1F44',
        blue:     '1565C0',
        teal:     '00838F',
        green:    '1B8A5A',
        red:      'C62828',
        gold:     'F9A825',
        white:    'FFFFFF',
        gray1:    'F5F7FA',
        gray2:    'CFD8DC',
        gray3:    '546E7A',
        light:    'E8F0FE',
        chart: ['00838F','1565C0','F9A825','C62828','6A1B9A','F57C00','1B8A5A','0288D1'],
      };

      const fmt = n => n != null
        ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '0.00';

      const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

      // Precompute category data
      const catRaw = A.categoryBreakdown instanceof Map
        ? Object.fromEntries(A.categoryBreakdown)
        : (A.categoryBreakdown || {});
      const catData = Object.entries(catRaw).sort(([,a],[,b]) => b - a).slice(0, 8);
      const catTotal = catData.reduce((s, [,v]) => s + v, 0);

      // Monthly flow
      const monthly = (A.monthlyFlow || []).slice(-6);

      // Count total slides
      const TOTAL =
        1  // cover
        + 1  // KPI dashboard
        + 1  // credits vs debits bar chart
        + (monthly.length > 0 ? 1 : 0)   // monthly cash flow
        + (catData.length > 0 ? 1 : 0)   // category chart
        + (catData.length > 0 ? 1 : 0)   // category bar ranking
        + 1  // transaction table
        + (A.anomalyCount > 0 ? 1 : 0)   // anomalies
        + (doc.summary ? 1 : 0)           // AI summary
        + 1; // closing

      let sc = 0;

      // ── Shared helpers ─────────────────────────────────────────────────
      function addFooter(s, docName, idx, total) {
        s.addShape('rect', {
          x: 0, y: 5.32, w: 10, h: 0.3,
          fill: { color: C.navy }, line: { color: C.navy },
        });
        s.addText(`AI Document Summarizer  •  ${docName}  •  ${today}`, {
          x: 0.3, y: 5.32, w: 7.5, h: 0.3,
          fontSize: 8.5, color: 'A0B8CC', fontFace: 'Calibri', valign: 'middle',
        });
        s.addText(`${idx} / ${total}`, {
          x: 9.2, y: 5.32, w: 0.7, h: 0.3,
          fontSize: 8.5, color: C.white, bold: true, align: 'right', valign: 'middle', fontFace: 'Calibri',
        });
      }

      function addHeader(s, title, subtitle) {
        s.addShape('rect', {
          x: 0, y: 0, w: 10, h: 1.08,
          fill: { color: C.navy }, line: { color: C.navy },
        });
        s.addShape('rect', {
          x: 0, y: 1.08, w: 10, h: 0.055,
          fill: { color: C.gold }, line: { color: C.gold },
        });
        s.addText(title, {
          x: 0.4, y: 0.08, w: 8.8, h: 0.56,
          fontSize: 26, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle',
        });
        if (subtitle) {
          s.addText(subtitle, {
            x: 0.4, y: 0.63, w: 8.8, h: 0.36,
            fontSize: 12, color: 'B0C8E0', fontFace: 'Calibri',
          });
        }
        s.background = { color: C.gray1 };
      }

      function kpiCard(s, x, y, w, h, icon, label, value, accent) {
        s.addShape('roundRect', {
          x, y, w, h, rectRadius: 0.08,
          fill: { color: C.white },
          line: { color: C.gray2 },
          shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: 'BBBBBB', opacity: 0.35 },
        });
        s.addShape('rect', { x, y, w, h: 0.07, fill: { color: accent }, line: { color: accent } });
        s.addText(icon, {
          x, y: y + 0.1, w, h: 0.38,
          fontSize: 20, align: 'center', valign: 'middle',
        });
        s.addText(label, {
          x: x + 0.08, y: y + 0.5, w: w - 0.16, h: 0.26,
          fontSize: 8.5, color: C.gray3, align: 'center', bold: true, fontFace: 'Calibri',
        });
        s.addText(value, {
          x: x + 0.06, y: y + 0.76, w: w - 0.12, h: 0.4,
          fontSize: 12.5, color: C.navy, align: 'center', bold: true, fontFace: 'Calibri', autoFit: true,
        });
      }

      const docTitle = (doc.filename || 'Financial Document').replace(/\.[^/.]+$/, '');

      // ── Slide 1: Professional Cover ────────────────────────────────────
      ++sc;
      const s1 = pres.addSlide();
      s1.background = { color: C.navy };

      // Right panel accent
      s1.addShape('rect', { x: 7.0, y: 0, w: 3.0, h: 5.625, fill: { color: C.blue }, line: { color: C.blue } });
      s1.addShape('rect', { x: 0, y: 5.05, w: 10, h: 0.575, fill: { color: C.gold }, line: { color: C.gold } });

      // Brand badge
      s1.addShape('roundRect', { x: 7.3, y: 0.45, w: 2.4, h: 0.65, rectRadius: 0.05, fill: { color: '0A2A5A' }, line: { color: '0A2A5A' } });
      s1.addText('🏦 AI DOCUMENT SUMMARIZER', { x: 7.15, y: 0.47, w: 2.7, h: 0.6, fontSize: 7, color: C.white, align: 'center', bold: true, fontFace: 'Calibri' });

      s1.addText('BANKING ANALYSIS', { x: 0.55, y: 1.15, w: 6.2, h: 0.62, fontSize: 34, bold: true, color: C.gold, fontFace: 'Calibri' });
      s1.addText('REPORT', { x: 0.55, y: 1.72, w: 6.2, h: 0.62, fontSize: 34, bold: true, color: C.white, fontFace: 'Calibri' });

      const metaParts = [doc.bankName, doc.accountName, cur].filter(Boolean);
      if (metaParts.length > 0) {
        s1.addText(metaParts.join('  |  '), { x: 0.55, y: 2.55, w: 6.2, h: 0.38, fontSize: 14, color: 'A0C4E0', fontFace: 'Calibri' });
      }
      if (doc.periodStart) {
        s1.addText(`Period: ${doc.periodStart} – ${doc.periodEnd}`, { x: 0.55, y: 2.95, w: 6.2, h: 0.32, fontSize: 12, color: '7A9FC0', fontFace: 'Calibri' });
      }

      // Key metrics strip
      const previewKpis = [
        { label: 'Total Credits', val: `${cur} ${fmt(A.totalCredits)}` },
        { label: 'Total Debits',  val: `${cur} ${fmt(A.totalDebits)}` },
        { label: 'Net Flow',      val: `${cur} ${fmt(A.netCashFlow)}` },
        { label: 'Transactions',  val: String(A.transactionCount || 0) },
      ];
      previewKpis.forEach((m, i) => {
        const x = 0.55 + i * 1.58;
        s1.addShape('roundRect', { x, y: 3.5, w: 1.42, h: 1.0, rectRadius: 0.06, fill: { color: '0D2E5C' }, line: { color: '1A4A80' } });
        s1.addText(m.val, { x, y: 3.55, w: 1.42, h: 0.45, fontSize: 12, bold: true, color: C.gold, align: 'center', fontFace: 'Calibri', autoFit: true });
        s1.addText(m.label, { x, y: 4.0, w: 1.42, h: 0.3, fontSize: 8, color: '8AABCC', align: 'center', fontFace: 'Calibri' });
      });

      s1.addText(`Generated  •  ${today}`, { x: 0.55, y: 5.1, w: 6, h: 0.28, fontSize: 9, color: C.navy, fontFace: 'Calibri' });

      // ── Slide 2: KPI Dashboard (8 cards 4x2) ──────────────────────────
      ++sc;
      const s2 = pres.addSlide();
      addHeader(s2, 'KEY PERFORMANCE INDICATORS', `Financial snapshot  |  ${cur}`);
      addFooter(s2, docTitle, sc, TOTAL);

      const kpiDefs = [
        { icon: '💰', label: 'TOTAL CREDITS',    val: `${cur} ${fmt(A.totalCredits)}`,        accent: C.teal  },
        { icon: '💸', label: 'TOTAL DEBITS',      val: `${cur} ${fmt(A.totalDebits)}`,          accent: C.red   },
        { icon: '📈', label: 'NET CASH FLOW',     val: `${cur} ${fmt(A.netCashFlow)}`,          accent: C.blue  },
        { icon: '🔢', label: 'TRANSACTIONS',      val: String(A.transactionCount || 0),         accent: C.gold  },
        { icon: '⬆️', label: 'LARGEST CREDIT',   val: `${cur} ${fmt(A.largestCredit)}`,        accent: C.teal  },
        { icon: '⬇️', label: 'LARGEST DEBIT',    val: `${cur} ${fmt(A.largestDebit)}`,         accent: C.red   },
        { icon: '⚖️', label: 'AVG TRANSACTION',  val: `${cur} ${fmt(A.avgTransactionAmount)}`, accent: C.blue  },
        { icon: '✅',  label: 'ANOMALIES FOUND',  val: String(A.anomalyCount || 0),             accent: A.anomalyCount > 0 ? C.gold : C.teal },
      ];

      kpiDefs.forEach((k, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        kpiCard(s2, 0.28 + col * 2.37, 1.26 + row * 1.5, 2.18, 1.32, k.icon, k.label, k.val, k.accent);
      });

      // Health indicator bar
      const isHealthy = (A.netCashFlow || 0) >= 0 && (A.anomalyCount || 0) === 0;
      s2.addShape('roundRect', {
        x: 0.28, y: 4.42, w: 9.44, h: 0.6, rectRadius: 0.06,
        fill: { color: isHealthy ? 'E8F5E9' : 'FFF3E0' }, line: { color: isHealthy ? C.teal : C.gold },
      });
      s2.addShape('rect', { x: 0.28, y: 4.42, w: 0.06, h: 0.6, fill: { color: isHealthy ? C.teal : C.gold }, line: { color: isHealthy ? C.teal : C.gold } });
      const healthMsg = isHealthy
        ? `✅  ACCOUNT HEALTH: POSITIVE  —  Net inflow of ${cur} ${fmt(A.netCashFlow)} confirms a healthy savings surplus. No anomalies detected across ${A.transactionCount || 0} transactions.`
        : `⚠️  ACCOUNT STATUS: REVIEW RECOMMENDED  —  ${A.anomalyCount || 0} anomaly(ies) detected. Net flow: ${cur} ${fmt(A.netCashFlow)}.`;
      s2.addText(healthMsg, {
        x: 0.46, y: 4.44, w: 9.1, h: 0.56,
        fontSize: 10.5, color: isHealthy ? '2E7D32' : 'E65100', fontFace: 'Calibri', valign: 'middle',
      });

      // ── Slide 3: Credits vs Debits Comparison (Clustered Bar) ─────────
      ++sc;
      const s3a = pres.addSlide();
      addHeader(s3a, 'CREDITS VS DEBITS ANALYSIS', `Total credits: ${cur} ${fmt(A.totalCredits)}  |  Total debits: ${cur} ${fmt(A.totalDebits)}`);
      addFooter(s3a, docTitle, sc, TOTAL);

      // Build comparison data from categories or simple totals
      const creditDebitData = [
        { name: 'Credits', labels: ['Total Credits', 'Largest Single', 'Average Credit'], values: [
          parseFloat((A.totalCredits || 0).toFixed(2)),
          parseFloat((A.largestCredit || 0).toFixed(2)),
          parseFloat((A.avgTransactionAmount || 0).toFixed(2)),
        ]},
        { name: 'Debits', labels: ['Total Debits', 'Largest Single', 'Average Debit'], values: [
          parseFloat((A.totalDebits || 0).toFixed(2)),
          parseFloat((A.largestDebit || 0).toFixed(2)),
          parseFloat((A.avgTransactionAmount || 0).toFixed(2)),
        ]},
      ];

      s3a.addChart(pres.ChartType.bar, creditDebitData, {
        x: 0.35, y: 1.25, w: 5.9, h: 3.85,
        barDir: 'col', barGrouping: 'clustered',
        chartColors: [C.teal, C.red],
        showLegend: true, legendPos: 'b', legendFontSize: 10,
        showValue: true,
        dataLabelFontSize: 8,
        dataLabelPosition: 'outEnd',
        dataLabelColor: C.navy,
        catAxisLabelFontSize: 10, valAxisLabelFontSize: 8.5,
        catAxisLabelColor: C.navy, valAxisLabelColor: C.gray3,
        catGridLine: { style: 'none' },
        valGridLine: { style: 'dash', color: C.gray2, size: 0.5 },
        showTitle: true, title: 'Credits vs Debits Comparison', titleFontSize: 11, titleColor: C.navy,
      });

      // Right summary panel
      const netFlow3 = (A.netCashFlow || 0);
      const netColor3 = netFlow3 >= 0 ? C.teal : C.red;
      s3a.addShape('roundRect', {
        x: 6.55, y: 1.25, w: 3.15, h: 3.85, rectRadius: 0.08,
        fill: { color: C.white }, line: { color: C.gray2 },
        shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: 'BBBBBB', opacity: 0.3 },
      });
      s3a.addText('SUMMARY', { x: 6.7, y: 1.4, w: 2.85, h: 0.3, fontSize: 10, bold: true, color: C.navy, align: 'center', fontFace: 'Calibri', charSpacing: 1 });

      const summaryRows3 = [
        { label: 'Total Credits', val: `${cur} ${fmt(A.totalCredits)}`, color: C.teal },
        { label: 'Total Debits',  val: `${cur} ${fmt(A.totalDebits)}`,  color: C.red  },
        { label: 'Net Cash Flow', val: `${cur} ${fmt(A.netCashFlow)}`,  color: netColor3 },
        { label: 'Transactions',  val: String(A.transactionCount || 0), color: C.blue },
      ];
      summaryRows3.forEach((row, i) => {
        const y3 = 1.85 + i * 0.72;
        s3a.addShape('roundRect', { x: 6.7, y: y3, w: 2.85, h: 0.62, rectRadius: 0.06, fill: { color: C.gray1 }, line: { color: C.gray2 } });
        s3a.addText(row.label, { x: 6.78, y: y3 + 0.05, w: 2.7, h: 0.24, fontSize: 8.5, color: C.gray3, fontFace: 'Calibri', bold: true });
        s3a.addText(row.val, { x: 6.78, y: y3 + 0.28, w: 2.7, h: 0.28, fontSize: 13, color: row.color, fontFace: 'Calibri', bold: true });
      });

      // ── Slide 4: Monthly Cash Flow Chart ──────────────────────────────
      if (monthly.length > 0) {
        ++sc;
        const s3 = pres.addSlide();
        addHeader(s3, 'MONTHLY CASH FLOW OVERVIEW', 'Credits vs Debits and net flow by month');
        addFooter(s3, docTitle, sc, TOTAL);

        const barDataMonthly = [
          { name: 'Credits', labels: monthly.map(m => m.month || ''), values: monthly.map(m => parseFloat((m.credits || 0).toFixed(2))) },
          { name: 'Debits',  labels: monthly.map(m => m.month || ''), values: monthly.map(m => parseFloat((m.debits  || 0).toFixed(2))) },
        ];

        s3.addChart(pres.ChartType.bar, barDataMonthly, {
          x: 0.35, y: 1.25, w: 6.2, h: 3.85,
          barDir: 'col', barGrouping: 'clustered',
          chartColors: [C.teal, C.red],
          showLegend: true, legendPos: 'b', legendFontSize: 10,
          showValue: true, dataLabelFontSize: 7.5,
          dataLabelPosition: 'outEnd', dataLabelColor: C.navy,
          catAxisLabelFontSize: 9.5, valAxisLabelFontSize: 8.5,
          catAxisLabelColor: C.navy, valAxisLabelColor: C.gray3,
          catGridLine: { style: 'none' },
          valGridLine: { style: 'dash', color: C.gray2, size: 0.5 },
          showTitle: true, title: 'Monthly Credits vs Debits', titleFontSize: 11, titleColor: C.navy,
        });

        // Net flow panel
        const netMax3 = Math.max(...monthly.map(m => Math.abs(m.net || 0)), 1);
        const panelX3 = 6.85;
        s3.addShape('roundRect', {
          x: panelX3, y: 1.25, w: 2.85, h: 3.85, rectRadius: 0.08,
          fill: { color: C.white }, line: { color: C.gray2 },
          shadow: { type: 'outer', blur: 5, offset: 2, angle: 90, color: 'BBBBBB', opacity: 0.3 },
        });
        s3.addText('NET FLOW BY MONTH', { x: panelX3 + 0.12, y: 1.38, w: 2.62, h: 0.28, fontSize: 9, bold: true, color: C.navy, fontFace: 'Calibri', align: 'center', charSpacing: 0.5 });

        const itemH4 = 3.25 / Math.max(monthly.length, 1);
        monthly.forEach((mo, i) => {
          const y4 = 1.75 + i * itemH4;
          const netC = (mo.net || 0) >= 0 ? C.teal : C.red;
          s3.addText(mo.month || '', { x: panelX3 + 0.12, y: y4, w: 1.5, h: 0.26, fontSize: 9, color: C.gray3, fontFace: 'Calibri', bold: true });
          s3.addText(`${(mo.net || 0) >= 0 ? '+' : ''}${cur} ${fmt(mo.net)}`, { x: panelX3 + 0.12, y: y4 + 0.24, w: 2.62, h: itemH4 - 0.32, fontSize: 11.5, color: netC, bold: true, fontFace: 'Calibri' });
          // Mini progress bar
          if (itemH4 > 0.65) {
            s3.addShape('roundRect', { x: panelX3 + 0.12, y: y4 + itemH4 - 0.2, w: 2.6, h: 0.1, fill: { color: C.gray2 }, line: { color: C.gray2 }, rectRadius: 0.05 });
            const bW = Math.max((Math.abs(mo.net || 0) / netMax3) * 2.6, 0.06);
            s3.addShape('roundRect', { x: panelX3 + 0.12, y: y4 + itemH4 - 0.2, w: bW, h: 0.1, fill: { color: netC }, line: { color: netC }, rectRadius: 0.05 });
          }
        });
        s3.addText('*Monthly values from account transaction data.', { x: 0.35, y: 5.1, w: 6.2, h: 0.2, fontSize: 8, color: C.gray3, fontFace: 'Calibri' });
      }

      // ── Slide 5: Spending by Category – Donut + Legend ─────────────────
      if (catData.length > 0) {
        ++sc;
        const s4 = pres.addSlide();
        addHeader(s4, 'SPENDING BY CATEGORY', `Total outflows: ${cur} ${fmt(catTotal)}`);
        addFooter(s4, docTitle, sc, TOTAL);

        const pieData = [{ name: 'Spending', labels: catData.map(([cat]) => cat.slice(0, 20)), values: catData.map(([, v]) => parseFloat(v.toFixed(2))) }];

        s4.addChart(pres.ChartType.doughnut, pieData, {
          x: 0.35, y: 1.25, w: 4.6, h: 3.95,
          chartColors: C.chart.slice(0, catData.length),
          showLegend: false,
          showValue: true, dataLabelFontSize: 9.5, dataLabelColor: 'FFFFFF',
          holeSize: 52,
          showTitle: true, title: `Total: ${cur} ${fmt(catTotal)}`, titleFontSize: 10.5, titleColor: C.navy,
        });

        // Legend cards
        const legX = 5.25;
        let legY = 1.28;
        const lH = Math.min(3.88 / Math.max(catData.length, 1), 0.74);
        catData.forEach(([cat, val], i) => {
          const pct = catTotal > 0 ? (val / catTotal) * 100 : 0;
          const cc = C.chart[i % C.chart.length];
          s4.addShape('roundRect', { x: legX, y: legY, w: 4.45, h: lH - 0.06, fill: { color: C.white }, line: { color: C.gray2 }, rectRadius: 0.07, shadow: { type: 'outer', blur: 4, offset: 1, angle: 90, color: 'CCCCCC', opacity: 0.3 } });
          s4.addShape('roundRect', { x: legX + 0.1, y: legY + lH * 0.22, w: 0.2, h: 0.2, fill: { color: cc }, line: { color: cc }, rectRadius: 0.04 });
          s4.addText(cat, { x: legX + 0.4, y: legY + 0.05, w: 2.4, h: 0.24, fontSize: 9, color: C.gray3, fontFace: 'Calibri', bold: true });
          s4.addText(`${cur} ${fmt(val)}`, { x: legX + 0.4, y: legY + 0.26, w: 2.4, h: 0.26, fontSize: 11, color: C.navy, fontFace: 'Calibri', bold: true });
          s4.addText(`${pct.toFixed(1)}%`, { x: legX + 3.75, y: legY + 0.08, w: 0.6, h: lH - 0.18, fontSize: 13, color: cc, fontFace: 'Calibri', bold: true, align: 'right', valign: 'middle' });
          if (lH > 0.56) {
            s4.addShape('roundRect', { x: legX + 0.4, y: legY + lH - 0.2, w: 3.3, h: 0.1, fill: { color: C.gray2 }, line: { color: C.gray2 }, rectRadius: 0.05 });
            const bW4 = Math.max((pct / 100) * 3.3, 0.07);
            s4.addShape('roundRect', { x: legX + 0.4, y: legY + lH - 0.2, w: bW4, h: 0.1, fill: { color: cc }, line: { color: cc }, rectRadius: 0.05 });
          }
          legY += lH;
        });

        // ── Slide 6: Category Horizontal Bar Ranking ─────────────────────
        ++sc;
        const s4b = pres.addSlide();
        addHeader(s4b, 'CATEGORY SPENDING RANKING', `Ranked by outflow amount  |  ${catData.length} categories`);
        addFooter(s4b, docTitle, sc, TOTAL);

        const hbarData = [{ name: 'Spending (INR)', labels: [...catData].reverse().map(([c]) => c), values: [...catData].reverse().map(([,v]) => parseFloat(v.toFixed(2))) }];
        s4b.addChart(pres.ChartType.bar, hbarData, {
          x: 0.35, y: 1.25, w: 9.3, h: 3.95,
          barDir: 'bar',
          chartColors: [...C.chart].reverse().slice(0, catData.length),
          showLegend: false,
          showValue: true, dataLabelFontSize: 10, dataLabelPosition: 'outEnd', dataLabelColor: C.navy,
          catAxisLabelFontSize: 11, catAxisLabelColor: C.navy,
          valAxisLabelFontSize: 8.5, valAxisLabelColor: C.gray3,
          catGridLine: { style: 'none' },
          valGridLine: { style: 'dash', color: C.gray2, size: 0.5 },
          showTitle: true, title: 'Category Spending (Descending)', titleFontSize: 11, titleColor: C.navy,
        });
      }

      // ── Slide 7: Transaction Table ─────────────────────────────────────
      ++sc;
      const s5 = pres.addSlide();
      addHeader(s5, 'TRANSACTION DETAILS', `Top 15 of ${txs.length} transactions  •  ${A.anomalyCount || 0} anomalies detected`);
      addFooter(s5, docTitle, sc, TOTAL);

      const tCols = [
        { x: 0.2, w: 1.18 },   // Date
        { x: 1.42, w: 3.6  },  // Description
        { x: 5.06, w: 1.5  },  // Category
        { x: 6.6,  w: 1.55 },  // Debit
        { x: 8.19, w: 1.61 },  // Credit
      ];
      const tHeaders = ['DATE', 'DESCRIPTION', 'CATEGORY', 'DEBIT', 'CREDIT'];

      // Header row
      s5.addShape('roundRect', { x: 0.2, y: 1.27, w: 9.6, h: 0.38, fill: { color: C.navy }, line: { color: C.navy }, rectRadius: 0.04 });
      tHeaders.forEach((h, i) => {
        s5.addText(h, {
          x: tCols[i].x + 0.07, y: 1.28, w: tCols[i].w - 0.1, h: 0.36,
          fontSize: 9, color: C.gold, bold: true, fontFace: 'Calibri', charSpacing: 0.5, valign: 'middle',
          align: i >= 3 ? 'right' : 'left',
        });
      });

      const topTxs = txs.slice(0, 15);
      const rowH5 = 3.65 / Math.max(topTxs.length, 1);

      topTxs.forEach((t, ri) => {
        const ry = 1.68 + ri * rowH5;
        const bgColor = t.isAnomaly ? 'FFF3E0' : ri % 2 === 0 ? C.white : C.gray1;
        const bdrColor = t.isAnomaly ? C.gold : C.gray2;
        s5.addShape('rect', { x: 0.2, y: ry, w: 9.6, h: rowH5, fill: { color: bgColor }, line: { color: bdrColor } });
        const cells = [
          t.date || '',
          (t.description || '').slice(0, 44),
          (t.category || '').slice(0, 16),
          t.debit  != null ? fmt(t.debit)  : '—',
          t.credit != null ? fmt(t.credit) : '—',
        ];
        const textColors = [C.gray3, C.navy, C.gray3, C.red, C.teal];
        cells.forEach((cell, ci) => {
          s5.addText(cell, {
            x: tCols[ci].x + 0.07, y: ry + 0.02, w: tCols[ci].w - 0.1, h: rowH5 - 0.04,
            fontSize: 8, color: textColors[ci], fontFace: 'Calibri', valign: 'middle',
            align: ci >= 3 ? 'right' : 'left',
          });
        });
      });

      // ── Slide 8: Anomaly Detection ─────────────────────────────────────
      if ((A.anomalyCount || 0) > 0) {
        ++sc;
        const anomalies = (A.anomalies || []).slice(0, 6);
        const s6 = pres.addSlide();
        addHeader(s6, 'ANOMALY DETECTION', `${A.anomalyCount} unusual transaction(s) flagged for review`);
        addFooter(s6, docTitle, sc, TOTAL);

        const cols6 = anomalies.length <= 3 ? 1 : 2;
        const rows6 = Math.ceil(anomalies.length / cols6);
        const gap6 = 0.22;
        const cW6 = cols6 === 1 ? 9.4 : (9.4 - gap6) / 2;
        const cH6 = Math.min((3.9 - gap6 * (rows6 - 1)) / rows6, 1.6);

        anomalies.forEach((a, i) => {
          const col6 = i % cols6, row6 = Math.floor(i / cols6);
          const x6 = 0.3 + col6 * (cW6 + gap6);
          const y6 = 1.3 + row6 * (cH6 + gap6);
          s6.addShape('roundRect', { x: x6, y: y6, w: cW6, h: cH6, fill: { color: 'FFF8E1' }, line: { color: 'FFD54F' }, rectRadius: 0.1 });
          s6.addShape('rect', { x: x6, y: y6, w: cW6, h: 0.07, fill: { color: C.gold }, line: { color: C.gold } });
          s6.addText(`⚠️  ${a.date || ''}  —  ${(a.description || '').slice(0, 42)}`, { x: x6 + 0.15, y: y6 + 0.12, w: cW6 - 0.3, h: 0.3, fontSize: 9.5, color: 'B45309', bold: true, fontFace: 'Calibri' });
          s6.addText(a.reason || 'Unusual transaction pattern', { x: x6 + 0.15, y: y6 + 0.44, w: cW6 - (a.amount != null ? 1.5 : 0.3), h: cH6 - 0.58, fontSize: 9, color: C.gray3, fontFace: 'Calibri', valign: 'top' });
          if (a.amount != null) {
            s6.addText(`${cur} ${fmt(a.amount)}`, { x: x6 + cW6 - 1.4, y: y6 + 0.44, w: 1.2, h: cH6 - 0.58, fontSize: 13, color: 'B45309', bold: true, fontFace: 'Calibri', align: 'right', valign: 'top' });
          }
        });
      }

      // ── Slide 9: AI Executive Summary (4-card grid) ──────────────────
      if (doc.summary) {
        ++sc;
        const s7 = pres.addSlide();
        addHeader(s7, 'AI EXECUTIVE SUMMARY', 'AI-generated analysis of your financial document');
        addFooter(s7, docTitle, sc, TOTAL);

        // Split summary into 4 insight blocks
        const summaryText = (doc.summary || '').replace(/#{1,6}\s+/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
        const paragraphs = summaryText.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20).slice(0, 4);
        const insightTitles = ['Overall Health', 'Spending Patterns', 'Risk & Anomalies', 'Recommendations'];
        const insightIcons = ['📊', '💳', '✅', '💡'];

        while (paragraphs.length < 4) paragraphs.push('No additional details available for this section.');

        paragraphs.forEach((para, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x7 = 0.28 + col * 4.87;
          const y7 = 1.28 + row * 1.95;
          s7.addShape('roundRect', { x: x7, y: y7, w: 4.65, h: 1.82, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.gray2 }, shadow: { type: 'outer', blur: 5, offset: 2, angle: 90, color: 'BBBBBB', opacity: 0.28 } });
          s7.addShape('rect', { x: x7, y: y7, w: 4.65, h: 0.07, fill: { color: C.blue }, line: { color: C.blue } });
          s7.addText(insightIcons[i], { x: x7, y: y7 + 0.1, w: 0.58, h: 0.4, fontSize: 19, align: 'center' });
          s7.addText(insightTitles[i], { x: x7 + 0.54, y: y7 + 0.1, w: 4.0, h: 0.4, fontSize: 12.5, bold: true, color: C.navy, fontFace: 'Calibri', valign: 'middle' });
          s7.addText(para.slice(0, 280), { x: x7 + 0.15, y: y7 + 0.55, w: 4.35, h: 1.2, fontSize: 9.5, color: '37474F', fontFace: 'Calibri', valign: 'top' });
        });
      }

      // ── Slide 10: Closing ─────────────────────────────────────────────
      ++sc;
      const s8 = pres.addSlide();
      s8.background = { color: C.navy };

      s8.addShape('rect', { x: 0, y: 4.5, w: 10, h: 1.125, fill: { color: C.blue }, line: { color: C.blue } });
      s8.addShape('rect', { x: 0, y: 4.5, w: 10, h: 0.07, fill: { color: C.gold }, line: { color: C.gold } });

      s8.addText('✅', { x: 0, y: 1.0, w: 10, h: 0.9, fontSize: 50, align: 'center' });
      s8.addText('ANALYSIS COMPLETE', { x: 0.5, y: 1.9, w: 9, h: 0.72, fontSize: 34, bold: true, color: C.gold, align: 'center', fontFace: 'Calibri' });
      s8.addText('All transactions successfully processed and reviewed', { x: 1, y: 2.65, w: 8, h: 0.42, fontSize: 15, color: 'B0C4DE', align: 'center', fontFace: 'Calibri' });

      const statItems = [
        { label: 'Transactions\nAnalysed', val: String(A.transactionCount || 0) },
        { label: 'Anomalies\nFound', val: String(A.anomalyCount || 0) },
        { label: 'Spending\nCategories', val: String(catData.length) },
      ];
      statItems.forEach((stat, i) => {
        const sx = 1.5 + i * 2.5;
        s8.addShape('roundRect', { x: sx, y: 3.2, w: 2.1, h: 1.0, rectRadius: 0.07, fill: { color: '0D2E5C' }, line: { color: '1A4A80' } });
        s8.addText(stat.val, { x: sx, y: 3.24, w: 2.1, h: 0.5, fontSize: 26, bold: true, color: C.gold, align: 'center', fontFace: 'Calibri' });
        s8.addText(stat.label, { x: sx, y: 3.72, w: 2.1, h: 0.38, fontSize: 8.5, color: '7A9FC0', align: 'center', fontFace: 'Calibri' });
      });

      s8.addText(`Generated by AI Document Summarizer  •  ${today}  •  Confidential`, {
        x: 0.5, y: 4.58, w: 9, h: 0.5, fontSize: 11, color: C.white, align: 'center', fontFace: 'Calibri',
      });

      // ── Write file ─────────────────────────────────────────────────────
      const fsm = require('fs');
      const pathm = require('path');
      const osm = require('os');
      const tmpFile = pathm.join(osm.tmpdir(), `${safeName}_report_${Date.now()}.pptx`);
      await pres.writeFile({ fileName: tmpFile });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_report.pptx"`);
      const fileBuffer = fsm.readFileSync(tmpFile);
      fsm.unlinkSync(tmpFile);
      return res.send(fileBuffer);
    }

    res.status(400).json({ message: `Unknown format: ${format}` });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: `Export failed: ${err.message}` });
  }
});

module.exports = router;