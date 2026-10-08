import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
    })
  : null;

export const sendMail = async ({ to, subject, text }) => {
  if (!transporter) {
    if (env.isProduction) throw new Error('SMTP is not configured.');
    // Dev only: no SMTP server, so print the mail instead of sending it
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n[mail:dev] ${text}\n`);
    return;
  }
  await transporter.sendMail({ from: env.smtp.from, to, subject, text });
};
