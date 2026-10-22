/**
 * A league's remaining regular-season schedule, saved as `fantasy_leagues.settings.schedule`
 * ({ weeks: { "8": [[teamId, teamId], ...] }, synced_at }, our team ids) so League outlook simulates real opponents.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type ScheduleWeeks = Record<string, Array<[string, string]>>
export type LeagueSchedule = { weeks: ScheduleWeeks; synced_at: string }

/** Yahoo's full-schedule read is heavy (~4 MB), so a saved schedule this fresh is reused. */
export const SCHEDULE_REUSE_MS = 7 * 24 * 60 * 60 * 1000

/** Adds a pairing once (each team's list repeats the game), keeping only weeks from `fromWeek` on. */
export function addSchedulePair(weeks: ScheduleWeeks, week: number, a: string | null, b: string | null, fromWeek: number) {
  if (!a || !b || a === b || !Number.isFinite(week) || week < fromWeek) return
  const list = (weeks[String(week)] ||= [])
  if (list.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return
  list.push([a, b])
}

/** A saved schedule still worth using: fresh, and covering the weeks after `week`. */
export function reusableSchedule(raw: unknown, week: number): LeagueSchedule | null {
  const s = raw && typeof raw === 'object' ? (raw as LeagueSchedule) : null
  if (!s?.weeks || typeof s.weeks !== 'object') return null
  const age = Date.now() - Date.parse(String(s.synced_at || ''))
  if (!Number.isFinite(age) || age > SCHEDULE_REUSE_MS) return null
  return Object.keys(s.weeks).some((w) => Number(w) > week) ? s : null
}

/** Merge the schedule into the league's current settings (other keys untouched). */
export async function saveLeagueSchedule(admin: SupabaseClient, leagueId: string, weeks: ScheduleWeeks) {
  if (!Object.keys(weeks).length) return
  const { data } = await admin.from('fantasy_leagues').select('settings').eq('id', leagueId).maybeSingle()
  const settings = data?.settings && typeof data.settings === 'object' ? (data.settings as Record<string, unknown>) : {}
  const schedule: LeagueSchedule = { weeks, synced_at: new Date().toISOString() }
  await admin.from('fantasy_leagues').update({ settings: { ...settings, schedule } }).eq('id', leagueId)
}
