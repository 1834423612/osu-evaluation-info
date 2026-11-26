"use client";
import { text, type Locale } from "@/lib/i18n";
import styles from "./course-search-help.module.css";
export function CourseSearchHelp({ locale }: { locale: Locale }) {
  return (
    <details className={styles.help} data-course-search-help>
      <summary>{text(locale, "Advanced search", "高级搜索")}</summary>
      <div>
        <p>
          {text(
            locale,
            "Combine keywords and exact field filters. Put multiword values in quotes.",
            "关键词可与精确字段组合，多词内容用英文双引号包围。",
          )}
        </p>
        <dl>
          <div>
            <dt>
              <code>{'prereq:"MATH 1151"'}</code>
            </dt>
            <dd>
              {text(locale, "Mentions this prerequisite", "先修要求含此课程")}
            </dd>
          </div>
          <div>
            <dt>
              <code>{'title:"Software"'}</code>
            </dt>
            <dd>{text(locale, "Course title", "课程标题")}</dd>
          </div>
          <div>
            <dt>
              <code>{'instructor:"Jane Smith"'}</code>
            </dt>
            <dd>
              {text(locale, "Published section instructor", "目录班次教师")}
            </dd>
          </div>
          <div>
            <dt>
              <code>subject:CSE number:2221</code>
            </dt>
            <dd>
              {text(
                locale,
                "Exact subject and course number",
                "精确科目与课号",
              )}
            </dd>
          </div>
        </dl>
        <p>
          {text(
            locale,
            "Prerequisite text is searched in the published catalog. This does not determine your eligibility. Field filters use the catalog archive and never silently relax into live keyword search.",
            "先修筛选查找已发布目录中的要求文字，不判断你是否符合选课资格。字段筛选使用目录存档，不会悄悄放宽为实时关键词搜索。",
          )}
        </p>
      </div>
    </details>
  );
}
