// App picker shared by the island and the settings window. Resolves to {name, path, shell, icon}, or null if cancelled.
function pickApp(mount, T) {
  return new Promise((resolve) => {
    const box = document.createElement('div'); box.className = 'apk'
    box.innerHTML = `<div class="apkHead"><input class="apkQ" spellcheck="false"><button class="apkBrowse"></button><button class="apkClose">×</button></div><div class="apkGrid"><div class="apkMsg"></div></div>`
    const q = box.querySelector('.apkQ'), grid = box.querySelector('.apkGrid')
    q.placeholder = T('pk_search')
    box.querySelector('.apkBrowse').textContent = T('pk_browse')
    grid.firstChild.textContent = T('pk_loading')
    mount.appendChild(box)
    const done = (v) => { box.remove(); resolve(v) }
    box.querySelector('.apkClose').onclick = () => done(null)
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null) })
    box.querySelector('.apkBrowse').onclick = async () => {
      const p = await invoke('pick_exe'); if (!p) return
      done({ name: p.split(/[\\/]/).pop().replace(/\.(exe|lnk)$/i, ''), path: p })
    }
    let apps = []
    const draw = () => {
      const f = q.value.trim().toLocaleLowerCase()
      const list = apps.filter((a) => a.name.toLocaleLowerCase().includes(f))
      grid.innerHTML = list.length ? '' : `<div class="apkMsg">${T('pk_none')}</div>`
      for (const a of list) {
        const b = document.createElement('button'); b.className = 'apkApp'; b.title = a.name
        b.innerHTML = '<img alt=""><span></span>'
        if (a.icon) b.firstChild.src = 'data:image/png;base64,' + a.icon
        b.lastChild.textContent = a.name
        b.onclick = () => done({ name: a.name, path: a.path, shell: a.shell, icon: a.icon ? 'data:image/png;base64,' + a.icon : null })
        grid.appendChild(b)
      }
    }
    q.addEventListener('input', draw)
    invoke('list_apps').then((json) => {
      if (!box.isConnected) return
      if (!json) { grid.firstChild.textContent = T('pk_none'); return }
      apps = JSON.parse(json); draw()
    })
    // the island has to ask for the keyboard first; the settings window is an ordinary window
    if (window.grabKeyboard) grabKeyboard(q); else q.focus()
  })
}
