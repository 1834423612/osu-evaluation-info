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
    html: codeEmail(otp, zh),
    text: zh
      ? "验证码：" +
        otp +
        "\n\n5 分钟内有效，请勿与他人分享。若非本人操作，请忽略。"
      : "Your code: " +
        otp +
        "\n\nExpires in 5 minutes. Do not share it. If you did not request this, ignore this message.",
  });
}

export function codeEmail(otp: string, zh: boolean) {
  if (!/^\d{6}$/.test(otp)) throw Error("Invalid code");
  const title = zh ? "验证你的邮箱" : "Verify your email";
  const intro = zh
    ? "在 WahO! 输入以下验证码，继续你的操作。"
    : "Enter this code in WahO! to continue.";
  const note = zh
    ? "5 分钟内有效，请勿与他人分享。若非本人操作，可以忽略此邮件。"
    : "Valid for 5 minutes. Keep this code private. If you did not request it, ignore this email.";
  return (
    '<!doctype html><html lang="' +
    (zh ? "zh-CN" : "en") +
    '"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f4f3;color:#272328;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:40px 16px"><table role="presentation" style="width:100%;max-width:480px;margin:auto;background:#fff;border:1px solid #e8e2e1;border-radius:20px"><tr><td style="padding:32px"><div style="font-size:25px;font-weight:800;color:#ba0c2f">WahO!</div><p style="font-size:12px;color:#787078;letter-spacing:2px">OSU COURSES &amp; RATINGS</p><h1 style="font-size:24px;line-height:1.4;margin:32px 0 12px">' +
    title +
    '</h1><p style="font-size:15px;line-height:1.7;color:#6d666c">' +
    intro +
    '</p><div style="padding:22px 8px;margin:26px 0;background:#f8f5f4;border:1px solid #eee5e5;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:7px">' +
    otp +
    '</div><p style="font-size:13px;line-height:1.8;color:#787078">' +
    note +
    '</p></td></tr></table><p style="text-align:center;color:#938b90;font-size:12px;margin:24px 0">WahO! · OSU Courses &amp; Ratings</p></td></tr></table></body></html>'
  );
}
