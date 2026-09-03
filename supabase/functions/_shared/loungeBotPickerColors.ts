/**
 * Lounge markdown color tags for Sharpe Syndicate desk names.
 * Scott = green, Rocco = blue, Chedda = gold, Tank = purple.
 */
export type PickerColorTag = 'green' | 'blue' | 'gold' | 'purple'

const PICKER_COLOR: Record<string, PickerColorTag> = {
  Scott: 'green',
  Rocco: 'blue',
  Chedda: 'gold',
  Tank: 'purple',
}

export function pickerMarkdownColorTag(name: string): PickerColorTag {
  return PICKER_COLOR[name] || 'green'
}

/** Wrap desk label in Lounge [color] tags (e.g. `[green]Scott[/green]`). */
export function formatColoredPickerName(name: string, display?: string): string {
  const tag = pickerMarkdownColorTag(name)
  const text = display ?? name
  return `[${tag}]${text}[/${tag}]`
}

export function formatColoredPickerList(names: readonly string[]): string {
  return names.map((n) => formatColoredPickerName(n)).join(', ')
}
