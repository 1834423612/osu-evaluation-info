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
  const reports = [
    {
      id: "student",
      title: "Student Plan",
      detail: t(
        "Courses, semesters, transfer and exam credit.",
        "课程、学期安排、转学学分和考试学分。",
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
      title: "Planned · Standard / Expanded",
      detail: t(
        "Optional. Requirements for your intended programs.",
        "按需添加，包含目标专业的详细要求。",
      ),
    },
  ] as const;
  return (
    <section
      className={styles.importGuide}
      data-analytics-area="planning_reports"
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
        {reports.map((item) => (
          <article key={item.id}>
            <header>
              {coverage[item.id] ? <Check size={18} /> : <FileText size={18} />}
              <strong>{item.title}</strong>
            </header>
            <p>{item.detail}</p>
            <details>
              <summary>
                {t("Download & print settings", "下载位置与打印设置")}
              </summary>
              <p>
                {item.id === "student"
                  ? t(
                      "In Plan your Path, use the plan print/export button. Turn off profile, notes and activities when available.",
                      "在 Plan your Path 使用计划的打印／导出按钮。可关闭个人资料、笔记和活动。",
                    )
                  : t(
                      `In Track Progress, select ${item.id === "official" ? "Official" : "Planned"}, then Standard or Expanded (Beta) in the audit print menu. Enable Include all constraints and the required programs. Save as PDF with browser headers and footers off.`,
                      `在 Track Progress 选择 ${item.id === "official" ? "Official" : "Planned"}，在审计打印菜单选择 Standard 或 Expanded（Beta）。勾选 Include all constraints 和所需专业。保存 PDF 时关闭浏览器页眉页脚。`,
                    )}
              </p>
              {item.id !== "student" && (
                <p>
                  {t(
                    "For intended programs, Standard with all requirements includes the full outline. In Expanded, expand each target program before printing and check that its course requirements appear in the preview.",
                    "目标专业可使用包含全部要求的 Standard。使用 Expanded 时先展开各目标专业，确认打印预览中实际包含其课程要求。",
                  )}
                </p>
              )}
            </details>
            <button onClick={() => choose(item.id)}>
              {coverage[item.id]
                ? t("Update report", "更新报告")
                : t("Choose PDF", "选择 PDF")}
            </button>
          </article>
        ))}
      </div>
      <p>
        {t(
          "Report type is detected from PDF contents. You can select multiple reports together.",
          "系统根据 PDF 正文自动识别类型，可以一次选择多份报告。",
        )}
      </p>
      <a
        href="https://registrar.osu.edu/buckeye-degree-planner/student-guide/"
        target="_blank"
        rel="noreferrer"
      >
        {t("OSU BDP guide", "OSU BDP 使用指南")}
      </a>
      {coverage.outlineOnly && (
        <p role="status">
          {t(
            "Expanded reports add course options, logical conditions and version details to your outline.",
            "Expanded 可为已导入的概览补充可选课程、逻辑条件和版本细节。",
          )}
        </p>
      )}
      {coverage.unlabelled && (
        <p role="status">
          {t(
            "A report has no view label. Its requirements appear under Other reports.",
            "一份报告缺少视图标记，其要求会显示在其他报告中。",
          )}
        </p>
      )}
    </section>
  );
}
