import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Company } from '../models/company.model.js';
import { currentCompanyId } from './tenantContext.js';
import { buildCompanyTransport, mailReady, fromAddress } from './mailTransport.js';
import { primeCompanyKey, decryptValue } from './crypto.js';

const platformTransporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
    })
  : null;

// One transport per company, rebuilt whenever its settings change
const cache = new Map();
const forCompany = async (companyId) => {
  const company = await Company.findById(companyId).select('+dataKey');
  // The platform can switch the feature off at any time, which sends the company back to the platform sender
  if (!company?.features.customEmail || !mailReady(company.mail)) return null;
  const mail = company.mail;
  const signature = JSON.stringify([mail.host, mail.port, mail.secure, mail.username, mail.password, mail.fromEmail, mail.fromName]);
  const hit = cache.get(String(companyId));
  if (hit?.signature === signature) return hit;
  primeCompanyKey(company.id, company.dataKey);
  const entry = {
    signature,
    from: fromAddress(mail),
    transporter: buildCompanyTransport(mail, mail.password ? decryptValue(company.id, mail.password) : undefined)
  };
  cache.set(String(companyId), entry);
  return entry;
};

// Sends from the current company's own mailbox when its admin has set one up, else from the platform's.
// A company that configured its own mail never silently falls back to the platform sender: a failure
// is reported instead, so its mail does not leave from an address it did not choose.
export const sendMail = async ({ to, subject, text }) => {
  const companyId = currentCompanyId();
  const own = companyId ? await forCompany(companyId) : null;
  if (own) {
    await own.transporter.sendMail({ from: own.from, to, subject, text });
    return;
  }
  if (!platformTransporter) {
    if (env.isProduction) throw new Error('SMTP is not configured.');
    // Dev only: no SMTP server, so print the mail instead of sending it
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n[mail:dev] ${text}\n`);
    return;
  }
  await platformTransporter.sendMail({ from: env.smtp.from, to, subject, text });
};
