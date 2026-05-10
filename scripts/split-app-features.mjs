import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const appPath = path.join(root, 'src', 'App.jsx')
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/)

/** 1-based line numbers from editor */
function sliceLines(start1, end1) {
  return lines.slice(start1 - 1, end1).join('\n')
}

function dedentTwoSpaces(s) {
  return s
    .split('\n')
    .map((ln) => (ln.startsWith('  ') ? ln.slice(2) : ln))
    .join('\n')
}

// --- Bankroll: lines 323-426
const bankrollRaw = sliceLines(323, 426)
const bankrollBody = dedentTwoSpaces(
  bankrollRaw.replace(/^  const BankrollTracker = \(\) => \{\n/, '').replace(/\n  \}$/, '\n')
)
const bankrollFile = `'use client'\n\nimport { useState } from 'react'\n\nexport default function BankrollTracker() {\n${bankrollBody}}\n`
fs.mkdirSync(path.join(root, 'src', 'features', 'bankroll'), { recursive: true })
fs.writeFileSync(path.join(root, 'src', 'features', 'bankroll', 'BankrollTracker.jsx'), bankrollFile, 'utf8')

// --- LocalIntel: 428-873 → own state for intelView
const intelRaw = sliceLines(428, 873)
let intelInner = dedentTwoSpaces(
  intelRaw.replace(/^  const LocalIntel = \(\) => \{\n/, '').replace(/\n  \}$/, '\n')
)
intelInner = `const [intelView, setIntelView] = useState({ screen: 'home', cityId: null, casinoId: null })\n\n${intelInner}`
intelInner = intelInner.replace(
  '}, [])',
  '}, [supabaseClient])',
  1 // first occurrence is loadFollows
)
const intelFile = `'use client'\n\nimport { useState, useEffect, useCallback } from 'react'\n\nexport default function LocalIntel({ supabaseClient }) {\n${intelInner}}\n`
fs.mkdirSync(path.join(root, 'src', 'features', 'intel'), { recursive: true })
fs.writeFileSync(path.join(root, 'src', 'features', 'intel', 'LocalIntel.jsx'), intelFile, 'utf8')

// --- OffersCalendar: 875-2651
const offersRaw = sliceLines(875, 2651)
let offersInner = dedentTwoSpaces(
  offersRaw.replace(/^  const OffersCalendar = \(\) => \{\n/, '').replace(/\n  \}$/, '\n')
)
offersInner = offersInner.replace(
  /if \(tab !== 'offers'\) return\n\s*/,
  ''
)
const offersImports = `import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  OFFER_ALERT_DAY_9AM,
  OFFER_ALERT_NONE,
  localDateKeyFromIso,
  localDateKeyFromDate,
  dateFromDatetimeLocalValue,
  normalizeLoadedEvent,
} from './utils'
import ReviewQueuePanel from './components/ReviewQueuePanel'
import UploadProgressOverlay from './components/UploadProgressOverlay'
import OfferFormModal from './components/OfferFormModal'
import WeekEventDetailModal from './components/WeekEventDetailModal'
import AddEventFab from './components/AddEventFab'
import useOffersCalendarState from './hooks/useOffersCalendarState'
import useOffersCalendarMutations from './hooks/useOffersCalendarMutations'
import useWebPushNotifications from './hooks/useWebPushNotifications'
import {
  OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX,
  OFFERS_DEFAULT_VIEW_KEY_PREFIX,
  OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX,
  OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX,
  OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX,
  OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX,
  OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX,
} from './offerStorageKeys'

`
const offersHeader = `'use client'\n\n${offersImports}export default function OffersCalendar({\n  supabaseClient,\n  pendingOfferEventIds,\n  setPendingOfferEventIds,\n  offerSpotlightEventIds,\n  setOfferSpotlightEventIds,\n}) {\n`
const offersFile = `${offersHeader}${offersInner}}\n`
fs.writeFileSync(path.join(root, 'src', 'features', 'offers', 'OffersCalendar.jsx'), offersFile, 'utf8')

// --- Calculators: 2653-2734 renderCalculatorsHome
const calcHomeRaw = sliceLines(2653, 2734)
const calcHomeInner = dedentTwoSpaces(
  calcHomeRaw
    .replace(/^  const renderCalculatorsHome = \(\) => \(\n/, '')
    .replace(/\n  \)\s*$/, '')
)
const calcFile = `'use client'\n\nimport PhoenixLink from '../../calculators/PhoenixLink'
import BuffaloLink from '../../calculators/BuffaloLink'
import StackUpPays from '../../calculators/StackUpPays'
import MHBCalculator from '../../calculators/MHBCalculator'

function CalculatorsHome({ onSelectCalculator, onLogout }) {
  return (
${calcHomeInner}
  )
}

export default function CalculatorsTab({ activeCalculator, setActiveCalculator, onLogout }) {
  if (!activeCalculator) {
    return (
      <CalculatorsHome
        onSelectCalculator={(key) => setActiveCalculator(key)}
        onLogout={onLogout}
      />
    )
  }
  if (activeCalculator === 'phoenix') return <PhoenixLink onBack={() => setActiveCalculator(null)} />
  if (activeCalculator === 'buffalo') return <BuffaloLink onBack={() => setActiveCalculator(null)} />
  if (activeCalculator === 'stackup') return <StackUpPays onBack={() => setActiveCalculator(null)} />
  if (activeCalculator === 'mhb') return <MHBCalculator onBack={() => setActiveCalculator(null)} />
  return (
    <CalculatorsHome
      onSelectCalculator={(key) => setActiveCalculator(key)}
      onLogout={onLogout}
    />
  )
}
`
fs.mkdirSync(path.join(root, 'src', 'features', 'calculators'), { recursive: true })
fs.writeFileSync(path.join(root, 'src', 'features', 'calculators', 'CalculatorsTab.jsx'), calcFile, 'utf8')

// Patch inner JSX: setActiveCalculator('phoenix') -> onSelectCalculator('phoenix')
const calcPath = path.join(root, 'src', 'features', 'calculators', 'CalculatorsTab.jsx')
let calcWritten = fs.readFileSync(calcPath, 'utf8')
calcWritten = calcWritten.replace(/onClick=\{\(\) => setActiveCalculator\(/g, 'onClick={() => onSelectCalculator(')
fs.writeFileSync(calcPath, calcWritten, 'utf8')

// --- Rebuild App.jsx: keep lines 1-322, then 2735-end (renderTabContent onward)
const head = lines.slice(0, 322).join('\n')
const tail = lines.slice(2734).join('\n') // from line 2735 "  const renderTabContent"

const newImports = `import BankrollTracker from './features/bankroll/BankrollTracker'
import LocalIntel from './features/intel/LocalIntel'
import OffersCalendar from './features/offers/OffersCalendar'
import CalculatorsTab from './features/calculators/CalculatorsTab'
`

const headWithImports = head.replace(
  /import PhoenixLink from '\.\/calculators\/PhoenixLink'\nimport BuffaloLink from '\.\/calculators\/BuffaloLink'\nimport StackUpPays from '\.\/calculators\/StackUpPays'\nimport MHBCalculator from '\.\/calculators\/MHBCalculator'\n/,
  ''
)

const headOffersTrim = headWithImports.replace(
  /\nimport \{\n  OFFER_ALERT_DAY_9AM,\n  OFFER_ALERT_NONE,\n  localDateKeyFromIso,\n  localDateKeyFromDate,\n  dateFromDatetimeLocalValue,\n  normalizeLoadedEvent\n\} from '\.\/features\/offers\/utils'\nimport ReviewQueuePanel from '\.\/features\/offers\/components\/ReviewQueuePanel'\nimport UploadProgressOverlay from '\.\/features\/offers\/components\/UploadProgressOverlay'\nimport OfferFormModal from '\.\/features\/offers\/components\/OfferFormModal'\nimport WeekEventDetailModal from '\.\/features\/offers\/components\/WeekEventDetailModal'\nimport AddEventFab from '\.\/features\/offers\/components\/AddEventFab'\nimport useOffersCalendarState from '\.\/features\/offers\/hooks\/useOffersCalendarState'\nimport useOffersCalendarMutations from '\.\/features\/offers\/hooks\/useOffersCalendarMutations'\nimport useWebPushNotifications from '\.\/features\/offers\/hooks\/useWebPushNotifications'\n/,
  '\n'
)

const headKeysTrim = headOffersTrim.replace(
  /\nimport \{\n  OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX,\n  OFFERS_DEFAULT_VIEW_KEY_PREFIX,\n  OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX,\n  OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX,\n  OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX,\n  OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX,\n  OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX,\n\} from '\.\/features\/offers\/offerStorageKeys'\n/,
  '\n'
)

// Insert feature imports after GuidesScreen import
const finalHead = headKeysTrim.replace(
  /import GuidesScreen from '\.\/features\/guides\/GuidesScreen'\n/,
  `import GuidesScreen from './features/guides/GuidesScreen'\n${newImports}`
)

// Remove intelView state line from AppShell
const patchedTail = tail.replace(
  /  const \[intelView, setIntelView\] = useState\(\{ screen: 'home', cityId: null, casinoId: null \}\)\n/,
  ''
)

// renderTabContent calculators branch
let patchedTail2 = patchedTail.replace(
  /if \(tab === 'calculators'\) \{\n      if \(!activeCalculator\) return renderCalculatorsHome\(\)\n      if \(activeCalculator === 'phoenix'\) return <PhoenixLink onBack=\{\(\) => setActiveCalculator\(null\)\} \/>\n      if \(activeCalculator === 'buffalo'\) return <BuffaloLink onBack=\{\(\) => setActiveCalculator\(null\)\} \/>\n      if \(activeCalculator === 'stackup'\) return <StackUpPays onBack=\{\(\) => setActiveCalculator\(null\)\} \/>\n      if \(activeCalculator === 'mhb'\) return <MHBCalculator onBack=\{\(\) => setActiveCalculator\(null\)\} \/>\n      return renderCalculatorsHome\(\)\n    \}/,
  "if (tab === 'calculators') {\n      return (\n        <CalculatorsTab\n          activeCalculator={activeCalculator}\n          setActiveCalculator={setActiveCalculator}\n          onLogout={onLogout}\n        />\n      )\n    }"
)

patchedTail2 = patchedTail2.replace(
  /if \(tab === 'offers'\) return <OffersCalendar \/>/,
  `if (tab === 'offers')\n      return (\n        <OffersCalendar\n          supabaseClient={supabaseClient}\n          pendingOfferEventIds={pendingOfferEventIds}\n          setPendingOfferEventIds={setPendingOfferEventIds}\n          offerSpotlightEventIds={offerSpotlightEventIds}\n          setOfferSpotlightEventIds={setOfferSpotlightEventIds}\n        />\n      )`
)

patchedTail2 = patchedTail2.replace(
  /if \(tab === 'intel'\) return <LocalIntel \/>/,
  "if (tab === 'intel') return <LocalIntel supabaseClient={supabaseClient} />"
)

fs.writeFileSync(appPath, `${finalHead}\n${patchedTail2}`, 'utf8')

console.log('Done splitting features.')
