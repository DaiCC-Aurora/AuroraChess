# AuroraChess 开发计划

> 目标：一个跑在 Vercel 上的国际象棋应用 —— 能**和可调 ELO 强度的引擎对弈**、每步即时评级、可复盘、可要提示，同时适配**手机 / 网页 / 手表（圆形小屏）**。

## 状态：M1–M9 已全部完成并通过验证

| 里程碑 | 状态 | 验证方式 |
| --- | --- | --- |
| M1 脚手架与工程基线 | 完成 | `next build`：6 条路由静态预渲染；沙箱内缓存/临时目录本地化 |
| M2 棋类核心 | 完成 | `game.test.ts` 15 项（合法着法、将杀、逼和、三次重复、升变、PGN 往返、UCI position） |
| M3 引擎层 | 完成 | `uci.test.ts` 9 项 + `client.test.ts` 7 项（伪 Worker）+ `engine:smoke` 11 项真机 UCI |
| M4 教练系统 | 完成 | `findings.test.ts` 22 项 + `openings.test.ts` 7 项（送子/牵制/叉子/杀棋/兵形/开局库） |
| M5 界面 | 完成 | 无头 Edge 端到端：真实点选落子 → 引擎应手 → 棋谱正确 |
| M6 手表端 | 完成 | 192×192 圆屏模拟：无导航壳、整屏适配、每格 43px、径向控件 50px 且不越界 |
| M7 质量与交付 | 完成 | `tsc --noEmit` 0 error、88 项单测、11 项引擎自检、33 项浏览器端到端、README/架构文档 |

## M8 视觉与棋子（追加需求）

| 需求 | 实现 | 验证 |
| --- | --- | --- |
| 改用 lichess 棋子 | `scripts/setup-pieces.mjs` 从 `lichess-org/lila` 原样取回 cburnett 棋组（12 个 SVG，约 8 KB）并提交到 `public/piece/cburnett/`；`PieceArt` 默认渲染该棋组（`<img>`），自绘「几何棋子」保留为可选 | 浏览器 E2E：32 个棋子 `<img>` 全部 `naturalWidth > 0`，`/piece/cburnett/wK.svg` 返回 200 |
| 改成 DeepSeek 风格界面 | 品牌蓝 `#4D6BFE`、浅色优先、白卡片 + 发丝边框 + 12px 圆角、扁平填充（去掉彩色渐变）、自绘波浪 logo、设置项分段控件化 | 浏览器 E2E 全绿；`docs/screenshots/` 全部更新 |
| 棋盘配色可切换 | 新增 `data-board`（深寻蓝/经典木色/冰川灰）与 `--hl-*` 高亮变量，UI 主题与棋盘主题解耦 | 木色棋盘自动回到 lichess 绿色高亮 |

## M9 文案精简与缺陷修复（追加需求）

| 需求 | 实现 | 验证 |
| --- | --- | --- |
| 去除所有 emoji | 棋组符号、模式入口、主题开关、复盘翻页、手表径向菜单全部换成内联 SVG；`QUALITY_META` 的书本符号换成 ≡；文档里的对勾等一并清理 | E2E 新增「五个页面渲染文本不含 `Extended_Pictographic`」检查，另有脚本扫描 `src/public/scripts/docs` 全量源码 |
| 去除每一步的解释 | 教练面板从「评级 + 为什么 + 损失分值 + 推荐着法 + 局面提示」精简为**一行评级**（仅在超过中断阈值时附带悔棋重走/继续/显示最佳）；移除控制器里的 `analysePosition` 调用与棋盘标注方块；首页与设置里的说明段、强度说明句一并删除 | E2E：`/coach` 走子后面板只显示 `d4 良好` |
| 去除「极光棋」 | 顶栏副标题与页脚不再显示 `app.short`；`app.tagline` 去掉「极光国际象棋」；棋子备选名「极光几何」改为「几何棋子」 | 界面文本检查 |
| 修复手表「整盘 8×8」 | 根因：`zoom` 同时充当 CSS 缩放倍数，选「整盘」时反而把棋盘放大 8 倍，只能看到 1 格。改为按「可见格数」语义映射（8→圆内接正方形 1/√2，4→scale 2，2→scale 4），并加了设置迁移（v1 把 zoom 当缩放倍数） | E2E：切到整盘后棋盘矩形完全落在圆形舞台内，8×8 全部可见 |
| 修复「提示」无效 | 根因：`requestHint` 的 `useCallback` 漏了 `engineReady` 依赖，引擎加载完成前创建的闭包把 `engineReady = false` 永久捕获，点击后直接 `return`。补上依赖即修复 | E2E：点击「提示」后棋盘出现推荐着法箭头 |

> 启发式解释引擎（`lib/coach/findings.ts`、`probe.ts`）与它的 22 项单测保留，但按当前设计不在
> 界面展示；需要时可在 `useGameController` 里重新接回。

最终验证命令与结果见 README「质量门禁与验证结果」。开发过程中发现并修复的真实缺陷：
d4 兵被误判为"无保护"（防御判定不能直接问"能否走到被占的格子"，改为把该格替换为敌子再判）、
eval 条均势时显示 2% 而非 50%、`formatMoves` 黑方着法编号错误、`undo()` 未清除认输状态、
手表视口下导航壳挤占整屏、径向控件越界。这些都补了对应单测。

## 0. 结论先行的技术选型

| 关注点 | 选择 | 理由 |
| --- | --- | --- |
| 框架 | **Next.js 16 (App Router) + React 19 + TypeScript** | Vercel 一等公民，`next build` 即部署；静态产物 + 可选 Serverless |
| 样式 | **Tailwind CSS v4** + CSS 变量主题 | 无配置文件、按需生成，圆形手表布局用少量自定义 CSS 即可 |
| 棋规引擎 | **chess.js 1.4**（本地依赖） | 合法着法生成、SAN/PGN、将杀/和棋判定都齐全，纯前端零后端 |
| 棋力引擎 | **Stockfish WASM（单线程，`stockfish` npm 包）** 放 `public/engine/`，跑在 Web Worker | 不需要 COOP/COEP（无需 SharedArrayBuffer），Vercel 静态托管即可；支持 `UCI_LimitStrength` / `UCI_Elo` / `Skill Level` |
| 状态管理 | React Context + `useReducer`（自研轻量 store） | 避免额外依赖；棋局状态可序列化，便于存档/复盘 |
| 持久化 | `localStorage`（SSR 安全封装） | 设置、棋谱、训练统计、连胜等 |
| 测试 | **Vitest**（纯逻辑单测）+ `next build` 作为集成门禁 | 棋规/引擎协议/教练规则全部可单测 |
| i18n | 自研字典（zh 默认 / en） | 无依赖、可 tree-shake |

**为什么引擎放前端**：可离线、零服务器成本、Vercel 上无冷启动；单线程 WASM 约 10–40MB（首次加载后长期 `immutable` 缓存）。手表端另提供「省电模式」（降低深度/节点数）。

## 1. 学习 lichess（参考资料）

GitHub 直连被网络策略拦截，改由 harness 的网络通道定向抓取 `lichess-org/lila` 源码要点，产出两份规格笔记（子代理并行完成）：

- `docs/reference/lichess-notes.md` —— 引擎强度/ELO 档位配置、评估值→胜率公式、着法质量分级阈值、Tutor 教学模式算法、棋盘交互与配色。
- `docs/reference/watch-ui-notes.md` —— 圆形屏幕视口/安全区/最小点击区/字号等硬指标，以及手表端该不该跑引擎。

## 2. 里程碑与步骤

### M1 脚手架与工程基线 完成
1. `package.json` / `tsconfig.json` / `next.config.ts` / Tailwind v4 / `.npmrc`（本地化缓存，规避沙箱外写）。
2. 沙箱适配：npm 缓存与 tmp 指向项目内 `.cache/`，安装用 `--ignore-scripts`（无包需要 postinstall）。
3. `scripts/setup-engine.mjs`：从 `node_modules/stockfish` 挑选单线程 WASM 构建拷贝到 `public/engine/`，并生成 `src/generated/engine-manifest.json`（记录真实文件名，避免硬编码）。

### M2 棋类核心（`src/lib/chess`）
4. `AuroraGame` 封装：着法合法性、SAN、PGN 导入导出、将杀/逼和/三次重复/五十回合/子力不足、王的位置、被将检测。
5. 着法记录结构（含 `before/after` FEN），为复盘与教练分析提供位置快照。

### M3 引擎层（`src/lib/engine`）
6. `uci.ts`：UCI 输出解析（`info` 的 depth/score cp/mate/multipv/pv/nodes/nps、`bestmove`）。
7. `levels.ts`：ELO → 引擎参数映射（`UCI_LimitStrength`+`UCI_Elo`，低段位叠加 `Skill Level`、深度/时间上限、随机失误率），提供 500–2850 的档位表与预设。
8. `engine-client.ts`：Worker 生命周期（`uci`/`isready`/`ucinewgame`/`position`/`go`/`stop`），请求队列、搜索取消、MultiPV、异常降级（引擎加载失败→内置随机合法着法兜底）。
9. `analysis.ts`：cp→胜率（sigmoid）、mate 处理、着法质量分级（最佳/优秀/良好/不精确/失误/严重失误 + 开局库/强制着法）。

### M4 教练系统（`src/lib/coach`）
10. `rules.ts`：静态局面启发式（送子/被攻击子力、王安全、子力展开、中心控制、叠兵孤兵、机动性、叉/牵制/闪击等战术母题）。
11. `explain.ts` + `i18n`：把「引擎 PV + 启发式发现」翻译成中文自然语言讲解（含"为什么"与"更好的走法"）。
12. `tutor.ts`：指导下棋流程 —— 走子前提示（可选）、走子后即时评估、掉分超阈值时打断并给出替代走法、可撤销重走；赛后全盘复盘分级。

### M5 界面（`src/components`, `src/app`）
13. 棋盘：自绘 SVG 棋子 + 拖拽/点选两种落子、合法点、最后一步、将军高亮、升变选择、坐标、翻转、箭头/标记。
14. 对局界面：时钟（含加秒）、着法列表、评估条、认输/新局/悔棋、难度滑杆。
15. 教练界面：讲解面板、提示按钮、严重失误拦截弹窗。
16. 复盘界面：全盘分析进度、逐着质量图标、跳转、PGN 导入导出。
17. 首页：模式入口（对弈 / 教练 / 复盘 / 手表）+ 引擎与主题设置。

### M6 手表端（圆屏适配）
18. `watch/` 组件：`clip-path: circle(50%)` 圆形舞台、按内接圆计算的内边距、径向/弧形控件、大号点击区（≥48px 等效）、单手点选落子（先点起点→再点终点，放大选中子力环）、升变环形选择。
19. 手表局内布局：棋盘占满内接圆 + 极简状态环（时钟/回合/被将）；菜单为径向图标，避免系统返回手势冲突（不使用横向滑动）。
20. 省电策略：低深度引擎档位、`prefers-reduced-motion` 尊重、无常驻动画。

### M7 质量与交付
21. Vitest 单测：棋规状态、UCI 解析、ELO 映射、胜率公式、分级阈值、教练规则（送后/叉子等构造局面）、开局库、PGN。
22. `tsc --noEmit` + `next build` 门禁；引擎资源 404/加载失败的降级验证。
23. `README.md`（部署到 Vercel 的步骤、项目结构、功能清单）、`docs/ARCHITECTURE.md`（模块图与数据流）、`vercel.json`（如需）。

## 3. 关键设计决策

- **引擎只在浏览器跑**：无后端 API、无密钥、离线可用；失败时降级到内置简易对弈（随机+吃子偏好），保证界面永不"卡死"。
- **位置快照驱动复盘**：每步保存 `before/after` FEN，复盘与教练分析只依赖 FEN 列表，可随时并行/中断重算。
- **圆形屏优先的响应式**：`@media (shape: round)` / `-webkit-device-radius` 探测 + JS 兜底（视口宽高比≈1 且 `max-width: 480px` 视为手表），路由 `/watch` 可强制进入。
- **零布局库**：所有交互（拖拽、点选、长按）自研，避免依赖体积在手表上放大。

## 4. 风险与对策

| 风险 | 对策 |
| --- | --- |
| Stockfish WASM 体积大（NNUE 网络） | 优先选 "lite/single" 构建；`Cache-Control: immutable`；手表端延迟加载并提供"轻量引擎"开关 |
| 弱机性能不足 | 档位越低深度/节点预算越小；`MultiPV=1`；可切换为「服务器引擎」预留接口 |
| 低段位引擎仍太强 | `Skill Level` 0–7 + 深度 1–4 + 主动失误注入（按档位概率随机选择次优着法） |
| 沙箱内无法跑无头浏览器 | 以单测 + `next build` + 手工 `next start` HTTP 探活替代 E2E |
| Vercel 单文件体积限制 | 引擎文件保持 < 50MB；必要时拆分/换 lite 构建 |
