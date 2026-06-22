figma.showUI(__html__, { width: 380, height: 460, title: 'DSDTF' })

figma.ui.onmessage = async (msg: { type: string; files: { name: string; content: string }[] }) => {
  if (msg.type !== 'import') return

  let total = 0

  try {
    // Parse files
    const tokens = msg.files.find(f => f.name === 'design-tokens.json')
    const colors = msg.files.find(f => f.name === 'color-palette.json')
    const typography = msg.files.find(f => f.name === 'typography.json')

    if (!tokens && !colors && !typography) {
      figma.ui.postMessage({ type: 'error', text: 'Не найдены файлы дизайн-системы' })
      return
    }

    // 1. Create color styles
    figma.notify('Создание цветовых стилей...')
    figma.ui.postMessage({ type: 'progress', text: 'Создание цветовых стилей...' })

    const colorStyles: Record<string, string> = {}

    if (tokens) {
      try {
        const parsed = JSON.parse(tokens.content)
        if (parsed.colors) {
          Object.assign(colorStyles, parsed.colors)
        }
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

    // Create paint styles
    for (const [name, hex] of Object.entries(colorStyles)) {
      try {
        const style = figma.createPaintStyle()
        style.name = name
        style.paints = [{ type: 'SOLID', color: hexToRgb(hex), opacity: 1 }]
        total++
      } catch {}
    }

    // 2. Create text styles from typography
    if (typography) {
      figma.notify('Создание текстовых стилей...')
      figma.ui.postMessage({ type: 'progress', text: 'Создание текстовых стилей...' })

      try {
        const parsed = JSON.parse(typography.content)
        const scale = parsed.typeScale || []

        for (const styleData of scale) {
          try {
            const style = figma.createTextStyle()
            style.name = `${styleData.role}/${styleData.size}`
            const fontSize = (parseFloat(styleData.fontSize) || 1) * 16
            const lineHeightPx = (parseFloat(styleData.lineHeight) || 1.5) * 16
            const letterSpacingNum = parseFloat(styleData.letterSpacing) || 0

            style.fontSize = fontSize
            style.lineHeight = { unit: 'PIXELS', value: lineHeightPx }
            style.letterSpacing = { unit: 'PIXELS', value: letterSpacingNum }
            style.fontName = { family: styleData.fontFamily || 'Inter', style: 'Regular' }

            // Map fontWeight
            const fw = styleData.fontWeight || 400
            if (fw >= 700) style.fontName = { ...style.fontName, style: 'Bold' }
            else if (fw >= 600) style.fontName = { ...style.fontName, style: 'Semi Bold' }
            else if (fw >= 500) style.fontName = { ...style.fontName, style: 'Medium' }

            total++
          } catch {}
        }
      } catch {}
    }

    // 3. Create effect styles from tokens
    if (tokens) {
      try {
        const parsed = JSON.parse(tokens.content)
        const shadows = parsed.shadows || parsed.elevation || {}

        for (const [name, shadowStr] of Object.entries(shadows as Record<string, string>)) {
          try {
            const style = figma.createEffectStyle()
            style.name = `shadow/${name}`
            style.effects = [parseShadow(shadowStr)]
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

function parseShadow(shadowStr: string): Effect {
  const match = shadowStr.match(/[\d.]+/g)
  if (match && match.length >= 3) {
    const [offsetX = 0, offsetY = 2, blur = 4] = match.map(Number)
    return {
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.15 },
      offset: { x: offsetX, y: offsetY },
      radius: blur,
      visible: true,
      blendMode: 'NORMAL',
    }
  }
  return {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.1 },
    offset: { x: 0, y: 2 },
    radius: 4,
    visible: true,
    blendMode: 'NORMAL',
  }
}