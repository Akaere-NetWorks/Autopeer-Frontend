import type { PeerMetricPoint } from '~/types/api'

/**
 * Chart series derived from raw peer metric points, shared by the user and
 * admin peer-detail pages.
 *
 * rx_bytes / tx_bytes are cumulative WireGuard transfer counters sampled from
 * `wg show all dump` — NOT per-interval deltas. Rates and range totals are
 * therefore computed from consecutive differences; a negative delta means the
 * counter reset (tunnel restart) and that segment is skipped.
 */
export function usePeerMetricSeries(
  points: MaybeRefOrGetter<PeerMetricPoint[]>,
  peakOut: MaybeRefOrGetter<boolean>,
) {
  function clipPeaks(series: number[], percentile = 95): number[] {
    const valid = series.filter((v) => Number.isFinite(v))
    if (valid.length < 3) return series
    const sorted = [...valid].sort((a, b) => a - b)
    const idx = Math.min(Math.ceil(sorted.length * percentile / 100) - 1, sorted.length - 1)
    const cap = sorted[idx]!
    return series.map((v) => Math.min(v, cap))
  }
  function maybeClip(series: number[]): number[] {
    return toValue(peakOut) ? clipPeaks(series) : series
  }

  const rttSeries = computed(() => maybeClip(toValue(points).map((p) => p.rtt_ms ?? 0)))

  /** Per-second rates from consecutive counter deltas. */
  function computeRates(field: (p: PeerMetricPoint) => number): number[] {
    const pts = toValue(points)
    const out: number[] = []
    for (let i = 1; i < pts.length; i++) {
      const curr = pts[i]!
      const prev = pts[i - 1]!
      const dt = (new Date(curr.time).getTime() - new Date(prev.time).getTime()) / 1000
      const d = field(curr) - field(prev)
      out.push(dt > 0 && d >= 0 ? d / dt : 0)
    }
    return out
  }

  const rawRxRates = computed(() => computeRates((p) => p.rx_bytes))
  const rawTxRates = computed(() => computeRates((p) => p.tx_bytes))
  const rxRateSeries = computed(() => maybeClip(rawRxRates.value))
  const txRateSeries = computed(() => maybeClip(rawTxRates.value))

  // True per-direction peaks, from the unclipped series so the label stays
  // accurate while the display is peak-clipped.
  const peakRx = computed(() => Math.max(0, ...rawRxRates.value))
  const peakTx = computed(() => Math.max(0, ...rawTxRates.value))

  /** Actual bytes transferred over the range: sum of positive counter deltas. */
  function sumDeltas(field: (p: PeerMetricPoint) => number): number {
    const pts = toValue(points)
    let total = 0
    for (let i = 1; i < pts.length; i++) {
      const d = field(pts[i]!) - field(pts[i - 1]!)
      if (d > 0) total += d
    }
    return total
  }
  const transferredRx = computed(() => sumDeltas((p) => p.rx_bytes))
  const transferredTx = computed(() => sumDeltas((p) => p.tx_bytes))

  return {
    clipPeaks,
    maybeClip,
    rttSeries,
    rxRateSeries,
    txRateSeries,
    peakRx,
    peakTx,
    transferredRx,
    transferredTx,
  }
}
