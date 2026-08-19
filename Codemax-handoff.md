# Codemax Handoff

> 跨会话 / 跨 worktree 交接文档。新会话零上下文读这一份即可接手。
> 「当前状态」段覆盖式更新；「历史记录索引」与「详情记录」只追加，永不删改。

## 当前状态

- **任务**：让 Codeg 造的 worktree 与 Claude Code 命名兼容，并把 worktree 归属在侧栏一眼可见。
- **已完成**：
  - 新增单一真源 `src-tauri/src/worktree_naming.rs` + `src/lib/worktree-naming.ts`，统一为
    `目录 = <仓库>/.claude/worktrees/<slug>-<hash6>`、`分支 = claude/<同名>`。
  - 三个创建入口（手动对话框 / To-do 任务 / Automation 每次运行）全部改走该真源。
  - `git worktree add` 成功后写入 `.git/info/exclude`，避免 worktree 污染父仓库 `git status`。
  - 侧栏会话行加分支 chip：worktree 用主题色、仓库自身分支用灰色；10 语言 i18n 已补。
- **卡在哪**：无阻塞。唯一未闭环的是「Claude 是否真能接管 Codeg 造的 worktree」——
  形状已逐字对齐但未实机验证，需要建一个 worktree 后用 Claude 打开确认。
- **下一步**：
  - 实机验证 Claude 接管（上面那条）。
  - 可选：把 worktree 文件夹的 `git_branch` 列真正写入后端，让 chip 不再依赖 alias
    （见下方「踩过的坑」最后一条）。

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

### 环境 / 依赖配置

- 磁盘曾经写满导致 `cargo` 报 `No space left on device (os error 28)`。构建缓存很占地方：
  主仓 `src-tauri/target` 约 9.7G，每个 worktree 各自还有一份（约 5.6G）。
- Rust 测试跑服务器模式最省事：`cd src-tauri && cargo test --no-default-features --lib`。
  桌面模式需先 `pnpm build`。
- `git worktree add` 会自动创建 `.claude/worktrees` 这一串前置目录，无需 `mkdir`。

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

## 历史记录索引

| 时间 | 一句话摘要 | 涉及模块/文件 | 详情锚点 |
|------|-----------|--------------|---------|
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
