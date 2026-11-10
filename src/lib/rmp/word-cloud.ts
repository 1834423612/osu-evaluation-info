export type CloudBox = {
  id: string;
  width: number;
  height: number;
  angle: number;
};
export type PlacedCloudWord = CloudBox & { x: number; y: number };
export const CLOUD_COLORS = [
  "#b43b58",
  "#287b78",
  "#7552a2",
  "#9c6a23",
  "#3f6fa8",
  "#728033",
  "#b75a3c",
  "#595ca2",
  "#397b52",
  "#a34886",
  "#347487",
  "#8b6174",
] as const;

export function wordSeed(value: string) {
  let hash = 2166136261;
  for (const character of value)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function cloudFontSize(count: number, counts: number[]) {
  const max = Math.max(1, ...counts),
    min = Math.min(...counts);
  return max === min
    ? 19
    : 11 + 16 * Math.sqrt(Math.max(0, (count - min) / (max - min)));
}
export function cloudWordAngle(id: string, index: number) {
  if (!index) return 0;
  const seed = wordSeed(id);
  if (index > 2 && id.length < 18 && seed % 5 === 0) return 90;
  return [0, -7, 0, 7, 0][seed % 5];
}
function dimensions(box: CloudBox) {
  const radians = (box.angle * Math.PI) / 180;
  return {
    width:
      Math.abs(box.width * Math.cos(radians)) +
      Math.abs(box.height * Math.sin(radians)) +
      6,
    height:
      Math.abs(box.height * Math.cos(radians)) +
      Math.abs(box.width * Math.sin(radians)) +
      6,
  };
}

/** Seeded elliptical packing: stable between renders, collision-free after resize/translation. */
export function packWordCloud(boxes: CloudBox[], width: number) {
  if (!boxes.length || width < 1)
    return { words: [] as PlacedCloudWord[], height: 0 };
  const sizes = boxes.map(dimensions);
  let height = Math.max(
    96,
    (sizes.reduce((area, box) => area + box.width * box.height, 0) / width) *
      1.55,
  );
  for (let attempt = 0; attempt < 12; attempt++, height = height * 1.2 + 12) {
    const placed: { x: number; y: number; width: number; height: number }[] =
      [];
    for (let index = 0; index < boxes.length; index++) {
      const size = sizes[index];
      let found = false;
      for (let step = 0; step < 1600; step++) {
        const radius = Math.sqrt(step / 1599);
        const theta = wordSeed(boxes[index].id) + step * 2.39996323;
        const x =
          width / 2 +
          (Math.cos(theta) * radius * Math.max(0, width - size.width)) / 2;
        const y =
          height / 2 +
          (Math.sin(theta) * radius * Math.max(0, height - size.height)) / 2;
        if (size.width > width || size.height > height) break;
        if (
          placed.some(
            (other) =>
              Math.abs(x - other.x) < (size.width + other.width) / 2 &&
              Math.abs(y - other.y) < (size.height + other.height) / 2,
          )
        )
          continue;
        placed.push({ x, y, ...size });
        found = true;
        break;
      }
      if (!found) break;
    }
    if (placed.length !== boxes.length) continue;
    const top = Math.min(...placed.map((item) => item.y - item.height / 2));
    const bottom = Math.max(...placed.map((item) => item.y + item.height / 2));
    const usedHeight = Math.max(108, bottom - top + 12);
    const shift = (usedHeight - (bottom - top)) / 2 - top;
    return {
      words: boxes.map((box, index) => ({
        ...box,
        x: placed[index].x,
        y: placed[index].y + shift,
      })),
      height: usedHeight,
    };
  }
  // Pathological translated phrases remain visible even if they need a taller cloud.
  let y = 6;
  return {
    words: boxes.map((box, index) => {
      const h = sizes[index].height;
      const word = { ...box, x: width / 2, y: y + h / 2 };
      y += h;
      return word;
    }),
    height: y + 6,
  };
}
