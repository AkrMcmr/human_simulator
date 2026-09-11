"use client";
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { narrate, agentColor } from "@/packages/observer/src/index.ts";
import type { Frame } from "@/packages/simulation/src/index.ts";

/** Plain-language reading of the record up to the cursor. Observer-only; nothing here reaches the humans. */
export default function StoryPanel({ frames, onSeek }: { frames: Frame[]; onSeek: (tick: number) => void }) {
  const story = useMemo(() => narrate(frames), [frames]);
  return <section className="panel story-panel" aria-label="この記録の見どころ">
    <div className="section-row"><h2><Sparkles size={14} /> この記録を読む</h2><span className="caption">表示中の時点まで · 記録から自動生成</span></div>
    <h3 className="story-title">{story.title}</h3>
    {story.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
    {story.highlights.length > 0 && <ol className="story-list">{story.highlights.slice(-14).map((h, i) => <li key={`${h.tick}-${h.kind}-${h.id}-${i}`}>
      <Button size="xs" variant="outline" onClick={() => onSeek(h.tick)} aria-label={`t=${h.tick} の記録へ`}>t {h.tick}</Button>
      {h.id && <span className="event-agent" style={{ color: agentColor(h.id) }}>{h.id}</span>}
      <div><strong>{h.title}</strong><span>{h.detail}</span></div>
    </li>)}</ol>}
    {story.caveats.length > 0 && <details><summary>見方の注意</summary><ul>{story.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
  </section>;
}
