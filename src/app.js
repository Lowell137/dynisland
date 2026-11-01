const { invoke } = window.__TAURI__.core
const { listen } = window.__TAURI__.event
const $ = (id) => document.getElementById(id)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// SVG elements have no `hidden` property, so toggle the attribute directly
const show = (el, on) => el.toggleAttribute('hidden', !on)
const island = $('island')
const store = {
  get(k, d) { try { const v = localStorage.getItem('di.' + k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem('di.' + k, JSON.stringify(v)) } catch {} }
}

// ---------------- settings (edited in the settings window, shared through localStorage) ----------------
let S = loadSettings()
let T = makeT(S)

// ---------------- island shapes ----------------
let clipBig = false, clipKb = false, pickerTall = false, toastRich = false
const OPEN = () => ({ w: 660 * 1, h: clipBig ? 500 : pickerTall ? 440 : 236 })
let mode = 'line', morphTok = 0, curWin = [220, 14], near = false
const pillH = () => (S.size === 'small' ? 26 : 32)

function shapeFor(m) {
  if (m === 'open') { const o = OPEN(); return { w: o.w, h: o.h, br: Math.round(28 * S.round / 100), win: [o.w, o.h] } }
  if (m === 'peek') return { w: 340, h: 60, br: 24, win: [340, 60] }
  if (m === 'toast') return toastRich ? { w: 420, h: 82, br: 26, win: [420, 82] } : { w: 320, h: 40, br: 20, win: [320, 40] }
  if (m === 'timer') { const w = S.size === 'small' ? 170 : 200; return { w, h: pillH(), br: pillH() / 2, win: [w, pillH()] } }
  if (m === 'pill') { const w = S.size === 'small' ? 230 : 300; return { w, h: pillH(), br: pillH() / 2, win: [w, pillH()] } }
  return { w: 110, h: near ? 6 : 4, br: 6, win: [220, 14] }
}
function morph(m) {
  if (m !== 'open') { closeClipPreview(); endClipKb(); closePickers(); dropKeyboard() }
  const tok = ++morphTok
  island.style.setProperty('--fh', OPEN().h + 'px')
  const to = shapeFor(m)
  invoke('set_hot_zone', { width: to.w, height: to.h })
  const grow = to.win[0] > curWin[0] || to.win[1] > curWin[1]
  if (grow) {
    // grow the window and start the CSS animation in the same frame
    curWin = [Math.max(to.win[0], curWin[0]), Math.max(to.win[1], curWin[1])]
    invoke('set_size', { width: curWin[0], height: curWin[1] })
  }
  mode = m
  island.className = island.className.replace(/mode-\w+/g, '').trim() + ' mode-' + m
  island.style.setProperty('--w', to.w + 'px'); island.style.setProperty('--h', to.h + 'px'); island.style.setProperty('--br', to.br + 'px')
  island.style.setProperty('--s', 1)
  trackRegion()
  if (!grow) setTimeout(() => {
    if (tok !== morphTok) return
    curWin = to.win; invoke('set_size', { width: to.win[0], height: to.win[1] })
  }, Math.round(520 / (S.animSpeed || 1)))
}
// The OS window is clipped to the island's shape; this follows the island while it animates.
let lastRegion = ''
function updateRegion() {
  const r = island.getBoundingClientRect(), d = window.devicePixelRatio || 1
  const br = parseFloat(getComputedStyle(island).borderBottomLeftRadius) || 0
  const a = { x: Math.round(r.left * d), width: Math.round(r.width * d), height: Math.round(r.bottom * d), radius: Math.round(br * d) }
  const key = JSON.stringify(a)
  if (key !== lastRegion) { lastRegion = key; invoke('set_region', a) }
}
function trackRegion(ms) {
  ms = ms || Math.round(900 / (S.animSpeed || 1))
  const t0 = performance.now()
  ;(function f() { updateRegion(); if (performance.now() - t0 < ms) requestAnimationFrame(f) })()
}
window.addEventListener('resize', () => trackRegion(200))
const closedMode = () => (tm.running && S.timerClosed ? 'timer' : S.closedStyle === 'pill' ? 'pill' : 'line')
const goClosed = () => morph(closedMode())

// ---------------- pickers (apps, languages): the island grows for them and they close with the page ----------------
function closePickers() { document.querySelectorAll('#pages .apk .apkClose').forEach((b) => b.click()) }
function pickerOpened() { pickerTall = true; morph('open') }
// runs after the current event: if the island is closing, there is nothing left to resize
function pickerClosed() { Promise.resolve().then(() => { if (document.querySelector('#pages .apk')) return; pickerTall = false; if (mode === 'open') morph('open') }) }
async function pickAppHere() {
  pickerOpened()
  const a = await pickApp($('pages'), T)
  pickerClosed()
  return a
}

// ---------------- typing: the keyboard is borrowed only while a text box is used ----------------
let keyboardHeld = false
async function grabKeyboard(el) {
  keyboardHeld = true
  await invoke('take_focus')
  el.focus()
  // the first activation arrives a moment later and moves focus again, so put it back
  setTimeout(() => { if (keyboardHeld && el.isConnected && document.activeElement !== el && !document.activeElement.matches('textarea, input')) el.focus() }, 150)
}
function dropKeyboard() {
  if (!keyboardHeld) return
  keyboardHeld = false
  if (document.activeElement) document.activeElement.blur()
  invoke('release_focus')
}
window.grabKeyboard = grabKeyboard
document.addEventListener('pointerdown', (e) => {
  if (e.target.matches('textarea, input:not([type=range])')) grabKeyboard(e.target)
}, true)

// ---------------- opening / closing ----------------
let hoverT, leaveT, dragging = false
const openNow = () => {
  clearTimeout(leaveT); clearTimeout(hoverT)
  if (mode === 'toast' && toastRich) showPage('notif')
  if (mode !== 'open') morph('open')
}
const wantHover = () => S.openMode === 'hover'
window.addEventListener('mousemove', () => {
  clearTimeout(leaveT)
  if (mode === 'open' || !wantHover()) return
  clearTimeout(hoverT); hoverT = setTimeout(openNow, S.delay)
})
document.documentElement.addEventListener('mouseenter', () => { clearTimeout(leaveT); if (mode !== 'open' && wantHover()) { clearTimeout(hoverT); hoverT = setTimeout(openNow, S.delay) } })
document.documentElement.addEventListener('mouseleave', () => {
  clearTimeout(hoverT); clearTimeout(leaveT)
  leaveT = setTimeout(() => { if (!dragging && mode === 'open') goClosed() }, 250)
})
// the closed window is larger than the visible line, so listen on the whole page
document.documentElement.addEventListener('mousedown', () => { if (mode !== 'open' && S.openMode === 'click') openNow() })
// the cursor is polled in Rust so the closed island has a roomy hover zone
listen('hot', ({ payload }) => {
  near = !!payload.on && S.breathe && mode === 'line'
  island.classList.toggle('near', near)
  if (!payload.on) { clearTimeout(hoverT); return }
  if (mode === 'open') return
  if (payload.drag) { openNow(); showPage('shelf'); return }
  // only actually touching the island opens it; coming close just makes it breathe
  if (!payload.touch) { clearTimeout(hoverT); return }
  if (!wantHover()) return
  clearTimeout(hoverT); hoverT = setTimeout(openNow, S.delay)
})

// ---------------- pages ----------------
const ORDER = ['home', 'shelf', 'clip', 'timer', 'notif']
let page = 'home'
function showPage(p) {
  closePickers()
  page = p
  homeIcon()
  document.querySelectorAll('.page').forEach((el) => el.classList.toggle('on', el.id === p))
  document.querySelectorAll('nav [data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === p))
  $('clearShelf').hidden = !(p === 'shelf' && shelf.length)
  if (p === 'notif') { unread = false; $('bellDot').hidden = true }
  if (p === 'sys') pollSys()
  if (p !== 'clip') { if (clipBig) { closeClipPreview(); morph('open') } endClipKb() }
}
document.querySelectorAll('nav [data-page]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)))
$('gearBtn').onclick = () => invoke('open_settings')

let slide = 0
function setSlide(i) {
  slide = i
  $('slides').style.transform = `translateX(${-50 * i}%)`
  document.querySelectorAll('#pdots i').forEach((d, n) => d.classList.toggle('on', n === i))
}
document.querySelectorAll('#pdots i').forEach((d, n) => d.addEventListener('click', () => setSlide(n)))
$('home').addEventListener('wheel', (e) => { if (e.target.id === 'note' || e.target.closest('#lyBox')) return; setSlide(e.deltaY > 0 ? 1 : 0) })

// ---------------- notifications ----------------
let notifs = store.get('notifs2', []), unread = false, toastT
function logNotif(n, quiet) {
  notifs.unshift(n); notifs = notifs.slice(0, 60); store.set('notifs2', notifs)
  renderNotifs()
  if (!quiet && (page !== 'notif' || mode !== 'open')) { unread = true; $('bellDot').hidden = false }
}
function notify(text, silent, important) {
  // only things that matter (a finished timer) go to the log; "copied" and the like are just a passing toast
  if (important) logNotif({ t: Date.now(), app: 'DynIsland', title: text })
  if (silent || !S.notif) return
  showToast(text)
}
function showToast(text) {
  toastRich = false; island.classList.remove('rich')
  if (mode === 'open') {
    const el = $('toast'); el.textContent = text; el.classList.add('show')
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800)
  } else {
    $('noteToastText').textContent = text
    morph('toast'); clearTimeout(toastT)
    toastT = setTimeout(() => { if (mode === 'toast') goClosed() }, S.notifSec * 1000)
  }
}
function renderNotifs() {
  const box = $('notifList')
  box.innerHTML = notifs.length ? '' : `<div class="none">${T('no_notifs')}</div>`
  for (const n of notifs) {
    const d = document.createElement('div'); d.className = 'nItem'
    d.innerHTML = '<div class="nTop"><img alt="" hidden><b></b><time></time><div class="x">×</div></div><div class="nTitle"></div><div class="nBody"></div>'
    const info = notifApp(n)
    d.querySelector('b').textContent = info.name
    if (info.icon) { const im = d.querySelector('img'); im.src = info.icon; im.hidden = false }
    if (n.handler || n.launch) { d.classList.add('act'); d.onclick = () => openNotif(n) }
    const when = new Date(n.t), today = when.toDateString() === new Date().toDateString()
    d.querySelector('time').textContent = today ? when.toLocaleTimeString(T.locale, { hour: '2-digit', minute: '2-digit' }) : when.toLocaleDateString(T.locale, { day: 'numeric', month: 'short' })
    d.querySelector('.nTitle').textContent = n.title
    d.querySelector('.nBody').textContent = n.body || ''
    d.querySelector('.x').onclick = (e) => { e.stopPropagation(); notifs = notifs.filter((x) => x !== n); store.set('notifs2', notifs); renderNotifs() }
    box.appendChild(d)
  }
}
$('clearNotif').onclick = () => { notifs = []; store.set('notifs2', notifs); renderNotifs() }

// Windows' own notifications: read by the backend; ids make sure each one is only ever shown once
let seenToast = store.get('seenToast', 0)
function appName(h) {
  if (!h) return 'Windows'
  const file = h.split(/[\\/]/).pop().replace(/\.exe$/i, '')
  if (file !== h) return file
  const id = h.split('!')[0].split('_')[0].split('.').filter((p) => !/^(com|org|net|app|inc|squirrel|microsoft|windows)$/i.test(p))
  return id.pop() || h
}
// the Start menu list gives notifications their real app name and icon
let appMap = null
function loadAppMap() {
  if (appMap) return
  appMap = new Map()
  invoke('list_apps').then((json) => {
    if (!json) return
    for (const a of JSON.parse(json)) appMap.set(a.shell.toLowerCase(), a)
    renderNotifs()
  })
}
function notifApp(n) {
  const a = n.handler && appMap && appMap.get(('shell:AppsFolder\\' + n.handler).toLowerCase())
  return a ? { name: a.name, icon: a.icon ? 'data:image/png;base64,' + a.icon : null } : { name: n.app, icon: null }
}
// back to what the notification points at, otherwise just the app that sent it
function openNotif(n) {
  if (n.launch) invoke('open_link', { uri: n.launch })
  else if (n.handler) invoke('open_with', { exe: 'shell:AppsFolder\\' + n.handler, files: [] })
  notifs = notifs.filter((x) => x !== n); store.set('notifs2', notifs); renderNotifs()
  goClosed()
}
function showNotifToast(n) {
  if (mode === 'open') { showToast(`${notifApp(n).name}: ${n.title}`); return }
  const info = notifApp(n)
  $('ntApp').textContent = info.name; $('ntTitle').textContent = n.title; $('ntBody').textContent = n.body || ''
  show($('ntIcon'), !!info.icon); if (info.icon) $('ntIcon').src = info.icon
  toastRich = true; island.classList.add('rich')
  morph('toast'); clearTimeout(toastT)
  toastT = setTimeout(() => { if (mode === 'toast') { goClosed(); toastRich = false; island.classList.remove('rich') } }, S.notifSec * 1000)
}
listen('wnotif', ({ payload: p }) => {
  if (p.id <= seenToast) return
  seenToast = p.id; store.set('seenToast', seenToast)
  if (!S.winNotif) return
  loadAppMap()
  const n = { t: p.t, app: appName(p.handler), handler: p.handler, launch: p.launch, title: p.title, body: p.body }
  logNotif(n, p.old)
  if (!p.old && S.notif && S.winToast) showNotifToast(n)
})
// going to the toast opens the list, where each notification can be clicked
$('note-toast').addEventListener('mouseenter', () => { if (toastRich) showPage('notif') })

// ---------------- media ----------------
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
let m = { title: null, pos: 0, end: 0, playing: false, at: 0 }, firstMedia = true, lastKey = '', accentAuto = '#ffd400'
const BADGES = [[/spotify/i, 'Sp', '#1db954'], [/chrome|msedge|firefox|brave|opera|vivaldi/i, 'Web', '#3a7bd5'], [/music|itunes|apple/i, '♪', '#fa243c'], [/vlc/i, 'VLC', '#ff8800'], [/youtube/i, 'YT', '#ff0000']]
function badge(app) {
  const el = $('srcBadge'); if (!app || !S.appIcon) { el.hidden = true; return }
  const b = BADGES.find(([re]) => re.test(app))
  el.hidden = false
  el.textContent = b ? b[1] : app.replace(/\.exe$/i, '').slice(0, 2).toUpperCase()
  el.style.color = b ? b[2] : '#fff'
}
function applyAccent() {
  const c = S.accent === 'auto' ? accentAuto : S.accent
  document.documentElement.style.setProperty('--accent', c)
  island.classList.toggle('idle', !(m.title && m.playing) && !tm.running)
}
function pickColor(src) {
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 16
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16)
    const d = x.getImageData(0, 0, 16, 16).data
    // weighted average of the colourful pixels, then softened to a pastel like the original
    let ws = 0, rs = 0, gs = 0, bs = 0
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const w = (mx ? (mx - mn) / mx : 0) * (mx / 255) + .01
      ws += w; rs += r * w; gs += g * w; bs += b * w
    }
    const r = rs / ws / 255, g = gs / ws / 255, b = bs / ws / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn
    let h = 0
    if (dl) h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4
    h = Math.round(((h * 60) + 360) % 360)
    const s = Math.min(62, Math.max(30, (dl / (1 - Math.abs(mx + mn - 1) || 1)) * 100 * 0.8))
    accentAuto = `hsl(${h}, ${Math.round(s)}%, 70%)`; applyAccent()
  }
  img.src = src
}
listen('media', ({ payload: p }) => {
  if (p.type === 'art') {
    const ok = !!p.value && p.value.length > 200
    for (const id of ['art', 'peekArt', 'cArtImg']) {
      const el = $(id)
      el.onerror = () => { el.style.display = 'none'; if (id === 'cArtImg') $('cArt').classList.remove('has') }
      el.style.display = ok ? 'block' : 'none'
      if (ok) el.src = p.value
    }
    $('cArt').classList.toggle('has', ok)
    if (ok) pickColor(p.value); else { accentAuto = '#ffd400'; applyAccent() }
    return
  }
  if (performance.now() < mediaLock) p = { ...p, playing: m.playing, shuffle: m.shuffle, repeat: m.repeat }
  m = { ...p, at: performance.now() }
  const has = !!p.title
  $('title').textContent = has ? p.title : T('nothing')
  $('artist').textContent = has ? (p.artist || '') : ''
  $('peekTitle').textContent = p.title || ''; $('peekArtist').textContent = p.artist || ''
  show($('icPlay'), !(has && p.playing)); show($('icPause'), !!(has && p.playing))
  $('bShuffle').classList.toggle('act', !!p.shuffle)
  $('bRepeat').classList.toggle('act', p.repeat && p.repeat !== 'None'); $('repOne').hidden = p.repeat !== 'Track'
  badge(has ? p.app : null)
  island.classList.toggle('playing', has && !!p.playing)
  applyAccent()
  const key = (p.title || '') + '|' + (p.artist || '')
  // empty reports from the helper (startup, a player pausing) aren't a new track, so they never pop the island
  if (has && key !== lastKey) {
    lastKey = key
    if (!firstMedia && mode !== 'open') {
      if (S.bounce) { island.classList.remove('bounce'); void island.offsetWidth; island.classList.add('bounce') }
      if (S.preview) peek()
    }
    firstMedia = false
    if (lyOpen) loadLyrics()
  }
})
let peekT
function peek() {
  if (mode === 'open') return
  morph('peek'); clearTimeout(peekT)
  peekT = setTimeout(() => { if (mode === 'peek') goClosed() }, S.previewSec * 1000)
}
setInterval(() => {
  if (mode !== 'open' || page !== 'home') return
  const pos = m.title ? m.pos + (m.playing ? (performance.now() - m.at) / 1000 : 0) : 0
  const p = m.end ? Math.min(pos, m.end) : pos
  $('tPos').textContent = fmt(p)
  $('tEnd').textContent = S.remaining && m.end ? '-' + fmt(m.end - p) : fmt(m.end)
  if (!seeking) { const pc = m.end ? (p / m.end) * 100 : 0; $('fill').style.width = pc + '%'; $('knob').style.left = pc + '%' }
  $('clock').textContent = new Date().toLocaleTimeString(T.locale, { hour: '2-digit', minute: '2-digit', hour12: false })
}, 250)
const mc = (c) => invoke('media_cmd', { cmd: c })
// Buttons react instantly (optimistic); the player's real state takes over after a short lock.
let mediaLock = 0
const curPos = () => (m.title ? m.pos + (m.playing ? (performance.now() - m.at) / 1000 : 0) : 0)
function paintTransport() {
  const has = !!m.title
  show($('icPlay'), !(has && m.playing)); show($('icPause'), has && !!m.playing)
  island.classList.toggle('playing', has && !!m.playing)
  $('bShuffle').classList.toggle('act', !!m.shuffle)
  $('bRepeat').classList.toggle('act', !!m.repeat && m.repeat !== 'None'); show($('repOne'), m.repeat === 'Track')
}
$('bPlay').onclick = () => {
  if (m.title) { m.pos = curPos(); m.at = performance.now(); m.playing = !m.playing; mediaLock = performance.now() + 900; paintTransport() }
  mc('toggle')
}
$('bNext').onclick = () => mc('next'); $('bPrev').onclick = () => mc('prev')
$('bShuffle').onclick = () => { m.shuffle = !m.shuffle; mediaLock = performance.now() + 900; paintTransport(); mc('shuffle') }
$('bRepeat').onclick = () => {
  const order = ['None', 'List', 'Track']
  m.repeat = order[(order.indexOf(m.repeat || 'None') + 1) % 3]; mediaLock = performance.now() + 900; paintTransport(); mc('repeat')
}
let seeking = false
const seekEl = $('seek')
function seekTo(e, commit) {
  const r = seekEl.getBoundingClientRect(), sc = r.width / seekEl.offsetWidth || 1
  const f = Math.min(1, Math.max(0, (e.clientX - r.left) / (seekEl.offsetWidth * sc)))
  $('fill').style.width = f * 100 + '%'; $('knob').style.left = f * 100 + '%'
  if (commit && m.end) { mc('seek:' + (f * m.end).toFixed(1)); m.pos = f * m.end; m.at = performance.now() }
}
seekEl.addEventListener('pointerdown', (e) => { seeking = true; seekEl.classList.add('drag'); seekEl.setPointerCapture(e.pointerId); seekTo(e, false) })
seekEl.addEventListener('pointermove', (e) => { if (seeking) seekTo(e, false) })
seekEl.addEventListener('pointerup', (e) => { if (!seeking) return; seeking = false; seekEl.classList.remove('drag'); seekTo(e, true) })

// visualizer: bar heights follow the real output peak level
let peak = 0, bars = new Array(32).fill(0)
listen('peak', ({ payload }) => { peak = payload })
const vz = $('viz').getContext('2d')
function drawViz(t) {
  requestAnimationFrame(drawViz)
  if (mode !== 'open' || page !== 'home' || slide !== 0) return
  const c = $('viz'), w = c.width, h = c.height
  vz.clearRect(0, 0, w, h)
  const n = bars.length, bw = w / n, live = m.playing ? Math.min(1, peak * 1.8) : 0
  vz.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent')
  for (let i = 0; i < n; i++) {
    const wob = .35 + .65 * Math.abs(Math.sin(t / 260 + i * 0.9) * Math.cos(t / 410 + i * 0.37))
    const target = live * wob
    bars[i] += (target - bars[i]) * (target > bars[i] ? .5 : .12)
    const bh = bars[i] * h
    if (bh < 1.5) continue
    vz.globalAlpha = .85
    vz.beginPath(); vz.roundRect(i * bw + 1, h - bh, bw - 2, bh, 2); vz.fill()
  }
}
requestAnimationFrame(drawViz)

// ---------------- calendar + weather ----------------
function renderCal() {
  const d = new Date(), L = T.locale, ws = T.weekStart
  $('month').textContent = d.toLocaleDateString(L, { month: 'long', year: 'numeric' })
  $('date').textContent = d.toLocaleDateString(L, { weekday: 'long', day: 'numeric', month: 'long' })
  const first = new Date(d.getFullYear(), d.getMonth(), 1), lead = (first.getDay() - ws + 7) % 7, days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  let html = ''
  for (let i = 0; i < 7; i++) html += `<span class="h">${new Date(2023, 0, 1 + ((ws + i) % 7)).toLocaleDateString(L, { weekday: 'short' })}</span>`
  for (let i = 0; i < lead; i++) html += '<span></span>'
  for (let i = 1; i <= days; i++) html += `<span class="${i === d.getDate() ? 'today' : ''}">${i}</span>`
  $('cal').innerHTML = html
}
const WX = {
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600l1.400 1.400M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 8.500 4 4 0 0 1 17.500 18z"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><path d="M7 15a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 5.500 4 4 0 0 1 17.500 15zM8 18l-1 2.500M12 18l-1 2.500M16 18l-1 2.500"/></svg>',
  snow: '<svg viewBox="0 0 24 24"><path d="M7 15a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 5.500 4 4 0 0 1 17.500 15zM8 19h.01M12 20h.01M16 19h.01"/></svg>',
  fog: '<svg viewBox="0 0 24 24"><path d="M4 9h16M6 13h12M4 17h16"/></svg>',
  storm: '<svg viewBox="0 0 24 24"><path d="M7 14a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 4.500 4 4 0 0 1 17.500 14zM12.500 14l-2 3.500h3l-2 3.500"/></svg>'
}
const wxKind = (c) => c === 0 ? 'sun' : c <= 3 ? 'cloud' : c <= 48 ? 'fog' : c <= 67 || (c >= 80 && c <= 82) ? 'rain' : c <= 77 || c === 85 || c === 86 ? 'snow' : 'storm'
let wxCoords = null, wxKey = ''
async function loadWeather() {
  if (!S.weather) { $('wx').hidden = true; return }
  try {
    const key = S.city.trim()
    if (!wxCoords || wxKey !== key) {
      if (key) {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}&count=1`).then((x) => x.json())
        const g = r.results && r.results[0]; if (!g) throw 0
        wxCoords = [g.latitude, g.longitude]
      } else {
        const loc = await invoke('get_location'); if (!loc) throw 0
        wxCoords = loc
      }
      wxKey = key
    }
    const unit = S.unit === 'F' ? '&temperature_unit=fahrenheit' : ''
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${wxCoords[0]}&longitude=${wxCoords[1]}&current=temperature_2m,weather_code${unit}`).then((x) => x.json())
    $('wxIcon').innerHTML = WX[wxKind(r.current.weather_code)]
    $('wxTemp').textContent = Math.round(r.current.temperature_2m) + '°'
    $('wx').hidden = false
  } catch { $('wx').hidden = true }
}

// ---------------- notes ----------------
$('note').value = store.get('note', '')
$('note').addEventListener('input', () => { store.set('note', $('note').value); $('noteCount').textContent = $('note').value.length || '' })
$('noteCount').textContent = $('note').value.length || ''

// ---------------- volume (system), inline slider ----------------
const volFill = () => $('volRange').style.setProperty('--p', $('volRange').value + '%')
async function refreshVolume() {
  const v = await invoke('get_volume')
  $('volRange').value = Math.round(v.level * 100); volFill()
  show($('icVol'), !v.muted); show($('icMute'), !!v.muted)
}
$('volGrp').addEventListener('mouseenter', refreshVolume)
$('volRange').addEventListener('input', (e) => { volFill(); invoke('set_volume', { level: e.target.value / 100 }); show($('icVol'), true); show($('icMute'), false) })
$('volBtn').onclick = async () => { await invoke('toggle_mute'); refreshVolume() }
$('volGrp').addEventListener('wheel', (e) => { const r = $('volRange'); r.value = Math.min(100, Math.max(0, +r.value + (e.deltaY < 0 ? 4 : -4))); r.dispatchEvent(new Event('input')) })

// ---------------- timer / stopwatch ----------------
const tm = { sw: false, running: false, total: 300, left: 300, start: 0, base: 0, id: null }
function tmText() {
  const s = tm.sw ? tm.base + (tm.running ? (performance.now() - tm.start) / 1000 : 0) : tm.left
  const x = Math.max(0, Math.floor(tm.sw ? s : Math.ceil(s)))
  const h = Math.floor(x / 3600), mi = Math.floor((x % 3600) / 60), se = x % 60
  return (h ? h + ':' + String(mi).padStart(2, '0') : mi) + ':' + String(se).padStart(2, '0')
}
function tmRender() {
  const t = tmText(); $('tBig').textContent = t; $('cTime').textContent = mode === 'timer' || tm.running ? t : ''
  $('tGo').textContent = tm.running ? T('pause') : (tm.sw ? (tm.base ? T('resume') : T('start')) : (tm.left < tm.total ? T('resume') : T('start')))
  $('presets').classList.toggle('hide', tm.sw)
}
function tmTick() {
  if (!tm.sw) {
    tm.left = Math.max(0, tm.total - (performance.now() - tm.start) / 1000 - tm.base)
    if (tm.left <= 0) { tmStop(); tm.left = 0; tm.base = 0; tmDone() }
  }
  tmRender()
}
function tmGo() {
  if (tm.running) { tm.base += (performance.now() - tm.start) / 1000; tmStop(); if (!tm.sw) { tm.total = tm.left; tm.base = 0 } tmRender(); if (mode === 'timer') goClosed(); return }
  if (!tm.sw && tm.left <= 0) tm.left = tm.total
  if (!tm.sw) { tm.total = tm.left; tm.base = 0 }
  tm.start = performance.now(); tm.running = true
  tm.id = setInterval(tmTick, 200); tmRender(); applyAccent()
  if (mode !== 'open' && S.timerClosed) morph('timer')
}
function tmStop() { clearInterval(tm.id); tm.running = false; applyAccent() }
function tmReset() { tmStop(); tm.base = 0; tm.left = tm.total = tm.sw ? 0 : (tm.presetSec || 300); tmRender(); if (mode === 'timer') goClosed() }
function tmDone() {
  notify(T('n_timer'), true, true)
  island.classList.add('timer-done'); setTimeout(() => island.classList.remove('timer-done'), 2600)
  if (S.timerSound) try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .8); o.start(); o.stop(a.currentTime + .8) } catch {}
  if (mode !== 'open') { morph('timer'); setTimeout(() => { if (mode === 'timer' && !tm.running) goClosed() }, 3200) }
}
document.querySelectorAll('#presets button').forEach((b) => b.addEventListener('click', () => { tmStop(); tm.presetSec = b.dataset.m * 60; tm.total = tm.left = tm.presetSec; tm.base = 0; tmRender() }))
$('tGo').onclick = tmGo; $('tReset').onclick = tmReset
$('tabTimer').onclick = () => { tmStop(); tm.sw = false; tm.total = tm.left = tm.presetSec || 300; tm.base = 0; $('tabTimer').classList.add('on'); $('tabSw').classList.remove('on'); tmRender() }
$('tabSw').onclick = () => { tmStop(); tm.sw = true; tm.base = 0; $('tabSw').classList.add('on'); $('tabTimer').classList.remove('on'); tmRender() }

// ---------------- clipboard history ----------------
// items: {k:'text',v} | {k:'image',id,thumb,w,h} | {k:'files',v:[paths]}, plus pin and t (when copied)
let clips = store.get('clips', []).map((c) => (typeof c === 'string' ? { k: 'text', v: c } : c))
let clipFilter = 'all', clipPrev = null, clipSel = -1, clipShown = [], prevT, prevOffT
const clipKey = (c) => c.k + ':' + (c.k === 'image' ? c.id : c.k === 'files' ? c.v.join('|') : c.v)
const isLink = (c) => c.k === 'text' && /^https?:\/\/\S+$/i.test(c.v.trim())
const isColor = (c) => c.k === 'text' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(c.v.trim())
const CLIP_FILTERS = ['all', 'pinned', 'text', 'link', 'image', 'files']
const clipMatches = (c) => clipFilter === 'all' || (clipFilter === 'pinned' && c.pin) || (clipFilter === 'link' && isLink(c)) || (clipFilter === 'text' && c.k === 'text') || clipFilter === c.k
function saveClips() {
  // pinned items never count against the limits
  let imgs = 0, all = 0
  clips = clips.filter((c) => c.pin || ((c.k !== 'image' || ++imgs <= 8) && ++all <= (S.clipMax || 60)))
  store.set('clips', clips)
}
function renderClipFilters() {
  const box = $('clipFilters'); box.innerHTML = ''
  for (const f of CLIP_FILTERS) {
    const b = document.createElement('button'); b.textContent = T('cf_' + f); b.classList.toggle('on', f === clipFilter)
    b.onclick = () => { clipFilter = f; clipSel = clipKb ? 0 : -1; renderClipFilters(); renderClips() }
    box.appendChild(b)
  }
}
function pasteClip(c) {
  if (c.k === 'image') {
    if (S.clipPaste) invoke('paste_image', { id: c.id }).then((ok) => { if (ok) setTimeout(goClosed, 120); else notify(T('n_img_gone')) })
    else invoke('clip_set_image', { id: c.id }).then((ok) => notify(ok ? T('n_copied') : T('n_img_gone')))
  } else if (c.k === 'files') { addFiles(c.v); showPage('shelf') }
  else if (S.clipPaste) { invoke('paste_text', { text: c.v }); setTimeout(goClosed, 120) }
  else { invoke('clip_set', { text: c.v }); notify(T('n_copied')) }
}
function togglePin(c) {
  c.pin = !c.pin
  if (c.k === 'image') invoke('clip_pin_image', { id: c.id, pin: c.pin }).then((ok) => { if (c.pin && !ok) notify(T('n_img_gone')) })
  saveClips(); renderClips(); if (clipPrev === c) renderClipPreview()
}
function removeClip(c) {
  if (c.pin && c.k === 'image') invoke('clip_pin_image', { id: c.id, pin: false })
  clips = clips.filter((x) => x !== c); saveClips(); renderClips()
  if (clipPrev === c) { closeClipPreview(); morph('open') }
}
function renderClips() {
  const box = $('clipList'), q = $('clipQ').value.trim().toLocaleLowerCase()
  // pinned first, otherwise newest first
  clipShown = clips.filter(clipMatches).filter((c) => !q || (c.k === 'text' ? c.v : c.k === 'files' ? c.v.join(' ') : '').toLocaleLowerCase().includes(q))
  clipShown = [...clipShown.filter((c) => c.pin), ...clipShown.filter((c) => !c.pin)]
  box.innerHTML = clipShown.length ? '' : `<div class="none">${T(clips.length ? 'clip_nomatch' : 'clip_empty')}</div>`
  clipShown.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'clipItem' + (c.k === 'image' ? ' img' : '') + (c.pin ? ' pinned' : '') + (i === clipSel ? ' sel' : '')
    if (c.k === 'image') {
      d.innerHTML = '<img alt="">'; d.firstChild.src = c.thumb
    } else if (c.k === 'files') {
      d.innerHTML = '<span></span>'
      d.firstChild.textContent = c.v.map((p) => '📄 ' + p.split(/[\\/]/).pop()).slice(0, 5).join('\n') + (c.v.length > 5 ? `\n+${c.v.length - 5}` : '')
      d.firstChild.style.whiteSpace = 'pre-line'
    } else {
      d.innerHTML = '<span></span>'
      if (isColor(c)) { const s = document.createElement('i'); s.className = 'swatch'; s.style.background = c.v.trim(); d.prepend(s) }
      d.lastChild.textContent = c.v.length > 140 ? c.v.slice(0, 140) + '…' : c.v
      d.lastChild.classList.toggle('link', isLink(c))
    }
    d.insertAdjacentHTML('beforeend', `<div class="pinB" title="${T('clip_pin')}"><i class="gl">&#xE718;</i></div><div class="x">×</div>`)
    d.addEventListener('click', () => pasteClip(c))
    d.addEventListener('mouseenter', () => {
      clearTimeout(prevOffT); clearTimeout(prevT)
      if (!S.clipPreview) return
      // already open: follow the mouse at once; otherwise wait so passing over a card doesn't grow the island
      prevT = setTimeout(() => openClipPreview(c), clipBig ? 0 : 380)
    })
    d.addEventListener('mouseleave', () => clearTimeout(prevT))
    d.querySelector('.pinB').addEventListener('click', (e) => { e.stopPropagation(); togglePin(c) })
    d.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); removeClip(c) })
    box.appendChild(d)
  })
  if (clipSel >= 0 && box.children[clipSel]) box.children[clipSel].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
}
// the preview lives inside the island: the island itself grows downward to make room
function openClipPreview(c) {
  clipPrev = c; renderClipPreview()
  show($('clipPrev'), true); $('clip').classList.add('big')
  if (!clipBig) { clipBig = true; morph('open') }
}
function closeClipPreview() {
  clearTimeout(prevT); clearTimeout(prevOffT)
  clipPrev = null; clipBig = false
  show($('clipPrev'), false); $('clip').classList.remove('big')
}
function renderClipPreview() {
  const c = clipPrev; if (!c) return
  const body = $('cpBody'), acts = $('cpActions'); body.innerHTML = ''; acts.innerHTML = ''
  const when = c.t ? new Date(c.t).toLocaleString(T.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' : ''
  const act = (k, fn, hot) => { const b = document.createElement('button'); b.className = 'chip' + (hot ? ' hot' : ''); b.textContent = T(k); b.onclick = fn; acts.appendChild(b) }
  let meta = ''
  if (c.k === 'image') {
    const im = document.createElement('img'); im.className = 'full'; im.src = c.thumb; body.appendChild(im)
    invoke('clip_preview', { id: c.id }).then((src) => { if (src && clipPrev === c) im.src = src })
    meta = c.w ? `${c.w} × ${c.h} px` : ''
  } else if (c.k === 'files') {
    for (const p of c.v) {
      const r = document.createElement('div'); r.className = 'cpFile'
      r.innerHTML = '<img alt=""><div><span></span><small></small></div>'
      r.querySelector('span').textContent = base(p); r.querySelector('small').textContent = p
      thumbOf(p).then((src) => { if (src) r.firstChild.src = src })
      body.appendChild(r)
    }
    meta = `${c.v.length} ${T('clip_files')}`
  } else if (isColor(c)) {
    body.innerHTML = '<div class="swatchBig"></div>'; body.firstChild.style.background = c.v.trim(); meta = c.v.trim()
  } else {
    const pre = document.createElement('pre'); pre.textContent = c.v; body.appendChild(pre)
    meta = `${c.v.length} ${T('clip_chars')} · ${c.v.split('\n').length} ${T('clip_lines')}`
  }
  $('cpMeta').textContent = when + meta
  act(c.k === 'files' ? 'clip_to_shelf' : S.clipPaste ? 'clip_paste' : 'tr_copy', () => pasteClip(c), true)
  if (isLink(c)) act('clip_open', () => invoke('open_url', { url: c.v.trim() }))
  if (c.k === 'files' && c.v.length === 1) act('clip_open', () => invoke('open_path', { path: c.v[0] }))
  if (c.k === 'text' && !isLink(c) && !isColor(c)) act('tr_lyrics', () => { $('trIn').value = c.v; showPage('trans'); runTranslate() })
  act(c.pin ? 'clip_unpin' : 'clip_pin', () => togglePin(c))
  act('clip_delete', () => removeClip(c))
}
// moving out of the clipboard page (back up to the header, say) folds the preview away
$('clip').addEventListener('mouseleave', () => { clearTimeout(prevT); prevOffT = setTimeout(() => { if (clipBig && !clipKb) { closeClipPreview(); morph('open') } }, 450) })
$('clip').addEventListener('mouseenter', () => clearTimeout(prevOffT))
$('clipQ').addEventListener('input', () => { clipSel = clipKb ? 0 : -1; renderClips() })

// keyboard: the shortcut opens the clipboard, arrows move, Enter pastes, Space previews, Esc closes
function endClipKb() {
  if (!clipKb) return
  clipKb = false; clipSel = -1; invoke('nav_keys', { on: false })
}
listen('clip-key', ({ payload: k }) => {
  if (k === 'toggle') {
    if (clipKb) { goClosed(); return }
    openNow(); showPage('clip'); clipKb = true; clipSel = 0
    invoke('nav_keys', { on: true }); renderClips()
    return
  }
  if (!clipKb) return
  if (k === 'esc') { if (clipBig) { closeClipPreview(); morph('open') } else goClosed(); return }
  const c = clipShown[clipSel]
  if (k === 'left' || k === 'right') {
    if (!clipShown.length) return
    clipSel = (clipSel + (k === 'right' ? 1 : -1) + clipShown.length) % clipShown.length
    renderClips(); if (clipBig) openClipPreview(clipShown[clipSel])
  } else if (k === 'space' && c) {
    if (clipBig) { closeClipPreview(); morph('open') } else openClipPreview(c)
  } else if (k === 'enter' && c) pasteClip(c)
})
listen('clip', ({ payload: p }) => {
  if (S.clipPaused) return
  const item = p.kind === 'image' ? { k: 'image', id: p.id, thumb: p.thumb, w: p.w, h: p.h } : p.kind === 'files' ? { k: 'files', v: p.v } : { k: 'text', v: p.v }
  const key = clipKey(item), old = clips.find((x) => clipKey(x) === key)
  item.t = Date.now(); if (old && old.pin) item.pin = true
  clips = [item, ...clips.filter((x) => x !== old)]; saveClips(); renderClips()
})
// Clear leaves the pinned items alone
$('clearClip').onclick = () => { clips = clips.filter((c) => c.pin); saveClips(); renderClips() }

// ---------------- shelf + quick apps ----------------
let shelf = store.get('shelf', [])
const base = (p) => p.split(/[\\/]/).pop()
const extOf = (p) => { const b = base(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1, i + 5) : '·' }
// preview (picture / real Windows icon) of a file or app, fetched once and cached
const thumbCache = new Map()
function thumbOf(path) {
  if (!thumbCache.has(path)) thumbCache.set(path, invoke('file_thumb', { path }).catch(() => null))
  return thumbCache.get(path)
}
function saveQuick() { saveSettings(S); invoke('settings_changed'); renderQuick() }
function renderShelf() {
  const box = $('files')
  box.innerHTML = ''
  // one centred "drop files here" area that also opens the file picker when clicked
  if (!shelf.length) box.insertAdjacentHTML('beforeend', `<div class="empty"><i class="gl">&#xE710;</i><span>${T('drop_here')}</span></div>`)
  for (const p of shelf) {
    const el = document.createElement('div'); el.className = 'file'; el.title = p
    el.innerHTML = '<div class="ext"></div><img class="thumb" alt="" hidden><span></span><div class="x">×</div>'
    el.querySelector('.ext').textContent = extOf(p); el.querySelector('span').textContent = base(p)
    thumbOf(p).then((src) => { if (src) { const im = el.querySelector('.thumb'); im.src = src; im.hidden = false; el.querySelector('.ext').hidden = true } })
    let down = null
    el.addEventListener('pointerdown', (e) => { if (!e.target.classList.contains('x')) down = [e.clientX, e.clientY] })
    el.addEventListener('pointermove', (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; dragging = true; invoke('start_drag', { path: p }); setTimeout(() => { dragging = false }, 800) }
    })
    el.addEventListener('pointerup', () => { down = null })
    el.addEventListener('dblclick', () => invoke('open_path', { path: p }))
    el.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); shelf = shelf.filter((x) => x !== p); persistShelf() })
    box.appendChild(el)
  }
  const b = $('shelfBadge'); b.hidden = !shelf.length; b.textContent = shelf.length
  $('clearShelf').hidden = !(page === 'shelf' && shelf.length)
}
function renderQuick() {
  const box = $('quick'); box.innerHTML = ''
  // a small line above the apps, there at any count up to the limit
  if ((S.quickApps || []).length < 8) {
    const add = document.createElement('button'); add.className = 'qAdd'
    add.innerHTML = `<i class="gl">&#xE721;</i><span>${T('sh_add_app')}</span>`
    add.addEventListener('click', async () => {
      const a = await pickAppHere(); if (!a) return
      S.quickApps = [...(S.quickApps || []), a]; saveQuick()
    })
    box.appendChild(add)
  }
  for (const [i, q] of (S.quickApps || []).entries()) {
    const t = document.createElement('div'); t.className = 'qtile'; t.dataset.path = q.path; t.title = q.path
    t.innerHTML = '<div class="qi"><span></span><img alt="" hidden></div><span class="qn"></span><div class="x">×</div>'
    t.querySelector('.qi span').textContent = q.name.slice(0, 1).toUpperCase(); t.querySelector('.qn').textContent = q.name
    ;(q.icon ? Promise.resolve(q.icon) : thumbOf(q.path)).then((src) => { if (src) { const im = t.querySelector('.qi img'); im.src = src; im.hidden = false; t.querySelector('.qi span').hidden = true; t.querySelector('.qi').classList.add('real') } })
    t.addEventListener('click', () => invoke('open_with', { exe: q.shell || q.path, files: [] }))
    t.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); S.quickApps = S.quickApps.filter((_, j) => j !== i); saveQuick() })
    box.appendChild(t)
  }
}
function persistShelf() { store.set('shelf', shelf); renderShelf() }
function addFiles(paths) {
  let n = 0
  for (const p of paths) if (!shelf.includes(p)) { shelf.push(p); n++ }
  persistShelf(); if (n) notify(`${n} ${T('n_file')}`)
}
$('clearShelf').onclick = () => { shelf = []; persistShelf() }
// clicking the shelf area (not a file card) opens the file picker
$('files').addEventListener('click', async (e) => {
  if (e.target.closest('.file')) return
  const picked = await invoke('pick_files'); if (picked && picked.length) addFiles(picked)
})
listen('drag-done', ({ payload }) => { if (!S.keepFiles) { shelf = shelf.filter((x) => x !== payload); persistShelf() } })
listen('tauri://drag-enter', () => { dragging = true; openNow(); showPage('shelf') })
listen('tauri://drag-leave', () => { dragging = false; document.querySelectorAll('.over').forEach((e) => e.classList.remove('over')) })
listen('tauri://drag-over', ({ payload }) => {
  const s = window.devicePixelRatio
  const el = document.elementFromPoint(payload.position.x / s, payload.position.y / s)
  document.querySelectorAll('.qtile').forEach((q) => q.classList.toggle('over', !!el && q.contains(el)))
  $('files').classList.toggle('over', !!el && !!el.closest('#files'))
})
listen('tauri://drag-drop', ({ payload }) => {
  const tile = document.querySelector('.qtile.over')
  dragging = false
  document.querySelectorAll('.over').forEach((e) => e.classList.remove('over'))
  if (tile) { invoke('open_with', { exe: tile.dataset.path, files: payload.paths }); notify(`${T('n_sent')} ${tile.querySelector('span').textContent}`) }
  else addFiles(payload.paths)
})
async function initQuickApps() {
  if (S.quickApps) return
  const ls = await invoke('find_localsend')
  S.quickApps = ls ? [{ name: 'LocalSend', path: ls }] : []
  saveSettings(S); renderQuick()
}

// ---------------- translate ----------------
const GOOGLE_LANGS = 'af sq am ar hy as ay az bm eu be bn bho bs bg ca ceb ny zh-CN zh-TW co hr cs da dv doi nl en eo et ee tl fi fr fy gl ka de el gn gu ht ha haw he hi hmn hu is ig ilo id ga it ja jv kn kk km rw gom ko kri ku ckb ky lo la lv ln lt lg lb mk mai mg ms ml mt mi mr mni lus mn my ne no or om ps fa pl pt pa qu ro ru sm sa gd nso sr st sn sd si sk sl so es su sw sv tg ta tt te th ti ts tr tk ak uk ur ug uz vi cy xh yi yo zu'.split(' ')
const DEEPL_LANGS = 'ar bg zh-CN zh-TW cs da nl en et fi fr de el hu id it ja ko lv lt no pl pt ro ru sk sl es sv tr uk'.split(' ')
const trLangList = () => (S.trProvider === 'deepl' ? DEEPL_LANGS : GOOGLE_LANGS)
// each language under the app's language and its own: both can be searched
function langName(code, locale) {
  try { return new Intl.DisplayNames([locale || code], { type: 'language' }).of(code) || code } catch { return code }
}
const trTarget = () => S.trTarget || (T.lang === 'tr' ? 'tr' : 'en')
function setTrTarget(code) {
  S.trTarget = code
  S.trRecent = [code, ...(S.trRecent || []).filter((c) => c !== code)].slice(0, 6)
  saveSettings(S); renderTrLangs(); runTranslate()
}
function pickLang() {
  const box = document.createElement('div'); box.className = 'apk'
  box.innerHTML = '<div class="apkHead"><input class="apkQ" spellcheck="false"><button class="apkClose">×</button></div><div class="apkGrid langs"></div>'
  const q = box.querySelector('.apkQ'), grid = box.querySelector('.apkGrid')
  q.placeholder = T('tr_search')
  const all = trLangList().map((code) => ({ code, name: langName(code, T.locale), own: langName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, T.locale))
  const draw = () => {
    const f = q.value.trim().toLocaleLowerCase(T.locale)
    const list = all.filter((l) => (l.name + ' ' + l.own + ' ' + l.code).toLocaleLowerCase(T.locale).includes(f))
    grid.innerHTML = list.length ? '' : `<div class="apkMsg">${T('tr_nolang')}</div>`
    for (const l of list) {
      const b = document.createElement('button'); b.className = 'langItem'; b.classList.toggle('on', l.code === trTarget())
      b.innerHTML = '<span></span><small></small>'
      b.firstChild.textContent = l.name; b.lastChild.textContent = l.own === l.name ? '' : l.own
      b.onclick = () => { box.remove(); pickerClosed(); setTrTarget(l.code) }
      grid.appendChild(b)
    }
  }
  q.addEventListener('input', draw)
  const close = () => { box.remove(); pickerClosed() }
  box.querySelector('.apkClose').onclick = close
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })
  pickerOpened(); $('pages').appendChild(box); draw(); grabKeyboard(q)
}
const trCall = (text, target) => invoke('translate', { text, target, provider: S.trProvider, key: S.trKey || '' })
const trError = (e) => T(e === 'no_key' ? 'tr_no_key' : e === 'bad_key' ? 'tr_bad_key' : 'tr_failed')
function renderTrLangs() {
  const box = $('trLangs'); box.innerHTML = ''
  // the languages used lately, with the current one always there; everything else is one search away
  const recent = S.trRecent && S.trRecent.length ? S.trRecent : ['tr', 'en', 'de', 'fr', 'es']
  const codes = recent.includes(trTarget()) ? recent : [trTarget(), ...recent]
  for (const code of codes.slice(0, 6)) {
    const b = document.createElement('button'); b.textContent = langName(code); b.classList.toggle('on', code === trTarget())
    b.onclick = () => setTrTarget(code)
    box.appendChild(b)
  }
  const more = document.createElement('button'); more.className = 'trMore'; more.innerHTML = `<i class="gl">&#xE721;</i>${T('tr_more')}`
  more.onclick = pickLang
  box.appendChild(more)
}
let trT, trTok = 0
async function runTranslate() {
  const text = $('trIn').value.trim(), tok = ++trTok
  if (!text) { $('trOut').textContent = ''; $('trOut').classList.remove('err'); $('trCopy').hidden = true; return }
  try {
    const r = await trCall(text, trTarget())
    if (tok !== trTok) return
    $('trOut').textContent = r.text; $('trOut').classList.remove('err'); $('trCopy').hidden = false
  } catch (e) {
    if (tok !== trTok) return
    $('trOut').textContent = trError(e); $('trOut').classList.add('err'); $('trCopy').hidden = true
  }
}
$('trIn').addEventListener('input', () => { clearTimeout(trT); trT = setTimeout(runTranslate, 450) })
$('trCopy').onclick = () => { invoke('clip_set', { text: $('trOut').textContent }); notify(T('n_copied')) }

// ---------------- lyrics ----------------
// Video titles carry noise and often the artist: "Artist - Song (Official Video) [4K]"
function cleanTrack() {
  let title = (m.title || '').replace(/[([][^)\]]*(official|video|audio|lyric|lyrics|visuali[sz]er|hd|4k|remaster\w*|live)[^)\]]*[)\]]/gi, '').replace(/\s+/g, ' ').trim()
  let artist = (m.artist || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim()
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) { artist = dash[1].trim(); title = dash[2].trim() }
  return { title, artist }
}
let ly = { key: null, lines: [], synced: false, tr: null, trOn: false }, lyTok = 0, lyAt = -1, lyOpen = false
function setLyrics(on) {
  lyOpen = on; store.set('lyOpen', on)
  $('home').classList.toggle('lyOn', on); show($('lyBox'), on)
  if (on) { lyAt = -1; loadLyrics() }
}
$('lyBtn').onclick = () => setLyrics(!lyOpen)
function lyMessage(k) { $('lyList').innerHTML = `<div class="none">${T(k)}</div>`; $('lyTr').hidden = true; $('lySrc').textContent = '' }
async function loadLyrics() {
  const has = !!m.title, key = has ? m.title + '|' + (m.artist || '') : ''
  if (key === ly.key) return
  const tok = ++lyTok
  ly = { key, lines: [], synced: false, tr: null, trOn: false }; lyAt = -1
  if (!has) return lyMessage('nothing')
  lyMessage('ly_loading')
  const { title, artist } = cleanTrack()
  const r = await invoke('lyrics', { title, artist, duration: m.end || 0 }).catch(() => null)
  if (tok !== lyTok) return
  if (!r) return lyMessage('ly_none')
  if (r.synced) {
    ly.synced = true
    ly.lines = r.synced.split('\n').map((l) => {
      const x = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/)
      return x && { at: +x[1] * 60 + +x[2], text: x[3] }
    }).filter((l) => l && l.text && !/^(作词|作曲|编曲|制作人)\s*[:：]/.test(l.text)) // NetEase's credit lines
  } else ly.lines = r.plain.split('\n').filter((t) => t.trim()).map((text) => ({ at: 0, text }))
  $('lySrc').textContent = r.source || ''
  renderLyrics()
}
function renderLyrics() {
  const box = $('lyList'); box.innerHTML = ''; lyAt = -1
  ly.lines.forEach((l, i) => {
    const d = document.createElement('div'); d.className = 'lyLine' + (ly.synced ? '' : ' plain')
    d.textContent = l.text
    if (ly.trOn && ly.tr && ly.tr[i]) { const s = document.createElement('small'); s.textContent = ly.tr[i]; d.appendChild(s) }
    if (ly.synced) d.onclick = () => { mc('seek:' + l.at.toFixed(1)); m.pos = l.at; m.at = performance.now() }
    box.appendChild(d)
  })
  $('lyTr').hidden = !ly.lines.length
  $('lyTr').classList.toggle('hot', ly.trOn)
}
$('lyTr').onclick = async () => {
  ly.trOn = !ly.trOn
  if (ly.trOn && !ly.tr) {
    const key = ly.key
    try {
      const r = await trCall(ly.lines.map((l) => l.text).join('\n'), trTarget())
      if (key !== ly.key) return
      const out = r.text.split('\n')
      // only line up when the service kept the line count, otherwise lines would sit under the wrong text
      ly.tr = out.length === ly.lines.length ? out : []
      if (!ly.tr.length) notify(T('tr_failed'))
    } catch (e) { ly.trOn = false; notify(trError(e)) }
  }
  renderLyrics()
}
setInterval(() => {
  if (mode !== 'open' || page !== 'home' || !lyOpen || !ly.synced || !ly.lines.length) return
  const pos = curPos()
  let i = ly.lines.findIndex((l) => l.at > pos); i = i < 0 ? ly.lines.length - 1 : i - 1
  if (i === lyAt) return
  lyAt = i
  const box = $('lyList')
  ;[...box.children].forEach((c, n) => c.classList.toggle('on', n === i))
  const c = box.children[Math.max(i, 0)]
  if (c) box.scrollTo({ top: c.offsetTop - box.clientHeight / 2 + c.offsetHeight / 2, behavior: 'smooth' })
}, 200)

// ---------------- system monitor ----------------
const SYS_CARDS = [['cpu', 'sy_cpu'], ['ram', 'sy_ram'], ['gpu', 'sy_gpu'], ['vram', 'sy_vram'], ['down', 'sy_down'], ['up', 'sy_up']]
const sysHist = {}
function buildSys() {
  $('sysGrid').innerHTML = SYS_CARDS.map(([id, l]) => `<div class="sysCard" id="sc_${id}"><div class="scTop"><span>${T(l)}</span><b></b></div><canvas width="180" height="30"></canvas><small></small></div>`).join('')
}
const gb = (b) => (b / 1073741824).toFixed(1)
const rate = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB/s' : Math.round(b / 1024) + ' KB/s')
function sysCard(id, val, sub, frac) {
  const el = $('sc_' + id); if (!el) return
  el.querySelector('b').textContent = val; el.querySelector('small').textContent = sub
  const h = sysHist[id] = [...(sysHist[id] || []), frac].slice(-40)
  const cv = el.querySelector('canvas'), x = cv.getContext('2d'), W = cv.width, H = cv.height
  // network has no natural maximum, so it scales to its own recent peak
  const top = id === 'down' || id === 'up' ? Math.max(...h, 1) : 1
  x.clearRect(0, 0, W, H)
  x.beginPath(); x.moveTo(W - (h.length - 1) * (W / 39), H)
  h.forEach((v, i) => x.lineTo(W - (h.length - 1 - i) * (W / 39), H - (v / top) * (H - 2)))
  x.lineTo(W, H); x.closePath()
  const c = getComputedStyle(document.documentElement).getPropertyValue('--accent')
  x.fillStyle = c; x.globalAlpha = .28; x.fill(); x.globalAlpha = 1
  x.beginPath(); h.forEach((v, i) => x.lineTo(W - (h.length - 1 - i) * (W / 39), H - (v / top) * (H - 2)))
  x.strokeStyle = c; x.lineWidth = 1.5; x.stroke()
}
let sysBusy = false
async function pollSys() {
  if (sysBusy || mode !== 'open' || page !== 'sys') return
  sysBusy = true
  try {
    const s = await invoke('sys_stats')
    sysCard('cpu', Math.round(s.cpu) + '%', `${s.cores} ${T('sy_threads')}`, s.cpu / 100)
    sysCard('ram', Math.round(s.ramUsed / s.ramTotal * 100) + '%', `${gb(s.ramUsed)} / ${gb(s.ramTotal)} GB`, s.ramUsed / s.ramTotal)
    if (s.gpu) {
      sysCard('gpu', Math.round(s.gpu.util) + '%', `${Math.round(s.gpu.temp)}°C`, s.gpu.util / 100)
      sysCard('vram', Math.round(s.gpu.memUsed / s.gpu.memTotal * 100) + '%', `${(s.gpu.memUsed / 1024).toFixed(1)} / ${(s.gpu.memTotal / 1024).toFixed(1)} GB`, s.gpu.memUsed / s.gpu.memTotal)
    } else {
      sysCard('gpu', '—', T('sy_no_gpu'), 0); sysCard('vram', '—', `${T('sy_disk')} ${gb(s.diskUsed)} / ${gb(s.diskTotal)} GB`, 0)
    }
    sysCard('down', rate(s.down), T('sy_net'), s.down); sysCard('up', rate(s.up), T('sy_net'), s.up)
  } catch {}
  sysBusy = false
}
setInterval(pollSys, 1000)

// ---------------- applying settings ----------------
function applySettings() {
  island.style.setProperty('--bg', S.islandColor)
  island.classList.toggle('glow', S.glow)
  island.style.setProperty('--speed', S.animSpeed || 1)
  island.classList.toggle('no-cviz', !S.closedViz)
  island.classList.toggle('no-cart', !S.closedArt)
  island.classList.toggle('no-shuffle', !S.shuffle)
  document.querySelectorAll('[data-t]').forEach((e) => { e.textContent = T(e.dataset.t) })
  $('note').placeholder = T('notes_ph'); $('trIn').placeholder = T('tr_ph')
  $('clipQ').placeholder = T('clip_search'); renderClipFilters()
  buildSys(); renderTrLangs()
  if (lyOpen && !ly.lines.length) { ly.key = null; loadLyrics() }
  $('title').textContent = m.title || T('nothing')
  applyAccent(); renderCal(); renderNotifs(); renderClips(); renderShelf(); renderQuick(); tmRender(); badge(m.title ? m.app : null)
  if (mode !== 'open' && mode !== 'peek' && mode !== 'toast') goClosed()
  else if (mode === 'open') morph('open')
}
function reloadSettings() {
  const prevMon = S.monitor, prevCity = S.city, prevWx = S.weather
  S = loadSettings(); T = makeT(S)
  shelf = store.get('shelf', [])
  if (!S.hideFs) invoke('set_visible', { visible: true })
  else if (fsNow) invoke('set_visible', { visible: false })
  if (S.monitor !== prevMon) invoke('set_monitor', { idx: S.monitor }).then(() => invoke('set_size', { width: curWin[0], height: curWin[1] }))
  applySettings()
  if (S.city !== prevCity || S.weather !== prevWx) loadWeather()
}
listen('settings-changed', reloadSettings)
window.addEventListener('storage', (e) => { if (e.key === 'di.settings3') reloadSettings() })
let fsNow = false
listen('fs', ({ payload }) => { fsNow = !!payload.value; if (S.hideFs) invoke('set_visible', { visible: !fsNow }) })

// vertical mouse wheel scrolls the horizontal lists (clipboard cards, shelf files)
for (const id of ['clipList', 'files', 'quick']) {
  const el = $(id)
  el.addEventListener('wheel', (e) => {
    const horizontal = el.scrollWidth > el.clientWidth && el.scrollHeight <= el.clientHeight + 2
    if (horizontal && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault() }
  }, { passive: false })
}

// ---------------- icons: Windows' own Segoe Fluent Icons font ----------------
const GL = (code, extra = '') => `<i class="gl ${extra}">&#x${code};</i>`
const glyph = (sel, code) => { const b = document.querySelector(sel); const s = b && b.querySelector('svg'); if (s) s.outerHTML = GL(code) }
glyph('[data-page=home]', 'E80F'); glyph('[data-page=shelf]', 'E7B8'); glyph('[data-page=clip]', 'E77F')
glyph('[data-page=timer]', 'E916'); glyph('[data-page=notif]', 'EA8F'); glyph('#gearBtn', 'E713')
// the home icon turns solid while its page is open
function homeIcon() { const i = document.querySelector('[data-page=home] .gl'); if (i) i.innerHTML = page === 'home' ? '&#xEA8A;' : '&#xE80F;' }
$('bPrev').innerHTML = GL('F8AC'); $('bNext').innerHTML = GL('F8AD'); $('bShuffle').innerHTML = GL('E8B1')
$('bPlay').innerHTML = `<i id="icPlay" class="gl">&#xF5B0;</i><i id="icPause" class="gl" hidden>&#xF8AE;</i>`
$('bRepeat').querySelector('svg').outerHTML = GL('E8EE')
$('volBtn').innerHTML = `<i id="icVol" class="gl">&#xE767;</i><i id="icMute" class="gl" hidden>&#xE74F;</i>`

// ---------------- boot ----------------
invoke('set_monitor', { idx: S.monitor }).then(() => invoke('set_size', { width: curWin[0], height: curWin[1] }))
showPage('home'); setSlide(0)
island.className = 'mode-line idle'
island.style.setProperty('--br', '6px')
applySettings()
trackRegion(1500)
initQuickApps()
invoke('start_notifs')
invoke('set_hotkey', { combo: S.clipHotkey || '' }).catch(() => {})
setLyrics(store.get('lyOpen', false))
loadWeather(); setInterval(loadWeather, 20 * 60 * 1000)
setInterval(() => { if (new Date().getSeconds() < 1) renderCal() }, 1000)
