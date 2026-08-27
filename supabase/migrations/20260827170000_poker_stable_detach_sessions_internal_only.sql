-- Takes poker_stable_detach_stake_sessions_to_personal fully internal.
--
-- 20260827160000 added a participant guard because the browser called this RPC
-- directly, so `authenticated` had to keep EXECUTE. That browser call turned out
-- to be dead weight: revokeDeal flipped poker_stable_deals.status to 'revoked',
-- and the poker_stable_after_backer_exit_detach trigger (after update of status)
-- already fires the detach on exactly that transition. The client call ran second
-- and was wrapped in a try/catch that swallowed every error ("ignore if migration
-- not applied yet"), left over from before 20260806020000 shipped. Removed from
-- pokerStableApi.js in the same change as this migration.
--
-- Every remaining caller is SECURITY DEFINER and therefore reaches this function
-- as the owner, not as the end user's role:
--   * poker_stable_after_backer_exit_detach  (trigger, security definer)
--   * poker_stable_decline_backer_slice      (security definer)
-- So revoking `authenticated` removes the direct attack surface without touching
-- either flow.
--
-- The participant guard from 20260827160000 stays in place on purpose. It is now
-- defense in depth rather than the only control, and it still does real work:
-- auth.uid() is the end user inside those definer callers, so a revoke or decline
-- driven by a non-participant is still refused.

revoke all on function public.poker_stable_detach_stake_sessions_to_personal(uuid) from authenticated;

comment on function public.poker_stable_detach_stake_sessions_to_personal(uuid) is
  'INTERNAL. Moves a deal''s completed sessions to the stakee''s personal bankroll once no backers remain. Reached only via poker_stable_after_backer_exit_detach (trigger) or poker_stable_decline_backer_slice, both security definer; anon and authenticated hold no EXECUTE. Retains a participant guard on auth.uid() as defense in depth.';
