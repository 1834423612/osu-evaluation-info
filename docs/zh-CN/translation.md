# 按需翻译与调度

[English](../translation.md) · 简体中文

自动翻译默认关闭。词云自动翻译是单独的显式开关，新用户、缺省值和旧配置均保持关闭；手动翻译不受该开关影响。首次引导从一段实际翻译开始，只有明确完成／跳过才结束。

执行顺序区分 Chrome 本机模型、服务器 NAS Ollama 和浏览器直连 Google。普通读取不会偷偷下载 Chrome 模型；必须明确授权下载。NAS 服务器不会代用户请求 Google。手动指定提供者的失败保持可重试，不自动切到其他来源。

显示支持替换和双语，按内容语言决定目标语言，而不是只看界面语言。可见文本才参与自动调度；共享队列、去重、取消、退避和缓存防止重复工作。离开可视区域不算提供者失败。

NAS 地址、模型、Access ID／secret 在服务端环境配置，不能放入公开变量。请求与译文有格式、字数、批量和时间限制；只返回规范化 no-store 结果。数据库记录调度状态和有限使用汇总，不保存原文、译文或凭据。

健康、可执行状态、历史失败是不同字段。恢复由新请求或显式 probe 触发；冷却有上限、单次恢复探测和跨进程并发租约。完整状态与管理命令见同分类 `translation-operations.md`。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```text
TranslateText → Chrome Translator API when available (highest priority)
              → one NAS lane: POST /api/translate
                  → bounded memory cache / shared in-flight work
                  → NAS Ollama
              → parallel overflow lanes: browser-direct Google
                  → dict-chrome-ex → clients5 → gtx, according to device health
              ← browser validates and normalizes the Google result
```

```sh
GUIDE_TEST_BASE_URL=http://localhost:3000 node tests/translation/onboarding.browser.mjs
```

```ini
KJCH_AI_SERVICES_API_URL=https://ai-services.kjch.net
KJCH_AI_SERVICES_CF_CLIENT_ID=your-client-id
KJCH_AI_SERVICES_CF_CLIENT_SECRET=your-client-secret
KJCH_AI_SERVICES_MODEL=HY-MT1.5-1.8B-GGUF:Q4_K_M
```

```json
{
  "model": "HY-MT1.5-1.8B-GGUF:Q4_K_M",
  "prompt": "将以下文本翻译为英文，注意只需要输出翻译后的结果，不要额外解释：\n\n这位教授讲得很清楚。",
  "stream": false,
  "keep_alive": "10m",
  "options": { "temperature": 0.2, "num_predict": 2048 }
}
```

```http
POST /api/translate
Content-Type: application/json

{"items":[{"id":"review-1","text":"The professor explains things clearly.","target":"zh-CN"}]}
```

```json
{
  "version": 1,
  "results": [
    {
      "id": "review-1",
      "target": "zh-CN",
      "status": "translated",
      "translation": "这位教授讲解得很清楚。",
      "provider": "ollama",
      "cache": "miss",
      "durationMs": 800
    }
  ]
}
```

```sh
pnpm db:translation:init
pnpm translation:status
pnpm translation:manage history ollama
pnpm translation:manage attempts ollama
pnpm translation:manage retry ollama
pnpm translation:manage probe ollama
pnpm translation:manage sync-config ollama
```

```sh
node --test --test-isolation=none tests/translation/*.test.mjs
TRANSLATION_DATABASE_TEST=1 node --env-file-if-exists=.env.local --test --test-isolation=none tests/translation/provider-state.integration.test.mjs tests/translation/translation-usage.integration.test.mjs
```
