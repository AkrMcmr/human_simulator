import Lab from "./lab";
import { BUILD_PROVENANCE } from "@/build/provenance";
export default function Home() { return <Lab provenance={BUILD_PROVENANCE} />; }
