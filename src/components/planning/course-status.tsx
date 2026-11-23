import {
  Check,
  Clock3,
  CalendarDays,
  SquareDashed,
  CircleHelp,
  CircleSlash,
  XCircle,
  CircleMinus,
  RotateCcw,
  Circle,
} from "lucide-react";
import type { PlanCourse } from "@/lib/planning/model";
import { text, type Locale } from "@/lib/i18n";
import styles from "./course-status.module.css";

const states = {
  registered: { Icon: Check, en: "Registered", zh: "已注册" },
  "dropped-no-w": {
    Icon: CircleMinus,
    en: "Dropped · no W",
    zh: "退课 · 无 W",
  },
  "withdrawn-w": { Icon: CircleSlash, en: "Withdrawn · W", zh: "退课 · 有 W" },
  completed: { Icon: Check, en: "Completed", zh: "已完成" },
  "in-progress": { Icon: Clock3, en: "In progress", zh: "进行中" },
  planned: { Icon: CalendarDays, en: "Planned", zh: "计划" },
  placeholder: {
    Icon: SquareDashed,
    en: "Choose a course",
    zh: "占位符 · 待选课",
  },
  unknown: { Icon: CircleHelp, en: "Status unavailable", zh: "状态未提供" },
  withdrawn: { Icon: CircleSlash, en: "Withdrawn · W", zh: "退课 · W" },
  dropped: { Icon: CircleMinus, en: "Dropped", zh: "已退选" },
  failed: { Icon: XCircle, en: "Not passed", zh: "未通过" },
  repeated: { Icon: RotateCcw, en: "Retake", zh: "重修" },
  remaining: { Icon: Circle, en: "Remaining", zh: "待完成" },
} as const;

export function CourseStatus({
  status,
  locale,
  iconOnly = false,
  manual = false,
}: {
  status:
    | PlanCourse["status"]
    | NonNullable<PlanCourse["userStatus"]>
    | "placeholder"
    | "repeated"
    | "remaining";
  locale: Locale;
  iconOnly?: boolean;
  manual?: boolean;
}) {
  const { Icon, en, zh } = states[status];
  const label =
    (manual ? text(locale, "Manual · ", "手动 · ") : "") + text(locale, en, zh);
  return (
    <span
      className={styles.badge}
      data-status={status}
      data-icon-only={iconOnly}
      title={label}
      aria-label={iconOnly ? label : undefined}
    >
      <Icon size={14} aria-hidden="true" />
      {!iconOnly && label}
    </span>
  );
}
