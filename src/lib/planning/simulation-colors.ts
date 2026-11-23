import { eventColor } from "../calendar/week.ts";

const palette = [
  "#326fa4",
  "#287363",
  "#a04867",
  "#7150a0",
  "#956c25",
  "#117c91",
  "#a95622",
  "#66752a",
];

/** Keep a course's meetings together while avoiding collisions within the timetable. */
export function simulationCourseColors(keys: string[]): Record<string, string> {
  const used = new Set<string>();
  return Object.fromEntries(
    [...new Set(keys)].sort().map((key) => {
      const preferred = eventColor(key);
      const start = Math.max(0, palette.indexOf(preferred));
      const color =
        Array.from(
          { length: palette.length },
          (_, i) => palette[(start + i) % palette.length],
        ).find((candidate) => !used.has(candidate)) ?? preferred;
      used.add(color);
      return [key, color];
    }),
  );
}
