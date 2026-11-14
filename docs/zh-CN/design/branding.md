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
