import { useMemo } from 'react'
import PokerFieldMenu from './PokerFieldMenu.jsx'
import { buildCashGamePickerRows } from './pokerSessionLabels.js'

/**
 * Sectioned cash Game menu: New game… + Your games + Defaults.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(id: string) => void} props.onChange
 * @param {Array<{ id: string, label: string, isDefault?: boolean }>} props.presets
 * @param {{ id: string, label: string } | null} [props.orphan]
 * @param {string} [props.ariaLabel]
 * @param {string} [props.insetLabel]
 */
export default function PokerCashGamePicker({
  value,
  onChange,
  presets = [],
  orphan = null,
  ariaLabel = 'Game',
  insetLabel = '',
}) {
  const { rows } = useMemo(() => buildCashGamePickerRows(presets, orphan), [presets, orphan])

  return (
    <div data-poker-cash-game-picker>
      <PokerFieldMenu
        value={value}
        onChange={onChange}
        rows={rows}
        ariaLabel={ariaLabel}
        placeholder="Select game…"
        insetLabel={insetLabel}
      />
    </div>
  )
}
