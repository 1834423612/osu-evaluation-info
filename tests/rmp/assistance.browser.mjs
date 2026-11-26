import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const base = process.env.RMP_TEST_BASE_URL ?? "http://127.0.0.1:3103",
  output = process.env.RMP_TEST_OUTPUT ?? "/tmp/osu-rmp-assistance-qa";
await mkdir(output, { recursive: true });
let active;
const jobId = "11111111-1111-4111-8111-111111111111",
  proposalId = "22222222-2222-4222-8222-222222222222",
  fingerprint = "a".repeat(64),
  token = "waho-rmp-ai_" + "b".repeat(43);
const rows = [
  {
    professorId: "123",
    name: "Sam Field",
    department: "Math",
    campus: "COL",
    token: "1131",
    courseKey: null,
    state: "ambiguous",
    reason: "ambiguous_subject",
    candidates: ["MATH1131", "STAT1131"],
    evidence: {},
    version: 0,
    manualReason: null,
    evidenceUrls: [],
    updatedAt: "2026-11-26",
    username: "field.1",
    identityState: "accepted",
    reviewCount: 4,
    recordFingerprint: fingerprint,
  },
  {
    professorId: "124",
    name: "Nia Tide",
    department: "Biology",
    campus: "COL",
    token: "1100",
    courseKey: null,
    state: "unresolved",
    reason: "no_match",
    candidates: ["BIOLOGY1100"],
    evidence: {},
    version: 0,
    manualReason: null,
    evidenceUrls: [],
    updatedAt: "2026-11-26",
    username: null,
    identityState: "missing",
    reviewCount: 2,
    recordFingerprint: fingerprint,
  },
];
try {
  for (const locale of ["en", "zh"]) {
    for (const width of [1440, 390, 320]) {
      console.log(`Checking AI assistance ${locale} ${width}`);
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
        isMobile: width < 700,
        hasTouch: width < 700,
      });
      await context.addInitScript((locale) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
        window.testCopies = [];
        Object.defineProperty(navigator, "clipboard", {
          value: { writeText: async (value) => window.testCopies.push(value) },
          configurable: true,
        });
      }, locale);
      const page = await context.newPage();
      active = page;
      const errors = [],
        writes = [],
        reads = [];
      page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
      const proposal = {
        schemaVersion: 1,
        jobId,
        snapshotFingerprint: fingerprint,
        sourceLabel: "Unverified AI <script>unsafe</script>",
        items: rows.map((row, index) => ({
          professorId: row.professorId,
          campus: row.campus,
          token: row.token,
          action: "bind",
          courseKey: index ? "BIOLOGY1100" : "MATH1131",
          expectedVersion: 0,
          recordFingerprint: fingerprint,
          reason: "AI suggestion requires source review",
          evidenceUrls: ["https://osu.edu/evidence"],
          confidence: 0.5,
        })),
      };
      const exported = {
        schemaVersion: 1,
        jobId,
        snapshotFingerprint: fingerprint,
        groups: rows.map((row) => ({
          professorId: row.professorId,
          campus: row.campus,
          token: row.token,
          name: row.name,
          decisionVersion: 0,
          recordFingerprint: fingerprint,
          candidates:
            row.professorId === "123"
              ? [
                  {
                    key: "MATH1131",
                    title: "Past course",
                    source: "official_evaluation",
                    term: "1238",
                  },
                ]
              : [],
          reviews: [],
          reviewCount: row.reviewCount,
          reviewsSampled: true,
        })),
        proposalSchema: { type: "object" },
      };
      let approved = [],
        rejected = [],
        outcomes = [];
      const status = () =>
        approved.length + rejected.length < 2
          ? "pending"
          : approved.length === 2
            ? "approved"
            : rejected.length === 2
              ? "rejected"
              : "reviewed";
      await page.route("**/api/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        let value;
        if (url.pathname === "/api/auth/get-session")
          return route.fulfill({ json: null });
        if (url.pathname === "/api/admin/rmp/batch") {
          const input = request.postDataJSON();
          writes.push(input);
          assert.equal(input.items.length, 1);
          assert.equal(input.items[0].professorId, "123");
          assert.equal(input.items[0].courseKey, "STAT1131");
          assert.equal(input.proposalSnapshot, fingerprint);
          assert.equal(input.confirmed, true);
          approved.push("123:COL:1131");
          outcomes = [
            {
              ...input.items[0],
              version: "1",
              recordedAt: "2026-11-26T20:00:00Z",
            },
          ];
          value = {
            items: [
              { professorId: "123", campus: "COL", token: "1131", version: 1 },
            ],
          };
        } else if (url.pathname === "/api/admin/rmp/assistance") {
          if (request.method() === "POST") {
            const input = request.postDataJSON();
            if (input.action === "create")
              value = {
                id: jobId,
                token: input.remote ? token : null,
                expiresAt: "2026-11-27T00:00:00Z",
                export: exported,
              };
            else if (input.action === "reject") {
              assert.deepEqual(input.groups, [
                { professorId: "124", campus: "COL", token: "1100" },
              ]);
              rejected.push("124:COL:1100");
              value = { rejected: true };
            } else value = { revoked: true };
          } else if (url.searchParams.has("jobId"))
            value = {
              id: jobId,
              expiresAt: "2026-11-27T00:00:00Z",
              revokedAt: null,
              export: exported,
              proposal: {
                id: proposalId,
                proposalSnapshot: fingerprint,
                data: proposal,
                status: status(),
                approvedKeys: approved,
                rejectedKeys: rejected,
              },
              outcomes,
            };
          else {
            reads.push(Object.fromEntries(url.searchParams));
            value = {
              jobs: [
                {
                  id: jobId,
                  createdAt: "2026-11-26T20:00:00Z",
                  expiresAt: "2026-11-27T00:00:00Z",
                  revokedAt: null,
                  groupCount: 2,
                  pendingCount: 2 - approved.length - rejected.length,
                  unproposedCount: 0,
                  proposal: { id: proposalId, status: status() },
                },
              ],
              total: 21,
              page: Number(url.searchParams.get("page") ?? 1),
              pageSize: 20,
              development: true,
            };
          }
        } else if (url.pathname === "/api/admin/rmp")
          value =
            url.searchParams.get("access") === "1"
              ? {
                  authorized: true,
                  development: true,
                  developmentCourseView: true,
                }
              : {
                  items: rows,
                  total: 2,
                  page: 1,
                  pageSize: 30,
                  development: true,
                };
        else if (url.pathname.startsWith("/api/debug/"))
          value = {
            authorized: true,
            configured: true,
            expiresAt: Date.now() + 3600000,
          };
        else value = {};
        return route.fulfill({ json: value });
      });
      await page.goto(base + "/admin/rmp", { waitUntil: "domcontentloaded" });
      const zh = locale === "zh",
        panel = page.getByRole("region", {
          name: zh ? "AI 查证辅助" : "AI evidence assistance",
        });
      await panel.waitFor();
      await panel
        .getByRole("button", {
          name: zh ? "下一页任务" : "Next task page",
          exact: true,
        })
        .click();
      await page.waitForTimeout(100);
      assert(reads.some((value) => value.page === "2"));
      await panel
        .getByRole("button", {
          name: zh ? "上一页任务" : "Previous task page",
          exact: true,
        })
        .click();
      await page
        .getByRole("checkbox", {
          name: zh ? "选择当前页" : "Select current page",
          exact: true,
        })
        .check();
      const [downloaded] = await Promise.all([
        page.waitForEvent("download"),
        panel
          .getByRole("button", {
            name: zh ? "导出已选 (2)" : "Export selected (2)",
            exact: true,
          })
          .click(),
      ]);
      const file = `${output}/${locale}-${width}.json`;
      await downloaded.saveAs(file);
      assert.equal((await readFile(file, "utf8")).includes(token), false);
      await panel
        .getByRole("checkbox", {
          name: zh
            ? "启用远程 AI · 1 小时令牌"
            : "Enable remote AI · 1-hour token",
          exact: true,
        })
        .check();
      await Promise.all([
        page.waitForEvent("download"),
        panel
          .getByRole("button", {
            name: zh ? "导出已选 (2)" : "Export selected (2)",
            exact: true,
          })
          .click(),
      ]);
      await panel
        .getByRole("button", {
          name: zh ? "复制令牌" : "Copy token",
          exact: true,
        })
        .click();
      await panel
        .getByRole("button", {
          name: zh ? "复制接口" : "Copy endpoint",
          exact: true,
        })
        .click();
      const copied = await page.evaluate(() => window.testCopies);
      assert.equal(copied[0], token);
      assert.equal(copied[1], base + "/api/admin/rmp/assistance/job/" + jobId);
      assert.equal(copied[1].includes(token), false);
      assert.equal(
        await page.evaluate(
          (token) => JSON.stringify(localStorage).includes(token),
          token,
        ),
        false,
      );
      assert.equal(
        await panel.locator(".rr-block[data-telemetry-private]").count(),
        1,
      );
      await panel
        .getByRole("button", {
          name: zh ? "隐藏令牌" : "Hide token",
          exact: true,
        })
        .click();
      await panel
        .getByRole("button", {
          name: zh ? "核对建议" : "Review proposal",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: zh ? "核对 AI 查证建议" : "Review AI evidence",
      });
      await dialog
        .getByRole("checkbox", {
          name: zh ? "选择 123 COL 1131" : "Select 123 COL 1131",
          exact: true,
        })
        .check();
      const article = dialog
        .locator("article")
        .filter({ hasText: "Sam Field" });
      await article.locator("summary").click();
      await article
        .getByText(
          zh
            ? /MATH1131 Past course \(官方评价历史 · 1238\)/
            : /MATH1131 Past course \(Official evaluation history · 1238\)/,
        )
        .waitFor();
      await article
        .getByText(
          zh
            ? "评论节选: 0 / 4 · 已抽样或缩短"
            : "Review excerpts: 0 / 4 · sampled or shortened",
          { exact: true },
        )
        .waitFor();
      await article
        .getByRole("textbox", {
          name: zh ? "官方课程标识" : "Official course key",
          exact: true,
        })
        .fill("STAT1131");
      await article
        .getByRole("textbox", {
          name: zh ? "经核对的理由" : "Reviewed reason",
          exact: true,
        })
        .fill("Human checked the correct public sources");
      const approve = dialog.getByRole("button", {
        name: zh ? "确认 1 项经核对的修改" : "Confirm 1 reviewed changes",
        exact: true,
      });
      assert.equal(await approve.isDisabled(), true);
      await dialog
        .getByRole("checkbox", {
          name: zh
            ? "我已核对证据并同意这些修改。"
            : "I checked the evidence and approve these changes.",
          exact: true,
        })
        .check();
      await approve.click();
      await dialog.getByText("bind · STAT1131 · v1", { exact: true }).waitFor();
      assert.equal(writes.length, 1);
      assert.equal(
        await article
          .getByRole("textbox", {
            name: zh ? "原始 AI 目标" : "Original AI target",
            exact: true,
          })
          .inputValue(),
        "MATH1131",
      );
      await dialog
        .getByRole("checkbox", {
          name: zh ? "选择 124 COL 1100" : "Select 124 COL 1100",
          exact: true,
        })
        .check();
      await dialog
        .getByRole("button", {
          name: zh ? "拒绝所选建议" : "Reject selected suggestions",
          exact: true,
        })
        .click();
      await dialog
        .getByText(
          zh
            ? "建议已弃用 · RMP 未改变"
            : "Suggestion discarded · RMP unchanged",
          { exact: true },
        )
        .waitFor();
      assert.equal(writes.length, 1);
      assert.equal(
        await page.locator("script").filter({ hasText: "unsafe" }).count(),
        0,
      );
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        `${locale} ${width}px fits`,
      );
      await page.screenshot({
        path: `${output}/${locale}-${width}.png`,
        fullPage: true,
      });
      await context.close();
    }
  }
  console.log(
    "AI assistance: offline export, scoped token privacy, queue paging, explicit subset approval, edited audited result and suggestion-only rejection passed en/zh1440/390/320",
  );
} catch (error) {
  if (active && !active.isClosed()) {
    await active
      .screenshot({ path: `${output}/failure.png`, fullPage: true })
      .catch(() => {});
    console.error((await active.locator("body").innerText()).slice(-6000));
  }
  throw error;
} finally {
  await browser.close();
}
