import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postcss from "postcss";

export function inspectStylesheet(css, filename = "stylesheet.css") {
  const root = postcss.parse(css, { from: filename });
  const issues = [];
  const selectors = new Map();

  root.walkRules((rule) => {
    const scope = [];
    for (
      let parent = rule.parent;
      parent?.type !== "root";
      parent = parent.parent
    ) {
      scope.unshift(
        parent.type === "atrule"
          ? `@${parent.name} ${parent.params}`
          : parent.selector,
      );
    }
    for (const selector of rule.selectors) {
      const key = JSON.stringify([scope, selector]);
      const previous = selectors.get(key);
      if (previous) {
        issues.push({
          line: rule.source.start.line,
          message: `Duplicate selector "${selector}" in the same scope (first declared on line ${previous}). Merge its declarations.`,
        });
      } else {
        selectors.set(key, rule.source.start.line);
      }
    }
  });

  // Inspect each declaration block, including @font-face and design tokens.
  const containers = [root];
  root.walk((node) => {
    if (node.nodes) containers.push(node);
  });
  for (const container of containers) {
    const properties = new Map();
    for (const node of container.nodes) {
      if (node.type !== "decl") continue;
      const property = node.prop.startsWith("--")
        ? node.prop
        : node.prop.toLowerCase();
      const previous = properties.get(property);
      if (previous) {
        issues.push({
          line: node.source.start.line,
          message: `Duplicate property "${property}" (first declared on line ${previous}). Keep one value per declaration block.`,
        });
      } else {
        properties.set(property, node.source.start.line);
      }
    }
  }

  let conditionalStylesStarted = false;
  for (const node of root.nodes) {
    if (
      node.type === "atrule" &&
      ["media", "supports", "container"].includes(node.name)
    ) {
      conditionalStylesStarted = true;
    } else if (node.type === "rule" && conditionalStylesStarted) {
      issues.push({
        line: node.source.start.line,
        message:
          "Base rule appears after conditional overrides. Move base styles before responsive and state-specific at-rules.",
      });
    }
  }

  return issues;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const files = globSync("src/**/*.css").sort();
  let issueCount = 0;
  for (const filename of files) {
    try {
      for (const issue of inspectStylesheet(
        readFileSync(filename, "utf8"),
        filename,
      )) {
        console.error(`${filename}:${issue.line}: ${issue.message}`);
        issueCount++;
      }
    } catch (error) {
      console.error(`${filename}: ${error.message}`);
      issueCount++;
    }
  }
  if (issueCount) {
    console.error(
      `CSS check failed: ${issueCount} issue(s) in ${files.length} stylesheets.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `CSS check passed: ${files.length} stylesheets, no duplicate selectors or properties, base styles precede conditional overrides.`,
    );
  }
}
