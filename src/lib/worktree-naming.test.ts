import { describe, expect, it } from "vitest"
import {
  claudeWorktreeNaming,
  displayBranchLabel,
  randomSuffix,
  slugify,
} from "./worktree-naming"

describe("slugify", () => {
  it("lowercases and hyphenates a phrase", () => {
    expect(slugify("Shadow Page Mockup Alignment")).toBe(
      "shadow-page-mockup-alignment"
    )
  })

  it("collapses separator runs and trims the edges", () => {
    expect(slugify("  --Fix__the  BUG!!  ")).toBe("fix-the-bug")
  })

  it("keeps digits and existing hyphens", () => {
    expect(slugify("task-49")).toBe("task-49")
  })

  it("truncates to the cap without leaving a trailing hyphen", () => {
    const slug = slugify("abcd ".repeat(20))
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith("-")).toBe(false)
    expect(slug).toBe("abcd-abcd-abcd-abcd-abcd-abcd-abcd-abcd")
  })

  it("falls back when nothing ASCII survives", () => {
    expect(slugify("交易主页界面")).toBe("worktree")
    expect(slugify("")).toBe("worktree")
  })
})

describe("randomSuffix", () => {
  it("is always six lowercase hex characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(randomSuffix()).toMatch(/^[0-9a-f]{6}$/)
    }
  })
})

describe("claudeWorktreeNaming", () => {
  it("puts the worktree under the repo's .claude/worktrees", () => {
    const naming = claudeWorktreeNaming(
      "/Users/me/Documents/Arbbot",
      "Shadow page mockup alignment",
      "bd45b2"
    )
    expect(naming.path).toBe(
      "/Users/me/Documents/Arbbot/.claude/worktrees/shadow-page-mockup-alignment-bd45b2"
    )
  })

  it("pairs the branch with the directory name, prefix aside", () => {
    const naming = claudeWorktreeNaming("/src/repo", "fix the bug", "a3f91c")
    expect(naming.dirName).toBe("fix-the-bug-a3f91c")
    expect(naming.branch).toBe("claude/fix-the-bug-a3f91c")
    // The invariant Claude Code relies on to match the two halves up.
    expect(naming.branch.replace(/^claude\//, "")).toBe(naming.dirName)
    expect(naming.path.endsWith(naming.dirName)).toBe(true)
  })

  it("does not double a separator the repo path ended with", () => {
    expect(claudeWorktreeNaming("/src/repo/", "x", "aaaaaa").path).toBe(
      "/src/repo/.claude/worktrees/x-aaaaaa"
    )
  })

  it("keeps Windows paths on backslashes", () => {
    expect(claudeWorktreeNaming("C:\\src\\repo", "x", "aaaaaa").path).toBe(
      "C:\\src\\repo\\.claude\\worktrees\\x-aaaaaa"
    )
  })
})

describe("displayBranchLabel", () => {
  it("drops the claude/ prefix so the identifying half survives truncation", () => {
    expect(displayBranchLabel("claude/main-4c1517")).toBe("main-4c1517")
    expect(
      displayBranchLabel("claude/shadow-page-mockup-alignment-bd45b2")
    ).toBe("shadow-page-mockup-alignment-bd45b2")
  })

  it("leaves every other branch exactly as it is", () => {
    // Only the exact prefix goes. Anything that merely resembles it, and any
    // branch from outside this scheme, has to survive untouched — the chip is
    // the only place the branch is shown on the row.
    for (const branch of [
      "main",
      "develop",
      "task/49",
      "automation/3/run-8",
      "claudette/x",
      "feature/claude/thing",
      "CLAUDE/upper",
    ]) {
      expect(displayBranchLabel(branch)).toBe(branch)
    }
  })

  it("keeps a bare prefix rather than rendering an empty chip", () => {
    // Nothing follows the prefix, so there is no identifying half to show;
    // an empty chip would read as a rendering bug.
    expect(displayBranchLabel("claude/")).toBe("claude/")
  })
})
