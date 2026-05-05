const CAPABILITY_META: Record<string, { label: string; color: string; icon: string }> = {
  completion: { label: 'Text',      color: 'hsl(210_8%_65%)',   icon: 'Aa' },
  vision:     { label: 'Image',     color: 'hsl(200_85%_55%)',  icon: '◉' },
  tools:      { label: 'Tools',     color: 'hsl(38_100%_58%)',  icon: '⚙' },
  thinking:   { label: 'Reasoning', color: 'hsl(153_46%_49%)',  icon: '◎' },
  embedding:  { label: 'Embedding', color: 'hsl(280_60%_60%)',  icon: '⬡' },
}

export function CapabilityBadge({ capability, variant = 'default' }: { capability: string; variant?: 'default' | 'compact' }) {
  const meta = CAPABILITY_META[capability]
  if (!meta) return null

  if (variant === 'compact') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono"
        style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
      >
        <span className="w-1 h-1 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </span>
    )
  }

  return (
    <span
      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-200"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${meta.color} 20%, transparent)`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-shadow duration-200"
        style={{
          background: meta.color,
          boxShadow: `0 0 4px color-mix(in srgb, ${meta.color} 40%, transparent)`,
        }}
      />
      <span className="font-mono text-[10px] opacity-50 group-hover:opacity-70 transition-opacity">{meta.icon}</span>
      {meta.label}
    </span>
  )
}
