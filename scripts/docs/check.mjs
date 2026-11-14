import { readdir, readFile, access } from "node:fs/promises";
import { resolve, dirname, relative, extname } from "node:path";
const root = process.cwd();
async function walk(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(resolve(folder, entry.name))
          : [resolve(folder, entry.name)],
      ),
    )
  ).flat();
}
const docs = (await walk(resolve(root, "docs"))).filter(
  (p) => extname(p) === ".md",
);
const pairs = [
  ["README.md", "README.zh-CN.md"],
  ...docs
    .filter((p) => !relative(root, p).replaceAll("\\", "/").includes("/zh-CN/"))
    .map((p) => [
      relative(root, p).replaceAll("\\", "/"),
      "docs/zh-CN/" + relative(resolve(root, "docs"), p).replaceAll("\\", "/"),
    ]),
  ...["methodology", "reference"].map((name) => [
    `src/content/${name}/README.md`,
    `docs/zh-CN/content/${name}.md`,
  ]),
];
const problems = [];
const content = new Map();
for (const [en, zh] of pairs)
  for (const [file, chinese] of [
    [en, false],
    [zh, true],
  ]) {
    let source;
    try {
      source = await readFile(resolve(root, file), "utf8");
    } catch {
      problems.push(`${file}: missing language counterpart`);
      continue;
    }
    content.set(file, source);
    if (
      !(chinese
        ? source.includes("[English](")
        : source.includes("[简体中文]("))
    )
      problems.push(`${file}: missing language switch`);
    const prose = source.replace(/```[\s\S]*?```/g, "");
    if (
      !chinese &&
      /[\u4e00-\u9fff]/.test(
        prose.replace(/`[^`]*`/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, ""),
      )
    )
      problems.push(
        `${file}: Chinese prose outside a quoted literal or language link`,
      );
    if (/\/(?:home\/kjch|Users\/KJCH|tmp\/osu[_-])\//.test(prose))
      problems.push(`${file}: private machine/evidence path`);
    for (const match of prose.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1].replace(/^<|>$/g, "").split(/\s+["']/)[0];
      if (/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(href)) continue;
      let path;
      try {
        path = decodeURIComponent(href.split("#")[0]);
      } catch {
        problems.push(`${file}: invalid link ${href}`);
        continue;
      }
      if (!path) continue;
      const target = path.startsWith("/")
        ? resolve(root, path.slice(1))
        : resolve(dirname(resolve(root, file)), path);
      try {
        await access(target);
      } catch {
        problems.push(`${file}: broken local link ${href}`);
      }
    }
  }
const tests = (await walk(resolve(root, "tests"))).filter((p) =>
  /(?:\.(?:test|browser)\.mjs$|(?:^|[\\/])test_[^\\/]+\.py$|[\\/]check-pdf\.py$)/.test(
    p,
  ),
);
for (const test of tests) {
  const name = relative(root, test).replaceAll("\\", "/");
  for (const file of ["docs/testing.md", "docs/zh-CN/testing.md"])
    if (!content.get(file)?.includes(name))
      problems.push(`${file}: undocumented test ${name}`);
}
const listedZh = new Set(pairs.map((p) => resolve(root, p[1])));
for (const file of docs.filter((p) =>
  relative(root, p).replaceAll("\\", "/").includes("/zh-CN/"),
))
  if (!listedZh.has(file))
    problems.push(`${relative(root, file)}: no English counterpart`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Documentation check passed: ${pairs.length} paired guides, local links and ${tests.length} documented test scripts.`,
  );
