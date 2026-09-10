# Development contract

- Read docs/CONCEPT.md and docs/MODEL.md before changing the model. Preserve the distinction between user requirements, provisional assumptions, observed model behavior, and empirical evidence.
- Runtime human/world logic must not call LLMs, remote APIs, wall-clock time, or global Math.random. Use the supplied keyed RandomSource.
- Human and world may import contracts, but must not import each other. An Observation must never contain another human's private state, semantic intention, or a communication-success label.
- Apply all agents' decisions to the same previous world. Observation/UI must not mutate engine state or consume randomness.
- Keep CLI and UI on the same engine. Save configuration, component versions, RNG version, source provenance, checkpoint and traces.
- For behavioral changes: increment the relevant version, state the hypothesis and assumptions, run npm run test:model, and compare multiple paired seeds. Do not claim better human fidelity from a more interesting animation.
- For UI changes: run npm run typecheck and the required build. Browser QA only when explicitly requested by the user. Do not add a server, database, or LLM backend without a concrete need.
- Do not include credentials, generated experiment histories, dependency directories, or build output in commits. Respect the user's chosen GitHub destination; do not use an unrelated repository.

## Start and hand off

- Read CONTRIBUTING.md and docs/STATUS.md at the start of repository work. Use docs/development/ARCHITECTURE.md for boundaries and docs/development/VALIDATION.md for commands.
- Inspect the branch, working tree, and existing changes before editing. Preserve other contributors' work; do not force-push shared history.
- Register behavior hypotheses and evaluation conditions before seeing results. Keep observed validation seeds distinct from fresh confirmation data. Never relax gates after seeing failure without a new recorded protocol.
- Distinguish experimental candidates from the default model. Passing a controlled study alone does not authorize a scientific fidelity claim or automatically promote the candidate.
- Update docs/STATUS.md and the relevant research decision when work changes adoption status or next steps. Use docs/development/HANDOFF.md and the PR template to record commands, evidence, limits, and remaining work.
- Curated aggregate research results may be committed under research/results; full generated simulation histories remain outside Git.
