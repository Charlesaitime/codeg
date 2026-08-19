//! Claude-compatible worktree naming — the single source of truth for WHERE a
//! new worktree directory goes and WHAT its branch is called.
//!
//! Every worktree Codeg creates (the manual "New worktree" dialog, a to-do
//! task, an automation run) lands on the same layout Claude Code uses:
//!
//! ```text
//! directory: <repo>/.claude/worktrees/<slug>-<hash6>
//! branch:    claude/<slug>-<hash6>
//! ```
//!
//! The directory name is exactly the branch with the `claude/` prefix removed,
//! so the two identify each other by inspection — that pairing is what lets
//! Claude Code pick up a worktree Codeg made (and the reverse) instead of each
//! tool only recognising its own.
//!
//! Before this module the three call sites each invented their own layout
//! (`<repo>-task-7` next to the project, `cv-main-a3f91c`, …); they now agree
//! byte-for-byte because they all come through here.

use std::path::{Path, PathBuf};

use rand::Rng;

/// Longest slug kept before the `-<hash6>` suffix. Long enough for a readable
/// phrase ("shadow-page-mockup-alignment"), short enough that the whole
/// directory name stays comfortably inside path limits when it sits under a
/// deep project path.
const SLUG_MAX_CHARS: usize = 40;

/// What a slug degrades to when the source has no usable ASCII characters at
/// all (a pure-CJK task title, say). The `-<hash6>` suffix still makes each
/// one unique, so this is a readable fallback rather than a collision.
const SLUG_FALLBACK: &str = "worktree";

/// The branch prefix Claude Code uses. The directory name is this same string
/// with the prefix stripped.
const BRANCH_PREFIX: &str = "claude/";

/// The repo-relative directory every worktree is created under.
const WORKTREES_SUBDIR: &str = ".claude/worktrees";

/// A resolved worktree identity: the directory's final path component and the
/// branch to check out in it. Always produced together — a caller that made
/// them separately is exactly the drift this module exists to prevent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeNaming {
    /// Final path component, e.g. `shadow-page-mockup-alignment-bd45b2`.
    pub dir_name: String,
    /// Branch to check out, e.g. `claude/shadow-page-mockup-alignment-bd45b2`.
    pub branch: String,
}

/// Reduce arbitrary text (a task title, a typed worktree name) to the plain
/// lowercase-letters-and-hyphens form a directory name is written in.
///
/// Non-ASCII is DROPPED rather than transliterated: a best-effort romanisation
/// of CJK would be wrong often enough to be worse than the `worktree-<hash6>`
/// fallback, and the directory is an identifier, not a label — the session's
/// own (fully renameable, Unicode) title is what the user reads in the sidebar.
pub fn slugify(source: &str) -> String {
    let mut out = String::with_capacity(source.len());
    let mut pending_sep = false;
    for ch in source.chars() {
        if ch.is_ascii_alphanumeric() {
            // A separator is only materialised once something follows it, so
            // leading separators never make it in and runs collapse to one.
            if pending_sep && !out.is_empty() {
                out.push('-');
            }
            pending_sep = false;
            out.push(ch.to_ascii_lowercase());
        } else {
            pending_sep = true;
        }
    }
    // Truncate AFTER building, not while pushing: a length check placed around
    // the pushes has to account for the separator too, and getting that wrong
    // silently overshoots the cap by one.
    if out.chars().count() > SLUG_MAX_CHARS {
        let cut = out
            .char_indices()
            .nth(SLUG_MAX_CHARS)
            .map(|(i, _)| i)
            .unwrap_or(out.len());
        out.truncate(cut);
    }
    // A cut that landed just after a separator would leave a trailing hyphen.
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        SLUG_FALLBACK.to_string()
    } else {
        out
    }
}

/// Six lowercase hex characters — the same shape Claude Code appends
/// (`…-bd45b2`). Random rather than derived from the source so two worktrees
/// made from the same title never collide.
pub fn random_suffix() -> String {
    let value: u32 = rand::thread_rng().gen_range(0..0x0100_0000);
    format!("{value:06x}")
}

/// Directory name + branch for a new worktree described by `source`.
///
/// `source` is whatever names the work in the caller's own terms — the text a
/// user typed, `task-49`, `auto-3-run-8`. It is slugified, never used raw.
pub fn claude_worktree_naming(source: &str) -> WorktreeNaming {
    naming_with_suffix(source, &random_suffix())
}

/// [`claude_worktree_naming`] with the random half injected, so tests can
/// assert the exact string instead of a regex.
fn naming_with_suffix(source: &str, suffix: &str) -> WorktreeNaming {
    let dir_name = format!("{}-{}", slugify(source), suffix);
    let branch = format!("{BRANCH_PREFIX}{dir_name}");
    WorktreeNaming { dir_name, branch }
}

/// The directory name that belongs to `branch`.
///
/// Upholds the pairing invariant in reverse: a `claude/`-prefixed branch maps
/// back to its directory by stripping the prefix, so a worktree whose folder
/// row was lost can be re-created at the SAME path it had rather than at a
/// fresh random one. A branch from anywhere else (an older `task/7`, a hand-made
/// branch) is slugified instead — a directory name has to be a directory name.
pub fn dir_name_for_branch(branch: &str) -> String {
    match branch.strip_prefix(BRANCH_PREFIX) {
        Some(rest) if !rest.is_empty() => rest.to_string(),
        _ => slugify(branch),
    }
}

/// `<repo>/.claude/worktrees` — the directory new worktrees are created in when
/// the project configures no worktree root of its own.
pub fn claude_worktrees_root(repo_path: &str) -> PathBuf {
    Path::new(repo_path).join(WORKTREES_SUBDIR)
}

/// Make git ignore the worktrees directory in the repository that now contains
/// it. Writing to `.git/info/exclude` rather than `.gitignore` keeps the entry
/// out of the user's tracked files — the same place Claude Code puts it.
///
/// Without this, moving worktrees INSIDE the repo (the whole point of the
/// Claude-compatible layout) would surface every worktree as untracked noise in
/// `git status` and in Codeg's own changes panel.
///
/// Fail-open by design: this is repository hygiene, not correctness. A repo
/// whose `info/exclude` cannot be written (read-only checkout, exotic git dir)
/// still gets a perfectly working worktree, so every error is returned for the
/// caller to LOG rather than to abort the creation on.
pub async fn ensure_worktrees_excluded(repo_path: &str) -> Result<(), String> {
    // `--git-common-dir` (not `--git-dir`): invoked from inside a linked
    // worktree the latter points at `<main>/.git/worktrees/<name>`, whose
    // `info/exclude` git does not read. The common dir is the one shared by
    // every worktree of the repository.
    let output = crate::process::tokio_command("git")
        .args(["rev-parse", "--path-format=absolute", "--git-common-dir"])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let common_dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if common_dir.is_empty() {
        return Err("git reported no common dir".to_string());
    }

    let info_dir = Path::new(&common_dir).join("info");
    let exclude_path = info_dir.join("exclude");
    let existing = std::fs::read_to_string(&exclude_path).unwrap_or_default();
    if exclude_has_worktrees_entry(&existing) {
        return Ok(());
    }

    std::fs::create_dir_all(&info_dir).map_err(|e| e.to_string())?;
    // A file that does not end in a newline would otherwise glue the new
    // pattern onto the last line and silently change what that line matches.
    let separator = if existing.is_empty() || existing.ends_with('\n') {
        ""
    } else {
        "\n"
    };
    let appended = format!("{existing}{separator}{WORKTREES_SUBDIR}/\n");
    std::fs::write(&exclude_path, appended).map_err(|e| e.to_string())
}

/// Whether an `info/exclude` body already ignores the worktrees directory.
/// Tolerates the spellings git treats as equivalent here — a leading `/` or
/// `**/`, and a missing trailing slash — so a repo Claude Code already set up
/// is left untouched instead of collecting a duplicate line.
fn exclude_has_worktrees_entry(body: &str) -> bool {
    body.lines().any(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return false;
        }
        let line = line
            .strip_prefix("**/")
            .or_else(|| line.strip_prefix('/'))
            .unwrap_or(line);
        let line = line.strip_suffix('/').unwrap_or(line);
        line == WORKTREES_SUBDIR
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_lowercases_and_hyphenates_a_phrase() {
        assert_eq!(
            slugify("Shadow Page Mockup Alignment"),
            "shadow-page-mockup-alignment"
        );
    }

    #[test]
    fn slugify_collapses_runs_and_trims_edges() {
        assert_eq!(slugify("  --Fix__the  BUG!!  "), "fix-the-bug");
    }

    #[test]
    fn slugify_keeps_digits_and_existing_hyphens() {
        assert_eq!(slugify("task-49"), "task-49");
        assert_eq!(slugify("auto-3-run-8"), "auto-3-run-8");
    }

    #[test]
    fn slugify_truncates_to_the_cap_without_a_trailing_hyphen() {
        // 4 chars per "word-" group; the cap lands mid-separator, which must
        // not survive into the directory name.
        let long = "abcd ".repeat(20);
        let slug = slugify(&long);
        assert!(slug.chars().count() <= SLUG_MAX_CHARS, "{slug}");
        assert!(!slug.ends_with('-'), "{slug}");
        // Exactly at the cap, cut on a word boundary rather than mid-word.
        assert_eq!(slug, "abcd-abcd-abcd-abcd-abcd-abcd-abcd-abcd");
    }

    #[test]
    fn slugify_falls_back_when_nothing_ascii_survives() {
        assert_eq!(slugify("交易主页界面"), SLUG_FALLBACK);
        assert_eq!(slugify(""), SLUG_FALLBACK);
    }

    #[test]
    fn naming_pairs_the_directory_with_a_claude_prefixed_branch() {
        let naming = naming_with_suffix("Shadow Page Mockup Alignment", "bd45b2");
        assert_eq!(naming.dir_name, "shadow-page-mockup-alignment-bd45b2");
        assert_eq!(naming.branch, "claude/shadow-page-mockup-alignment-bd45b2");
        // The pairing Claude Code relies on: branch minus the prefix IS the dir.
        assert_eq!(
            naming.branch.strip_prefix(BRANCH_PREFIX),
            Some(naming.dir_name.as_str())
        );
    }

    #[test]
    fn random_suffix_is_six_lowercase_hex_chars() {
        for _ in 0..64 {
            let suffix = random_suffix();
            assert_eq!(suffix.len(), 6, "{suffix}");
            assert!(
                suffix.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)),
                "{suffix}"
            );
        }
    }

    #[test]
    fn dir_name_round_trips_a_claude_branch_and_slugifies_anything_else() {
        let naming = naming_with_suffix("Fix the bug", "a3f91c");
        assert_eq!(dir_name_for_branch(&naming.branch), naming.dir_name);
        // Pre-existing branches from the old scheme still yield a usable name.
        assert_eq!(dir_name_for_branch("task/49"), "task-49");
        assert_eq!(dir_name_for_branch("automation/3/run-8"), "automation-3-run-8");
        // A bare prefix has no directory half to recover — fall back to slugify.
        assert_eq!(dir_name_for_branch("claude/"), "claude");
    }

    #[test]
    fn worktrees_root_hangs_off_the_repository() {
        assert_eq!(
            claude_worktrees_root("/src/repo"),
            PathBuf::from("/src/repo/.claude/worktrees")
        );
    }

    #[test]
    fn exclude_entry_is_recognised_in_every_equivalent_spelling() {
        for body in [
            ".claude/worktrees/\n",
            "/.claude/worktrees/\n",
            "**/.claude/worktrees/\n",
            ".claude/worktrees\n",
            "# comment\n*.log\n.claude/worktrees/\n",
        ] {
            assert!(exclude_has_worktrees_entry(body), "{body:?}");
        }
    }

    fn git_run(dir: &Path, args: &[&str]) {
        let out = std::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .output()
            .expect("spawn git");
        assert!(out.status.success(), "git {args:?}: {out:?}");
    }

    /// End to end against a real repository: the pattern is written, and a
    /// second call is a no-op rather than a duplicate line.
    #[tokio::test]
    async fn excluding_the_worktrees_dir_is_idempotent() {
        let dir = tempfile::tempdir().expect("tempdir");
        git_run(dir.path(), &["init", "-q"]);
        let repo = dir.path().to_string_lossy().into_owned();
        let exclude = dir.path().join(".git/info/exclude");

        ensure_worktrees_excluded(&repo).await.expect("first call");
        let after_first = std::fs::read_to_string(&exclude).expect("read exclude");
        assert!(exclude_has_worktrees_entry(&after_first), "{after_first}");

        ensure_worktrees_excluded(&repo).await.expect("second call");
        assert_eq!(
            std::fs::read_to_string(&exclude).expect("read exclude"),
            after_first,
            "a repeat call must not append a duplicate pattern"
        );
    }

    /// The pattern has to be readable by git itself, not merely present — an
    /// entry git does not honour would leave every worktree showing as
    /// untracked, which is the whole problem it exists to solve.
    #[tokio::test]
    async fn git_actually_ignores_a_worktree_directory_after_excluding() {
        let dir = tempfile::tempdir().expect("tempdir");
        git_run(dir.path(), &["init", "-q"]);
        let repo = dir.path().to_string_lossy().into_owned();
        std::fs::create_dir_all(dir.path().join(".claude/worktrees/task-7-a3f91c"))
            .expect("mkdir");
        std::fs::write(
            dir.path().join(".claude/worktrees/task-7-a3f91c/file.txt"),
            "x",
        )
        .expect("write");

        ensure_worktrees_excluded(&repo).await.expect("exclude");

        let out = std::process::Command::new("git")
            .args(["status", "--porcelain", "--untracked-files=all"])
            .current_dir(dir.path())
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .output()
            .expect("spawn git");
        let status = String::from_utf8_lossy(&out.stdout);
        assert!(
            !status.contains("worktrees"),
            "git still reports the worktrees directory: {status:?}"
        );
    }

    #[test]
    fn exclude_entry_is_absent_from_an_unrelated_or_commented_body() {
        for body in [
            "",
            "*.log\n",
            "# .claude/worktrees/\n",
            ".claude/\n",
            ".claude/worktrees-old/\n",
        ] {
            assert!(!exclude_has_worktrees_entry(body), "{body:?}");
        }
    }
}
