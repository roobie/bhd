# Step 2 brief: shared rules for every slice agent

**What BHD is.** A WC3-style hero defense. It has a deterministic lockstep sim (`src/sim`), utility bots (`src/bots`), a Director, a reporter (`src/reporter`, `src/metrics`), and a WebGL2 client shell (`src/client/shell`, `play.html`).

**Read first.** In this wave's directory, read `PLAN.md` (your slice in §1, the engine in §2, lead rulings at the top), `CONTRACT.md` (the step-1 API as it actually landed), and `STATE.md` (criteria and decision ids). For the decisions themselves, run `chirp $HOME/.claude/skills/dev-proc/scripts/dev-proc.janet find "<topic>"` and read what it lists.

**Settled by B.**
- The Psyker's basic-attack hits add Warp (about +4).
- The Martyrdom nova hits enemies only.
- The status numbers stay as they are.
- Friendly fire is opt-in per damage source and needs the `ff` tag.

## Rules
- **Worktree and git.** You work in your own git worktree, branched from origin/main at 99b3ba8 or later. Commit with plain `git` and never push. Touch only the files your slice owns. If you truly need a change in a file you don't own, keep it minimal and call it out in your report.
- **Golden.** Sim changes move the hashes. You may run `npm run golden` so CI passes locally. But before every commit, run `git checkout test/determinism/golden.ts`; the lead regenerates it once, at integration. Don't edit `test/determinism/scenario.ts`.
- **Tests.** No gameplay pinning before v1.0: never assert tuned numbers or outcomes. Invariants and specced engine or client behaviour are fine.
- **Lint.** Biome is strict: useMaxParams 4, noNestedTernary, useDefaultSwitchClause, useGlobalThis, noMisplacedAssertion. Knip must stay clean.
- **Gate.** Run `npm run ci > <your log path> 2>&1; echo $?`. It must print 0. Use the log path your prompt gives you, and never mask an exit code.
- **Vite.** Only on your assigned port. Kill it by PID only; never `pkill -f`.
- **dev-proc.**
  - Fill in your slice's `STATE.md`: owner [claude], purpose, observable criteria.
  - Run `$DP phase <id> execute`.
  - Keep Evidence and Log current, and add Harvest lines as you go.
  - When done, move it to finalize. Do not close it.
- **Commit trailers:**
  ```
  Work: <your slice id>
  Work: U-DF7K3YRYWDWAAWOY

  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```

## Report back (concisely)
- branch and sha
- CI exit code
- what is live
- any file touched outside your ownership
- surprises, and anything the integrator must wire
