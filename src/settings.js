const { invoke } = window.__TAURI__.core
const $ = (id) => document.getElementById(id)
let S = loadSettings()
let T = makeT(S)
let current = 'general'
let monitorList = []

const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"/></svg>',
  half: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12M9 18a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0zM19 16a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 17v-6a6 6 0 0 1 12 0v6l1.500 2h-15zM10 21.500h4"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 8.500 4 4 0 0 1 17.500 18z"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.500" r="7"/><path d="M12 9.500v4l2.500 1.500M9.500 3h5"/></svg>',
  tray: '<svg viewBox="0 0 24 24"><path d="M3.500 13.500h4.500l1.500 2.500h5l1.500-2.500h4.500v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM5.500 13.500l1.800-7.500h9.400l1.800 7.500"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><rect x="5" y="4.500" width="14" height="16.500" rx="2"/><path d="M9 4.500V3h6v1.500M9 11h6M9 15h6"/></svg>',
  lang: '<svg viewBox="0 0 24 24"><path d="M4 6h10M9 4v2M12 6c-1 4-4 7-7 8.500M6.500 9.500c1 2 3 4 5.500 5M13 20l4-9 4 9M14.500 17h5"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.500"/><path d="M12 11v5M12 8h.01"/></svg>'
}
const COLORS = ['#000000', '#1c1c1e', '#0f1a3a', '#2a1a4a', '#0e2a1e', '#3a1410']
const ACCENTS = ['auto', '#ffffff', '#0a84ff', '#30d158', '#ff453a', '#ff9f0a', '#bf5af2']

// ---------- schema ----------
const pages = () => [
  { id: 'general', color: '#6b7280', icon: ICON.gear, groups: [
    { rows: [
      { t: 'toggle', key: 'autostart', l: 'g_start', d: 'g_start_d', on: (v) => invoke('set_autostart', { enable: v }) },
      { t: 'select', key: 'lang', l: 'g_lang', d: 'g_lang_d', opts: () => [['auto', T('auto')], ...Object.entries(I18N).map(([k, v]) => [k, v._name])] } ] },
    { title: 'g_behavior', rows: [
      { t: 'select', key: 'openMode', l: 'g_open', d: 'g_open_d', opts: () => [['hover', T('g_open_hover')], ['click', T('g_open_click')]] },
      { t: 'slider', key: 'delay', l: 'g_delay', d: 'g_delay_d', min: 0, max: 500, step: 50, fmt: (v) => v + ' ms' },
      { t: 'toggle', key: 'clipPaste', l: 'g_paste', d: 'g_paste_d' },
      { t: 'toggle', key: 'hideFs', l: 'g_hidefs', d: 'g_hidefs_d' } ] },
    { title: 'g_screen', rows: [
      { t: 'select', key: 'monitor', num: true, l: 'g_monitor', d: 'g_monitor_d', opts: () => monitorList.map((n, i) => [i, 'Screen ' + n]) } ] } ] },
  { id: 'appearance', color: '#0a84ff', icon: ICON.half, preview: true, groups: [
    { title: 'a_island', rows: [
      { t: 'select', key: 'closedStyle', l: 'a_style', d: 'a_style_d', opts: () => [['line', T('a_line')], ['pill', T('a_pill')]] },
      { t: 'select', key: 'size', l: 'a_size', d: 'a_size_d', opts: () => [['normal', T('a_normal')], ['small', T('a_small')]] },
      { t: 'swatch', key: 'islandColor', l: 'a_color', d: 'a_color_d', list: COLORS },
      { t: 'swatch', key: 'accent', l: 'a_accent', d: 'a_accent_d', list: ACCENTS },
      { t: 'slider', key: 'round', l: 'a_round', d: 'a_round_d', min: 0, max: 100, step: 5, fmt: (v) => v + '%' },
      { t: 'slider', key: 'animSpeed', l: 'a_speed', d: 'a_speed_d', min: 0.3, max: 2, step: 0.1, fmt: (v) => Number(v).toFixed(1) + '×' } ] },
    { title: 'a_effects', rows: [
      { t: 'toggle', key: 'glow', l: 'a_glow', d: 'a_glow_d' },
      { t: 'toggle', key: 'breathe', l: 'a_breathe', d: 'a_breathe_d' },
      { t: 'toggle', key: 'bounce', l: 'a_bounce', d: 'a_bounce_d' } ] } ] },
  { id: 'music', color: '#fa243c', icon: ICON.music, groups: [
    { rows: [{ t: 'toggle', key: 'appIcon', l: 'm_icon', d: 'm_icon_d' }] },
    { title: 'm_controls', rows: [
      { t: 'select', key: 'volMode', l: 'm_vol', d: 'm_vol_d', opts: () => [['system', T('m_system')]] },
      { t: 'toggle', key: 'shuffle', l: 'm_shuffle', d: 'm_shuffle_d' },
      { t: 'toggle', key: 'remaining', l: 'm_remaining', d: 'm_remaining_d' } ] },
    { title: 'm_change', rows: [
      { t: 'toggle', key: 'preview', l: 'm_show', d: 'm_show_d' },
      { t: 'slider', key: 'previewSec', l: 'm_dur', d: 'm_dur_d', min: 1, max: 8, step: 0.5, fmt: (v) => v + ' s' } ] },
    { title: 'm_closed', rows: [
      { t: 'toggle', key: 'closedArt', l: 'm_art', d: 'm_art_d' },
      { t: 'toggle', key: 'closedViz', l: 'm_viz', d: 'm_viz_d' } ] } ] },
  { id: 'notifications', color: '#ff453a', icon: ICON.bell, groups: [
    { rows: [
      { t: 'toggle', key: 'notif', l: 'n_show', d: 'n_show_d' },
      { t: 'slider', key: 'notifSec', l: 'n_dur', d: 'n_dur_d', min: 2, max: 10, step: 1, fmt: (v) => v + ' s' } ] },
    { title: 'n_windows', rows: [
      { t: 'toggle', key: 'winNotif', l: 'n_win', d: 'n_win_d' },
      { t: 'toggle', key: 'winToast', l: 'n_wintoast', d: 'n_wintoast_d' } ] } ] },
  { id: 'clipboard', color: '#34c759', icon: ICON.clip, groups: [
    { rows: [
      { t: 'hotkey', key: 'clipHotkey', l: 'c_hotkey', d: 'c_hotkey_d' },
      { t: 'toggle', key: 'clipPreview', l: 'c_preview', d: 'c_preview_d' },
      { t: 'slider', key: 'clipMax', l: 'c_max', d: 'c_max_d', min: 20, max: 200, step: 10, fmt: (v) => v } ] },
    { title: 'c_privacy', rows: [
      { t: 'toggle', key: 'clipPaused', l: 'c_pause', d: 'c_pause_d' } ] } ] },
  { id: 'translate', color: '#30b0c7', icon: ICON.lang, groups: [
    { rows: [
      { t: 'select', key: 'trProvider', l: 'tr_provider', d: 'tr_provider_d', opts: () => [['google', 'Google'], ['deepl', 'DeepL']] },
      { t: 'text', key: 'trKey', secret: true, l: 'tr_key', d: 'tr_key_d', ph: () => 'xxxxxxxx:fx' } ] } ] },
  { id: 'weather', color: '#32ade6', icon: ICON.cloud, groups: [
    { rows: [
      { t: 'toggle', key: 'weather', l: 'w_show', d: 'w_show_d' },
      { t: 'text', key: 'city', l: 'w_city', d: 'w_city_d', ph: () => T('w_city_ph') },
      { t: 'select', key: 'unit', l: 'w_unit', opts: () => [['C', '°C'], ['F', '°F']] } ] } ] },
  { id: 'timer', color: '#ff9f0a', icon: ICON.timer, groups: [
    { rows: [
      { t: 'toggle', key: 'timerClosed', l: 't_closed', d: 't_closed_d' },
      { t: 'toggle', key: 'timerSound', l: 't_sound', d: 't_sound_d' } ] } ] },
  { id: 'shelf', color: '#5e5ce6', icon: ICON.tray, custom: 'shelf', groups: [
    { rows: [
      { t: 'toggle', key: 'keepFiles', l: 'sh_keep', d: 'sh_keep_d' },
      { t: 'button', l: 'sh_clear', d: () => `${shelfCount()} ${T('pt_files')}. ${T('sh_clear_d')}`, b: 'clear', run: () => { localStorage.setItem('di.shelf', '[]'); commit(); render() } } ] } ] },
  { id: 'about', color: '#8e8e93', icon: ICON.info, custom: 'about', groups: [
    { title: 'ab_other', rows: [
      { t: 'button', l: 'ab_data', d: 'ab_data_d', b: 'ab_open', run: () => invoke('data_dir') },
      { t: 'button', l: 'ab_quit', d: 'ab_quit_d', b: 'ab_quit_b', danger: true, run: () => invoke('quit') } ] } ] }
]
const shelfCount = () => { try { return JSON.parse(localStorage.getItem('di.shelf') || '[]').length } catch { return 0 } }

// ---------- rendering ----------
function commit() { saveSettings(S); invoke('settings_changed') }
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const txt = (v) => (typeof v === 'function' ? v() : T(v))

function controlFor(r) {
  const c = el('div', 'ctl')
  if (r.t === 'toggle') {
    const w = el('label', 'sw', '<input type="checkbox"><span></span>')
    const i = w.querySelector('input'); i.checked = !!S[r.key]
    i.onchange = () => { S[r.key] = i.checked; commit(); if (r.on) r.on(i.checked) }
    c.appendChild(w)
  } else if (r.t === 'select') {
    const s = el('select')
    for (const [v, label] of r.opts()) { const o = el('option', null, label); o.value = v; s.appendChild(o) }
    s.value = S[r.key]
    s.onchange = () => { S[r.key] = r.num ? +s.value : s.value; commit(); if (r.key === 'lang') { T = makeT(S); render() } else drawPreview() }
    c.appendChild(s)
  } else if (r.t === 'slider') {
    const i = el('input'); i.type = 'range'; i.min = r.min; i.max = r.max; i.step = r.step; i.value = S[r.key]
    const v = el('span', 'val', r.fmt(S[r.key]))
    i.oninput = () => { S[r.key] = +i.value; v.textContent = r.fmt(S[r.key]); commit(); drawPreview() }
    c.append(i, v)
  } else if (r.t === 'swatch') {
    const w = el('div', 'sws')
    for (const col of r.list) {
      const b = el('button', col === 'auto' ? 'auto' : ''); if (col !== 'auto') b.style.background = col
      if (S[r.key] === col) b.classList.add('on')
      b.onclick = () => { S[r.key] = col; commit(); render() }
      w.appendChild(b)
    }
    c.appendChild(w)
  } else if (r.t === 'text') {
    const i = el('input', 'field'); i.value = S[r.key] || ''; i.placeholder = r.ph ? r.ph() : ''; if (r.secret) i.type = 'password'
    i.onchange = () => { S[r.key] = i.value.trim(); commit() }
    c.appendChild(i)
  } else if (r.t === 'hotkey') {
    const pretty = (s) => s ? s.replace(/Key|Digit/g, '').replace(/\+/g, ' + ') : T('c_off')
    const b = el('button', 'btn', pretty(S[r.key])), off = el('button', 'btn', T('c_off'))
    const err = el('span', 'val'); err.style.color = '#ff8a80'; err.style.width = 'auto'
    const save = async (combo) => {
      try { await invoke('set_hotkey', { combo }); S[r.key] = combo; commit(); err.textContent = '' }
      catch { await invoke('set_hotkey', { combo: S[r.key] || '' }).catch(() => {}); err.textContent = T('c_taken') }
      b.textContent = pretty(S[r.key])
    }
    b.onclick = () => {
      b.textContent = T('c_press')
      const onKey = (e) => {
        e.preventDefault(); e.stopPropagation()
        if (/^(Control|Shift|Alt|Meta)/.test(e.code)) return
        window.removeEventListener('keydown', onKey, true)
        if (e.code === 'Escape') { b.textContent = pretty(S[r.key]); return }
        const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean)
        // a bare key would stop working everywhere else, so a modifier is required
        if (!mods.length) { b.textContent = pretty(S[r.key]); err.textContent = T('c_need_mod'); return }
        save([...mods, e.code].join('+'))
      }
      window.addEventListener('keydown', onKey, true)
    }
    off.onclick = () => save('')
    c.append(err, b, off)
  } else if (r.t === 'button') {
    const b = el('button', 'btn' + (r.danger ? ' danger' : ''), T(r.b)); b.onclick = r.run
    c.appendChild(b)
  }
  return c
}
function rowEl(r) {
  const row = el('div', 'row'), t = el('div', 'txt')
  t.appendChild(el('div', 'l', T(r.l)))
  if (r.d) t.appendChild(el('div', 'd', txt(r.d)))
  row.append(t, controlFor(r))
  return row
}
function drawPreview() {
  const p = document.querySelector('.pi'); if (!p) return
  p.classList.toggle('line', S.closedStyle === 'line')
  p.style.background = S.closedStyle === 'line' ? '' : S.islandColor
  p.style.setProperty('--acc', S.accent === 'auto' ? '#fb923c' : S.accent)
  p.style.borderRadius = S.closedStyle === 'line' ? '' : `0 0 ${Math.max(4, 15 * S.round / 100)}px ${Math.max(4, 15 * S.round / 100)}px`
}
function shelfApps(card) {
  const apps = S.quickApps || []
  const head = el('div', 'row')
  head.innerHTML = `<div class="txt"><div class="l">${T('sh_quick')}</div><div class="d">${T('sh_quick_d')}</div></div>`
  const add = el('button', 'btn', T('sh_add')); add.onclick = async () => {
    if (apps.length >= 8) return
    const a = await pickApp(document.body, T); if (!a) return
    S.quickApps = [...apps, a]; commit(); render()
  }
  head.appendChild(add); card.appendChild(head)
  for (const [i, a] of apps.entries()) {
    const q = el('div', 'qa'); q.innerHTML = '<div class="qi"></div><div><div class="nm"></div><div class="pt"></div></div>'
    if (a.icon) q.querySelector('.qi').innerHTML = `<img src="${a.icon}" alt="" style="width:100%;height:100%;object-fit:contain">`
    else q.querySelector('.qi').textContent = a.name.slice(0, 1).toUpperCase()
    q.querySelector('.nm').textContent = a.name; q.querySelector('.pt').textContent = a.path
    const rm = el('button', 'btn', T('sh_remove')); rm.onclick = () => { S.quickApps = apps.filter((_, j) => j !== i); commit(); render() }
    q.appendChild(rm); card.appendChild(q)
  }
}
function pageEl(p) {
  const f = document.createDocumentFragment()
  f.appendChild(el('h1', null, `<span class="ico" style="background:${p.color}">${p.icon}</span>${T('p_' + p.id)}`))
  if (p.custom === 'about') {
    const hero = el('div', 'card hero', `<div class="logo"><i></i><i></i></div><div><b>DynIsland</b><span>${T('s_version')} 0.1.2</span><span>${T('ab_tag')}</span></div>`)
    f.appendChild(hero)
  }
  if (p.preview) { const pv = el('div', 'preview', '<div class="pi"><i></i><em>···</em></div><small>Preview</small>'); f.appendChild(pv) }
  for (const g of p.groups) {
    if (g.title) f.appendChild(el('h2', null, T(g.title)))
    const card = el('div', 'card')
    if (p.custom === 'shelf' && !g.title && g === p.groups[0]) shelfApps(card)
    for (const r of g.rows) card.appendChild(rowEl(r))
    f.appendChild(card)
  }
  return f
}
function searchEl(q) {
  const f = document.createDocumentFragment()
  const card = el('div', 'card'); let n = 0
  for (const p of pages()) for (const g of p.groups) for (const r of g.rows)
    if ((T(r.l) + ' ' + (r.d ? txt(r.d) : '')).toLowerCase().includes(q)) { card.appendChild(rowEl(r)); n++ }
  f.appendChild(el('h1', null, `<span class="ico" style="background:#6b7280">${ICON.gear}</span>${T('s_search')}`))
  if (n) f.appendChild(card)
  return f
}
function render() {
  const q = $('q').value.trim().toLowerCase()
  const nav = $('nav'); nav.innerHTML = ''
  for (const p of pages()) {
    const b = el('button', p.id === current && !q ? 'on' : '', `<span class="ico" style="background:${p.color}">${p.icon}</span>${T('p_' + p.id)}`)
    b.onclick = () => { $('q').value = ''; current = p.id; render() }
    nav.appendChild(b)
  }
  const c = $('content'); c.innerHTML = ''
  c.appendChild(q ? searchEl(q) : pageEl(pages().find((p) => p.id === current)))
  $('q').placeholder = T('s_search'); $('ver').textContent = `${T('s_version')} 0.1.2`
  document.title = 'DynIsland — ' + T('p_' + current)
  drawPreview()
}
// the switch shows what the registry says, since the installer can turn this on too
async function syncAutostart() {
  const on = await invoke('get_autostart')
  if (on === !!S.autostart) return
  S.autostart = on; saveSettings(S); render()
}
window.addEventListener('focus', syncAutostart)
syncAutostart()
$('q').addEventListener('input', render)
invoke('monitors').then((l) => { monitorList = l; render() })
render()
