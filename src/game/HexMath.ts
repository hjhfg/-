export const HEX_RADIUS = 38;
export const HEX_HALF_H = HEX_RADIUS * Math.sin(Math.PI / 3); // ~32.909
export const HEX_COL_STEP = HEX_RADIUS * 1.5; // 57
export const HEX_ROW_STEP = HEX_HALF_H * 2; // ~65.818

export const GRID_COLS = 9; // q = 0..8 -> 9 columns across mobile battlefield
export const GRID_ROWS = 21; // r = 0..20 -> 186 land hexes = 93 vs 93 at start!

export const WORLD_ORIGIN_X = 78;
export const WORLD_ORIGIN_Y = 128;
export const WORLD_WIDTH = WORLD_ORIGIN_X * 2 + (GRID_COLS - 1) * HEX_COL_STEP; // 612
export const WORLD_HEIGHT = WORLD_ORIGIN_Y * 2 + GRID_ROWS * HEX_ROW_STEP + 60; // ~1698

export interface HexCoord {
  q: number;
  r: number;
}

/**
 * Exact 6 neighbor offsets in clockwise edge order 0..5 matching flat-top vertices V_i -> V_{(i+1)%6}:
 * Edge 0: Bottom-Right (V0 -> V1)
 * Edge 1: Bottom Flat  (V1 -> V2)
 * Edge 2: Bottom-Left  (V2 -> V3)
 * Edge 3: Top-Left     (V3 -> V4)
 * Edge 4: Top Flat     (V4 -> V5)
 * Edge 5: Top-Right    (V5 -> V0)
 */
const EVEN_Q_NEIGHBORS: readonly [number, number][] = [
  [1, 0],   // Edge 0: BR
  [0, 1],   // Edge 1: B
  [-1, 0],  // Edge 2: BL
  [-1, -1], // Edge 3: TL
  [0, -1],  // Edge 4: T
  [1, -1],  // Edge 5: TR
];

const ODD_Q_NEIGHBORS: readonly [number, number][] = [
  [1, 1],   // Edge 0: BR
  [0, 1],   // Edge 1: B
  [-1, 1],  // Edge 2: BL
  [-1, 0],  // Edge 3: TL
  [0, -1],  // Edge 4: T
  [1, 0],   // Edge 5: TR
];

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexToWorld(q: number, r: number): { x: number; y: number } {
  const x = WORLD_ORIGIN_X + q * HEX_COL_STEP;
  const y = WORLD_ORIGIN_Y + (r + (q & 1) * 0.5) * HEX_ROW_STEP;
  return { x, y };
}

export function getHexVertices(cx: number, cy: number, radius = HEX_RADIUS): Array<{ x: number; y: number }> {
  const h = radius * Math.sin(Math.PI / 3);
  return [
    { x: cx + radius, y: cy },            // V0: 0 deg
    { x: cx + radius * 0.5, y: cy + h },  // V1: 60 deg
    { x: cx - radius * 0.5, y: cy + h },  // V2: 120 deg
    { x: cx - radius, y: cy },            // V3: 180 deg
    { x: cx - radius * 0.5, y: cy - h },  // V4: 240 deg
    { x: cx + radius * 0.5, y: cy - h },  // V5: 300 deg
  ];
}

export function getHexNeighbors(q: number, r: number): HexCoord[] {
  const offsets = (q & 1) === 1 ? ODD_Q_NEIGHBORS : EVEN_Q_NEIGHBORS;
  return offsets.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}

export function isValidGridHex(q: number, r: number): boolean {
  return q >= 0 && q < GRID_COLS && r >= 0 && r < GRID_ROWS;
}

/** Convert odd-q offset to cube coordinates for exact hex distance */
export function oddQToCube(q: number, r: number): { x: number; y: number; z: number } {
  const x = q;
  const z = r - ((q - (q & 1)) >> 1);
  const y = -x - z;
  return { x, y, z };
}

export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const a = oddQToCube(q1, r1);
  const b = oddQToCube(q2, r2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

/** Fast world-pixel to nearest odd-q hex lookup */
export function worldToHex(wx: number, wy: number): HexCoord {
  const fq = (wx - WORLD_ORIGIN_X) / HEX_COL_STEP;
  const approxQ = Math.round(fq);
  let bestQ = Math.max(0, Math.min(GRID_COLS - 1, approxQ));
  let bestR = 0;
  let bestDistSq = Infinity;

  for (let dq = -1; dq <= 1; dq++) {
    const cq = approxQ + dq;
    if (cq < 0 || cq >= GRID_COLS) continue;
    const approxR = Math.round((wy - WORLD_ORIGIN_Y) / HEX_ROW_STEP - (cq & 1) * 0.5);
    for (let dr = -1; dr <= 1; dr++) {
      const cr = approxR + dr;
      if (cr < 0 || cr >= GRID_ROWS) continue;
      const p = hexToWorld(cq, cr);
      const dSq = (p.x - wx) * (p.x - wx) + (p.y - wy) * (p.y - wy);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestQ = cq;
        bestR = cr;
      }
    }
  }
  return { q: bestQ, r: bestR };
}
