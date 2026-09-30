import Game from "./game";
import "./game.css";
import { BUILD_PROVENANCE } from "@/build/provenance";
export const metadata = { title: "はじまりのふたり — Human World Lab", description: "言葉も約束もない二人の次の行動を読み当てるゲーム。" };
export default function GamePage() { return <Game provenance={BUILD_PROVENANCE} labHref="/" />; }
