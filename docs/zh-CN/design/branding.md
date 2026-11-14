# 品牌资源与元数据

[English](../../design/branding.md) · 简体中文

网站品牌为 WahO!／蛙O！。站点使用的图片集中在 `public/brand`，路径、文案和分享元数据由 `src/lib/brand.ts` 管理。完整原始图稿与未使用导出放在独立主资源包，不作为运行依赖。

浏览器图标和 Apple 图标入口位于 `src/app`。更新 favicon 必须从原图重新生成对应 PNG／ICO 尺寸，同时校验别名，不能只重命名大图。品牌缩略图保持比例、透明度和适当留白。

空结果表情按场景使用；课程搜索卡片无数据时只显示文本。语言切换更新标题与可见品牌文字；中文与英文版可以有不同短文案，但路由和功能一致。

公开分享链接使用配置的生产 origin，不写死开发 localhost。主资源包的本机位置不是公共链接；下列命令中的资源包路径应替换为实际安装位置。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
# Regenerate the seven website icon files.
pnpm brand:icons

# Also update all favicon and application-icon aliases in the master kit.
pnpm brand:icons --kit-root ../OSU_MilkyFrog_Assets

# Verify both sets against the source without writing files.
pnpm brand:icons --kit-root ../OSU_MilkyFrog_Assets --check
```

## 资源与场景

| 位置                       | 用途                                         |
| -------------------------- | -------------------------------------------- |
| `../OSU_MilkyFrog_Assets/` | 完整主资源包：原始 PNG、矢量、表情及备用导出 |
| `public/brand/mascot/`     | 线上使用的头像、完整吉祥物与四种表情 WebP    |
| `public/brand/icons/`      | 两种应用 PNG 与两种 maskable PNG             |
| `public/brand/social/`     | 最终双语分享卡                               |
| `src/app/`                 | Next.js favicon、PNG 图标和 Apple 图标入口   |
| `scripts/brand/`           | 可重复的图标转换与分享卡生成                 |

| 使用位置                 | 规范资源                                |
| ------------------------ | --------------------------------------- |
| 导航与紧凑身份           | `/brand/mascot/portrait.webp`           |
| 页面插图与空状态         | `/brand/mascot/full.webp`               |
| 表情插图                 | `/brand/mascot/expressions/<pose>.webp` |
| 浏览器 PNG 图标          | `src/app/icon.png` (128×128)            |
| 浏览器 ICO 回退          | `src/app/favicon.ico`                   |
| Apple 主屏图标           | `src/app/apple-icon.png` (180×180)      |
| 应用图标                 | `/brand/icons/app-{192,512}.png`        |
| Maskable 应用图标        | `/brand/icons/maskable-{192,512}.png`   |
| Open Graph／Twitter 分享 | `/brand/social/og-image.png`            |

| 场景               | 图稿                                 |
| ------------------ | ------------------------------------ |
| 空收藏列表         | 敬礼                                 |
| 保存成功提示       | 捧腹大笑                             |
| 课程加载           | 疲惫打字                             |
| 搜索无匹配         | 思考                                 |
| 404 页面           | 随机敬礼、捧腹大笑、指向笑或疲惫打字 |
| 页面或课程请求失败 | 随机思考、疲惫打字或敬礼             |
