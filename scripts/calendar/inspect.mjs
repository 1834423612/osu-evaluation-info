import { readFile } from "node:fs/promises";
import { parseCalendar, exportCalendar } from "../../src/lib/calendar/ical.ts";
const path = process.argv[2];
if (!path) throw Error("Provide a local ICS file path");
const events = await parseCalendar(await readFile(path, "utf8"));
const again = await parseCalendar(
  exportCalendar("Local validation", events, "validation"),
);
if (again.length !== events.length) throw Error("Round-trip count mismatch");
console.log(
  JSON.stringify({
    events: events.length,
    allDay: events.filter((event) => event.allDay).length,
    timed: events.filter((event) => !event.allDay).length,
    roundTrip: again.length,
  }),
);
