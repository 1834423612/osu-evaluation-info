import nodemailer from "nodemailer";
import { mailConfigured } from "./config.ts";
let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
export function mailTransport() {
  if (!mailConfigured()) throw new Error("Email delivery is unavailable");
  return (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: true,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 10000,
    socketTimeout: 20000,
    logger: false,
    debug: false,
  }));
}
export async function sendSignInCode(
  email: string,
  otp: string,
  locale = "en",
) {
  const zh = locale === "zh";
  await mailTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: zh ? "WahO! 登录验证码" : "Your WahO! sign-in code",
    text: zh
      ? "验证码：" +
        otp +
        "\n\n5 分钟内有效，请勿与他人分享。若非本人操作，请忽略。"
      : "Your code: " +
        otp +
        "\n\nExpires in 5 minutes. Do not share it. If you did not request this, ignore this message.",
  });
}
