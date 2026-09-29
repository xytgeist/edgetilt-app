/**
 * EdgeiOS bet sheet auto-tap for polymarket.us (injected by `EdgeBetSheet.swift` after the ticket page loads).
 * Contract: docs/ios-native-bridge.md "Bet sheet".
 *
 * Mobile polymarket.us only opens the trade sheet from a user tap, so `?marketSlug=&outcomeId=` alone lands on
 * the game. This reads the market from their public gateway, then drives the board: tab → category pill →
 * player row → line dial → Yes → (No inside the sheet). Any miss just leaves the game page.
 */
;(function () {
  if (window.__edgeBetPickStarted) return
  window.__edgeBetPickStarted = true
  // lg+ keeps the desktop trade rail, which already honors marketSlug/outcomeId.
  if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) return

  var GATEWAY = 'https://gateway.polymarket.us/v1/events/slug/'
  var CATEGORY_LABEL = {
    touchdowns: 'Anytime Touchdowns',
    first_touchdown: 'First Touchdown',
    fantasy_points_ppr: 'Fantasy Points (PPR)',
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms) })
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9+.]+/g, ' ').trim()
  }
  function firstLine(el) {
    return norm(String(el.innerText || '').split('\n')[0])
  }
  function visible(el) {
    var r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  async function waitFor(fn, ms) {
    var t0 = Date.now()
    while (Date.now() - t0 < (ms || 8000)) {
      var v = fn()
      if (v) return v
      await sleep(150)
    }
    return null
  }
  /** The line dial picks from pointer coordinates, so a bare `.click()` always lands on the first notch. */
  async function tapAt(el) {
    var r = el.getBoundingClientRect()
    var x = r.left + r.width / 2
    var y = r.top + r.height / 2
    var t = document.elementFromPoint(x, y) || el
    var o = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 }
    t.dispatchEvent(new PointerEvent('pointerdown', o))
    await sleep(40)
    t.dispatchEvent(new PointerEvent('pointerup', o))
    t.dispatchEvent(new MouseEvent('click', o))
  }
  function inSheet(el) {
    return Boolean(el.closest('[role=dialog]'))
  }
  /** Rows past "Show N more" still lay out, just clipped, so only a hit-test says they are tappable. */
  function onScreen(el) {
    var r = el.getBoundingClientRect()
    var hit = document.elementFromPoint(r.left + Math.min(40, r.width / 2), r.top + r.height / 2)
    return Boolean(hit && el.contains(hit))
  }

  function categoryLabel(sportsType) {
    var key = String(sportsType || '').toLowerCase().replace(/^football_player_/, '')
    if (CATEGORY_LABEL[key]) return CATEGORY_LABEL[key]
    return key.split('_').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1) }).join(' ')
  }

  async function openTab(label) {
    var want = norm(label)
    var tab = await waitFor(function () {
      return Array.prototype.find.call(document.querySelectorAll('[role=tab]'), function (t) {
        return norm(t.innerText) === want
      })
    }, 10000)
    if (!tab) return false
    // Android WebView can run this before React hydrates, and those early clicks are dropped.
    for (var i = 0; i < 12 && tab.getAttribute('aria-selected') !== 'true'; i++) {
      tab.scrollIntoView({ block: 'center' })
      await sleep(200)
      tab.click()
      await sleep(700)
      if (!tab.isConnected) tab = Array.prototype.find.call(document.querySelectorAll('[role=tab]'), function (t) {
        return norm(t.innerText) === want
      }) || tab
    }
    return tab.getAttribute('aria-selected') === 'true'
  }

  async function openCategory(label) {
    var want = norm(label)
    var find = function () {
      return Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
        return visible(b) && !inSheet(b) && firstLine(b) === want
      })
    }
    var pill = await waitFor(find)
    if (!pill) return false
    for (var i = 0; i < 12; i++) {
      pill.scrollIntoView({ block: 'nearest', inline: 'center' })
      pill.click()
      await sleep(700)
      pill = find() || pill
      if (!pill.hasAttribute('aria-pressed') || pill.getAttribute('aria-pressed') === 'true') return true
    }
    return false
  }

  function findPlayerRow(player) {
    var want = norm(player)
    var rows = document.querySelectorAll('div.flex.min-h-6')
    for (var i = 0; i < rows.length; i++) {
      if (!inSheet(rows[i]) && norm(rows[i].innerText).indexOf(want) === 0) return rows[i]
    }
    // Class names drift … fall back to any Yes button whose nearby ancestor starts with the name.
    var yesButtons = document.querySelectorAll('button')
    for (var j = 0; j < yesButtons.length; j++) {
      var b = yesButtons[j]
      if (inSheet(b) || firstLine(b).indexOf('yes') !== 0) continue
      var p = b.parentElement
      for (var k = 0; k < 4 && p; k++, p = p.parentElement) {
        if (norm(p.innerText).indexOf(want) === 0) return p
      }
    }
    return null
  }

  async function setLine(row, line) {
    var pill = row.querySelector('[data-polykit-slot=game-line-pill]')
    if (!pill) return true
    if (pill.getAttribute('aria-expanded') !== 'true') {
      pill.click()
      await sleep(700)
    }
    var rb = row.getBoundingClientRect()
    var dial = null
    var best = Infinity
    document.querySelectorAll('[data-polykit-slot=game-line-dial]').forEach(function (d) {
      var dy = d.getBoundingClientRect().top - rb.bottom
      if (dy >= -5 && dy < 140 && dy < best) {
        best = dy
        dial = d
      }
    })
    if (!dial) return false
    var vp = (dial.querySelector('[data-polykit-slot=game-line-dial-viewport]') || dial).getBoundingClientRect()
    var notches = Array.prototype.slice.call(dial.querySelectorAll('[data-polykit-slot=game-line-dial-notch]'))
    var label = function (n) {
      var m = n.querySelector('[data-measure]')
      return norm(m ? m.textContent : n.textContent)
    }
    var target = notches.find(function (n) { return label(n) === norm(line) })
    if (!target) return false
    var inView = function (n) {
      var q = n.getBoundingClientRect()
      var c = q.left + q.width / 2
      return c > vp.left + 8 && c < vp.right - 8
    }
    // Off-screen rungs: step the dial toward the target one visible edge notch at a time.
    for (var i = 0; i < 14; i++) {
      if (inView(target)) {
        await tapAt(target)
        await sleep(900)
        return true
      }
      var shown = notches.filter(inView)
      if (!shown.length) return false
      var tr = target.getBoundingClientRect()
      var step = tr.left + tr.width / 2 >= vp.right - 8 ? shown[shown.length - 1] : shown[0]
      await tapAt(step)
      await sleep(700)
    }
    return false
  }

  /** Taps landing mid-hydration or while the line dial closes are swallowed, so retry until the trade sheet opens. */
  async function clickUntilSheet(btn) {
    for (var i = 0; i < 8; i++) {
      btn.click()
      if (await waitFor(function () { return document.querySelector('[role=dialog]') }, 1200)) return true
    }
    return false
  }

  async function chooseNoInSheet() {
    var no = await waitFor(function () {
      var dlg = document.querySelector('[role=dialog]')
      if (!dlg) return null
      return Array.prototype.find.call(dlg.querySelectorAll('[role=radio],button'), function (b) {
        return /^no\b/.test(firstLine(b))
      })
    }, 4000)
    if (no && no.getAttribute('aria-checked') !== 'true') no.click()
  }

  async function pickPlayerProp(market, side) {
    var meta = market.metadata || {}
    if (!meta.playerName) return
    if (!(await openTab('Player Props'))) return
    if (!(await openCategory(categoryLabel(market.sportsMarketType)))) return
    var row = await waitFor(function () { return findPlayerRow(meta.playerName) })
    if (!row) return
    row.scrollIntoView({ block: 'center' })
    await sleep(300)
    if (!onScreen(row)) {
      var rowTop = row.getBoundingClientRect().top
      var more = null
      var gap = Infinity
      document.querySelectorAll('button').forEach(function (b) {
        if (!visible(b) || inSheet(b) || !/^show \d* ?more$/.test(firstLine(b))) return
        var d = Math.abs(b.getBoundingClientRect().top - rowTop)
        if (d < gap) {
          gap = d
          more = b
        }
      })
      if (!more) return
      more.click()
      await sleep(700)
      row = findPlayerRow(meta.playerName)
      if (!row) return
      row.scrollIntoView({ block: 'center' })
      await sleep(300)
    }
    if (meta.lineLabel && !(await setLine(row, meta.lineLabel))) return
    var yes = Array.prototype.find.call(row.querySelectorAll('button'), function (b) {
      return firstLine(b).indexOf('yes') === 0
    })
    if (!yes) return
    if (!(await clickUntilSheet(yes))) return
    if (side === 'no') await chooseNoInSheet()
  }

  async function pickMoneyline(market, side) {
    var sides = Array.isArray(market.marketSides) ? market.marketSides : []
    var pick = sides.find(function (s) { return Boolean(s.long) === (side === 'yes') })
    var team = pick && pick.team ? pick.team.safeName || pick.team.name : ''
    if (!team) return
    if (!(await openTab('Game Lines'))) return
    var want = norm(team)
    var btn = await waitFor(function () {
      return Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
        return visible(b) && !inSheet(b) && norm(b.innerText).indexOf(want) === 0
      })
    })
    if (!btn) return
    btn.scrollIntoView({ block: 'center' })
    await sleep(200)
    await clickUntilSheet(btn)
  }

  async function run() {
    var q = new URLSearchParams(location.search)
    var slug = q.get('marketSlug')
    var outcome = q.get('outcomeId') || ''
    var m = location.pathname.match(/^\/sports\/[^/]+\/([^/?#]+)/)
    if (!slug || !m) return
    var side = /-short$/.test(outcome) ? 'no' : 'yes'
    var res = await fetch(GATEWAY + encodeURIComponent(decodeURIComponent(m[1])))
    if (!res.ok) return
    var data = await res.json()
    var markets = (data && data.event && data.event.markets) || []
    var market = markets.find(function (x) { return x.slug === slug })
    if (!market) return
    var type = String(market.sportsMarketType || '')
    if (type.indexOf('player') !== -1) await pickPlayerProp(market, side)
    else if (type === 'football_team_full_game_winner') await pickMoneyline(market, side)
  }

  run().catch(function () {})
})()
