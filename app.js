(() => {
  'use strict';
  const C = VenueCore, cfg = window.VENUE_CONFIG, $ = s => document.querySelector(s);
  const demo = cfg.mode === 'demo';
  let room = 'N306', slots = [], revision = 0, receipt = null, pending = null, lookup = null, availabilityReady = false, availabilityMessage = '正在讀取時段…';
  const dateInput = $('#check-date'); dateInput.min = C.today(); dateInput.value = C.today();
  const records = [
    { id: 'SAMPLE1', room: 'N306', date: C.today(), start: '10:00', end: '12:00', status: '核准' },
    { id: 'SAMPLE2', room: 'N306', date: C.today(), start: '14:00', end: '16:00', status: '待審核' },
    { id: 'SAMPLE3', room: 'S311', date: C.today(), start: '13:00', end: '15:00', status: '核准' }
  ];
  function el(tag, text, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function random() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), x => x.toString(16).padStart(2, '0')).join(''); }
  function conflict(p, except) { return records.some(r => r.id !== except && C.active(r.status) && C.overlaps(p, r)); }
  async function api(action, data = {}) {
    if (demo) {
      await new Promise(r => setTimeout(r, 180));
      if (action === 'capabilities') return { continuousBooking: true };
      if (action === 'availability') return records.filter(r => C.active(r.status)).map(r => C.dailySlot(r, data.date)).filter(Boolean);
      if (action === 'searchBookings') return records.filter(r => r.unit === data.unit && r.date <= data.date && (r.endDate || r.date) >= data.date && (!data.room || r.room === data.room)).map(C.publicSlot).sort((a,b) => a.start.localeCompare(b.start));
      if (action === 'submit') {
        const old = records.find(r => r.token === data.token); if (old) return { id: old.id, status: old.status };
        C.validate(data); if (conflict(data)) throw new Error('這個時段已有人申請，請更新時段表並另選時間。');
        const record = { ...data, id: `${data.room}-${data.date.replaceAll('-', '')}-${random().slice(0, 8).toUpperCase()}`, status: '待審核', reason: '', reviewedAt: '' };
        records.push(record); return { id: record.id, status: record.status };
      }
      if (action === 'lookup') { const r = records.find(r => r.id === data.id && r.token === data.token); if (!r) throw new Error('查無資料，請確認申請編號與查詢碼。'); return { ...C.publicSlot(r), id: r.id, reason: r.reason, reviewedAt: r.reviewedAt }; }
      throw new Error('不支援的操作。');
    }
    if (cfg.mode !== 'live' || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(cfg.apiUrl)) throw new Error('正式服務尚未設定完成，請聯繫中心。');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...data }), redirect: 'follow', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error('連線失敗');
      let body; try { body = await response.json(); } catch { throw new Error('服務回應無法讀取，請確認部署權限。'); }
      if (!body.ok) throw new Error(body.error || '目前無法完成操作。'); return body.data;
    } catch (e) { if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('暫時無法確認回應。若正在送出，請保留頁面並按重試，系統會避免重複建立。'); throw e; }
    finally { clearTimeout(timeout); }
  }
  $('#mode-notice').textContent = demo ? '示範模式｜資料只保留於本頁，重新整理即重置；不會寄信或新增行事曆。請使用虛構資料測試。' : '線上申請｜送出後請保存查詢碼，核准後才可使用場地。';
  function page(name) { document.querySelectorAll('.page').forEach(x => x.hidden = x.id !== `page-${name}`); document.querySelectorAll('[data-page]').forEach(x => x.classList.toggle('selected', x.dataset.page === name)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => page(b.dataset.page));
  $('.brand').onclick = e => { e.preventDefault(); page('booking'); };
  C.rooms.forEach((code, i) => {
    const b = el('button', null, 'room-card'); b.type = 'button'; b.dataset.room = code;
    b.append(el('small', `SPACE 0${i + 1}`), el('span', code, 'room-code'), el('span', '▦', 'room-symbol'));
    const info = C.roomInfo[code];
    const bottom = el('span', null, 'room-bottom'); bottom.append(el('span', info.type), el('span', '選擇 →')); b.append(bottom);
    if (info.capacity !== null) b.append(el('small', `容納 ${info.capacity} 人`, 'room-capacity'));
    b.onclick = () => { room = code; renderSelection(); renderSlots(); }; $('#rooms').append(b);
  });
  function renderSelection() {
    document.querySelectorAll('.room-card').forEach(b => { b.classList.toggle('active', b.dataset.room === room); b.setAttribute('aria-pressed', String(b.dataset.room === room)); });
    const info = C.roomInfo[room], roomLabel = `${room}（${info.type}）`;
    $('#selected-room').textContent = roomLabel; $('#form-room').textContent = roomLabel; $('#form-date').textContent = dateInput.value;
    const people = $('#booking-form [name=people]');
    if (info.capacity === null) people.removeAttribute('max'); else people.max = String(info.capacity);
    $('#people-help').textContent = info.capacity === null ? '會議室不設人數上限，請填寫實際人數。' : `${room} 最多容納 ${info.capacity} 人。`;
    $('#software-field').hidden = room !== 'S311';
    $('#booking-form [name=software]').disabled = room !== 'S311';
    const startDate = $('#booking-form [name=date]'), endDate = $('#booking-form [name=endDate]');
    const previous = startDate.value;
    startDate.min = C.today(); startDate.value = dateInput.value; endDate.min = startDate.value;
    if (!endDate.value || endDate.value === previous || endDate.value < startDate.value) endDate.value = startDate.value;
    $('#booking-form [name=start]').max = room === 'S311' ? '16:59' : '20:59';
    $('#booking-form [name=end]').max = C.closing(room);
    $('#hours-help').textContent = `${room} 每日開放 08:00～${C.closing(room)}。連續借用會保留起訖期間內每天的開放時段。`;
  }
  function minuteTime(n) { return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
  function renderSlots() {
    const host = $('#schedule'); host.replaceChildren();
    if (!availabilityReady) { host.append(el('p', availabilityMessage, 'empty')); return; }
    const close = C.closing(room);
    const busy = slots.filter(s => s.room === room && s.start < close && s.end > '08:00').map(s => ({ ...s, start: s.start < '08:00' ? '08:00' : s.start, end: s.end > close ? close : s.end })).sort((a, b) => a.start.localeCompare(b.start));
    const segments = []; let cursor = '08:00';
    busy.forEach(s => { if (s.start > cursor) segments.push({ start: cursor, end: s.start, status: '可借用' }); segments.push(s); if (s.end > cursor) cursor = s.end; });
    if (cursor < close) segments.push({ start: cursor, end: close, status: '可借用' });
    segments.forEach(s => {
      const free = s.status === '可借用'; let start = s.start;
      if (free && dateInput.value === C.today()) { const now = new Date(); const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now); const [h, m] = parts.split(':').map(Number); start = [start, minuteTime(h * 60 + m + 1)].sort().pop(); }
      const past = new Date(dateInput.value + 'T' + s.end + ':00+08:00') <= new Date() || (free && start >= s.end);
      const row = el('div', null, `slot ${free ? '' : 'busy'} ${s.status === '核准' ? 'approved-slot' : ''} ${past ? 'past' : ''}`);
      row.append(el('span', `${s.start} — ${s.end}`, 'slot-time'));
      const status = el(free && !past ? 'button' : 'span', past ? '已過時段' : free ? '選擇時段 ↗' : s.status === '核准' ? '已借出' : '有人送出申請未審核', 'slot-status');
      if (free && !past) status.onclick = () => { $('#booking-form [name=start]').value = start; $('#booking-form [name=end]').value = s.end; $('#booking-form [name=start]').focus(); };
      row.append(status); host.append(row);
    });
  }
  async function refresh() {
    const version = ++revision; availabilityReady = false; availabilityMessage = '正在讀取時段…'; renderSelection();
    $('#schedule').replaceChildren(el('p', '正在讀取時段…', 'empty'));
    try { if (!C.dateValid(dateInput.value) || dateInput.value < C.today()) throw new Error('請選擇今天或之後的日期。'); const result = await api('availability', { date: dateInput.value }); if (version !== revision) return; slots = result; availabilityReady = true; renderSlots(); }
    catch (e) { if (version === revision) { slots = []; availabilityMessage = e.message; $('#schedule').replaceChildren(el('p', e.message, 'message')); } }
  }
  dateInput.onchange = refresh; $('#refresh').onclick = refresh;
  function shift(days) { const d = new Date(dateInput.value + 'T12:00:00+08:00'); d.setDate(d.getDate() + days); const value = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(d); dateInput.value = value < C.today() ? C.today() : value; refresh(); }
  $('#prev-day').onclick = () => shift(-1); $('#next-day').onclick = () => shift(1);
  const form = $('#booking-form');
  form.elements.date.onchange = () => { dateInput.value = form.elements.date.value; refresh(); };
  let noticeRead = false;
  const noticeDialog = $('#notice-dialog'), noticeScroll = $('#notice-scroll'), noticeFinish = $('#notice-finish');
  $('#guide-content').append($('#notice-content').content.cloneNode(true));
  noticeScroll.append($('#notice-content').content.cloneNode(true));
  function checkNoticeEnd() {
    if (!noticeDialog.open) return;
    if (noticeScroll.scrollTop + noticeScroll.clientHeight >= noticeScroll.scrollHeight - 4) {
      noticeFinish.disabled = false;
      $('#notice-progress').textContent = '已到達注意事項最後。請確認內容後按「已閱讀，返回申請」。';
    }
  }
  function openNotice() {
    noticeFinish.disabled = true;
    $('#notice-progress').textContent = '請向下捲動閱讀至最後，再按「已閱讀，返回申請」，系統會自動勾選已讀。';
    noticeDialog.showModal(); noticeScroll.scrollTop = 0; noticeScroll.focus();
    requestAnimationFrame(checkNoticeEnd);
  }
  $('#read-notice').onclick = openNotice;
  noticeScroll.addEventListener('scroll', checkNoticeEnd);
  window.addEventListener('resize', checkNoticeEnd);
  $('#notice-cancel').onclick = () => noticeDialog.close();
  noticeFinish.onclick = () => {
    if (noticeFinish.disabled) return;
    noticeRead = true; $('#consent').checked = true; noticeDialog.close();
    form.querySelector('[type=submit]').disabled = false;
    $('#notice-hint').textContent = '已完成閱讀，系統已自動勾選，可送出申請。'; form.querySelector('[type=submit]').focus();
  };
  form.onsubmit = async e => {
    e.preventDefault();
    if (!noticeRead || !$('#consent').checked) { openNotice(); return; }
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type=submit]'), msg = $('#submit-message'); msg.textContent = ''; button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form)); Object.keys(data).forEach(k => data[k] = data[k].trim()); Object.assign(data, { room, software: room === 'S311' ? data.software : '' }); C.validate(data);
      if (data.endDate !== data.date) {
        let supported; try { supported = await api('capabilities'); } catch { throw new Error('請等待中心更新跨日借用服務後再送出；目前尚未送出申請。'); }
        if (!supported.continuousBooking) throw new Error('請等待中心更新跨日借用服務後再送出；目前尚未送出申請。');
      }
      if (pending && JSON.stringify(pending.data) !== JSON.stringify(data)) throw new Error('上一筆申請尚未確認，請恢復原填寫內容後重試，或保留查詢碼聯繫中心。');
      if (!pending) pending = { data, token: random() };
      const result = await api('submit', { ...pending.data, token: pending.token }); receipt = { ...result, token: pending.token }; pending = null;
      $('#receipt-id').textContent = receipt.id; $('#receipt-token').textContent = receipt.token;
      $('#receipt-note').textContent = demo ? '這是示範申請，重新整理頁面後即清除。' : '請立即保存查詢碼；關閉本頁後無法再次顯示。中心通知信由後端寄送，若暫時失敗會重試。';
      $('#copy-message').textContent = ''; $('#receipt').showModal(); form.reset();
      noticeRead = false; $('#consent').checked = false; $('#consent').disabled = true; $('#notice-hint').textContent = '請先閱讀注意事項至最後並確認，系統會自動勾選已讀並開放送出。'; refresh();
    } catch (error) {
      // Validation/business failures are definitive. Network/unknown replies keep the same token.
      if (/已有|必須|請選擇|完整|有效|最多|人數|上限|開放|過期/.test(error.message)) pending = null;
      msg.textContent = error.message + (pending ? `\n本次查詢碼（請保留）：${pending.token}` : '');
    } finally { button.disabled = !noticeRead; }
  };
  $('#copy-receipt').onclick = async () => { try { await navigator.clipboard.writeText(`申請編號：${receipt.id}\n查詢碼：${receipt.token}`); $('#copy-message').textContent = '已複製，請貼到安全的地方保存。'; } catch { $('#copy-message').textContent = '無法自動複製，請手動選取上方資訊保存。'; } };
  $('#view-receipt').onclick = () => { $('#receipt').close(); page('lookup'); $('#lookup-form [name=id]').value = receipt.id; $('#lookup-form [name=token]').value = receipt.token; $('#lookup-form').requestSubmit(); };
  function showResult(r) {
    const host = $('#lookup-result'); host.replaceChildren(el('span', r.status, 'status-badge')); const dl = el('dl');
    [['申請編號', r.id], ['借用場地與時段', `${r.room}｜${r.date} ${r.start} ～ ${r.endDate || r.date} ${r.end}`], ['審核時間', r.reviewedAt || '尚未審核'], ...(r.status === '不核准' ? [['不核准原因', r.reason || '請聯繫教發中心']] : [])].forEach(([k, v]) => dl.append(el('dt', k), el('dd', v)));
    host.append(dl); if (r.syncPending) host.append(el('p', '管理員的變更正在處理中，請稍後更新查詢。', 'help'));
    $('#demo-review').hidden = !demo; $('#demo-status').value = r.status;
  }
  $('#lookup-form').onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; $('#demo-review').hidden = true; $('#lookup-result').textContent = '查詢中…'; try { const credentials = Object.fromEntries(new FormData(e.target)); Object.keys(credentials).forEach(k => credentials[k] = credentials[k].trim()); const r = await api('lookup', credentials); lookup = credentials; showResult(r); } catch (error) { lookup = null; $('#lookup-result').textContent = error.message; } finally { b.disabled = false; } };
  $('#demo-apply').onclick = async () => { if (!demo || !lookup) return; const r = records.find(x => x.id === lookup.id && x.token === lookup.token), status = $('#demo-status').value, reason = $('#demo-reason').value.trim(); const msg = $('#review-message'); if (status === '不核准' && !reason) { msg.textContent = '請填寫不核准原因。'; return; } if (C.active(status) && conflict(r, r.id)) { msg.textContent = '此時段已有其他申請，無法恢復占用。'; return; } Object.assign(r, { status, reason: status === '不核准' ? reason : '', reviewedAt: status === '待審核' ? '' : new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) }); msg.textContent = '已套用模擬審核結果。'; showResult(await api('lookup', lookup)); refresh(); };
  C.units.forEach(unit => { ['#booking-form', '#unit-lookup-form'].forEach(selector => { const option = el('option', unit); option.value = unit; $(selector + ' [name=unit]').append(option); }); });
  C.rooms.forEach(code => { const option = el('option', `${code}（${C.roomInfo[code].type}）`); option.value = code; $('#unit-lookup-form [name=room]').append(option); });
  $('#unit-lookup-form [name=date]').value = C.today();
  $('#unit-lookup-form').onsubmit = async e => {
    e.preventDefault(); const button = e.target.querySelector('button'), host = $('#unit-lookup-result');
    button.disabled = true; host.replaceChildren(el('p', '查詢中…', 'help'));
    try {
      const results = await api('searchBookings', Object.fromEntries(new FormData(e.target)));
      host.replaceChildren(el('p', results.length ? `找到 ${results.length} 筆申請` : '查無符合條件的申請，請確認申請時填寫的單位、借用日期與場地。', 'help'));
      results.forEach(r => { const item = el('div', null, 'slot'); item.append(el('span', `${r.room}｜${r.date} ${r.start} ～ ${r.endDate || r.date} ${r.end}`, 'slot-time'), el('span', ({'核准':'已審核','待審核':'未審核','不核准':'已審核','取消':'已取消','未審核':'未審核','已審核':'已審核','已取消':'已取消'})[r.status] || '未審核', 'status-badge')); host.append(item); if (r.syncPending) host.append(el('p', '管理員的變更正在同步，請稍後重新查詢。', 'help')); });
    } catch (err) { host.replaceChildren(el('p', err.message === '不支援的操作。' ? '單位查詢功能尚待中心更新服務，暫時請使用下方編號查詢。' : err.message, 'message')); }
    finally { button.disabled = false; }
  };
  renderSelection(); refresh();
})();
