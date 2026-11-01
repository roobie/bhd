---
created: 2026-11-01
---

# B-YVAWDYLPFH3RYHXT Review a small learned decider model as an optional bot brain

## Why
B (2026-11-01): review whether a small decider-type model could be useful as a brain at some point, alongside or instead of hand-written utility scoring (wave w2-bots).

## Notes
- Fits the existing seam: a kit brain returns `Decision[]` from `BotCtx`. A model could score options in place of `value − cost`, or pick a doctrine's weights.
- Hard constraint: bots run in `Match` and must be deterministic across JS engines (§6.1). Inference must therefore be fixed-point or detmath-only. Otherwise a model brain is limited to seats owned by one peer, whose commands are sent like a human's, which the w2 design already allows.
- B's preferred runtime: an ONNX model running in the browser, e.g. onnxruntime-web. For lockstep, pin the WASM CPU backend: single-threaded, no SIMD-dependent kernels, and quantised int8 if possible. Then check that hashes match across Node, Chromium, Firefox and WebKit, like the determinism golden. WebGPU/WebGL backends are not deterministic, so allow them only for owner-run seats.
- Alternative (B): only the host runs the ONNX runtime, and its decisions go to the other peers as ordinary commands. Cross-engine determinism of inference then doesn't matter: any backend works, including WebGPU, and replays still work because the command log is the replay. Costs: the host's commands need the input delay, and a host drop needs a hand-off or a fallback utility brain. Only the host downloads the model. This is the w2 design's "seat owner runs it" option with the host owning every model seat, so it is the simplest route.
- Training data: the reporter's event logs, with `choice` events as labels, plus game outcomes.
- Questions to answer: model size and latency per think tick; bundle size on Pages; whether it beats tuned utility in reporter metrics; how explainable its choices are, since the reporter shows `choice` scores.
- Revisit after the reporter (wave 3) exists, so the comparison is measurable.
