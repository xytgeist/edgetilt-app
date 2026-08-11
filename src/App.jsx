import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { mobileShell, inputBase, btnPrimary, linkBtn } from './features/shell/shellClasses'
import { readAuthCallbackParams, getOAuthCallbackMessage, readAuthTokensFromLocation, hasAuthSuccessTokens, replaceUrlPreservingQuery, isLikelyEmailConfirmLanding } from './features/auth/oauthCallback'
import { routeAfterGuestClaimEmailConfirm, waitForSupabaseSession } from './features/auth/emailConfirmRouting.js'
import AuthModalPanel from './features/auth/AuthModalPanel'
import AuthModalShell from './features/auth/AuthModalShell'
import AppShell from './features/shell'
import { ensureDefaultProfileRow } from './features/profiles/profileGate'
import SubscribeModal from './features/billing/SubscribeModal.jsx'
import BillingManageModal from './features/billing/BillingManageModal.jsx'
import StarterWeeklyDropScratchModal from './features/billing/StarterWeeklyDropScratchModal.jsx'
import {
  listenStarterWeeklyDropOpen,
  stripStarterDropQueryParam,
} from './features/billing/starterWeeklyDropApi.js'
import {
  authRedirectUrlWithAffiliateRef,
  captureAffiliateRefFromUrl,
  ensureAffiliateStampFromUserMetadata,
  getAffiliateCodeForCheckout,
} from './features/affiliates/affiliateRefApi.js'
import { useStarterWeeklyDropGuideSlugs } from './features/billing/useStarterWeeklyDropGuideSlugs.js'
import { useStarterWeeklyDropPoolExhausted } from './features/billing/useStarterWeeklyDropPoolExhausted.js'
import { PRODUCT_SLOTS_EDGE } from './features/billing/edgeProducts.js'
import { useEdgeEntitlements } from './features/billing/useEdgeEntitlements.js'
import { useContentAccessGates } from './features/billing/useContentAccessGates.js'
import {
  LegalDocumentScreen,
  LegalAcceptanceModal,
  parseLegalPathname,
  resolveLegalViewFromLocation,
  recordLegalAcceptance,
  shouldShowLegalAcceptanceModal,
  markPendingLegalAcceptance,
  readPendingLegalAcceptance,
  markLegalReturnContext,
  resolveLegalReturnContext,
  clearLegalReturnContext,
  readLegalReturnContext,
  applyLegalReturnReopen,
} from './features/legal'
import {
  readLoungeComposerDraftPendingWork,
  shouldShowLoungeColdBootSplash,
} from './utils/loungeColdBootSplash.js'
import { clearAccountClientState } from './utils/clearAccountClientState.js'
import {
  hasStoredSupabaseAuthToken,
  restoreSupabaseSession,
} from './utils/supabaseSessionRestore.js'
import { parseMonitorPathname } from './features/ops/opsMonitorNavigation.js'
import { parsePokerSwapClaimFromLocation } from './features/poker-bankroll/pokerTournamentSwapNav.js'
import {
  authRedirectBaseForCurrentLocation,
  navigateAfterStakeClaim,
  parsePokerStakeClaimFromLocation,
  readStashedPokerStakeClaimToken,
  navigateToStakeClaimPage,
  stakeClaimSignupEmailRedirectUrl,
  stashPokerStakeClaimToken,
} from './features/poker-bankroll/pokerStableStakeClaimNav.js'
import { tryAutoLinkGuestStakeeOffers } from './features/poker-bankroll/pokerGuestStakeeAutoLink.js'
import {
  markPokerStableClaimFlowPending,
  navigateAfterStableClaim,
  navigateToStableClaimPage,
  parsePokerStableClaimFromLocation,
  readStashedPokerStableClaimToken,
  isPokerStableClaimFlowPending,
  stableClaimSignupEmailRedirectUrl,
  stashPokerStableClaimToken,
} from './features/poker-stable/pokerStableBackerClaimNav.js'
import {
  tryAutoLinkGuestBackerOffers,
  tryOpenPendingBackerSliceOnboarding,
  resumeStableBackerClaimAfterConfirm,
  recoverStaleStableBackerClaim,
} from './features/poker-stable/pokerGuestBackerAutoLink.js'
import { lazyRoute } from './utils/lazyImportWithChunkReload.js'

const EdgeMonitorDesktopPage = lazyRoute(() => import('./features/ops/EdgeMonitorDesktopPage.jsx'))
const PokerTournamentSwapClaimPage = lazyRoute(
  () => import('./features/poker-bankroll/PokerTournamentSwapClaimPage.jsx'),
)
const PokerStableStakeClaimPage = lazyRoute(
  () => import('./features/poker-bankroll/PokerStableStakeClaimPage.jsx'),
)
const PokerStableBackerClaimPage = lazyRoute(
  () => import('./features/poker-stable/PokerStableBackerClaimPage.jsx'),
)

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Email confirm links often open in Gmail / in-app browsers, not the signup tab.
    // PKCE needs the same browser; implicit hash tokens work cross-context.
    flowType: 'implicit',
    detectSessionInUrl: true,
  },
})

function readBillingQueryParams() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const billing = params.get('billing')
    if (!billing) return null
    return {
      billing,
      product: params.get('product') || PRODUCT_SLOTS_EDGE,
      fanCreator:
        (params.get('fan_creator') || params.get('creator') || '').trim() || null,
    }
  } catch {
    return null
  }
}

function clearBillingQueryParams() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('billing')
    url.searchParams.delete('product')
    url.searchParams.delete('fan_creator')
    url.searchParams.delete('creator')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, document.title, next || '/')
  } catch {
    // ignore
  }
}

function App() {
  const AUTH_VIEW_STORAGE_KEY = 'lvslotpro-auth-view'
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isChecking, setIsChecking] = useState(true)
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window === 'undefined') return 'app'
    if (parseMonitorPathname(window.location.pathname || '/')) return 'monitor'
    if (
      parsePokerSwapClaimFromLocation(
        window.location.pathname || '/',
        window.location.search || '',
      )
    ) {
      return 'poker-swap-claim'
    }
    if (
      parsePokerStakeClaimFromLocation(
        window.location.pathname || '/',
        window.location.search || '',
      )
    ) {
      return 'poker-stake-claim'
    }
    if (
      parsePokerStableClaimFromLocation(
        window.location.pathname || '/',
        window.location.search || '',
      )
    ) {
      return 'poker-stable-claim'
    }
    return (
      resolveLegalViewFromLocation(
        window.location.pathname || '/',
        window.location.search || '',
      ) || 'app'
    )
  })
  /** Login/signup as a modal over the app when the user chooses it or a feature calls onRequireAuth. */
  const [authPanelOpen, setAuthPanelOpen] = useState(false)
  /** Optional shell banner (e.g. future account notices). */
  const [accessNotice, setAccessNotice] = useState('')
  const ACCESS_NOTICE_DISMISS_MS = 4500
  /** Moderator/admin: full access; hamburger hides subscriber-only lock icons. */
  const [isStaffRole, setIsStaffRole] = useState(false)
  /** Admin only: content access lock switches on calcs/guides, guide delete, play log system templates. */
  const [isAdminRole, setIsAdminRole] = useState(false)
  /** From `profiles.has_active_subscription` when column exists (see `supabase/profiles_tier_testing.sql`). */
  const [hasActiveSubscriptionFromProfile, setHasActiveSubscriptionFromProfile] = useState(false)
  const [stripeCustomerId, setStripeCustomerId] = useState(null)
  const [subscribeModal, setSubscribeModal] = useState({
    open: false,
    productSlug: PRODUCT_SLOTS_EDGE,
    openKey: 0,
  })
  const [billingManageOpen, setBillingManageOpen] = useState(false)
  const [starterDropModal, setStarterDropModal] = useState({ open: false, unlockId: '' })

  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [authTab, setAuthTab] = useState('join')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('')
  const [signupMessage, setSignupMessage] = useState('')
  const [signupError, setSignupError] = useState('')

  // Reset password states
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  // Login error (only shown after failed login attempt)
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isOAuthLoading, setIsOAuthLoading] = useState(false)
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false)

  // Verification success message
  const [verificationSuccess, setVerificationSuccess] = useState(false)
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [legalAcceptancePending, setLegalAcceptancePending] = useState(false)
  const [legalAcceptanceBusy, setLegalAcceptanceBusy] = useState(false)
  const [legalAcceptanceError, setLegalAcceptanceError] = useState('')
  /** Suppress popstate from re-entering legal while programmatically exiting (Got it / Back). */
  const legalExitViaPopRef = useRef(false)

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const pref = window.localStorage.getItem(AUTH_VIEW_STORAGE_KEY)
        if (pref === 'create') {
          setAuthTab('join')
          setShowForgotPassword(false)
          setAuthPanelOpen(true)
        }
        if (pref === 'login') {
          setAuthTab('signin')
          setShowForgotPassword(false)
          setAuthPanelOpen(true)
        }
        if (pref) window.localStorage.removeItem(AUTH_VIEW_STORAGE_KEY)
      } catch {
        // Ignore storage read failures.
      }
    })
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        const pathname = window.location.pathname || '/'
        const search = window.location.search || ''
        const legalSlug = resolveLegalViewFromLocation(pathname, search)
        if (parseLegalPathname(pathname) && !legalSlug) {
          window.history.replaceState({}, document.title, '/')
          setCurrentView('app')
          return
        }
        if (legalSlug) {
          setCurrentView(legalSlug)
          return
        }

        const tokens = readAuthTokensFromLocation()
        const combinedForType = `${window.location.hash || ''}${search}`

        if (hasAuthSuccessTokens(tokens) && isLikelyEmailConfirmLanding(tokens)) {
          try {
            if (tokens.code) {
              await supabase.auth.exchangeCodeForSession(tokens.code)
            } else if (tokens.accessToken && tokens.refreshToken) {
              await supabase.auth.setSession({
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
              })
            }
          } catch {
            // Link may already be consumed; detectSessionInUrl may still have established a session.
          }

          await waitForSupabaseSession(supabase)
          const routed = await routeAfterGuestClaimEmailConfirm(supabase, {
            pathname,
            search,
            parsePokerStakeClaimFromLocation,
            parsePokerStableClaimFromLocation,
            readStashedPokerStakeClaimToken,
            readStashedPokerStableClaimToken,
            navigateToStakeClaimPage,
            navigateToStableClaimPage,
            tryAutoLinkGuestStakeeOffers,
            tryAutoLinkGuestBackerOffers,
            tryOpenPendingBackerSliceOnboarding,
            resumeStableBackerClaimAfterConfirm,
            recoverStaleStableBackerClaim,
            replaceUrlPreservingQuery,
          })
          if (routed) return

          replaceUrlPreservingQuery(pathname || '/')
          setVerificationSuccess(true)
          setAuthTab('signin')
          setShowForgotPassword(false)
          setLoginError('')
          setAuthPanelOpen(true)
          return
        }

        if (combinedForType.includes('type=recovery')) {
          setCurrentView('reset-password')
          if (tokens.accessToken && tokens.refreshToken) {
            void supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
            })
          }
          window.history.replaceState({}, document.title, '/reset-password')
          return
        }

        if (!hasAuthSuccessTokens(tokens)) {
          const { error: oauthError, errorCode, errorDescription } = readAuthCallbackParams()
          const oauthMsg = getOAuthCallbackMessage(oauthError, errorCode, errorDescription)
          if (oauthMsg) {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
              const routed = await routeAfterGuestClaimEmailConfirm(supabase, {
                pathname,
                search,
                parsePokerStakeClaimFromLocation,
                parsePokerStableClaimFromLocation,
                readStashedPokerStakeClaimToken,
                readStashedPokerStableClaimToken,
                navigateToStakeClaimPage,
                navigateToStableClaimPage,
                tryAutoLinkGuestStakeeOffers,
                tryAutoLinkGuestBackerOffers,
                tryOpenPendingBackerSliceOnboarding,
                resumeStableBackerClaimAfterConfirm,
                recoverStaleStableBackerClaim,
                replaceUrlPreservingQuery,
              })
              if (routed) return
            }
            setAuthTab('signin')
            setLoginError(oauthMsg)
            setAuthPanelOpen(true)
            replaceUrlPreservingQuery(`${pathname}${search}` || '/')
          }
        }
      })()
    })
  }, [])

  /** Guest claim flows after sign-in on home (autolink before stale stored tokens). */
  useEffect(() => {
    if (!user?.id || isChecking || currentView !== 'app') return
    void (async () => {
      const linkedBacker = await tryAutoLinkGuestBackerOffers(supabase)
      if (linkedBacker) return
      const linkedStakee = await tryAutoLinkGuestStakeeOffers(supabase)
      if (linkedStakee) return
      const claimFlowPending = isPokerStableClaimFlowPending()
      const opened = await tryOpenPendingBackerSliceOnboarding(supabase, { force: claimFlowPending })
      if (opened) return
      if (claimFlowPending) {
        const stableToken = readStashedPokerStableClaimToken()
        if (stableToken) {
          const resumed = await resumeStableBackerClaimAfterConfirm(supabase, stableToken)
          if (resumed) return
        }
        const recovered = await recoverStaleStableBackerClaim(supabase)
        if (recovered) return
        const stakeToken = readStashedPokerStakeClaimToken()
        if (stakeToken) {
          navigateToStakeClaimPage(stakeToken)
        }
      }
    })()
  }, [user?.id, isChecking, currentView])

  useEffect(() => {
    let cancelled = false
    let bootstrapDone = false

    const syncUser = (session) => {
      if (cancelled) return
      setUser(session?.user ?? null)
    }

    const finishAuthCheck = () => {
      if (cancelled || bootstrapDone) return
      bootstrapDone = true
      setIsChecking(false)
    }

    const bootstrap = async () => {
      try {
        const session = await restoreSupabaseSession(supabase)
        syncUser(session)
      } catch {
        syncUser(null)
      } finally {
        finishAuthCheck()
      }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (session?.user) {
        syncUser(session)
        return
      }
      // iOS PWA: native confirm / resume can race supabase-js auth locks and emit
      // SIGNED_OUT even though the refresh token is still on disk. Real logout clears
      // storage first ... only soft-restore when a token is still present.
      if (
        (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') &&
        hasStoredSupabaseAuthToken()
      ) {
        void restoreSupabaseSession(supabase).then((restored) => {
          if (cancelled) return
          syncUser(restored?.user ? restored : null)
        })
        return
      }
      syncUser(null)
    })

    const onResume = () => {
      if (cancelled || document.visibilityState !== 'visible') return
      void restoreSupabaseSession(supabase).then((session) => {
        if (!cancelled && session?.user) syncUser(session)
      })
    }

    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('pageshow', onResume)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('pageshow', onResume)
    }
  }, [])

  /** Seeds `profiles` when missing (avoids Lounge composer UUID hex initials like “65”) - OAuth and session restore, not only password login. */
  useEffect(() => {
    if (!user?.id) return
    void ensureDefaultProfileRow(supabase, user)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when auth user id changes; not every new `user` reference from Supabase.
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      queueMicrotask(() => {
        setLegalAcceptancePending(false)
        setLegalAcceptanceError('')
      })
      return
    }
    let cancelled = false
    const syncLegalAcceptance = async () => {
      if (readPendingLegalAcceptance()) {
        await ensureDefaultProfileRow(supabase, user)
        const { error } = await recordLegalAcceptance(supabase, user.id)
        if (cancelled) return
        if (!error) {
          setLegalAcceptancePending(false)
          setLegalAcceptanceError('')
          return
        }
      }
      const needs = await shouldShowLegalAcceptanceModal(supabase, user.id)
      if (!cancelled) setLegalAcceptancePending(needs)
    }
    void syncLegalAcceptance()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const handleLegalAcceptance = useCallback(async () => {
    if (!user?.id || legalAcceptanceBusy) return
    setLegalAcceptanceBusy(true)
    setLegalAcceptanceError('')
    await ensureDefaultProfileRow(supabase, user)
    const { error } = await recordLegalAcceptance(supabase, user.id)
    if (error) {
      setLegalAcceptanceError('Could not save your acceptance. Please try again.')
      setLegalAcceptanceBusy(false)
      return
    }
    setLegalAcceptancePending(false)
    setLegalAcceptanceBusy(false)
  }, [user, legalAcceptanceBusy])

  useEffect(() => {
    if (!user?.id) {
      queueMicrotask(() => {
        setIsStaffRole(false)
        setIsAdminRole(false)
        setHasActiveSubscriptionFromProfile(false)
        setStripeCustomerId(null)
      })
      return
    }
    let cancelled = false
    const load = async () => {
      const wide = await supabase
        .from('profiles')
        .select('role, has_active_subscription, stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (wide.data) {
        const r = wide.data.role
        setIsStaffRole(r === 'moderator' || r === 'admin')
        setIsAdminRole(r === 'admin')
        setHasActiveSubscriptionFromProfile(Boolean(wide.data.has_active_subscription))
        setStripeCustomerId(wide.data.stripe_customer_id ?? null)
        return
      }
      if (wide.error?.code === 'PGRST116') {
        setIsStaffRole(false)
        setIsAdminRole(false)
        setHasActiveSubscriptionFromProfile(false)
        setStripeCustomerId(null)
        return
      }
      if (wide.error) {
        const narrow = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
        if (cancelled) return
        if (narrow.data) {
          const r = narrow.data.role
          setIsStaffRole(r === 'moderator' || r === 'admin')
          setIsAdminRole(r === 'admin')
        } else {
          setIsStaffRole(false)
          setIsAdminRole(false)
        }
        setHasActiveSubscriptionFromProfile(false)
        setStripeCustomerId(null)
        return
      }
      setIsStaffRole(false)
      setIsAdminRole(false)
      setHasActiveSubscriptionFromProfile(false)
      setStripeCustomerId(null)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const {
    entitlements,
    refresh: refreshEntitlements,
    hasSlotsEdge: hasSlotsEdgeFromRpc,
    hasSlotsEdgeLifetime: hasSlotsEdgeLifetimeFromRpc,
    hasSlotsEdgeStarter: hasSlotsEdgeStarterFromRpc,
    hasSlotsEdgePro: hasSlotsEdgeProFromRpc,
    starterPriceInterval,
    fullPriceInterval,
  } = useEdgeEntitlements(supabase, user?.id)

  const {
    gatesMap: contentAccessGatesMap,
    gatesDbReady: contentAccessGatesDbReady,
    setContentGate: setContentAccessGate,
  } = useContentAccessGates(supabase, isAdminRole)

  const starterDropGuideContextEnabled = Boolean(
    user?.id && hasSlotsEdgeStarterFromRpc && !hasSlotsEdgeProFromRpc && !isStaffRole,
  )
  const starterWeeklyDropGuideSlugs = useStarterWeeklyDropGuideSlugs(supabase, {
    enabled: starterDropGuideContextEnabled,
  })
  const starterWeeklyDropPoolExhausted = useStarterWeeklyDropPoolExhausted(supabase, {
    enabled: starterDropGuideContextEnabled,
  })

  useEffect(() => {
    return listenStarterWeeklyDropOpen(({ unlockId }) => {
      setStarterDropModal({ open: true, unlockId })
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    void captureAffiliateRefFromUrl(supabase)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    void ensureAffiliateStampFromUserMetadata(supabase, user)
    // Re-stamp once per signed-in user when localStorage was lost (email confirm in another profile).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: user.id gate only
  }, [user?.id])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return
    const params = new URLSearchParams(window.location.search || '')
    const unlockId = (params.get('starterDrop') || '').trim()
    if (!unlockId) return
    setStarterDropModal({ open: true, unlockId })
    stripStarterDropQueryParam()
  }, [user?.id])

  useEffect(() => {
    const billing = readBillingQueryParams()
    if (!billing || !user?.id) return

    let cancelled = false

    const pollFanEntitlements = async (creatorUserId) => {
      const key = `creator-fan:${creatorUserId}`
      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (cancelled) return
        const { data, error } = await supabase.rpc('get_my_creator_fan_entitlements')
        if (!error && data?.[key]?.active === true) {
          const creatorId = String(creatorUserId || '').trim()
          if (creatorId) {
            const { data: followRow } = await supabase
              .from('profile_follows')
              .select('follower_id')
              .eq('follower_id', user.id)
              .eq('following_id', creatorId)
              .maybeSingle()
            if (!followRow) {
              await supabase.from('profile_follows').insert({
                follower_id: user.id,
                following_id: creatorId,
              })
            }
          }
          return
        }
        await new Promise((r) => window.setTimeout(r, 1200))
      }
    }

    const pollEntitlements = async () => {
      const maxAttempts = billing.billing === 'portal' ? 8 : 15
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (cancelled) return
        await refreshEntitlements()
        const { data } = await supabase
          .from('profiles')
          .select('has_active_subscription, stripe_customer_id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (data) {
          setHasActiveSubscriptionFromProfile(Boolean(data.has_active_subscription))
          setStripeCustomerId(data.stripe_customer_id ?? null)
          if (billing.billing === 'success' && data.has_active_subscription) return
        }
        if (billing.billing === 'portal' && attempt >= maxAttempts - 1) return
        await new Promise((r) => window.setTimeout(r, 1200))
      }
    }

    if (billing.billing === 'fan_success' && billing.fanCreator) {
      void pollFanEntitlements(billing.fanCreator).then(() => {
        window.dispatchEvent(
          new CustomEvent('edge:creator-fan-billing-return', {
            detail: { creatorUserId: billing.fanCreator },
          }),
        )
      })
      setAccessNotice('Fan subscription active — thanks for supporting this creator.')
      clearBillingQueryParams()
      return () => {
        cancelled = true
      }
    }

    if (billing.billing === 'success' || billing.billing === 'portal') {
      void pollEntitlements().then(() => {
        if (billing.fanCreator) {
          window.dispatchEvent(
            new CustomEvent('edge:creator-fan-billing-return', {
              detail: { creatorUserId: billing.fanCreator },
            }),
          )
        }
      })
      if (billing.billing === 'success') {
        setAccessNotice('Subscription updated - thanks for supporting Edge.')
      } else {
        setAccessNotice('Billing settings saved.')
      }
    }
    clearBillingQueryParams()

    return () => {
      cancelled = true
    }
  }, [user?.id, refreshEntitlements])

  useEffect(() => {
    if (!accessNotice) return undefined
    const timer = window.setTimeout(() => setAccessNotice(''), ACCESS_NOTICE_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [accessNotice])

  const openSubscribeModal = useCallback((productSlug = PRODUCT_SLOTS_EDGE) => {
    setSubscribeModal((s) => ({ open: true, productSlug, openKey: s.openKey + 1 }))
  }, [])

  const closeSubscribeModal = useCallback(() => {
    setSubscribeModal((s) => ({ ...s, open: false }))
  }, [])

  const closeBillingManageModal = useCallback(() => {
    setBillingManageOpen(false)
  }, [])

  const handleCheckoutStarted = useCallback(() => {
    void refreshEntitlements()
  }, [refreshEntitlements])

  const openBillingManageModal = useCallback(() => {
    const hasPaidMembership =
      hasSlotsEdgeStarterFromRpc ||
      hasSlotsEdgeProFromRpc ||
      hasSlotsEdgeLifetimeFromRpc
    if (hasPaidMembership) {
      setBillingManageOpen(true)
    } else {
      openSubscribeModal(PRODUCT_SLOTS_EDGE)
    }
  }, [hasSlotsEdgeLifetimeFromRpc, hasSlotsEdgeProFromRpc, hasSlotsEdgeStarterFromRpc, openSubscribeModal])

  const getFriendlyErrorMessage = (error, context = 'general') => {
    const message = error?.message || 'Unknown error'
    const lower = message.toLowerCase()

    if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('fetch')) {
      return 'Network error. Check your connection and try again.'
    }

    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'Too many attempts. Please wait a few minutes and try again.'
    }

    if (context === 'login' && (lower.includes('email not confirmed') || lower.includes('not confirmed'))) {
      return 'Please verify your email before logging in.'
    }

    if (context === 'reset' && (lower.includes('session missing') || lower.includes('invalid') || lower.includes('expired') || lower.includes('jwt'))) {
      return 'This reset link is invalid or expired. Please request a new one.'
    }

    return message
  }

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (isLoggingIn) return
    setIsLoggingIn(true)
    setLoginError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setLoginError(getFriendlyErrorMessage(error, 'login'))
      setIsLoggingIn(false)
      return
    }

    setIsLoggingIn(false)
    setUser(data.user)
    setAccessNotice('')
    setVerificationSuccess(false)
    setAuthPanelOpen(false)
    await ensureDefaultProfileRow(supabase, data.user)
    // Full reload so Lounge (and composer) mount with the new session; same-tab anon → member can leave feed UI stale otherwise.
    window.location.reload()
  }

  const handleOAuthSignIn = async (provider, { setError = setLoginError, markLegalPending = false } = {}) => {
    if (isOAuthLoading) return
    setError('')
    if (markLegalPending) markPendingLegalAcceptance()
    setIsOAuthLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: authRedirectUrlWithAffiliateRef(authRedirectBaseForCurrentLocation()),
      },
    })
    if (error) {
      setError(getFriendlyErrorMessage(error))
      setIsOAuthLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (isSigningUp) return
    setSignupError('')
    setSignupMessage('')
    if (!signupEmail || !signupPassword || !signupConfirmPassword) return setSignupError("Please fill in all fields")
    if (!acceptedLegal) return
    if (signupPassword !== signupConfirmPassword) return setSignupError("Passwords do not match")
    if (signupPassword.length < 6) return setSignupError("Password must be at least 6 characters")
    markPendingLegalAcceptance()
    setIsSigningUp(true)

    const affiliateCode = getAffiliateCodeForCheckout()
    const claimCtx = parsePokerStakeClaimFromLocation(
      window.location.pathname || '/',
      window.location.search || '',
    )
    const stableClaimCtx = parsePokerStableClaimFromLocation(
      window.location.pathname || '/',
      window.location.search || '',
    )
    const signupFromStakeClaim = Boolean(claimCtx)
    const signupFromStableClaim = Boolean(stableClaimCtx)
    if (claimCtx?.token) stashPokerStakeClaimToken(claimCtx.token)
    if (stableClaimCtx?.token) {
      stashPokerStableClaimToken(stableClaimCtx.token)
      markPokerStableClaimFlowPending()
    }
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        // Stake claim: confirm via Site URL (always allow-listed); token in sessionStorage.
        // Other signups: carry ?ref= on redirect when stamped.
        emailRedirectTo: signupFromStakeClaim
          ? stakeClaimSignupEmailRedirectUrl()
          : signupFromStableClaim
            ? stableClaimSignupEmailRedirectUrl()
            : authRedirectUrlWithAffiliateRef(`${window.location.origin}/`),
        data: affiliateCode ? { affiliate_code: affiliateCode } : undefined,
      },
    })
    if (error) {
      const message = error.message?.toLowerCase() || ''
      if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
        setSignupError("Account already exists. Please log in or use Forgot Password.")
      } else {
        setSignupError(getFriendlyErrorMessage(error))
      }
      setIsSigningUp(false)
      return
    }

    // Supabase can return a user with no identities when the email already exists.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setSignupError("Account already exists. Please log in or use Forgot Password.")
      setIsSigningUp(false)
      return
    }

    setSignupMessage(
      signupFromStakeClaim
        ? '✅ Account created! Confirm your email ... that link will link this stake and open Bankroll.'
        : signupFromStableClaim
          ? '✅ Account created! Confirm your email ... that link will link your backing slice and open Stable Manager with the full terms.'
          : '✅ Account created! Please check your email for the confirmation link.',
    )
    setSignupEmail('')
    setSignupPassword('')
    setSignupConfirmPassword('')
    setAcceptedLegal(false)
    setIsSigningUp(false)
    if (data?.session?.user) {
      void ensureDefaultProfileRow(supabase, data.session.user).then(() =>
        recordLegalAcceptance(supabase, data.session.user.id),
      )
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (isSendingReset) return
    if (!forgotEmail) return setForgotError("Please enter your email")
    setIsSendingReset(true)
    setForgotError('')
    setForgotMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (error) {
      setForgotError(getFriendlyErrorMessage(error))
    } else {
      setForgotMessage("If an account exists for that email, a reset link has been sent.")
      setForgotEmail('')
    }
    setIsSendingReset(false)
  }

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    if (isUpdatingPassword) return
    setResetError('')
    if (newPassword !== confirmPassword) return setResetError("Passwords do not match")
    if (newPassword.length < 6) return setResetError("Password must be at least 6 characters")
    setIsUpdatingPassword(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setResetError("This reset link is invalid or expired. Please request a new one.")
      setIsUpdatingPassword(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setResetError(getFriendlyErrorMessage(error, 'reset'))
    } else {
      setResetMessage("✅ Password updated successfully!")
      setTimeout(() => {
        window.location.href = window.location.origin
      }, 2000)
    }
    setIsUpdatingPassword(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const handleDeleteAccount = useCallback(async () => {
    if (
      !window.confirm(
        'Permanently delete this account? All data tied to it in this project (profile, Lounge posts, offers subscriptions, Auth flags, etc.) will be removed. This cannot be undone.'
      )
    )
      return
    setDeleteAccountBusy(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const userId = session?.user?.id ?? null

      const { data, error, response } = await supabase.functions.invoke('delete-own-account', {
        method: 'POST',
        body: {},
      })
      if (error) {
        let detail = typeof error.message === 'string' ? error.message.trim() : ''
        if (response) {
          try {
            const body = await response.clone().json()
            if (body && typeof body === 'object' && body.error) {
              detail = String(body.error).trim()
            }
          } catch {
            /* ignore */
          }
        }
        throw new Error(detail || 'Could not delete account.')
      }
      if (data && typeof data === 'object' && data.error) {
        throw new Error(String(data.error))
      }

      clearAccountClientState(userId)
      await supabase.auth.signOut()
      window.location.href = `${window.location.origin}/`
    } catch (e) {
      const fallback =
        'Could not delete account. Deploy the delete-own-account Edge Function (see supabase/functions/delete-own-account/README.md).'
      const msg = typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : fallback
      window.alert(msg)
    } finally {
      setDeleteAccountBusy(false)
    }
  }, [])

  const switchAuthTab = useCallback(
    (nextTab) => {
      setAuthTab(nextTab)
      setShowForgotPassword(false)
      setLoginError('')
      setSignupError('')
      setSignupMessage('')
      if (nextTab === 'join') {
        setSignupEmail((prev) => (prev.trim() ? prev : email.trim()))
      } else {
        setEmail((prev) => (prev.trim() ? prev : signupEmail.trim()))
      }
    },
    [email, signupEmail],
  )

  const openAuthPanel = (mode = 'create') => {
    setAuthTab(mode === 'login' ? 'signin' : 'join')
    setShowForgotPassword(false)
    setLoginError('')
    setSignupError('')
    setSignupMessage('')
    setAuthPanelOpen(true)
  }

  const closeAuthPanel = useCallback(() => {
    setAuthPanelOpen(false)
    setLoginError('')
    setSignupError('')
    setSignupMessage('')
    setVerificationSuccess(false)
  }, [])

  const openLegalDocument = useCallback(
    (slug, source = 'auth') => {
      if (slug !== 'terms' && slug !== 'privacy' && slug !== 'guidelines') return
      /** @type {import('./features/legal/legalDocumentNavigation.js').LegalReturnContext} */
      const ctx = { source }
      if (source === 'auth') {
        ctx.authTab = authTab === 'signin' ? 'signin' : 'join'
        setAuthPanelOpen(false)
      }
      markLegalReturnContext(ctx)
      setCurrentView(slug)
      window.history.pushState({ lvLegalReturn: true, slug, source }, '', `/${slug}?from=${source}`)
    },
    [authTab],
  )

  const applyLegalReturnUi = useCallback((ctx) => {
    if (!ctx) return
    if (ctx.source === 'auth') {
      setAuthTab(ctx.authTab === 'signin' ? 'signin' : 'join')
      setAuthPanelOpen(true)
      return
    }
    applyLegalReturnReopen(ctx)
  }, [])

  const finishLegalReturn = useCallback(
    (ctx) => {
      if (!ctx) return
      clearLegalReturnContext()
      applyLegalReturnUi(ctx)
      setCurrentView('app')
      if (typeof window === 'undefined') return
      if (window.history.state?.lvLegalReturn) {
        legalExitViaPopRef.current = true
        window.history.back()
        return
      }
      window.history.replaceState({}, document.title, '/')
    },
    [applyLegalReturnUi],
  )

  const exitLegalDocument = useCallback(() => {
    const slug = currentView
    if (slug === 'terms' || slug === 'privacy' || slug === 'guidelines') {
      const ctx = resolveLegalReturnContext(slug)
      if (ctx) {
        finishLegalReturn(ctx)
        return
      }
    }
    if (typeof window !== 'undefined') {
      // Direct / external visit (e.g. Google → /privacy): no return context — go to app, not history.back() (would leave the site).
      setCurrentView('app')
      window.history.replaceState({}, document.title, '/')
      return
    }
    setCurrentView('app')
  }, [currentView, finishLegalReturn])

  useEffect(() => {
    const onPopState = () => {
      if (legalExitViaPopRef.current) {
        legalExitViaPopRef.current = false
        setCurrentView('app')
        return
      }
      const slug = parseLegalPathname(window.location.pathname)
      if (slug) {
        setCurrentView(slug)
        return
      }
      if (parseMonitorPathname(window.location.pathname)) {
        setCurrentView('monitor')
        return
      }
      if (
        parsePokerSwapClaimFromLocation(
          window.location.pathname || '/',
          window.location.search || '',
        )
      ) {
        setCurrentView('poker-swap-claim')
        return
      }
      if (
        parsePokerStakeClaimFromLocation(
          window.location.pathname || '/',
          window.location.search || '',
        )
      ) {
        setCurrentView('poker-stake-claim')
        return
      }
      if (
        parsePokerStableClaimFromLocation(
          window.location.pathname || '/',
          window.location.search || '',
        )
      ) {
        setCurrentView('poker-stable-claim')
        return
      }
      setCurrentView('app')
      const ctx = readLegalReturnContext()
      if (ctx) finishLegalReturn(ctx)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [finishLegalReturn])

  useEffect(() => {
    if (!authPanelOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeAuthPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [authPanelOpen, closeAuthPanel])

  useEffect(() => {
    if (!authPanelOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [authPanelOpen])

  const authModalPanel = (
    <AuthModalPanel
      authTab={authTab}
      onAuthTabChange={switchAuthTab}
      showForgotPassword={showForgotPassword}
      onOpenForgotPassword={() => {
        setShowForgotPassword(true)
        setForgotError('')
        setForgotMessage('')
        const addr = email.trim() || signupEmail.trim()
        if (addr && !forgotEmail.trim()) setForgotEmail(addr)
      }}
      onCloseForgotPassword={() => {
        setShowForgotPassword(false)
        setForgotError('')
        setForgotMessage('')
        switchAuthTab('signin')
      }}
      verificationSuccess={verificationSuccess}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      loginError={loginError}
      isLoggingIn={isLoggingIn}
      onLoginSubmit={handleLogin}
      signupEmail={signupEmail}
      onSignupEmailChange={setSignupEmail}
      signupPassword={signupPassword}
      onSignupPasswordChange={setSignupPassword}
      signupConfirmPassword={signupConfirmPassword}
      onSignupConfirmPasswordChange={setSignupConfirmPassword}
      signupError={signupError}
      signupMessage={signupMessage}
      isSigningUp={isSigningUp}
      onSignUpSubmit={handleSignUp}
      forgotEmail={forgotEmail}
      onForgotEmailChange={setForgotEmail}
      forgotError={forgotError}
      forgotMessage={forgotMessage}
      isSendingReset={isSendingReset}
      onForgotSubmit={handleForgotPassword}
      isOAuthLoading={isOAuthLoading}
      acceptedLegal={acceptedLegal}
      onAcceptedLegalChange={setAcceptedLegal}
      onOpenLegalDocument={(slug) => openLegalDocument(slug, 'auth')}
      onGoogleSignIn={({ setErrorTarget }) => {
        const setError =
          setErrorTarget === 'forgot'
            ? setForgotError
            : setErrorTarget === 'join'
              ? setSignupError
              : setLoginError
        setError('')
        void handleOAuthSignIn('google', {
          setError,
          markLegalPending: authTab === 'join' && acceptedLegal,
        })
      }}
    />
  )

  const renderAuthModal = (cancelLabel) =>
    authPanelOpen ? (
      <AuthModalShell onClose={closeAuthPanel} cancelLabel={cancelLabel}>
        {authModalPanel}
      </AuthModalShell>
    ) : null

  if (isChecking && !shouldShowLoungeColdBootSplash({
    tab: 'home',
    pendingWork: readLoungeComposerDraftPendingWork(),
  }) && currentView === 'app') {
    return <div className={`${mobileShell} text-zinc-50`}>Loading...</div>
  }

  if (currentView === 'terms' || currentView === 'privacy' || currentView === 'guidelines') {
    return (
      <LegalDocumentScreen
        slug={currentView}
        onBack={exitLegalDocument}
        onGotIt={exitLegalDocument}
      />
    )
  }

  if (currentView === 'poker-swap-claim') {
    const claim =
      typeof window !== 'undefined'
        ? parsePokerSwapClaimFromLocation(
            window.location.pathname || '/',
            window.location.search || '',
          )
        : null
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">
            Loading…
          </div>
        }
      >
        <PokerTournamentSwapClaimPage
          supabaseClient={supabase}
          token={claim?.token || ''}
        />
      </Suspense>
    )
  }

  if (currentView === 'poker-stake-claim') {
    const claim =
      typeof window !== 'undefined'
        ? parsePokerStakeClaimFromLocation(
            window.location.pathname || '/',
            window.location.search || '',
          )
        : null
    return (
      <>
        <Suspense
          fallback={
            <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">
              Loading…
            </div>
          }
        >
          <PokerStableStakeClaimPage
            supabaseClient={supabase}
            token={claim?.token || ''}
            userId={user?.id ?? null}
            onOpenAuth={() => openAuthPanel('create')}
            onDone={(redirect) => {
              navigateAfterStakeClaim(redirect)
            }}
          />
        </Suspense>
        {renderAuthModal('← Cancel')}
      </>
    )
  }

  if (currentView === 'poker-stable-claim') {
    const claim =
      typeof window !== 'undefined'
        ? parsePokerStableClaimFromLocation(
            window.location.pathname || '/',
            window.location.search || '',
          )
        : null
    return (
      <>
        <Suspense
          fallback={
            <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">
              Loading…
            </div>
          }
        >
          <PokerStableBackerClaimPage
            supabaseClient={supabase}
            token={claim?.token || ''}
            userId={user?.id ?? null}
            onOpenAuth={() => openAuthPanel('create')}
            onDone={(payload) => {
              navigateAfterStableClaim(payload?.redirect, {
                dealId: payload?.dealId,
                sliceId: payload?.sliceId,
              })
            }}
          />
        </Suspense>
        {renderAuthModal('← Cancel')}
      </>
    )
  }

  if (currentView === 'monitor') {
    return (
      <>
        <Suspense
          fallback={
            <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center">Loading…</div>
          }
        >
          <EdgeMonitorDesktopPage
            supabaseClient={supabase}
            isAdmin={isAdminRole}
            isChecking={isChecking}
            userEmail={user?.email || ''}
            onOpenAuth={() => openAuthPanel('login')}
            onOpenApp={() => {
              setCurrentView('app')
              window.history.replaceState({}, document.title, '/')
            }}
          />
        </Suspense>
        {renderAuthModal('← Cancel')}
      </>
    )
  }

  // Reset Password Page
  if (currentView === 'reset-password') {
    return (
      <div className={mobileShell}>
        <div className="bg-gray-900 p-6 sm:p-8 rounded-3xl max-w-sm w-full" data-auth-modal>
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Reset Your Password</h2>

          {resetError && <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-2xl text-red-300 text-sm text-center">{resetError}</div>}

          {resetMessage ? (
            <div className="text-center py-8 text-emerald-400 text-base font-medium leading-relaxed">{resetMessage}</div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="next"
                required
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="go"
                required
              />
              <button type="submit" disabled={isUpdatingPassword} className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}>
                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          <button onClick={() => { window.location.href = window.location.origin }} className={`${linkBtn} text-sm sm:text-base mt-4`}>← Back to Login</button>
        </div>
      </div>
    )
  }

  const hasSlotsEdgeAccess =
    isStaffRole ||
    hasSlotsEdgeFromRpc ||
    hasActiveSubscriptionFromProfile ||
    String(import.meta.env.VITE_HAS_ACTIVE_SUBSCRIPTION || '').toLowerCase() === 'true'

  const hasSlotsEdgeStarterAccess = isStaffRole || hasSlotsEdgeStarterFromRpc
  const hasSlotsEdgeLifetimeAccess = isStaffRole || hasSlotsEdgeLifetimeFromRpc
  const hasSlotsEdgeProAccess = isStaffRole || hasSlotsEdgeProFromRpc

  // App shell (Lounge and tabs); sign-in / create-account open as a modal on top
  if (currentView === 'app') {
    return (
      <>
        <AppShell
          browseMode={user ? 'member' : 'anonymous'}
          authSessionReady={!isChecking}
          hasActiveSubscription={hasSlotsEdgeAccess}
          hasSlotsEdgeStarter={hasSlotsEdgeStarterAccess}
          isStaff={isStaffRole}
          isAdmin={isAdminRole}
          contentAccessGatesMap={contentAccessGatesMap}
          contentAccessGatesDbReady={contentAccessGatesDbReady}
          onSetContentAccessGate={setContentAccessGate}
          onOpenAuth={openAuthPanel}
          onRequireSubscribe={openSubscribeModal}
          onOpenBillingManage={openBillingManageModal}
          hasSlotsEdgePro={hasSlotsEdgeProAccess}
          hasSlotsEdgeLifetime={hasSlotsEdgeLifetimeAccess}
          accessNotice={accessNotice}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          deleteAccountBusy={deleteAccountBusy}
          supabaseClient={supabase}
          onRequireAuth={(mode) => openAuthPanel(mode === 'login' ? 'login' : 'create')}
          onOpenLegalDocument={openLegalDocument}
        />
        <SubscribeModal
          key={subscribeModal.openKey}
          open={subscribeModal.open}
          initialProductSlug={subscribeModal.productSlug}
          onClose={closeSubscribeModal}
          supabaseClient={supabase}
          onCheckoutStarted={handleCheckoutStarted}
          hasSlotsEdgePro={hasSlotsEdgeProFromRpc}
          hasSlotsEdgeLifetime={hasSlotsEdgeLifetimeFromRpc}
          hasSlotsEdgeStarter={hasSlotsEdgeStarterFromRpc}
          starterPriceInterval={starterPriceInterval}
          fullPriceInterval={fullPriceInterval}
        />
        <BillingManageModal
          open={billingManageOpen}
          onClose={closeBillingManageModal}
          supabaseClient={supabase}
          onCheckoutStarted={handleCheckoutStarted}
          onRefreshEntitlements={refreshEntitlements}
          onOpenSubscribe={openSubscribeModal}
          hasSlotsEdgeStarter={hasSlotsEdgeStarterFromRpc}
          hasSlotsEdgePro={hasSlotsEdgeProFromRpc}
          hasSlotsEdgeLifetime={hasSlotsEdgeLifetimeFromRpc}
          starterPriceInterval={starterPriceInterval}
          fullPriceInterval={fullPriceInterval}
          entitlements={entitlements}
        />
        <StarterWeeklyDropScratchModal
          open={starterDropModal.open}
          unlockId={starterDropModal.unlockId}
          onClose={() => setStarterDropModal({ open: false, unlockId: '' })}
          onRequireSubscribe={openSubscribeModal}
          supabaseClient={supabase}
          guideAccessContext={{
            isStaff: isStaffRole,
            hasSlotsEdge: hasSlotsEdgeProAccess,
            hasSlotsEdgeStarter: hasSlotsEdgeStarterAccess,
            starterUnlockedGuideSlugs: starterWeeklyDropGuideSlugs,
            starterWeeklyDropPoolExhausted: starterWeeklyDropPoolExhausted,
            gatesMap: contentAccessGatesMap,
          }}
        />
        {legalAcceptancePending && user ? (
          <LegalAcceptanceModal
            busy={legalAcceptanceBusy}
            error={legalAcceptanceError}
            onAccept={() => void handleLegalAcceptance()}
            onOpenLegalDocument={openLegalDocument}
          />
        ) : null}
        {renderAuthModal('← Continue without signing in')}
      </>
    )
  }

  return null
}

export default App

