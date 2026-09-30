import RetryingImg from './RetryingImg.jsx'

const DARK_SRC = '/edge-lounge-logo-transparent.png'
const LIGHT_SRC = '/edge-lounge-logo-light.png'

/** EDGE wordmark: dark + light PNGs, `html.light` picks which shows (`edge-logo--dark` / `edge-logo--light`). */
export default function EdgeLogoMarks({ className = '', alt = '' }) {
  return (
    <>
      <RetryingImg src={DARK_SRC} alt={alt} className={`edge-logo--dark ${className}`} draggable={false} />
      <RetryingImg src={LIGHT_SRC} alt={alt} className={`edge-logo--light ${className}`} draggable={false} />
    </>
  )
}
