/** Text from suppliers, Amazon and Keepa sometimes carries HTML entities ("1&nbsp;Litre"): read them as characters. */
const NAMED: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", trade: "™", reg: "®", copy: "©" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .replace(/ /g, " ");
}
