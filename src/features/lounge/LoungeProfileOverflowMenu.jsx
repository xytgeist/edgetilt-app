import { Ban, Share, Volume2, VolumeX } from 'lucide-react'

const MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium touch-manipulation hover:bg-zinc-800 disabled:opacity-50'
const MENU_ICON_CLASS = 'h-[18px] w-[18px] shrink-0 text-zinc-300'

/**
 * @param {{
 *   onShare?: () => void,
 *   onToggleMute?: () => void,
 *   isFeedMuted?: boolean,
 *   muteBusy?: boolean,
 *   onToggleBlock?: () => void,
 *   blockBusy?: boolean,
 *   iBlockingThem?: boolean,
 *   profileHandle?: string,
 *   canAdminPromoteModerator?: boolean,
 *   canAdminDemoteModerator?: boolean,
 *   adminRoleBusy?: boolean,
 *   onAdminPromote?: () => void,
 *   onAdminDemote?: () => void,
 * }} props
 */
export default function LoungeProfileOverflowMenu({
  onShare,
  onToggleMute,
  isFeedMuted = false,
  muteBusy = false,
  onToggleBlock,
  blockBusy = false,
  iBlockingThem = false,
  profileHandle = '',
  canAdminPromoteModerator = false,
  canAdminDemoteModerator = false,
  adminRoleBusy = false,
  onAdminPromote,
  onAdminDemote,
}) {
  const handleAt = profileHandle ? `@${String(profileHandle).replace(/^@/, '')}` : 'this member'

  return (
    <>
      {typeof onShare === 'function' ? (
        <button type="button" role="menuitem" className={`${MENU_ITEM_CLASS} text-zinc-100`} onClick={onShare}>
          <Share className={MENU_ICON_CLASS} strokeWidth={1.75} aria-hidden />
          Share profile
        </button>
      ) : null}
      {canAdminPromoteModerator ? (
        <button
          type="button"
          role="menuitem"
          disabled={adminRoleBusy}
          className={`${MENU_ITEM_CLASS} text-fuchsia-200`}
          onClick={onAdminPromote}
        >
          Promote to moderator
        </button>
      ) : null}
      {canAdminDemoteModerator ? (
        <button
          type="button"
          role="menuitem"
          disabled={adminRoleBusy}
          className={`${MENU_ITEM_CLASS} text-fuchsia-200`}
          onClick={onAdminDemote}
        >
          Remove moderator role
        </button>
      ) : null}
      {typeof onToggleMute === 'function' ? (
        <button
          type="button"
          role="menuitem"
          disabled={muteBusy}
          className={`${MENU_ITEM_CLASS} text-zinc-100`}
          onClick={onToggleMute}
        >
          {isFeedMuted ? (
            <Volume2 className={MENU_ICON_CLASS} strokeWidth={1.75} aria-hidden />
          ) : (
            <VolumeX className={MENU_ICON_CLASS} strokeWidth={1.75} aria-hidden />
          )}
          {isFeedMuted ? 'Unmute posts' : 'Mute posts'}
        </button>
      ) : null}
      {typeof onToggleBlock === 'function' ? (
        <button
          type="button"
          role="menuitem"
          disabled={blockBusy}
          className={`${MENU_ITEM_CLASS} ${iBlockingThem ? 'text-red-200' : 'text-zinc-100'}`}
          onClick={onToggleBlock}
        >
          <Ban className={`${MENU_ICON_CLASS} ${iBlockingThem ? 'text-red-300' : ''}`} strokeWidth={1.75} aria-hidden />
          {iBlockingThem ? `Unblock ${handleAt}` : `Block ${handleAt}`}
        </button>
      ) : null}
    </>
  )
}
