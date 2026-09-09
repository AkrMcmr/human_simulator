# Development contract

- Read docs/CONCEPT.md and docs/MODEL.md before changing the model. Preserve the distinction between user requirements, provisional assumptions, observed model behavior, and empirical evidence.
- Runtime human/world logic must not call LLMs, remote APIs, wall-clock time, or global Math.random. Use the supplied keyed RandomSource.
- Human and world may import contracts, but must not import each other. An Observation must never contain another human's private state, semantic intention, or a communication-success label.
- Apply all agents' decisions to the same previous world. Observation/UI must not mutate engine state or consume randomness.
- Keep CLI and UI on the same engine. Save configuration, component versions, RNG version, source provenance, checkpoint and traces.
- For behavioral changes: increment the relevant version, state the hypothesis and assumptions, run npm run test:model, and compare multiple paired seeds. Do not claim better human fidelity from a more interesting animation.
- For UI changes: run npm run typecheck and the required build. Browser QA only when explicitly requested by the user. Do not add a server, database, or LLM backend without a concrete need.
- Do not include credentials, generated experiment histories, dependency directories, or build output in commits. Respect the user's chosen GitHub destination; do not use an unrelated repository.
