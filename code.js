figma.showUI(__html__, { width: 380, height: 460, title: 'DSDTF' })

figma.ui.onmessage = async function (msg) {
  var data = msg.pluginMessage || msg
  if (data.type !== 'import') return

  var total = 0

  try {
    var figmaStylesFile = data.files.find(function (f) { return f.name === 'figma-styles.json' })
    var tokens = data.files.find(function (f) { return f.name === 'design-tokens.json' })
    var colors = data.files.find(function (f) { return f.name === 'color-palette.json' })
    var typography = data.files.find(function (f) { return f.name === 'typography.json' })

    if (!figmaStylesFile && !tokens && !colors && !typography) {
      figma.ui.postMessage({ type: 'error', text: 'Не найдены файлы дизайн-системы' })
      return
    }

    figma.notify('Создание стилей...')
    figma.ui.postMessage({ type: 'progress', text: 'Создание стилей...' })

    var fsData = null
    if (figmaStylesFile) {
      fsData = JSON.parse(figmaStylesFile.content)
    }

    // === 1. COLOR STYLES ===
    var colorStyles = {}
    if (fsData && fsData.colors) {
      var c = fsData.colors
      if (c.palettes) {
        for (var pName in c.palettes) {
          var palette = c.palettes[pName]
          if (palette && palette.tones) {
            for (var tone in palette.tones) {
              colorStyles['palette/' + pName + '/' + tone] = palette.tones[tone]
            }
          }
        }
      }
      if (c.schemes) {
        for (var mode in c.schemes) {
          var scheme = c.schemes[mode]
          for (var role in scheme) {
            colorStyles['scheme/' + mode + '/' + role] = scheme[role]
          }
        }
      }
      if (c.semantic) {
        for (var sKey in c.semantic) {
          colorStyles['semantic/' + sKey] = c.semantic[sKey]
        }
      }
    } else if (tokens || colors) {
      if (tokens) {
        var pt = JSON.parse(tokens.content)
        if (pt.colors) { for (var k in pt.colors) { colorStyles[k] = pt.colors[k] } }
        if (pt.semantic) { for (var sk in pt.semantic) { colorStyles['semantic/' + sk] = pt.semantic[sk] } }
      }
      if (colors) {
        var pc = JSON.parse(colors.content)
        if (pc.palettes) {
          for (var pn in pc.palettes) {
            var pl = pc.palettes[pn]
            if (pl && pl.tones) { for (var t in pl.tones) { colorStyles['palette/' + pn + '/' + t] = pl.tones[t] } }
          }
        }
      }
    }

    for (var csName in colorStyles) {
      try {
        var s = figma.createPaintStyle()
        s.name = 'DSDTF/' + csName
        s.paints = [{ type: 'SOLID', color: hexToRgb(colorStyles[csName]), opacity: 1 }]
        total++
      } catch (e) {}
    }

    // === 2. TEXT STYLES ===
    var scale = fsData && Array.isArray(fsData.typography) ? fsData.typography : []
    if (scale.length === 0 && typography) {
      try {
        var pt2 = JSON.parse(typography.content)
        scale = (pt2.typeScale || []).map(function (st) {
          return {
            role: st.role,
            size: st.size,
            emphasis: st.emphasis,
            fontFamily: st.fontFamily,
            fontWeight: st.fontWeight,
            fontSizePx: Math.round(parseFloat(st.fontSize) * 16) || 16,
            lineHeightPx: Math.round(parseFloat(st.lineHeight) * 16) || 24,
            letterSpacingPx: parseFloat(st.letterSpacing) || 0,
          }
        })
      } catch (e) {}
    }

    // Load all unique fonts before creating text styles
    var fontReqs = []
    var seenFonts = {}
    for (var fi = 0; fi < scale.length; fi++) {
      var cleanFamily = getFontFamily(scale[fi].fontFamily)
      var fw = scale[fi].fontWeight || 400
      var st = 'Regular'
      if (fw >= 700) st = 'Bold'
      else if (fw >= 600) st = 'Semi Bold'
      else if (fw >= 500) st = 'Medium'
      var key = cleanFamily + '::' + st
      if (!seenFonts[key]) {
        seenFonts[key] = true
        fontReqs.push({ family: cleanFamily, style: st })
      }
    }
    if (!seenFonts['Inter::Bold']) fontReqs.push({ family: 'Inter', style: 'Bold' })
    if (!seenFonts['Inter::Semi Bold']) fontReqs.push({ family: 'Inter', style: 'Semi Bold' })
    if (!seenFonts['Inter::Medium']) fontReqs.push({ family: 'Inter', style: 'Medium' })
    if (!seenFonts['Inter::Regular']) fontReqs.push({ family: 'Inter', style: 'Regular' })
    if (!seenFonts['Courier New::Regular']) fontReqs.push({ family: 'Courier New', style: 'Regular' })
    if (!seenFonts['Courier New::Medium']) fontReqs.push({ family: 'Courier New', style: 'Medium' })

    await Promise.all(fontReqs.map(async function (f) {
      try { await figma.loadFontAsync(f) } catch (e) {}
    }))

    for (var ti = 0; ti < scale.length; ti++) {
      try {
        var st = scale[ti]
        var styleT = figma.createTextStyle()
        styleT.name = 'DSDTF/' + st.role + '/' + st.size
        styleT.fontSize = st.fontSizePx
        styleT.lineHeight = { unit: 'PIXELS', value: st.lineHeightPx }
        styleT.letterSpacing = { unit: 'PIXELS', value: st.letterSpacingPx }
        var cleanFamily = getFontFamily(st.fontFamily)
        var fw2 = st.fontWeight || 400
        var st2 = 'Regular'
        if (fw2 >= 700) st2 = 'Bold'
        else if (fw2 >= 600) st2 = 'Semi Bold'
        else if (fw2 >= 500) st2 = 'Medium'
        styleT.fontName = { family: cleanFamily, style: st2 }
        total++
      } catch (e) {}
    }

    // === 3. EFFECT STYLES ===
    if (tokens) {
      try {
        var ps = JSON.parse(tokens.content)
        var shadows = ps.shadows || ps.elevation || {}
        for (var shName in shadows) {
          try {
            var styleE = figma.createEffectStyle()
            styleE.name = 'DSDTF/shadow/' + shName
            styleE.effects = [parseShadow(shadows[shName])]
            total++
          } catch (e) {}
        }
      } catch (e) {}
    }

    // === 4. PREVIEW FRAME ===
    try {
      var previewColors = fsData ? fsData.colors : null
      var brandName = fsData ? (fsData.brandName || 'Design System') : 'Design System'
      var sourceHex = previewColors ? previewColors.source : '#6750A4'
      var secondaryHex = previewColors ? previewColors.secondarySource : null
      var schemes = previewColors ? previewColors.schemes : null
      var palettesData = previewColors ? previewColors.palettes : null
      var fontFamilies = fsData ? fsData.fontFamilies : []
      var iconSets = fsData ? fsData.iconSets : []

      var mainFrame = figma.createFrame()
      mainFrame.name = 'DSDTF Preview'
      mainFrame.resize(1200, 1600)
      mainFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.98, b: 0.98 }, opacity: 1 }]
      mainFrame.layoutMode = 'VERTICAL'
      mainFrame.paddingLeft = 48
      mainFrame.paddingRight = 48
      mainFrame.paddingTop = 48
      mainFrame.paddingBottom = 48
      mainFrame.itemSpacing = 24
      mainFrame.primaryAxisSizingMode = 'AUTO'
      mainFrame.counterAxisSizingMode = 'FIXED'

      // === HEADER ===
      var header = addFlex(mainFrame, 1104, 80, { layout: 'HORIZONTAL', gap: 16, crossAxis: 'CENTER' })
      addRect(header, 64, 64, sourceHex, 16)
      addText(header, brandName, 28, 800, 'Inter', '#111')
      addText(header, sourceHex, 11, 500, 'Courier New', '#999')

      // === BRAND COLORS ===
      var brandSection = addFlex(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
      addText(brandSection, 'BRAND COLORS', 9, 600, 'Inter', '#999')
      var brandRow = addFlex(brandSection, 1104, 56, { layout: 'HORIZONTAL', gap: 16, hug: true })
      var pcw = secondaryHex ? 544 : 1104
      var primCard = addFlex(brandRow, pcw, 56, { fill: sourceHex, radius: 8, layout: 'VERTICAL', padding: 12, crossAxis: 'MIN' })
      addText(primCard, 'PRIMARY', 10, 700, 'Inter', toneTint(sourceHex))
      addText(primCard, sourceHex, 10, 400, 'Courier New', toneTint(sourceHex))
      if (secondaryHex) {
        var secCard = addFlex(brandRow, pcw, 56, { fill: secondaryHex, radius: 8, layout: 'VERTICAL', padding: 12, crossAxis: 'MIN' })
        addText(secCard, 'SECONDARY', 10, 700, 'Inter', toneTint(secondaryHex))
        addText(secCard, secondaryHex, 10, 400, 'Courier New', toneTint(secondaryHex))
      }

      // === DUOTONE BAR ===
      var duotone = addFlex(mainFrame, 1104, 14, { layout: 'HORIZONTAL', gap: 2 })
      var barColors = [sourceHex]
      if (secondaryHex) barColors.push(secondaryHex)
      if (schemes) {
        barColors.push(schemes.light ? schemes.light.error : '#ccc')
        if (schemes.light) {
          barColors.push(schemes.light.primary)
          barColors.push(schemes.light.secondary)
          barColors.push(schemes.light.tertiary)
        }
      }
      var barW = Math.floor(1104 / barColors.length)
      for (var bi = 0; bi < barColors.length; bi++) {
        addRect(duotone, Math.max(barW - 2, 4), 14, barColors[bi], 4)
      }

      // === COLOR PALETTES ===
      if (palettesData) {
        var palSection = addFlex(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
        addText(palSection, 'COLOR PALETTES', 9, 600, 'Inter', '#999')
        var toneSteps = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100]
        for (var pn2 in palettesData) {
          var pRow = addFlex(palSection, 1104, 18, { layout: 'HORIZONTAL', gap: 2, hug: true, crossAxis: 'CENTER' })
          addText(pRow, pn2, 10, 500, 'Inter', '#666')
          var tones = palettesData[pn2].tones || {}
          var bw = Math.max(Math.floor((1104 - 80) / toneSteps.length), 6)
          for (var tsi = 0; tsi < toneSteps.length; tsi++) {
            var toneHex = tones[toneSteps[tsi]]
            if (toneHex) { addRect(pRow, bw, 18, toneHex, 2) }
          }
        }
      }

      // === SCHEMES ===
      if (schemes) {
        var schSection = addFlex(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
        addText(schSection, 'LIGHT / DARK SCHEMES', 9, 600, 'Inter', '#999')
        var schemeModes = ['light', 'dark']
        for (var si2 = 0; si2 < schemeModes.length; si2++) {
          var sm = schemeModes[si2]
          var sch = schemes[sm] || {}
          var schRow = addFlex(schSection, 1104, 18, { layout: 'HORIZONTAL', gap: 2, hug: true, crossAxis: 'CENTER' })
          addText(schRow, sm, 10, 600, 'Inter', '#888')
          var schRoles = ['primary', 'secondary', 'tertiary', 'error', 'background', 'surface', 'surfaceVariant', 'outline']
          var ssw = Math.max(Math.floor((1104 - 80) / schRoles.length), 12)
          for (var ri2 = 0; ri2 < schRoles.length; ri2++) {
            var roleHex = sch[schRoles[ri2]] || '#ccc'
            addRect(schRow, ssw, 18, roleHex, 3)
            addText(schRow, schRoles[ri2], 6, 400, 'Inter', toneTint(roleHex))
          }
        }
      }

      // === TYPOGRAPHY SCALE ===
      if (scale.length > 0) {
        var typSection = addFlex(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
        addText(typSection, 'TYPOGRAPHY', 9, 600, 'Inter', '#999')
        var displayed = 0
        for (var si3 = 0; si3 < scale.length && displayed < 10; si3++) {
          var ts = scale[si3]
          if (ts.emphasis !== 'baseline') continue
          displayed++
          var typRow = addFlex(typSection, 1104, 26, { layout: 'HORIZONTAL', gap: 10, crossAxis: 'CENTER' })
          addText(typRow, ts.role + '-' + ts.size, 8, 500, 'Courier New', '#aaa')
          addText(typRow, 'The quick brown fox', ts.fontSizePx, ts.fontWeight, getFontFamily(ts.fontFamily), '#222')
        }
      }

      figma.ui.postMessage({ type: 'done', text: 'Готово', count: total })
      figma.notify('DSDTF: Создано ' + total + ' стилей + фрейм превью')

    } catch (e) {
      figma.ui.postMessage({ type: 'error', text: 'Preview: ' + String(e) })
      figma.notify('Ошибка превью: ' + String(e), { error: true })
    }

  } catch (err) {
    figma.ui.postMessage({ type: 'error', text: String(err) })
    figma.notify('Ошибка: ' + String(err), { error: true })
  }
}

function addText(parent, text, fontSize, fontWeight, fontFamily, color) {
  var node = figma.createText()
  node.characters = text
  node.fontSize = fontSize
  node.fontWeight = fontWeight
  var st = fontWeight >= 700 ? 'Bold' : fontWeight >= 600 ? 'Semi Bold' : fontWeight >= 500 ? 'Medium' : 'Regular'
  node.fontName = { family: fontFamily || 'Inter', style: st }
  node.fills = [{ type: 'SOLID', color: hexToRgb(color || '#1a1a1a'), opacity: 1 }]
  parent.appendChild(node)
  return node
}

function addRect(parent, w, h, fill, radius) {
  var node = figma.createRectangle()
  node.resize(w, h)
  if (fill) node.fills = [{ type: 'SOLID', color: hexToRgb(fill), opacity: 1 }]
  if (radius) node.cornerRadius = radius
  parent.appendChild(node)
  return node
}

function addFlex(parent, w, h, opts) {
  opts = opts || {}
  var node = figma.createFrame()
  node.resize(w, h || 0)
  if (opts.fill) node.fills = [{ type: 'SOLID', color: hexToRgb(opts.fill), opacity: 1 }]
  if (opts.radius) node.cornerRadius = opts.radius
  if (opts.layout) node.layoutMode = opts.layout
  if (opts.padding) { node.paddingLeft = opts.padding; node.paddingRight = opts.padding; node.paddingTop = opts.padding; node.paddingBottom = opts.padding }
  if (opts.gap) node.itemSpacing = opts.gap
  if (opts.hug) node.primaryAxisSizingMode = 'AUTO'
  if (opts.crossAxis) node.counterAxisAlignItems = opts.crossAxis
  parent.appendChild(node)
  return node
}

function hexToRgb(hex) {
  var h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

function luminance(hex) {
  var r = parseInt(hex.slice(1, 3), 16)
  var g = parseInt(hex.slice(3, 5), 16)
  var b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function toneTint(hex) {
  return luminance(hex) > 0.5 ? '#1a1a1a' : '#ffffff'
}

function getFontFamily(stack) {
  return (stack || '').split(',')[0].replace(/['"]/g, '').trim() || 'Inter'
}

function parseShadow(shadowStr) {
  var match = shadowStr.match(/[\d.]+/g)
  if (match && match.length >= 3) {
    return {
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.15 },
      offset: { x: Number(match[0]) || 0, y: Number(match[1]) || 2 },
      radius: Number(match[2]) || 4,
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
