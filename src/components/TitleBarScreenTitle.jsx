import { TITLE_BAR_SCREEN_TITLE_CLASS } from '../features/shell/titleBarLayout.js'

/**
 * Screen name in the fixed title bar (replaces EDGE wordmark).
 * Same type as landscape Slots/Poker tools chrome and Chat.
 */
export default function TitleBarScreenTitle({ children }) {
  return (
    <h1 data-slots-landscape-title className={TITLE_BAR_SCREEN_TITLE_CLASS}>
      {children}
    </h1>
  )
}
