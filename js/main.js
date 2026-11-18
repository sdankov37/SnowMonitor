/* ============================================================
   НАСТРОЙКИ
   ============================================================ */
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzFr141prHgjtHvSJna86BwKTn2eQzj1uCiv4G8d92Tu6hOH1vqBlFWyz_SFsSqTgn6/exec';

const DISTRICTS = [
  'АвД САО', 'Аэропорт', 'Беговой', 'Бескудниковский',
  'Войковский', 'Восточное Дегунино', 'Головинский', 'Дмитровский',
  'Западное Дегунино', 'Коптево', 'Левобережный', 'Молжаниновский',
  'Савеловский', 'Сокол', 'Тимирязевский', 'Ховрино', 'Хорошевский'
];

// ⚠️ ЧЕТЫРЕ уровня снега. Меняйте value/icon под себя.
const STATUS_OPTIONS = [
  { value: 'Нет снега',      icon: '☀️'  },
  { value: 'Тонкий слой',    icon: '🌨️' },
  { value: 'Есть снег',      icon: '❄️'  },
  { value: 'Обильный снег',  icon: '❄️❄️' }
];
const STATUS_VALUES = STATUS_OPTIONS.map(s => s.value);

const SUBMIT_TIMES = ['00:00', '02:00', '04:00', '06:00'];

const STORAGE_KEY     = 'snow_form_data';
const LAST_SUBMIT_KEY = 'snow_last_submit';
const SELECTED_KEY    = 'snow_selected_district';

/* ============================================================
   СОСТОЯНИЕ
   ============================================================ */
let selectedDistrict = null;

const setupView      = document.getElementById('setupView');
const formView       = document.getElementById('formView');
const footer         = document.getElementById('footer');
const districtSelect = document.getElementById('districtSelect');
const startBtn       = document.getElementById('startBtn');
const cancelSetupBtn = document.getElementById('cancelSetupBtn');
const districtTitle  = document.getElementById('districtTitle');
const statusGrid     = document.getElementById('statusGrid');
const commentInput   = document.getElementById('commentInput');
const submitBtn      = document.getElementById('submitBtn');
const changeDistrictBtn = document.getElementById('changeDistrictBtn');
const saveDot        = document.getElementById('saveDot');
const toastEl        = document.getElementById('toast');
const lastSubmittedEl = document.getElementById('lastSubmitted');

/* ============================================================
   ХРАНИЛИЩЕ
   ============================================================ */
function loadFormData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveFormData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function clearDistrictData(name) {
  const data = loadFormData();
  delete data[name];
  saveFormData(data);
}

/* ============================================================
   ВЫБОР РАЙОНА
   ============================================================ */
function getDistrictFromURL() {
  const params = new URLSearchParams(window.location.search);
  const d = params.get('d');
  if (!d) return null;
  const normalized = d.trim().toLowerCase();
  return DISTRICTS.find(x => x.toLowerCase() === normalized) || null;
}

function populateSelect() {
  const current = districtSelect.value;
  districtSelect.innerHTML =
    '<option value="">— выберите район —</option>' +
    DISTRICTS.map(n => `<option value="${n}">${n}</option>`).join('');
  if (current) districtSelect.value = current;
}

function openSetupView(cancellable = false) {
  setupView.hidden = false;
  formView.hidden  = true;
  footer.hidden    = true;
  cancelSetupBtn.hidden = !cancellable;
  if (selectedDistrict) {
    districtSelect.value = selectedDistrict;
    startBtn.disabled = false;
  } else {
    startBtn.disabled = !districtSelect.value;
  }
}

function closeSetupView() {
  setupView.hidden = true;
  formView.hidden  = false;
  footer.hidden    = false;
  renderForm();
}

/* ============================================================
   РЕНДЕР ФОРМЫ
   ============================================================ */
function renderForm() {
  if (!selectedDistrict) return;
  const data = loadFormData()[selectedDistrict] || {};

  districtTitle.textContent = selectedDistrict;

  statusGrid.innerHTML = STATUS_OPTIONS.map(opt => `
    <button type="button"
            class="status-btn ${data.status === opt.value ? 'selected' : ''}"
            data-status="${opt.value}"
            aria-pressed="${data.status === opt.value}">
      <span class="status-icon">${opt.icon}</span>
      <span class="status-label">${opt.value}</span>
    </button>
  `).join('');

  statusGrid.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => onStatusClick(btn.dataset.status));
  });

  commentInput.value = data.comment || '';

  updateSubmitButton();
  updateLastSubmitted();
}

function updateSubmitButton() {
  const data = loadFormData();
  const current = selectedDistrict && data[selectedDistrict];
  submitBtn.disabled = !(current && current.status);
}

function updateLastSubmitted() {
  const last = localStorage.getItem(LAST_SUBMIT_KEY);
  if (!last) { lastSubmittedEl.textContent = ''; return; }
  const d = new Date(last);
  lastSubmittedEl.textContent = 'Отправлено: ' +
    d.toLocaleString('ru-RU', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
}

/* ============================================================
   ОБРАБОТЧИКИ ПОЛЕЙ
   ============================================================ */
function onStatusClick(status) {
  if (!selectedDistrict) return;
  const data = loadFormData();
  const existing = data[selectedDistrict] || {};
  data[selectedDistrict] = { status, comment: existing.comment || '' };
  saveFormData(data);

  // Визуально переключить активную кнопку
  statusGrid.querySelectorAll('.status-btn').forEach(btn => {
    const isSelected = btn.dataset.status === status;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', isSelected);
  });

  markSaved();
  updateSubmitButton();
}

function onCommentChange() {
  if (!selectedDistrict) return;
  const data = loadFormData();
  const existing = data[selectedDistrict] || {};
  const comment = commentInput.value;

  if (existing.status || comment) {
    data[selectedDistrict] = { status: existing.status || '', comment };
  } else {
    delete data[selectedDistrict];
  }
  saveFormData(data);
  markSaved();
  updateSubmitButton();
}

function markSaved() {
  saveDot.className = 'dot saved';
}

/* ============================================================
   ОТПРАВКА (только текущий район)
   ============================================================ */
async function submitData() {
  if (!selectedDistrict) return;
  const data = loadFormData();
  const current = data[selectedDistrict];
  if (!current || !current.status) {
    showToast('Сначала выберите состояние снега', 'error');
    return;
  }

  submitBtn.disabled = true;
  saveDot.className = 'dot sending';

  const payload = {
    submittedAt: new Date().toISOString(),
    districts: [{
      district: selectedDistrict,
      status:   current.status,
      comment:  current.comment || ''
    }]
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Ошибка сервера');

    localStorage.setItem(LAST_SUBMIT_KEY, new Date().toISOString());
    clearDistrictData(selectedDistrict);

    saveDot.className = 'dot';
    showToast(
      `Отправлено: ${selectedDistrict} (партия ${result.batchId})`,
      'success'
    );

    // Очистить поля, но остаться на том же районе
    renderForm();
  } catch (err) {
    console.error(err);
    saveDot.className = 'dot error';
    showToast('Ошибка отправки: ' + err.message, 'error');
    updateSubmitButton();
  }
}

/* ============================================================
   ЧАСЫ + ПРОГРЕСС
   ============================================================ */
function pad(n) { return String(n).padStart(2, '0'); }

function getPrevAndNextReport() {
  const now = new Date();
  const times = SUBMIT_TIMES
    .map(t => { const [h, m] = t.split(':').map(Number); return { h, m, min: h * 60 + m }; })
    .sort((a, b) => a.min - b.min);
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  let prev = null, next = null;
  for (const t of times) {
    if (t.min <= nowMin) prev = t;
    else if (next === null) next = t;
  }

  const prevDate = new Date(now);
  if (prev === null) {
    const last = times[times.length - 1];
    prevDate.setDate(prevDate.getDate() - 1);
    prevDate.setHours(last.h, last.m, 0, 0);
  } else prevDate.setHours(prev.h, prev.m, 0, 0);

  const nextDate = new Date(now);
  if (next === null) {
    const first = times[0];
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(first.h, first.m, 0, 0);
  } else nextDate.setHours(next.h, next.m, 0, 0);

  return { prev: prevDate, next: nextDate };
}

function tickClock() {
  const now = new Date();
  document.getElementById('clockTime').textContent =
    now.toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

  const { prev, next } = getPrevAndNextReport();
  const total   = next - prev;
  const elapsed = now - prev;
  const pct     = Math.max(0, Math.min(100, (elapsed / total) * 100));
  document.getElementById('progressBar').style.width = pct.toFixed(2) + '%';

  const diff = next - now;
  const hh = Math.floor(diff / 3600000);
  const mm = Math.floor((diff % 3600000) / 60000);
  let human;
  if (hh > 0) human = `${hh} ч ${mm} мин`;
  else human = `${mm} мин`;

  document.getElementById('progressLabel').textContent =
    `До ${pad(next.getHours())}:${pad(next.getMinutes())} — ${human}`;
}

/* ============================================================
   РАСПИСАНИЕ АВТООТПРАВКИ
   ============================================================ */
let lastAttempt = 0;
function checkSchedule() {
  if (!selectedDistrict) return;
  const now = Date.now();
  if (now - lastAttempt < 5 * 60 * 1000) return;

  const data = loadFormData();
  const current = data[selectedDistrict];
  if (!current || !current.status) return;

  const lastSubmit = localStorage.getItem(LAST_SUBMIT_KEY);
  const lastMs = lastSubmit ? new Date(lastSubmit).getTime() : 0;

  const today = new Date();
  let trigger = null;
  for (const t of SUBMIT_TIMES) {
    const [h, m] = t.split(':').map(Number);
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const s = new Date(today);
      s.setDate(s.getDate() - dayOffset);
      s.setHours(h, m, 0, 0);
      const sMs = s.getTime();
      if (sMs <= now && sMs > lastMs && (!trigger || sMs > trigger)) trigger = sMs;
    }
  }

  if (trigger !== null) {
    lastAttempt = now;
    submitData();
  }
}

/* ============================================================
   TOAST & МОДАЛКА
   ============================================================ */
let toastTimer = null;
function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4000);
}

const confirmModal = document.getElementById('confirmModal');
function openModal() {
  if (!selectedDistrict) return;
  const data = loadFormData();
  const current = data[selectedDistrict];
  if (!current || !current.status) {
    showToast('Сначала выберите состояние снега', 'error');
    return;
  }
  document.getElementById('modalDistrict').textContent = selectedDistrict;
  confirmModal.hidden = false;
  document.getElementById('modalConfirm').focus();
}
function closeModal() { confirmModal.hidden = true; }

/* ============================================================
   ГОРЯЧИЕ КЛАВИШИ
   ============================================================ */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key >= '1' && e.key <= '4') {
    const idx = parseInt(e.key, 10) - 1;
    if (STATUS_VALUES[idx]) onStatusClick(STATUS_VALUES[idx]);
  }
});

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
(function init() {
  populateSelect();

  // 1) URL параметр ?d=...
  const fromUrl = getDistrictFromURL();
  if (fromUrl) {
    selectedDistrict = fromUrl;
    localStorage.setItem(SELECTED_KEY, fromUrl);
  } else {
    // 2) Из localStorage
    const saved = localStorage.getItem(SELECTED_KEY);
    if (saved && DISTRICTS.includes(saved)) {
      selectedDistrict = saved;
    }
  }

  // Обработчики экрана выбора
  districtSelect.addEventListener('change', () => {
    startBtn.disabled = !districtSelect.value;
  });
  startBtn.addEventListener('click', () => {
    if (!districtSelect.value) return;
    selectedDistrict = districtSelect.value;
    localStorage.setItem(SELECTED_KEY, selectedDistrict);
    closeSetupView();
  });
  cancelSetupBtn.addEventListener('click', closeSetupView);

  // Обработчики формы
  commentInput.addEventListener('input', onCommentChange);

  changeDistrictBtn.addEventListener('click', () => {
    const data = loadFormData();
    const current = data[selectedDistrict];
    if (current && current.status) {
      const ok = confirm(
        'Данные текущего района ещё не отправлены. Переключиться на другой район?\n' +
        '(Данные сохранятся в браузере, вернуться можно в любой момент)'
      );
      if (!ok) return;
    }
    openSetupView(true);
  });

  // Кнопки отправки
  submitBtn.addEventListener('click', openModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalConfirm').addEventListener('click', () => {
    closeModal();
    submitData();
  });
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeModal();
  });

  // Стартовый экран
  if (selectedDistrict) {
    closeSetupView();
  } else {
    openSetupView(false);
  }

  // Первый визит — фиксируем базовое время (чтобы не отправлять сразу)
  if (!localStorage.getItem(LAST_SUBMIT_KEY)) {
    localStorage.setItem(LAST_SUBMIT_KEY, new Date().toISOString());
  }

  // Часы + расписание
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(checkSchedule, 30 * 1000);
  setTimeout(checkSchedule, 3000);
})();