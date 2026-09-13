// The advisor's prompt, built live: the cloud routine (Danny's Claude subscription) reads this, researches and
// commits data/advice.json. Public like api/sweep: it holds nothing beyond fantasy football. ?fresh=1 rebuilds the sweep.
import { buildSweep } from "../lib/sleeper.js";
import { promptFor, stateFor } from "../lib/advise.js";
import { NO } from "../lib/http.js";

export async function GET(req) {
  try {
    const fresh = new URL(req.url).searchParams.has("fresh");
    const sweep = await buildSweep({ force: fresh });
    const st = await stateFor();
    const reason = "scheduled read by the cloud routine" + (st.pending.length ? `. Since the last read the checker saw: ${st.pending.join("; ")}` : "");
    const p = promptFor(sweep, { prev: st.prev, notified: st.notified, subs: st.subs, reason });
    return Response.json({ ok: true, week: sweep.week, generated: sweep.generated, ...p }, { headers: NO });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 502, headers: NO });
  }
}
