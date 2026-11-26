# Reconciliation interface references

English · [简体中文](../zh-CN/design/reconciliation.md)

The RMP review workspace follows a candidate → evidence → decision workflow. A unique-looking label is not sufficient authority to assign teaching history; conflicting subject candidates remain visible for review. [OpenRefine's reconciliation manual](https://openrefine.org/docs/manual/reconciling) describes semi-automated matching with human approval and iterative review of subsets. This informs the interaction model, without adding a separate external reconciliation service.

For density, [GitHub Primer DataTable](https://primer.style/product/components/data-table/) documents condensed cells, explicit column widths, sorting and pagination. Its [Filter pattern](https://primer.style/product/internal-components/filter/) separates query changes, parsing and validation. That component is internal to GitHub, so this project implements the relevant patterns with its own React controls.

[Element Plus Table](https://element-plus.org/en-US/component/table.html) provides a reference for filterable columns, expanded rows, stable row identities and overflow details. The [shadcn data-table guide](https://ui.shadcn.com/docs/components/data-table) shows composing filtering, column controls and pagination around application-specific data. Neither reference requires replacing the existing application styling or installing a Vue dependency.

The resulting layout keeps operational fields in a compact list, exposes status and evidence without relying on color alone, and opens the full record for preview and a reasoned manual decision. Combined filters and bounded pagination keep reviews manageable. Narrow screens prioritize identity, course label and state; secondary evidence remains available in the detail view. Development access receives an explicit warning rather than looking like a normal authenticated production session.
