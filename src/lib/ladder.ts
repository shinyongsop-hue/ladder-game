// Seeded PRNG (mulberry32)
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Generate ladder rungs between columns
export function generateLadder(n: number, seed: string) {
  const rng = mulberry32(hashStr(seed))
  const rows = Math.max(6, n * 3)
  // rungs[row][col] = true means horizontal rung from col to col+1
  const rungs: boolean[][] = Array.from({ length: rows }, () => Array(n - 1).fill(false))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < n - 1; c++) {
      if (rungs[r][c]) continue // already set
      if (c > 0 && rungs[r][c - 1]) continue // adjacent rung
      rungs[r][c] = rng() > 0.6
    }
  }
  return { rungs, rows }
}

// Trace path from start column to end result index
export function tracePath(start: number, rungs: boolean[][], rows: number): { row: number; col: number }[] {
  const path: { row: number; col: number }[] = [{ row: -1, col: start }]
  let col = start
  for (let r = 0; r < rows; r++) {
    // Check right
    if (col < rungs[0].length && rungs[r][col]) {
      path.push({ row: r, col })
      col++
      path.push({ row: r, col })
    } else if (col > 0 && rungs[r][col - 1]) {
      path.push({ row: r, col })
      col--
      path.push({ row: r, col })
    }
    path.push({ row: r + 0.5, col })
  }
  path.push({ row: rows, col })
  return path
}

// Calculate which result each start position leads to
export function computeResults(n: number, rungs: boolean[][], rows: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    let col = i
    for (let r = 0; r < rows; r++) {
      if (col < n - 1 && rungs[r][col]) col++
      else if (col > 0 && rungs[r][col - 1]) col--
    }
    return col
  })
}

const ADJECTIVES = ['고집스런', '행복한', '용감한', '귀여운', '엉뚱한', '신비로운', '활발한', '조용한', '재빠른', '든든한', '따뜻한', '차가운', '엄청난', '작은', '커다란']
const NOUNS = ['오리', '새우', '고양이', '강아지', '토끼', '여우', '곰', '호랑이', '사자', '코끼리', '펭귄', '독수리', '늑대', '돌고래', '다람쥐']

export function generateAutoNames(n: number, nameSeed: string): string[] {
  const rng = mulberry32(hashStr(nameSeed + 'names'))
  const used = new Set<string>()
  const names: string[] = []
  while (names.length < n) {
    const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]
    const noun = NOUNS[Math.floor(rng() * NOUNS.length)]
    const name = `${adj} ${noun}`
    if (!used.has(name)) { used.add(name); names.push(name) }
  }
  return names
}

export function generateId(len = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
