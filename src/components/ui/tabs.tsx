"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { adjacentTabValue, tabSwipeDirection } from "@/lib/gestures/tab-swipe";

function Tabs({
  className,
  orientation = "horizontal",
  swipeable = false,
  onSwipeChange,
  value,
  defaultValue,
  onValueChange,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
  swipeable?: boolean;
  onSwipeChange?: (value: string) => void;
}) {
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const change = (next: string) => {
    setInternalValue(next);
    onValueChange?.(next);
  };
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      data-swipeable-tabs={swipeable || undefined}
      value={value ?? (swipeable ? internalValue : undefined)}
      defaultValue={defaultValue}
      onValueChange={change}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className,
      )}
      {...props}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        start.current = null;
        const target = event.target as Element;
        if (
          !swipeable ||
          orientation !== "horizontal" ||
          event.defaultPrevented ||
          event.touches.length !== 1 ||
          target.closest('[data-swipeable-tabs="true"]') !== event.currentTarget
        )
          return;
        if (
          target.closest(
            'button, input, select, a, textarea, table, iframe, [contenteditable="true"], [role="slider"], [data-chart], [data-trend-chart], [data-rmp-review-content], [data-syllabus-viewer], [data-native-syllabus-scroll], [data-swipe-ignore]',
          )
        )
          return;
        for (
          let node = target;
          node && node !== event.currentTarget;
          node = node.parentElement!
        ) {
          if (
            node.scrollWidth > node.clientWidth + 1 &&
            /auto|scroll/.test(getComputedStyle(node).overflowX)
          )
            return;
        }
        start.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }}
      onTouchEnd={(event) => {
        onTouchEnd?.(event);
        const from = start.current;
        start.current = null;
        const touch = event.changedTouches[0];
        if (!from || !touch || event.defaultPrevented) return;
        const direction = tabSwipeDirection(from, {
          x: touch.clientX,
          y: touch.clientY,
        });
        const root = event.currentTarget;
        const triggers = Array.from(
          root.querySelectorAll<HTMLButtonElement>(
            '[data-slot="tabs-trigger"]',
          ),
        ).filter(
          (trigger) =>
            trigger.closest('[data-slot="tabs"]') === root &&
            !trigger.disabled &&
            trigger.getClientRects().length > 0 &&
            getComputedStyle(trigger).visibility !== "hidden",
        );
        const active = triggers.find(
          (trigger) => trigger.dataset.state === "active",
        );
        const next =
          active &&
          adjacentTabValue(
            triggers.map((trigger) => trigger.dataset.tabValue!),
            active.dataset.tabValue!,
            direction,
          );
        if (next) {
          change(next);
          onSwipeChange?.(next);
        }
      }}
      onTouchCancel={(event) => {
        start.current = null;
        onTouchCancel?.(event);
      }}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-tab-value={props.value}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
