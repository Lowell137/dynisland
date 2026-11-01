// Add a language by adding one more object here; missing keys fall back to English.
const I18N = {
  en: {
    _name: 'English', locale: 'en-US', weekStart: 0,
    nothing: 'Nothing playing', notes: 'Notes', notes_ph: 'Quick notes…',
    clipboard: 'Clipboard', clip_empty: 'Copy something and it shows up here', clear: 'Clear',
    timer: 'Timer', stopwatch: 'Stopwatch', start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset',
    notifs: 'Notifications', no_notifs: 'No notifications', drop_here: 'Drop files here or click to browse',
    n_copied: 'Copied to clipboard', n_file: 'added to the shelf', n_timer: 'Timer finished', n_img_gone: 'Original image no longer available',
    n_sent: 'Opened with', n_no_app: 'Add a quick app in Settings > Shelf',
    // settings window
    s_search: 'Search', s_version: 'Version',
    p_general: 'General', p_appearance: 'Appearance', p_music: 'Music', p_notifications: 'Notifications',
    p_weather: 'Weather', p_timer: 'Timer', p_shelf: 'Shelf', p_about: 'About',
    g_start: 'Start with Windows', g_start_d: 'The island appears automatically when you turn on your PC.',
    g_lang: 'Language', g_lang_d: 'Language of the app. "Automatic" follows Windows.', auto: 'Automatic',
    g_behavior: 'Behavior', g_open: 'Open the island with', g_open_d: 'How the island expands.',
    g_open_hover: 'Mouse hover', g_open_click: 'Click',
    g_delay: 'Opening delay', g_delay_d: 'How long to keep the mouse on the island before it opens.',
    g_paste: 'Paste when clicking a clipboard item', g_paste_d: 'Clicking an item types it straight into the app you were using.',
    g_hidefs: 'Hide with full-screen apps', g_hidefs_d: 'Stays out of the way during games, movies and presentations.',
    g_screen: 'Screen', g_monitor: 'Show the island on', g_monitor_d: 'Useful if you use more than one monitor.',
    a_island: 'Island', a_style: 'Closed island', a_style_d: 'A thin line, or a pill like a phone notch.',
    a_line: 'Thin line', a_pill: 'Pill',
    a_size: 'Size', a_size_d: 'Size of the closed pill. "Small" covers browser tabs less.', a_normal: 'Normal', a_small: 'Small',
    a_color: 'Island color', a_color_d: 'Black is the classic look.',
    a_accent: 'Accent color', a_accent_d: 'Visualizer and song bar. The first one takes the color from the album art.',
    a_round: 'Corner roundness', a_round_d: 'From square to very soft.',
    a_effects: 'Effects', a_glow: 'Album art glow', a_glow_d: 'When the island is open, a light wash of the album colors behind the player.',
    a_breathe: 'Breathe when the mouse gets close', a_breathe_d: 'The island grows a little as the cursor approaches.',
    a_bounce: 'Bounce on song change', a_bounce_d: 'A small "pop" of the island when a new song starts.',
    m_icon: 'Icon of the playing app', m_icon_d: 'Shows the Spotify, Chrome, etc. logo on the corner of the album art.',
    m_controls: 'Controls', m_vol: "The island's volume controls", m_vol_d: '"System" changes the volume of the whole PC.', m_system: 'System',
    m_shuffle: 'Shuffle and repeat buttons', m_shuffle_d: 'Beside play/pause.',
    m_remaining: 'Show remaining time', m_remaining_d: 'On the right of the bar, instead of the song\'s total length.',
    m_change: 'Song change', m_show: 'Show the song when it changes', m_show_d: 'The island stretches for a moment with title and artist.',
    m_dur: 'Preview duration', m_dur_d: 'How long the title stays visible.',
    m_closed: 'Closed island', m_art: 'Album art', m_art_d: 'The mini album art on the left when the island is closed.',
    m_viz: 'Visualizer', m_viz_d: 'The animated bars on the right when the island is closed.',
    n_show: 'Show notifications in the island', n_show_d: 'Short messages from DynIsland appear in the island for a few seconds.',
    n_dur: 'Notification duration', n_dur_d: 'How long a notification stays visible.',
    w_show: 'Show the weather', w_show_d: 'Current temperature next to the calendar.',
    w_city: 'City', w_city_d: 'Leave empty to use your PC\'s location.', w_city_ph: 'Automatic', w_unit: 'Unit',
    t_closed: 'Show in the closed island', t_closed_d: 'Like a Live Activity: the countdown stays visible next to the pill.',
    t_sound: 'Sound when the timer ends', t_sound_d: 'Rings for a moment when time is up.',
    sh_quick: 'Quick apps', sh_quick_d: 'Drop a file on one of these apps in the Shelf and it opens with that app. Up to 8 apps.',
    sh_add: 'Add', sh_add_files: 'Add files', sh_remove: 'Remove', a_speed: 'Animation speed', a_speed_d: 'How fast the island opens and closes. Lower is slower.', sh_keep: 'Keep files after dragging them out',
    sh_keep_d: 'If off, a file disappears from the Shelf as soon as you drag it into another app or folder.',
    sh_clear: 'Clear the Shelf', sh_clear_d: 'The original files are not deleted.',
    ab_tag: 'A Dynamic Island for Windows.', ab_other: 'Other', ab_data: 'Data folder', ab_data_d: 'Where settings are saved.',
    ab_open: 'Open folder', ab_quit: 'Close the app', ab_quit_d: 'The island disappears until you start it again.', ab_quit_b: 'Quit DynIsland',
    pt_files: 'files in the Shelf',
    sh_add_app: 'Add app', tr_search: 'Search languages…', tr_nolang: 'No language found', tr_more: 'All languages',
    clip_search: 'Search…', clip_nomatch: 'Nothing matches', clip_pin: 'Pin', clip_unpin: 'Unpin', clip_paste: 'Paste', clip_open: 'Open', clip_delete: 'Delete', clip_to_shelf: 'Add to Shelf', clip_files: 'files', clip_chars: 'characters', clip_lines: 'lines',
    cf_all: 'All', cf_pinned: 'Pinned', cf_text: 'Text', cf_link: 'Links', cf_image: 'Images', cf_files: 'Files',
    p_clipboard: 'Clipboard', c_hotkey: 'Clipboard shortcut', c_hotkey_d: 'Opens the clipboard from anywhere. Then arrows move, Enter pastes, Space previews, Esc closes.', c_press: 'Press keys…', c_off: 'Off', c_taken: 'Another app is using this', c_need_mod: 'Include Ctrl, Alt or Shift',
    c_preview: 'Big preview on hover', c_preview_d: 'Resting on an item makes the island grow downward and show it in full.', c_max: 'History size', c_max_d: 'Pinned items don\'t count and are never removed automatically.',
    c_privacy: 'Privacy', c_pause: 'Pause clipboard history', c_pause_d: 'Nothing you copy is saved until you turn this off. What password managers mark as private is always skipped.',
    pk_search: 'Search apps…', pk_browse: 'Browse for .exe', pk_loading: 'Loading apps…', pk_none: 'No apps found',
    lyrics: 'Lyrics', ly_loading: 'Looking for lyrics…', ly_none: 'No lyrics found for this track', tr_lyrics: 'Translate',
    tr_ph: 'Type or paste text…', tr_copy: 'Copy', tr_failed: 'Translation failed. Check your connection.', tr_no_key: 'Add your DeepL API key in Settings > Translate', tr_bad_key: 'DeepL rejected the API key',
    sy_cpu: 'CPU', sy_ram: 'RAM', sy_gpu: 'GPU', sy_vram: 'GPU memory', sy_down: 'Download', sy_up: 'Upload', sy_net: 'All network adapters', sy_threads: 'threads', sy_no_gpu: 'Needs an NVIDIA GPU', sy_disk: 'Disk',
    n_windows: 'Windows notifications', n_win: 'Collect Windows notifications', n_win_d: 'Notifications from your apps appear in the island\'s list. They stay on this PC.',
    n_wintoast: 'Also show them in the island', n_wintoast_d: 'The closed island briefly shows the app and title when one arrives.',
    p_translate: 'Translate', tr_provider: 'Translation service', tr_provider_d: 'Google works right away. DeepL often reads better but needs your own API key.',
    tr_key: 'DeepL API key', tr_key_d: 'Only used when DeepL is selected. A free key is available from deepl.com.'
  },
  tr: {
    _name: 'Türkçe', locale: 'tr-TR', weekStart: 1,
    nothing: 'Çalan bir şey yok', notes: 'Notlar', notes_ph: 'Hızlı notlar…',
    clipboard: 'Pano', clip_empty: 'Bir şey kopyala, burada görünsün', clear: 'Temizle',
    timer: 'Zamanlayıcı', stopwatch: 'Kronometre', start: 'Başlat', pause: 'Duraklat', resume: 'Devam', reset: 'Sıfırla',
    notifs: 'Bildirimler', no_notifs: 'Bildirim yok', drop_here: 'Dosyaları buraya bırak ya da tıkla',
    n_copied: 'Panoya kopyalandı', n_file: 'rafa eklendi', n_timer: 'Zamanlayıcı bitti', n_img_gone: 'Orijinal resim artık yok',
    n_sent: 'Şununla açıldı:', n_no_app: 'Ayarlar > Raf bölümünden hızlı uygulama ekle',
    s_search: 'Ara', s_version: 'Sürüm',
    p_general: 'Genel', p_appearance: 'Görünüm', p_music: 'Müzik', p_notifications: 'Bildirimler',
    p_weather: 'Hava durumu', p_timer: 'Zamanlayıcı', p_shelf: 'Raf', p_about: 'Hakkında',
    g_start: 'Windows ile başlat', g_start_d: 'Bilgisayarı açınca ada kendiliğinden belirir.',
    g_lang: 'Dil', g_lang_d: 'Uygulamanın dili. "Otomatik" Windows\'u izler.', auto: 'Otomatik',
    g_behavior: 'Davranış', g_open: 'Adayı şununla aç', g_open_d: 'Adanın nasıl genişleyeceği.',
    g_open_hover: 'Fare üstüne gelince', g_open_click: 'Tıklayınca',
    g_delay: 'Açılma gecikmesi', g_delay_d: 'Açılmadan önce farenin adada ne kadar durması gerektiği.',
    g_paste: 'Pano öğesine tıklayınca yapıştır', g_paste_d: 'Öğeye tıklamak, kullandığın uygulamaya doğrudan yapıştırır.',
    g_hidefs: 'Tam ekran uygulamalarda gizle', g_hidefs_d: 'Oyun, film ve sunumlarda yolundan çekilir.',
    g_screen: 'Ekran', g_monitor: 'Adayı şurada göster', g_monitor_d: 'Birden fazla monitör kullanıyorsan işe yarar.',
    a_island: 'Ada', a_style: 'Kapalı ada', a_style_d: 'İnce bir çizgi ya da telefon çentiği gibi bir hap.',
    a_line: 'İnce çizgi', a_pill: 'Hap',
    a_size: 'Boyut', a_size_d: 'Kapalı hapın boyutu. "Küçük" tarayıcı sekmelerini daha az kapatır.', a_normal: 'Normal', a_small: 'Küçük',
    a_color: 'Ada rengi', a_color_d: 'Siyah klasik görünümdür.',
    a_accent: 'Vurgu rengi', a_accent_d: 'Görselleştirici ve şarkı çubuğu. İlki rengi albüm kapağından alır.',
    a_round: 'Köşe yuvarlaklığı', a_round_d: 'Köşeliden çok yumuşağa.',
    a_effects: 'Efektler', a_glow: 'Albüm parıltısı', a_glow_d: 'Ada açıkken oynatıcının arkasında albüm renklerinin hafif bir yıkaması.',
    a_breathe: 'Fare yaklaşınca nefes al', a_breathe_d: 'İmleç yaklaştıkça ada biraz büyür.',
    a_bounce: 'Şarkı değişince zıpla', a_bounce_d: 'Yeni şarkı başlayınca adada küçük bir "pop".',
    m_icon: 'Çalan uygulamanın simgesi', m_icon_d: 'Spotify, Chrome vb. logosunu albüm kapağının köşesinde gösterir.',
    m_controls: 'Kontroller', m_vol: 'Adanın ses kontrolleri', m_vol_d: '"Sistem" tüm bilgisayarın sesini değiştirir.', m_system: 'Sistem',
    m_shuffle: 'Karıştır ve tekrarla düğmeleri', m_shuffle_d: 'Oynat/duraklat düğmesinin yanında.',
    m_remaining: 'Kalan süreyi göster', m_remaining_d: 'Çubuğun sağında, şarkının toplam süresi yerine.',
    m_change: 'Şarkı değişimi', m_show: 'Şarkı değişince göster', m_show_d: 'Ada kısa süre uzayıp başlık ve sanatçıyı gösterir.',
    m_dur: 'Önizleme süresi', m_dur_d: 'Başlığın ne kadar görünür kalacağı.',
    m_closed: 'Kapalı ada', m_art: 'Albüm kapağı', m_art_d: 'Ada kapalıyken solda küçük albüm kapağı.',
    m_viz: 'Görselleştirici', m_viz_d: 'Ada kapalıyken sağda hareketli çubuklar.',
    n_show: 'Bildirimleri adada göster', n_show_d: 'DynIsland\'ın kısa mesajları birkaç saniye adada görünür.',
    n_dur: 'Bildirim süresi', n_dur_d: 'Bir bildirimin ne kadar görünür kalacağı.',
    w_show: 'Hava durumunu göster', w_show_d: 'Takvimin yanında anlık sıcaklık.',
    w_city: 'Şehir', w_city_d: 'Bilgisayarının konumunu kullanmak için boş bırak.', w_city_ph: 'Otomatik', w_unit: 'Birim',
    t_closed: 'Kapalı adada göster', t_closed_d: 'Canlı Etkinlik gibi: geri sayım hapın yanında görünür kalır.',
    t_sound: 'Süre bitince ses çal', t_sound_d: 'Süre dolunca kısa bir an çalar.',
    sh_quick: 'Hızlı uygulamalar', sh_quick_d: 'Raftaki bu uygulamalardan birinin üstüne dosya bırak, o uygulamayla açılsın. En çok 8 uygulama.',
    sh_add: 'Ekle', sh_add_files: 'Dosya ekle', sh_remove: 'Kaldır', a_speed: 'Animasyon hızı', a_speed_d: 'Adanın açılıp kapanma hızı. Düşük değer daha yavaştır.', sh_keep: 'Dışarı sürüklenince dosyaları rafta tut',
    sh_keep_d: 'Kapalıysa dosya başka bir uygulamaya ya da klasöre sürüklenir sürüklenmez raftan kaybolur.',
    sh_clear: 'Rafı temizle', sh_clear_d: 'Orijinal dosyalar silinmez.',
    ab_tag: 'Windows için Dynamic Island.', ab_other: 'Diğer', ab_data: 'Veri klasörü', ab_data_d: 'Ayarların kaydedildiği yer.',
    ab_open: 'Klasörü aç', ab_quit: 'Uygulamayı kapat', ab_quit_d: 'Ada, yeniden başlatana kadar kaybolur.', ab_quit_b: 'DynIsland\'dan çık',
    pt_files: 'dosya rafta',
    sh_add_app: 'Uygulama ekle', tr_search: 'Dil ara…', tr_nolang: 'Dil bulunamadı', tr_more: 'Tüm diller',
    clip_search: 'Ara…', clip_nomatch: 'Eşleşen bir şey yok', clip_pin: 'Sabitle', clip_unpin: 'Sabitlemeyi kaldır', clip_paste: 'Yapıştır', clip_open: 'Aç', clip_delete: 'Sil', clip_to_shelf: 'Rafa ekle', clip_files: 'dosya', clip_chars: 'karakter', clip_lines: 'satır',
    cf_all: 'Tümü', cf_pinned: 'Sabit', cf_text: 'Metin', cf_link: 'Bağlantı', cf_image: 'Resim', cf_files: 'Dosya',
    p_clipboard: 'Pano', c_hotkey: 'Pano kısayolu', c_hotkey_d: 'Panoyu her yerden açar. Sonra oklar gezer, Enter yapıştırır, Boşluk önizler, Esc kapatır.', c_press: 'Tuşlara bas…', c_off: 'Kapalı', c_taken: 'Bunu başka bir uygulama kullanıyor', c_need_mod: 'Ctrl, Alt ya da Shift ekle',
    c_preview: 'Üzerine gelince büyük önizleme', c_preview_d: 'Bir öğenin üstünde durunca ada aşağı doğru uzar ve öğeyi tam gösterir.', c_max: 'Geçmiş boyutu', c_max_d: 'Sabitlenenler sayılmaz ve kendiliğinden silinmez.',
    c_privacy: 'Gizlilik', c_pause: 'Pano geçmişini duraklat', c_pause_d: 'Bunu kapatana kadar kopyaladıkların kaydedilmez. Şifre yöneticilerinin gizli işaretlediği içerik her zaman atlanır.',
    pk_search: 'Uygulama ara…', pk_browse: '.exe seç', pk_loading: 'Uygulamalar yükleniyor…', pk_none: 'Uygulama bulunamadı',
    lyrics: 'Şarkı sözleri', ly_loading: 'Sözler aranıyor…', ly_none: 'Bu parça için söz bulunamadı', tr_lyrics: 'Çevir',
    tr_ph: 'Metin yaz ya da yapıştır…', tr_copy: 'Kopyala', tr_failed: 'Çeviri yapılamadı. Bağlantını kontrol et.', tr_no_key: 'Ayarlar > Çeviri bölümünden DeepL API anahtarını ekle', tr_bad_key: 'DeepL API anahtarını kabul etmedi',
    sy_cpu: 'CPU', sy_ram: 'RAM', sy_gpu: 'GPU', sy_vram: 'GPU belleği', sy_down: 'İndirme', sy_up: 'Yükleme', sy_net: 'Tüm ağ bağdaştırıcıları', sy_threads: 'iş parçacığı', sy_no_gpu: 'NVIDIA GPU gerekir', sy_disk: 'Disk',
    n_windows: 'Windows bildirimleri', n_win: 'Windows bildirimlerini topla', n_win_d: 'Uygulamalarının bildirimleri adanın listesinde görünür. Bu bilgisayardan çıkmaz.',
    n_wintoast: 'Adada da göster', n_wintoast_d: 'Bildirim gelince kapalı ada kısa süre uygulamayı ve başlığı gösterir.',
    p_translate: 'Çeviri', tr_provider: 'Çeviri servisi', tr_provider_d: 'Google hemen çalışır. DeepL çoğu zaman daha doğal çevirir ama kendi API anahtarını ister.',
    tr_key: 'DeepL API anahtarı', tr_key_d: 'Yalnızca DeepL seçiliyken kullanılır. Ücretsiz anahtarı deepl.com\'dan alabilirsin.'
  }
}

const SETTINGS_DEFAULTS = {
  v: 4, lang: 'auto', openMode: 'hover', delay: 40, clipPaste: true, hideFs: true, monitor: 0, autostart: false,
  closedStyle: 'line', size: 'normal', islandColor: '#000000', accent: 'auto', round: 100,
  glow: true, breathe: true, bounce: true, animSpeed: 1,
  appIcon: true, volMode: 'system', shuffle: true, remaining: false, preview: true, previewSec: 3.5, closedArt: true, closedViz: true,
  notif: true, notifSec: 5,
  weather: true, city: '', unit: 'C',
  timerClosed: true, timerSound: true,
  quickApps: null, keepFiles: true,
  clipHotkey: 'Ctrl+Alt+KeyV', clipPreview: true, clipMax: 60, clipPaused: false,
  winNotif: true, winToast: true, trProvider: 'google', trKey: '', trTarget: null
}
function loadSettings() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem('di.settings3') || '{}') } catch {}
  if ((saved.v || 0) < 4) { delete saved.delay; saved.v = 4 } // new, faster default opening delay
  return { ...SETTINGS_DEFAULTS, ...saved }
}
function saveSettings(S) {
  try { localStorage.setItem('di.settings3', JSON.stringify(S)) } catch {}
}
function langOf(S) {
  if (S.lang && S.lang !== 'auto' && I18N[S.lang]) return S.lang
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'
}
function makeT(S) {
  const L = langOf(S)
  const t = (k) => (I18N[L] && I18N[L][k]) || I18N.en[k] || k
  t.lang = L; t.locale = (I18N[L] || I18N.en).locale; t.weekStart = (I18N[L] || I18N.en).weekStart
  return t
}
