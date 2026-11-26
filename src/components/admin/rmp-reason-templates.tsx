"use client";
import { Button } from "@/components/ui/button";
export function RmpReasonTemplates({
  zh,
  onSelect,
}: {
  zh: boolean;
  onSelect: (reason: string) => void;
}) {
  const templates = [
    [
      "Label correction",
      "标签修正",
      "Manual correction of the source course label.",
      "人工修正原始课程标签。",
    ],
    [
      "Keep unbound",
      "保留未绑定",
      "Course-label association removed pending further review.",
      "移除课程标签绑定，等待进一步核对。",
    ],
    [
      "Reject association",
      "拒绝关联",
      "Suggested course-label association rejected after manual review.",
      "经人工核对，拒绝建议的课程标签关联。",
    ],
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={zh ? "理由模板" : "Reason templates"}
    >
      <span className="text-xs text-muted-foreground">
        {zh ? "理由模板" : "Reason templates"}
      </span>
      {templates.map((template) => (
        <Button
          key={template[0]}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(template[zh ? 3 : 2])}
        >
          {template[zh ? 1 : 0]}
        </Button>
      ))}
    </div>
  );
}
