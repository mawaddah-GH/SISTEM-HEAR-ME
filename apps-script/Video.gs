/**
 * Video.gs — Tracker video isyarat Faris (tambahan kepada Code.gs Sistem HEAR ME)
 * -----------------------------------------------------------------------------
 * CARA PASANG (dari laptop):
 * 1) Buka Sheet "Sistem HEAR ME" → Extensions → Apps Script.
 * 2) Tekan + di sebelah "Files" → Script → namakan "Video". Pastikan fail ini
 *    berada DI BAWAH Code.gs dalam senarai fail.
 * 3) Padam isi asal, tampal SEMUA kod ini, tekan Save.
 * 4) Pilih fungsi "setupVideo" pada dropdown atas → ▷ Run (cipta tab "Video Faris").
 * 5) Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 *
 * Code.gs TAK PERLU diubah. Fail ini menambah:
 *  - PIN untuk Faris (digunakan oleh faris.html sahaja)
 *  - Tab "Video Faris" dalam Sheet
 *  - Had 10 video sebulan, kadar RM10 satu video
 *  - Faris hanya boleh tambah / ubah / padam video yang BELUM dibayar.
 *    Status bayaran hanya boleh diubah oleh Admin & Finance.
 */
const VIDEO = {
  pin: '2741',            // PIN Faris — mesti sama dengan FARIS_PIN dalam faris.html, dan berbeza daripada PIN lain
  limit: 10,              // had video sebulan
  rate: 10,               // RM satu video
  sheet: 'Video Faris'
};

PINS.faris = VIDEO.pin;

KIND.videos = { sheet: VIDEO.sheet, idCol: 7, cols: ['date', 'title', 'link', 'note', 'status', 'paidOn'] };
T_DATE.push('paidOn');

READ.admin.push('videos');
READ.finance.push('videos');
READ.faris = ['videos'];

WRITE.admin.videos = ALL;
WRITE.finance.videos = { fields: ['status', 'paidOn'] };
WRITE.faris = { videos: ALL };   // dikawal lagi oleh semakVideo_ di bawah

/* ---- Bungkus fungsi asal Code.gs (tanpa ubah Code.gs) ---- */
const _loadForAsal = loadFor, _saveItemAsal = saveItem, _delItemAsal = delItem, _cfgOutAsal = cfgOut;

loadFor = function (me) { pastikanTabVideo_(); return _loadForAsal(me); };

cfgOut = function () { const c = _cfgOutAsal(); c.videoLimit = VIDEO.limit; c.videoRate = VIDEO.rate; return c; };

saveItem = function (me, kind, item) {
  if (kind === 'videos') semakVideo_(me, item);
  return _saveItemAsal(me, kind, item);
};

delItem = function (me, kind, id) {
  if (kind === 'videos' && me.role === 'faris') {
    const r = findRow(sheetOf('videos'), KIND.videos, id);
    if (r && readRow('videos', r).status === 'Dibayar') throw err('Video ini dah dibayar dan tak boleh dipadam.', 'forbidden');
  }
  return _delItemAsal(me, kind, id);
};

function semakVideo_(me, item) {
  if (!item) return;
  const r = item.id ? findRow(sheetOf('videos'), KIND.videos, item.id) : 0;
  const lama = r ? readRow('videos', r) : null;

  if (me.role === 'faris') {
    if (lama && lama.status === 'Dibayar') throw err('Video ini dah dibayar dan tak boleh diubah.', 'forbidden');
    item.status = lama ? (lama.status || 'Belum dibayar') : 'Belum dibayar';
    item.paidOn = lama ? (lama.paidOn || '') : '';
    if (!item.date) item.date = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
    if (!/^https?:\/\//i.test(String(item.link || '').trim())) throw err('Sila tampal link video (bermula dengan https://).');
    const bulan = String(item.date).slice(0, 7);
    const ada = readKind('videos').filter(v => v.id !== item.id && String(v.date || '').slice(0, 7) === bulan).length;
    if (ada >= VIDEO.limit) throw err('Had ' + VIDEO.limit + ' video untuk bulan ini dah penuh. Video baru boleh dihantar bulan depan.', 'limit');
  }
  if (!item.status) item.status = 'Belum dibayar';
  if (item.status !== 'Dibayar') item.paidOn = '';
}

function pastikanTabVideo_() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(VIDEO.sheet)) return;
  const sh = ss.insertSheet(VIDEO.sheet);
  sh.getRange(1, 1).setValue('VIDEO ISYARAT FARIS — RM' + VIDEO.rate + ' satu video, had ' + VIDEO.limit + ' video sebulan').setFontWeight('bold');
  sh.getRange(2, 1, 1, 7).setValues([['Tarikh', 'Tajuk / perkataan isyarat', 'Link video', 'Catatan', 'Status bayaran', 'Tarikh dibayar', 'ID']])
    .setFontWeight('bold').setBackground('#16285A').setFontColor('#FFFFFF');
  sh.setFrozenRows(2);
  sh.setColumnWidth(2, 240); sh.setColumnWidth(3, 300); sh.setColumnWidth(4, 220);
  sh.getRange('A3:A').setNumberFormat('dd/MM/yyyy');
  sh.getRange('F3:F').setNumberFormat('dd/MM/yyyy');
}

/** Jalankan sekali selepas tampal fail ini. */
function setupVideo() {
  pastikanTabVideo_();
  Logger.log('Tab "' + VIDEO.sheet + '" sedia. Jangan lupa Deploy → New version.');
}
