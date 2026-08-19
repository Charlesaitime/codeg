# Codemax Handoff

> 跨会话 / 跨 worktree 交接文档。新会话零上下文读这一份即可接手。
> 「当前状态」段覆盖式更新；「历史记录索引」与「详情记录」只追加，永不删改。

## 当前状态

- **任务**：让 Codeg 造的 worktree 与 Claude Code 命名兼容；侧栏按「仓库 → 会话平铺 + 分支标」展示；
  侧栏可拖窄；agent 的选项能渲染成可点选卡片。
- **已完成**：
  - 单一真源 `src-tauri/src/worktree_naming.rs` + `src/lib/worktree-naming.ts`，统一为
    `目录 = <仓库>/.claude/worktrees/<slug>-<hash6>`、`分支 = claude/<同名>`；三个创建入口全部改走它。
  - `git worktree add` 成功后写 `.git/info/exclude`，避免 worktree 污染父仓库 `git status`。
  - 侧栏：worktree 分组默认关闭（平铺成为默认视图），每行带分支 chip；chip 靠「有无实底 + 字重」
    区分 worktree 与仓库自身分支，并去掉 `claude/` 前缀（完整分支名留在 tooltip）。
  - 侧栏拖拽下限从写死 300 改为按窗口控件实际占用推导（macOS 100% → 214，Windows → 200，
    高缩放自动升高）；夹取改为派生，缩放 round-trip 不会毁掉用户拖的宽度。
  - `ask_user_question` 工具描述补例外：用户明确要求可点选选项时必须调用，不再被
    「仅在被卡住时用」劝退。
- **卡在哪**：无阻塞。两条未闭环，都只能实机验证：
  1. Claude 是否真能接管 Codeg 造的 worktree（形状已逐字对齐，未实测）。
  2. 点选卡片改动需重编 Rust 才生效；若 Grok 走的是它自己的原生 `_x.ai/ask_user_question`
     而非 codeg-mcp 的，本次描述改动影响不到它（那个描述在 x.ai 侧，不在本仓库）。
- **下一步**：
  - 上面两条实机验证。
  - 可选：后端补写 worktree 文件夹的 `git_branch` 列，让 chip 不再依赖 alias。
  - 本地 main 目前 ahead origin 8 个 commit，尚未 push。

### 踩过的坑（累积，不删旧条目）

- [2026-08-19] **worktree 移进仓库内部必然带出 `git status` 污染**。把 worktree 从「仓库同级」
  改到 `<仓库>/.claude/worktrees/` 之后，git 会把每个 worktree 报成父仓库的未跟踪目录。
  修法是写 `.git/info/exclude`（不是 `.gitignore`——不能进用户的跟踪文件），Claude Code 自己
  也是这么做的。**改这类布局时务必同时检查 `git status`**，端到端实测过才算数。
- [2026-08-19] **`slugify` 的长度上限不能在 push 循环里判**。分隔符那次 push 不算进上限会
  超出一个字符（实测 41 > 40）。正确写法是先建完整 slug、再按字符截断、最后去尾部连字符。
- [2026-08-19] **`remove_worktree_deletes_a_branch_plain_delete_cannot` 在本机是既有失败**，
  与任何改动无关：它断言 git 旧文案 `used by worktree`，而新版 git 输出
  `Cannot delete branch 'x' checked out at`。看到它红不要以为是自己改坏了，先 stash 跑基线。
- [2026-08-19] **桌面模式 `cargo` 需要前端产物**：`cargo test --features test-utils` 会因
  `resource path ../out doesn't exist` 直接构建失败。先 `pnpm build`，或改用
  `cargo test --no-default-features --lib` 跑纯逻辑测试。

- [2026-08-19] **写死的下限/默认值会让新功能静默失效**。分支 chip 实现完、测试全绿，但默认
  视图仍是分组（`loadShowWorktrees()` 无存储值时返回 `true`），chip 那条路径根本没被走到。
  同理侧栏「拖不动」不是把手问题，是 `MIN_WIDTH = 300` 而用户已顶死在最小值上。
  **改行为前先确认默认值站在哪一边**。
- [2026-08-19] **断言类名 ≠ 断言用户能看见**。chip 第一版用 `text-primary` / `text-muted-foreground`
  区分，测试 `toContain("text-primary")` 全绿，实机完全看不出差别——这套主题是刻意的单色设计
  （`--primary` 是 `oklch(0.205 0 0)`，chroma 为 0）。视觉差异要断言真正可见的属性（有无实底、字重）。
- [2026-08-19] **`rerender` 传同一个 JSX 元素引用，React 会整个跳过重渲染**。缩放 round-trip 测试
  因此一度假绿（改动的 mock 根本没送达）。要每次构造新元素。
- [2026-08-19] **桌面端「闪退」多半不是崩溃**。日志最后一行是 `[killed]`、0 个 panic：
  `pnpm tauri dev` 若由 agent 会话的后台任务拉起，会话销毁就连带被杀。**要长期稳定运行，
  必须由用户自己的终端跑**。另外 dev server 被挤到 3001 时（3000 被占）Tauri 会直接启动失败。
- [2026-08-19] **改 JSON 别用 `json.dumps` 整份重写**：一个字符串的改动会变成 53 行 diff。
  对锚点做字符串替换，文件其余部分逐字节不动。

### 关键架构决策

- [2026-08-19] **命名真源做成前后端两份实现而不是一份**。后端（Rust）负责任务 / 自动化，
  前端（TS）只负责手动对话框的默认值填充；让 webview 去调后端只为算一个字符串会多一次
  往返且拿不到即时预览。代价是两份必须保持同形 —— 两边都写了对照测试（同样的输入断言
  同样的 `<slug>-<hash6>` 与 `claude/` 前缀配对）。
- [2026-08-19] **分支保留来源语义而不是纯主题 slug**：任务是 `claude/task-<id>-<hash6>`、
  自动化是 `claude/auto-<id>-run-<n>-<hash6>`。否决了「完全照搬 Claude 的主题式 slug」——
  那样 `git worktree list` 里就认不出哪个 worktree 属于哪个任务了。
- [2026-08-19] **侧栏选了「平铺 + 分支 chip」而不是 Cursor 式的 worktree 嵌套行**（用户拍板）。
  现有的 `Show worktree folders` 分组视图保留、默认仍关闭，不删旧路径。
- [2026-08-19] **存量 worktree 不迁移**（用户拍板）。只影响新建；旧 worktree 的路径记在
  文件夹行里，没有任何地方重新推导，所以照常工作。

- [2026-08-19] **侧栏拖拽下限做成派生而非常量**：两个按钮簇都随缩放放大、红绿灯内距只在桌面版
  macOS 存在，写死任何一个数要么浪费空间要么让顶栏按钮重叠。与 `window-chrome.ts` 顶部
  「占用宽度只定义一处」原则同源，本次把它应用到 resize 下限上。
- [2026-08-19] **宽度夹取只发生在读取端，存储的是用户原始意图**：放大会把窄侧栏顶宽，缩回时
  必须回到用户拖的宽度而不是停在被顶宽的值上。写回 state 会在下限第一次移动时就毁掉该意图。
- [2026-08-19] **chip 用「有无实底 + 字重」而非色相区分**（用户从蓝/灰、单色对比、单色+竖条
  三个方案里选的）：这套主题是刻意单色，引入彩色需要新增语义 token 并打破设计语言。
- [2026-08-19] **`ask_user_question` 只加例外不放宽限制**：否决了「连罗列选项也一律用卡片」，
  那会让 agent 为小事弹卡片打断用户。ACP 层没有任何 prompt 注入机制，工具描述是唯一抓手，
  因此配了契约测试同时钉住「限制仍在」和「例外也在」。

### 环境 / 依赖配置

- 磁盘曾经写满导致 `cargo` 报 `No space left on device (os error 28)`。构建缓存很占地方：
  主仓 `src-tauri/target` 约 9.7G，每个 worktree 各自还有一份（约 5.6G）。
- Rust 测试跑服务器模式最省事：`cd src-tauri && cargo test --no-default-features --lib`。
  桌面模式需先 `pnpm build`。
- `git worktree add` 会自动创建 `.claude/worktrees` 这一串前置目录，无需 `mkdir`。
- **桌面端必须由使用者自己的终端跑** `pnpm tauri dev`，不要由 agent 会话代劳（会被连带杀掉）。
- Tauri 的 `devUrl` 写死 `http://localhost:3000`；3000 被占时 Next 会退到 3001，Tauri 随即
  启动失败退出。起不来先查 3000 有没有被占。
- `tool_schema.json` 是 `include_str!` 进二进制的，改它必须重编 Rust，HMR 不覆盖。

### 关键文件入口

| 要改什么 | 动哪里 |
|---|---|
| worktree 目录 / 分支命名规则 | `src-tauri/src/worktree_naming.rs`（真源）+ `src/lib/worktree-naming.ts`（对照实现）|
| 手动「New worktree」对话框默认值 | `src/components/layout/branch-dropdown.tsx` `handleOpenWorktreeDialog` |
| To-do 任务的 worktree | `src-tauri/src/work_task/engine.rs`（新建约 1260 行、恢复约 1350 行、路径解析 `worktree_path_in`）|
| Automation 每次运行的 worktree | `src-tauri/src/automation/engine.rs` `resolve_cwd` |
| 侧栏分支 chip 的取值 | `src/components/conversations/sidebar-conversation-list.tsx` `branchByFolder` |
| 侧栏分支 chip 的样式 | `src/components/conversations/sidebar-conversation-card.tsx` |
| worktree 分组视图（Show worktrees）| `src/components/conversations/sidebar-conversation-grouping.ts` |
| 侧栏各视图开关的默认值 | `src/lib/sidebar-view-mode-storage.ts` |
| 侧栏宽度范围（下限推导） | `src/lib/window-chrome.ts` `sidebarMinWidth` + `src/contexts/sidebar-context.tsx` |
| agent 可见的工具描述（含 ask） | `src-tauri/src/acp/delegation/tool_schema.json` |
| 点选卡片的渲染与解析 | `src/lib/ask-question.ts` + `src-tauri/src/acp/delegation/companion.rs` |

## 历史记录索引

| 时间 | 一句话摘要 | 涉及模块/文件 | 详情锚点 |
|------|-----------|--------------|---------|
| 2026-08-19 | 侧栏平铺+分支标定稿、拖拽下限动态化、ask 卡片可触发 | sidebar-context, window-chrome, tool_schema | [#h20260819-2](#h20260819-2) |
| 2026-08-19 | Claude 兼容 worktree 布局 + 侧栏分支标，合并到 main | worktree_naming, work_task, automation, sidebar | [#h20260819-1](#h20260819-1) |

## 详情记录

### <a name="h20260819-1"></a>2026-08-19 — Claude 兼容 worktree 布局 + 侧栏分支标

**背景**：用户希望 Codeg 建的 worktree 路径与 Claude Code 一致
（`/Users/…/Arbbot/.claude/worktrees/shadow-page-mockup-alignment-bd45b2`），方便 Claude
后续直接接管；同时侧栏要能一眼看出每个会话跑在哪个 checkout 里。

**改动前的三套命名**（各自为政，全部不兼容）：

| 入口 | 目录 | 分支 |
|---|---|---|
| 手动对话框 | `<仓库同级>/<repo>-<branch>-<rand6>` | `cv-<branch>-<rand6>` |
| To-do 任务 | `worktree_root` 设置 + `<repo>-task-<id>` | `task/<id>` |
| Automation | 仓库同级 + `<repo>-automation-<id>-run-<n>` | `automation/<id>/run-<n>` |

**改动后**：全部经由 `claude_worktree_naming(source)`，slug 保留来源语义
（`task-49` / `auto-3-run-8` / 用户输入），后接 6 位随机十六进制。
`worktree_path_in` 的「设置留空」分支从「仓库同级」改为 `.claude/worktrees`；
任务的「文件夹行丢失后从分支恢复目录」路径改用 `dir_name_for_branch`（去 `claude/` 前缀），
正是配对不变式的反向用法。

**验证**：前端 4205 测试全绿 / eslint / tsc / `pnpm build` 全过；Rust 服务器模式
2636 passed（1 个既有失败见上方「踩过的坑」），两种 feature 的 clippy `-D warnings` 均干净；
另在真实临时 git 仓库跑了 7 步端到端，含失败路径（重复分支必须被拒、exclude 前后
`git status` 对比、worktree 内部 `--git-common-dir` 指向共享 git 目录）。

**遗留**：worktree 的 chip 读的是文件夹 alias（建 worktree 时种入的分支名），因为 worktree
文件夹的 `git_branch` 列后端从不写。这与现有 worktree 分组表头同源，代价是**重命名 worktree
文件夹后 chip 会显示该重命名而非真分支**。要根治需后端补写 `git_branch`。

### <a name="h20260819-2"></a>2026-08-19 — 侧栏平铺定稿、拖拽下限动态化、ask 卡片可触发

承接 [#h20260819-1](#h20260819-1)，都是它落地后实机试用暴露出来的问题。

**① 平铺视图没生效**（`c956fab`）。chip 实现完整、测试全绿，但 `loadShowWorktrees()` 无存储值时
返回 `true`，默认仍是分组视图，chip 那条路径根本没被走到。翻默认值 + 同步预渲染种子值
（否则分组布局会闪一帧再塌回平铺）。

**② chip 看不出区别**（`13631a8`）。原用 `text-primary` / `text-muted-foreground`，而本主题
`--primary` 是 `oklch(0.205 0 0)`（chroma 0，即 `#171717`），与 `#737373` 同底摆放、10px 字号下
无法分辨。改为 worktree 保留实底 + 加粗、仓库自身分支去掉背景。测试同步改成断言实底与字重。

**③ 分支名太长**（`70e73ae`）。`claude/` 前缀在每行都一样，占掉 chip 约 110px 里的七个字符，
把真正区分两个 worktree 的那半挤进省略号。新增 `displayBranchLabel()` 只去精确前缀，
tooltip 保留完整分支名。

**④ 侧栏拖不动**（`fcd9283`）。分隔线一直可拖，拖不动的是下限：`MIN_WIDTH` 写死 300，
而 macOS 100% 缩放下顶栏真正需要的是 76(红绿灯) + 80(左按钮簇) + 58(侧栏准星/漏斗) = 214。
新增 `sidebarMinWidth(macInset, zoom)`，另设 `SIDEBAR_CONTENT_MIN = 200` 作内容可用性下限取较大值。

**⑤ agent 不肯弹点选卡片**（`4c36dee`）。链路全通（卡片组件、MCP 工具注入、`question.enabled`
默认 true、Grok 原生 ask 的解析与历史答案恢复），是工具描述里的「Use ONLY when you are blocked」
把用户亲口要的用法劝退了。补一条例外，其余限制保留。

**验证**：`pnpm test` 4223 passed / 314 files；`cargo test acp::delegation` 235 passed；
两种 feature 的 clippy `-D warnings` 均干净。

**遗留**：Grok 若走它自己的原生 `_x.ai/ask_user_question`，本次描述改动影响不到（描述在 x.ai 侧）。
