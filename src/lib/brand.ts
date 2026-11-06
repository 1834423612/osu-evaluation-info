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
    social: "/brand/social/og-image.png",
    icons: {
      app192: "/brand/icons/app-192.png",
      app512: "/brand/icons/app-512.png",
      maskable192: "/brand/icons/maskable-192.png",
      maskable512: "/brand/icons/maskable-512.png",
    },
  },
} as const;
