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
    await manager
      .getByRole("button", { name: t("Manage", "管理"), exact: true })
      .click();
    await manager
      .getByRole("button", {
        name: t("New collection", "新建分组"),
        exact: true,
      })
      .click();
    let dialog = p.getByRole("dialog");
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
    await manager
      .getByRole("combobox", { name: t("Collection", "收藏分组"), exact: true })
      .click();
    await p
      .getByRole("option", { name: new RegExp(t("All favorites", "全部收藏")) })
      .click();
    await manager.locator("li input[type=checkbox]").first().check();
    await manager
      .getByRole("combobox", { name: t("Destination collection", "目标分组") })
      .click();
    await p.getByRole("option", { name: "Autumn / 秋季", exact: true }).click();
    await manager
      .getByRole("button", {
        name: t("Add to collection", "加入分组"),
        exact: true,
      })
      .click();
    await manager
      .getByText(t("Collection updated.", "分组已更新。"), { exact: true })
      .waitFor();
    await manager
      .getByRole("combobox", { name: t("Collection", "收藏分组"), exact: true })
      .click();
    await p.getByRole("option", { name: /Autumn \/ 秋季 · 1/ }).click();
    assert.equal(await manager.locator("li").count(), 1);
    let downloadPromise = p.waitForEvent("download");
    await manager
      .getByRole("button", { name: t("Export", "导出"), exact: true })
      .click();
    const download = await downloadPromise,
      stream = await download.createReadStream();
    let raw = "";
    for await (const chunk of stream) raw += chunk;
    assert.equal(JSON.parse(raw).items.length, 1);
    assert.equal(JSON.parse(raw).title, "Autumn / 秋季");
    assert.equal(JSON.parse(raw).collections, undefined);
    await manager
      .getByRole("button", {
        name: t("Edit collection", "编辑分组"),
        exact: true,
      })
      .click();
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
    await manager
      .getByRole("button", { name: t("Manage", "管理"), exact: true })
      .click();
    await manager
      .getByRole("combobox", { name: t("Collection", "收藏分组"), exact: true })
      .click();
    await p.getByRole("option", { name: /Updated term · 1/ }).click();
    assert.equal(await manager.locator("li").count(), 1);
    await manager
      .getByRole("button", {
        name: t("Edit collection", "编辑分组"),
        exact: true,
      })
      .click();
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
    assert.equal(await manager.locator("li").count(), 2);
    await manager
      .getByRole("button", { name: t("Undo", "撤销"), exact: true })
      .click();
    await manager
      .getByRole("button", {
        name: t("Edit collection", "编辑分组"),
        exact: true,
      })
      .waitFor();
    assert.equal(await manager.locator("li").count(), 1);
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
