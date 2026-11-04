/* Sistem HEAR ME — satu app, paparan ikut PIN. Data dalam Google Sheet melalui Apps Script. */
const API_URL = 'https://script.google.com/macros/s/AKfycbzeapEY_NbMEDpKfJym-wbqJ99ziJkj-_VuGWMmzsnRK_KVcRwpUhfzTVRDYuI5hE_n/exec';   // pilihan: tampal link Web app di sini supaya pengguna hanya perlu isi PIN

/* ---------- Pemalar ---------- */
const BULAN=['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
const BLN=['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];
const HARI=['Ahd','Isn','Sel','Rab','Kha','Jum','Sab'];
const HARI_P=['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
const STATUS=['Belum Mula','Dalam Proses','Selesai','Tertangguh'];
const PIC=['Presiden','Admin','SU','Admin & SU','Finance'];
const STAFF=['Anas','Uzma'];
const CARS=['Yaris','Starex','Grab','Kereta lain'];   // Kereta lain = kadar petrol; tulis nama kereta dalam Catatan
const TSTAT=['Dirancang','Belum dituntut','Disahkan Presiden','Dibayar'];
const RTYPE=['Sumbangan','Tajaan','Yuran ahli','Geran','Lain-lain'];
const PTYPE=['Staf','Vendor','Tuntutan','Lain-lain'];
const TARGET_JAM=160;
const TNAME={ujian:'Master Taqwim (SALINAN UJIAN)',sebenar:'Master Taqwim (SEBENAR)'};
/* Tanpa PIN: pengguna hanya tekan butang peranan. */
const ROLE_PINS={presiden:'5364',admin:'5145',finance:'0337'};
const ROLE_NAME={presiden:'Presiden',admin:'Admin & SU',finance:'Finance'};
const TABS={
  admin:[['ringkas','Ringkasan'],['tugas','Tugasan'],['presiden','Presiden'],['aktiviti','Aktiviti'],['staf','Anas & Uzma']],
  presiden:[['hari','Hari ini'],['jadual','Jadual'],['keputusan','Keputusan'],['ptuntut','Tuntutan']],
  finance:[['fringkas','Ringkasan'],['ftuntut','Tuntutan'],['terimaan','Terimaan'],['bayaran','Bayaran']]
};

/* ---------- Keadaan ---------- */
const store={get:k=>{try{return localStorage.getItem(k)||''}catch(e){return ''}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
let api=API_URL||store.get('hm-api'), pin=store.get('hm-pin');
let S=null,ME=null,CFG={},phase='boot',bootErr='';
let tab='',vm='',openId=null,confirmDel=null,flt={tasks:'aktif',staff:'Semua',acts:'akan',pay:'belum',padmin:'jadual'},confirmTarget=false;
let saveMsg='',pendingSaves=0,timers={},busy={},msg={},lastLoad=0;

/* ---------- Pembantu ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const pad=n=>String(n).padStart(2,'0');
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const thisMonth=()=>todayISO().slice(0,7);
const nowHM=()=>{const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())};
const pd=s=>{if(!s)return null;const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const daysTo=s=>{const d=pd(s);if(!d)return null;return Math.round((d-pd(todayISO()))/864e5)};
const mins=t=>{if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m};
const hrs=r=>{if(typeof r.h==='number')return r.h;if(!r.in||!r.out)return 0;let d=mins(r.out)-mins(r.in);if(d<0)d+=1440;return d/60};   // syif lepas tengah malam dikira betul
const fmtH=h=>(Math.round(h*10)/10).toLocaleString('ms-MY');
const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return isFinite(n)?n:0};
const rm=n=>'RM '+num(n).toLocaleString('ms-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const monthLabel=m=>{const [y,mm]=m.split('-');return BULAN[+mm-1]+' '+y};
const shiftMonth=(m,d)=>{const [y,mm]=m.split('-').map(Number);const x=new Date(y,mm-1+d,1);return x.getFullYear()+'-'+pad(x.getMonth()+1)};
const done=s=>String(s||'').startsWith('✓');
const dateBlock=s=>{const d=pd(s);return d?`<div class="date"><span class="d">${d.getDate()}</span><span class="w">${BLN[d.getMonth()]} · ${HARI[d.getDay()]}</span></div>`:`<div class="date"><span class="none">Tiada tarikh</span></div>`};
const longDate=s=>{const d=pd(s);return d?`${HARI_P[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`:'Tiada tarikh'};
const greet=()=>{const h=new Date().getHours();return h<12?'Selamat pagi':h<15?'Selamat tengah hari':h<19?'Selamat petang':'Selamat malam'};
const link=(u,t)=>u?`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`:'';
const waze=q=>`https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
const can=k=>S&&Array.isArray(S[k]);

/* Tuntutan */
const rateOf=t=>t.car==='Starex'?num(CFG.rateDiesel||0.84):num(CFG.rate||0.7);
const fuelOf=t=>t.car==='Grab'?num(t.fuel):(t.fuel!==''&&t.fuel!=null?num(t.fuel):num(t.km)*rateOf(t));
const totalOf=t=>fuelOf(t)+num(t.toll)+num(t.park)+num(t.sara)+num(t.inap);
const missing=t=>{const m=[];if(!t.car)m.push('kenderaan');if(t.car==='Grab'){if(t.fuel===''||t.fuel==null)m.push('tambang')}else if(t.car&&!num(t.km))m.push('KM');return m};
const tripChip=s=>({'Dirancang':'gold','Belum dituntut':'warn','Disahkan Presiden':'info','Dibayar':'ok'}[s]||'');

/* Tugasan */
function taskState(t){if(t.status==='Selesai')return 'done';const n=daysTo(t.due);if(n===null)return '';if(n<0)return 'late';if(n<=3)return 'soon';return ''}
function monthHours(who,m){m=m||thisMonth();return (S.staff||[]).filter(r=>r.who===who&&(r.date||'').startsWith(m)).reduce((a,r)=>a+hrs(r),0)}
function openShift(who){const t=new Date(),y=new Date(t);y.setDate(t.getDate()-1);const ok=[iso(t),iso(y)];return (S.staff||[]).find(r=>r.who===who&&ok.includes(r.date)&&r.in&&!r.out)}

/* ---------- Pelayan ---------- */
async function call(body){
  const res=await fetch(api,{method:'POST',body:JSON.stringify({...body,pin})});
  const j=await res.json();if(!j.ok){const e=new Error(j.error||'Ralat');e.code=j.code;throw e}return j;
}
async function load(quiet){
  if(!quiet){phase='loading';render()}
  try{
    const res=await fetch(api+(api.includes('?')?'&':'?')+'pin='+encodeURIComponent(pin));
    const j=await res.json();
    if(!j.ok){
      if(j.code==='pin'){store.del('hm-pin');pin='';bootErr='PIN salah. Cuba lagi.';phase='setup';render();return}
      if(j.code==='setup'){bootErr=j.error;phase='setup';render();return}
      throw new Error(j.error);
    }
    if(quiet&&(pendingSaves||Object.keys(timers).length))return;
    const roleChanged=!ME||ME.role!==j.me.role;
    S=j.data;ME=j.me;CFG=j.cfg||{};lastLoad=Date.now();phase='ready';saveMsg='Dikemas kini '+nowHM();
    if(roleChanged||!TABS[ME.role].some(t=>t[0]===tab)){const saved=store.get('hm-tab-'+ME.role);tab=TABS[ME.role].some(t=>t[0]===saved)?saved:TABS[ME.role][0][0]}
    if(!vm)vm=thisMonth();
  }catch(e){
    if(!S){bootErr='Tak dapat sambung ke Google Sheet. Semak link Web app dan internet, kemudian cuba lagi.';phase='setup'}
    else saveMsg='Tiada sambungan. Data mungkin lama.';
  }
  render();
}
function queueSave(kind,item,ms=900){
  clearTimeout(timers[item.id]);setSave('Belum disimpan…');
  timers[item.id]=setTimeout(()=>{delete timers[item.id];doSave(kind,item)},ms);
}
async function doSave(kind,item){
  pendingSaves++;setSave('Menyimpan…');
  try{const j=await call({a:'save',kind,item});const i=S[kind].findIndex(x=>x.id===item.id);if(i>=0)S[kind][i]=Object.assign(S[kind][i],{row:j.item.row});setSave('Disimpan '+nowHM());return true}
  catch(e){setSave(e.code==='forbidden'?e.message:e.code==='pin'?'PIN salah':'Gagal simpan. Semak internet.');return false}
  finally{pendingSaves--}
}
async function flush(id,kind){if(timers[id]){clearTimeout(timers[id]);delete timers[id];const x=S[kind].find(r=>r.id===id);if(x)await doSave(kind,x)}}
function setSave(m){saveMsg=m;const el=$('#save');if(el)el.textContent=m}

/* ---------- Kerangka ---------- */
function render(){
  if(phase!=='ready'){$('#app').innerHTML=vSetup();return}
  const tabs=TABS[ME.role],badge=k=>({tugas:(S.tasks||[]).filter(t=>t.status!=='Selesai').length,aktiviti:(S.acts||[]).filter(a=>!done(a.takwim)).length||'',
    keputusan:(S.decisions||[]).filter(d=>d.status!=='Dijawab').length||'',ptuntut:claimReady().length||'',
    ftuntut:(S.trips||[]).filter(t=>t.status==='Disahkan Presiden').length||'',bayaran:(S.payments||[]).filter(p=>p.status!=='Dibayar').length||''}[k]??'');
  const hello=ME.role==='presiden'?`${greet()}, Presiden`:greet();
  let h=`<header class="hero band"><div class="wrap">
    <div class="brand"><span><b>HEAR ME</b> · ${esc(ROLE_NAME[ME.role])}</span><span><span class="save" id="save">${esc(saveMsg)}</span> <button class="iconbtn" data-reload="1" aria-label="Muat semula">↻</button></span></div>
    <h1>${esc(hello)}</h1><p class="sub">${longDate(todayISO())}</p>
    ${tabs.length>1?`<nav class="tabs" aria-label="Bahagian">${tabs.map(([k,l])=>{const n=badge(k);return `<button data-tab="${k}" ${tab===k?'aria-current="page"':''}>${l}${n!==''&&n!==0?`<span class="n">${n}</span>`:''}</button>`}).join('')}</nav>`:'<div style="height:14px"></div>'}
  </div></header><main class="band"><div class="wrap">`;
  const V={ringkas:vRingkas,tugas:vTugas,presiden:vPAdmin,aktiviti:vAktiviti,staf:vStaf,hari:vHari,jadual:vJadual,keputusan:vKeputusan,ptuntut:vPTuntut,
    fringkas:vFRingkas,ftuntut:vFTuntut,terimaan:vTerimaan,bayaran:vBayaran}[tab];
  h+=V?V():'';
  h+=`<p class="foot">Data disimpan dalam Google Sheet <b>Sistem HEAR ME</b>. <button class="linkbtn" data-logout="1">Log keluar dari peranti ini</button></p></div></main>`;
  $('#app').innerHTML=h;
}
function vSetup(){
  if(phase==='loading'||phase==='boot')return `<div class="setup band"><div class="card"><div class="brand2"><b>HEAR ME</b> · Sistem</div><p class="muted">Memuatkan data dari Google Sheet…</p></div></div>`;
  return `<div class="setup band"><div class="card" id="setup"><div class="brand2"><b>HEAR ME</b> · Sistem</div><h1>Pilih paparan</h1>
    ${bootErr?`<div class="notice">${esc(bootErr)}</div>`:''}
    ${Object.keys(ROLE_PINS).map(r=>`<button class="btn primary" type="button" data-role="${r}" style="width:100%;margin-top:8px">${esc(ROLE_NAME[r])}</button>`).join('')}
    <p class="muted">Tekan "Log keluar" dalam sistem untuk tukar paparan.</p></div></div>`;
}
const sec=(title,sub,body)=>`<section class="sec"><div class="sechead"><h2>${title}</h2>${sub?`<span>${sub}</span>`:''}</div>${body}</section>`;
const seg=(key,opts,cur)=>`<div class="seg">${opts.map(([k,l])=>`<button data-seg="${key}" data-val="${k}" aria-pressed="${cur===k}">${l}</button>`).join('')}</div>`;
const monthNav=()=>`<div class="monthnav"><button class="btn sm" data-month="-1" aria-label="Bulan sebelum">‹</button><b>${monthLabel(vm)}</b><button class="btn sm" data-month="1" aria-label="Bulan seterusnya">›</button></div>`;
const empty=t=>`<div class="empty">${t}</div>`;
function delBtn(kind,id){return confirmDel===id?`<button class="btn danger" data-del="${kind}" data-delid="${id}">Ya, padam</button>`:`<button class="btn danger" data-askdel="${id}">Padam</button>`}

/* ---------- Borang umum ---------- */
const FORM={
  tasks:[['t','Tugasan','text','w6'],['pic','PIC','select',PIC],['due','Deadline','date'],['status','Status','select',STATUS],['note','Catatan','textarea','w6']],
  staff:[['date','Tarikh','date'],['who','Nama','select',STAFF],['prog','Kemajuan','prog'],['t','Tugasan','text','w6'],['link','Hasil kerja (link Drive / gambar)','url','w6'],['in','Masuk','time'],['out','Keluar','time'],['_h','Jam bekerja','calc']],
  acts:[['name','Nama aktiviti','text','w6'],['date','Tarikh','date'],['loc','Lokasi','text'],['pic','PIC / Penglibatan','text'],['sum','Ringkasan','textarea','w6'],['img','Gambar (link album Drive / Google Photos)','url','w6']],
  trips:[['purpose','Aktiviti / mesyuarat','text','w6'],['date','Tarikh','date'],['time','Masa mula','time'],['depart','Bertolak','time'],['from','Dari','text','w3'],['to','Ke (lokasi)','text','w3'],['with','Pergi dengan','text','w6'],
    ['points','Isi penting / persediaan (satu baris satu perkara)','textarea','w6'],['link','Link dokumen','url','w6'],
    ['car','Kenderaan','select',['',...CARS]],['km','KM pergi-balik','num'],['fuel','Minyak/Tambang RM (kosong = ikut KM)','num'],['toll','Tol RM','num'],['park','Parking RM','num'],['sara','Sara hidup RM','num'],['inap','Penginapan RM','num'],
    ['status','Status tuntutan','select',TSTAT],['ref','No. rujukan','text'],['receipt','Resit','upload','w6'],['note','Catatan','textarea','w6']],
  decisions:[['title','Soalan untuk Presiden','text','w6'],['detail','Butiran','textarea','w6'],['options','Pilihan jawapan (pisah dengan |)','text','w6'],['due','Perlu jawapan sebelum','date'],['link','Link dokumen','url','w3'],['status','Status','select',['Menunggu','Dijawab']]],
  receipts:[['date','Tarikh','date'],['amount','Jumlah RM','num'],['type','Jenis','select',RTYPE],['from','Daripada','text','w3'],['program','Program','text','w3'],['no','No. resit rasmi','text'],['note','Catatan','textarea','w6']],
  payments:[['what','Perkara','text','w6'],['to','Kepada','text','w3'],['type','Jenis','select',PTYPE],['amount','Jumlah RM','num'],['date','Tarikh','date'],['dueBy','Perlu bayar sebelum','date'],['status','Status','select',['Belum dibayar','Dibayar']],['program','Program','text','w3'],['receipt','Resit / invois','upload','w6'],['note','Catatan','textarea','w6']]
};
function form(kind,x,opts={}){
  const defs=FORM[kind].filter(d=>!(opts.hide||[]).includes(d[0]));
  const fid=f=>`f-${kind}-${f}-${x.id}`;
  return `<div class="form" data-kind="${kind}">${defs.map(([f,l,type,a])=>{
    const cls=typeof a==='string'?a:'',v=x[f]??'';
    let inp;
    if(type==='select')inp=`<select id="${fid(f)}" data-f="${f}">${a.map(o=>`<option value="${esc(o)}" ${String(v)===o?'selected':''}>${o||'—'}</option>`).join('')}</select>`;
    else if(type==='prog')inp=`<select id="${fid(f)}" data-f="${f}">${[0,25,50,75,100].map(p=>`<option value="${p}" ${+v===p?'selected':''}>${p}%</option>`).join('')}</select>`;
    else if(type==='textarea')inp=`<textarea id="${fid(f)}" data-f="${f}">${esc(v)}</textarea>`;
    else if(type==='calc')inp=`<input id="${fid(f)}" value="${fmtH(hrs(x))}" disabled>`;
    else if(type==='num')inp=`<input id="${fid(f)}" data-f="${f}" inputmode="decimal" value="${esc(v)}">`;
    else if(type==='upload')inp=`<span class="uprow">${v?link(v,'Lihat fail')+' · ':''}<label class="btn sm" for="${fid(f)}">${busy['up'+x.id]?'Memuat naik…':v?'Tukar fail':'Muat naik foto / PDF'}</label><input id="${fid(f)}" type="file" accept="image/*,application/pdf" class="visually-hidden" data-upload="${f}"></span>`;
    else inp=`<input id="${fid(f)}" data-f="${f}" type="${type}" value="${esc(v)}" ${type==='url'?'placeholder="https://"':''}>`;
    return `<label class="${cls}" ${type==='upload'?'':`for="${fid(f)}"`}>${l}${inp}</label>`;
  }).join('')}<div class="actions">${opts.noDel?'<span></span>':delBtn(kind,x.id)}<span>${opts.extra||''}<button class="btn" data-toggle="${x.id}">Tutup</button></span></div></div>`;
}
function newItem(kind){
  const d={tasks:{t:'',pic:'Admin',due:'',status:'Belum Mula',note:''},staff:{date:todayISO(),who:flt.staff==='Uzma'?'Uzma':'Anas',t:'',prog:0,link:'',in:'',out:''},
    acts:{date:'',name:'',loc:'',pic:'',sum:'',img:'',takwim:''},trips:{date:todayISO(),time:'',depart:'',purpose:'',from:'Casa',to:'',with:'',car:'Yaris',km:'',fuel:'',toll:'',park:'',sara:'',inap:'',status:'Dirancang',ref:'',points:'',link:'',receipt:'',note:'',takwim:''},
    decisions:{title:'',detail:'',options:'Setuju | Tidak setuju',due:'',link:'',status:'Menunggu',answer:'',pnote:''},
    receipts:{date:todayISO(),from:'',type:'Sumbangan',amount:'',program:'',no:'',note:''},payments:{date:todayISO(),to:'',type:'Vendor',what:'',amount:'',dueBy:'',status:'Belum dibayar',program:'',receipt:'',note:''}}[kind];
  const x={id:uid(kind[0]),...d};S[kind].unshift(x);openId=x.id;return x;
}

/* ================= ADMIN ================= */
function hcard(who,mon){
  const m=monthHours(who,mon),o=openShift(who),last=(S.staff||[]).filter(r=>r.who===who).sort((a,b)=>(b.date+b.in).localeCompare(a.date+a.in))[0];
  return `<div class="hcard"><div class="top"><span class="nm">${who}</span><span class="hr">${fmtH(m)}<small>jam</small></span></div>
  <div class="bar"><i style="width:${Math.min(100,m/TARGET_JAM*100)}%"></i></div>
  <div class="meta">${o?`<span class="live">● Sedang bekerja sejak ${o.in}</span>`:last?`Terakhir ${pd(last.date).getDate()} ${BLN[pd(last.date).getMonth()]}: ${esc(last.t||last.project||'—')}`:'Belum ada rekod'}</div></div>`;
}
function vRingkas(){
  const t=S.tasks,dn=t.filter(x=>x.status==='Selesai').length,late=t.filter(x=>taskState(x)==='late').length;
  let h=sec('Tugasan Admin & SU',`${t.length} direkod`,`<div class="stats">
    <button class="stat" data-go="tugas" data-f="semua"><b>${t.length}</b><span>Jumlah tugasan</span></button>
    <button class="stat ok" data-go="tugas" data-f="selesai"><b>${dn}</b><span>Selesai</span></button>
    <button class="stat gold" data-go="tugas" data-f="aktif"><b>${t.length-dn}</b><span>Belum selesai</span></button>
    <button class="stat ${late?'bad':''}" data-go="tugas" data-f="lewat"><b>${late}</b><span>Lewat deadline</span></button></div>`);
  const urgent=t.filter(x=>['late','soon'].includes(taskState(x))).sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  if(urgent.length)h+=sec('Perlu perhatian','Lewat atau dalam 3 hari',`<div class="list">${urgent.map(x=>{const n=daysTo(x.due);return `<button class="lrow" data-go="tugas" data-open="${x.id}"><span class="grow"><span class="t">${esc(x.t)}</span><span class="s">${esc(x.pic||'')}</span></span><span class="chip ${n<0?'bad':'warn'}">${n<0?`Lewat ${-n} hari`:n===0?'Hari ini':`${n} hari lagi`}</span></button>`}).join('')}</div>`);
  const ans=S.decisions.filter(d=>d.status==='Dijawab').slice(0,3),wait=S.decisions.filter(d=>d.status!=='Dijawab').length;
  h+=sec('Presiden',`${wait} keputusan menunggu`,ans.length?`<div class="list">${ans.map(d=>`<button class="lrow" data-go="presiden" data-pseg="keputusan" data-open="${d.id}"><span class="grow"><span class="t">${esc(d.title)}</span><span class="s">${d.pnote?esc(d.pnote):'Jawapan Presiden'}</span></span><span class="chip ok">${esc(d.answer)}</span></button>`).join('')}</div>`:empty('Belum ada jawapan baru daripada Presiden.'));
  h+=sec('Jam bekerja bulan ini',`${BULAN[new Date().getMonth()]} · sasaran ${TARGET_JAM} jam`,`<div class="hours">${STAFF.map(w=>hcard(w,thisMonth())).join('')}</div>`);
  const up=upcoming(6);
  h+=sec('Akan datang','Aktiviti HEAR ME dan jadual Presiden',up.length?`<div class="up">${up.map(e=>`<button class="upc" data-go="${e.kind==='trips'?'presiden':'aktiviti'}" data-open="${e.x.id}"><div class="when"><b>${longDate(e.x.date)}</b><span>${e.kind==='trips'?'Presiden':'HEAR ME'}</span></div><div class="t">${esc(e.name)}</div><div class="s">${esc(e.where||'')}</div><div class="chips">${done(e.x.takwim)?'<span class="chip ok">✓ Dalam Takwim</span>':'<span class="chip warn">Belum masuk Takwim</span>'}</div></button>`).join('')}</div>`:empty('Tiada aktiviti akan datang.'));
  return h;
}
function upcoming(n){
  const d=todayISO();
  return [...(S.acts||[]).filter(a=>a.date>=d).map(x=>({kind:'acts',x,name:x.name,where:x.loc})),...(S.trips||[]).filter(t=>t.date>=d).map(x=>({kind:'trips',x,name:x.purpose,where:x.to}))]
    .sort((a,b)=>(a.x.date+(a.x.time||'')).localeCompare(b.x.date+(b.x.time||''))).slice(0,n);
}
function vTugas(){
  const f={aktif:x=>x.status!=='Selesai',lewat:x=>taskState(x)==='late',selesai:x=>x.status==='Selesai',semua:()=>true}[flt.tasks];
  const list=S.tasks.filter(f).sort((a,b)=>(a.status==='Selesai')-(b.status==='Selesai')||(a.due||'9').localeCompare(b.due||'9'));
  let h=`<div class="toolbar">${seg('tasks',[['aktif','Belum selesai'],['lewat','Lewat'],['selesai','Selesai'],['semua','Semua']],flt.tasks)}<span class="spacer"></span><button class="btn primary" data-add="tasks">+ Tugasan</button></div>`;
  if(!list.length)return h+empty('Tiada tugasan dalam senarai ini. Tekan + Tugasan untuk mula.');
  return h+list.map(x=>{
    const st=taskState(x),n=daysTo(x.due),cls={'Selesai':'ok','Dalam Proses':'info','Tertangguh':'warn'}[x.status]||'';
    const dl=x.status==='Selesai'||n===null?'':n<0?`<span class="chip bad">Lewat ${-n} hari</span>`:n===0?'<span class="chip warn">Hari ini</span>':n<=3?`<span class="chip warn">${n} hari lagi</span>`:`<span class="chip">${n} hari lagi</span>`;
    const op=openId===x.id;
    return `<article class="item ${st} ${op?'open':''}" data-id="${x.id}"><button class="row" data-toggle="${x.id}" aria-expanded="${op}">${dateBlock(x.due)}
      <div class="grow"><div class="t">${esc(x.t||'(Tugasan baru)')}</div>${x.note?`<div class="s">${esc(x.note)}</div>`:''}<div class="chips"><span class="chip ${cls}">${esc(x.status)}</span>${x.pic?`<span class="chip gold">${esc(x.pic)}</span>`:''}${dl}</div></div><div class="right"></div></button>
      ${op?form('tasks',x):''}</article>`}).join('');
}
function vStaf(){
  const list=S.staff.filter(r=>(r.date||'').startsWith(vm)&&(flt.staff==='Semua'||r.who===flt.staff)).sort((a,b)=>(b.date+b.in).localeCompare(a.date+a.in));
  let h=`<div class="toolbar">${monthNav()}<span class="spacer"></span>${CFG.clockUrl?link(CFG.clockUrl,'Buka Sheet clock in ↗'):''}</div>`;
  h+=sec('','',`<div class="hours">${STAFF.map(w=>hcard(w,vm)).join('')}</div>`);
  h+=`<div class="toolbar">${seg('staff',[['Semua','Semua'],...STAFF.map(s=>[s,s])],flt.staff)}<span class="spacer"></span><span class="s">Anas & Uzma clock in sendiri. Rekod di sini dikemas kini automatik.</span></div>`;
  return h+(list.length?`<div class="list">${list.map(staffRow).join('')}</div>`:empty(`Tiada rekod kerja untuk ${monthLabel(vm)}.`));
}
function staffRow(r){
  const hh=hrs(r);
  return `<div class="lrow static"><div class="date sm">${pd(r.date)?`<span class="d">${pd(r.date).getDate()}</span><span class="w">${BLN[pd(r.date).getMonth()]} · ${HARI[pd(r.date).getDay()]}</span>`:''}</div>
    <span class="grow"><span class="t">${esc(r.t||'(Tiada catatan tugasan)')}</span><span class="chips">${flt.staff==='Semua'?`<span class="chip gold">${esc(r.who)}</span>`:''}${r.project?`<span class="chip info">${esc(r.project)}</span>`:''}<span class="chip">${r.in||'--:--'} – ${r.out||'…'}</span>${r.link?link(r.link,'Hasil kerja ↗'):'<span class="chip warn">Tiada hasil kerja</span>'}</span></span>
    <b class="amt">${r.out?fmtH(hh)+' jam':'<span class="live">Sedang bekerja</span>'}</b></div>`;
}
function vAktiviti(){
  const d=todayISO();
  const f={akan:a=>!a.date||a.date>=d,lepas:a=>a.date&&a.date<d,belum:a=>!done(a.takwim),semua:()=>true}[flt.acts];
  const list=S.acts.filter(f).sort((a,b)=>flt.acts==='lepas'?(b.date||'').localeCompare(a.date||''):(a.date||'9').localeCompare(b.date||'9'));
  let h=`<div class="toolbar">${seg('acts',[['akan','Akan datang'],['lepas','Lepas'],['belum','Belum masuk Takwim'],['semua','Semua']],flt.acts)}<span class="spacer"></span><button class="btn primary" data-add="acts">+ Aktiviti</button></div>`;
  h+=list.length?list.map(a=>{const op=openId===a.id;
    return `<article class="item ${op?'open':''}" data-id="${a.id}"><button class="row" data-toggle="${a.id}" aria-expanded="${op}">${dateBlock(a.date)}
      <div class="grow"><div class="t">${esc(a.name||'(Aktiviti baru)')}</div><div class="s">${esc(a.loc||'')}${a.pic?' · '+esc(a.pic):''}</div><div class="chips">${done(a.takwim)?'<span class="chip ok">✓ Dalam Takwim</span>':'<span class="chip warn">Belum masuk Takwim</span>'}${a.img?'<span class="chip info">Ada gambar</span>':''}</div></div><div class="right"></div></button>
      ${op?form('acts',a,{extra:a.img?link(a.img,'Buka gambar')+' ':''}):''}<div class="takwim">${takwimLine('acts',a)}</div></article>`}).join(''):empty('Tiada aktiviti dalam senarai ini.');
  return h+targetBox();
}
function targetBox(){
  const tg=CFG.target||'ujian';
  return `<section class="sec" style="margin-top:22px"><div class="target"><b>Takwim sasaran:</b> ${esc(TNAME[tg])}
    ${seg('target',[['ujian','Salinan ujian'],['sebenar','Master Taqwim sebenar']],tg)}
    ${confirmTarget?`<div class="warnbox">Lepas ni, setiap aktiviti yang dihantar akan masuk terus ke Master Taqwim yang asal, untuk semua pengguna. Teruskan?<br><button class="btn danger sm" data-target-yes="1">Ya, guna Master sebenar</button> <button class="btn sm" data-target-no="1">Batal</button></div>`:''}
    <div class="s" style="margin-top:8px">Aktiviti masuk ke tab tahun yang sama dengan tarikhnya (cth. tab 2026), di baris paling bawah.</div></div></section>`;
}
function takwimLine(kind,a){
  if(done(a.takwim))return `<span class="msg ok">${esc(a.takwim)}</span>`;
  const m=msg[a.id]||(a.takwim?{bad:1,text:a.takwim}:null);
  return `<span class="msg ${m?.bad?'bad':''}">${esc(m?.text||'Belum dihantar ke Takwim')}</span><button class="btn sm primary" data-send="${a.id}" data-kind="${kind}" ${busy[a.id]?'disabled':''}>${busy[a.id]?'Menghantar…':'Hantar ke Takwim'}</button>`;
}
function vPAdmin(){
  let h=`<div class="toolbar">${seg('padmin',[['jadual','Jadual & perjalanan'],['keputusan','Keputusan'],['keluarga','Masa keluarga']],flt.padmin)}</div>`;
  if(flt.padmin==='keputusan'){
    const list=[...S.decisions].sort((a,b)=>(a.status==='Dijawab')-(b.status==='Dijawab'));
    h+=`<div class="toolbar"><span class="s">Soalan yang Presiden perlu jawab. Jawapan Presiden muncul di sini.</span><span class="spacer"></span><button class="btn primary" data-add="decisions">+ Soalan</button></div>`;
    return h+(list.length?list.map(d=>{const op=openId===d.id;return `<article class="item ${op?'open':''}" data-id="${d.id}"><button class="row" data-toggle="${d.id}" aria-expanded="${op}">${dateBlock(d.due)}
      <div class="grow"><div class="t">${esc(d.title||'(Soalan baru)')}</div>${d.detail?`<div class="s">${esc(d.detail)}</div>`:''}<div class="chips">${d.status==='Dijawab'?`<span class="chip ok">Jawapan: ${esc(d.answer)}</span>${d.pnote?`<span class="chip">“${esc(d.pnote)}”</span>`:''}`:'<span class="chip warn">Menunggu Presiden</span>'}</div></div><div class="right"></div></button>
      ${op?form('decisions',d):''}</article>`}).join(''):empty('Tiada soalan untuk Presiden.'));
  }
  if(flt.padmin==='keluarga'){
    const f=CFG.fam||{};
    return h+`<div class="target"><b>Masa keluarga Presiden</b><p class="s">Masa ni ditanda dalam jadual Presiden. Aktiviti yang bertindih ditanda merah.</p>
      <div class="famrow"><label for="fam-from">Dari<input id="fam-from" type="time" value="${esc(f.from||'')}"></label><label for="fam-to">Hingga<input id="fam-to" type="time" value="${esc(f.to||'')}"></label><button class="btn primary" data-savefam="1">Simpan</button></div></div>`;
  }
  const list=S.trips.filter(t=>(t.date||'').startsWith(vm)).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  const tot=list.filter(t=>t.status!=='Dirancang').reduce((s,t)=>s+totalOf(t),0);
  h+=`<div class="toolbar">${monthNav()}<span class="spacer"></span><span class="s">Tuntutan bulan ini: <b>${rm(tot)}</b></span><button class="btn primary" data-add="trips">+ Jadual</button></div>`;
  return h+(list.length?list.map(t=>{const op=openId===t.id,m=t.status!=='Dirancang'?missing(t):[];
    return `<article class="item ${op?'open':''}" data-id="${t.id}"><button class="row" data-toggle="${t.id}" aria-expanded="${op}">${dateBlock(t.date)}
      <div class="grow"><div class="t">${esc(t.purpose||'(Jadual baru)')}</div><div class="s">${t.time?esc(t.time)+' · ':''}${esc(t.to||'')}${t.with?' · dengan '+esc(t.with):''}</div>
      <div class="chips"><span class="chip ${tripChip(t.status)}">${esc(t.status)}</span>${t.car?`<span class="chip">${esc(t.car)}${t.km?' · '+t.km+' km':''}</span>`:''}${m.length?`<span class="chip bad">Kurang: ${m.join(', ')}</span>`:''}${t.receipt?'<span class="chip info">Ada resit</span>':''}</div></div>
      <div class="right"><b>${t.status==='Dirancang'?'—':rm(totalOf(t))}</b></div></button>
      ${op?form('trips',t,{extra:t.to?link(waze(t.to),'Waze')+' ':''}):''}<div class="takwim">${takwimLine('trips',t)}</div></article>`}).join(''):empty('Tiada jadual Presiden untuk bulan ini. Tekan + Jadual untuk tambah.'));
}

/* ================= PRESIDEN ================= */
const famClash=t=>{const f=CFG.fam||{};if(!f.from||!f.to||!t.time)return false;const a=mins(t.time);return a>=mins(f.from)&&a<mins(f.to)};
function claimReady(){return (S.trips||[]).filter(t=>t.status==='Belum dituntut')}
function decisionCard(d){
  const opts=String(d.options||'').split('|').map(s=>s.trim()).filter(Boolean);
  if(d.status==='Dijawab')return `<div class="card dec answered"><div class="t">${esc(d.title)}</div><div class="done-note">✓ Jawapan anda: <b>${esc(d.answer)}</b>${d.pnote?` · “${esc(d.pnote)}”`:''}</div><button class="linkbtn" data-reopen="${d.id}">Ubah jawapan</button></div>`;
  return `<div class="card dec" data-id="${d.id}"><div class="t">${esc(d.title)}</div>${d.detail?`<div class="s">${esc(d.detail)}</div>`:''}
    ${d.due||d.link?`<div class="pills">${d.due?`<span class="pill">Sebelum ${longDate(d.due)}</span>`:''}${d.link?`<a class="pill" href="${esc(d.link)}" target="_blank" rel="noopener">Buka dokumen</a>`:''}</div>`:''}
    <label class="vh" for="pn-${d.id}">Catatan untuk admin</label><input id="pn-${d.id}" type="text" placeholder="Catatan untuk admin (pilihan)" value="${esc(d.pnote||'')}">
    <div class="opts">${(opts.length?opts:['Setuju','Tidak setuju']).map(o=>`<button class="btn ${busy[d.id]?'':'primary'}" data-ans="${d.id}" data-val="${esc(o)}" ${busy[d.id]?'disabled':''}>${esc(o)}</button>`).join('')}</div></div>`;
}
function vHari(){
  const d=todayISO(),todayN=[...S.trips,...S.acts].filter(x=>x.date===d).length;
  const pend=S.decisions.filter(x=>x.status!=='Dijawab'),cl=claimReady().filter(t=>t.date<=d);
  let h=`<div class="stats three"><button class="stat" data-tab="jadual"><b>${todayN}</b><span>Aktiviti hari ini</span></button>
    <button class="stat ${pend.length?'warn':''}" data-tab="keputusan"><b>${pend.length}</b><span>Keputusan menunggu</span></button>
    <button class="stat ${cl.length?'gold':''}" data-tab="ptuntut"><b>${cl.length}</b><span>Tuntutan untuk disahkan</span></button></div>`;
  if(pend.length)h+=sec('Perlu keputusan anda','',pend.map(decisionCard).join(''));
  const next=S.trips.filter(t=>t.date>=d).sort((a,b)=>(a.date+(a.time||'99')).localeCompare(b.date+(b.time||'99')))[0];
  if(next){const pts=String(next.points||'').split('\n').filter(Boolean);
    h+=sec('Seterusnya','',`<div class="card next"><div class="when"><span>${longDate(next.date)}${next.time?' · '+esc(next.time):''}</span>${next.depart?`<b>Bertolak ${esc(next.depart)}</b>`:''}</div>
      <div class="big">${esc(next.purpose)}</div><div class="s">${esc(next.to||'')}${next.with?' · bersama '+esc(next.with):''}</div>
      ${pts.length?`<ul class="points">${pts.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}
      <div class="pills">${next.to?`<a class="pill" href="${waze(next.to)}" target="_blank" rel="noopener">Buka Waze</a>`:''}${next.link?`<a class="pill" href="${esc(next.link)}" target="_blank" rel="noopener">Dokumen</a>`:''}</div></div>`)}
  const fm=CFG.fam||{};h+=sec('Minggu ini',fm.from&&fm.to?`Masa keluarga ${esc(fm.from)}–${esc(fm.to)} dilindungi`:'7 hari akan datang',weekView());
  const my=S.tasks.filter(t=>t.pic==='Presiden'&&t.status!=='Selesai');
  if(my.length)h+=sec('Tugasan saya','',`<div class="list">${my.map(t=>`<label class="task-row" for="tk-${t.id}"><input id="tk-${t.id}" type="checkbox" data-tick="${t.id}"><span class="grow"><span class="t">${esc(t.t)}</span>${t.due?`<span class="s">Sebelum ${longDate(t.due)}</span>`:''}</span></label>`).join('')}</div>`);
  return h;
}
function weekView(){
  let h='<div class="week">';
  for(let i=0;i<7;i++){const dt=new Date();dt.setDate(dt.getDate()+i);const ds=iso(dt);
    const items=[...S.trips.filter(t=>t.date===ds).map(t=>({time:t.time,txt:t.purpose,cls:famClash(t)?'clash':''})),...S.acts.filter(a=>a.date===ds).map(a=>({time:'',txt:'HEAR ME: '+a.name,cls:'org'}))].sort((a,b)=>(a.time||'99').localeCompare(b.time||'99'));
    h+=`<div class="day ${i===0?'today':''}"><div class="dl"><b>${dt.getDate()} ${BLN[dt.getMonth()]}</b>${i===0?'Hari ini':HARI_P[dt.getDay()]}</div><div class="items">${items.length?items.map(x=>`<div class="it ${x.cls}"><small>${esc(x.time||'')}</small><span>${esc(x.txt)}${x.cls==='clash'?' · bertindih masa keluarga':''}</span></div>`).join(''):'<span class="empty-day">Tiada aktiviti</span>'}</div></div>`}
  return h+'</div>';
}
function vJadual(){
  const list=S.trips.filter(t=>(t.date||'').startsWith(vm)).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  return `<div class="toolbar">${monthNav()}</div>`+(list.length?list.map(t=>{const op=openId===t.id,pts=String(t.points||'').split('\n').filter(Boolean);
    return `<article class="item ${op?'open':''} ${t.date<todayISO()?'past':''}"><button class="row" data-toggle="${t.id}" aria-expanded="${op}">${dateBlock(t.date)}
      <div class="grow"><div class="t">${esc(t.purpose)}</div><div class="s">${t.time?esc(t.time)+' · ':''}${esc(t.to||'')}</div>${famClash(t)?'<div class="chips"><span class="chip bad">Bertindih masa keluarga</span></div>':''}</div><div class="right"></div></button>
      ${op?`<div class="detail">${t.depart?`<p><b>Bertolak:</b> ${esc(t.depart)}${t.from?' dari '+esc(t.from):''}</p>`:''}${t.with?`<p><b>Bersama:</b> ${esc(t.with)}</p>`:''}
        ${pts.length?`<ul class="points">${pts.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}
        <div class="pills">${t.to?`<a class="pill" href="${waze(t.to)}" target="_blank" rel="noopener">Waze</a>`:''}${t.link?`<a class="pill" href="${esc(t.link)}" target="_blank" rel="noopener">Dokumen</a>`:''}</div></div>`:''}</article>`}).join(''):empty('Tiada jadual untuk bulan ini.'));
}
function vKeputusan(){
  const pend=S.decisions.filter(d=>d.status!=='Dijawab'),ans=S.decisions.filter(d=>d.status==='Dijawab');
  return sec('Menunggu jawapan anda',`${pend.length}`,pend.length?pend.map(decisionCard).join(''):empty('Tiada keputusan yang menunggu. Admin akan tambah bila perlu.'))
    +(ans.length?sec('Sudah dijawab','',ans.map(decisionCard).join('')):'');
}
function vPTuntut(){
  const list=S.trips.filter(t=>(t.date||'').startsWith(vm)&&t.status!=='Dirancang').sort((a,b)=>a.date.localeCompare(b.date));
  const ready=list.filter(t=>t.status==='Belum dituntut'&&!missing(t).length);
  const tot=list.reduce((s,t)=>s+totalOf(t),0),sah=list.filter(t=>t.status!=='Belum dituntut').reduce((s,t)=>s+totalOf(t),0);
  let h=`<div class="toolbar">${monthNav()}<span class="spacer"></span>${ready.length?`<button class="btn primary" data-sahall="1" ${busy.sahall?'disabled':''}>${busy.sahall?'Mengesahkan…':`Sahkan semua yang lengkap (${ready.length})`}</button>`:''}</div>
    <div class="claimbar"><span>Jumlah ${monthLabel(vm)}: <b>${rm(tot)}</b></span><span class="s">Disahkan: ${rm(sah)}</span></div>`;
  h+=list.length?`<div class="list">${list.map(t=>{const m=missing(t);return `<div class="lrow static"><span class="grow"><span class="t">${pd(t.date).getDate()} ${BLN[pd(t.date).getMonth()]} · ${esc(t.purpose)}</span><span class="s">${esc(t.car||'')}${t.km?' · '+t.km+' km':''} · ${rm(totalOf(t))}${m.length?' · <span class="badtxt">Admin perlu lengkapkan: '+m.join(', ')+'</span>':''}</span></span>
      ${t.status==='Belum dituntut'?`<button class="btn sm primary" data-sah="${t.id}" ${m.length||busy[t.id]?'disabled':''}>Sahkan</button>`:t.status==='Disahkan Presiden'?`<span class="chip info">Disahkan</span><button class="linkbtn" data-unsah="${t.id}">Batal</button>`:`<span class="chip ok">Dibayar</span>`}</div>`}).join('')}</div>`:empty('Tiada tuntutan untuk bulan ini.');
  return h+`<p class="s" style="margin-top:12px">Selepas anda sahkan, tuntutan terus muncul di paparan Finance untuk dibayar.</p>`;
}

/* ================= FINANCE ================= */
function vFRingkas(){
  const m=thisMonth(),inM=S.receipts.filter(r=>(r.date||'').startsWith(m)).reduce((s,r)=>s+num(r.amount),0);
  const outM=S.payments.filter(p=>p.status==='Dibayar'&&(p.date||'').startsWith(m)).reduce((s,p)=>s+num(p.amount),0);
  const claimWait=S.trips.filter(t=>t.status==='Disahkan Presiden'),cw=claimWait.reduce((s,t)=>s+totalOf(t),0);
  const unpaid=S.payments.filter(p=>p.status!=='Dibayar'),over=unpaid.filter(p=>p.dueBy&&p.dueBy<todayISO());
  let h=sec(monthLabel(m),'',`<div class="stats"><button class="stat ok" data-tab="terimaan"><b>${rm(inM)}</b><span>Duit masuk</span></button>
    <button class="stat" data-tab="bayaran"><b>${rm(outM)}</b><span>Duit keluar (dibayar)</span></button>
    <button class="stat ${claimWait.length?'gold':''}" data-tab="ftuntut"><b>${rm(cw)}</b><span>Tuntutan menunggu bayaran</span></button>
    <button class="stat ${over.length?'bad':''}" data-tab="bayaran"><b>${unpaid.length}</b><span>Bayaran belum dibuat${over.length?` (${over.length} lewat)`:''}</span></button></div>`);
  const due=unpaid.sort((a,b)=>(a.dueBy||'9').localeCompare(b.dueBy||'9')).slice(0,6);
  if(due.length)h+=sec('Perlu dibayar','',`<div class="list">${due.map(p=>{const n=daysTo(p.dueBy);return `<button class="lrow" data-go="bayaran" data-open="${p.id}"><span class="grow"><span class="t">${esc(p.what||'(Tanpa perkara)')}</span><span class="s">${esc(p.to||'')} · ${rm(p.amount)}</span></span>${n===null?'':`<span class="chip ${n<0?'bad':n<=3?'warn':''}">${n<0?`Lewat ${-n} hari`:n===0?'Hari ini':`${n} hari lagi`}</span>`}</button>`}).join('')}</div>`);
  const y=String(new Date().getFullYear()),P={};
  S.receipts.filter(r=>(r.date||'').startsWith(y)).forEach(r=>{const k=r.program||'Umum';(P[k]=P[k]||{i:0,o:0}).i+=num(r.amount)});
  S.payments.filter(p=>p.status==='Dibayar'&&(p.date||'').startsWith(y)).forEach(p=>{const k=p.program||'Umum';(P[k]=P[k]||{i:0,o:0}).o+=num(p.amount)});
  const ks=Object.keys(P).sort();
  h+=sec('Ikut program',`Tahun ${y}`,ks.length?`<div class="tablewrap"><table class="tbl"><thead><tr><th>Program</th><th class="n">Masuk</th><th class="n">Keluar</th><th class="n">Baki</th></tr></thead><tbody>${ks.map(k=>`<tr><td>${esc(k)}</td><td class="n">${rm(P[k].i)}</td><td class="n">${rm(P[k].o)}</td><td class="n ${P[k].i-P[k].o<0?'badtxt':''}">${rm(P[k].i-P[k].o)}</td></tr>`).join('')}</tbody></table></div>`:empty('Isi nama Program pada terimaan dan bayaran untuk nampak baki setiap program.'));
  return h;
}
function vFTuntut(){
  const list=S.trips.filter(t=>(t.date||'').startsWith(vm)&&t.status!=='Dirancang').sort((a,b)=>a.date.localeCompare(b.date));
  const sah=list.filter(t=>t.status==='Disahkan Presiden'),paid=list.filter(t=>t.status==='Dibayar'),wait=list.filter(t=>t.status==='Belum dituntut');
  const claimUrl=(CFG.claims||{})[vm];
  let h=`<div class="toolbar">${monthNav()}<span class="spacer"></span><button class="btn navy" data-claimdoc="1" ${busy.claim?'disabled':''}>${busy.claim?'Menjana…':'Jana borang tuntutan'}</button></div>`;
  if(msg.claim)h+=`<div class="notice ${msg.claim.bad?'':'info'}">${msg.claim.html||esc(msg.claim.text)}</div>`;
  else if(claimUrl)h+=`<div class="notice info">Borang ${monthLabel(vm)} terakhir: ${link(claimUrl,'Buka Google Sheet')}</div>`;
  h+=`<div class="claimbar"><span>Perlu dibayar: <b>${rm(sah.reduce((s,t)=>s+totalOf(t),0))}</b></span><span class="s">Dibayar: ${rm(paid.reduce((s,t)=>s+totalOf(t),0))}</span>${sah.length?`<button class="btn sm primary" data-payall="1" ${busy.payall?'disabled':''}>Tanda semua dibayar</button>`:''}</div>`;
  const row=t=>`<div class="lrow static"><span class="grow"><span class="t">${pd(t.date).getDate()} ${BLN[pd(t.date).getMonth()]} · ${esc(t.purpose)}</span><span class="s">${esc(t.car||'')}${t.km?' · '+t.km+' km':''} · minyak ${rm(fuelOf(t))}${num(t.toll)?' · tol '+rm(t.toll):''}${num(t.park)?' · parking '+rm(t.park):''}${t.receipt?' · '+link(t.receipt,'resit'):''}</span></span><b class="amt">${rm(totalOf(t))}</b>
    ${t.status==='Disahkan Presiden'?`<button class="btn sm primary" data-pay="${t.id}" ${busy[t.id]?'disabled':''}>Dibayar</button>`:t.status==='Dibayar'?`<span class="chip ok">Dibayar</span><button class="linkbtn" data-unpay="${t.id}">Batal</button>`:`<span class="chip warn">Menunggu Presiden</span>`}</div>`;
  h+=sah.length?sec('Disahkan Presiden','Sedia untuk dibayar',`<div class="list">${sah.map(row).join('')}</div>`):'';
  h+=wait.length?sec('Menunggu pengesahan Presiden','',`<div class="list muted-list">${wait.map(row).join('')}</div>`):'';
  h+=paid.length?sec('Sudah dibayar','',`<div class="list">${paid.map(row).join('')}</div>`):'';
  if(!list.length)h+=empty('Tiada tuntutan perjalanan untuk bulan ini.');
  return h;
}
function vTerimaan(){
  const y=String(new Date().getFullYear()),list=[...S.receipts].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const tY=S.receipts.filter(r=>(r.date||'').startsWith(y)).reduce((s,r)=>s+num(r.amount),0);
  let h=`<div class="toolbar"><span class="s">Jumlah ${y}: <b>${rm(tY)}</b></span><span class="spacer"></span><button class="btn primary" data-add="receipts">+ Terimaan</button></div>`;
  return h+(list.length?list.map(r=>{const op=openId===r.id;return `<article class="item ${op?'open':''}" data-id="${r.id}"><button class="row" data-toggle="${r.id}" aria-expanded="${op}">${dateBlock(r.date)}
    <div class="grow"><div class="t">${esc(r.from||'(Penderma / penaja)')}</div><div class="chips"><span class="chip gold">${esc(r.type)}</span>${r.program?`<span class="chip">${esc(r.program)}</span>`:''}${r.no?`<span class="chip">Resit ${esc(r.no)}</span>`:'<span class="chip warn">Tiada no. resit</span>'}</div></div><div class="right"><b>${rm(r.amount)}</b></div></button>
    ${op?form('receipts',r):''}</article>`}).join(''):empty('Belum ada terimaan direkod. Tekan + Terimaan untuk mula.'));
}
function vBayaran(){
  const rate=num(store.get('hm-rate'));
  let h=sec('Bayaran jam staf',monthLabel(thisMonth()),`<div class="target"><div class="famrow"><label for="rate">Kadar sejam (RM)<input id="rate" inputmode="decimal" value="${rate||''}" placeholder="cth. 10"></label>
    ${STAFF.map(w=>{const hh=monthHours(w,thisMonth());return `<div class="paystaf"><b>${w}</b><span class="s">${fmtH(hh)} jam${rate?' · '+rm(hh*rate):''}</span><button class="btn sm" data-paystaf="${w}" ${!rate||!hh?'disabled':''}>Cipta bayaran</button></div>`}).join('')}</div>
    <p class="s">Jam diambil terus daripada clock in/out Anas & Uzma.</p></div>`);
  const f={belum:p=>p.status!=='Dibayar',dibayar:p=>p.status==='Dibayar',semua:()=>true}[flt.pay];
  const list=S.payments.filter(f).sort((a,b)=>flt.pay==='belum'?(a.dueBy||'9').localeCompare(b.dueBy||'9'):(b.date||'').localeCompare(a.date||''));
  h+=`<div class="toolbar">${seg('pay',[['belum','Belum dibayar'],['dibayar','Dibayar'],['semua','Semua']],flt.pay)}<span class="spacer"></span><button class="btn primary" data-add="payments">+ Bayaran</button></div>`;
  return h+(list.length?list.map(p=>{const op=openId===p.id,n=daysTo(p.dueBy),late=p.status!=='Dibayar'&&n!==null&&n<0;
    return `<article class="item ${op?'open':''} ${late?'late':''}" data-id="${p.id}"><button class="row" data-toggle="${p.id}" aria-expanded="${op}">${dateBlock(p.status==='Dibayar'?p.date:(p.dueBy||p.date))}
    <div class="grow"><div class="t">${esc(p.what||'(Perkara)')}</div><div class="s">${esc(p.to||'')}</div><div class="chips"><span class="chip ${p.status==='Dibayar'?'ok':'warn'}">${esc(p.status)}</span><span class="chip gold">${esc(p.type)}</span>${p.program?`<span class="chip">${esc(p.program)}</span>`:''}${late?`<span class="chip bad">Lewat ${-n} hari</span>`:''}${p.receipt?'<span class="chip info">Ada resit</span>':''}</div></div><div class="right"><b>${rm(p.amount)}</b></div></button>
    ${op?form('payments',p):''}</article>`}).join(''):empty('Tiada bayaran dalam senarai ini.'));
}

/* ================= Tindakan ================= */
async function sendTakwim(kind,id){
  const a=S[kind].find(x=>x.id===id);if(!a||done(a.takwim)||busy[id])return;
  await flush(id,kind);
  busy[id]=1;msg[id]={text:'Menghantar…'};render();
  try{const j=await call({a:'takwim',kind,id});Object.assign(a,j.item);delete msg[id]}
  catch(e){msg[id]={bad:1,text:e.message&&e.message!=='Failed to fetch'?e.message:'Tak pasti berjaya (masalah internet). Muat semula dan semak Takwim sebelum cuba lagi.'}}
  busy[id]=0;render();
}
async function setStatus(kind,ids,status,busyKey){
  if(busyKey)busy[busyKey]=1;ids.forEach(i=>busy[i]=1);render();
  for(const id of ids){const x=S[kind].find(r=>r.id===id);if(!x)continue;const old=x.status;x.status=status;if(!await doSave(kind,x))x.status=old}
  if(busyKey)busy[busyKey]=0;ids.forEach(i=>busy[i]=0);render();
}
async function answer(id,val){
  const d=S.decisions.find(x=>x.id===id);if(!d)return;
  const note=$('#pn-'+id)?.value||'';const old={...d};
  Object.assign(d,{answer:val,pnote:note,status:'Dijawab'});busy[id]=1;render();
  if(!await doSave('decisions',d))Object.assign(d,old);
  busy[id]=0;render();
}
async function claimDoc(){
  busy.claim=1;msg.claim=null;render();
  try{const j=await call({a:'claimdoc',month:vm});(CFG.claims=CFG.claims||{})[vm]=j.url;
    msg.claim={html:`Borang siap: ${j.count} perjalanan, jumlah <b>${rm(j.total)}</b>. ${link(j.url,'Buka Google Sheet')}${j.pending?` · ${j.pending} perjalanan belum disahkan Presiden dan tidak dimasukkan.`:''}`}}
  catch(e){msg.claim={bad:1,text:e.message||'Gagal jana borang.'}}
  busy.claim=0;render();
}
async function uploadFile(input){
  const file=input.files&&input.files[0];if(!file)return;
  const item=input.closest('[data-id]'),kind=input.closest('.form').dataset.kind,x=S[kind].find(r=>r.id===item.dataset.id),f=input.dataset.upload;
  busy['up'+x.id]=1;render();
  try{
    const {data,type,name}=await toBase64(file);
    await flush(x.id,kind); if(!x.row)await doSave(kind,x);
    const j=await call({a:'upload',name,type,data});x[f]=j.url;await doSave(kind,x);
  }catch(e){setSave('Gagal muat naik: '+(e.message||''))}
  busy['up'+x.id]=0;render();
}
function toBase64(file){
  return new Promise((res,rej)=>{
    const done=(blob,type,name)=>{const r=new FileReader();r.onload=()=>res({data:String(r.result).split(',')[1],type,name});r.onerror=rej;r.readAsDataURL(blob)};
    if(!file.type.startsWith('image/')||file.type==='image/gif'){if(file.size>15e6)return rej(new Error('Fail terlalu besar (maks 15MB)'));return done(file,file.type,file.name)}
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{const k=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(b=>b?done(b,'image/jpeg',file.name.replace(/\.\w+$/,'')+'.jpg'):rej(new Error('Gagal proses gambar')),'image/jpeg',.82)};
    img.onerror=()=>{URL.revokeObjectURL(url);done(file,file.type,file.name)};img.src=url;
  });
}

document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.tab){tab=d.tab;openId=null;store.set('hm-tab-'+ME.role,tab);render();scrollTo(0,0);return}
  if(d.go){tab=d.go;if(d.f)flt.tasks=d.f;if(d.pseg)flt.padmin=d.pseg;if(d.open){openId=d.open;if(tab==='tugas')flt.tasks='semua';if(tab==='aktiviti')flt.acts='semua';if(tab==='bayaran')flt.pay='semua';
      const t=(S.trips||[]).find(x=>x.id===d.open);if(t&&tab==='presiden'){flt.padmin='jadual';vm=t.date.slice(0,7)}}
    render();const el=d.open&&document.querySelector(`[data-id="${d.open}"]`);el?el.scrollIntoView({block:'center'}):scrollTo(0,0);return}
  if(d.toggle){openId=openId===d.toggle?null:d.toggle;confirmDel=null;render();return}
  if(d.seg){if(d.seg==='target'){if(d.val==='sebenar'&&CFG.target!=='sebenar'){confirmTarget=true;render()}else if(d.val==='ujian')setTarget('ujian');return}flt[d.seg]=d.val;openId=null;render();return}
  if(d.month){vm=shiftMonth(vm,+d.month);openId=null;msg.claim=null;render();return}
  if(d.askdel){confirmDel=d.askdel;render();return}
  if(d.del){const kind=d.del,id=d.delid;clearTimeout(timers[id]);delete timers[id];S[kind]=S[kind].filter(x=>x.id!==id);confirmDel=null;openId=null;render();
    setSave('Memadam…');try{await call({a:'del',kind,id});setSave('Dipadam')}catch(err){setSave('Gagal padam. Muat semula.')}return}
  if(d.add){const x=newItem(d.add);if(d.add==='tasks')flt.tasks='semua';if(d.add==='acts')flt.acts='semua';if(d.add==='payments')flt.pay='semua';if(d.add==='trips')vm=x.date.slice(0,7);render();document.querySelector(`[data-id="${x.id}"] .form input:not([type=date]):not([type=file])`)?.focus();return}
  if(d.send){sendTakwim(d.kind,d.send);return}
  if(d.targetYes){setTarget('sebenar');return} if(d.targetNo){confirmTarget=false;render();return}
  if(d.savefam){busy.fam=1;try{const j=await call({a:'fam',from:$('#fam-from').value,to:$('#fam-to').value});CFG=j.cfg;setSave('Masa keluarga disimpan')}catch(err){setSave('Gagal simpan')}busy.fam=0;render();return}
  if(d.ans){answer(d.ans,d.val);return}
  if(d.reopen){const x=S.decisions.find(r=>r.id===d.reopen);if(x){x.status='Menunggu';render()}return}
  if(d.sah){setStatus('trips',[d.sah],'Disahkan Presiden');return}
  if(d.unsah){setStatus('trips',[d.unsah],'Belum dituntut');return}
  if(d.sahall){setStatus('trips',S.trips.filter(t=>t.date.startsWith(vm)&&t.status==='Belum dituntut'&&!missing(t).length).map(t=>t.id),'Disahkan Presiden','sahall');return}
  if(d.pay){setStatus('trips',[d.pay],'Dibayar');return}
  if(d.unpay){setStatus('trips',[d.unpay],'Disahkan Presiden');return}
  if(d.payall){setStatus('trips',S.trips.filter(t=>t.date.startsWith(vm)&&t.status==='Disahkan Presiden').map(t=>t.id),'Dibayar','payall');return}
  if(d.claimdoc){claimDoc();return}
  if(d.paystaf){const w=d.paystaf,rate=num(store.get('hm-rate')),hh=Math.round(monthHours(w,thisMonth())*100)/100;const x=newItem('payments');
    Object.assign(x,{to:w,type:'Staf',what:`Bayaran jam kerja ${monthLabel(thisMonth())} (${fmtH(hh)} jam × ${rm(rate)})`,amount:Math.round(hh*rate*100)/100});flt.pay='semua';doSave('payments',x);render();return}
  if(d.reload){load(true);return}
  if(d.role){pin=ROLE_PINS[d.role];store.set('hm-pin',pin);bootErr='';ME=null;load();return}
  if(d.logout){store.del('hm-pin');pin='';S=null;ME=null;phase='setup';bootErr='';render();return}
});
async function setTarget(t){confirmTarget=false;const old=CFG.target;CFG.target=t;render();try{const j=await call({a:'target',target:t});CFG=j.cfg;setSave('Sasaran ditukar')}catch(e){CFG.target=old;setSave('Gagal tukar sasaran')}render()}
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='rate'){store.set('hm-rate',el.value);render();return}
  if(el.dataset.upload){uploadFile(el);return}
  if(el.dataset.tick){const t=S.tasks.find(x=>x.id===el.dataset.tick);if(t){t.status='Selesai';doSave('tasks',t);render()}return}
  const f=el.dataset.f,form=el.closest('.form'),item=el.closest('[data-id]');if(!f||!form||!item)return;
  const kind=form.dataset.kind,x=S[kind].find(r=>r.id===item.dataset.id);if(!x)return;
  x[f]=f==='prog'?+el.value:el.value;queueSave(kind,x);
  if(f==='date'&&kind==='trips')vm=x.date.slice(0,7)||vm;
  const id=el.id;render();const n=id&&document.getElementById(id);if(n)n.focus();
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='setup')return;e.preventDefault();
  if(!API_URL){api=$('#s-api').value.trim();store.set('hm-api',api)}
  pin=$('#s-pin').value.trim();store.set('hm-pin',pin);bootErr='';ME=null;load();
});
const idle=()=>phase==='ready'&&!document.querySelector('.form')&&!pendingSaves&&!Object.keys(timers).length&&!Object.values(busy).some(Boolean)&&!(document.activeElement&&/INPUT|TEXTAREA/.test(document.activeElement.tagName));
setInterval(()=>{if(idle()&&Date.now()-lastLoad>55000)load(true)},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&idle()&&Date.now()-lastLoad>20000)load(true)});

if(api&&pin)load();else{phase='setup';render()}
