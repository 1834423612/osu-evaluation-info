/** Shared identity for the app shell, browser metadata, and install manifest. */
export const brand = {
  name: "WahO!",
  names: { en: "WahO!", zh: "蛙O！" },
  slogan: {
    en: ["Hop into better classes.", "Leap toward your degree."],
    zh: ["选课不迷路，", "毕业有蛙助。"],
  },
  context: {
    en: "OHIO STATE · COURSES & PROFESSOR RATINGS",
    zh: "OHIO STATE · 课程与教授评价",
  },
  title: "WahO! | OSU Course Atlas",
  description:
    "Explore Ohio State courses, schedules, and professor evaluations. Hop into better classes and leap toward your degree with WahO!",
  themeColor: "#BA0C2F",
  backgroundColor: "#FAF8F6",
  links: {
    repository: "https://github.com/1834423612/osu-evaluation-info",
    mainBranch: "https://github.com/1834423612/osu-evaluation-info/tree/master",
    author: "https://github.com/1834423612",
    website: "https://www.kjch.net",
  },
  assets: {
    portrait: "/brand/mascot/portrait.webp",
    mascot: "/brand/mascot/full.webp",
    expressions: {
      salute: "/brand/mascot/expressions/salute.webp",
      "belly-laugh": "/brand/mascot/expressions/belly-laugh.webp",
      "pointing-laugh": "/brand/mascot/expressions/pointing-laugh.webp",
      "tired-typing": "/brand/mascot/expressions/tired-typing.webp",
    },
    social: "/brand/social/og-image.png",
    icons: {
      app192: "/brand/icons/app-192.png",
      app512: "/brand/icons/app-512.png",
      maskable192: "/brand/icons/maskable-192.png",
      maskable512: "/brand/icons/maskable-512.png",
    },
  },
} as const;

export type MascotExpression =
  "thinking" | keyof typeof brand.assets.expressions;

export function localizedDocumentTitle(locale: "en" | "zh", pathname: string) {
  const section = pathname.startsWith("/rmp")
    ? locale === "zh"
      ? "RMP 教师库"
      : "RMP faculty library"
    : pathname.startsWith("/saved")
      ? locale === "zh"
        ? "收藏"
        : "Saved courses"
      : pathname.startsWith("/methodology")
        ? locale === "zh"
          ? "数据与方法"
          : "Behind the data"
        : pathname.startsWith("/reference")
          ? locale === "zh"
            ? "OSU 课程说明"
            : "OSU field guide"
          : null;
  const home = locale === "zh" ? "蛙O！ | OSU 课程信息汇总" : brand.title;
  return section ? `${section} · ${home}` : home;
}
