/* Shared browser / Apps Script validation. Copy to Core.gs using npm run package:gas. */
var VenueCore = (function () {
  var rooms = ['N306', 'N312', 'S311', 'T520', 'T720'];
  var units = ['工程學院', '管理學院', '人設學院', '機械工程系', '半導體工程系', '電機工程系', '電子工程系', '資訊網路工程系', '企業管理系', '資訊管理系', '數位行銷暨跨境商務系', '財務金融系', '工業管理系', '應用外語系', '多媒體與遊戲發展科學系', '觀光休閒系', '文化創意與數位媒體設計系', '教務處', '學務處', '總務處', '招生處', '國合處', '研發處', '秘書室', '人事室', '環安室', '進修部'];
  var roomInfo = {
    N306: { type: '會議室', capacity: null },
    N312: { type: '會議室', capacity: null },
    S311: { type: '電腦教室', capacity: 56 },
    T520: { type: '一般教室', capacity: 110 },
    T720: { type: '一般教室', capacity: 200 }
  };
  var statuses = ['待審核', '核准', '不核准', '取消'];
  function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date()); }
  function active(status) { return status === '待審核' || status === '核准'; }
  function closing(room) { return room === 'S311' ? '17:00' : '21:00'; }
  function overlaps(a, b) { return a.room === b.room && a.date + 'T' + a.start < (b.endDate || b.date) + 'T' + b.end && (a.endDate || a.date) + 'T' + a.end > b.date + 'T' + b.start; }
  function dailySlot(p, date) {
    var last = p.endDate || p.date;
    if (date < p.date || date > last) return null;
    var start = date === p.date ? p.start : '08:00', end = date === last ? p.end : closing(p.room);
    start = start < '08:00' ? '08:00' : start; end = end > closing(p.room) ? closing(p.room) : end;
    return start < end ? { room:p.room, date:date, start:start, end:end, status:p.status } : null;
  }
  function dates(p) {
    var result = [], last = p.endDate || p.date;
    for (var date = p.date; date <= last; date = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0,10)) result.push(date);
    return result;
  }
  function dateValid(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; }
  function validate(p, now) {
    if (!units.includes(p.unit)) throw new Error('請選擇有效的單位名稱。');
    if (!rooms.includes(p.room)) throw new Error('請選擇有效場地。');
    if (!dateValid(p.date) || p.date < (now || today())) throw new Error('請選擇今天或之後的有效日期。');
    var last = p.endDate || p.date;
    if (!dateValid(last) || last < p.date) throw new Error('請選擇不早於開始日期的結束日期。');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end) || (last === p.date && p.start >= p.end)) throw new Error('結束時間必須晚於開始時間。');
    if (p.start < '08:00' || p.start >= closing(p.room) || p.end <= '08:00' || p.end > closing(p.room)) throw new Error('請選擇開放時間內的時段：' + p.room + ' 為 08:00–' + closing(p.room) + '。');
    if (new Date(p.date + 'T' + p.start + ':00+08:00').getTime() <= Date.now()) throw new Error('開始時間必須晚於現在。');
    ['unit', 'applicant', 'contact', 'email', 'title', 'purpose'].forEach(function (k) { if (typeof p[k] !== 'string' || !p[k].trim() || p[k].length > (k === 'purpose' ? 1000 : 150)) throw new Error('請完整填寫必填欄位，並確認文字未超過長度限制。'); });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error('請填寫有效的 Email。');
    if (!Number.isSafeInteger(Number(p.people)) || Number(p.people) < 1) throw new Error('人數須為大於 0 的整數。');
    if (roomInfo[p.room].capacity !== null && Number(p.people) > roomInfo[p.room].capacity) throw new Error('人數超過 ' + p.room + ' 容量，最多可容納 ' + roomInfo[p.room].capacity + ' 人。');
    if (typeof p.notes !== 'string' || p.notes.length > 500) throw new Error('備註最多 500 字。');
    if (typeof p.software !== 'string' || p.software.length > 500) throw new Error('軟體需求最多 500 字。');
    if (p.room !== 'S311' && p.software) throw new Error('軟體需求僅適用於 S311。');
    return p;
  }
  function publicSlot(p) { return { room: p.room, date: p.date, endDate: p.endDate || p.date, start: p.start, end: p.end, status: p.status }; }
  return { rooms: rooms, units: units, roomInfo: roomInfo, statuses: statuses, today: today, active: active, overlaps: overlaps, validate: validate, dateValid: dateValid, publicSlot: publicSlot, closing: closing, dailySlot: dailySlot, dates: dates };
})();
if (typeof module !== 'undefined') module.exports = VenueCore;
