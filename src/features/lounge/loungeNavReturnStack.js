/**
 * Return stack for Lounge caption navigation (@handle / #hashtag / in-app links).
 * Frames are pushed before opening profile or search; popped on dismiss.
 */

/** @typedef {'feed' | 'profile' | 'postDetail' | 'search' | 'dock'} LoungeNavReturnKind */

/**
 * @typedef {object} LoungeNavFeedFrame
 * @property {'feed'} kind
 * @property {number} scrollTop
 */

/**
 * @typedef {object} LoungeNavProfileFrame
 * @property {'profile'} kind
 * @property {string} userId
 * @property {string} tab
 * @property {number} scrollTop
 * @property {object} [profileStub]
 */

/**
 * @typedef {object} LoungeNavPostDetailFrame
 * @property {'postDetail'} kind
 * @property {object} post
 * @property {string[]} commentPathIds
 * @property {number} scrollTop
 * @property {boolean} aboveProfile
 */

/**
 * @typedef {object} LoungeNavSearchFrame
 * @property {'search'} kind
 * @property {string} query
 * @property {number} scrollTop
 */

/**
 * @typedef {object} LoungeNavDockFrame
 * @property {'dock'} kind
 * @property {'notifications' | 'settings' | 'chat' | 'search'} panel
 * @property {number} scrollTop
 * @property {string} [searchQuery]
 */

/** @typedef {LoungeNavFeedFrame | LoungeNavProfileFrame | LoungeNavPostDetailFrame | LoungeNavSearchFrame | LoungeNavDockFrame} LoungeNavReturnFrame */

/** @returns {LoungeNavReturnFrame[]} */
export function createLoungeNavReturnStack() {
  return []
}

/** @param {LoungeNavReturnFrame[]} stack @param {LoungeNavReturnFrame} frame */
export function pushLoungeNavReturnFrame(stack, frame) {
  stack.push(frame)
}

/** @param {LoungeNavReturnFrame[]} stack @returns {LoungeNavReturnFrame | null} */
export function popLoungeNavReturnFrame(stack) {
  return stack.length > 0 ? stack.pop() : null
}
