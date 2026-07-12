// server/services/emailService.js
//
// Transactional email sender using Nodemailer.
// Supports: welcome, payment confirmation, password reset.
//
// Setup:
//   npm install nodemailer
//
// Required env vars (add to server/.env):
//   EMAIL_HOST=smtp.gmail.com
//   EMAIL_PORT=587
//   EMAIL_USER=your@gmail.com
//   EMAIL_PASS=your-app-password       # Gmail: use an App Password, not your login password
//   EMAIL_FROM="DocSummarizer <your@gmail.com>"
//   FRONTEND_URL=https://your-app.com  # already in .env
//
// For production, swap to a service like Resend, Postmark, or SendGrid
// by replacing the transporter config below.

const nodemailer = require("nodemailer");

// ── Transporter ──────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_PORT === "465",   // true only for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify on startup in non-test environments
if (process.env.NODE_ENV !== "test") {
  transporter.verify().catch((err) =>
    console.warn("⚠️  Email transporter not ready:", err.message)
  );
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const FROM = process.env.EMAIL_FROM || "DocSummarizer <no-reply@docsummarizer.com>";
const APP  = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * Send a raw email. All public helpers funnel through here.
 * Returns true on success, false on failure (never throws).
 */
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

/** Shared outer shell so all emails look consistent. */
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

        <!-- Header -->
        <tr>
          <td style="background:#2563eb;padding:28px 36px;">
            <span style="color:#fff;font-size:1.1rem;font-weight:700;letter-spacing:-0.01em;">
              📑 DocSummarizer
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
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

function btn(label, href) {
  return `
    <a href="${href}"
       style="display:inline-block;background:#2563eb;color:#fff;
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

/**
 * Send welcome email immediately after signup.
 *
 * @param {object} user  - Mongoose user doc: { email, name }
 */
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

/**
 * Send payment confirmation after a successful Razorpay payment.
 *
 * @param {object} user     - Mongoose user doc: { email, name }
 * @param {object} payment  - Payment doc: { invoiceNumber, amount, plan, paidAt }
 */
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

    <!-- Receipt table -->
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

/**
 * Send a password-reset link.
 *
 * @param {object} user       - Mongoose user doc: { email, name }
 * @param {string} resetToken - Raw (un-hashed) reset token
 * @param {number} expiresMin - How many minutes the token is valid (default 30)
 *
 * Wiring on the server side:
 *   1. Generate token:   const token = crypto.randomBytes(32).toString("hex");
 *   2. Hash & store:     user.resetToken      = crypto.createHash("sha256").update(token).digest("hex");
 *                        user.resetTokenExp   = Date.now() + expiresMin * 60 * 1000;
 *                        await user.save();
 *   3. Send email:       await sendPasswordResetEmail(user, token, expiresMin);
 *
 * In authRoutes.js, add a POST /forgot-password and POST /reset-password route.
 */
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

// ── Utility ───────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendPasswordResetEmail,
};