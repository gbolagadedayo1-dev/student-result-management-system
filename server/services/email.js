import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    })
  : null;

export async function sendPasswordReset({ to, name, resetUrl }) {
  if (!transporter) {
    if (env.nodeEnv !== "production") console.log("Password reset preview", { to, resetUrl });
    return;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM ?? "MaryResult Support <bamidelebunmi412@gmail.com>",
    to,
    subject: "Reset your MaryResult password",
    text: `Hello ${name}, reset your MaryResult password here: ${resetUrl}. This link expires in 30 minutes. Support: +234 915 179 8360.`,
    html: `<p>Hello ${name},</p><p>Use the secure link below to reset your MaryResult password. It expires in 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p><p>MaryResult Support<br>bamidelebunmi412@gmail.com<br>+234 915 179 8360</p>`,
  });
}