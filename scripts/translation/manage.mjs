import {
  createPostgresTranslationState,
  createTranslationStatePool,
} from "../../src/lib/translation/postgres-state.ts";
import { createTranslationProviders } from "../../src/lib/translation/providers.ts";
import { serverProviderRegistration } from "../../src/lib/translation/registration.ts";
import { createDatabaseTranslationUsage } from "../../src/lib/translation/usage.ts";
import { createTranslationGateway } from "../../src/lib/translation/gateway.ts";
import { pathToFileURL } from "node:url";

const policyFlags = {
  "--timeout-ms": "timeoutMs",
  "--slow-ms": "slowMs",
  "--cooldown-ms": "cooldownMs",
  "--concurrency": "concurrency",
};

/** Validate all command operands before connecting to or changing shared state. */
export function parseManagementArgs(args) {
  args = [...args];
  const command = args[0]?.startsWith("--")
    ? "status"
    : (args.shift() ?? "status");
  if (
    ![
      "status",
      "history",
      "attempts",
      "retry",
      "probe",
      "enable",
      "disable",
      "configure",
      "sync-config",
    ].includes(command)
  )
    throw Error(
      "Use status, history, attempts, retry, probe, enable, disable, configure, or sync-config.",
    );
  let provider;
  let json = false;
  const policy = {};
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === "--json") json = true;
    else if (Object.hasOwn(policyFlags, value)) {
      if (command !== "configure")
        throw Error(`${value} is only valid with configure.`);
      const raw = args[++index];
      const operand =
        raw === undefined || raw.trim() === "" ? NaN : Number(raw);
      if (!Number.isFinite(operand))
        throw Error(`${value} requires a numeric value.`);
      const key = policyFlags[value];
      if (Object.hasOwn(policy, key))
        throw Error(`${value} may only be specified once.`);
      policy[key] = operand;
    } else if (value.startsWith("--")) throw Error(`Unknown option: ${value}.`);
    else if (provider || command === "status")
      throw Error(`Unexpected argument: ${value}.`);
    else provider = value;
  }
  provider ??= "ollama";
  if (!["ollama", "dict-chrome-ex", "clients5", "gtx"].includes(provider))
    throw Error(`Unknown provider: ${provider}.`);
  if (provider !== "ollama" && !["history", "attempts"].includes(command))
    throw Error(
      "Google is browser-local: it has no global failure or global retry switch. Inspect browser_provider_state instead.",
    );
  if (command === "configure" && !Object.keys(policy).length)
    throw Error(
      "Provide --timeout-ms, --slow-ms, --cooldown-ms, or --concurrency.",
    );
  return { command, provider, json, policy };
}
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
/** Inspection and ordinary management never register the shell's NAS configuration. */
export async function executeManagement(
  options,
  store,
  environment = process.env,
) {
  const { command, provider, policy } = options;
  let probeSummary;
  if (["sync-config", "probe"].includes(command)) {
    const providers = createTranslationProviders(environment);
    const registration = serverProviderRegistration(providers, environment);
    if (command === "sync-config") await store.register(registration);
    if (command === "probe") {
      if (!registration.configured)
        throw Error("A valid local NAS configuration is required to probe.");
      await store.manage(provider, "retry", {}, registration.configHash);
      const usage = createDatabaseTranslationUsage(environment);
      const gateway = createTranslationGateway(
        providers,
        usage.observe,
        Date.now,
        store,
        [registration],
        { registerProviders: false },
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
    }
  } else if (["retry", "enable", "disable", "configure"].includes(command)) {
    await store.manage(provider, command, policy);
  }
  const rows =
    command === "history" || command === "attempts"
      ? await store[command](provider)
      : await store.status();
  return { rows, probeSummary };
}

/** Preserve useful non-database diagnostics without printing connection strings or credentials. */
export function managementErrorMessage(error) {
  if (error.code === "42P01" || error.code === "3F000")
    return `Translation schema is missing (${error.code}). Run pnpm db:translation:init.`;
  if (error.code === "ERR_MODULE_NOT_FOUND")
    return "A required local module is missing (ERR_MODULE_NOT_FOUND). Reinstall project dependencies.";
  if (typeof error.code === "string" && error.code.startsWith("ERR_"))
    return `Local runtime failed (${error.code}). Check the Node.js version and project dependencies.`;
  if (typeof error.code === "string")
    return `Translation management failed (${error.code}). Check database access and local runtime configuration.`;
  return error.message;
}

async function main() {
  let pool;
  try {
    const options = parseManagementArgs(process.argv.slice(2));
    const { command, json } = options;
    if (!process.env.DATABASE_URL?.trim())
      throw Error("DATABASE_URL is required.");
    pool = createTranslationStatePool();
    const { rows, probeSummary } = await executeManagement(
      options,
      createPostgresTranslationState(pool),
    );
    if (probeSummary && probeSummary.status !== "translated")
      process.exitCode = 1;
    if (command === "history" || command === "attempts") {
      if (json) console.log(JSON.stringify(rows, null, 2));
      else console.table(rows);
    } else {
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
    console.error(managementErrorMessage(error));
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
