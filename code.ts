figma.showUI(__html__, { width: 380, height: 520, title: 'DSDTF' })

figma.ui.onmessage = async (msg: { type: string; files: { name: string; content: string }[] }) => {
  const data = (msg as any).pluginMessage || msg
  if (data.type !== 'import') return

  let total = 0

  try {
    const tokens = data.files.find((f: any) => f.name === 'design-tokens.json')
    const colors = data.files.find((f: any) => f.name === 'color-palette.json')
    const typography = data.files.find((f: any) => f.name === 'typography.json')

    if (!tokens && !colors && !typography) {
      figma.ui.postMessage({ type: 'error', text: 'Не найдены файлы дизайн-системы' })
      return
    }

    // 1. Color styles
    figma.notify('Создание цветовых стилей...')
    figma.ui.postMessage({ type: 'progress', text: 'Создание цветовых стилей...' })

    const colorStyles: Record<string, string> = {}
    if (tokens) {
      try {
        const parsed = JSON.parse(tokens.content)
        if (parsed.colors) Object.assign(colorStyles, parsed.colors)
        if (parsed.semantic) {
          for (const [key, hex] of Object.entries(parsed.semantic as Record<string, string>)) {
            colorStyles[`semantic/${key}`] = hex
          }
        }
      } catch {}
    }
    if (colors) {
      try {
        const parsed = JSON.parse(colors.content)
        if (parsed.palettes) {
          for (const [name, palette] of Object.entries(parsed.palettes as Record<string, { tones?: Record<string, string> }>)) {
            if (palette?.tones) {
              for (const [tone, hex] of Object.entries(palette.tones)) {
                colorStyles[`palette/${name}/${tone}`] = hex
              }
            }
          }
        }
      } catch {}
    }

    for (const [name, hex] of Object.entries(colorStyles)) {
      try {
        const s = figma.createPaintStyle()
        s.name = name
        s.paints = [{ type: 'SOLID', color: hexToRgb(hex), opacity: 1 }]
        total++
      } catch {}
    }

    // 2. Text styles
    if (typography) {
      figma.notify('Создание текстовых стилей...')
      figma.ui.postMessage({ type: 'progress', text: 'Создание текстовых стилей...' })

      try {
        const parsed = JSON.parse(typography.content)
        const scale = parsed.typeScale || []

        const seen = new Set<string>()
        const fontReqs: { family: string; style: string }[] = []
        for (const sd of scale) {
          const family = sd.fontFamily || 'Inter'
          const fw = sd.fontWeight || 400
          let style = 'Regular'
          if (fw >= 700) style = 'Bold'
          else if (fw >= 600) style = 'Semi Bold'
          else if (fw >= 500) style = 'Medium'
          const key = `${family}::${style}`
          if (!seen.has(key)) {
            seen.add(key)
            fontReqs.push({ family, style })
          }
        }
        await Promise.all(fontReqs.map(f => figma.loadFontAsync(f)))

        for (const sd of scale) {
          try {
            const s = figma.createTextStyle()
            s.name = `${sd.role}/${sd.size}`
            s.fontSize = (parseFloat(sd.fontSize) || 1) * 16
            s.lineHeight = { unit: 'PIXELS', value: (parseFloat(sd.lineHeight) || 1.5) * 16 }
            s.letterSpacing = { unit: 'PIXELS', value: parseFloat(sd.letterSpacing) || 0 }

            const fw = sd.fontWeight || 400
            let fontStyle = 'Regular'
            if (fw >= 700) fontStyle = 'Bold'
            else if (fw >= 600) fontStyle = 'Semi Bold'
            else if (fw >= 500) fontStyle = 'Medium'
            s.fontName = { family: sd.fontFamily || 'Inter', style: fontStyle }
            total++
          } catch {}
        }
      } catch {}
    }

    // 3. Effect styles
    if (tokens) {
      try {
        const parsed = JSON.parse(tokens.content)
        const shadows = parsed.shadows || parsed.elevation || {}
        for (const [name, shadowStr] of Object.entries(shadows as Record<string, string>)) {
          try {
            const s = figma.createEffectStyle()
            s.name = `shadow/${name}`
            s.effects = [parseShadow(shadowStr)]
            total++
          } catch {}
        }
      } catch {}
    }

    figma.ui.postMessage({ type: 'done', text: 'Загрузка завершена', count: total })
    figma.notify(`DSDTF: Создано ${total} стилей`)
    figma.closePlugin()
  } catch (err) {
    figma.ui.postMessage({ type: 'error', text: String(err) })
    figma.notify('Ошибка: ' + String(err), { error: true })
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

function parseShadow(shadowStr: string) {
  const match = shadowStr.match(/[\d.]+/g)
  if (match && match.length >= 3) {
    const [offsetX = 0, offsetY = 2, blur = 4] = match.map(Number)
    return {
      type: 'DROP_SHADOW' as const,
      color: { r: 0, g: 0, b: 0, a: 0.15 },
      offset: { x: offsetX, y: offsetY },
      radius: blur,
      visible: true,
      blendMode: 'NORMAL' as const,
    }
  }
  return {
    type: 'DROP_SHADOW' as const,
    color: { r: 0, g: 0, b: 0, a: 0.1 },
    offset: { x: 0, y: 2 },
    radius: 4,
    visible: true,
    blendMode: 'NORMAL' as const,
  }
}
