import { useRef, useState } from 'react'

const CATEGORIES = [
  {
    id: 'recent',
    icon: '🕐',
    label: 'Recent',
    emojis: [], // populated at runtime from localStorage
  },
  {
    id: 'smileys',
    icon: '😀',
    label: 'Smileys',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇',
      '🥰','😍','🤩','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑',
      '🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬',
      '🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵',
      '🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️',
      '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱',
      '😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿',
    ],
  },
  {
    id: 'gestures',
    icon: '👍',
    label: 'Gestures',
    emojis: [
      '👍','👎','👏','🙌','🤝','✊','👊','🤜','🤛','🤞','✌️','🤟','🤘',
      '👌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','🤙','💪',
      '🦾','🙏','👋','🤚','🫶','🫂','💅','🤳',
    ],
  },
  {
    id: 'hearts',
    icon: '❤️',
    label: 'Hearts',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞',
      '💓','💗','💖','💘','💝','💟','❤️‍🔥','❤️‍🩹','🫀','💯','💢','💥',
      '💫','💦','✨','🎉','🎊','🥳','🎈',
    ],
  },
  {
    id: 'nature',
    icon: '🌿',
    label: 'Nature',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷',
      '🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🦆','🦅','🦉','🦇',
      '🐺','🐴','🦄','🐝','🦋','🌱','🌿','☘️','🍀','🌺','🌸','🌼','🌻',
      '🌞','🌝','🌈','⚡','❄️','🔥','💧','🌊','🌙','⭐','🌟',
    ],
  },
  {
    id: 'food',
    icon: '🍕',
    label: 'Food',
    emojis: [
      '🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥝','🍅','🍆',
      '🥑','🥦','🌽','🍄','🍞','🥐','🥨','🧀','🥚','🍳','🥞','🧇','🥓',
      '🍕','🍔','🌮','🌯','🥪','🍜','🍣','🍱','🍦','🎂','🍰','🧁','🍭',
      '🍫','🍿','☕','🧃','🥤','🍺','🥂','🍷','🧋',
    ],
  },
  {
    id: 'activities',
    icon: '⚽',
    label: 'Sports',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🥍',
      '🏒','🏏','⛳','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🎮','🕹️','🎲',
      '🧩','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🏆',
      '🥇','🥈','🥉','🎖️','🏅',
    ],
  },
  {
    id: 'objects',
    icon: '💡',
    label: 'Objects',
    emojis: [
      '📱','💻','🖥️','📺','📷','📸','📹','🎥','📞','☎️','📡','🔋','🔌',
      '💡','🔦','🕯️','💰','💵','💳','💹','📈','📉','📊','📋','🔒','🔓',
      '🔑','🗝️','🔨','⚒️','🔧','🔩','⚙️','🧲','🔬','🔭','💊','🩺','🩹',
      '🚗','✈️','🚀','⛵','🏠','🏰','🗼','⛪','🌐','🗺️','🧭',
    ],
  },
]

const RECENT_KEY = 'chatEmojiRecent:v1'
const RECENT_MAX = 24

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveRecentEmoji(emoji) {
  const list = loadRecent().filter((e) => e !== emoji)
  list.unshift(emoji)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
}

/**
 * @param {{ onSelect: (emoji: string) => void, onClose: () => void }} props
 */
export default function ChatEmojiPicker({ onSelect, onClose, zIndex = 115 }) {
  const recent = loadRecent()
  const categories = recent.length
    ? [{ ...CATEGORIES[0], emojis: recent }, ...CATEGORIES.slice(1)]
    : CATEGORIES.slice(1)

  const [activeId, setActiveId] = useState(categories[0].id)
  const [search, setSearch] = useState('')
  const gridRef = useRef(null)

  const allEmojis = CATEGORIES.slice(1).flatMap((c) => c.emojis)
  const searchResults = search.trim()
    ? allEmojis.filter((e) => {
        // very lightweight: match by codepoint description isn't available here,
        // so just check if the emoji IS in the search string (copy-paste match)
        return e.includes(search)
      })
    : null

  const visibleCategories = searchResults
    ? [{ id: 'search', icon: '🔍', label: 'Results', emojis: searchResults }]
    : categories

  const handleSelect = (emoji) => {
    saveRecentEmoji(emoji)
    onSelect(emoji)
  }

  const scrollToCategory = (id) => {
    setActiveId(id)
    setSearch('')
    const el = gridRef.current?.querySelector(`[data-cat="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 flex flex-col justify-end bg-black/40"
      style={{ zIndex }}
      onClick={onClose}
    >
      {/* Sheet - max height leaves room for the status bar; bottom padding
          covers the iOS home indicator so the emoji grid isn't cut off. */}
      <div
        className="chat-sheet-glass flex flex-col rounded-t-2xl shadow-2xl"
        style={{
          height: 'min(60dvh, calc(100dvh - env(safe-area-inset-top) - 3rem))',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <input
            type="text"
            placeholder="Search emoji…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 px-3 py-2 text-[14px] text-zinc-100 placeholder-zinc-500 outline-none"
          />
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="flex gap-0.5 overflow-x-auto px-2 pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xl transition-colors ${
                  activeId === cat.id ? 'bg-zinc-700' : 'hover:bg-zinc-800/70'
                }`}
                title={cat.label}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Emoji grid */}
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto overscroll-y-contain px-2 pb-4"
          onScroll={(e) => {
            if (search) return
            // update active category based on scroll position
            const container = e.currentTarget
            for (const cat of [...categories].reverse()) {
              const el = container.querySelector(`[data-cat="${cat.id}"]`)
              if (el && el.getBoundingClientRect().top <= container.getBoundingClientRect().top + 40) {
                setActiveId(cat.id)
                break
              }
            }
          }}
        >
          {visibleCategories.map((cat) => (
            <div key={cat.id} data-cat={cat.id}>
              {cat.id !== 'search' && (
                <div className="sticky top-0 z-10 bg-zinc-950 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {cat.label}
                </div>
              )}
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="flex h-10 w-full items-center justify-center rounded-lg text-2xl touch-manipulation transition-colors active:bg-zinc-700 hover:bg-zinc-800"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {searchResults?.length === 0 && (
            <div className="py-10 text-center text-zinc-500">No emoji found</div>
          )}
        </div>
      </div>
    </div>
  )
}
