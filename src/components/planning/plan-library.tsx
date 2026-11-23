"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronDown, Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { browserUuid } from "@/lib/uuid";
import { text, type Locale } from "@/lib/i18n";
import { createScenario } from "@/lib/planning/scenarios";
import type { Plan } from "@/lib/planning/model";
import styles from "./plan-tools.module.css";
export function PlanLibrary({
  workspace,
  update,
  active,
  select,
  locale,
  disabled,
}: {
  workspace: Plan;
  update: (edit: (p: Plan) => Plan) => void;
  active: string | null;
  select: (id: string | null) => void;
  locale: Locale;
  disabled: boolean;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [mode, setMode] = useState<"new" | "rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const current = workspace.scenarios?.find((s) => s.id === active);
  function save() {
    try {
      if (mode === "new") {
        const id = browserUuid();
        update((p) => createScenario(p, name, id));
        select(id);
      } else if (mode === "rename") {
        update((p) => ({
          ...p,
          scenarios: p.scenarios?.map((s) =>
            s.id === active ? { ...s, title: name.trim() } : s,
          ),
        }));
      } else {
        update((p) => ({
          ...p,
          scenarios: p.scenarios?.filter((s) => s.id !== active),
        }));
        select(null);
      }
      setMode(null);
    } catch {
      setError(
        t(
          "Unable to save. Check the plan limit or local storage.",
          "保存失败，请检查方案数量上限与本地存储。",
        ),
      );
    }
  }
  return (
    <>
      <div className={styles.library} data-plan-library data-telemetry-private>
        <div className={styles.libraryDesktop}>
          <label className={styles.picker}>
            <strong>{t("Workspace", "规划工作区")}</strong>
            <ChoiceSelect
              value={active ?? "personal"}
              disabled={disabled}
              onValueChange={(value) =>
                select(value === "personal" ? null : value)
              }
              aria-label={t("Choose planning workspace", "选择规划工作区")}
            >
              <option value="personal">
                {t("My academic plan", "我的学业规划")}
              </option>
              {workspace.scenarios?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <p>
            {current
              ? t(
                  "Independent plan · kept separate from your academic record",
                  "独立方案 · 与个人学业记录分开保存",
                )
              : t(
                  "Your academic record and personal semesters",
                  "个人学业记录与学期安排",
                )}
          </p>
          <div className={styles.actions}>
            <Button
              variant="outline"
              aria-label={t("New independent plan", "新建独立方案")}
              disabled={disabled || (workspace.scenarios?.length ?? 0) >= 20}
              onClick={() => {
                setName("");
                setError("");
                setMode("new");
              }}
            >
              <Plus size={15} />
              <span className={styles.newPlanLabel}>
                {t("New plan", "新建方案")}
              </span>
            </Button>
            {current ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={t("Rename plan", "重命名方案")}
                  onClick={() => {
                    setName(current.title);
                    setError("");
                    setMode("rename");
                  }}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={t("Delete independent plan", "删除独立方案")}
                  onClick={() => {
                    setError("");
                    setMode("delete");
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <div className={styles.libraryMobile}>
          <DropdownMenu.Root modal>
            <DropdownMenu.Trigger asChild>
              <button
                className={`${styles.navButton} ${styles.planTrigger}`}
                disabled={disabled}
                aria-label={t("Choose planning workspace", "选择规划工作区")}
              >
                <span>
                  {current?.title ?? t("My academic plan", "我的学业规划")}
                </span>
                <ChevronDown size={13} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={styles.navMenu}
                align="start"
                sideOffset={8}
                collisionPadding={12}
                data-telemetry-private
              >
                <DropdownMenu.RadioGroup
                  value={active ?? "personal"}
                  onValueChange={(value) =>
                    select(value === "personal" ? null : value)
                  }
                >
                  {[
                    {
                      id: "personal",
                      title: t("My academic plan", "我的学业规划"),
                    },
                    ...(workspace.scenarios ?? []),
                  ].map((item) => (
                    <DropdownMenu.RadioItem
                      key={item.id}
                      className={styles.navItem}
                      value={item.id}
                      title={item.title}
                    >
                      <span className={styles.menuIndicator}>
                        <DropdownMenu.ItemIndicator>
                          <Check size={13} />
                        </DropdownMenu.ItemIndicator>
                      </span>
                      <span>{item.title}</span>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
                {current ? (
                  <>
                    <DropdownMenu.Separator className={styles.menuSeparator} />
                    <DropdownMenu.Item
                      className={styles.navItem}
                      onSelect={() =>
                        setTimeout(() => {
                          setName(current.title);
                          setError("");
                          setMode("rename");
                        }, 0)
                      }
                    >
                      <Pencil size={13} />
                      {t("Rename this plan", "重命名这个规划")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={styles.navItem}
                      onSelect={() =>
                        setTimeout(() => {
                          setError("");
                          setMode("delete");
                        }, 0)
                      }
                    >
                      <Trash2 size={13} />
                      {t("Delete this plan", "删除这个规划")}
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button
            className={`${styles.navButton} ${styles.addPlan}`}
            disabled={disabled || (workspace.scenarios?.length ?? 0) >= 20}
            aria-label={t("New independent plan", "新建独立方案")}
            onClick={() => {
              setName("");
              setError("");
              setMode("new");
            }}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      <WorkspaceDialog
        open={!!mode}
        onOpenChange={(open) => {
          if (!open) setMode(null);
        }}
        title={
          mode === "new"
            ? t("New independent plan", "新建独立方案")
            : mode === "rename"
              ? t("Rename plan", "重命名方案")
              : t("Delete independent plan?", "删除这个独立方案？")
        }
        description={
          mode === "delete"
            ? t(
                "This removes this plan from your saved workspace and synced devices.",
                "这会从工作区及同步设备中删除这个方案。",
              )
            : t(
                "Give an alternative course combination its own name.",
                "为另一种课程组合起一个独立名称。",
              )
        }
        closeLabel={t("Close", "关闭")}
      >
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {mode !== "delete" ? (
            <label>
              {t("Plan name", "方案名称")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                autoFocus
              />
            </label>
          ) : (
            <p>{current?.title}</p>
          )}
          {error ? <p role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode(null)}
            >
              {t("Cancel", "取消")}
            </Button>
            <Button disabled={mode !== "delete" && !name.trim()}>
              {mode === "delete"
                ? t("Delete plan", "删除方案")
                : t("Save plan", "保存方案")}
            </Button>
          </div>
        </form>
      </WorkspaceDialog>
    </>
  );
}
