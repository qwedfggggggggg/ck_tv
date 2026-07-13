# CKTV 搜索与播放优化设计方案

## 概述

CKTV 是一个基于 Cloudflare Pages 的影视聚合搜索站，当前面临三个问题：搜索速度慢、搜索结果混杂死资源、播放时黑屏卡死。本方案覆盖以上三个方向的优化。

---

## A. 搜索优化

### 目标
- 新搜索从 3-6s 降至 1-2s
- 废弃资源（死源）自动隐藏

### A1. 源清理
- **镜像合并**：保留镜像源中健康度最高的一个（樱花×2、非凡×2、暴风×2、iKun×2、天涯×2 等），共约 48→30 个有效源
- **成人源默认隐藏**：91md、大奶子、辣椒 在普通搜索中跳过（除非搜索词包含成人相关词）
- **死源自动踢出**：健康分 < 0.3 的源在 `getSourcesSortedByHealth` 中直接过滤掉，不参与搜索

### A2. 动态超时
- 按健康分决定每个源的超时时间：
  - 高分（> 0.7）：800ms
  - 中分（0.3~0.7）：1500ms
  - 低分（< 0.3）：不查，直接跳过
  - 未知（新源/默认 0.5）：1500ms

### A3. Cloudflare KV 持久缓存
- 创建 KV namespace `CKTV_SEARCH_CACHE`
- 搜索热词写入 KV，TTL 30 分钟
- 跨冷启动/跨用户共享
- 透传响应：直接复用已有 JSON 响应
- 需要配置 `wrangler.toml`

### A4. 减少翻页
- 每个 CMS 源从 5 页改为 3 页（首页最相关，后页重复率 70%+）

### A5. 健康监控
- 保留现有 EMA 健康分机制（+0.1 成功 / −0.05 失败，[0, 1] 范围）
- 新增 Cloudflare Cron Trigger 定时任务：
  - 每小时触发一次
  - 对配置中所有源发起测试搜索
  - 可达的标记 OK，不可达的标记为死亡（健康分归零）
  - 源恢复后自动重新参与搜索

### A6. 视频级验证（被动）
- 用户点击播放时，如果播放失败（错误事件），记录该源的健康分下降
- 搜索阶段不做 HEAD 验证（太慢）

### 涉及文件
- `src/app/api/search/route.ts` — 超时逻辑、源过滤、KV 缓存集成
- `src/lib/downstream.ts` — 翻页数从 5 改为 3
- `src/lib/dead-source-cache.ts` — Cron trigger 集成
- `src/app/api/cron/route.ts` — 新建，Cron Trigger 处理器
- `wrangler.toml` — KV binding + Cron Trigger 配置
- `config.json` — 镜像源去重、新源加入

---

## B. 新增资源（短剧/漫剧）

### 目标
- 扩充可搜索的短剧、漫剧、综艺内容
- 不额外加专门 Tab，靠新源自然覆盖

### B1. 新增 CMS 源

以下非成人 CMS 源加入配置：
| 源名称 | 地址 | 特点 |
|--------|------|------|
| 豪华资源 | haohuazy.com | 含短剧分类 |
| 速播资源 | subocj.com | 含短剧分类 |
| 快车资源 | 快车资源站 | 含短剧、体育 |
| 新浪资源 | xinlangzy.net | 含短剧、体育 |
| 牛牛资源 | niuniuzy.me | 通用影视 |
| 爱奇艺资源 | iqiyizyapi.com | 聚合主流平台 |
| 98资源站 | 98资源 | 通用影视 |
| 淘片资源网 | taopianapi.com | 通用影视 |

### B2. 不做的
- 不加特定短剧搜索 Tab
- 不加 Douyin 爬虫（不可行/不稳定）
- 不加漫剧专用源（Bilibili + 现有动漫源已覆盖）

### 涉及文件
- `config.json` — 新增 8 个源配置

---

## C. 播放黑屏修复

### 目标
- 解决手机端播放 m3u8 时无限黑屏加载的问题
- 让用户至少能看到一个可播的源

### C1. 加载超时自动换源
- 当前痛点：HLS.js 在片段请求卡住时不触发 error 事件，播放器永久黑屏
- 做法：
  - 设置 video URL 后启动 8s 计时器
  - 8s 内 `canplay` 事件未触发 → 触发备选源切换
  - 复用现有的 `autoFallbackOnError` 逻辑
  - 超时来源：`setTimeout` + `clearTimeout` 在 `canplay` 时清除
- 最多尝试 3 个备选源（与现有 fallback 一致）

### C2. Referer 修复
- 某些 CDN 要求 Referer 头校验
- 在 HLS.js 自定义 loader 中，为 m3u8/fragment 请求添加 Referer:
  - Referer 值 = 当前播放源对应的 CMS 域名
  - 需要将 source_name/域名映射传递到 player 组件
- 仅影响 video/fetch 请求，不影响页面导航

### 涉及文件
- `src/app/play/page.tsx` — 加载超时定时器、Referer 注入
- `src/lib/utils.ts` — 辅助函数（域名提取等）

---

## 实施顺序

1. **A1 + B1**（源清理 & 新增源）— `config.json` 改动，无风险
2. **A2 + A4**（动态超时 & 减页）— 搜索管道核心逻辑
3. **C1**（加载超时换源）— 播放器修复，高优先级
4. **A3**（KV 缓存）— 需要新建 Cloudflare 资源
5. **A5**（健康监控 Cron）— 独立功能，最后做
6. **C2**（Referer 修复）— 锦上添花
7. **A6**（视频级被动反馈）— 长期积累
