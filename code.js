figma.showUI(__html__, { width: 380, height: 460, title: 'DSDTF' })

figma.ui.onmessage = function (msg) {
  var data = msg.pluginMessage || msg
  if (data.type !== 'import') return

  var total = 0

  try {
    var tokens = data.files.find(function (f) { return f.name === 'design-tokens.json' })
    var colors = data.files.find(function (f) { return f.name === 'color-palette.json' })
    var typography = data.files.find(function (f) { return f.name === 'typography.json' })

    if (!tokens && !colors && !typography) {
      figma.ui.postMessage({ type: 'error', text: 'Не найдены файлы дизайн-системы' })
      return
    }

    figma.notify('Создание цветовых стилей...')
    figma.ui.postMessage({ type: 'progress', text: 'Создание цветовых стилей...' })

    var colorStyles = {}
    if (tokens) {
      try {
        var pt = JSON.parse(tokens.content)
        if (pt.colors) { for (var k in pt.colors) { colorStyles[k] = pt.colors[k] } }
        if (pt.semantic) { for (var sk in pt.semantic) { colorStyles['semantic/' + sk] = pt.semantic[sk] } }
      } catch (e) {}
    }
    if (colors) {
      try {
        var pc = JSON.parse(colors.content)
        if (pc.palettes) {
          for (var pn in pc.palettes) {
            var pl = pc.palettes[pn]
            if (pl && pl.tones) { for (var t in pl.tones) { colorStyles['palette/' + pn + '/' + t] = pl.tones[t] } }
          }
        }
      } catch (e) {}
    }

    for (var csName in colorStyles) {
      try {
        var s = figma.createPaintStyle()
        s.name = csName
        s.paints = [{ type: 'SOLID', color: hexToRgb(colorStyles[csName]), opacity: 1 }]
        total++
      } catch (e) {}
    }

    if (typography) {
      figma.notify('Создание текстовых стилей...')
      figma.ui.postMessage({ type: 'progress', text: 'Создание текстовых стилей...' })

      try {
        var pt2 = JSON.parse(typography.content)
        var scale = pt2.typeScale || []

        var fontReqs = []
        var seen = {}
        for (var i = 0; i < scale.length; i++) {
          var sd = scale[i]
          var family = sd.fontFamily || 'Inter'
          var fw = sd.fontWeight || 400
          var st = 'Regular'
          if (fw >= 700) st = 'Bold'
          else if (fw >= 600) st = 'Semi Bold'
          else if (fw >= 500) st = 'Medium'
          var key = family + '::' + st
          if (!seen[key]) { seen[key] = true; fontReqs.push({ family: family, style: st }) }
        }

        var results = fontReqs.map(function (f) {
          try { figma.loadFontAsync(f); return true } catch (e) { return false }
        })

        for (var j = 0; j < scale.length; j++) {
          try {
            var sd2 = scale[j]
            var s2 = figma.createTextStyle()
            s2.name = sd2.role + '/' + sd2.size
            s2.fontSize = (parseFloat(sd2.fontSize) || 1) * 16
            s2.lineHeight = { unit: 'PIXELS', value: (parseFloat(sd2.lineHeight) || 1.5) * 16 }
            s2.letterSpacing = { unit: 'PIXELS', value: parseFloat(sd2.letterSpacing) || 0 }

            var fw2 = sd2.fontWeight || 400
            var st2 = 'Regular'
            if (fw2 >= 700) st2 = 'Bold'
            else if (fw2 >= 600) st2 = 'Semi Bold'
            else if (fw2 >= 500) st2 = 'Medium'
            s2.fontName = { family: sd2.fontFamily || 'Inter', style: st2 }
            total++
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (tokens) {
      try {
        var ps = JSON.parse(tokens.content)
        var shadows = ps.shadows || ps.elevation || {}
        for (var shName in shadows) {
          try {
            var s3 = figma.createEffectStyle()
            s3.name = 'shadow/' + shName
            s3.effects = [parseShadow(shadows[shName])]
            total++
          } catch (e) {}
        }
      } catch (e) {}
    }

    figma.ui.postMessage({ type: 'done', text: 'Загрузка завершена', count: total })
    figma.notify('DSDTF: Создано ' + total + ' стилей')
    figma.closePlugin()
  } catch (err) {
    figma.ui.postMessage({ type: 'error', text: String(err) })
    figma.notify('Ошибка: ' + String(err), { error: true })
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
