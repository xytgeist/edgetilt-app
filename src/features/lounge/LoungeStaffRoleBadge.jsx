/**

 * Staff icons from `profiles.role` (Lounge; public profile read).

 * @param {{ role?: string | null, size?: 'feed' | 'detail' | 'modal' }} props

 */

function CrownIcon({ className }) {

  return (

    <svg

      xmlns="http://www.w3.org/2000/svg"

      viewBox="0 0 24 24"

      fill="currentColor"

      className={className}

      aria-hidden

    >

      <g transform="translate(12,12) scale(1.45, 1.5) translate(-12,-12)">

        <path d="M6 17L5 9l3 2L12 4l4 7l3-2L18 17H6z" />

      </g>

    </svg>

  )

}



function ShieldIcon({ className }) {

  return (

    <svg

      xmlns="http://www.w3.org/2000/svg"

      viewBox="0 0 24 24"

      fill="currentColor"

      className={className}

      aria-hidden

    >

      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />

    </svg>

  )

}



export default function LoungeStaffRoleBadge({ role, size = 'feed' }) {

  const r = String(role || '').toLowerCase()

  if (r !== 'admin' && r !== 'moderator') return null



  const shieldClass =

    size === 'detail' || size === 'modal' ? 'h-4 w-4' : 'h-[16px] w-[16px]'



  const crownClass =

    size === 'detail' || size === 'modal' ? 'h-4 w-4' : 'h-[18px] w-[18px]'



  if (r === 'admin') {

    return (

      <span

        className="inline-flex shrink-0 translate-y-[0.5px] items-center gap-x-0.5"

        title="Administrator"

        role="img"

        aria-label="Administrator"

      >

        <CrownIcon className={`${crownClass} text-amber-400`} />

        <ShieldIcon className={`${shieldClass} text-blue-500`} />

      </span>

    )

  }



  return (

    <span

      className="inline-flex shrink-0 translate-y-[0.5px] items-center justify-center"

      title="Moderator"

      role="img"

      aria-label="Moderator"

    >

      <ShieldIcon className={`${shieldClass} text-blue-500`} />

    </span>

  )

}


