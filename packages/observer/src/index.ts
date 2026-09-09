import { ACTION_LABELS } from "../../contracts/src/index.ts";
import type { Frame } from "../../simulation/src/index.ts";
export const agentColor = (id: string) => id === "A" ? "#31c4df" : "#f5b44b";
export function eventLines(frames: Frame[]): { tick: number; id: string; text: string }[] {
  const lines: { tick: number; id: string; text: string }[] = [];
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    for (const agent of frame.agents) {
      const prior = frames[i - 1].agents.find((a) => a.id === agent.id);
      if (agent.trace?.peerTrackId && !prior?.trace?.peerTrackId) lines.push({ tick: frame.tick, id: agent.id, text: "同種らしい相手を視認" });
      if (agent.action !== prior?.action) lines.push({
        tick: frame.tick, id: agent.id,
        text: (ACTION_LABELS[agent.action as keyof typeof ACTION_LABELS] ?? agent.action) + (agent.trace?.exploratory ? "を試行" : "を選択"),
      });
      if (agent.heardSounds.length > (prior?.heardSounds.length ?? 0)) lines.push({ tick: frame.tick, id: agent.id, text: "新しい音のまとまりを記録" });
    }
  }
  return lines.slice(-60);
}
