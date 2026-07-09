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
      const catData = Object.entries(A.categoryBreakdown || {});
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
      const catData = Object.entries(A.categoryBreakdown || {}).sort(([,a],[,b]) => b-a).slice(0, 8);
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

      const NAVY = '1e3a5f';
      const TEAL = '0ea5e9';
      const GREEN = '10b981';
      const RED = 'ef4444';
      const GOLD = 'f59e0b';
      const LIGHT = 'f0f9ff';
      const WHITE = 'ffffff';
      const GRAY = '64748b';
      const fmt = n => n != null ? Number(n).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '0.00';

      // ── Slide 1: Cover ────────────────────────────────────────────────
      const s1 = pres.addSlide();
      s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: NAVY } });
      s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 4.2, w: 10, h: 1.425, fill: { color: TEAL } });
      s1.addShape(pres.shapes.OVAL, { x: 7.5, y: -1, w: 4, h: 4, fill: { color: '1e4d7a' }, line: { color: '1e4d7a' } });
      s1.addText('🏦', { x: 0.5, y: 0.8, w: 1, h: 1, fontSize: 40 });
      s1.addText('Banking Analysis Report', { x: 0.5, y: 1.7, w: 9, h: 0.9, fontSize: 32, bold: true, color: WHITE, fontFace: 'Calibri' });
      s1.addText(doc.filename || 'Financial Document', { x: 0.5, y: 2.55, w: 9, h: 0.5, fontSize: 16, color: 'bae6fd', fontFace: 'Calibri' });
      const metaLine = [doc.bankName, doc.accountName, cur, doc.periodStart ? `${doc.periodStart} → ${doc.periodEnd}` : ''].filter(Boolean).join('  •  ');
      s1.addText(metaLine, { x: 0.5, y: 4.3, w: 9, h: 0.5, fontSize: 12, color: NAVY, bold: true });
      s1.addText(`Generated ${new Date().toLocaleDateString()}`, { x: 0.5, y: 4.9, w: 9, h: 0.4, fontSize: 10, color: NAVY });

      // ── Slide 2: Key Metrics ──────────────────────────────────────────
      const s2 = pres.addSlide();
      s2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.7, fill: { color: NAVY } });
      s2.addText('Key Financial Metrics', { x: 0.3, y: 0.1, w: 9.4, h: 0.5, fontSize: 20, bold: true, color: WHITE });
      const metrics = [
        { label: 'Total Credits', val: `${cur} ${fmt(A.totalCredits)}`, icon: '💚', color: GREEN },
        { label: 'Total Debits', val: `${cur} ${fmt(A.totalDebits)}`, icon: '🔴', color: RED },
        { label: 'Net Cash Flow', val: `${cur} ${fmt(A.netCashFlow)}`, icon: '📊', color: A.netCashFlow >= 0 ? TEAL : GOLD },
        { label: 'Transactions', val: String(A.transactionCount || 0), icon: '🔢', color: NAVY },
        { label: 'Largest Credit', val: `${cur} ${fmt(A.largestCredit)}`, icon: '⬆️', color: GREEN },
        { label: 'Largest Debit', val: `${cur} ${fmt(A.largestDebit)}`, icon: '⬇️', color: RED },
        { label: 'Avg Transaction', val: `${cur} ${fmt(A.avgTransactionAmount)}`, icon: '📈', color: TEAL },
        { label: 'Anomalies', val: String(A.anomalyCount || 0), icon: '⚠️', color: GOLD },
      ];
      metrics.forEach((m, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const x = 0.18 + col * 2.46, y = 0.9 + row * 2.2;
        s2.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 2.3, h: 1.9, fill: { color: LIGHT }, line: { color: 'e2e8f0', width: 1 }, rectRadius: 0.12 });
        s2.addText(m.icon, { x, y: y + 0.12, w: 2.3, h: 0.5, fontSize: 22, align: 'center' });
        s2.addText(m.val, { x, y: y + 0.6, w: 2.3, h: 0.55, fontSize: 14, bold: true, color: m.color, align: 'center', fontFace: 'Calibri' });
        s2.addText(m.label, { x, y: y + 1.22, w: 2.3, h: 0.4, fontSize: 9, color: GRAY, align: 'center' });
      });

      // ── Slide 3: Cash Flow Bar Chart (manual bars) ────────────────────
      const monthly = (A.monthlyFlow || []).slice(-6);
      if (monthly.length > 0) {
        const s3 = pres.addSlide();
        s3.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.7, fill: { color: NAVY } });
        s3.addText('Monthly Cash Flow', { x: 0.3, y: 0.1, w: 9.4, h: 0.5, fontSize: 20, bold: true, color: WHITE });
        const maxVal = Math.max(...monthly.map(m => Math.max(m.credits || 0, m.debits || 0)), 1);
        const chartH = 3.2, chartY = 1.0, chartX = 0.8, barW = 0.35, groupGap = 1.3;
        monthly.forEach((m, i) => {
          const gx = chartX + i * groupGap;
          const credH = ((m.credits || 0) / maxVal) * chartH;
          const debH = ((m.debits || 0) / maxVal) * chartH;
          s3.addShape(pres.shapes.RECTANGLE, { x: gx, y: chartY + chartH - credH, w: barW, h: credH, fill: { color: GREEN }, line: { color: GREEN } });
          s3.addShape(pres.shapes.RECTANGLE, { x: gx + barW + 0.05, y: chartY + chartH - debH, w: barW, h: debH, fill: { color: RED }, line: { color: RED } });
          s3.addText(m.month || '', { x: gx - 0.1, y: chartY + chartH + 0.05, w: 0.9, h: 0.3, fontSize: 8, color: GRAY, align: 'center' });
        });
        // Legend
        s3.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 1.2, w: 0.25, h: 0.15, fill: { color: GREEN } });
        s3.addText('Credits', { x: 7.5, y: 1.15, w: 1.5, h: 0.25, fontSize: 9, color: GRAY });
        s3.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 1.5, w: 0.25, h: 0.15, fill: { color: RED } });
        s3.addText('Debits', { x: 7.5, y: 1.45, w: 1.5, h: 0.25, fontSize: 9, color: GRAY });
        // Net values row
        s3.addText('Net Cash Flow by Month', { x: 0.3, y: 4.35, w: 9, h: 0.3, fontSize: 10, bold: true, color: NAVY });
        monthly.forEach((m, i) => {
          const gx = 0.5 + i * groupGap;
          const netColor = (m.net || 0) >= 0 ? GREEN : RED;
          s3.addText(`${(m.net || 0) >= 0 ? '+' : ''}${fmt(m.net || 0)}`, { x: gx, y: 4.7, w: 1.1, h: 0.3, fontSize: 8, color: netColor, bold: true, align: 'center' });
        });
      }

      // ── Slide 4: Category Breakdown ───────────────────────────────────
      const catData = Object.entries(A.categoryBreakdown || {}).sort(([,a],[,b]) => b-a).slice(0, 8);
      if (catData.length > 0) {
        const s4 = pres.addSlide();
        s4.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.7, fill: { color: NAVY } });
        s4.addText('Spending by Category', { x: 0.3, y: 0.1, w: 9.4, h: 0.5, fontSize: 20, bold: true, color: WHITE });
        const total = catData.reduce((s, [, v]) => s + v, 0);
        const CAT_COLORS_PPT = [TEAL, '8b5cf6', GOLD, RED, GREEN, '06b6d4', 'f97316', '84cc16'];
        catData.forEach(([cat, val], i) => {
          const pct = total > 0 ? ((val / total) * 100) : 0;
          const y = 0.85 + i * 0.57;
          const barColor = CAT_COLORS_PPT[i % CAT_COLORS_PPT.length];
          s4.addText(cat, { x: 0.3, y, w: 2.8, h: 0.38, fontSize: 10, color: '1e293b', valign: 'middle' });
          s4.addShape(pres.shapes.RECTANGLE, { x: 3.2, y: y + 0.08, w: 4.5, h: 0.22, fill: { color: 'e2e8f0' } });
          if (pct > 0) s4.addShape(pres.shapes.RECTANGLE, { x: 3.2, y: y + 0.08, w: (pct / 100) * 4.5, h: 0.22, fill: { color: barColor } });
          s4.addText(`${pct.toFixed(1)}%`, { x: 7.8, y, w: 0.7, h: 0.38, fontSize: 9.5, bold: true, color: barColor, align: 'center', valign: 'middle' });
          s4.addText(`${cur} ${fmt(val)}`, { x: 8.55, y, w: 1.3, h: 0.38, fontSize: 9, color: GRAY, valign: 'middle', align: 'right' });
        });
      }

      // ── Slide 5: Top Transactions ─────────────────────────────────────
      const s5 = pres.addSlide();
      s5.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.7, fill: { color: NAVY } });
      s5.addText('Transaction Details (Top 15)', { x: 0.3, y: 0.1, w: 9.4, h: 0.5, fontSize: 20, bold: true, color: WHITE });
      // Table header
      const tCols = [{ x: 0.1, w: 1.2 }, { x: 1.35, w: 3.6 }, { x: 5.0, w: 1.6 }, { x: 6.65, w: 1.6 }, { x: 8.3, w: 1.6 }];
      const tHeaders = ['Date', 'Description', 'Category', 'Debit', 'Credit'];
      s5.addShape(pres.shapes.RECTANGLE, { x: 0.1, y: 0.75, w: 9.8, h: 0.3, fill: { color: TEAL } });
      tHeaders.forEach((h, i) => s5.addText(h, { x: tCols[i].x + 0.05, y: 0.78, w: tCols[i].w - 0.1, h: 0.24, fontSize: 8.5, bold: true, color: WHITE }));
      const topTx = txs.slice(0, 15);
      topTx.forEach((t, ri) => {
        const ry = 1.1 + ri * 0.29;
        if (ri % 2 === 0) s5.addShape(pres.shapes.RECTANGLE, { x: 0.1, y: ry, w: 9.8, h: 0.27, fill: { color: 'f8fafc' }, line: { color: 'f8fafc' } });
        const cells = [t.date || '', (t.description || '').slice(0, 36), (t.category || '').slice(0, 14),
          t.debit != null ? fmt(t.debit) : '', t.credit != null ? fmt(t.credit) : ''];
        const colors = ['1e293b', '1e293b', GRAY, RED, GREEN];
        cells.forEach((cell, ci) => {
          s5.addText(cell, { x: tCols[ci].x + 0.05, y: ry + 0.04, w: tCols[ci].w - 0.1, h: 0.21, fontSize: 7.5, color: colors[ci], valign: 'middle' });
        });
        if (t.isAnomaly) s5.addText('⚠️', { x: 9.7, y: ry + 0.03, w: 0.25, h: 0.24, fontSize: 8 });
      });

      // ── Slide 6: Anomalies ────────────────────────────────────────────
      const anomalies = (A.anomalies || []).slice(0, 6);
      const s6 = pres.addSlide();
      s6.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.7, fill: { color: NAVY } });
      s6.addText(`Anomaly Detection (${A.anomalyCount || 0} found)`, { x: 0.3, y: 0.1, w: 9.4, h: 0.5, fontSize: 20, bold: true, color: WHITE });
      if (anomalies.length === 0) {
        s6.addText('✅', { x: 4, y: 2, w: 2, h: 1.5, fontSize: 60, align: 'center' });
        s6.addText('No anomalies detected — transactions look clean!', { x: 1, y: 3.4, w: 8, h: 0.6, fontSize: 16, color: GREEN, bold: true, align: 'center' });
      } else {
        anomalies.forEach((a, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x = 0.2 + col * 4.9, y = 0.9 + row * 1.55;
          s6.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.6, h: 1.4, fill: { color: 'fff7ed' }, line: { color: 'fed7aa', width: 1 }, rectRadius: 0.1 });
          s6.addText(`⚠️ ${a.date || ''}`, { x: x + 0.12, y: y + 0.1, w: 4.3, h: 0.28, fontSize: 9, bold: true, color: 'c2410c' });
          s6.addText((a.description || '').slice(0, 55), { x: x + 0.12, y: y + 0.38, w: 4.3, h: 0.28, fontSize: 8.5, color: '1e293b' });
          s6.addText(a.reason || '', { x: x + 0.12, y: y + 0.68, w: 4.3, h: 0.28, fontSize: 8, color: GRAY });
          if (a.amount != null) s6.addText(`${cur} ${fmt(a.amount)}`, { x: x + 0.12, y: y + 0.98, w: 4.3, h: 0.28, fontSize: 10, bold: true, color: 'c2410c' });
        });
      }

      // ── Slide 7: AI Summary ───────────────────────────────────────────
      if (doc.summary) {
        const s7 = pres.addSlide();
        s7.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.7, fill: { color: NAVY } });
        s7.addText('AI Executive Summary', { x: 0.3, y: 0.1, w: 9.4, h: 0.5, fontSize: 20, bold: true, color: WHITE });
        const cleaned = doc.summary.replace(/#{1,6}\s+/g, '').replace(/\*\*/g, '').replace(/\*/g, '').slice(0, 1800);
        s7.addText(cleaned, { x: 0.4, y: 0.85, w: 9.2, h: 4.6, fontSize: 9, color: '1e293b', lineSpacingMultiple: 1.3, valign: 'top' });
      }

      // ── Slide 8: Closing ──────────────────────────────────────────────
      const s8 = pres.addSlide();
      s8.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: NAVY } });
      s8.addShape(pres.shapes.RECTANGLE, { x: 0, y: 4.5, w: 10, h: 1.125, fill: { color: TEAL } });
      s8.addText('🏦', { x: 4, y: 0.6, w: 2, h: 1, fontSize: 55, align: 'center' });
      s8.addText('Analysis Complete', { x: 0.5, y: 1.7, w: 9, h: 0.8, fontSize: 30, bold: true, color: WHITE, align: 'center' });
      s8.addText(`${A.transactionCount || 0} transactions analysed  •  ${A.anomalyCount || 0} anomalies found`, {
        x: 0.5, y: 2.55, w: 9, h: 0.45, fontSize: 13, color: 'bae6fd', align: 'center',
      });
      s8.addText('Generated by AI Document Summarizer', { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 10, color: NAVY, align: 'center', bold: true });

      const tmpFile = `/tmp/${safeName}_report.pptx`;
      await pres.writeFile({ fileName: tmpFile });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_report.pptx"`);
      const fs = require('fs');
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