import { instructionModes } from "./instruction-modes/en";
import { components } from "./components/en";
import { sei } from "./sei/en";
import { ssle } from "./ssle/en";
import { scoring } from "./scoring/en";
export const reference = {
  title: "A guide to OSU classes & ratings",
  intro:
    "Understand the labels before choosing a class. Official definitions and survey summaries sit alongside the project’s own scoring notes.",
  eyebrow: "WAHO! / FIELD GUIDE",
  contents: "Explore the guide",
  sources: "Sources",
  checked: "Sources checked · November 12, 2026",
  close: "Close explanation",
  fullPage: "Open the full guide",
  formula: "Show the calculation",
  equation:
    "Score equals the sum of response count times reported mean times two to the power of minus age in years divided by two, divided by the sum of response count times the same time factor.",
  variables:
    "n = responses · m = reported mean · a = age in years. A two-year-old response has half the weight of a current one. Term dates use semester midpoint approximations.",
  topics: [instructionModes, components, sei, ssle, scoring],
};
