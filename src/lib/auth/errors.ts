import type { Locale } from "../i18n.ts";
type AuthFailure = { status?: number; code?: string; error?: string };
export function authErrorMessage(locale: Locale, failure: unknown) {
  const error =
    failure && typeof failure === "object" ? (failure as AuthFailure) : {};
  const code = error.code ?? error.error;
  const zh = locale === "zh";
  if (
    error.status === 429 ||
    code === "TOO_MANY_REQUESTS" ||
    code === "rate_limited"
  )
    return zh
      ? "请求过于频繁，请稍等一分钟再试。"
      : "Too many attempts. Wait a minute and try again.";
  if ((error.status && error.status >= 500) || code === "unavailable")
    return zh
      ? "登录服务暂不可用，请稍后重试。"
      : "Sign-in is temporarily unavailable. Try again shortly.";
  switch (code) {
    case "POLICY_REQUIRED":
      return zh
        ? "请先阅读并同意使用条款与隐私说明。"
        : "Read and agree to the Terms and Privacy Notice first.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return zh
        ? "邮箱或密码不正确。未设置密码？请使用验证码或通行密钥登录。"
        : "Email or password is incorrect. No password set? Use an email code or passkey.";
    case "EMAIL_NOT_VERIFIED":
      return zh
        ? "邮箱尚未验证，请使用邮箱验证码登录后继续。"
        : "Verify your email by signing in with an email code.";
    case "INVALID_OTP":
    case "OTP_EXPIRED":
    case "TOO_MANY_ATTEMPTS":
      return zh
        ? "验证码错误或已失效，请检查最新邮件或重新发送。"
        : "The code is incorrect or expired. Check your latest email or request a new code.";
    case "PASSKEY_EMAIL_MISMATCH":
      return zh
        ? "请选择与所填邮箱对应的通行密钥，或修改邮箱后重试。"
        : "Choose the passkey for the email you entered, or change the email and retry.";
    case "AUTH_CANCELLED":
    case "ERROR_CEREMONY_ABORTED":
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
      return zh
        ? "通行密钥验证未完成，请重试或切换其他登录方式。"
        : "Passkey verification was not completed. Retry or choose another sign-in method.";
    case "PASSKEY_UNAVAILABLE":
      return zh
        ? "当前浏览器或地址不支持通行密钥，请使用 HTTPS 或 localhost，或切换验证码登录。"
        : "Passkeys need a supported browser on HTTPS or localhost. You can also use an email code.";
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
    case "FAILED_TO_VERIFY_AUTHENTICATION":
    case "AUTHENTICATION_FAILED":
    case "CHALLENGE_NOT_FOUND":
    case "PASSKEY_NOT_FOUND":
      return zh
        ? "无法验证此通行密钥，请使用添加密钥时的网站地址重试，或切换其他登录方式。"
        : "Could not verify this passkey. Use the site address where you added it, or another sign-in method.";
    case "origin":
    case "INVALID_ORIGIN":
      return zh
        ? "当前访问地址未启用登录，请使用本站配置的登录地址。"
        : "Sign-in is unavailable at this address. Use the site's configured sign-in address.";
    default:
      return zh
        ? "登录未完成，请检查输入或切换其他登录方式后重试。"
        : "Sign-in was not completed. Check your details or try another sign-in method.";
  }
}
