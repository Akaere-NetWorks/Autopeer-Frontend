/** Formatting helpers shared across screens. */
export function useFormat() {
  const { t, locale } = useI18n()

  function fmtBytes(n: number | null | undefined): string {
    if (!n) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    let v = n
    let i = 0
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
  }

  function fmtRtt(ms: number | null | undefined): string {
    return ms == null ? t('common.dash') : `${ms.toFixed(1)}`
  }

  function fmtAsn(asn: number | null | undefined): string {
    return asn == null ? t('common.dash') : `AS${asn}`
  }

  /** Relative time from an RFC3339 timestamp, e.g. "3m ago". */
  function relTime(iso: string | null | undefined): string {
    if (!iso) return t('common.dash')
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return iso
    const diff = Date.now() - then
    const abs = Math.abs(diff)
    const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
    const table: [number, Intl.RelativeTimeFormatUnit][] = [
      [60_000, 'second'],
      [3_600_000, 'minute'],
      [86_400_000, 'hour'],
      [604_800_000, 'day'],
      [2_629_800_000, 'week'],
      [31_557_600_000, 'month'],
      [Infinity, 'year'],
    ]
    const divisors: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_629_800_000, year: 31_557_600_000 }
    for (const [limit, unit] of table) {
      if (abs < limit) {
        const value = Math.round(-diff / divisors[unit]!)
        return rtf.format(value, unit)
      }
    }
    return iso
  }

  /** Absolute date for tooltips / tables. */
  function fmtDate(iso: string | null | undefined): string {
    if (!iso) return t('common.dash')
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
  }

  function fmtUptime(secs: number | null | undefined): string {
    if (!secs || secs <= 0) return t('common.dash')
    const d = Math.floor(secs / 86400)
    const h = Math.floor((secs % 86400) / 3600)
    const m = Math.floor((secs % 3600) / 60)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  return { fmtBytes, fmtRtt, fmtAsn, relTime, fmtDate, fmtUptime }
}
