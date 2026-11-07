/** Shared identity for the app shell, browser metadata, and install manifest. */
const mascotVariants = {
  bright: "/brand/mascot/variants/vectors/01-flat-color-bright.svg",
  warm: "/brand/mascot/variants/vectors/02-flat-color-warm.svg",
  scarletDetailed:
    "/brand/mascot/variants/vectors/03-monochrome-scarlet-detailed.svg",
  scarletClean:
    "/brand/mascot/variants/vectors/04-monochrome-scarlet-clean.svg",
  charcoal: "/brand/mascot/variants/vectors/05-monochrome-charcoal.svg",
} as const;

export const brand = {
  name: "WahO! / 蛙O！",
  names: { en: "WahO!", zh: "蛙O！" },
  slogan: {
    en: ["Hop into better classes.", "Leap toward your degree."],
    zh: ["选课不迷路，", "毕业有蛙助。"],
  },
  context: {
    en: "OHIO STATE · COURSES & PROFESSOR RATINGS",
    zh: "OHIO STATE · 课程与教授评价",
  },
  title: "WahO! 蛙O！ · OSU courses & professor ratings",
  description:
    "Hop into better classes. Leap toward your degree. 选课不迷路，毕业有蛙助。 Explore Ohio State courses, schedules, and professor evaluations with WahO! 蛙O！",
  themeColor: "#BA0C2F",
  backgroundColor: "#FAF8F6",
  assets: {
    portrait: "/brand/mascot/portrait.webp",
    mascot: "/brand/mascot/full.webp",
    vectorVariants: mascotVariants,
    expressions: {
      salute: "/brand/mascot/expressions/salute/salute-512.webp",
      "belly-laugh":
        "/brand/mascot/expressions/belly-laugh/belly-laugh-512.webp",
      "pointing-laugh":
        "/brand/mascot/expressions/pointing-laugh/pointing-laugh-512.webp",
      "tired-typing":
        "/brand/mascot/expressions/tired-typing/tired-typing-256.webp",
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
