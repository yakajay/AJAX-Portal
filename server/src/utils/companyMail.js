import nodemailer from 'nodemailer';
import { decryptValue } from './crypto.js';
import { resolvePublicHost } from './safeFetch.js';

// Sending mail from a company's own mailbox. The platform switches `features.customEmail` on for a company;
// its admin then saves `emailConfig` (sender address + password). Servers for the common providers are
// worked out from the address, so most admins only type an email and a password.
const PRESETS = {
  'gmail.com': { host: 'smtp.gmail.com', port: 587 },
  'googlemail.com': { host: 'smtp.gmail.com', port: 587 },
  'outlook.com': { host: 'smtp-mail.outlook.com', port: 587 },
  'hotmail.com': { host: 'smtp-mail.outlook.com', port: 587 },
  'live.com': { host: 'smtp-mail.outlook.com', port: 587 },
  'msn.com': { host: 'smtp-mail.outlook.com', port: 587 },
  'yahoo.com': { host: 'smtp.mail.yahoo.com', port: 465 },
  'zoho.com': { host: 'smtp.zoho.com', port: 465 },
  'zohomail.in': { host: 'smtp.zoho.in', port: 465 },
  'icloud.com': { host: 'smtp.mail.me.com', port: 587 }
};

const HOST = /^(?=.{3,253}$)(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

const fail = (message) => Object.assign(new Error(message), { status: 400 });

// { host, port } for a sender address, from the admin's own entries or the provider preset
export const smtpSettings = ({ email, host, port }) => {
  const preset = PRESETS[String(email).split('@')[1]];
  const chosenHost = String(host || '').trim().toLowerCase() || preset?.host;
  if (!chosenHost) throw fail('We could not tell which mail server this address uses. Enter the SMTP host (for example smtp.yourcompany.com).');
  if (!HOST.test(chosenHost) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(chosenHost)) throw fail('The SMTP host is not valid.');
  const chosenPort = port ? Number(port) : preset && !host ? preset.port : 587;
  if (!Number.isInteger(chosenPort) || chosenPort < 1 || chosenPort > 65535) throw fail('The SMTP port must be a number from 1 to 65535.');
  return { host: chosenHost, port: chosenPort };
};

// True when the company may use, and has fully set up, its own mailbox
export const usesOwnMailbox = (company) =>
  !!(company?.features?.customEmail && company.emailConfig?.enabled && company.emailConfig.email && company.emailConfig.password);

const send = async (company, { to, subject, text }) => {
  const config = company.emailConfig;
  const { host, port } = smtpSettings(config);
  // Connect to the address we vetted, not whatever the name resolves to a moment later
  const address = await resolvePublicHost(host);
  const transport = nodemailer.createTransport({
    host: address,
    port,
    secure: port === 465,
    auth: { user: config.email, pass: decryptValue(company.id, config.password) },
    tls: { servername: host },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
  try {
    await transport.sendMail({ from: { name: config.fromName || company.name, address: config.email }, to, subject, text });
  } finally {
    transport.close();
  }
};

export const sendFromCompany = send;
