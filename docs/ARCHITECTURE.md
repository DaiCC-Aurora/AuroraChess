# AuroraChess 架构

## 1. 总览

```
┌───────────────────────────── 浏览器（无后端） ─────────────────────────────┐
│                                                                            │
│  Next.js App Router (静态预渲染)                                            │
│    /           首页：模式入口 + 设置                                        │
│    /play       对弈     ┐                                                  │
│    /coach      教练     ├─ EngineProvider（单例 Worker）                    │
│    /review     复盘     │   AuroraGame（chess.js）                         │
│    /watch      手表     ┘   useGameController（流程编排）                    │
│                                                                            │
│  Web Worker: /engine/stockfish.js  (+ stockfish.wasm 1.7MB, 单线程)         │
│      postMessage("uci") … postMessage("go depth 12 movetime 800")          │
└────────────────────────────────────────────────────────────────────────────┘
```

**没有服务端逻辑**：Vercel 只负责托管静态资源，因此没有冷启动、没有密钥、没有配额，
断网也能继续下（引擎与棋规都在本地）。

## 2. 分层

| 层 | 位置 | 职责 | 依赖 |
| --- | --- | --- | --- |
| 棋规 | `lib/chess` | `AuroraGame`：合法着法、SAN/PGN、将杀/和棋判定、每步 FEN 快照、UCI position 命令 | chess.js |
| 协议 | `lib/engine/uci.ts` | `info`/`bestmove`/`option` 解析，全部是纯函数 | — |
| 引擎 | `lib/engine/client.ts` | Worker 生命周期、握手、串行化搜索、取消、超时、下载进度 | Web Worker |
| 强度 | `lib/engine/levels.ts` | ELO → (UCI 选项, 搜索预算, MultiPV, cplTarget/moveDecay) | uci |
| 评估 | `lib/engine/analysis.ts` | cp 与胜率的换算、mate 处理、着法分级、准确率、MultiPV 归并 | — |
| 教练 | `lib/coach` | 开局库（界面使用）；局面探测与发现项（送子/叉子/牵制/王安全/兵形）保留但界面不展示 | chess |
| 编排 | `lib/game` | `useGameController`（对弈+教练流程）、复盘分析、PV→SAN | engine, coach |
| 视图 | `components`, `app` | 棋盘、面板、四个模式页面、圆形手表界面 | React |
| 外观 | `app/globals.css` | DeepSeek 风格设计令牌（品牌蓝 `#4D6BFE`）、`data-theme` 主题、`data-board` 棋盘配色与高亮变量 | — |
| 棋子 | `public/piece/cburnett`, `components/board/PieceArt.tsx` | lichess cburnett 棋组（`<img>`，原样分发）+ 自绘「几何棋子」备选（内联 SVG，跟随主题令牌） | — |
| 状态 | `lib/store` | 设置（主题/语言/ELO/教练阈值/棋子样式/棋盘配色）、localStorage 持久化 | — |

## 3. 关键数据流

### 3.1 对弈循环（`/play`、`/watch`）

```
玩家落子 ──► AuroraGame.move() ──► version++ ──► useEffect(engine reply)
                                                   │
        ┌──────────────────────────────────────────┴───────────────┐
        │ 1. 开局库（ply < bookPlies）→ 立刻走谱招                  │
        │ 2. 引擎搜索 position + go depth/movetime + MultiPV N      │
        │ 3. candidatesFrom(MultiPV) → lossCp                       │
        │ 4. selectMove(candidates, level) → cplTarget + moveDecay   │
        │ 5. 落子 → version++                                       │
        └──────────────────────────────────────────────────────────┘
```

并发安全靠**单调 token**：每次 effect 运行取 `++tokenRef`，异步回调只有在 token 仍然
最新时才允许落子。这样 React 严格模式的双次执行、以及"用户悔棋后引擎还在思考"都不会
写入过期着法。

### 3.2 教练循环（`/coach`）

```
玩家回合 ──► 预分析（当前局面, MultiPV 2, depth=coachDepth）
             └─► preAnalysisRef = { fen, cp, bestLan, pv }

玩家落子 ──► pendingCheck{ record, before, history }
             ├─► 搜索"落子后的局面"（对手视角）→ 取负得到自己视角
             ├─► lossCp = before.cp − afterForPlayer
             ├─► classifyMove(lossCp, 胜率前后, 是否最佳/唯一/谱招)
             ├─► analysePosition(局面) → 发现项
             └─► verdict（超过阈值则阻塞引擎应手，等待用户选择）

用户选择 ──► 悔棋重走 / 显示最佳 / 继续 ──► 解除阻塞 → 引擎应手
```

教练的搜索强度（`coachDepth`）与**对手强度**（`settings.elo`）解耦：对手可以很弱，
但点评始终由较强的搜索给出。

### 3.3 复盘（`/review`）

一次遍历即可：对每个局面 i 搜索一次得到 `score[i]`（行棋方视角）与 `bestmove[i]`。
因为相邻局面的行棋方相反，着法 i 的损失就是 `score[i] + score[i+1]`，比"每步前后各搜一次"
少一半引擎调用。准确率按质量权重加权（严重失误权重 0）。

## 4. 为什么不把引擎放服务端

- Vercel 的 Serverless/Edge 运行时**不能常驻进程**，也没有稳定的 WASM 引擎托管方式；
  每次请求冷启动一个 1.7 MB 引擎既不经济也无法承载长搜索。
- 客户端引擎带来离线可用、零成本、零延迟首着。
- 代价是弱设备上限：因此手表端有预算封顶与省电模式，引擎不可用时还有内置降级对手。
- 如果将来要"服务器引擎"（例如手表端只做显示），`EngineClient` 的 `search()`
  接口就是替换点——把 Worker 换成 HTTP/SSE 客户端即可，上层无需改动。

## 5. 可访问性与性能

- 所有交互元素都是原生 `<button>`/`<input>`，带 `aria-label`；棋盘用 `role="img"` 的
  SVG 棋子 + 语义化按钮区域，读屏可用。
- `prefers-reduced-motion` 下关闭全部动画。
- 引擎资源 `immutable` 长缓存；WASM 在主线程预取并显示真实下载进度，再交给 Worker
  （第二次请求命中 HTTP 缓存）。
- 首页不挂载 `EngineProvider`，所以进入首页不会下载引擎。

## 6. 测试策略

| 层 | 方式 |
| --- | --- |
| 棋规 / UCI 解析 / 评估数学 / 强度映射 / 开局库 / 教练启发式 / PV | Vitest 单测（`src/**/*.test.ts`，88 项） |
| UCI 客户端（握手、MultiPV 归并、取消、错误、进度） | Vitest + 伪造 Worker |
| 真实引擎二进制 | `npm run engine:smoke`：启动 vendored WASM 跑真 UCI，11 项断言 |
| 生产构建 | `npm run build`（Next 静态预渲染 6 条路由） |
| 真实浏览器（引擎/棋子/对弈/教练/复盘/手表） | `scripts/browser-e2e.mjs`：Node 内置 fetch+WebSocket 驱动 CDP，36 项断言 |
| 部署后引擎可用性 | `/engine-selftest.html`（浏览器内真机自检） |

## 7. 外观系统

- **UI 主题**：`data-theme="light|dark"`（含 `system`），令牌集中在 `app/globals.css` 的
  `:root` 与 `:root[data-theme='dark']`；品牌色只有一个蓝 `#4D6BFE`，浅色为默认。
- **棋盘配色**：`data-board="deepseek|classic|ice"`，只覆盖棋盘与高亮变量
  （`--board-*`、`--hl-*`、`--piece-shadow`），因此 UI 主题与棋盘主题可以任意组合。
- **棋子**：`PieceArt` 按设置渲染 lichess 的 `<img src="/piece/cburnett/{w|b}{KQRBNP}.svg">`
  或内联的自绘 SVG；两者尺寸/定位完全一致（父容器 12.5% 方格），切换时无需改动棋盘。
