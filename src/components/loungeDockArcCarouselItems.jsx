/** Dock-style glyphs for the arc carousel prototype (mirrors `LoungeDockFooterBar` strokes). */

/** Matches dock electric blue (`loungeDockFabGlow` / center FAB). */
const LOUNGE_DOCK_CYAN = '#06cefc'

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
}

const accentStroke = {
  stroke: 'currentColor',
  strokeWidth: 1.85,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
}

function IconHome() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
      <path {...stroke} d="M4.5 10.25 12 4l7.5 6.25V19a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5h-4v4.5a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75v-8.75z" />
      <path {...accentStroke} d="M4.5 10.25 12 4 19.5 10.25" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
      <circle {...stroke} cx="10.25" cy="10.25" r="6.25" />
      <path {...stroke} d="M15.5 15.5 21 21" />
    </svg>
  )
}

function IconFollowing({ active }) {
  if (active) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
        <circle cx="9" cy="7.5" r="3.25" fill={LOUNGE_DOCK_CYAN} stroke="none" />
        <path
          fill={LOUNGE_DOCK_CYAN}
          stroke="none"
          d="M3.5 19.5c0-3.1 2.46-5.25 5.5-5.25s5.5 2.15 5.5 5.25"
        />
        <path
          stroke={LOUNGE_DOCK_CYAN}
          strokeWidth="1.85"
          strokeLinecap="round"
          d="M16.5 14.5h4M18.5 12.5v4"
        />
      </svg>
    )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
      <circle {...stroke} cx="9" cy="7.5" r="3.25" />
      <path
        {...stroke}
        d="M3.5 19.5c0-3.1 2.46-5.25 5.5-5.25s5.5 2.15 5.5 5.25"
      />
      <path {...stroke} strokeLinecap="round" d="M16.5 14.5h4M18.5 12.5v4" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
      <g transform="translate(-2 0.1)">
        <path
          {...stroke}
          d="M10.5 6.75a3.75 3.75 0 017.5 0v.75c0 4.25 1.75 6.5 1.75 6.5H8.75S10.5 12.75 10.5 8.5v-.75z"
        />
        <circle cx="12" cy="19.25" r="1.35" className="fill-current" stroke="none" />
      </g>
    </svg>
  )
}

/** Pen-in-square “new post” (open corner + diagonal pen). */
function IconCompose() {
  const penStroke = { ...stroke, strokeWidth: 1.75 }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
      <path
        {...penStroke}
        d="M12 4.25H6.5a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6.75"
      />
      <g transform="translate(0 -4.5)">
        <path
          {...penStroke}
          d="M17.9 4.9l2.45 2.45a.95.95 0 0 1 0 1.35l-8.1 8.1-4 1.35 1.35-4 8.1-8.1Z"
        />
      </g>
    </svg>
  )
}

function IconChat() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
      <g transform="translate(0.35 0.15)">
        <path
          {...stroke}
          d="M6.75 5.25h10.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25h-5.03l-3.72 2.48V15.75H6.75a2.25 2.25 0 01-2.25-2.25v-6a2.25 2.25 0 012.25-2.25z"
        />
        <circle cx="9" cy="10.5" r="1.05" className="fill-current" stroke="none" />
        <circle cx="12" cy="10.5" r="1.05" className="fill-current" stroke="none" />
        <circle cx="15" cy="10.5" r="1.05" className="fill-current" stroke="none" />
      </g>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="block h-full w-full">
      <path
        {...stroke}
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
      />
      <path
        {...stroke}
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
      />
    </svg>
  )
}

export function buildLoungeDockArcCarouselItems({
  onCompose,
  composeActive = false,
  composeDisabled = false,
  onHome,
  onSearch,
  onFollowingFilterToggle,
  followingFilterOn,
  followingFilterDisabled,
  onNotifications,
  onChat,
  onSettings,
  activePanel,
  notificationsUnreadCount = 0,
  chatUnreadCount = 0,
  /** True when Lounge feed is the visible tab with no dock panel open (home icon "lit" in full wheel). */
  feedHomeActive = true,
}) {
  const home = {
    id: 'home',
    label: 'Home',
    icon: <IconHome />,
    onSelect: onHome,
    active: feedHomeActive,
  }
  const compose = {
    id: 'compose',
    label: 'New post',
    icon: <IconCompose />,
    onSelect: onCompose,
    active: composeActive,
    disabled: composeDisabled,
  }
  const following = {
    id: 'following',
    label: 'Following',
    icon: <IconFollowing active={followingFilterOn} />,
    onSelect: onFollowingFilterToggle,
    filterOnBorder: followingFilterOn,
    disabled: followingFilterDisabled,
  }
  const settings = {
    id: 'settings',
    label: 'Settings',
    icon: <IconSettings />,
    iconScale: 0.86,
    onSelect: onSettings,
    active: activePanel === 'settings',
  }
  const search = {
    id: 'search',
    label: 'Search',
    icon: <IconSearch />,
    onSelect: onSearch,
    active: activePanel === 'search',
  }
  const chat = {
    id: 'chat',
    label: 'Chat',
    icon: <IconChat />,
    iconScale: 1.14,
    onSelect: onChat,
    active: activePanel === 'chat',
    badgeCount: chatUnreadCount,
  }
  const notifications = {
    id: 'notifications',
    label: 'Alerts',
    icon: <IconBell />,
    iconScale: 1.2,
    onSelect: onNotifications,
    active: activePanel === 'notifications',
    badgeCount: notificationsUnreadCount,
  }

  /**
   * Wheel (O) and Edge (L) use different source orderings; `LoungeDockArcCarouselPrototype` picks by `menuLayout`.
   * Wheel: home at anchor; compose→…→notifications on the ring.
   * Edge L (`loungeDockLShapeOffsets`): up **home → compose → following**; along bottom (search under +) **search → notifications → chat → settings**.
   */
  return {
    wheelItems: [home, compose, following, settings, search, chat, notifications],
    cornerLItems: [home, compose, following, search, notifications, chat, settings],
  }
}
