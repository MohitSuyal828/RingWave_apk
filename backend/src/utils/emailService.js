// ─── emailService ─────────────────────────────────────────────────────────────
//
// A minimal, pluggable email sender. Right now there is exactly one
// transport implemented: a console/log transport, which writes the email's
// content to the server's own logs instead of actually delivering it to an
// inbox. This is a well-established pattern for local development (Rails'
// letter_opener, Django's console email backend do the same thing) — but
// it is NOT sufficient for real users in production. Nothing in this repo
// has credentials for a real transactional email provider (SendGrid, SES,
// Postmark, etc.), and this sandboxed environment has no network access to
// one either.
//
// WHAT YOU MUST DO BEFORE SHIPPING THIS TO REAL USERS:
//   Replace `sendViaConsoleTransport` below with a real provider call
//   (e.g. an HTTPS request to SendGrid's /v3/mail/send, or SMTP via
//   nodemailer configured with real credentials from environment
//   variables). The function signature (`to`, `subject`, `text`, `html`)
//   is deliberately provider-agnostic so that swap is a one-function change
//   — nothing calling `sendPasswordResetEmail` needs to change.
//
// Until that swap happens, forgot-password requests are functionally
// real (a genuine, single-use, expiring token is generated and only the
// correct token can reset the password) but the "email" only reaches this
// server's own logs, not the user's actual inbox.
const sendViaConsoleTransport = async ({ to, subject, text }) => {
  console.log(
    `[emailService] (console transport — see header comment before production use)\n` +
      `  To:      ${to}\n` +
      `  Subject: ${subject}\n` +
      `  Body:\n${text
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")}`
  );
};

const sendPasswordResetEmail = async (toEmail, resetLink) => {
  const subject = "Reset your RingWave password";
  const text =
    `We received a request to reset the password for your RingWave account.\n\n` +
    `Reset your password using this link (expires in ${
      process.env.PASSWORD_RESET_EXPIRES_IN_MINUTES || "15"
    } minutes):\n${resetLink}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't be changed.`;

  await sendViaConsoleTransport({ to: toEmail, subject, text });
};

module.exports = { sendPasswordResetEmail };
