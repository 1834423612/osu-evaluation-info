export type Locale = "en" | "zh";
export function text(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

export const campusOptions = [
  { value: "col", en: "Columbus", zh: "哥伦布" },
  { value: "lma", en: "Lima", zh: "利马" },
  { value: "mns", en: "Mansfield", zh: "曼斯菲尔德" },
  { value: "mrn", en: "Marion", zh: "马里恩" },
  { value: "nwk", en: "Newark", zh: "纽瓦克" },
  { value: "wst", en: "Wooster", zh: "伍斯特" },
] as const;

export function localizedCampus(value: string, locale: Locale) {
  const campus = campusOptions.find(
    (option) => option.value === value.toLowerCase(),
  );
  return campus ? campus[locale] : value;
}

export const facetLabels: Record<string, [string, string]> = {
  campus: ["Campus", "校区"],
  subject: ["Subject", "学科"],
  term: ["Term", "学期"],
  "academic-career": ["Course level", "课程层次"],
  "instruction-mode": ["Instruction mode", "授课方式"],
  "catalog-number": ["Course number", "课程编号"],
  "gen-categories": ["General education", "通识教育"],
  "class-session": ["Session", "学期时段"],
  component: ["Class component", "班次类型"],
  "enrollment-status": ["Availability", "开课状态"],
  "meeting-days": ["Meeting days", "上课日期"],
  "academic-program": ["Academic program", "学术项目"],
  "class-attribute": ["Course attributes", "课程属性"],
  "class-attribute-value": ["Attribute values", "属性细分"],
  evening: ["Evening classes", "晚间课程"],
};

export function localizedTerm(value: string, locale: Locale) {
  if (locale === "en") return value;
  return value
    .replace(/Spring\s*(\d{4})/i, "$1 春季")
    .replace(/Summer\s*(\d{4})/i, "$1 夏季")
    .replace(/Autumn\s*(\d{4})/i, "$1 秋季");
}
