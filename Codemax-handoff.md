# Codemax Handoff

> 跨会话 / 跨 worktree 交接文档。新会话零上下文读这一份即可接手。
> 「当前状态」段覆盖式更新；「历史记录索引」与「详情记录」只追加，永不删改。

## 当前状态

- **任务**：查清「桌面端 grok 主模型回答重复」的成因，并在 Codeg 里把这种退化标出来。
  分支 `claude/grok-desktop-duplicate-response-ff2cdb`（worktree 同名），未合并 main。
- **已完成**：
  - **定性**：不是 Codeg 的解析/渲染 bug。重复那段本来就写在 grok 自己的
    `chat_history.jsonl` 里（第 106 与 131 行相似度 0.998），Codeg 只是如实显示。
    成因是 grok 连发 9 次同参 `grep` → 它自己的防循环保护注入 system-reminder 要求停止
    → 模型被截断，复述了最近一条终稿而不是回答新问题。
  - **改动**：`parsers/grok.rs` 新增 `inject_grok_loop_halt_notices`，从
    `chat_history.jsonl` 捞回该 reminder，按 `prompt_index` 归位到被它拖坏的那个 assistant
    turn，合成一对 `meta.loopHalt` 的 ToolUse/ToolResult（沿用 `auto_compact_completed`
    → `contextCompaction` 的桥接形状），插在该轮最后一个文本块之前。
  - 前端：`src/lib/loop-halt.ts` + `src/components/message/loop-halt-card.tsx`（琥珀色分隔条
    警示卡），renderer 路由 + adapter 里打断工具组折叠，10 语言文案齐。
  - **磁盘**：删掉 32G Rust target，并在 `~/Documents/AI tools/.cargo/config.toml` 配了
    共享 `target-dir`，主仓与所有 worktree 共用一份产物（详见「环境 / 依赖配置」）。
- **卡在哪**：无阻塞。**未做真实 UI 回测**（用户拍板跳过）——卡片在桌面端实际长什么样、
  在真实会话里的视觉位置，都还没有人眼确认过。
- **下一步**：
  - 启动桌面端打开 Arbbot 那条 grok 会话（`01a01923-91cf-7072-b7b3-aba343a52fe7`），
    确认卡片位置与配色，然后再决定是否合并 main。
  - 可选：live 路径目前覆盖不到（reminder 不过 ACP 流，只在 chat_history.jsonl），
    要实时提示得加文件监视，本次刻意没做。

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
- [2026-08-19] **合并大分叉前先做虚拟合并探路**：`git merge-tree --write-tree A B` 只算不写工作区，
  exit=0 即无冲突。配合「逐文件统计上游改过几次」能在动手前就判断风险，比直接合了再回滚便宜得多。
  另外 11 个 commit 对 2188 个用 merge 而非 rebase——rebase 要解 11 遍冲突且改写历史。
- [2026-08-19] **合并后「提交还在」不等于「代码还在」**：上游若改过同一文件，合并结果可能采用它那侧。
  验证要同时查两层：`git merge-base --is-ancestor <sha> HEAD`（提交在历史里）+ grep 关键标识
  （代码在文件里）。本次 13 项功能标识逐条 grep 过。
- [2026-08-19] **`include_str!` 的资源改了不会自动重编**：`tool_schema.json` 编进二进制，
  而 `tauri dev` 的监视器只盯 `.rs`，改 json 后 app 仍跑旧描述，白试两轮。
  判断办法：`strings target/debug/codeg-mcp | grep <特征串>`。另外主程序 `codeg` 里查不到
  该字符串是正常的——只有 codeg-mcp 运行时读它，链接器把未使用的常量消除了。
- [2026-08-19] **codeg-mcp 是 per-launch 进程**：改了它不必重启 app，开一个新会话即可用上
  新二进制。用 `ps -o lstart` 比对进程启动时间与构建时间就能确认是否生效。
- [2026-08-19] **用「当前分支名」做新 worktree 的种子会自我叠加**：`claude/main-4c1517`
  → slug `claude-main-4c1517` → `claude/claude-main-4c1517`，每派生一代长一截。
  这类 bug 第三代才显形，单点锚点测试抓不到，要写「喂回去循环 N 次仍收敛」的不变式测试。
- [2026-08-19] **改 JSON 别用 `json.dumps` 整份重写**：一个字符串的改动会变成 53 行 diff。
  对锚点做字符串替换，文件其余部分逐字节不动。

- [2026-08-22] **grok 的防循环 reminder 只存在于 `chat_history.jsonl`**：`updates.jsonl` 和
  `events.jsonl` 里 grep 不到，且那一轮的 `turn_completed` 仍是 `stop_reason: "end_turn"`。
  也就是说被截断的退化回复在 ACP 流里跟正常回复完全一样 —— 判断「模型有没有被自己的保护
  掐断」不能只看解析流，必须去读模型侧那份历史。
- [2026-08-22] **注入必须排在 `relocate_orphaned_tool_results` 之前**：那个 pass 末尾会
  `turns.retain(|t| !t.blocks.is_empty())` 删掉空 turn，一旦跑过，`parse_updates` 记下的
  turn 下标就可能失效。凡是「解析期记下标、后期再用」的写法，都要检查中间有没有会增删元素的 pass。
- [2026-08-22] **同一段文本在一条会话里会出现两次**，正是本 bug 的症状（复述上一条终稿），
  所以「按文本匹配去定位那个 turn」是错的解法 —— 会挂到更早那条上。改用 `prompt_index` 归位。
- [2026-08-22] **磁盘满会伪装成编译器错误**：`failed to build archive … No space left on
  device (os error 28)`。看到链接阶段的怪错先 `df -h`，别去调构建配置。

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

- [2026-08-22] **退化提示沿用 `contextCompaction` 的 meta 桥接形状，而不是给 `MessageTurn`
  加字段**：解析器合成一对带 `_meta.loopHalt` 的 ToolUse/ToolResult，前端按 meta（而非工具名）
  路由到专用卡片。这样历史、快照、DB 重载三条路径自动一致，也不用动共享数据模型。
- [2026-08-22] **只做历史路径，不做 live**：reminder 不经过 ACP 流，实时提示只能靠监视
  `chat_history.jsonl`，成本远高于收益。代价是卡片要等会话重新从磁盘加载才出现，已在
  `src/lib/loop-halt.ts` 顶部写明。
- [2026-08-22] **细节字段抽不到就留空，不猜**：模板改词时 `tool` / `repeats` 会取不到，
  此时只渲染「本轮被防循环保护中止」的裸标签。宁可少说，不能显示一个编出来的次数。
- [2026-08-22] **共享 `target-dir` 放在仓库的祖先目录而不是仓库里**：`Codemax/.cargo/config.toml`
  是已入库文件（带 aarch64 linker 配置），改它会进 commit 影响别人和 CI。cargo 会把从当前目录
  一路向上的所有 `.cargo/config.toml` 合并，所以放 `AI tools/` 那层等效且不碰任何仓库文件。

### 环境 / 依赖配置

- **Rust 编译产物已改为全局共享**（2026-08-22）：`~/Documents/AI tools/.cargo/config.toml`
  把 `build.target-dir` 指向 `~/Documents/AI tools/.cargo-target-shared`，主仓与所有 worktree
  共用一份，各 checkout 下不再生成 `src-tauri/target`。此前是主仓 20G + 每 worktree 12G，
  开两三个 worktree 就把 460G 盘塞满（实测只剩 293MB，`cargo` 报
  `No space left on device (os error 28)`）。该文件不属于任何仓库，换机器要手动重建。
  代价：切分支 / 切 worktree 时缓存命中率下降，重编次数变多。
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
| grok 防循环退化提示（解析侧） | `src-tauri/src/parsers/grok.rs` `inject_grok_loop_halt_notices` / `read_grok_loop_halts` |
| 同上（前端） | `src/lib/loop-halt.ts` + `src/components/message/loop-halt-card.tsx`，路由在 `content-parts-renderer.tsx`，分组打断在 `ai-elements-adapter.ts` |
| grok 会话文件布局 | `~/.grok/sessions/<percent-encoded-cwd>/<session-uuid>/`：`updates.jsonl` 是 ACP 流（解析源），`chat_history.jsonl` 是模型侧历史（ask 答案、防循环 reminder 只在这里） |

## 历史记录索引

| 时间 | 一句话摘要 | 涉及模块/文件 | 详情锚点 |
|------|-----------|--------------|---------|
| 2026-08-22 | grok 重复回答定性为模型侧防循环截断，Codeg 加退化提示卡；磁盘根治共享 target | parsers/grok.rs, loop-halt.ts, loop-halt-card.tsx, .cargo/config.toml | [#h20260822-1](#h20260822-1) |
| 2026-08-19 | 同步上游 0.26.2（2188 commit，零冲突，本地 11 个全保留） | 全仓 102 文件 | [#h20260819-3](#h20260819-3) |
| 2026-08-19 | 侧栏平铺+分支标定稿、拖拽下限动态化、ask 卡片可触发 | sidebar-context, window-chrome, tool_schema | [#h20260819-2](#h20260819-2) |
| 2026-08-19 | Claude 兼容 worktree 布局 + 侧栏分支标，合并到 main | worktree_naming, work_task, automation, sidebar | [#h20260819-1](#h20260819-1) |

## 详情记录

### <a name="h20260822-1"></a>2026-08-22 — grok 回答重复：定性 + 退化提示卡 + 磁盘根治

**背景**：用户报「桌面端 grok 主模型的分支后面回答重复了」，指向
`Arbbot/.claude/worktrees/main-80dd85` 那条会话。

**定性（先证伪 Codeg）**：直接读 grok 自己的
`~/.grok/sessions/…main-80dd85/01a01923-91cf-7072-b7b3-aba343a52fe7/chat_history.jsonl`：
第 106 行与第 131 行的 assistant 内容相似度 **0.998**（近乎逐字复制）。也就是重复本来就在
grok 写的文件里，Codeg 显示无误。中间第 112–128 行是 **9 次同参 `grep`**（返回内容其实各不
相同，9 个不同 md5，说明不是"看到同样输出才卡住"），第 130 行是 grok CLI 注入的合成提醒
（`synthetic_reason: "system_reminder"`，"stuck in a polling loop … This turn will be halted
automatically"）。该提醒文本在 Codemax 代码库里 grep 不到，确认是 grok 侧产物。同一模式在这
条会话出现过两次（第 51–60 行也是 8 次同参 grep），只是那次复述的内容碰巧对题没被察觉。
另：该 transcript 是线性的（`rewind_points.jsonl` 只有 prompt_index 0~14，无 fork 出的 S2），
所以跟 Codeg 的 fork / 分支链路无关。

**改动**：Codeg 改不了模型行为，但可以让这种退化不再"看起来像正常回答"。
`inject_grok_loop_halt_notices` 扫 `chat_history.jsonl`，按最近一条真实 user 行的
`prompt_index` 把 reminder 归位（合成行自身没有 prompt_index），每个 prompt 只留一条，
再合成 `meta.loopHalt = {version, tool?, repeats?}` 的 ToolUse/ToolResult 插到该 turn 最后
一个文本块之前。前端按 meta 路由到 `<LoopHaltCard>`（琥珀色分隔条），并在
`ai-elements-adapter` 里打断工具组折叠——把警告折进"调用 N 个工具"等于没提示。

**验证**：4 个新 Rust 单测 + 6 个前端单测 + 1 个 adapter 分组测试全绿；前端全量
4381 passed；`cargo test --no-default-features --lib` 2714 passed（唯一失败
`remove_worktree_deletes_a_branch_plain_delete_cannot` 已 stash 到干净 HEAD 复现，是既有环境问题）。
**实机验证**：临时测试指向真实 `~/.grok/sessions`，解析那条会话命中 2 处
（turn 11 与 turn 29，meta `{tool:"grep", repeats:8, version:1}`），与 chat_history 里的两次
完全对应，测试跑完即删。**未做真实 UI 回测**（用户拍板跳过）。

**磁盘**：中途 `cargo` 报 `No space left on device`——460G 盘只剩 293MB。实测大头：
微信 Container 90G、Rust target 32G（主仓 20G + 本 worktree 12G）、Downloads 40G、
Xcode Developer 13G、各类缓存 ~23G。用户选择只删 Rust target（→ 32G 可用），并采纳
"仓库级共享 target"根治方案。


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

### <a name="h20260819-3"></a>2026-08-19 — 同步上游 0.26.2

**诉求**：保留本地 11 个 commit，同时拿到上游最新修复与功能。

**分叉规模**：本地领先 11、上游领先 **2188**，merge base 是 `ea5177ea # Release version 0.26.1`。
远端只有 `origin`（`Charlesaitime/codeg`），没有单独的 upstream。

**动手前的探路**（关键，别跳过）：`git merge-tree --write-tree main origin/main` 只算不写工作区，
exit=0 → 无冲突。再逐文件统计上游改过几次，确认重叠很小：
`sidebar-conversation-card.tsx` 2 次、`companion.rs` / `tool_schema.json` 各 1 次、
10 个 i18n 各 3 次（均为新增键），其余 20 个文件 0 次。

**方式**：`merge` 而非 `rebase`——11 个 commit 去 rebase 到 2188 个之上要解 11 遍冲突且改写历史。
合并前打了备份 ref `backup/pre-upstream-sync-20260819` 与 tag `backup-pre-upstream-sync`。

**验证**（合并后逐项）：
- `pnpm install`（上游新增 `unified` / `unist-util-visit` 两个依赖）
- `npx tsc --noEmit` 干净
- `pnpm test` **4374 passed / 319 files**（较合并前 +147 条 / +5 文件，均来自上游）
- `cargo clippy --no-default-features --lib -- -D warnings` 干净
- 11 个本地 commit 逐条 `merge-base --is-ancestor` 确认在历史里
- **13 项功能标识逐条 grep 确认仍在文件里**（提交在历史里 ≠ 代码没被上游那侧覆盖）

**上游带来的相邻功能**（概念相近，目前不冲突）：管理对话弹窗按分支筛选并在每行显示分支、
worktree 文件夹按「分支 + 目录」命名、任务 worktree 目录可配置、Qoder CLI 内置 agent、
状态栏快捷操作菜单。
