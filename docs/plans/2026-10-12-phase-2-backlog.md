# 第二阶段：清掉第一阶段留下的 6 项 backlog（2026-10-12 开）

来由：老板 "待命的也继续啊"（2026-10-12，经 Boss 转达），Boss 开阶段："官网开一个新阶段，做之前列的 6 项 backlog"。
审批：老板回家期间由 Boss 代批。合并 main 就等于上线（Netlify 从 main 自动部署），每次合并前都发 Boss 批准，
附改了什么、预览链接或截图、怎么回退。Resend DNS、注册设置、凭据都不动。

## 终点（全部满足才算结束）

| # | 项目 | 验收（可量化） | 基线（2026-10-12，main 3fec735） |
|---|------|----------------|------------------------------|
| 1 | 删掉未使用的 `useAdminAuth.signUp` | `grep -rn signUp v2/src` 为 0；后台登录照常 | 有 1 个未使用的导出 |
| 2 | "所有游戏都隐藏"时不再回退到旧目录（review #11） | 单测先红后绿：数据库成功返回 0 条已上线游戏 → 目录显示空状态；只有请求出错才回退。预览上把 games 请求模拟成 `[]`，游戏面板显示 0 个游戏 | 返回 0 条时显示回退目录（包括刚隐藏的游戏） |
| 3 | 弹窗焦点隔离（review #21） | 7 个弹窗（AgeGate、手机抽屉、游戏覆盖层、游戏目录 Coverflow、后台确认框、回复框、游戏编辑框）用键盘探针逐个测：打开时焦点进入弹窗；Tab / Shift+Tab 各 20 次焦点都不离开弹窗；Esc 关闭（AgeGate 除外，它不能用 Esc 跳过）；关闭后焦点回到打开它的按钮。7/7 全过 | 正式站上探针不过（见证据） |
| 4 | FilmGrain 内存 | 噪点缓冲区与视口大小无关，任何尺寸 ≤ 3 MiB（单测 + 浏览器里统计 `createImageData` 分配的字节）；1440 宽截图肉眼与原版一致 | 3840×2160 下 10 帧整屏 ImageData ≈ 316 MiB；1440×900 ≈ 49 MiB |
| 5 | Babylon 包瘦身 | 首页和 Client Area 用到的 Babylon 代码 gzip 合计 ≤ 737 KB（基线的 50%）；首页星空和 Client Area 地球画面与原版一致、控制台 0 报错、走 GPU | 一个 6,771,041 B 的整包，gzip 1,474,817 B |
| 6 | iPhone 真机核对 Client Area 地球边缘颜色 | BrowserStack 真机 Safari（至少 1 台 iOS 17 + 1 台最新 iOS）截图，边缘取色色相在蓝色范围（180°–250°），与 Chromium 一致；如果偏绿就修好再测 | 只在无头 WebKit 里见过偏绿，没上过真机 |

共同条件：
- 每个 PR 的最终 head 上本地 gate 全绿：`npx tsc -p tsconfig.app.json --noEmit`、`npx eslint .`（0 error）、`npm test`、`npm run build`。
- Netlify 预览构建通过；溢出检测仍为 0（公开页 320/390、Client Area、后台 320/390/1440）。
- 每次合并前 Boss 批准；合并后正式站复测并报 Boss。
- 最后把前后对比证据发 Boss 和老板，老板签字后关闭本阶段。backlog 外的新想法不进本阶段。

## 顺序和分组

1. **PR #4 正确性 + 无障碍**（分支 `feat/p2-dialogs-fallback`）：第 1、2、3 项。
2. **PR #5 性能**（分支 `feat/p2-perf`）：第 4、5 项。与 PR #4 并行开发，各自合并。
3. **第 6 项**放在 PR #5 上线之后，因为 Babylon 的引入方式变了，要在新代码上看真机。需要修才开 PR #6。

## 回退

每个 PR 都是独立的 merge commit：在 GitHub 上 revert 该 merge 即回到上一版，Netlify 自动重新部署；
或在 Netlify 后台把上一次生产部署 "Publish deploy"，几秒生效。本阶段不改数据库、不改 Edge Function、不改 Auth。
