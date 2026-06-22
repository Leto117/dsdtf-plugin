figma.showUI(__html__, { width: 380, height: 520, title: 'DSDTF' })

// Extract clean font name from CSS stack like '"Epilogue", system-ui, sans-serif' -> 'Epilogue'
function extractFontName(familyStack: string): string {
  if (!familyStack) return 'Inter'
  const trimmed = familyStack.trim()
  // Take the first font name — strip quotes if present
  const firstFont = trimmed.split(',')[0]?.trim().replace(/['"]/g, '') || 'Inter'
  return firstFont || 'Inter'
}

// Map font weight to Figma style name
function weightToStyle(fw: number): string {
  if (fw >= 700) return 'Bold'
  if (fw >= 600) return 'Semi Bold'
  if (fw >= 500) return 'Medium'
  return 'Regular'
}

const FALLBACK_FONTS = ['Inter', 'Arial', 'Helvetica', 'system-ui']

async function loadFontWithFallback(family: string, style: string, loaded: Set<string>): Promise<boolean> {
  const key = `${family}::${style}`
  if (loaded.has(key)) return true
  // Try the font, if fails try fallbacks
  const attempts = [family, ...FALLBACK_FONTS.filter(f => f !== family)]
  for (const f of attempts) {
    try {
      await figma.loadFontAsync({ family: f, style })
      loaded.add(key)
      return true
    } catch {}
  }
  return false
}

figma.ui.onmessage = async (msg: { type: string; files: { name: string; content: string }[] }) => {
  if (msg.type !== 'import') return

  let total = 0
  let fontWarnings: string[] = []

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

    // 2. Create text styles from typography (with font fallback)
    if (typography) {
      figma.notify('Создание текстовых стилей...')
      figma.ui.postMessage({ type: 'progress', text: 'Создание текстовых стилей...' })

      try {
        const parsed = JSON.parse(typography.content)
        const scale = parsed.typeScale || []

        // Pre-load fonts with fallback
        const loadedFonts = new Set<string>()
        for (const sd of scale) {
          const rawFamily = sd.fontFamily || 'Inter'
          const cleanFamily = extractFontName(rawFamily)
          const style = weightToStyle(sd.fontWeight || 400)
          const ok = await loadFontWithFallback(cleanFamily, style, loadedFonts)
          if (!ok) {
            fontWarnings.push(`${cleanFamily} (${style})`)
          }
        }

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

            const rawFamily = styleData.fontFamily || 'Inter'
            const cleanFamily = extractFontName(rawFamily)
            const fontStyle = weightToStyle(styleData.fontWeight || 400)

            // Test if the clean font was loaded; use fallback if not
            const testKey = `${cleanFamily}::${fontStyle}`
            const actualFamily = loadedFonts.has(testKey) ? cleanFamily : 'Inter'

            style.fontName = { family: actualFamily, style: fontStyle }

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

    // Send result with font warnings
    const resultMsg: { type: string; text: string; count: number; fontWarnings?: string[] } = {
      type: 'done',
      text: 'Загрузка завершена',
      count: total,
    }
    if (fontWarnings.length > 0) {
      resultMsg.fontWarnings = fontWarnings
      resultMsg.text += `. Не найдены шрифты: ${fontWarnings.slice(0, 3).join(', ')}`
    }
    figma.ui.postMessage(resultMsg)
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