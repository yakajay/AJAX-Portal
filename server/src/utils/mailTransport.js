import nodemailer from 'nodemailer';

// Kept apart from mailer.js so the settings controller can use it without pulling in the sender
export const mailReady = (mail) => !!(mail?.enabled && mail.host && mail.fromEmail);

export const fromAddress = (mail) => (mail.fromName ? { name: mail.fromName, address: mail.fromEmail } : mail.fromEmail);

// Builds a transport for a company's own mailbox. TLS is always required and certificates are verified.
export const buildCompanyTransport = (mail, password) =>
  nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    requireTLS: !mail.secure,
    auth: mail.username ? { user: mail.username, pass: password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
