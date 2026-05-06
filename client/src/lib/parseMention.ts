export interface MentionActive {
  active: true
  /** Text typed after the `@` trigger, up to the cursor. */
  query: string
  /** Index in the string where `@` is — used to replace the trigger+query on selection. */
  triggerStart: number
}

export interface MentionInactive {
  active: false
}

export type MentionState = MentionActive | MentionInactive

const INACTIVE: MentionInactive = { active: false }

/**
 * Given the current input value and cursor position, detect whether the user
 * is in an active `@`-mention context.
 *
 * Rules:
 * - Scan backward from `cursorPos` for an `@` character.
 * - If any whitespace is found before hitting `@`, the mention is inactive.
 * - If `@` is found with no whitespace between it and the cursor, return active
 *   with the substring between `@` (exclusive) and `cursorPos` as the query.
 */
export function parseMention(value: string, cursorPos: number): MentionState {
  for (let i = cursorPos - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === '@') return { active: true, query: value.slice(i + 1, cursorPos), triggerStart: i }
    if (/\s/.test(ch)) return INACTIVE
  }
  return INACTIVE
}
