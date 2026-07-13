# CKTV 搜索与播放优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搜索提速至 1-2s，扩充短剧资源，修复播放黑屏

**Architecture:** 三部分独立但同一代码库：(A) 搜索管道优化：源清理+动态超时+KV缓存+健康监控；(B) config 加新 CMS 源；(C) 播放器加加载超时+Referer 修复。按改动从轻到重依次实施。

**Tech Stack:** Cloudflare Pages (Edge Runtime), Next.js 14, Apple CMS JSON API, Artplayer 5 + HLS.js, Cloudflare KV + Cron Triggers

## Global Constraints

- 所有代码适应 Cloudflare Pages Edge Runtime（无 Node.js API）
- 搜索 API 在 `src/app/api/search/route.ts`，Edge runtime
- 播放页面在 `src/app/play/page.tsx`，Client Component
- 源配置在 `config.json`（`SourceConfig` 数组）
- 时间单位用毫秒
- 不需要手动测试框架，build + deploy + curl 验证

---

## 文件结构

| 文件 | 改动 |
|------|------|
| `config.json` | 镜像源去重、成人源分类、新增 8 个源、referer 字段 |
| `src/app/api/search/route.ts` | 动态超时逻辑、源过滤条件、KV 缓存集成 |
| `src/lib/downstream.ts` | `SearchDownstreamMaxPage` 从 5→3 |
| `src/lib/dead-source-cache.ts` | 保留现有逻辑，新增 Cron trigger 适配 |
| `src/app/api/cron/route.ts` | 新建，Cron Trigger 处理器 |
| `wrangler.toml` | KV binding + Cron Trigger 配置 |
| `src/app/play/page.tsx` | 加载超时换源、Referer 注入 |
| ~~`src/lib/utils.ts`~~ | （辅助函数直接内联到 play/page） |

---

### Task 1: 源清理 & 新增源（config.json）

**Files:** `config.json`（读当前文件 → 编辑）

**Interfaces:**
- Consumes: 当前 config.json 中 `SourceConfig` 数组
- Produces: 更新后的 `SourceConfig`：镜像合并、成人源标记 `category: "adult"`、新增 8 个源

**改动明细：**
1. 镜像源合并（每组保留一个入口）：
   - 樱花 yinghua + yinghua2 → 留 yinghua
   - 非凡 ffzy + ffzy2 → 留 ffzy
   - 暴风 bfzy + bfzy2 → 留 bfzy
   - 天涯 tyyszy + tyyy2 → 留 tyyszy
   - 茅台 maotaizy + mt3 → 留 maotaizy
   - iKun ikun + ikun2 → 留 ikun
   - 无尽 wujin + wujin2 → 留 wujin
   - 百度 baidu + bdzy2 → 留 baidu
   - 量子 lzi + lzizy → 留 lzi
   - 魔都 mdzy + moduzy → 留 mdzy
   - 电影天堂 dyttzy + 镜像 → 留 dyttzy
2. 成人源标记：91md、danaizi、apilj 保持 category: "adult"
3. 新增 8 个源：

```json
{ "key": "haohua", "name": "豪华资源", "api": "https://haohuazy.com/api.php/provide/vod", "disabled": false },
{ "key": "subo", "name": "速播资源", "api": "https://subocj.com/api.php/provide/vod/at/json", "disabled": false },
{ "key": "kuaiche", "name": "快车资源", "api": "https://kuaichezy.com/api.php/provide/vod", "disabled": false },
{ "key": "xinlang", "name": "新浪资源", "api": "https://www.xinlangzy.net/api.php/provide/vod", "disabled": false },
{ "key": "niuniu", "name": "牛牛资源", "api": "https://api.niuniuzy.me/api.php/provide/vod", "disabled": false },
{ "key": "iqiyi", "name": "爱奇艺资源", "api": "https://iqiyizyapi.com/api.php/provide/vod", "disabled": false },
{ "key": "98zy", "name": "98资源站", "api": "https://98zy.com/api.php/provide/vod", "disabled": false },
{ "key": "taopian", "name": "淘片资源网", "api": "https://taopianapi.com/cjapi/mc/vod/json.html", "disabled": false }
```

**验证：** `cat config.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Sources: {len(d[\"SourceConfig\"])}')"` 输出源数量

---

### Task 2: 搜索管道优化 — 动态超时 & 源过滤 & 减页

**Files:**
- Modify: `src/app/api/search/route.ts`
- Modify: `src/lib/downstream.ts`

**Interfaces:**
- Consumes: `getSourcesSortedByHealth()` 返回的 `sortedSites`
- Modifies: 搜索循环中的超时计算、低分源过滤逻辑
- Produces: 动态超时的 CMS 批次请求

- [ ] **Step 1: 修改 `downstream.ts`，翻页数从 5 改为 3**

```typescript
// 找到 SearchDownstreamMaxPage 定义
export const SearchDownstreamMaxPage = 3; // 原为 5
```

- [ ] **Step 2: 在 `search/route.ts` 添加动态超时计算函数**

```typescript
import { getReliabilityScore } from '@/lib/dead-source-cache';

function getDynamicTimeout(key: string): number {
  const score = getReliabilityScore(key);
  if (score > 0.7) return 800;
  if (score > 0.3) return 1500;
  if (score >= 0) return 0; // < 0.3，跳过
  return 1500; // 未知源
}
```

- [ ] **Step 3: 修改分批循环，过滤低分源 + 动态超时**

```typescript
// 在分批循环前过滤
const activeSites = sortedSites.filter(site => {
  const timeout = getDynamicTimeout(site.key);
  return timeout > 0;
});

let allSettled: PromiseSettledResult<SearchResult[]>[] = [];

for (let i = 0; i < activeSites.length; i += BATCH_SIZE) {
  const batch = activeSites.slice(i, i + BATCH_SIZE);
  const batchPromises = batch.map(site =>
    searchFromApi(site, query, getDynamicTimeout(site.key))
  );
  // ... 其余代码不变
}
```

注意 `searchFromApi` 需要接受第三个参数 `timeout`。看当前实现，它内部用的是 `AbortSignal.timeout(2000)`，需要改成参数化。

- [ ] **Step 4: 修改 searchFromApi 接收 timeout 参数**

在 `search/route.ts` 中找到 `searchFromApi` 定义（应该是函数内部）：

```typescript
async function searchFromApi(site: SiteConfig, query: string, timeoutMs = 1500): Promise<SearchResult[]> {
  // ...
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // ...
}
```

- [ ] **Step 5: Build + 部署验证**

```bash
pnpm pages:build && npx wrangler pages deploy .vercel/output/static --branch main 2>&1 | grep "Deployment\|✨"
```

验证：搜索 "Inception"，对比之前响应时间

---

### Task 3: 播放加载超时自动换源

**Files:** `src/app/play/page.tsx`

**Interfaces:**
- Consumes: `videoUrl`（当前播放 URL）、`autoFallbackOnError(failedUrl)`
- Produces: 加载超时后自动调用 `autoFallbackOnError`，替换当前 `videoUrl`

- [ ] **Step 1: 添加加载超时 ref 和定时器逻辑**

在 `play/page.tsx` 中，靠近其他 ref 定义的地方：

```typescript
const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const PLAY_LOAD_TIMEOUT = 8000; // 8s
```

- [ ] **Step 2: 在设置 videoUrl 的地方启动超时定时器**

找到设置 `setVideoUrl(candidateUrl)` 的位置（应该是 useEffect 或 handler），在旁边加：

```typescript
// 清除旧定时器
if (loadingTimeoutRef.current) {
  clearTimeout(loadingTimeoutRef.current);
}
// 启动新定时器
loadingTimeoutRef.current = setTimeout(() => {
  if (!videoUrl) return;
  const art = artPlayerRef.current;
  // 如果已经正在播放（canplay 已触发），不清除
  if (art && art.played && art.played.length > 0) return;
  console.warn('播放加载超时，尝试换源:', videoUrl);
  autoFallbackOnError(videoUrl);
}, PLAY_LOAD_TIMEOUT);
```

- [ ] **Step 3: 在 video:canplay 事件中清除超时定时器**

在 `artPlayerRef.current.on('video:canplay', ...)` 回调中加：

```typescript
if (loadingTimeoutRef.current) {
  clearTimeout(loadingTimeoutRef.current);
  loadingTimeoutRef.current = null;
}
```

- [ ] **Step 4: 在换源/卸载时清除定时器**

找到清理逻辑（比如 useEffect return cleanup）：

```typescript
return () => {
  if (loadingTimeoutRef.current) {
    clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = null;
  }
  // 现有 cleanup...
};
```

- [ ] **Step 5: Build + Deploy 验证**

```bash
pnpm pages:build && npx wrangler pages deploy .vercel/output/static --branch main 2>&1 | grep "Deployment\|✨"
```

手动测试：找一个大概率不播的源 URL，确认 8s 后自动切到备选

---

### Task 4: Cloudflare KV 缓存

**Files:**
- Modify: `wrangler.toml`
- Modify: `src/app/api/search/route.ts`

**Interfaces:**
- Consumes: 搜索响应 JSON
- Produces: KV 中缓存的热词结果

- [ ] **Step 1: 创建 KV namespace**

```bash
npx wrangler kv:namespace create CKTV_SEARCH_CACHE
```

记录输出的 namespace ID

- [ ] **Step 2: 配置 wrangler.toml**

```toml
[[kv_namespaces]]
binding = "CKTV_SEARCH_CACHE"
id = "<上一步的 ID>"
```

- [ ] **Step 3: 在搜索路由中添加 KV 读写**

```typescript
const kv = process.env.CKTV_SEARCH_CACHE
  ? (process.env as any).CKTV_SEARCH_CACHE
  : null;

// 在缓存检查后（内存缓存 miss 后），查 KV
if (kv) {
  try {
    const cached = await kv.get(query, 'json');
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: { 'X-Cache': 'HIT-KV' },
      });
    }
  } catch (e) { /* KV read error, fall through */ }
}

// 在返回响应前，写入 KV
if (kv) {
  try {
    await kv.put(query, JSON.stringify({
      data: responseData,
      expiresAt: Date.now() + 30 * 60 * 1000,
    }), { expirationTtl: 1800 });
  } catch (e) { /* KV write error, ignore */ }
}
```

- [ ] **Step 4: Deploy 验证**

```bash
pnpm pages:build && npx wrangler pages deploy .vercel/output/static --branch main 2>&1 | grep "Deployment\|✨"
```

验证：第一次搜某词（慢），第二次搜同词（快，X-Cache: HIT-KV）

---

### Task 5: 健康监控 Cron Trigger

**Files:**
- Create: `src/app/api/cron/route.ts`
- Modify: `src/lib/dead-source-cache.ts`
- Modify: `wrangler.toml`

**Interfaces:**
- Produces: `/api/cron` 端点，定时检查所有源健康状况
- Consumes: `recordSearchResult(key, success)`、`healthMap`

- [ ] **Step 1: 创建 Cron 处理器**

```typescript
// src/app/api/cron/route.ts
import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { recordSearchResult } from '@/lib/dead-source-cache';

export const runtime = 'edge';

export async function GET(request: Request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = await getConfig();
  const sources = config.SourceConfig.filter(s => !s.disabled);
  const results: Record<string, boolean> = {};

  await Promise.allSettled(
    sources.map(async (site) => {
      try {
        const url = `${site.api}?ac=videolist&wd=test&t=${Date.now()}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const ok = res.ok;
        recordSearchResult(site.key, ok);
        results[site.key] = ok;
      } catch {
        recordSearchResult(site.key, false);
        results[site.key] = false;
      }
    })
  );

  return NextResponse.json({ ok: true, results });
}
```

- [ ] **Step 2: 配置 wrangler.toml**

```toml
[triggers]
crons = ["0 * * * *"]
```

- [ ] **Step 3: Deploy 验证**

```bash
pnpm pages:build && npx wrangler pages deploy .vercel/output/static --branch main 2>&1 | grep "Deployment\|✨"
```

手动触发测试：`curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron`

---

### Task 6: Referer 修复

**Files:** `src/app/play/page.tsx`

**Interfaces:**
- Modifies: `CustomHlsJsLoader` 类，为 m3u8/fragment 请求添加 Referer 头

- [ ] **Step 1: 在 CustomHlsJsLoader 的 load 方法中添加 Referer**

```typescript
// 在 CustomHlsJsLoader 的 this.load 函数中，load 调用前添加
const customHeaders = {
  ...(config as any)?.headers,
  Referer: 'https://ck-tv-73d.pages.dev/', // fallback
};
// 这个 Referer 可以通过 props/context 从当前播放源的配置中获取
```

- [ ] **Step 2: 从当前源获取 Referer 域名**

在 player 组件中维护 `currentSourceDomain` 状态：

```typescript
// 从 availableSources 中找当前 detail 对应的 source 配置
// 传递域名给 HLS loader 或在 fetch 时直接设置
```

具体实现：查找当前播放源的 CMS 域名，在 HLS 请求时设置 Referer 为 `当前源域名`。

- [ ] **Step 3: Build + Deploy**

```bash
pnpm pages:build && npx wrangler pages deploy .vercel/output/static --branch main 2>&1 | grep "Deployment\|✨"
```

---

### Task 7: 被动视频健康反馈

**Files:** `src/app/play/page.tsx`

**Interfaces:**
- Modifies: `autoFallbackOnError` 函数，播放失败时上报健康数据

- [ ] **Step 1: 在播放器 error 或加载超时后上报健康数据**

```
在 autoFallbackOnError 中，当确定某个源的所有备选都失败后，
发送一个 POST 请求到 /api/health/report 标记该源为失败。

使用 navigator.sendBeacon 或 fetch 避免影响页面切换。
```

这样搜索侧就能知道哪个源的播放成功率低，逐步降低其排名。

---

## Spec Coverage Check

| Spec 要求 | 对应 Task |
|-----------|-----------|
| A1 源清理 | Task 1 |
| A2 动态超时 | Task 2 |
| A3 KV 缓存 | Task 4 |
| A4 减页 | Task 2 |
| A5 健康监控 Cron | Task 5 |
| A6 被动视频反馈 | Task 7 |
| B1 新增 CMS 源 | Task 1 |
| C1 加载超时换源 | Task 3 |
| C2 Referer 修复 | Task 6 |
