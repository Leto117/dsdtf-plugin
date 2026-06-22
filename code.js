figma.showUI(__html__, { width: 380, height: 460, title: 'DSDTF' })

figma.ui.onmessage = function (msg) {
  var data = msg.pluginMessage || msg
  if (data.type !== 'import') return

  var total = 0

  try {
    var figmaStylesFile = data.files.find(function (f) { return f.name === 'figma-styles.json' })
    var tokens = data.files.find(function (f) { return f.name === 'design-tokens.json' })
    var colors = data.files.find(function (f) { return f.name === 'color-palette.json' })
    var typography = data.files.find(function (f) { return f.name === 'typography.json' })

    figma.notify('Creating styles...')
    figma.ui.postMessage({ type: 'progress', text: 'Creating styles...' })

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
    var scale = fsData ? fsData.typography : []
    if (scale.length === 0 && typography) {
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
    }

    for (var ti = 0; ti < scale.length; ti++) {
      try {
        var st = scale[ti]
        var styleT = figma.createTextStyle()
        styleT.name = 'DSDTF/' + st.role + '/' + st.size
        styleT.fontSize = st.fontSizePx
        styleT.lineHeight = { unit: 'PIXELS', value: st.lineHeightPx }
        styleT.letterSpacing = { unit: 'PIXELS', value: st.letterSpacingPx }
        styleT.fontName = { family: st.fontFamily || 'Inter', style: 'Regular' }
        var fw = st.fontWeight || 400
        if (fw >= 700) styleT.fontName = { family: st.fontFamily || 'Inter', style: 'Bold' }
        else if (fw >= 600) styleT.fontName = { family: st.fontFamily || 'Inter', style: 'Semi Bold' }
        else if (fw >= 500) styleT.fontName = { family: st.fontFamily || 'Inter', style: 'Medium' }
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
      var semanticData = previewColors ? previewColors.semantic : null
      var fontFamilies = fsData ? fsData.fontFamilies : []
      var fontFamiliesCreative = fsData ? fsData.fontFamiliesCreative : []
      var shapeData = fsData ? fsData.shape : []
      var elevData = fsData ? fsData.elevation : []
      var iconSets = fsData ? fsData.iconSets : []

      var displayF = ''
      var bodyF = ''
      for (var fi = 0; fi < fontFamilies.length; fi++) {
        if (fontFamilies[fi].name === 'display') displayF = fontFamilies[fi].stack
        if (fontFamilies[fi].name === 'body') bodyF = fontFamilies[fi].stack
      }

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

      // Helper: add text
      function addText(parent, text, fontSize, fontWeight, fontFamily, color, opts) {
        opts = opts || {}
        var node = figma.createText()
        node.characters = text
        node.fontSize = fontSize
        node.fontWeight = fontWeight
        node.fontName = { family: fontFamily || 'Inter', style: fontWeight >= 700 ? 'Bold' : 'Regular' }
        node.fills = [{ type: 'SOLID', color: hexToRgb(color || '#1a1a1a'), opacity: 1 }]
        if (opts.lineHeight) node.lineHeight = { unit: 'PIXELS', value: opts.lineHeight }
        if (opts.letterSpacing) node.letterSpacing = { unit: 'PIXELS', value: opts.letterSpacing }
        parent.appendChild(node)
        return node
      }

      // Helper: add rect
      function addRect(parent, w, h, fill, radius) {
        var node = figma.createRectangle()
        node.resize(w, h)
        if (fill) node.fills = [{ type: 'SOLID', color: hexToRgb(fill), opacity: 1 }]
        if (radius) node.cornerRadius = radius
        parent.appendChild(node)
        return node
      }

      // Helper: add auto-layout frame
      function addFrame(parent, w, h, opts) {
        opts = opts || {}
        var node = figma.createFrame()
        node.resize(w, h || 0)
        if (opts.fill) node.fills = [{ type: 'SOLID', color: hexToRgb(opts.fill), opacity: 1 }]
        if (opts.radius) node.cornerRadius = opts.radius
        if (opts.stroke) node.strokes = [{ type: 'SOLID', color: hexToRgb(opts.stroke), opacity: opts.strokeOpacity || 1 }]
        if (opts.layout) node.layoutMode = opts.layout
        if (opts.padding) { node.paddingLeft = opts.padding; node.paddingRight = opts.padding; node.paddingTop = opts.padding; node.paddingBottom = opts.padding }
        if (opts.gap) node.itemSpacing = opts.gap
        if (opts.hug) node.primaryAxisSizingMode = 'AUTO'
        if (opts.wrap) node.layoutWrap = 'WRAP'
        if (opts.counterAxis) node.counterAxisAlignItems = opts.counterAxis
        parent.appendChild(node)
        return node
      }

      // === HEADER ===
      var header = addFrame(mainFrame, 1104, 80, { layout: 'HORIZONTAL', gap: 16, counterAxis: 'CENTER' })
      addRect(header, 64, 64, sourceHex, 16)
      addText(header, brandName, 28, 800, 'Inter', '#111')
      var headerInfo = addFrame(header, 0, 0, { layout: 'VERTICAL', hug: true })
      addText(headerInfo, sourceHex, 11, 500, 'monospace', '#999')

      // === BRAND COLORS ===
      var brandSection = addFrame(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
      addText(brandSection, 'BRAND COLORS', 9, 600, 'Inter', '#999')
      var brandRow = addFrame(brandSection, 1104, 56, { layout: 'HORIZONTAL', gap: 16, hug: true })
      var pcw = secondaryHex ? 544 : 1104
      var primCard = addFrame(brandRow, pcw, 56, { fill: sourceHex, radius: 8, layout: 'VERTICAL', padding: 12 })
      addText(primCard, 'PRIMARY', 10, 700, 'Inter', toneTint(sourceHex))
      addText(primCard, sourceHex, 10, 400, 'monospace', toneTint(sourceHex))
      if (secondaryHex) {
        var secCard = addFrame(brandRow, pcw, 56, { fill: secondaryHex, radius: 8, layout: 'VERTICAL', padding: 12 })
        addText(secCard, 'SECONDARY', 10, 700, 'Inter', toneTint(secondaryHex))
        addText(secCard, secondaryHex, 10, 400, 'monospace', toneTint(secondaryHex))
      }

      // === DUOTONE BAR ===
      var duotone = addFrame(mainFrame, 1104, 14, { layout: 'HORIZONTAL', gap: 2 })
      var barColors = [sourceHex]
      if (secondaryHex) barColors.push(secondaryHex)
      if (schemes) {
        barColors.push(schemes.light ? schemes.light.primary : '#ccc')
        barColors.push(schemes.light ? schemes.light.secondary : '#ccc')
        barColors.push(schemes.light ? schemes.light.tertiary : '#ccc')
        barColors.push(schemes.light ? schemes.light.error : '#ccc')
      }
      var barW = Math.floor(1104 / barColors.length)
      for (var bi = 0; bi < barColors.length; bi++) {
        addRect(duotone, barW - 2, 14, barColors[bi], 4)
      }

      // === COLOR PALETTES ===
      if (palettesData) {
        var palSection = addFrame(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
        addText(palSection, 'COLOR PALETTES', 9, 600, 'Inter', '#999')
        var toneSteps = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100]
        for (var pn2 in palettesData) {
          var pRow = addFrame(palSection, 1104, 18, { layout: 'HORIZONTAL', gap: 2, hug: true })
          addText(pRow, pn2, 10, 500, 'Inter', '#666')
          var tones = palettesData[pn2].tones || {}
          var bw = Math.floor((1104 - 70) / toneSteps.length)
          for (var tsi = 0; tsi < toneSteps.length; tsi++) {
            var toneHex = tones[toneSteps[tsi]]
            if (toneHex) {
              var toneRect = addRect(pRow, bw, 18, toneHex, 2)
            }
          }
        }
      }

      // === SCHEMES ===
      if (schemes) {
        var schSection = addFrame(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
        addText(schSection, 'LIGHT / DARK SCHEMES', 9, 600, 'Inter', '#999')
        var schemeModes = ['light', 'dark']
        for (var si2 = 0; si2 < schemeModes.length; si2++) {
          var sm = schemeModes[si2]
          var sch = schemes[sm] || {}
          var schRow = addFrame(schSection, 1104, 18, { layout: 'HORIZONTAL', gap: 2, hug: true })
          addText(schRow, sm, 10, 600, 'Inter', '#888')
          var schRoles = ['primary', 'secondary', 'tertiary', 'error', 'background', 'surface', 'surfaceVariant', 'outline']
          var ssw = Math.floor((1104 - 80) / schRoles.length)
          for (var ri2 = 0; ri2 < schRoles.length; ri2++) {
            var roleHex = sch[schRoles[ri2]] || '#ccc'
            var roleRect = addRect(schRow, ssw, 16, roleHex, 3)
            addText(schRow, schRoles[ri2], 6, 400, 'Inter', toneTint(roleHex))
          }
        }
      }

      // === TYPOGRAPHY SCALE ===
      if (scale.length > 0) {
        var typSection = addFrame(mainFrame, 1104, 0, { layout: 'VERTICAL', hug: true })
        addText(typSection, 'TYPOGRAPHY', 9, 600, 'Inter', '#999')
        var displayedRoles = { 'display': 1, 'headline': 1, 'title': 1, 'body': 1 }
        for (var si3 = 0; si3 < scale.length && si3 < 12; si3++) {
          var ts = scale[si3]
          if (ts.emphasis !== 'baseline') continue
          var typRow = addFrame(typSection, 1104, 26, { layout: 'HORIZONTAL', gap: 10, hug: true })
          addText(typRow, ts.role + '-' + ts.size, 8, 500, 'monospace', '#aaa')
          addText(typRow, 'The quick brown fox', ts.fontSizePx, ts.fontWeight, getFontFamily(ts.fontFamily), '#222')
        }
      }

      figma.ui.postMessage({ type: 'done', text: 'Done', count: total })
      figma.notify('DSDTF: Created ' + total + ' styles + preview frame')
      figma.closePlugin()

    } catch (e) {
      figma.ui.postMessage({ type: 'error', text: String(e) })
      figma.notify('Preview error: ' + String(e), { error: true })
    }

  } catch (err) {
    figma.ui.postMessage({ type: 'error', text: String(err) })
    figma.notify('Error: ' + String(err), { error: true })
  }
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
    var offsetX = Number(match[0]) || 0
    var offsetY = Number(match[1]) || 2
    var blur = Number(match[2]) || 4
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