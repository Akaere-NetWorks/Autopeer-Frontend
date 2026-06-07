/** Smooth (Catmull-ish) SVG path builder for the MD3 area/line charts. */
export function buildSmoothPath(
  data: number[],
  w: number,
  h: number,
  pad = 0,
  maxOverride?: number,
): { line: string, area: string } {
  if (!data || data.length < 2) return { line: '', area: '' }
  const max = (maxOverride ?? Math.max(...data) * 1.15) || 1
  const min = 0
  const n = data.length
  const dx = (w - pad * 2) / (n - 1)
  const pts: [number, number][] = data.map((v, i) => {
    const x = pad + i * dx
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2)
    return [x, y]
  })
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!
    const [x1, y1] = pts[i]!
    const cx = (x0 + x1) / 2
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`
  }
  const area = `${d} L ${pts[n - 1]![0]} ${h - pad} L ${pts[0]![0]} ${h - pad} Z`
  return { line: d, area }
}

/** Plain polyline points string for sparklines. */
export function sparklinePoints(data: number[], width: number, height: number): string {
  if (!data || data.length < 2) return ''
  const max = Math.max(...data) * 1.2 || 1
  const n = data.length
  const dx = width / (n - 1)
  return data.map((v, i) => `${i * dx},${height - (v / max) * height}`).join(' ')
}
