"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bug, Download, RefreshCw, Wrench, X } from "lucide-react";
import { debugTools } from "@/lib/debug/client";
import { type DebugFlags } from "@/lib/debug/flags";
import {
  migrateBrowserStorage,
  STORAGE_RULES,
} from "@/lib/preferences/storage-migrations";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import { BuildStamp } from "@/components/layout/build-stamp";
import styles from "./debug-tools.module.css";

function downloadJSON(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function DebugTools() {
  const state = useSyncExternalStore(
    debugTools.subscribe,
    debugTools.getSnapshot,
    debugTools.getServerSnapshot,
  );
  const { locale, setLocale } = usePreferences();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const zh = locale === "zh";
  useEffect(() => {
    debugTools.initialize();
    const click = (event: MouseEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-debug-logo]")
      )
        return;
      if (debugTools.tapLogo(performance.now(), zh) >= 2)
        event.preventDefault();
    };
    const shortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.code === "KeyD") {
        event.preventDefault();
        debugTools.open();
      }
    };
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", shortcut);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", shortcut);
    };
  }, [zh]);
  const switches: { key: keyof DebugFlags; en: string; zh: string }[] = [
    {
      key: "bypassCache",
      en: "Bypass app / HTTP caches",
      zh: "绕过应用 / HTTP 缓存",
    },
    {
      key: "factory",
      en: "Factory preview · temporary data",
      zh: "出厂预览 · 临时数据层",
    },
    {
      key: "replayTranslation",
      en: "Repeat translation guide",
      zh: "重复翻译引导",
    },
    { key: "replayLanguage", en: "Repeat language notice", zh: "重复语言提示" },
    {
      key: "skipAnalytics",
      en: "Exclude this session from Umami",
      zh: "本会话不上传 Umami",
    },
    { key: "layout", en: "Outline layout boundaries", zh: "显示布局边界" },
    { key: "offline", en: "Simulate failed requests", zh: "模拟请求失败" },
  ];
  return (
    <>
      {state.visible ? (
        <aside
          className={styles.tools}
          data-debug-tools
          aria-label={text(locale, "Developer tools", "调试工具")}
        >
          <div className={styles.launcher}>
            <button
              type="button"
              onClick={() => debugTools.toggle()}
              aria-expanded={state.expanded}
            >
              <Wrench size={15} />
              DEV
            </button>
            <button
              type="button"
              onClick={() => debugTools.hide()}
              aria-label={text(locale, "Hide developer tools", "隐藏调试工具")}
            >
              <X size={13} />
            </button>
          </div>
          {state.expanded ? (
            <section className={styles.panel}>
              <header>
                <Bug size={15} />
                <strong>{text(locale, "Developer tools", "开发与维护")}</strong>
                <small>
                  {state.authorized
                    ? text(locale, "Unlocked", "已解锁")
                    : text(locale, "Locked", "待解锁")}
                </small>
              </header>
              <BuildStamp />
              {!state.authorized ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const supplied = key;
                    setKey("");
                    try {
                      if (!(await debugTools.unlock(supplied)))
                        setError(
                          text(
                            locale,
                            "Incorrect key or key not configured.",
                            "密钥不匹配或未配置。",
                          ),
                        );
                      else setError("");
                    } catch {
                      setError(
                        text(
                          locale,
                          "Unable to verify. Try again.",
                          "暂时无法验证，请重试。",
                        ),
                      );
                    }
                  }}
                >
                  <label>
                    {text(locale, "Maintenance key", "维护密钥")}
                    <input
                      type="password"
                      value={key}
                      onChange={(event) => setKey(event.target.value)}
                      autoComplete="off"
                      maxLength={512}
                    />
                  </label>
                  <button type="submit">
                    {text(locale, "Unlock", "解锁")}
                  </button>
                  {error ? <p role="alert">{error}</p> : null}
                  <p>
                    {text(
                      locale,
                      "Production access requires the server's DEV_DEBUG_KEY.",
                      "生产环境需在服务端配置 DEV_DEBUG_KEY。",
                    )}
                  </p>
                </form>
              ) : (
                <>
                  <p>
                    {text(
                      locale,
                      "Test state is isolated. Your real saved items are kept.",
                      "测试状态单独保存，真实收藏不会被删除。",
                    )}
                  </p>
                  <div className={styles.switches}>
                    {switches.map((item) => (
                      <label key={item.key}>
                        <span>{zh ? item.zh : item.en}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(state.flags[item.key])}
                          onChange={(event) =>
                            debugTools.setFlag(item.key, event.target.checked)
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className={styles.delay}>
                    {text(locale, "Request delay", "请求延迟")}
                    <select
                      value={state.flags.latency}
                      onChange={(event) =>
                        debugTools.setFlag(
                          "latency",
                          Number(event.target.value),
                        )
                      }
                    >
                      <option value={0}>0 ms</option>
                      <option value={800}>800 ms</option>
                      <option value={2000}>2000 ms</option>
                    </select>
                  </label>
                  <div className={styles.buttons}>
                    <button
                      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
                    >
                      {text(locale, "切换中文", "Switch to English")}
                    </button>
                    <button onClick={() => location.reload()}>
                      <RefreshCw size={12} />
                      {text(locale, "Refresh data", "刷新页面与内存数据")}
                    </button>
                    <button
                      onClick={() => {
                        const result = migrateBrowserStorage(localStorage);
                        debugTools.notify(
                          zh
                            ? `已合并 ${result.merged} 项，清理 ${result.removed} 项`
                            : `Merged ${result.merged}, cleaned ${result.removed}`,
                        );
                      }}
                    >
                      {text(locale, "Upgrade local data", "检查本地数据升级")}
                    </button>
                    <button
                      onClick={() => {
                        for (const [name, rule] of Object.entries(
                          STORAGE_RULES,
                        ))
                          if (rule.kind === "cache")
                            localStorage.removeItem(
                              `course-atlas:${name}:v${rule.version}`,
                            );
                        location.reload();
                      }}
                    >
                      {text(locale, "Clear derived caches", "仅清理可重建缓存")}
                    </button>
                    <button
                      onClick={() =>
                        downloadJSON(
                          "waho-local-backup.json",
                          Object.fromEntries(
                            Array.from(
                              { length: localStorage.length },
                              (_, index) => localStorage.key(index),
                            )
                              .filter(
                                (key): key is string =>
                                  !!key &&
                                  key.startsWith("course-atlas:") &&
                                  !key.startsWith("course-atlas:debug:"),
                              )
                              .map((key) => [key, localStorage.getItem(key)]),
                          ),
                        )
                      }
                    >
                      <Download size={12} />
                      {text(locale, "Export saved data", "导出真实本地备份")}
                    </button>
                    <button
                      onClick={() =>
                        downloadJSON("waho-diagnostics.json", {
                          build: process.env.NEXT_PUBLIC_BUILD_HASH,
                          path: location.pathname,
                          viewport: { width: innerWidth, height: innerHeight },
                          browser: navigator.userAgent,
                          flags: state.flags,
                          storageKeys: Array.from(
                            { length: localStorage.length },
                            (_, index) => localStorage.key(index),
                          ),
                          requests: state.requests,
                        })
                      }
                    >
                      {text(
                        locale,
                        "Export diagnostics",
                        "导出诊断（不含数据值）",
                      )}
                    </button>
                    <button
                      onClick={() => {
                        void debugTools.reset();
                      }}
                    >
                      {text(locale, "Restore normal mode", "恢复正常模式")}
                    </button>
                  </div>
                  <details>
                    <summary>
                      {text(locale, "Recent requests", "近期请求")} ·{" "}
                      {state.requests.length}
                    </summary>
                    <ul className={styles.requests}>
                      {state.requests.slice(-8).map((entry, index) => (
                        <li key={index}>
                          <code>
                            {entry.status || "ERR"} {entry.path}
                          </code>
                          <small>{entry.ms} ms</small>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </section>
          ) : null}
        </aside>
      ) : null}
      {state.toast ? (
        <div className={styles.toast} role="status">
          {state.toast}
        </div>
      ) : null}
    </>
  );
}
