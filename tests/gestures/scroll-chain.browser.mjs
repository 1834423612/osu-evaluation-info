import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.BASE_URL ?? "http://127.0.0.1:3102";
const source = await readFile(
  new URL("../../src/lib/browser/scroll-chain.ts", import.meta.url),
  "utf8",
);
const utility = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replaceAll("export ", "");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});

async function touchUp(page, box) {
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + Math.min(box.height - 12, 80);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let index = 1; index <= 8; index++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - index * 9 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: true,
      isMobile: width < 700,
      reducedMotion: "reduce",
    });
    await context.route("**/api/**", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Isolated scroll fixture" },
      }),
    );
    const page = await context.newPage();
    await page.goto(`${base}/saved`, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({
      content: `${utility}\nwindow.attachFrameScrollChain = attachFrameScrollChain;`,
    });
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent =
        ".scroll-regression-inner { overscroll-behavior-y: contain; }";
      document.head.append(style);
      const outer = document.createElement("div");
      outer.id = "scroll-regression-outer";
      outer.dataset.slot = "sheet-content";
      outer.style.cssText =
        "position:fixed;z-index:999;left:20px;top:150px;width:min(340px,calc(100vw - 40px));height:260px;overflow-y:auto;background:white;border:1px solid black";
      outer.innerHTML =
        '<div id="scroll-regression-inner" class="scroll-regression-inner" style="height:100px;overflow:auto"><div style="height:1100px">Native nested content</div></div><div style="height:900px">Outer content</div>';
      document.body.append(outer);
    });
    const inner = page.locator("#scroll-regression-inner"),
      outer = page.locator("#scroll-regression-outer");
    assert.equal(
      await inner.evaluate(
        (node) => getComputedStyle(node).overscrollBehaviorY,
      ),
      "auto",
    );
    const box = await inner.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await page.mouse.wheel(0, 120);
    await page.waitForFunction(
      () => document.getElementById("scroll-regression-inner").scrollTop > 50,
    );
    assert.equal(await outer.evaluate((node) => node.scrollTop), 0);
    await inner.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.mouse.wheel(0, 120);
    await page.waitForFunction(
      () => document.getElementById("scroll-regression-outer").scrollTop > 50,
    );
    await outer.evaluate((node) => {
      node.scrollTop = 0;
    });
    await touchUp(page, await inner.boundingBox());
    await page.waitForFunction(
      () => document.getElementById("scroll-regression-outer").scrollTop > 20,
    );
    await outer.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const bodyBefore = await page.evaluate(
      () => document.scrollingElement.scrollTop,
    );
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(() => document.scrollingElement.scrollTop),
      bodyBefore,
      "modal boundary must not scroll the page behind it",
    );

    await outer.evaluate(async (node) => {
      node.scrollTop = 0;
      const frame = document.createElement("iframe");
      frame.id = "scroll-regression-frame";
      frame.style.cssText = "width:100%;height:120px;border:0";
      frame.srcdoc =
        '<!doctype html><html><body style="margin:0"><textarea style="width:90%;height:30px">Native form</textarea><div style="height:1400px">Official frame content</div></body></html>';
      const ready = new Promise((resolve) =>
        frame.addEventListener("load", resolve, { once: true }),
      );
      node.replaceChildren(
        frame,
        Object.assign(document.createElement("div"), {
          style: "height:900px",
          textContent: "Outer content",
        }),
      );
      await ready;
      window.attachFrameScrollChain(frame);
    });
    const frame = page.frameLocator("#scroll-regression-frame");
    const frameBox = await page
      .locator("#scroll-regression-frame")
      .boundingBox();
    await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + 80);
    await page.mouse.wheel(0, 120);
    await frame
      .locator("html")
      .evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    assert.ok(
      (await frame
        .locator("html")
        .evaluate(() => document.scrollingElement.scrollTop)) > 0,
    );
    assert.equal(await outer.evaluate((node) => node.scrollTop), 0);
    await frame.locator("html").evaluate(() => {
      document.scrollingElement.scrollTop =
        document.scrollingElement.scrollHeight;
    });
    await page.mouse.wheel(0, 120);
    await page.waitForFunction(
      () => document.getElementById("scroll-regression-outer").scrollTop > 50,
    );
    await outer.evaluate((node) => {
      node.scrollTop = 0;
    });
    await touchUp(
      page,
      await page.locator("#scroll-regression-frame").boundingBox(),
    );
    await page.waitForFunction(
      () => document.getElementById("scroll-regression-outer").scrollTop > 20,
    );
    console.log(
      JSON.stringify({
        width,
        nativeWheel: true,
        nativeTouch: true,
        frameWheel: true,
        frameTouch: true,
        modalBoundary: true,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
