import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { course } from "./fixtures.mjs";
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
  ),
  base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  out = resolve(
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/collections-browser",
  );
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  for (const [width, locale] of [
    [1440, "en"],
    [768, "en"],
    [390, "en"],
    [320, "zh"],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      errors = [];
    await context.addInitScript(
      ({ course, locale }) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        if (!localStorage.getItem("qa-seeded")) {
          localStorage.setItem(
            "course-atlas:saved:v1",
            JSON.stringify([
              course,
              {
                ...course,
                id: course.id + "-second",
                title: "Second course",
                catalogNumber: "1152",
              },
            ]),
          );
          localStorage.setItem("qa-seeded", "true");
        }
      },
      { course, locale },
    );
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
        return r.abort();
      if (u.pathname.startsWith("/api/"))
        return r.fulfill({ status: 503, json: { error: "QA isolated" } });
      return r.continue();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" && /hydration|maximum update/i.test(m.text()))
        errors.push(m.text());
    });
    const t = (en, zh) => (locale === "zh" ? zh : en);
    await p.goto(new URL("/saved", base).href);
    const manager = p.locator("[data-saved-manager]");
    const button = (name) => manager.getByRole("button", { name, exact: true });
    const close = async (dialog) => {
      await dialog
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .last()
        .click();
      await dialog.waitFor({ state: "hidden" });
    };
    await button(t("Manage", "管理")).click();
    let manage = p
      .getByRole("dialog")
      .filter({
        has: p.getByRole("heading", {
          name: t("Organize favorites", "管理收藏"),
          exact: true,
        }),
      });
    await manage.locator("li input[type=checkbox]").last().check();
    await manage
      .getByRole("button", {
        name: t("New collection", "新建分组"),
        exact: true,
      })
      .click();
    let dialog = p.getByRole("dialog").last();
    await dialog
      .getByLabel(t("Name", "名称"), { exact: true })
      .fill("Autumn / 秋季");
    await dialog
      .getByLabel(t("Tags · comma separated", "标签 · 逗号分隔"))
      .fill("Degree, Major");
    await dialog
      .getByRole("button", {
        name: t("Save collection", "保存分组"),
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await manage.locator("li").count(), 1);
    await close(manage);
    let downloadWait = p.waitForEvent("download");
    await button(t("Export", "导出")).click();
    dialog = p.getByRole("dialog");
    await dialog
      .getByRole("button", {
        name: t("Download collection", "下载收藏清单"),
        exact: true,
      })
      .click();
    let raw = "";
    for await (const chunk of await (await downloadWait).createReadStream())
      raw += chunk;
    assert.equal(JSON.parse(raw).items.length, 1);
    assert.equal(JSON.parse(raw).title, "Autumn / 秋季");
    assert.equal(JSON.parse(raw).collections, undefined);
    await close(dialog);
    await button(t("Edit collection", "编辑分组")).click();
    dialog = p.getByRole("dialog");
    await dialog
      .getByLabel(t("Name", "名称"), { exact: true })
      .fill("Updated term");
    await dialog
      .getByRole("button", {
        name: t("Save collection", "保存分组"),
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await p.reload();
    await manager.getByRole("button", { name: /Updated term/ }).click();
    assert.equal(await p.locator(".course-card").count(), 1);
    await button(t("Edit collection", "编辑分组")).click();
    dialog = p.getByRole("dialog");
    await dialog
      .getByRole("button", {
        name: t("Delete collection", "删除分组"),
        exact: true,
      })
      .click();
    await dialog
      .getByRole("button", {
        name: t("Confirm deletion", "确认删除"),
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await p.locator(".course-card").count(), 2);
    await button(t("Undo", "撤销")).click();
    await button(t("Edit collection", "编辑分组")).waitFor();
    assert.equal(await p.locator(".course-card").count(), 1);
    downloadWait = p.waitForEvent("download");
    await button(t("Export", "导出")).click();
    dialog = p.getByRole("dialog");
    await dialog
      .getByRole("button", {
        name: t("Full private backup", "完整私人备份"),
        exact: true,
      })
      .click();
    let backupRaw = "";
    for await (const chunk of await (await downloadWait).createReadStream())
      backupRaw += chunk;
    const backup = JSON.parse(backupRaw);
    assert.equal(backup.format, "waho-private-backup");
    assert.equal(backup.workspace.collections.length, 1);
    await close(dialog);
    await p.evaluate(() => {
      const key = "course-atlas:saved-workspace:v1",
        workspace = JSON.parse(localStorage.getItem(key));
      for (const key of Object.keys(workspace.records))
        workspace.records[key] = "[]";
      workspace.collections = [];
      localStorage.setItem(key, JSON.stringify(workspace));
      window.dispatchEvent(new Event("course-atlas:preferences"));
    });
    await manager
      .locator("input[type=file]")
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(backupRaw),
      });
    await manager
      .getByRole("button", { name: t("Merge backup", "合并备份"), exact: true })
      .click();
    await manager
      .getByText(locale === "zh" ? /2 项已恢复/ : /2 added/)
      .waitFor();
    assert.equal(await p.locator(".course-card").count(), 1);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await manager.screenshot({
      path: out + "/collections-" + width + "-" + locale + ".png",
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log("Collections passed " + width + " " + locale);
  }
} finally {
  await browser.close();
}
