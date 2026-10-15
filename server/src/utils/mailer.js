import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Company } from '../models/company.model.js';
import { currentCompanyId } from './tenantContext.js';
import { usesOwnMailbox, sendFromCompany } from './companyMail.js';
import { logger } from './logger.js';

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
    })
  : null;

// Mail sent while acting for a company (OTPs, notifications, digests) goes out from that company's own
// mailbox when the platform has enabled it and the company has set it up. If that mailbox fails, the mail
// still goes out from the platform sender so nobody is locked out of signing in; the failure is kept on
// the company so its admin can see it.
const viaCompanyMailbox = async (mail) => {
  const companyId = currentCompanyId();
  if (!companyId) return false;
  try {
    const company = await Company.findById(companyId);
    if (!usesOwnMailbox(company)) return false;
    try {
      await sendFromCompany(company, mail);
      return true;
    } catch (error) {
      logger.warn({ err: error, companyId: String(companyId) }, 'company mailbox failed; using the platform sender');
      await Company.updateOne({ _id: companyId }, { 'emailConfig.lastError': String(error.message).slice(0, 300), 'emailConfig.lastErrorAt': new Date() });
      return false;
    }
  } catch (error) {
    logger.warn({ err: error }, 'could not check the company mailbox settings');
    return false;
  }
};

export const sendMail = async ({ to, subject, text }) => {
  if (await viaCompanyMailbox({ to, subject, text })) return;
  if (!transporter) {
    if (env.isProduction) throw new Error('SMTP is not configured.');
    // Dev only: no SMTP server, so print the mail instead of sending it
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n[mail:dev] ${text}\n`);
    return;
  }
  await transporter.sendMail({ from: env.smtp.from, to, subject, text });
};
