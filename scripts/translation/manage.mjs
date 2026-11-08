import {
  createPostgresTranslationState,
  createTranslationStatePool,
} from "../../src/lib/translation/postgres-state.ts";
import { createTranslationProviders } from "../../src/lib/translation/providers.ts";
import { serverProviderRegistration } from "../../src/lib/translation/registration.ts";
import { createDatabaseTranslationUsage } from "../../src/lib/translation/usage.ts";
import { createTranslationGateway } from "../../src/lib/translation/gateway.ts";

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const provider = args[1] && !args[1].startsWith("--") ? args[1] : "ollama";
const json = args.includes("--json");
const phases = {
  unconfigured: "未配置",
  disabled: "人工停用",
  unknown: "待验证",
  healthy: "健康",
  degraded: "降级",
  cooldown: "冷却",
  recovering: "恢复探测",
  per_device: "按浏览器隔离",
};
const availability = {
  unconfigured: "先完成配置",
  disabled: "人工启用后重试",
  ready: "可调用",
  busy: "繁忙，分流",
  waiting_retry: "等待冷却到期",
  ready_to_probe: "下一请求可恢复探测",
  per_device: "由各设备独立决定",
};
const pool = createTranslationStatePool();
let probeSummary;
try {
  if (!process.env.DATABASE_URL?.trim())
    throw Error("DATABASE_URL is required.");
  const store = createPostgresTranslationState(pool);
  const providers = createTranslationProviders();
  const registration = serverProviderRegistration(providers);
  await store.register(registration);
  if (["retry", "enable", "disable", "configure", "probe"].includes(command)) {
    if (provider !== "ollama")
      throw Error(
        "Google is browser-local: it has no global failure or global retry switch. Inspect browser_provider_state instead.",
      );
    if (command === "configure") {
      const policy = {};
      for (const [flag, key] of [
        ["--timeout-ms", "timeoutMs"],
        ["--slow-ms", "slowMs"],
        ["--cooldown-ms", "cooldownMs"],
        ["--concurrency", "concurrency"],
      ]) {
        const index = args.indexOf(flag);
        if (index >= 0) policy[key] = Number(args[index + 1]);
      }
      if (!Object.keys(policy).length)
        throw Error(
          "Provide --timeout-ms, --slow-ms, --cooldown-ms, or --concurrency.",
        );
      await store.manage(provider, "configure", policy);
    } else
      await store.manage(provider, command === "probe" ? "retry" : command);
    if (command === "probe") {
      const usage = createDatabaseTranslationUsage();
      const gateway = createTranslationGateway(
        providers,
        usage.observe,
        Date.now,
        store,
        [registration],
      );
      const result = await gateway.translate({
        id: "operator-probe",
        text: "Hello, professor.",
        target: "zh-CN",
      });
      await usage.flush(true);
      probeSummary = {
        status: result.status,
        provider: "ollama",
        durationMs: result.durationMs,
      };
      if (result.status !== "translated") process.exitCode = 1;
    }
  }
  if (command === "history" || command === "attempts") {
    const rows = await store[command](provider);
    if (json) console.log(JSON.stringify(rows, null, 2));
    else console.table(rows);
  } else {
    if (
      !["status", "retry", "enable", "disable", "configure", "probe"].includes(
        command,
      )
    )
      throw Error(
        "Use status, history, attempts, retry, probe, enable, disable, or configure.",
      );
    await store.refresh("ollama");
    const rows = await store.status();
    if (json)
      console.log(
        JSON.stringify(
          probeSummary ? { probe: probeSummary, providers: rows } : rows,
          null,
          2,
        ),
      );
    else {
      if (probeSummary) console.log(JSON.stringify(probeSummary));
      console.table(
        rows.map((row) => ({
          节点: row.provider,
          执行位置: row.execution === "server" ? "服务端" : "用户浏览器",
          当前状态: phases[row.health] ?? row.health,
          可执行动作: availability[row.availability] ?? row.availability,
          并发占用:
            row.execution === "server"
              ? `${row.active_requests}/${row.max_concurrency}`
              : "各设备独立",
          连续失败: row.consecutive_failures ?? "—",
          下次探测: row.next_retry_at?.toISOString() ?? "—",
          最近成功: row.last_success_at?.toISOString() ?? "—",
          最近失败原因: row.last_failure_kind ?? "—",
          浏览器观测:
            row.execution === "browser"
              ? `${row.browser_sessions} 会话 / ${row.browser_healthy_sessions} 健康 / ${row.browser_cooldown_sessions} 冷却 / ${row.browser_ready_to_probe_sessions} 待探测`
              : "—",
        })),
      );
    }
  }
} catch (error) {
  const safe = error.code
    ? `Database operation failed (${error.code}). Run pnpm db:translation:init and check database access.`
    : error.message;
  console.error(safe);
  process.exitCode = 1;
} finally {
  await pool.end();
}
