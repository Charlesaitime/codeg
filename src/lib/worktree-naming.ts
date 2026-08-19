/**
 * Claude-compatible worktree naming — the webview half of the layout defined in
 * `src-tauri/src/worktree_naming.rs`. Both halves must produce the same shape,
 * because the two make worktrees for the same repository:
 *
 *     directory: <repo>/.claude/worktrees/<slug>-<hash6>
 *     branch:    claude/<slug>-<hash6>
 *
 * The directory name is exactly the branch with the `claude/` prefix removed.
 * That pairing is what lets Claude Code adopt a worktree Codeg created (and the
 * reverse) instead of each tool only recognising its own.
 *
 * Only the manual "New worktree" dialog needs this on the frontend — task and
 * automation worktrees are named entirely in the backend.
 */

/** Longest slug kept before the `-<hash6>` suffix. Mirrors `SLUG_MAX_CHARS`. */
const SLUG_MAX_CHARS = 40

/** What a slug degrades to when no ASCII survives (a pure-CJK name, say). */
const SLUG_FALLBACK = "worktree"

const BRANCH_PREFIX = "claude/"

/** The repo-relative directory every new worktree is created under. */
export const WORKTREES_SUBDIR = ".claude/worktrees"

/**
 * The branch as it should READ in a tight space — `claude/` dropped, everything
 * else untouched.
 *
 * The prefix is the same on every worktree Codeg makes, so in a sidebar list it
 * is seven characters of pure noise repeated down the column while the half
 * that actually identifies the worktree (`main-4c1517`) gets truncated away.
 * Display only: the full branch still goes in the row's tooltip, and nothing
 * that talks to git ever sees this value.
 *
 * A branch from anywhere else — `main`, an older `task/49`, a hand-made
 * branch — passes through as-is; only the exact prefix is removed, and only
 * when something follows it.
 */
export function displayBranchLabel(branch: string): string {
  const rest = branch.startsWith(BRANCH_PREFIX)
    ? branch.slice(BRANCH_PREFIX.length)
    : branch
  return rest || branch
}

export interface WorktreeNaming {
  /** Final path component, e.g. `shadow-page-mockup-alignment-bd45b2`. */
  dirName: string
  /** Branch to check out, e.g. `claude/shadow-page-mockup-alignment-bd45b2`. */
  branch: string
  /** Absolute directory the worktree is created at. */
  path: string
}

/**
 * Reduce arbitrary text to the plain lowercase-letters-and-hyphens form a
 * directory name is written in. Non-ASCII is dropped rather than
 * transliterated — the directory is an identifier, and the session's own
 * (renameable, Unicode) title is what the user actually reads in the sidebar.
 */
export function slugify(source: string): string {
  let slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
  // Truncate AFTER building: a cap applied while scanning has to account for
  // the separator too, and getting that wrong overshoots by one.
  if (slug.length > SLUG_MAX_CHARS) {
    slug = slug.slice(0, SLUG_MAX_CHARS).replace(/-+$/, "")
  }
  return slug || SLUG_FALLBACK
}

/**
 * The slug to seed a NEW worktree with when branching off `branch`.
 *
 * Naming a worktree after the branch it came from stacks up once that branch is
 * itself one of ours: `claude/main-4c1517` slugifies to `claude-main-4c1517`,
 * which the prefix then turns into `claude/claude-main-4c1517` — and a third
 * generation into `claude/claude-claude-…`. Both of OUR halves are dropped
 * here, so branching off `claude/main-4c1517` seeds `main` and yields
 * `claude/main-<newhash>`: no stacking, and the name stops growing.
 *
 * The trailing hash is only stripped from a `claude/`-prefixed branch. A branch
 * from anywhere else is passed through untouched — six trailing hex characters
 * are perfectly ordinary in a hand-made name (`fix-abc123`), and there we have
 * no reason to believe they are a generated suffix.
 */
export function branchSeedSlug(branch: string): string {
  if (!branch.startsWith(BRANCH_PREFIX)) return branch
  const rest = branch.slice(BRANCH_PREFIX.length)
  // Falls back rather than returning empty: `claude/4c1517` is all-suffix, and
  // an empty seed would silently become the generic `worktree` fallback.
  return rest.replace(/-[0-9a-f]{6}$/, "") || rest || branch
}

/**
 * Six lowercase hex characters — the same shape Claude Code appends
 * (`…-bd45b2`). Random rather than derived, so two worktrees named the same
 * thing never collide.
 */
export function randomSuffix(): string {
  return Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0")
}

/**
 * Directory name, branch and absolute path for a new worktree of the repository
 * at `repoPath`, described by `source` (whatever the user typed).
 *
 * `suffix` is injectable so tests can assert the exact strings; production
 * callers omit it.
 */
export function claudeWorktreeNaming(
  repoPath: string,
  source: string,
  suffix: string = randomSuffix()
): WorktreeNaming {
  const dirName = `${slugify(source)}-${suffix}`
  // The repo path is joined by hand rather than through a path helper: this
  // runs in a webview with no `path` module, and the separator that matters is
  // the one the backend already handed us in `repoPath`.
  const base = repoPath.replace(/[/\\]+$/, "")
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/"
  const subdir = WORKTREES_SUBDIR.split("/").join(sep)
  return {
    dirName,
    branch: `${BRANCH_PREFIX}${dirName}`,
    path: `${base}${sep}${subdir}${sep}${dirName}`,
  }
}
