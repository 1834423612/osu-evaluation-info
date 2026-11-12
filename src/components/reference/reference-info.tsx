"use client";
import { useRef, useState } from "react";
import { Info, X, ArrowUpRight } from "lucide-react";
import { Dialog } from "radix-ui";
import { reference as en } from "@/content/reference/en";
import { reference as zh } from "@/content/reference/zh";
import type { ReferenceTopicId } from "@/content/reference/types";
import { text, type Locale } from "@/lib/i18n";
import { ReferenceContent } from "./reference-content";
import styles from "./reference.module.css";

export function ReferenceInfo({
  topic: id,
  locale,
}: {
  topic: ReferenceTopicId;
  locale: Locale;
}) {
  const copy = locale === "zh" ? zh : en;
  const topic = copy.topics.find((topic) => topic.id === id)!;
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (open)
          setContainer(
            trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
          );
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          ref={trigger}
          className={styles.info}
          data-reference-info={id}
          aria-label={text(
            locale,
            `About ${topic.title}`,
            `查看${topic.title}说明`,
          )}
          title={topic.summary}
        >
          <Info size={13} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Overlay
          className={styles.overlay}
          onClick={(event) => event.stopPropagation()}
        />
        <Dialog.Content
          className={styles.drawer}
          data-reference-drawer
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.drawerHeading}>
            <span className={styles.category}>{topic.category}</span>
            <Dialog.Title>{topic.title}</Dialog.Title>
            <Dialog.Description>{topic.summary}</Dialog.Description>
            <Dialog.Close className={styles.close} aria-label={copy.close}>
              <X size={18} />
            </Dialog.Close>
          </header>
          <div className={styles.drawerBody}>
            <ReferenceContent topic={topic} locale={locale} />
          </div>
          <a
            className={styles.more}
            href={`/reference#${id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.fullPage}
            <ArrowUpRight size={14} />
          </a>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
