import { Check, FileText } from "lucide-react";
import type { Plan } from "@/lib/planning/model";
import {
  importCoverage,
  type ImportProfile,
} from "@/lib/planning/import-profile";
import { text, type Locale } from "@/lib/i18n";
import styles from "./planning.module.css";

export function ImportGuide({
  plan,
  locale,
  choose,
}: {
  plan: Plan;
  locale: Locale;
  choose: (profile: ImportProfile) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const coverage = importCoverage(plan);
  return (
    <section
      className={styles.importGuide}
      aria-label={t("Which PDFs to bring", "需要哪些 PDF")}
    >
      <h2>{t("Two reports to start", "通常从两份文件开始")}</h2>
      <p>
        {t(
          "Add a Planned report when exploring another program or future-course requirements.",
          "规划其他专业或未来课程时，再补充一份 Planned 报告。",
        )}
      </p>
      <div className={styles.importChoices}>
        {(
          [
            {
              id: "student",
              title: "Student Plan",
              detail: t(
                "Your courses, semesters, transfer and exam credit.",
                "课程、学期安排、转学分和考试学分。",
              ),
            },
            {
              id: "official",
              title: "Official · Expanded",
              detail: t(
                "Detailed requirements for your declared programs.",
                "当前正式专业的详细毕业要求。",
              ),
            },
            {
              id: "planned",
              title: "Planned · Expanded",
              detail: t(
                "Optional. Include each intended program and its requirements.",
                "按需添加。包含期望专业及其详细要求。",
              ),
            },
          ] as const
        ).map((item) => (
          <button key={item.id} onClick={() => choose(item.id)}>
            {coverage[item.id] ? <Check size={20} /> : <FileText size={20} />}
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
            <small>
              {coverage[item.id]
                ? t("Imported", "已导入")
                : t("Choose this report", "选择此类文件")}
            </small>
          </button>
        ))}
      </div>
      <details>
        <summary>
          {t("Where to download and print", "下载位置与打印设置")}
        </summary>
        <ol>
          <li>
            {t(
              "In Plan your Path, use the plan's print/export button to create Student Plan. Turn off profile, notes and activities when available.",
              "在 Plan your Path 使用计划的打印／导出按钮生成 Student Plan。可关闭个人资料、笔记和活动。",
            )}
          </li>
          <li>
            {t(
              "In Track Progress, select Official, then the audit print menu and Expanded (Beta). Select Include all constraints, include the required programs, and save the browser print view as PDF with headers and footers off.",
              "在 Track Progress 选择 Official，通过审计打印菜单选择 Expanded（Beta）。勾选 Include all constraints，包含所需的全部项目，再用浏览器打印保存 PDF，关闭页眉页脚。",
            )}
          </li>
          <li>
            {t(
              "For a what-if plan, switch to Planned and the intended plan, then repeat the Expanded export. Check the intended program's detailed requirements appear in the preview.",
              "需要目标专业时，切换 Planned 和对应计划，再导出 Expanded。预览中应能看到目标专业的详细要求。",
            )}
          </li>
        </ol>
        <p>
          {t(
            "Standard provides an outline when Expanded is unavailable. Compact and repeated exports from another tab add little detail. Programs marked Planned-only require a Planned export.",
            "Expanded 不可用时可用 Standard 获取概览。Compact 和另一入口的重复文件可省去。标注仅在 Planned 可见的专业需要另外导出 Planned。",
          )}
        </p>
        <a
          href="https://registrar.osu.edu/buckeye-degree-planner/student-guide/"
          target="_blank"
          rel="noreferrer"
        >
          {t("OSU BDP guide", "OSU BDP 使用指南")}
        </a>
      </details>
      {coverage.outlineOnly && (
        <p role="status">
          {t(
            "An outline report is present. Expanded adds course options, logical conditions and version details.",
            "已导入概览报告。Expanded 可补充可选课程、逻辑条件和版本细节。",
          )}
        </p>
      )}
      {coverage.unlabelled && (
        <p role="status">
          {t(
            "This report does not identify its view. It remains separate from explicitly labelled Official and Planned reports.",
            "此报告未标明视图，将单独保留，不会覆盖已标明 Official 或 Planned 的报告。",
          )}
        </p>
      )}
    </section>
  );
}
