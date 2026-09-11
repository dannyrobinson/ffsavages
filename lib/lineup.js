// Optimal starting lineup by projected points under this league's slots. Small DFS with an upper-bound
// prune; the roster is 16 players so it is instant.
export const SLOT_ELIG = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
export const DEFAULT_SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX", "K", "DEF"];
export const slotLabel = s => s === "SUPER_FLEX" ? "SUPERFLEX" : s;

/** players: [{id, pos, proj, ...}] (only the ones allowed to start). Returns {slots:[{slot, player}], pts}. */
export function optimalLineup(players, slots = DEFAULT_SLOTS) {
  const pool = players.filter(p => p && (p.proj || 0) > 0);
  // fill the most constrained slots first so the bound prunes well
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => SLOT_ELIG[a.s].length - SLOT_ELIG[b.s].length || a.i - b.i);
  const byProj = pool.slice().sort((a, b) => b.proj - a.proj);
  let best = { pts: -1, pick: null };
  const used = new Set(); const pick = new Array(order.length).fill(null);
  function bound(k, total) {   // optimistic: best remaining players regardless of position
    let n = order.length - k, sum = total;
    for (const p of byProj) { if (n === 0) break; if (!used.has(p.id)) { sum += p.proj; n--; } }
    return sum;
  }
  function go(k, total) {
    if (k === order.length) { if (total > best.pts) best = { pts: total, pick: pick.slice() }; return; }
    if (bound(k, total) <= best.pts) return;
    const elig = SLOT_ELIG[order[k].s];
    let tried = false;
    for (const p of byProj) {
      if (used.has(p.id) || !elig.includes(p.pos)) continue;
      tried = true; used.add(p.id); pick[k] = p; go(k + 1, total + p.proj); used.delete(p.id); pick[k] = null;
    }
    if (!tried) { pick[k] = null; go(k + 1, total); }   // nobody for this slot: leave it empty
  }
  go(0, 0);
  const out = slots.map(s => ({ slot: s, player: null }));
  (best.pick || []).forEach((p, k) => { out[order[k].i].player = p; });
  return { slots: out, pts: Math.round(Math.max(0, best.pts) * 10) / 10 };
}
