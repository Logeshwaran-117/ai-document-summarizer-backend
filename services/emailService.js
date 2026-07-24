// server/services/emailService.js
//
// Transactional email sender using Nodemailer.
// Supports: welcome, payment confirmation, password reset,
//           document summary ready, usage limit warnings (80% / 100%).
//
// Required env vars:
//   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM, FRONTEND_URL

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_PORT === "465",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4,
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

if (process.env.NODE_ENV !== "test") {
  transporter.verify().catch((err) =>
    console.warn("⚠️  Email transporter not ready:", err.message)
  );
}

const FROM = process.env.EMAIL_FROM || "DocSummarizer <no-reply@docsummarizer.com>";
const APP  = process.env.FRONTEND_URL || "http://localhost:5173";

async function send({ to, subject, html, text }) {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html, text });
    console.log(`✉️  Email sent → ${to} [${subject}]`);
    return true;
  } catch (err) {
    console.error(`❌ Email failed → ${to} [${subject}]:`, err.message);
    return false;
  }
}

function shell(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;padding:28px 36px;">
            <span style="color:#fff;font-size:1.1rem;font-weight:700;letter-spacing:-0.01em;">
              📑 DocSummarizer
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 36px;border-top:1px solid #f3f4f6;
                     color:#9ca3af;font-size:0.78rem;line-height:1.6;">
            You're receiving this because you have an account at
            <a href="${APP}" style="color:#2563eb;">${APP}</a>.
            <br/>Questions? Reply to this email or contact
            <a href="mailto:support@docsummarizer.com" style="color:#2563eb;">
              support@docsummarizer.com
            </a>.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();
}

function btn(label, href, bg = "#2563eb") {
  return `
    <a href="${href}"
       style="display:inline-block;background:${bg};color:#fff;
              text-decoration:none;padding:12px 28px;border-radius:10px;
              font-weight:700;font-size:0.95rem;margin:8px 0;">
      ${label}
    </a>
  `;
}

function h1(text) {
  return `<h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:800;
                      color:#111827;letter-spacing:-0.02em;">${text}</h1>`;
}

function p(text, style = "") {
  return `<p style="margin:0 0 16px;color:#374151;font-size:0.95rem;
                     line-height:1.7;${style}">${text}</p>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(user) {
  const name = user.name?.split(" ")[0] || "there";

  const html = shell("Welcome to DocSummarizer", `
    ${h1(`Welcome, ${name}!`)}
    ${p("Your account is ready. Here's what you can do right now:")}

    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
      ${[
        ["📄", "Summarize a document", "Upload any PDF or DOCX and get a plain-English summary in seconds.", "/upload"],
        ["📊", "Extract tables",        "Pull structured data out of PDFs and spreadsheets.",                "/excel"],
        ["🏦", "Analyze bank statements","Categorize spend and generate reports from bank PDFs.",           "/banking"],
      ].map(([icon, title, desc, path]) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
            <span style="font-size:1.4rem;margin-right:12px;">${icon}</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
            <strong style="display:block;color:#111827;margin-bottom:2px;">${title}</strong>
            <span style="color:#6b7280;font-size:0.875rem;">${desc}</span>
          </td>
        </tr>
      `).join("")}
    </table>

    ${btn("Open your dashboard", `${APP}/`)}

    ${p("You're on the <strong>Free plan</strong> — 5 summaries and 2 table extractions per day. "
      + `<a href="${APP}/pricing" style="color:#2563eb;">See all plans</a> if you need more.`, "margin-top:24px;")}
  `);

  return send({
    to: user.email,
    subject: `Welcome to DocSummarizer, ${name}!`,
    html,
    text: `Hi ${name},\n\nYour account is ready. Visit ${APP} to get started.\n\nThe DocSummarizer team`,
  });
}

async function sendPaymentConfirmationEmail(user, payment) {
  const name       = user.name?.split(" ")[0] || "there";
  const amount     = `₹${(payment.amount / 100).toLocaleString("en-IN")}`;
  const planName   = payment.plan ? capitalize(payment.plan) : "Pro";
  const paidAt     = payment.paidAt
    ? new Date(payment.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const html = shell("Payment confirmed", `
    ${h1("Payment confirmed ✓")}
    ${p(`Hi ${name}, your payment of <strong>${amount}</strong> for the <strong>${planName} plan</strong> was received.`)}

    <table cellpadding="0" cellspacing="0"
           style="width:100%;border:1px solid #e5e7eb;border-radius:10px;
                  overflow:hidden;margin:0 0 24px;">
      ${[
        ["Invoice",  payment.invoiceNumber || "—"],
        ["Plan",     planName],
        ["Amount",   amount],
        ["Date",     paidAt],
        ["Status",   "Paid"],
      ].map(([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"};">
          <td style="padding:12px 16px;color:#6b7280;font-size:0.875rem;
                     border-bottom:1px solid #f3f4f6;white-space:nowrap;">${label}</td>
          <td style="padding:12px 16px;color:#111827;font-size:0.875rem;
                     border-bottom:1px solid #f3f4f6;font-weight:600;text-align:right;">
            ${label === "Status"
              ? `<span style="background:#d1fae5;color:#065f46;padding:2px 10px;
                             border-radius:999px;font-size:0.8rem;">${value}</span>`
              : value}
          </td>
        </tr>
      `).join("")}
    </table>

    ${btn("View your plan", `${APP}/pricing`)}

    ${p("Need a receipt for tax purposes? You can download it from your billing settings.", "margin-top:20px;color:#6b7280;")}
  `);

  return send({
    to: user.email,
    subject: `Payment confirmed — ${planName} plan (${amount})`,
    html,
    text: `Hi ${name},\n\nYour payment of ${amount} for the ${planName} plan was received on ${paidAt}.\nInvoice: ${payment.invoiceNumber || "—"}\n\nManage your plan at ${APP}/pricing`,
  });
}

async function sendPasswordResetEmail(user, resetToken, expiresMin = 30) {
  const name      = user.name?.split(" ")[0] || "there";
  const resetLink = `${APP}/reset-password?token=${resetToken}`;

  const html = shell("Reset your password", `
    ${h1("Reset your password")}
    ${p(`Hi ${name}, we received a request to reset the password for your DocSummarizer account.`)}
    ${p("Click the button below to choose a new password. This link is valid for "
      + `<strong>${expiresMin} minutes</strong>.`)}

    ${btn("Reset my password", resetLink)}

    ${p(`Or copy and paste this URL into your browser:<br/>
         <a href="${resetLink}" style="color:#2563eb;word-break:break-all;">${resetLink}</a>`,
       "margin-top:20px;")}

    ${p("If you didn't request a password reset, you can safely ignore this email — "
      + "your password won't change.", "color:#6b7280;font-size:0.875rem;margin-top:24px;")}
  `);

  return send({
    to: user.email,
    subject: "Reset your DocSummarizer password",
    html,
    text: `Hi ${name},\n\nReset your password here (valid for ${expiresMin} min):\n${resetLink}\n\nIf you didn't request this, ignore this email.`,
  });
}

// ── 3.1: Document summary ready ───────────────────────────────────────────────
/**
 * Call this after a document is successfully summarized and saved.
 *
 * @param {object} user      - Mongoose user doc: { email, name }
 * @param {object} doc       - Saved Document: { _id, filename, stats }
 */
async function sendSummaryReadyEmail(user, doc) {
  const name       = user.name?.split(" ")[0] || "there";
  const filename   = doc.filename || "Your document";
  const docLink    = `${APP}/summary/${doc._id}`;
  const words      = doc.stats?.words ? doc.stats.words.toLocaleString() : null;
  const readingTime = doc.stats?.readingTime || null;

  const html = shell("Your summary is ready", `
    ${h1("Your summary is ready 📄")}
    ${p(`Hi ${name}, we've finished processing <strong>${filename}</strong>.`)}

    <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:12px;
                padding:20px 24px;margin:0 0 24px;">
      <strong style="color:#1e40af;font-size:0.9rem;">Summary stats</strong>
      <div style="margin-top:10px;display:flex;gap:24px;flex-wrap:wrap;">
        ${words ? `<div style="color:#374151;font-size:0.875rem;">📝 <strong>${words}</strong> words processed</div>` : ""}
        ${readingTime ? `<div style="color:#374151;font-size:0.875rem;">⏱️ <strong>${readingTime} min</strong> reading time saved</div>` : ""}
        <div style="color:#374151;font-size:0.875rem;">✅ Summary generated</div>
      </div>
    </div>

    ${btn("View your summary", docLink)}

    ${p(`You can also share this summary with colleagues or download it as PDF or TXT from the summary page.`,
        "margin-top:20px;color:#6b7280;font-size:0.875rem;")}
  `);

  return send({
    to: user.email,
    subject: `Summary ready: ${filename}`,
    html,
    text: `Hi ${name},\n\nYour summary for "${filename}" is ready.\n\nView it here: ${docLink}\n\nThe DocSummarizer team`,
  });
}

// ── 3.5: Usage limit warning emails ──────────────────────────────────────────
/**
 * Call this when a user hits 80% or 100% of their daily limit.
 *
 * @param {object} user    - Mongoose user doc: { email, name, plan }
 * @param {object} usage   - { used, limit, action } where action = 'summarize' | 'tables'
 * @param {'80'|'100'} pct - Which threshold was hit
 */
async function sendUsageLimitEmail(user, usage, pct) {
  const name      = user.name?.split(" ")[0] || "there";
  const planName  = capitalize(user.plan || "free");
  const actionStr = usage.action === "summarize" ? "summaries" : "table extractions";
  const isMaxed   = pct === "100";

  const subject = isMaxed
    ? `You've used all your ${actionStr} for today`
    : `You've used 80% of your daily ${actionStr}`;

  const accentColor = isMaxed ? "#dc2626" : "#d97706";
  const accentLight = isMaxed ? "#fef2f2" : "#fffbeb";
  const accentBorder = isMaxed ? "#fecaca" : "#fde68a";
  const emoji = isMaxed ? "🔴" : "🟡";

  const html = shell(subject, `
    ${h1(`${emoji} ${isMaxed ? "Daily limit reached" : "Approaching your daily limit"}`)}
    ${p(`Hi ${name}, ${isMaxed
      ? `you've used all <strong>${usage.limit} ${actionStr}</strong> on your ${planName} plan for today.`
      : `you've used <strong>${usage.used} of ${usage.limit} ${actionStr}</strong> on your ${planName} plan today.`
    }`)}

    <!-- Usage bar -->
    <div style="margin:0 0 24px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:0.8rem;color:#6b7280;">${actionStr}</span>
        <span style="font-size:0.8rem;font-weight:600;color:${accentColor};">${usage.used} / ${usage.limit}</span>
      </div>
      <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
        <div style="background:${accentColor};height:100%;width:${Math.min(100, Math.round((usage.used / usage.limit) * 100))}%;border-radius:999px;"></div>
      </div>
    </div>

    <div style="background:${accentLight};border:1px solid ${accentBorder};border-radius:12px;
                padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:0.875rem;color:${accentColor};font-weight:600;">
        ${isMaxed
          ? "Your limit resets tomorrow. Upgrade now to keep working."
          : `You have ${usage.limit - usage.used} ${actionStr} left today.`}
      </p>
    </div>

    ${btn("Upgrade your plan", `${APP}/pricing`, "#2563eb")}
    &nbsp;&nbsp;
    ${isMaxed ? "" : btn("Continue working", `${APP}/upload`, "#6b7280")}

    ${p(`On the <strong>${planName} plan</strong> you get ${usage.limit} ${actionStr} per day.
         Upgrading unlocks higher limits or unlimited usage.`,
        "margin-top:20px;color:#6b7280;font-size:0.875rem;")}
  `);

  return send({
    to: user.email,
    subject,
    html,
    text: `Hi ${name},\n\n${isMaxed
      ? `You've hit your daily limit of ${usage.limit} ${actionStr}.`
      : `You've used ${usage.used}/${usage.limit} ${actionStr} today.`
    }\n\nUpgrade at ${APP}/pricing to get more.`,
  });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendPasswordResetEmail,
  sendSummaryReadyEmail,   // 3.1
  sendUsageLimitEmail,     // 3.5
};