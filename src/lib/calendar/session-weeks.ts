import type { SimulationChoice } from "../planning/simulation.ts";
export function sessionWeeks(choices: SimulationChoice[]) {
  const rows = choices.flatMap((choice) =>
    choice.sections.flatMap((section) =>
      section.meetings
        .filter((meeting) => meeting.startDate && meeting.endDate)
        .map((meeting) => ({
          key: choice.key,
          session: section.session,
          start: meeting.startDate!.slice(0, 10),
          end: meeting.endDate!.slice(0, 10),
        })),
    ),
  );
  const first = rows.map((row) => row.start).sort()[0];
  const last = rows
    .map((row) => row.end)
    .sort()
    .at(-1);
  if (!first || !last) return { weeks: [] as string[], rows };
  const monday = new Date(first + "T12:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weeks = Array.from(
    {
      length: Math.min(
        54,
        Math.floor((Date.parse(last + "T12:00:00Z") - +monday) / 604800000) + 1,
      ),
    },
    (_, index) =>
      new Date(+monday + index * 604800000).toISOString().slice(0, 10),
  );
  return {
    weeks,
    rows: [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()],
  };
}
