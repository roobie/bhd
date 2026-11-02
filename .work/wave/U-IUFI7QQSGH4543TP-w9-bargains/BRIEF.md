# Step 2 brief: shared rules for every w9 slice agent

**What BHD is.** A WC3-style hero defense. It has a deterministic lockstep sim (`src/sim`), utility bots (`src/bots`), a Director, a reporter (`src/reporter`), and a WebGL2 client shell (`src/client/shell`, `play.html`).

**Read first.** In this wave's directory, read:
- `PLAN.md`: your slice is in Step 2, and B's settled design is in §B, including the pool table;
- `CONTRACT.md`: the step-1 API as it actually landed;
- `STATE.md`.

For decisions, run `chirp $HOME/.claude/skills/dev-proc/scripts/dev-proc.janet find "<topic>"` and read what it lists. Key decisions:
- D-2PNKLSQWVJEBSWPI: the Ancient can be healed, never hurt.
- D-V4TA7WE5J4QC24D3: determinism means the same result across runtimes.
- D-ABIU2YALDBBGMWAR: bots read only Perception.

## Rules
- **Worktree and git.** Work in your own git worktree, branched from origin/main at cbc787d or later. Commit with plain `git` and never push. Touch only the files your slice owns. If you truly need a change outside them, keep it minimal and call it out in your report.
- **Tests.** No gameplay pinning before v1.0: never assert tuned numbers or outcomes. Invariants and specced engine or client behaviour are fine.
- **Lint.** Biome is strict: useMaxParams 4, noNestedTernary, useDefaultSwitchClause, useGlobalThis, noMisplacedAssertion. Knip must stay clean. Remove the knip ignore entries for the stubs your slice now uses.
- **Gate.** Run `npm run ci > <your log path> 2>&1; echo $?`; it must print 0. Use the log path your prompt gives you, and never mask an exit code.
- **Vite.** Only on your assigned port. Kill it by PID only; never `pkill -f`.
- **dev-proc.**
  - Fill in your slice's `STATE.md`: owner [claude], purpose, observable criteria.
  - Run `$DP phase <id> execute`.
  - Keep Evidence and Log current, and add Harvest lines as you go.
  - When done, move it to finalize. Do not close it.
- **Commit trailers:**
  ```
  Work: <your slice id>
  Work: U-IUFI7QQSGH4543TP

  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```

## Report back (concisely)
- branch and sha
- CI exit code
- what is live
- any file touched outside your ownership
- surprises, and anything the integrator must wire
