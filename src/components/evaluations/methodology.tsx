"use client";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { ProjectInfo } from "@/components/layout/project-info";
import projectStyles from "@/components/layout/project-info.module.css";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import { brand } from "@/lib/brand";
export function Methodology() {
  const { locale } = usePreferences();
  return (
    <>
      <AppHeader active="methodology" />
      <main className="methodology-shell">
        <div className={projectStyles.pageHeading}>
          <div>
            <span className="brand-eyebrow">
              OHIO STATE · {brand.names[locale]}
            </span>
            <h1>
              {text(locale, "Behind the data", "数据从哪里来，分数怎么算")}
            </h1>
          </div>
          <ProjectInfo locale={locale} />
        </div>
        <article>
          <h2>{text(locale, "Current classes", "当前开课信息")}</h2>
          <p>
            {text(
              locale,
              "Courses, sections, meeting times, and enrollment status come from Ohio State’s official class search. Each search retrieves current official data with a short server cache. The time shown is the actual retrieval time. Enrollment can change after retrieval.",
              "课程、班次、上课时间与选课状态来自 OSU 官方课程搜索。每次搜索查询当前官方信息，并使用短时服务端缓存。页面显示实际获取时间，选课状态仍可能在获取后变化。",
            )}
          </p>
          <p>
            <a href="https://classes.osu.edu/" target="_blank" rel="noreferrer">
              classes.osu.edu
            </a>
          </p>
          <p>
            {text(
              locale,
              "The official result count measures class sections, not unique courses. A course may span several result windows; expand its sections to retrieve its full current offering. Some future classes have not published an instructor or schedule yet.",
              "官方结果数量表示开课班次数，不是去重后的课程数。同一课程可能横跨多个结果窗口，展开班次会另行获取该课程的完整开课信息。部分未来班次尚未公布教师或课表。",
            )}
          </p>
        </article>
        <article>
          <h2>
            {text(
              locale,
              "Two evaluation instruments",
              "两套评价量表，分别呈现",
            )}
          </h2>
          <p>
            {text(
              locale,
              "Historical evaluations are read from the project’s PostgreSQL database, imported from official OSU SEI and SSLE reports. Ohio State introduced SSLE in Autumn 2025. SEI uses the overall evaluation item (question 10); SSLE uses the mean across its reported learning-experience items. These instruments measure different things and are never pooled into one score.",
              "历史评价读取项目 PostgreSQL 数据库，源自 OSU 官方 SEI 与 SSLE 报告。OSU 从 2025 秋季启用 SSLE。SEI 使用第 10 题的整体评价，SSLE 使用报告中全部学习体验题目的均值；两者测量含义不同，因此分别计算，绝不混成一个分数。",
            )}
          </p>
          <p>
            {text(
              locale,
              "The primary score uses the most recent available instrument. Its date range, response counts, response rate, and per-term trend appear alongside it. Chart points are response-weighted means within each term; time decay applies only to the combined score. Import timestamps describe database ingestion, not the university’s publication time. A missing rating means no matched evidence; it never becomes a zero.",
              "摘要展示最近可用量表的分数，并提供时间范围、回答数量、回应率及逐学期趋势。图中每个学期按答卷数加权，时间衰减仅用于综合评分。导入时间表示数据库入库时间，不是学校的官方发布时间。没有匹配数据时不显示评分，不会将缺失数据记为零分。",
            )}
          </p>
        </article>
        <article>
          <h2>
            {text(locale, "Recency and evidence", "时间与样本量如何影响评分")}
          </h2>
          <p>
            {text(
              locale,
              "Within each instrument, scores are weighted by response count and an exponential time decay with a two-year half-life. A response from two years ago receives half the weight of a current response. Coverage labels describe the amount and spread of historical evidence; they are not statistical confidence intervals.",
              "在同一量表内部，分数按回答数量与时间衰减加权，时间衰减半衰期为两年；两年前的数据权重约为当前数据的一半。覆盖标签描述历史证据的数量与跨度，不代表统计学置信区间。",
            )}
          </p>
          <p>
            {text(
              locale,
              "A directional signal requires at least 30 raw responses and 30 time-decayed responses, two instructor-section evaluation records, two terms, and a latest observation within two years. With that coverage, scores of 4.2 or above give a positive signal, 3.3 or below give a caution signal, and the rest give a mixed signal. Coverage is high with at least 100 raw responses and three records, otherwise moderate. Samples below the minimums remain limited. These signals describe teaching evaluations and do not predict grades, workload, difficulty, or personal fit. Responses are not unique people; team-taught classes can contribute one evaluation record for each evaluated instructor.",
              "方向性信号要求至少 30 份原始答卷与 30 份时间衰减后的答卷权重、2 条教师班次评价记录、2 个学期，且最近观测不超过两年。满足条件后，评分 ≥4.2 显示积极信号，≤3.3 显示留意信号，其余为信号不一。达到 100 份原始答卷与 3 条记录时覆盖为较充分，否则为适中；不满足最低条件的样本标为有限。这些信号只反映教学评价，不预测成绩、工作量、难度或个人适配程度。答卷数不是独立人数；团队授课中每位被评价教师可能各有一条记录。",
            )}
          </p>
        </article>
        <article>
          <h2>
            {text(
              locale,
              "Matching courses and instructors",
              "课程与教师如何匹配",
            )}
          </h2>
          <p>
            {text(
              locale,
              "Course history is matched by subject, catalog number, and campus. Instructor ratings require an exact OSU email identity within the same course; similar names are not enough. Course history is not presented as the current instructor’s personal rating.",
              "课程历史按学科、课程编号与校区匹配。教师评分必须在同一课程内通过 OSU 邮箱身份精确匹配，相似姓名不足以建立关联。课程历史评分不会被展示为当前教师的个人评分。",
            )}
          </p>
          <p>
            {text(
              locale,
              `${brand.names.en} is an independent explorer. Use Buckeye Link and official university advising to confirm registration, requirements, and degree applicability.`,
              `${brand.names.zh} 是独立的课程查询工具，注册选课、先修要求与学位适用性请以 Buckeye Link 和学校官方学业指导为准。`,
            )}
          </p>
        </article>
      </main>
      <AppFooter />
    </>
  );
}
