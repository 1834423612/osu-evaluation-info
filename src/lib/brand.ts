/** Shared identity for the app shell, browser metadata, and install manifest. */
export const brand = {
  name: "Course Atlas",
  title: "Course Atlas · OSU courses & professor ratings",
  description:
    "Explore Ohio State courses, class schedules, and professor evaluations with Course Atlas. OSU 课程查询、课表与教授评价，一站了解。",
  themeColor: "#BA0C2F",
  backgroundColor: "#FAF8F6",
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
