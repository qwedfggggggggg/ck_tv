# CKTV 下一阶段设计：多后端搜索 + 爬虫 + 播放体验

## 概览

在 5 阶段内容优化（源健康/搜索质量/播放链路/元数据/搜索UX）基础上，
扩展 CKTV 的内容覆盖和播放体验。目标：用户搜索任何内容都能找到，且播放流畅。

## 核心原则

1. **搜索覆盖优先** — 先让用户能找到内容，再优化播放体验
2. **CMS 源仍是主力** — 新后端/爬虫作为补充，不替换现有架构
3. **感知等待时间 ≤ 当前** — 所有新功能不得增加用户等待

---

## 架构总览

```
搜索请求(query)
    │
    ├─ CMS 源 (现有 59 个, downstream.ts)
    ├─ 爬虫源 (新增, crawler.ts)
    ├─ 后端源 (新增, backends.ts)
    │   ├─ Bilibili 公开 API
    │   ├─ YouTube (Invidious API)
    │   └─ Internet Archive
    └─ M3U8 索引 (新增, m3u8-index.json)
        │
        ▼
    合并 → 去重(trigram) → 展示
```

**类型**：`"type": "cms" | "scraper" | "backend" | "m3u8index"`（config 中可选）

---

## Phase 6：多后端搜索 + 海外源

### 6A — Bilibili 后端

- 搜索 API：`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={query}`
- 返回 JSON → 映射到 `SearchResult`（title, pic, bvid）
- 播放：iframe 嵌入 `player.bilibili.com/player.html?bvid={bvid}`
- 在 play 页新建 iframe 渲染分支，不走 Artplayer

### 6B — YouTube 后端

- 搜索 API：通过 Invidious 实例（免 API 密钥）
  `https://inv.nadeko.net/api/v1/search?q={query}`
- 返回 JSON → 映射到 `SearchResult`
- 播放：iframe 嵌入 `www.youtube.com/embed/{videoId}`

### 6C — Internet Archive 后端

- 搜索 API：`https://archive.org/advancedsearch.php?q={query}&output=json`
- 只返回公开领域/CC 内容
- 播放：直链 mp4 走 Artplayer（Archive 无防盗链）

### 6D — 海外 CMS 源

新增 3-5 个国际内容为主的 CMS 源（搜索已验证的）：
- `whsj`：https://whsjzy.com/api.php/provide/vod（欧美剧/海外剧）
- 后续可在 CI 中持续补充

### 搜索结果展示

- B站/YouTube/Archive 结果在搜索结果页顶部新增 tab／section，标记 `[B站]` `[YouTube]` 徽标
- 与 CMS 结果合并展示，但来源不同不参与 trigram 去重

---

## Phase 7：HTML 爬虫引擎 + 跨源播放链

### 7A — 通用 HTML 爬虫

新增源类型 `scraper`，config 结构：
```json
"mysite": {
  "type": "scraper",
  "searchUrl": "https://example.com/search?q={query}",
  "searchType": "json" | "html",
  "responseType": "json" | "html",
  "listPath": "data.list",
  "fields": {
    "title": "$.vod_name",
    "poster": "$.vod_pic",
    "url": "$.vod_play_url"
  }
}
```

实现：`crawler.ts`
- `searchViaScraper(site, query): Promise<SearchResult[]>`
- 支持 JSONPath 和 regex 两种提取方式
- 同样 3s 超时，同样纳入 `recordSearchResult` 健康体系

### 7B — 跨源播放链融合

增强 `play/page.tsx`：
- 当用户进入播放页但当前源返回空剧集时，自动向其他所有源发起异步搜索
- 使用 `searchFromApi` 并行查询同一片名
- 结果合并到剧集列表中，标注来源
- 用户不可感知延迟（loading 态即可）

---

## Phase 8：M3U8 聚合索引

一个构建时脚本 `scripts/build-m3u8-index.js`：
1. 爬取 GitHub 上知名公开 m3u8 合集（iptv-org、CHENGTIANDONG 等）
2. 解析每个 playlist 的 `#EXTINF` + URL
3. 按分类（movie/tv/anime/sport）索引
4. 输出为 `src/lib/m3u8-index.json`（构建时生成）

使用方式：
- 搜索时查询该 JSON 文件
- 匹配方式：trigram 相似度匹配 `tvg-name` / `group-title`
- 播放：直链 m3u8 走 Artplayer

GitHub Actions 每周自动更新索引。

---

## Phase 9：播放体验增强

### 9A — 自适应清晰度

- 建立 `src/lib/bandwidth.ts` 模块
- 初始化播放时通过 `fetch(startOfM3u8, {signal}).then(r => r.headers.get('content-length'))` 估算带宽
- 若 m3u8 是多码率 variant playlist，从中选择 ≤ 带宽的**最高画质**
- 播放过程中每 30 秒检查一次缓冲状态：若连续 2 次缓冲触发 → 降一档

### 9B — 清晰度选择 UI

- 若 `vod_play_url` 含多个 `$` 分隔的码率（已有）
- Artplayer 右上角加清晰度切换 dropdown
- 切换时替换播放源，保持当前进度

### 9C — 倍速记忆

- `localStorage` 存储 `{ key: 'playbackRate_{title}_{source}', value: 1.5 }`
- `play/page.tsx` 初始化时读取并设置
- Artplayer 已有 `rate` 插件，只需读存储设置初始值

### 9D — 外挂字幕

- 搜索字幕 API：`https://api.opensubtitles.com/api/v1/subtitles?query={title}`
- 或从 m3u8 URL 猜测字幕 URL（替换 `.m3u8` → `.vtt`）
- 匹配后传给 Artplayer `subtitle` 配置
- 用户可上传本地 .srt/.vtt

### 9E — 一键下载

- 播放页底部加下载按钮
- 对 m3u8 链接：用 `a[download]` + blob 或 CF Worker 代理流
- 简单方案：直链可直接下载，m3u8 走 `ffmpeg.wasm` 合并（当前不实现，仅提供原始 URL）

---

## 配置变更

### config.json 新增字段

```json
{
  "backends": [
    { "key": "bilibili", "name": "哔哩哔哩", "enabled": true },
    { "key": "youtube",  "name": "YouTube",   "enabled": true },
    { "key": "archive",  "name": "Archive.org", "enabled": true }
  ],
  "m3u8_index": {
    "enabled": true,
    "source_urls": [
      "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn.m3u8"
    ],
    "build_interval_hours": 168
  }
}
```

### runtime.ts 生成更新

`scripts/convert-config.js` 同步处理 `backends`、`m3u8_index`、新增 `type` 字段

---

## 错误处理

- 所有新后端/爬虫同样 `Promise.allSettled` + 3s 超时
- 新后端纳入 `dead-source-cache` 体系
- iframe 播放失败由浏览器原生处理（显示无法加载）
- 字幕匹配失败静默，不影响播放

---

## 实施顺序

见 `docs/superpowers/plans/2026-07-12-next-phase-plan.md`
