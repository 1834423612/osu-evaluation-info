"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bug, Download, RefreshCw, Wrench, X } from "lucide-react";
import { debugTools } from "@/lib/debug/client";
import { type DebugFlags } from "@/lib/debug/flags";
import { clearDebugResponses } from "@/lib/debug/services";
import { buildInfoStore } from "@/lib/layout/build-info-client";
import { updateNoticeStore } from "@/lib/layout/update-notice-client";
import { createLogoClickController } from "@/lib/debug/logo-clicks";
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
  const router = useRouter();
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
    const gesture = createLogoClickController({
      tap: (now) => debugTools.tapLogo(now, zh),
      reset: debugTools.resetLogoTaps,
    });
    let source: Element | null = null;
    const cancel = () => {
      gesture.cancel();
      source = null;
    };
    const logoFor = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest("a[data-debug-logo]")
        : null;
    const selectLogo = (logo: Element) => {
      if (source !== logo) {
        cancel();
        source = logo;
      }
    };
    const pointerDown = (event: PointerEvent) => {
      const logo = logoFor(event);
      if (
        !logo ||
        !event.isPrimary ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        cancel();
        return;
      }
      selectLogo(logo);
      // A second finger/mouse press cancels the pending home action before its click is released.
      gesture.hold();
    };
    const click = (event: MouseEvent) => {
      const logo = logoFor(event);
      if (
        !logo ||
        event.button !== 0 ||
        event.detail === 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        cancel();
        return;
      }
      event.preventDefault();
      selectLogo(logo);
      gesture.press(performance.now(), () => router.push("/"));
    };
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
      if (event.ctrlKey && event.altKey && event.code === "KeyD") {
        event.preventDefault();
        cancel();
        debugTools.open();
      }
    };
    document.addEventListener("click", click, true);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("contextmenu", cancel, true);
    document.addEventListener("keydown", shortcut);
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    return () => {
      cancel();
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", shortcut);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("contextmenu", cancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
    };
  }, [zh, router]);
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
  const serviceGroups: {
    title: string;
    note: string;
    items: { key: keyof DebugFlags; label: string }[];
  }[] = [
    {
      title: text(
        locale,
        "In development · pause requests",
        "开发中 · 暂停获取",
      ),
      note: text(
        locale,
        "Survives refresh. Reuses this tab's saved responses; uncaptured requests stay paused. Snapshots expire after 4 hours.",
        "刷新后仍生效。复用本标签页已获取的数据；没有快照时保持暂停。快照保留 4 小时。",
      ),
      items: [
        {
          key: "pauseCatalog",
          label: text(locale, "Course catalog & filters", "课程与筛选项"),
        },
        { key: "pauseSeats", label: text(locale, "Section seats", "班次座位") },
        {
          key: "pauseTranslation",
          label: text(
            locale,
            "Translation & model downloads",
            "翻译与模型下载",
          ),
        },
        { key: "pauseRmp", label: "Rate My Professors" },
        {
          key: "pauseEvaluations",
          label: text(locale, "Course evaluations", "课程历史评价"),
        },
        {
          key: "pausePeople",
          label: text(locale, "People directory & photos", "教师检索与头像"),
        },
      ],
    },
    {
      title: text(locale, "Simulate events", "模拟事件"),
      note: text(
        locale,
        "Overrides saved responses without contacting the service. Refresh to apply to content already loaded.",
        "优先于快照，不请求对应服务。刷新可应用到已经加载的内容。",
      ),
      items: [
        {
          key: "emptyCatalog",
          label: text(
            locale,
            "No courses · any search",
            "任何查询都找不到课程",
          ),
        },
        {
          key: "emptySeats",
          label: text(locale, "Seats unavailable", "班次座位暂无数据"),
        },
        {
          key: "emptyRmp",
          label: text(locale, "No RMP reviews", "RMP 暂无评价"),
        },
        {
          key: "emptyEvaluations",
          label: text(locale, "No course evaluations", "暂无课程历史评价"),
        },
        {
          key: "emptyPeople",
          label: text(locale, "No people found", "找不到教师资料"),
        },
        {
          key: "failTranslation",
          label: text(locale, "Translation unavailable", "翻译服务不可用"),
        },
      ],
    },
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
              <BuildStamp locale={locale} />
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
                  {serviceGroups.map((group) => (
                    <fieldset className={styles.group} key={group.title}>
                      <legend>{group.title}</legend>
                      <p>{group.note}</p>
                      <div className={styles.switches}>
                        {group.items.map((item) => (
                          <label key={item.key}>
                            <span>{item.label}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(state.flags[item.key])}
                              onChange={(event) =>
                                debugTools.setFlag(
                                  item.key,
                                  event.target.checked,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <fieldset className={styles.group}>
                    <legend>
                      {text(locale, "Website updates", "网站更新测试")}
                    </legend>
                    <p>
                      {text(
                        locale,
                        "Preview the persistent notice without changing version data. Refresh still reloads the page.",
                        "预览常驻提示，不修改真实版本。提示中的刷新按钮仍会重载页面。",
                      )}
                    </p>
                    <div className={styles.buttons}>
                      <button
                        type="button"
                        onClick={() => updateNoticeStore.preview()}
                      >
                        {text(
                          locale,
                          "Simulate available update",
                          "模拟新版本提示",
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateNoticeStore.resetDismissed();
                          debugTools.notify(
                            text(
                              locale,
                              "Dismissal reset for this tab",
                              "已重置本标签页的更新提示关闭记录",
                            ),
                          );
                        }}
                      >
                        {text(
                          locale,
                          "Reset update dismissal",
                          "重置更新提示关闭记录",
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void buildInfoStore
                            .refresh()
                            .then(() =>
                              debugTools.notify(
                                text(
                                  locale,
                                  "Update check finished · checks are limited to once per 5 seconds",
                                  "已检查更新 · 最快每 5 秒检查一次",
                                ),
                              ),
                            );
                        }}
                      >
                        <RefreshCw size={12} aria-hidden="true" />
                        {text(locale, "Check for updates", "立即检查更新")}
                      </button>
                    </div>
                  </fieldset>
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
                      onClick={() => {
                        clearDebugResponses();
                        debugTools.notify(
                          text(
                            locale,
                            "Response snapshots cleared",
                            "请求快照已清理",
                          ),
                        );
                      }}
                    >
                      {text(locale, "Clear response snapshots", "清理请求快照")}
                    </button>
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
                          build:
                            buildInfoStore.getSnapshot()?.sha.slice(0, 8) ??
                            process.env.NEXT_PUBLIC_BUILD_HASH,
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
