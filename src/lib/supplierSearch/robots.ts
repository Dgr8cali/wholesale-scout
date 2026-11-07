/** A small robots.txt reader (RFC 9309: most specific agent group, longest matching rule, Allow wins ties). */

interface Group { agents: string[]; rules: { allow: boolean; path: string }[] }

function parse(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null, inAgents = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, "").match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    if (field === "user-agent") {
      if (!inAgents || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(m[2].toLowerCase());
      inAgents = true;
    } else if (field === "allow" || field === "disallow") {
      inAgents = false;
      if (current && m[2]) current.rules.push({ allow: field === "allow", path: m[2] });
    } else inAgents = false;
  }
  return groups;
}

/** Wildcards matched piece by piece, never with a regular expression: a hostile file can't make this slow. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const pieces = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  const first = pieces[0];
  if (!path.startsWith(first)) return false;
  if (pieces.length === 1) return !anchored || path === first;
  let at = first.length;
  const last = pieces[pieces.length - 1];
  for (const piece of pieces.slice(1, -1)) {
    const found = path.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  if (anchored) return path.endsWith(last) && path.length - last.length >= at;
  return path.indexOf(last, at) >= 0;
}

export function robotsAllows(robotsTxt: string | null, path: string, agent: string): boolean {
  if (!robotsTxt) return true;
  const groups = parse(robotsTxt), name = agent.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(name));
  const rules = (own.length ? own : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  let best: { allow: boolean; path: string } | null = null;
  for (const r of rules) {
    if (!matches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}
