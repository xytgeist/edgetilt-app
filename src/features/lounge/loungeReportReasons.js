export const LOUNGE_REPORT_REASONS = [
  { id: 'spam', label: 'Spam or scam', hint: 'Ads, bots, or repetitive junk' },
  { id: 'harassment', label: 'Harassment or bullying', hint: 'Targeted attacks or threats' },
  { id: 'hate', label: 'Hate or slurs', hint: 'Attacks on a protected group' },
  { id: 'sexual', label: 'Sexual or graphic content', hint: 'Unwanted sexual content' },
  { id: 'impersonation', label: 'Impersonation', hint: 'Pretending to be someone else' },
  { id: 'illegal', label: 'Illegal activity', hint: 'Crime, fraud, or dangerous goods' },
  { id: 'other', label: 'Something else', hint: 'Tell us what is wrong' },
]

export const LOUNGE_REPORT_REASON_IDS = new Set(LOUNGE_REPORT_REASONS.map((row) => row.id))

export function loungeReportReasonLabel(reason) {
  return LOUNGE_REPORT_REASONS.find((row) => row.id === reason)?.label || reason || 'Report'
}
