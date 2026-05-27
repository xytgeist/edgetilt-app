// Mobile-first: min 16px text (iOS won’t auto-zoom), ~48px min tap height, notched device padding
export const mobileShell =
  'min-h-dvh bg-zinc-950 flex items-center justify-center overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]'
export const inputBase =
  'w-full min-h-12 text-base text-zinc-100 bg-zinc-800 rounded-2xl border-0 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 touch-manipulation'
export const btnPrimary =
  'w-full min-h-12 text-base font-bold touch-manipulation active:scale-[0.99] transition-transform'
export const btnSecondary =
  'w-full min-h-12 text-base font-bold touch-manipulation active:scale-[0.99] transition-transform'
export const linkBtn =
  'w-full min-h-12 text-base text-zinc-400 hover:text-zinc-100 touch-manipulation py-3 text-center flex items-center justify-center active:scale-[0.99]'
