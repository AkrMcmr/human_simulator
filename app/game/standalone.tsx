import { createRoot } from "react-dom/client";
import Game from "./game";
import type { Provenance } from "../../packages/simulation/src/index.ts";
/** Single-file build of the same game component and engine, for hosting as a static page (scripts/build-game-page.mjs). */
declare const __HWL_PROVENANCE__: Provenance;
createRoot(document.getElementById("root")!).render(<Game provenance={__HWL_PROVENANCE__} saveMode="copy" />);
