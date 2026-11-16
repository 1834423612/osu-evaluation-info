import { collectionIcons } from "./collection-icons.ts";

export const collectionIconCategories = [
  {
    id: "organize",
    en: "Organize",
    zh: "整理",
    keywords: "folder plan schedule task 文件夹 计划 日程 任务",
    icons:
      "folder|文件夹,folder-heart|心愿夹,folder-open|打开文件夹,clipboard-list|清单,calendar|日历,calendar-days|日程,clock|时钟,hourglass|沙漏,bookmark|书签,flag|旗帜,target|目标,circle-check|完成,list-todo|待办,shield-check|保障",
  },
  {
    id: "study",
    en: "Study",
    zh: "学习",
    keywords: "education school book 学业 教育 学校 书",
    icons:
      "book-open|书本,book-marked|标记书籍,library|图书馆,graduation-cap|毕业,school|学校,university|大学,notebook|笔记本,notepad-text|笔记,lightbulb|灵感,backpack|书包,pencil|铅笔,highlighter|荧光笔,ruler|尺子,languages|语言",
  },
  {
    id: "science",
    en: "Science & health",
    zh: "科学与健康",
    keywords: "lab research math medicine 实验 研究 数学 医学",
    icons:
      "brain|大脑,flask-conical|烧瓶,microscope|显微镜,atom|原子,dna|基因,calculator|计算器,sigma|求和,test-tube|试管,stethoscope|听诊器,heart-pulse|心率",
  },
  {
    id: "tech",
    en: "Technology",
    zh: "科技",
    keywords: "computer programming engineering 计算机 编程 工程",
    icons:
      "binary|二进制,code|代码,laptop|笔记本电脑,monitor|显示器,rocket|火箭,cpu|芯片,database|数据库,terminal|终端,circuit-board|电路板,bot|机器人",
  },
  {
    id: "creative",
    en: "Arts & media",
    zh: "艺术与媒体",
    keywords: "art design music photo 艺术 设计 音乐 摄影",
    icons:
      "pen-tool|钢笔工具,palette|调色板,music|音乐,camera|相机,film|电影,headphones|耳机,brush|画笔,gamepad2|游戏,drama|戏剧",
  },
  {
    id: "nature",
    en: "Nature & travel",
    zh: "自然与出行",
    keywords: "outdoor environment transport 户外 环境 交通",
    icons:
      "globe|地球,map|地图,map-pin|地点,compass|指南针,mountain|山峰,leaf|树叶,sprout|幼苗,trees|树林,sun|太阳,moon|月亮,cloud|云朵,plane|飞机,bike|骑行,tent|帐篷,waves|波浪,bus|公交,train-front|火车,flower|花朵",
  },
  {
    id: "life",
    en: "Life & community",
    zh: "生活与社群",
    keywords: "friends sports food hobbies 朋友 运动 饮食 兴趣",
    icons:
      "heart|爱心,dumbbell|健身,coffee|咖啡,smile|微笑,users|团队,user-round|个人,paw-print|宠物,utensils|餐具,apple|苹果,handshake|合作",
  },
  {
    id: "goals",
    en: "Goals & work",
    zh: "目标与工作",
    keywords: "career business success 职业 商业 成就",
    icons:
      "star|星星,award|奖章,trophy|奖杯,medal|勋章,sparkles|闪光,flame|火焰,zap|闪电,briefcase|公文包,building|大楼,landmark|地标,wallet|钱包,shopping-bag|购物袋,gem|宝石,chart-no-axes-combined|趋势",
  },
] as const;

const metadata = new Map(
  collectionIconCategories.flatMap((category) =>
    category.icons.split(",").map((entry) => {
      const [id, zh] = entry.split("|");
      return [
        `lucide:${id}`,
        {
          zh,
          category: category.id,
          keywords: `${category.en} ${category.zh} ${category.keywords}`,
        },
      ] as const;
    }),
  ),
);
export const collectionIconCatalog = collectionIcons.map((icon) => ({
  ...icon,
  ...metadata.get(icon.id),
  zh: metadata.get(icon.id)?.zh ?? icon.label,
  category: metadata.get(icon.id)?.category ?? "organize",
}));

export function findCollectionIcons(query: string, category = "all") {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return collectionIconCatalog.filter((icon) => {
    const haystack =
      `${icon.id} ${icon.label} ${icon.zh} ${icon.keywords ?? ""}`.toLocaleLowerCase();
    return (
      (category === "all" || icon.category === category) &&
      terms.every((term) => haystack.includes(term))
    );
  });
}

// Lucide paths require these presentation attributes. Without them, open paths
// disappear and closed paths become solid shapes in Iconify's default SVG.
export function collectionIconData(icon?: string) {
  const asset =
    collectionIcons.find((item) => item.id === icon) ?? collectionIcons[0];
  return {
    body: `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${asset.body}</g>`,
    width: 24,
    height: 24,
  };
}
