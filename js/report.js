  // ====== ค่าคงที่ ======
  var SHEET_URL='https://script.google.com/macros/s/AKfycbwz6CcXA6m9zxEECOpM8_5TB5e6vn1wnAwkwpZhhZ87jGFxm01SnywzpyjcveIow4ZO/exec';
  var THRESHOLD=70, MIN_DOC_ROWS=10;
  var THAI_MONTHS=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var NAME_MAX_FS=18.6667, NAME_MIN_FS=8;
  // ชื่อหัวคอลัมในชีต (ต้องตรงกับ Code.gs)
  var COL={ ts:'timestamp', date:'วันที่กรอก', tPrefix:'คำนำหน้าครู', tName:'ชื่อครู', group:'กลุ่มสาระ',
    code:'รหัสวิชา', subject:'ชื่อรายวิชา', credits:'หน่วยกิต', hours:'ชั่วโมง/สัปดาห์', sem:'ภาคเรียน', year:'ปีการศึกษา',
    order:'ลำดับที่', seat:'เลขที่', sPrefix:'คำนำหน้านักเรียน', sName:'ชื่อ-สกุล', cls:'ชั้น/ห้อง',
    periods:'คาบทั้งหมด', present:'มาเรียน', absent:'ขาดเรียน', percent:'% การเข้าเรียน', remark:'หมายเหตุ' };

  var allRows=[];
  var currentPass='', pollTimer=null, polling=false, seenTs={};

  // หน่วงการเรียกฟังก์ชัน — รอหยุดพิมพ์ครบ ms มิลลิวินาทีค่อยทำงาน (กันสร้างตารางใหม่ทุกตัวอักษรตอนค้นหา = ลื่นขึ้นเมื่อข้อมูลเยอะ)
  function debounce(fn, ms){ var t; return function(){ var args=arguments, ctx=this; clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx, args); }, ms||200); }; }

  // ====== Toast เด้งเตือน (มุมขวาล่าง) ======
  function showToast(msg){
    var t=document.getElementById('rtToast'); if(!t) return;
    t.textContent=msg; t.className='rt-toast show';
    clearTimeout(showToast._tm); showToast._tm=setTimeout(function(){ t.className='rt-toast'; }, 6000);
  }

  // ====== เรียลไทม์ (polling) — เช็ครายงานใหม่อัตโนมัติทุก ~45 วินาที ======
  // Google Sheet ไม่มี push สด → ใช้วิธีดึงซ้ำเป็นระยะ แล้วเทียบ timestamp ว่ามีใบใหม่ไหม
  function snapshotSeen(){ seenTs={}; allRows.forEach(function(r){ var t=String(r[COL.ts]||''); if(t) seenTs[t]=1; }); }
  function startRealtime(){ snapshotSeen(); if(pollTimer) clearInterval(pollTimer); pollTimer=setInterval(pollNew, 45000); }
  function pollNew(){
    if(polling || document.hidden || !currentPass) return;   // แท็บไม่ได้เปิดอยู่ = ข้าม (ประหยัด quota)
    polling=true;
    jsonp({ key:currentPass }, function(data){
      polling=false;
      if(!data || data.result!=='OK' || !data.rows) return;
      var rows=data.rows, newTs={}, cnt=0;
      rows.forEach(function(r){ var t=String(r[COL.ts]||''); if(t && !seenTs[t] && !newTs[t]){ newTs[t]=1; cnt++; } });
      if(cnt>0){
        allRows=rows;
        rows.forEach(function(r){ var t=String(r[COL.ts]||''); if(t) seenTs[t]=1; });
        render();   // สร้างตาราง/กราฟ/KPI ใหม่ทันที (คงตัวกรอง+การเรียงที่ผู้ใช้เลือกอยู่)
        showToast('🔔 มีรายงานใหม่เข้ามา '+cnt+' ใบ — อัปเดตตารางให้แล้ว');
      }
    });
  }

  // ====== JSONP (เลี่ยง CORS) ======
  var jsonpId=0;
  function jsonp(params, cb){
    jsonpId++;
    var name='__cb'+jsonpId+'_'+(new Date().getTime());
    var s=document.createElement('script');
    var done=false, timer=null;
    window[name]=function(data){ done=true; cleanup(); cb(data); };
    function cleanup(){ if(timer) clearTimeout(timer); try{ delete window[name]; }catch(e){ window[name]=undefined; } if(s.parentNode) s.parentNode.removeChild(s); }
    var q=[]; for(var k in params){ q.push(encodeURIComponent(k)+'='+encodeURIComponent(params[k])); }
    q.push('callback='+name);
    s.src=SHEET_URL+'?'+q.join('&');
    s.onerror=function(){ if(!done){ cleanup(); cb({error:'network'}); } };
    document.body.appendChild(s);
    timer=setTimeout(function(){ if(!done){ cleanup(); cb({error:'timeout'}); } }, 20000);
  }

  // ====== Password gate ======
  var gate=document.getElementById('gate'), main=document.getElementById('main');
  function tryLogin(pass, onFail){
    jsonp({ key:pass }, function(data){
      if(data && data.result==='OK'){
        allRows=data.rows||[];
        currentPass=pass;   // เก็บใน memory (หายเมื่อปิด/รีเฟรชหน้า) เพื่อใช้เช็ครายงานใหม่อัตโนมัติ
        gate.classList.add('hidden'); main.classList.remove('hidden');
        initApp();
      } else if(data && data.error==='unauthorized'){
        onFail('รหัสผ่านไม่ถูกต้อง');
      } else {
        onFail('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    });
  }
  document.getElementById('gateBtn').addEventListener('click', function(){
    var p=document.getElementById('gatePass').value.trim();
    var err=document.getElementById('gateErr');
    if(!p){ err.textContent='กรุณากรอกรหัสผ่าน'; return; }
    err.textContent='กำลังตรวจสอบ...';
    this.disabled=true;
    var btn=this;
    tryLogin(p, function(msg){ err.textContent=msg; btn.disabled=false; });
  });
  document.getElementById('gatePass').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('gateBtn').click(); });
  // ปุ่มแสดง/ซ่อนรหัสผ่าน
  document.getElementById('passToggle').addEventListener('click', function(){
    var inp=document.getElementById('gatePass');
    if(inp.type==='password'){ inp.type='text'; this.textContent='ซ่อน'; } else { inp.type='password'; this.textContent='แสดง'; }
    inp.focus();
  });
  document.getElementById('outBtn').addEventListener('click', function(){
    location.reload(); // กลับไปหน้ารหัสผ่าน (ระบบไม่ได้เก็บรหัสไว้ จึงไม่ต้องล้างอะไร)
  });

  // ไม่จำรหัส — เปิดหน้านี้ต้องกรอกรหัสผ่านใหม่ทุกครั้ง (ปลอดภัยสุด)

  // ====== App ======
  function uniq(arr){ var s={},o=[]; arr.forEach(function(v){ if(v!=='' && v!=null && !s[v]){ s[v]=1; o.push(v); } }); return o; }
  function parseClass(c){ c=String(c||'').trim(); var t=c.replace('ม.',''); var p=t.split('/'); return { level:(p[0]||'').trim(), room:(p[1]||'').trim() }; }
  function num(v){ var n=parseFloat(v); return isNaN(n)?null:n; }

  function initApp(){
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('dash').classList.remove('hidden');
    buildFilterOptions();
    document.getElementById('fSearch').addEventListener('input', debounce(render, 200)); // ช่องค้นหา = หน่วง 0.2 วิ หลังหยุดพิมพ์ค่อยสร้างตาราง
    ['fRoom','fPrefix','fTeacher','fSubject','fTerm','fRemark','fFrom','fTo'].forEach(function(id){
      document.getElementById(id).addEventListener('change', render); // เมนูเลือก/วันที่ = เลือกครั้งเดียว (กัน render ซ้ำ 2 รอบ)
    });
    // เลือกระดับชั้น → อัปเดตรายการห้องตามชั้นนั้น
    document.getElementById('fGrade').addEventListener('change', function(){ updateRoomOptions(); render(); });
    document.getElementById('clearBtn').addEventListener('click', function(){
      document.getElementById('fSearch').value='';
      ['fGrade','fPrefix','fSubject','fTeacher','fTerm','fRemark','fFrom','fTo'].forEach(function(id){ document.getElementById(id).value=''; });
      sortState={ pins:[], active:{key:'date',dir:-1} };  // ล้างการตรึง + เรียงกลับค่าเริ่มต้น
      updateRoomOptions(); // รีเซ็ตห้อง (ปิดไว้)
      updateArrows(); render();
    });
    document.getElementById('csvFilteredBtn').addEventListener('click', function(){ exportCSV('filtered'); });
    document.getElementById('csvAllBtn').addEventListener('click', function(){ exportCSV('all'); });
    document.getElementById('headRow').addEventListener('click', function(e){
      var th=e.target.closest('th.sortable'); if(!th) return;
      var k=th.getAttribute('data-key'), col=COLSORT[k];
      if(e.target.closest('.spin')){ onPinClick(sortState, k, col); } else { onSortClick(sortState, k, col); }
      updateArrows(); render();
    });
    render();
    startRealtime();   // เริ่มเช็ครายงานใหม่อัตโนมัติทุก ~45 วินาที
  }

  function buildFilterOptions(){
    var grades=uniq(allRows.map(function(r){ return parseClass(r[COL.cls]).level; })).sort();
    var teachers=uniq(allRows.map(function(r){ return ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); })).sort();
    var subjects=uniq(allRows.map(function(r){ return r[COL.subject]; })).sort();
    var terms=uniq(allRows.map(function(r){ return termKey(r); })).sort();
    // หมายเหตุมี 2 กลุ่ม: "ขาดเรียนนาน" กับ "อื่นๆ" (ที่เหลือ — ว่าง/ระบุเหตุอื่น)
    var hasLong=allRows.some(function(r){ return r[COL.remark]==='ขาดเรียนนาน'; });
    var hasOther=allRows.some(function(r){ return r[COL.remark]!=='ขาดเรียนนาน'; });
    var remarkOpts=[];
    if(hasLong) remarkOpts.push({v:'ขาดเรียนนาน', t:'ขาดเรียนนาน'});
    if(hasOther) remarkOpts.push({v:'__other__', t:'อื่นๆ'});
    var prefixes=uniq(allRows.map(function(r){ return r[COL.sPrefix]; }).filter(Boolean)).sort();
    fill('fGrade','ทุกระดับชั้น', grades.map(function(g){ return {v:g, t:'ม.'+g}; }));
    fill('fPrefix','ทุกคำนำหน้า', prefixes.map(function(p){ return {v:p, t:p}; }));
    fill('fTeacher','ครูทุกคน', teachers.map(function(t){ return {v:t, t:t}; }));
    fill('fSubject','ทุกรายวิชา', subjects.map(function(s){ return {v:s, t:s}; }));
    fill('fTerm','ทุกภาคเรียน', terms.map(function(t){ return {v:t, t:t}; }));
    fill('fRemark','ทุกหมายเหตุ', remarkOpts);
    updateRoomOptions(); // ห้อง: ปิดไว้จนกว่าจะเลือกระดับชั้น
  }

  // ห้องขึ้นกับระดับชั้น — เลือกชั้นก่อนถึงเลือกห้องได้ (กันสับสน 5/6 กับ 6/6)
  function updateRoomOptions(){
    var g=document.getElementById('fGrade').value;
    var fRoom=document.getElementById('fRoom');
    if(!g){ fRoom.innerHTML='<option value="">เลือกระดับชั้นก่อน</option>'; fRoom.disabled=true; return; }
    var rooms=uniq(allRows.filter(function(r){ return parseClass(r[COL.cls]).level===g; })
      .map(function(r){ return parseClass(r[COL.cls]).room; })).sort(function(a,b){ return (+a)-(+b); });
    fill('fRoom','ทุกห้องใน ม.'+g, rooms.map(function(rm){ return {v:rm, t:'ม.'+g+'/'+rm}; }));
    fRoom.disabled=false;
  }
  function termKey(r){ var s=r[COL.sem], y=r[COL.year]; if(!s&&!y) return ''; return 'ภาคเรียน '+(s||'-')+' ปีการศึกษา '+(y||'-'); }
  function fill(id, allLabel, opts){
    var sel=document.getElementById(id);
    var h='<option value="">'+allLabel+'</option>';
    opts.forEach(function(o){ if(o.v!=='' && o.v!=null) h+='<option value="'+esc(o.v).replace(/"/g,'&quot;')+'">'+esc(o.t)+'</option>'; }); // esc กันโค้ดอันตราย (XSS) จากข้อความในชีต
    sel.innerHTML=h;
  }

  function applyFilters(){
    var q=document.getElementById('fSearch').value.trim().toLowerCase();
    var g=document.getElementById('fGrade').value;
    var rm=document.getElementById('fRoom').value;
    var pf=document.getElementById('fPrefix').value;
    var tc=document.getElementById('fTeacher').value;
    var sub=document.getElementById('fSubject').value;
    var tm=document.getElementById('fTerm').value;
    var rk=document.getElementById('fRemark').value;
    var from=document.getElementById('fFrom').value, to=document.getElementById('fTo').value;
    var tsDate=function(ts){ var d=new Date(String(ts)); if(isNaN(d.getTime())) return ''; var t=new Date(d.getTime()+7*3600*1000); return t.toISOString().slice(0,10); };
    return allRows.filter(function(r){
      var pc=parseClass(r[COL.cls]);
      if(g && pc.level!==g) return false;
      if(rm && pc.room!==rm) return false;
      if(pf && (r[COL.sPrefix]||'')!==pf) return false;
      if(tc && ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim()!==tc) return false;
      if(sub && r[COL.subject]!==sub) return false;
      if(tm && termKey(r)!==tm) return false;
      if(rk){ if(rk==='__other__'){ if(r[COL.remark]==='ขาดเรียนนาน') return false; } else if(r[COL.remark]!==rk) return false; }
      if(from||to){ var d=tsDate(r[COL.ts]); if(from && d<from) return false; if(to && d>to) return false; }
      if(q){
        var hay=[r[COL.sName],(r[COL.tPrefix]||'')+r[COL.tName],r[COL.subject],r[COL.code],r[COL.cls],r[COL.seat],r[COL.group]].join(' ').toLowerCase();
        if(hay.indexOf(q)<0) return false;
      }
      return true;
    });
  }

  // ===== เรียงลำดับตามคอลัม =====
  var COLSORT={
    date:{ get:function(r){return r[COL.date]||r[COL.ts];}, type:'date' },
    teacher:{ get:function(r){return (r[COL.tPrefix]||'')+r[COL.tName];}, type:'str' },
    subject:{ get:function(r){return r[COL.subject];}, type:'str' },
    seat:{ get:function(r){return r[COL.seat];}, type:'num' },
    prefix:{ get:function(r){return r[COL.sPrefix];}, type:'str' },
    name:{ get:function(r){return r[COL.sName];}, type:'str', alpha:true },  // ชื่อล้วน + เรียงตามตัวอักษร (ไม่ใช่ค่าเลข)
    cls:{ get:function(r){return r[COL.cls];}, type:'str' },
    periods:{ get:function(r){return r[COL.periods];}, type:'num' },
    present:{ get:function(r){return r[COL.present];}, type:'num' },
    absent:{ get:function(r){return r[COL.absent];}, type:'num' },
    percent:{ get:function(r){return r[COL.percent];}, type:'num' },
    remark:{ get:function(r){return r[COL.remark];}, type:'str' }
  };
  var sortState={ pins:[], active:{key:'date',dir:-1} }; // เริ่มเรียงวันที่ใหม่→เก่า (ครูส่งทุก ~5 สัปดาห์)
  function applySort(rows){
    return applyMultiSort(rows, function(k){ return COLSORT[k]; }, sortState);
  }
  function updateArrows(){
    var chain=sortChain(sortState), dirOf={}, pinIdx={};
    chain.forEach(function(c){ dirOf[c.key]=c.dir; });
    (sortState.pins||[]).forEach(function(p,i){ pinIdx[p.key]=i+1; });
    var ths=document.querySelectorAll('#headRow th.sortable');
    for(var i=0;i<ths.length;i++){
      var key=ths[i].getAttribute('data-key'), hasDir=(key in dirOf);
      var a=ths[i].querySelector('.arr');
      a.textContent=hasDir?(dirOf[key]>0?'▲':'▼'):'⇅';
      a.className='arr'+(hasDir?' on':'');
      var pin=ths[i].querySelector('.spin');
      if(pin){ var pinned=(key in pinIdx); pin.innerHTML='📌'+(pinned?'<sup class="pinno">'+pinIdx[key]+'</sup>':''); pin.className='spin'+(pinned?' on':''); ths[i].classList.toggle('pinned', pinned); }
    }
  }

  // หัวตาราง sticky ต้องเว้นใต้แถบกรอง (ที่ sticky top:8) → ตั้ง --fh = ความสูงแถบกรอง + ระยะเผื่อ
  function syncStickyHead(){
    var f=document.querySelector('.filters');
    if(f) document.documentElement.style.setProperty('--fh', (f.offsetHeight + 12)+'px');
  }
  function render(){
    var rows=applySort(applyFilters());
    renderKPI(rows); renderChart(rows); renderSubjectChart(rows); renderPercentChart(rows); renderRisk(rows); renderTable(rows);
    updateArrows();
    document.getElementById('cntShown').textContent=rows.length;
    document.getElementById('cntAll').textContent=allRows.length;
    syncStickyHead();
  }
  window.addEventListener('resize', syncStickyHead);

  // ป้ายลอยตามเมาส์สำหรับกราฟแท่ง (แม่นยำตามตำแหน่งเมาส์ ไม่ใช่กลางแถว)
  (function(){
    var tip=document.createElement('div'); tip.className='chart-tip'; document.body.appendChild(tip);
    document.addEventListener('mousemove', function(e){
      var br=(e.target && e.target.closest)?e.target.closest('.bar-row[data-tip]'):null;
      if(br){ tip.textContent=br.getAttribute('data-tip'); tip.style.left=e.clientX+'px'; tip.style.top=e.clientY+'px'; if(!tip.classList.contains('show')) tip.classList.add('show'); }
      else if(tip.classList.contains('show')){ tip.classList.remove('show'); }
    });
  })();

  function renderKPI(rows){
    var sKey=function(r){ return String(r[COL.sName]||'').replace(/\s+/g,' ').trim(); }; // ระบุตัวนักเรียนจากชื่อ-สกุลล้วน (ไม่เอาคำนำหน้ามาทำให้แยก) + ยุบช่องว่าง
    var students=uniq(rows.map(sKey)).length;                                    // นับนักเรียนไม่ซ้ำ
    var reports=uniq(rows.map(function(r){ return r[COL.ts]; })).length;
    var teachers=uniq(rows.map(function(r){ return ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); })).length;
    var subjects=uniq(rows.map(function(r){ return String(r[COL.code]||r[COL.subject]||'').replace(/\s+/g,'').trim(); })).length; // นับจากรหัสวิชา + ยุบช่องว่าง
    var pcts=rows.map(function(r){ return num(r[COL.percent]); }).filter(function(v){ return v!=null; });
    var avg=pcts.length? (pcts.reduce(function(a,b){return a+b;},0)/pcts.length) : null;
    var longAbsent=uniq(rows.filter(function(r){ return r[COL.remark]==='ขาดเรียนนาน'; }).map(sKey)).length; // ขาดเรียนนาน ไม่ซ้ำ
    var cards=[
      {label:'รายชื่อนักเรียนทั้งหมด', value:students, unit:'คน', cls:'', type:'students', action:'modal'},
      {label:'จำนวนใบรายงาน', value:reports, unit:'ใบ', cls:'blue', type:'reports', action:'modal'},
      {label:'ครูที่ส่งรายงาน', value:teachers, unit:'คน', cls:'green', type:'teachers', action:'modal'},
      {label:'รายวิชา', value:subjects, unit:'วิชา', cls:'pink', type:'subjects', action:'modal'},
      {label:'% เข้าเรียนเฉลี่ย', value:(avg==null?'–':avg.toFixed(1)), unit:'%', cls:'amber', type:'avg', action:'none'},
      {label:'ขาดเรียนนาน', value:longAbsent, unit:'คน', cls:'red', type:'long', action:'filter'}
    ];
    document.getElementById('kpis').innerHTML=cards.map(function(c){
      var icon=(c.action==='modal')?' 🔍':(c.action==='filter')?' 🔽':'';
      var inner='<div class="label">'+c.label+icon+'</div><div class="value">'+c.value+'<span class="unit">'+c.unit+'</span></div>';
      if(c.action==='modal') return '<div class="kpi '+c.cls+' kpi-click" onclick="openCardModal(\''+c.type+'\')">'+inner+'</div>';
      if(c.action==='filter') return '<div class="kpi '+c.cls+' kpi-click" onclick="filterRemarkLong()">'+inner+'</div>';
      return '<div class="kpi '+c.cls+'">'+inner+'</div>';
    }).join('');
  }

  // กดการ์ด "ขาดเรียนนาน" → ตั้งตัวกรองหมายเหตุ = ขาดเรียนนาน แล้วเลื่อนหน้าลงไปที่ตารางค้นหา
  function filterRemarkLong(){
    var sel=document.getElementById('fRemark');
    var has=false;
    for(var i=0;i<sel.options.length;i++){ if(sel.options[i].value==='ขาดเรียนนาน'){ has=true; break; } }
    if(!has) return; // ไม่มีข้อมูลขาดเรียนนาน — ไม่ทำอะไร
    sel.value='ขาดเรียนนาน';
    render();
    var tc=document.querySelector('.table-card');
    if(tc) tc.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function renderChart(rows){
    var counts={}; for(var i=1;i<=6;i++) counts[i]=0;
    var other=0;
    rows.forEach(function(r){ var lv=parseClass(r[COL.cls]).level; if(lv && counts[lv]!=null) counts[lv]++; else if(lv) counts[lv]=(counts[lv]||0)+1; else other++; });
    if(other>0) counts['อื่นๆ']=other; // แถวที่ชั้น/ห้องว่างหรือแยกชั้นไม่ได้ — นับรวมไว้ให้ยอดกราฟตรงกับตาราง
    var max=1; Object.keys(counts).forEach(function(k){ if(counts[k]>max) max=counts[k]; });
    var html='';
    Object.keys(counts).sort(function(a,b){ if(a==='อื่นๆ')return 1; if(b==='อื่นๆ')return -1; return (+a)-(+b); }).forEach(function(k){
      var w=Math.round(counts[k]/max*100);
      var label=(k==='อื่นๆ')?'อื่นๆ':'ม.'+k;
      html+='<div class="bar-row" data-tip="'+esc(label)+' : '+counts[k]+' คน"><div class="lbl">'+label+'</div><div class="track"><div class="fill" style="width:'+w+'%"></div></div><div class="num">'+counts[k]+'</div></div>';
    });
    document.getElementById('gradeChart').innerHTML=html||'<div class="empty-hint">ไม่มีข้อมูล</div>';
  }

  // กราฟแท่ง: จำนวนนักเรียนขาดเรียน แยกตามรายวิชา (โชว์ 7 อันแรก + ปุ่มดูทั้งหมด)
  function renderSubjectChart(rows){
    var counts={};
    rows.forEach(function(r){ var name=r[COL.subject]||'(ไม่ระบุวิชา)'; var key=name+(r[COL.code]?' ('+r[COL.code]+')':''); counts[key]=(counts[key]||0)+1; });
    var keys=Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; });
    var max=1; keys.forEach(function(k){ if(counts[k]>max) max=counts[k]; });
    var html='';
    keys.slice(0,7).forEach(function(k){ var w=Math.round(counts[k]/max*100); html+='<div class="bar-row" data-tip="'+esc(k)+' : '+counts[k]+' คน"><div class="lbl subj-lbl" title="'+esc(k)+'">'+esc(k)+'</div><div class="track"><div class="fill" style="width:'+w+'%"></div></div><div class="num">'+counts[k]+'</div></div>'; });
    if(!keys.length) html='<div class="empty-hint">ไม่มีข้อมูล</div>';
    else if(keys.length>7) html+='<div class="chart-more" onclick="openCardModal(\'subjects\')">ดูทั้งหมด ('+keys.length+' วิชา) →</div>';
    document.getElementById('subjectChart').innerHTML=html;
  }

  // กราฟแจกแจงช่วง % การเข้าเรียน — เห็นว่านักเรียนกระจุกช่วงเสี่ยงไหน
  function renderPercentChart(rows){
    var bins=[
      {label:'น้อยกว่า 10%', test:function(p){return p<10;}, color:'#dc2626'},
      {label:'10–30%', test:function(p){return p>=10&&p<30;}, color:'#f97316'},
      {label:'30–50%', test:function(p){return p>=30&&p<50;}, color:'#f59e0b'},
      {label:'50–70%', test:function(p){return p>=50&&p<70;}, color:'#eab308'}
    ];
    /* ไม่มีช่วง "70% ขึ้นไป" — เพราะระบบกันบันทึกนักเรียนที่เข้าเรียนถึง/เกิน 70% อยู่แล้ว */
    var counts=bins.map(function(){return 0;});
    rows.forEach(function(r){ var p=num(r[COL.percent]); if(p==null) return; for(var i=0;i<bins.length;i++){ if(bins[i].test(p)){ counts[i]++; break; } } });
    var max=1; counts.forEach(function(c){ if(c>max) max=c; });
    var html='';
    bins.forEach(function(b,i){
      var w=Math.round(counts[i]/max*100);
      html+='<div class="bar-row" data-tip="'+b.label+' : '+counts[i]+' คน"><div class="lbl" style="width:96px">'+b.label+'</div><div class="track"><div class="fill" style="width:'+w+'%;background:'+b.color+'"></div></div><div class="num">'+counts[i]+'</div></div>';
    });
    document.getElementById('percentChart').innerHTML=html;
  }

  function renderRisk(rows){
    var withPct=rows.filter(function(r){ return r[COL.remark]!=='ขาดเรียนนาน'; }) // ตัดคนที่ระบุ "ขาดเรียนนาน" ออก เหลือเฉพาะที่ต้องจับตาเพิ่ม
      .map(function(r){ return {r:r, p:num(r[COL.percent])}; })
      .filter(function(x){ return x.p!=null && x.p>0; }); // ไม่นับ 0%
    withPct.sort(function(a,b){ return a.p-b.p; });
    var top=withPct.slice(0,5);
    if(!top.length){ document.getElementById('riskList').innerHTML='<div class="empty-hint">ไม่มีข้อมูล</div>'; return; }
    var html=top.map(function(x){
      var r=x.r;
      return '<div class="risk-row"><span>'+esc((r[COL.sPrefix]||'')+r[COL.sName])+' <span style="color:#9ca3af">('+esc(r[COL.cls])+')</span></span><span class="pct">'+x.p.toFixed(1)+'%</span></div>';
    }).join('');
    if(withPct.length>5) html+='<div class="chart-more" onclick="openCardModal(\'risk\')">ดูทั้งหมด ('+withPct.length+' คน) →</div>';
    document.getElementById('riskList').innerHTML=html;
  }

  function fmtDate(v){
    if(!v) return '';
    var s=String(v);
    // ISO datetime (timestamp/Date จากชีต) → แปลงเป็นเวลาไทย (+7) ก่อนเอาวันที่ กัน timezone เพี้ยน -7 ชม. (วันที่ 8 กลายเป็น 7)
    if(s.indexOf('T')>0){
      var dt=new Date(s);
      if(!isNaN(dt.getTime())){ var th=new Date(dt.getTime()+7*3600*1000), p2=function(n){ return ('0'+n).slice(-2); }; return p2(th.getUTCDate())+'/'+p2(th.getUTCMonth()+1)+'/'+(th.getUTCFullYear()+543); }
      var d=s.split('T')[0].split('-'); if(d.length===3) return d[2]+'/'+d[1]+'/'+(parseInt(d[0],10)+543);
    }
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){ var p=s.substr(0,10).split('-'); return p[2]+'/'+p[1]+'/'+(parseInt(p[0],10)+543); }
    return s;
  }
  // เวลาที่กดส่ง (จาก timestamp ISO/UTC → เวลาไทย +7)
  function fmtTime(v){
    if(!v) return '-';
    var d=new Date(String(v)); if(isNaN(d.getTime())) return '-';
    var th=new Date(d.getTime()+7*3600*1000);
    return ('0'+th.getUTCHours()).slice(-2)+':'+('0'+th.getUTCMinutes()).slice(-2)+' น.';
  }
  // ===== Popup รายละเอียดของการ์ด KPI (กดได้ทุกอัน) =====
  var cardCurrent=null; // ข้อมูลปัจจุบันในป๊อปอัป สำหรับ export CSV

  // จัดกลุ่ม records เป็น "1 คน 1 แถว" + แถวย่อยรายวิชา (ยึดรหัสวิชา) + แถว CSV ละเอียด
  // ใช้ทั้งตอนเปิดป๊อปอัปและตอนกรองภายในป๊อปอัป (รับ records ที่กรองแล้ว)
  function buildStudentGroups(records){
    var sName=function(r){ return (r[COL.sPrefix]||'')+r[COL.sName]; };
    var tName=function(r){ return ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); };
    var sv=function(v){ return (v!=null && v!=='')?String(v):''; };
    // % รวมของนักเรียน = มาเรียนรวมทุกวิชา / คาบรวมทุกวิชา × 100 (ถ้าคาบ/มาไม่ครบ → เฉลี่ย % รายวิชา)
    var overallPct=function(recs){
      var tp=0,tm=0,ok=true;
      recs.forEach(function(r){ var p=num(r[COL.periods]),m=num(r[COL.present]); if(p==null||m==null) ok=false; else { tp+=p; tm+=m; } });
      if(ok && tp>0) return tm/tp*100;
      var pp=recs.map(function(r){ return num(r[COL.percent]); }).filter(function(v){ return v!=null; });
      return pp.length? pp.reduce(function(a,b){return a+b;},0)/pp.length : null;
    };
    // รวมรายวิชาโดยยึด "รหัสวิชา" เป็นหลัก (ชื่อซ้ำ/พิมพ์ต่างไม่กระทบ) — รหัสเดียวจากหลายใบรวมกัน
    var subjAgg=function(recs){
      var m={}, o=[];
      recs.forEach(function(r){
        var code=String(r[COL.code]||'').replace(/\s+/g,'').trim();
        var key=code||('n:'+String(r[COL.subject]||'').replace(/\s+/g,' ').trim());
        if(!m[key]){ m[key]={code:r[COL.code]||'', name:r[COL.subject]||'', recs:[]}; o.push(key); }
        m[key].recs.push(r);
      });
      return o.map(function(key){
        var s=m[key], tp=0,tm=0,ta=0,ok=true;
        s.recs.forEach(function(r){ var p=num(r[COL.periods]),mm=num(r[COL.present]),a=num(r[COL.absent]); if(p==null||mm==null) ok=false; else { tp+=p; tm+=mm; } if(a!=null) ta+=a; });
        var sp;
        if(ok && tp>0) sp=(tm/tp*100).toFixed(1);
        else { var pp=s.recs.map(function(r){ return num(r[COL.percent]); }).filter(function(v){ return v!=null; }); sp=pp.length?(pp.reduce(function(a,b){return a+b;},0)/pp.length).toFixed(1):''; }
        var label=(s.name||'(ไม่ระบุ)')+(s.code?' ('+s.code+')':'');
        return { label:label, teachers:uniq(s.recs.map(function(r){ return tName(r); })).join(', '), periods:(ok?String(tp):''), present:(ok?String(tm):''), absent:String(ta), pct:sp, remark:uniq(s.recs.map(function(r){ return sv(r[COL.remark]); }).filter(Boolean)).join(', ') };
      });
    };
    var grp={}, ord=[];
    records.forEach(function(r){
      var nm=String(r[COL.sName]||'').replace(/\s+/g,' ').trim();   // ชื่อ-สกุลล้วน (ไม่รวมคำนำหน้า → เรียงตามชื่อจริง)
      var k=nm+'|'+(r[COL.cls]||'');
      if(!grp[k]){ grp[k]={name:nm, prefix:sv(r[COL.sPrefix]), cls:r[COL.cls]||'', seat:sv(r[COL.seat]), recs:[]}; ord.push(k); }
      grp[k].recs.push(r);
    });
    var groups=ord.map(function(k){
      var x=grp[k], subs=subjAgg(x.recs), op=overallPct(x.recs);
      var sub=subs.map(function(s){ return [s.label, s.teachers, s.periods, s.present, s.absent, s.pct, s.remark]; });
      return { main:[ x.seat, x.name, x.cls, String(subs.length), (op==null?'–':op.toFixed(1)) ], prefix:x.prefix, opNum:op, sub:sub };
    });
    var csvRows=[];
    ord.forEach(function(k){ var x=grp[k]; subjAgg(x.recs).forEach(function(s){ csvRows.push([ x.prefix, x.name, x.cls, s.label, s.teachers, s.periods, s.present, s.absent, s.pct, s.remark ]); }); });
    return { groups:groups, csvRows:csvRows };
  }

  // จัดกลุ่ม records เป็น "ใบรายงาน" (group ตาม timestamp ที่ส่ง) + % เฉลี่ยใบ + รายชื่อนักเรียนในใบ
  function buildReportGroups(records){
    var sName=function(r){ return (r[COL.sPrefix]||'')+r[COL.sName]; };
    var tName=function(r){ return ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); };
    var pct=function(r){ var p=num(r[COL.percent]); return p!=null?p.toFixed(1):''; };
    var sv=function(v){ return (v!=null && v!=='')?String(v):''; };
    var g={}, order=[];
    records.forEach(function(r){ var ts=String(r[COL.ts]||''); if(!g[ts]){ g[ts]={ts:ts, date:r[COL.date]||r[COL.ts], teacher:tName(r), subject:r[COL.subject]||'', code:r[COL.code]||'', recs:[]}; order.push(ts);} g[ts].recs.push(r); });
    return order.map(function(ts){
      var x=g[ts];
      // % เฉลี่ยของใบ = มาเรียนรวม / คาบรวม ของนักเรียนทุกคนในใบ (ถ้าไม่ครบ → เฉลี่ย % รายคน)
      var tp=0,tm=0,ok=true;
      x.recs.forEach(function(r){ var p=num(r[COL.periods]),m=num(r[COL.present]); if(p==null||m==null) ok=false; else { tp+=p; tm+=m; } });
      var avg; if(ok && tp>0) avg=tm/tp*100; else { var pp=x.recs.map(function(r){ return num(r[COL.percent]); }).filter(function(v){ return v!=null; }); avg=pp.length?pp.reduce(function(a,b){return a+b;},0)/pp.length:null; }
      var subs=x.recs.slice().sort(function(a,b){ var sa=num(a[COL.seat]),sb=num(b[COL.seat]); if(sa!=null&&sb!=null&&sa!==sb) return sa-sb; return sName(a).localeCompare(sName(b),'th',{numeric:true}); })
        .map(function(r){ return [ sv(r[COL.seat]), sName(r), sv(r[COL.cls]), sv(r[COL.periods]), sv(r[COL.present]), sv(r[COL.absent]), pct(r), sv(r[COL.remark]) ]; });
      return { ts:ts, date:x.date, teacher:x.teacher, subjectLabel:(x.subject||'(ไม่ระบุ)')+(x.code?' ('+x.code+')':''), count:x.recs.length, avgNum:avg, avgStr:(avg==null?'–':avg.toFixed(1)), sub:subs };
    });
  }

  // จัดกลุ่ม records เป็น "ครู 1 คน 1 แถว" + % เฉลี่ย + แถวย่อยรายการใบที่ครูส่ง
  function buildTeacherGroups(records){
    var sName=function(r){ return (r[COL.sPrefix]||'')+r[COL.sName]; };
    var tName=function(r){ return ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); };
    var t={}, ord=[];
    records.forEach(function(r){ var n=tName(r); if(!t[n]){ t[n]={teacher:n, recs:[]}; ord.push(n);} t[n].recs.push(r); });
    return ord.map(function(n){
      var x=t[n], repSet={}, stuSet={}, subSet={}, subOrd=[];
      x.recs.forEach(function(r){
        repSet[String(r[COL.ts])]=1; stuSet[sName(r).replace(/\s+/g,' ').trim()]=1;
        var c=String(r[COL.code]||'').replace(/\s+/g,'').trim()||('n:'+(r[COL.subject]||'')); if(!subSet[c]){ subSet[c]=1; subOrd.push((r[COL.subject]||'(ไม่ระบุ)')+(r[COL.code]?' ('+r[COL.code]+')':'')); }
      });
      // % เฉลี่ยของครู = มาเรียนรวม / คาบรวม ของนักเรียนทุกคนที่ครูส่ง
      var tp=0,tm=0,ok=true; x.recs.forEach(function(r){ var p=num(r[COL.periods]),m=num(r[COL.present]); if(p==null||m==null) ok=false; else { tp+=p; tm+=m; } });
      var avg; if(ok && tp>0) avg=tm/tp*100; else { var pp=x.recs.map(function(r){ return num(r[COL.percent]); }).filter(function(v){ return v!=null; }); avg=pp.length?pp.reduce(function(a,b){return a+b;},0)/pp.length:null; }
      // แถวย่อย = ใบที่ครูส่ง (group ตาม timestamp)
      var bills={}, billOrd=[];
      x.recs.forEach(function(r){ var ts=String(r[COL.ts]); if(!bills[ts]){ bills[ts]={ts:ts,date:r[COL.date]||r[COL.ts],subject:r[COL.subject]||'',code:r[COL.code]||'',recs:[]}; billOrd.push(ts);} bills[ts].recs.push(r); });
      billOrd.sort(function(a,b){ return (new Date(b).getTime()||0)-(new Date(a).getTime()||0); });
      var sub=billOrd.map(function(ts){
        var b=bills[ts], btp=0,btm=0,bok=true; b.recs.forEach(function(r){ var p=num(r[COL.periods]),m=num(r[COL.present]); if(p==null||m==null) bok=false; else { btp+=p; btm+=m; } });
        var bavg; if(bok && btp>0) bavg=(btm/btp*100).toFixed(1); else { var pp=b.recs.map(function(r){ return num(r[COL.percent]); }).filter(function(v){ return v!=null; }); bavg=pp.length?(pp.reduce(function(a,c){return a+c;},0)/pp.length).toFixed(1):''; }
        return [ fmtDate(b.date), (b.subject||'(ไม่ระบุ)')+(b.code?' ('+b.code+')':''), String(b.recs.length), bavg, ts ];
      });
      return { main:[ n, String(Object.keys(repSet).length), String(Object.keys(stuSet).length), (avg==null?'–':avg.toFixed(1)), subOrd.join(', ') ], repNum:Object.keys(repSet).length, stuNum:Object.keys(stuSet).length, avgNum:avg, subjectsStr:subOrd.join(', '), sub:sub };
    });
  }
  // จัดกลุ่ม records เป็น "วิชา 1 แถว" (ยึดรหัสวิชา) + % เฉลี่ย + แถวย่อยรายชื่อนักเรียนในวิชา
  function buildSubjectGroups(records){
    var sName=function(r){ return (r[COL.sPrefix]||'')+r[COL.sName]; };
    var tName=function(r){ return ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); };
    var pct=function(r){ var p=num(r[COL.percent]); return p!=null?p.toFixed(1):''; };
    var sv=function(v){ return (v!=null && v!=='')?String(v):''; };
    var s={}, os=[];
    records.forEach(function(r){
      var key=String(r[COL.code]||'').replace(/\s+/g,'').trim()||('n:'+String(r[COL.subject]||'').replace(/\s+/g,' ').trim());
      if(!s[key]){ s[key]={name:r[COL.subject]||'(ไม่ระบุ)', code:r[COL.code]||'', recs:[], stuSet:{}, teaSet:{}, teaOrd:[]}; os.push(key); }
      s[key].recs.push(r); s[key].stuSet[sName(r).replace(/\s+/g,' ').trim()]=1;
      var tn=tName(r); if(!s[key].teaSet[tn]){ s[key].teaSet[tn]=1; s[key].teaOrd.push(tn); }
    });
    return os.map(function(key){
      var x=s[key], tp=0,tm=0,ok=true;
      x.recs.forEach(function(r){ var p=num(r[COL.periods]),m=num(r[COL.present]); if(p==null||m==null) ok=false; else { tp+=p; tm+=m; } });
      var avg; if(ok && tp>0) avg=tm/tp*100; else { var pp=x.recs.map(function(r){ return num(r[COL.percent]); }).filter(function(v){ return v!=null; }); avg=pp.length?pp.reduce(function(a,b){return a+b;},0)/pp.length:null; }
      var sub=x.recs.slice().sort(function(a,b){ var pa=num(a[COL.percent]),pb=num(b[COL.percent]); pa=(pa==null?9999:pa); pb=(pb==null?9999:pb); return pa-pb; })
        .map(function(r){ return [ sName(r), sv(r[COL.cls]), sv(r[COL.periods]), sv(r[COL.present]), sv(r[COL.absent]), pct(r), sv(r[COL.remark]) ]; });
      var label=x.name+(x.code?' ('+x.code+')':'');
      return { main:[ label, String(Object.keys(x.stuSet).length), (avg==null?'–':avg.toFixed(1)), x.teaOrd.join(', ') ], stuNum:Object.keys(x.stuSet).length, avgNum:avg, teachersStr:x.teaOrd.join(', '), sub:sub };
    });
  }
  var reportSort={ pins:[], active:{key:'date',dir:-1} }; // เริ่มเรียงวันที่ใหม่→เก่า
  var studentSort={ pins:[], active:{key:'cls',dir:1} };   // เริ่มเรียงตามชั้น (ยังไม่ตรึง — ผู้ใช้กดตรึงเองได้)
  // นิยามคอลัมน์ที่เรียงได้ของแต่ละการ์ด (label/key/ชนิด/ตัวดึงค่า)
  var REP_COLS=[
    {label:'ใบที่', key:'no', type:'date', center:true, w:'6%', get:function(g){return g.ts;}},
    {label:'วันที่', key:'date', type:'date', center:true, w:'11%', get:function(g){return g.ts;}},
    {label:'เวลาส่ง', key:'time', type:'date', center:true, w:'10%', get:function(g){return g.ts;}},
    {label:'ครูผู้สอน', key:'teacher', type:'str', w:'19%', get:function(g){return g.teacher;}},
    {label:'วิชา (รหัส)', key:'subject', type:'str', w:'22%', get:function(g){return g.subjectLabel;}},
    {label:'นักเรียน', key:'count', type:'num', center:true, w:'9%', get:function(g){return g.count;}},
    {label:'% เฉลี่ย', key:'pct', type:'num', center:true, w:'9%', get:function(g){return g.avgNum;}}
  ];
  var STU_COLS=[
    {label:'ชั้น/ห้อง', key:'cls', type:'str', center:true, w:'13%', get:function(g){return g.main[2];}, tie:function(g){return +g.main[0];}},
    {label:'เลขที่', key:'seat', type:'num', center:true, w:'9%', get:function(g){return g.main[0];}},
    {label:'คำนำหน้า', key:'prefix', type:'str', center:true, w:'11%', get:function(g){return g.prefix;}},
    {label:'ชื่อ-สกุล', key:'name', type:'str', w:'27%', get:function(g){return g.main[1];}, alpha:true},
    {label:'จำนวนวิชา', key:'count', type:'num', center:true, w:'18%', get:function(g){return +g.main[3];}},
    {label:'% เข้าเรียน (รวม)', key:'pct', type:'num', center:true, w:'22%', get:function(g){return g.opNum;}, disp:function(g){return g.main[4];}}
  ];
  var teacherSort={ pins:[], active:null };
  var TEA_COLS=[
    {label:'ครูผู้สอน', key:'teacher', type:'str', w:'26%', get:function(g){return g.main[0];}},
    {label:'จำนวนใบ', key:'rep', type:'num', center:true, w:'12%', get:function(g){return g.repNum;}},
    {label:'จำนวนนักเรียน', key:'stu', type:'num', center:true, w:'16%', get:function(g){return g.stuNum;}},
    {label:'% เฉลี่ย', key:'pct', type:'num', center:true, w:'14%', get:function(g){return g.avgNum;}},
    {label:'วิชาที่สอน', key:'subjects', type:'str', w:'32%', get:function(g){return g.subjectsStr;}}
  ];
  var subjectSort={ pins:[], active:null };
  var SUB_COLS=[
    {label:'วิชา (รหัส)', key:'subject', type:'str', w:'36%', get:function(g){return g.main[0];}},
    {label:'จำนวนนักเรียน', key:'stu', type:'num', center:true, w:'18%', get:function(g){return g.stuNum;}},
    {label:'% เฉลี่ย', key:'pct', type:'num', center:true, w:'16%', get:function(g){return g.avgNum;}},
    {label:'ครูผู้สอน', key:'teacher', type:'str', w:'30%', get:function(g){return g.teachersStr;}}
  ];
  // ===== ระบบเรียงหลายชั้น (ตรึงคอลัม 📌 + เรียงซ้อน) =====
  // st = { pins:[{key,dir}], active:{key,dir}|null } · pins=คอลัมที่ตรึง (เรียงตามลำดับ) · active=คอลัมที่กดเรียงล่าสุด (ไม่ตรึง)
  function sortChain(st){
    var chain=(st.pins||[]).slice();
    if(st.active && !chain.some(function(p){return p.key===st.active.key;})) chain.push(st.active);
    return chain;
  }
  // เรียง array ตาม chain หลายชั้น · colGetter(key) → {get,type,alpha}
  function applyMultiSort(arr, colGetter, st){
    var chain=sortChain(st); if(!chain.length) return arr;
    return arr.slice().sort(function(a,b){
      for(var i=0;i<chain.length;i++){
        var sc=chain[i], c=colGetter(sc.key); if(!c) continue;
        var va=c.get(a), vb=c.get(b), r;
        if(c.type==='num'){ var na=(va==null||va===''||isNaN(+va))?-Infinity:+va, nb=(vb==null||vb===''||isNaN(+vb))?-Infinity:+vb; r=(na-nb)*sc.dir; }
        else if(c.type==='date'){ r=((new Date(va).getTime()||0)-(new Date(vb).getTime()||0))*sc.dir; }
        else r=String(va==null?'':va).localeCompare(String(vb==null?'':vb),'th',{numeric:c.alpha?false:true})*sc.dir;
        if(r!==0) return r;
      }
      return 0;
    });
  }
  // กดหัวคอลัม (เรียง): ถ้าตรึงอยู่→สลับทิศในตัวที่ตรึง · ไม่งั้น→ตั้งเป็นตัวเรียงล่าสุด (active)
  function onSortClick(st, key, col){
    st.pins=st.pins||[];
    for(var i=0;i<st.pins.length;i++){ if(st.pins[i].key===key){ st.pins[i].dir=-st.pins[i].dir; return; } }
    if(st.active && st.active.key===key) st.active.dir=-st.active.dir;
    else st.active={ key:key, dir:(col&&col.type==='date')?-1:1 };
  }
  // กดหมุด 📌 (ตรึง/ปลด): ตรึง=ย้ายเข้า pins ท้ายสุด · กดซ้ำ=ปลดตรึง
  function onPinClick(st, key, col){
    st.pins=st.pins||[];
    for(var i=0;i<st.pins.length;i++){ if(st.pins[i].key===key){ st.pins.splice(i,1); if(typeof showToast==='function') showToast('ปลดตรึงคอลัมแล้ว'); return; } }
    var dir=(st.active&&st.active.key===key)?st.active.dir:((col&&col.type==='date')?-1:1);
    if(st.active&&st.active.key===key) st.active=null;
    st.pins.push({ key:key, dir:dir });
    if(typeof showToast==='function') showToast('📌 ตรึงคอลัมแล้ว');
  }
  // สร้างหัวตาราง — ทุกคอลัมคลิกเรียงได้ (ลูกศร ⇅/▲/▼) + หมุด 📌 ตรึง (เลขลำดับการเรียง)
  function sortHeadHTML(cols, st){
    var chain=sortChain(st), dirOf={}, pinIdx={};
    chain.forEach(function(c){ dirOf[c.key]=c.dir; });
    (st.pins||[]).forEach(function(p,i){ pinIdx[p.key]=i+1; });
    var h='<th class="exp-toggle"></th>';
    cols.forEach(function(c){
      var hasDir=(c.key in dirOf), arr=hasDir?(dirOf[c.key]>0?'▲':'▼'):'⇅', pinned=(c.key in pinIdx);
      h+='<th class="rsortable'+(c.center?' num':'')+(pinned?' pinned':'')+'" data-sk="'+c.key+'"'+(c.w?' style="width:'+c.w+'"':'')+'>'
        +'<span class="rpin'+(pinned?' on':'')+'" data-pk="'+c.key+'" title="'+(pinned?'กดเพื่อปลดตรึง':'กดเพื่อตรึงคอลัมนี้ (เรียงหลัก)')+'">📌'+(pinned?'<sup class="pinno">'+pinIdx[c.key]+'</sup>':'')+'</span>&nbsp;&nbsp;'
        +esc(c.label)
        +'<span class="rarr'+(hasDir?' on':'')+'">'+arr+'</span></th>';
    });
    return h;
  }
  // จัดเรียงตาม cols array (รองรับ alpha เดิม) — ภายในใช้ applyMultiSort
  function applySortState(arr, cols, st){
    return applyMultiSort(arr, function(k){ for(var i=0;i<cols.length;i++){ if(cols[i].key===k) return cols[i]; } return null; }, st);
  }
  // ผูก event: คลิกหัว=เรียง · คลิกหมุด=ตรึง/ปลด แล้ว render ใหม่
  // ทาสีทั้งคอลัมที่ตรึง (หัว + เซลล์ทุกแถว) เป็นอำพันจาง — ดู th ที่ตรึงแล้วทา td ตำแหน่งเดียวกัน
  function paintPinned(scope, st){
    if(!scope) return;
    var table=(scope.matches&&scope.matches('table'))?scope:scope.querySelector('table'); if(!table) return;
    var thead=table.querySelector('thead'), tbody=table.querySelector('tbody'); if(!thead||!tbody) return;
    var ths=thead.querySelectorAll('th');   // หัวของตารางหลักเท่านั้น (thead แรก)
    var keys=(st.pins||[]).map(function(p){return p.key;}), pc={};
    [].forEach.call(ths,function(th,i){ var k=th.getAttribute('data-sk')||th.getAttribute('data-key'); if(k && keys.indexOf(k)>=0) pc[i]=1; });
    [].forEach.call(tbody.children,function(tr){   // เฉพาะแถวตรงของตารางหลัก (ไม่แตะ sub-table ที่ซ้อนใน td)
      if(tr.children.length!==ths.length) return;   // ข้ามแถวขยาย (colspan) ที่จำนวนเซลล์ไม่ตรง
      for(var i=0;i<tr.children.length;i++){ tr.children[i].classList.toggle('pcol', !!pc[i]); }
    });
  }
  function bindSortHeads(wrap, cols, st, rerender){
    var getCol=function(k){ for(var i=0;i<cols.length;i++){ if(cols[i].key===k) return cols[i]; } return null; };
    wrap.querySelectorAll('th.rsortable').forEach(function(th){
      var sk=th.getAttribute('data-sk'), pin=th.querySelector('.rpin');
      if(pin) pin.addEventListener('click', function(e){ e.stopPropagation(); onPinClick(st, sk, getCol(sk)); rerender(); });
      th.addEventListener('click', function(){ onSortClick(st, sk, getCol(sk)); rerender(); });
    });
    paintPinned(wrap, st);
  }

  // สร้างข้อมูลตารางตามชนิดการ์ด → {title, headers[], data[][], pdf:bool}
  function buildCardData(type, rows){
    var sName=function(r){ return (r[COL.sPrefix]||'')+r[COL.sName]; };
    var tName=function(r){ return ((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); };
    var pct=function(r){ var p=num(r[COL.percent]); return p!=null?p.toFixed(1):''; };
    if(type==='students'){
      // โหมดพิเศษ: ป๊อปอัปมีตัวกรองของตัวเอง (ค้นหาชื่อ / ช่วง % / รหัสวิชา) + แถวกดขยาย
      // สร้างตาราง/CSV ตอน render ตามตัวกรอง — เก็บข้อมูลดิบไว้ที่ rawRows
      var codeMap={}, codesList=[];
      rows.forEach(function(r){ var c=String(r[COL.code]||'').replace(/\s+/g,'').trim(); if(c && !codeMap[c]){ codeMap[c]=1; codesList.push({ code:c, label:(r[COL.subject]||'(ไม่ระบุ)')+' ('+c+')' }); } });
      codesList.sort(function(a,b){ return a.label.localeCompare(b.label,'th',{numeric:true}); });
      return {
        studentMode:true,
        title:'รายชื่อนักเรียนทั้งหมด',
        rawRows:rows,
        codesList:codesList,
        headers:['ชั้น/ห้อง','เลขที่','คำนำหน้า','ชื่อ-สกุล','จำนวนวิชา','% เข้าเรียน (รวม)'],
        subHeaders:['วิชา (รหัส)','ครูผู้สอน','คาบ','มา','ขาด','% เข้าเรียน','หมายเหตุ'],
        csvHeaders:['คำนำหน้า','ชื่อ-สกุล','ชั้น/ห้อง','วิชา (รหัส)','ครูผู้สอน','คาบ','มา','ขาด','% เข้าเรียน','หมายเหตุ']
      };
    }
    if(type==='reports'){
      // โหมดพิเศษ: ป๊อปอัปมีตัวกรอง (ค้นหา/ครู/วิชา/ช่วงวันที่) + เรียงลำดับ + กดขยายดูรายชื่อในใบ
      var tset={}, tlist=[], cset={}, clist=[];
      rows.forEach(function(r){
        var t=((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); if(t && !tset[t]){ tset[t]=1; tlist.push(t); }
        var c=String(r[COL.code]||'').replace(/\s+/g,'').trim(); if(c && !cset[c]){ cset[c]=1; clist.push({ code:c, label:(r[COL.subject]||'(ไม่ระบุ)')+' ('+c+')' }); }
      });
      tlist.sort(function(a,b){ return a.localeCompare(b,'th'); });
      clist.sort(function(a,b){ return a.label.localeCompare(b.label,'th',{numeric:true}); });
      return {
        reportMode:true,
        title:'รายการใบรายงาน',
        rawRows:rows,
        teachersList:tlist,
        codesList:clist,
        headers:['ใบที่','วันที่','เวลาส่ง','ครูผู้สอน','วิชา (รหัส)','นักเรียน','% เฉลี่ย'],
        subHeaders:['เลขที่','ชื่อ-สกุล','ชั้น/ห้อง','คาบ','มา','ขาด','% เข้าเรียน','หมายเหตุ'],
        csvHeaders:['ใบที่','วันที่','เวลาส่ง','ครูผู้สอน','วิชา (รหัส)','จำนวนนักเรียน','% เฉลี่ย']
      };
    }
    if(type==='teachers'){
      // โหมดพิเศษ: ป๊อปอัปมีตัวกรอง (ค้นหาครู/รหัสวิชา) + เรียงลำดับ + กดขยายดูใบของครู
      var cset={}, clist=[];
      rows.forEach(function(r){ var c=String(r[COL.code]||'').replace(/\s+/g,'').trim(); if(c && !cset[c]){ cset[c]=1; clist.push({ code:c, label:(r[COL.subject]||'(ไม่ระบุ)')+' ('+c+')' }); } });
      clist.sort(function(a,b){ return a.label.localeCompare(b.label,'th',{numeric:true}); });
      return {
        teacherMode:true,
        title:'ครูที่ส่งรายงาน',
        rawRows:rows,
        codesList:clist,
        headers:['ครูผู้สอน','จำนวนใบ','จำนวนนักเรียน','% เฉลี่ย','วิชาที่สอน'],
        subHeaders:['วันที่','วิชา (รหัส)','จำนวนนักเรียน','% เฉลี่ย','เอกสาร'],
        csvHeaders:['ครูผู้สอน','จำนวนใบ','จำนวนนักเรียน','% เฉลี่ย','วิชาที่สอน']
      };
    }
    if(type==='subjects'){
      // โหมดพิเศษ: ป๊อปอัปมีตัวกรอง (ค้นหาวิชา/กรองครู) + เรียงลำดับ + กดขยายดูนักเรียนในวิชา
      var tset={}, tlist=[];
      rows.forEach(function(r){ var t=((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim(); if(t && !tset[t]){ tset[t]=1; tlist.push(t); } });
      tlist.sort(function(a,b){ return a.localeCompare(b,'th'); });
      return {
        subjectMode:true,
        title:'รายวิชา',
        rawRows:rows,
        teachersList:tlist,
        headers:['วิชา (รหัส)','จำนวนนักเรียน','% เฉลี่ย','ครูผู้สอน'],
        subHeaders:['ชื่อ-สกุล','ชั้น/ห้อง','คาบ','มา','ขาด','% เข้าเรียน','หมายเหตุ'],
        csvHeaders:['วิชา (รหัส)','จำนวนนักเรียน','% เฉลี่ย','ครูผู้สอน']
      };
    }
    if(type==='risk'){
      var ra=rows.filter(function(r){ return r[COL.remark]!=='ขาดเรียนนาน'; })
        .map(function(r){ return { row:[sName(r), r[COL.cls], r[COL.subject], pct(r)], p:num(r[COL.percent]) }; })
        .filter(function(x){ return x.p!=null && x.p>0; });
      ra.sort(function(a,b){ return a.p-b.p; });
      var outR=ra.map(function(x){ return x.row; });
      return { title:'นักเรียนกลุ่มเสี่ยง — % ต่ำ ยังไม่ระบุขาดเรียนนาน ('+outR.length+' คน)', headers:['ชื่อ-สกุล','ชั้น/ห้อง','วิชา','% เข้าเรียน'], data:outR };
    }
    // avg + long → รายนักเรียน
    var src=rows;
    if(type==='long') src=rows.filter(function(r){ return r[COL.remark]==='ขาดเรียนนาน'; });
    var arr=src.map(function(r){ return { row:[sName(r), r[COL.cls], r[COL.subject], pct(r)], p:num(r[COL.percent]) }; });
    if(type==='avg') arr.sort(function(a,b){ return (a.p==null?9999:a.p)-(b.p==null?9999:b.p); });
    var out5=arr.map(function(x){ return x.row; });
    var tt=(type==='avg')?'นักเรียนเรียงตาม % เข้าเรียน (น้อย→มาก)':'นักเรียนที่ขาดเรียนนาน';
    return { title:tt+' ('+out5.length+' รายการ)', headers:['ชื่อ-สกุล','ชั้น/ห้อง','วิชา','% เข้าเรียน'], data:out5 };
  }
  function openCardModal(type){
    var cfg=buildCardData(type, applySort(applyFilters()));
    cardCurrent=cfg;
    // ปุ่มปริ้นบัญชีรายชื่อ — แสดงเฉพาะการ์ดรายชื่อนักเรียน
    var _pa=document.getElementById('stuPrintAllBtn'), _pf=document.getElementById('stuPrintFilteredBtn');
    if(_pa) _pa.style.display=cfg.studentMode?'':'none';
    if(_pf) _pf.style.display=cfg.studentMode?'':'none';
    document.getElementById('cardModalTitle').textContent=cfg.title;
    var _sc=document.querySelector('#cardModal .rm-scroll'); if(_sc) _sc.scrollTop=0;  // เปิดการ์ดใหม่ = เริ่มบนสุดเสมอ
    var _tb=document.getElementById('cardTopBtn'); if(_tb) _tb.classList.remove('show');
    // ขยายกล่องให้กว้างเท่าหน้าเว็บเฉพาะการ์ดรายชื่อนักเรียน — การ์ดอื่นใช้ขนาดปกติ
    var rmBox=document.querySelector('#cardModal .rm-box');
    if(rmBox) rmBox.classList.toggle('rm-wide', !!(cfg.studentMode || cfg.reportMode || cfg.teacherMode || cfg.subjectMode));
    var body=document.getElementById('cardModalBody');
    // ===== โหมดรายชื่อนักเรียน: มีแถบกรองของตัวเอง (ค้นหาชื่อ / ช่วง % / รหัสวิชา) =====
    if(cfg.studentMode){
      var opts='<option value="">ทุกวิชา</option>'+cfg.codesList.map(function(c){ return '<option value="'+esc(c.code)+'">'+esc(c.label)+'</option>'; }).join('');
      var levels=uniq(cfg.rawRows.map(function(r){ return parseClass(r[COL.cls]).level; }).filter(Boolean)).sort(function(a,b){ return (+a)-(+b); });
      var gopts='<option value="">ทุกระดับชั้น</option>'+levels.map(function(l){ return '<option value="'+esc(l)+'">ม.'+esc(l)+'</option>'; }).join('');
      var hasLong=cfg.rawRows.some(function(r){ return r[COL.remark]==='ขาดเรียนนาน'; }), hasOther=cfg.rawRows.some(function(r){ return r[COL.remark]!=='ขาดเรียนนาน'; });
      var ropts='<option value="">ทุกหมายเหตุ</option>'+(hasLong?'<option value="ขาดเรียนนาน">ขาดเรียนนาน</option>':'')+(hasOther?'<option value="__other__">อื่นๆ</option>':'');
      var prefs=uniq(cfg.rawRows.map(function(r){ return r[COL.sPrefix]; }).filter(Boolean)).sort();
      var ppts='<option value="">ทุกคำนำหน้า</option>'+prefs.map(function(p){ return '<option value="'+esc(p)+'">'+esc(p)+'</option>'; }).join('');
      body.innerHTML=''
        +'<div class="stu-filter">'
        +'<div class="fld grow"><label>ค้นหาชื่อนักเรียน</label><input type="text" id="stuQ" placeholder="พิมพ์ชื่อ..."></div>'
        +'<div class="fld"><label>ระดับชั้น</label><select id="stuGrade">'+gopts+'</select></div>'
        +'<div class="fld"><label>ห้อง</label><select id="stuRoom" disabled><option value="">เลือกระดับชั้นก่อน</option></select></div>'
        +'<div class="fld"><label>คำนำหน้า</label><select id="stuPrefix">'+ppts+'</select></div>'
        +'<div class="fld"><label>ช่วง % เข้าเรียนรวม</label><select id="stuPct"><option value="">ทั้งหมด</option><option value="0-49">น้อยกว่า 50</option><option value="50-59">50 - 59</option><option value="60-69">60 - 69</option><option value="70+">70 ขึ้นไป</option></select></div>'
        +'<div class="fld"><label>รหัสวิชา</label><select id="stuCode">'+opts+'</select></div>'
        +'<div class="fld"><label>หมายเหตุ</label><select id="stuRemark">'+ropts+'</select></div>'
        +'</div>'
        +'<div class="stu-count" id="stuCount"></div>'
        +'<div id="stuTableWrap"></div>';
      // ห้องขึ้นตามระดับชั้นที่เลือก (ต้องเลือกชั้นก่อน)
      var updateStuRoom=function(){
        var g=document.getElementById('stuGrade').value, rs=document.getElementById('stuRoom');
        if(!g){ rs.innerHTML='<option value="">เลือกระดับชั้นก่อน</option>'; rs.disabled=true; return; }
        var rooms=uniq(cfg.rawRows.filter(function(r){ return parseClass(r[COL.cls]).level===g; }).map(function(r){ return parseClass(r[COL.cls]).room; }).filter(Boolean)).sort(function(a,b){ return (+a)-(+b); });
        rs.innerHTML='<option value="">ทุกห้องใน ม.'+g+'</option>'+rooms.map(function(rm){ return '<option value="'+esc(rm)+'">ม.'+g+'/'+esc(rm)+'</option>'; }).join('');
        rs.disabled=false;
      };
      var doRender=function(){ renderStudentTable(cfg); };
      document.getElementById('stuQ').addEventListener('input', debounce(doRender, 200));
      document.getElementById('stuGrade').addEventListener('change', function(){ updateStuRoom(); doRender(); });
      document.getElementById('stuRoom').addEventListener('change', doRender);
      document.getElementById('stuPrefix').addEventListener('change', doRender);
      document.getElementById('stuPct').addEventListener('change', doRender);
      document.getElementById('stuCode').addEventListener('change', doRender);
      document.getElementById('stuRemark').addEventListener('change', doRender);
      renderStudentTable(cfg);
      document.getElementById('cardModal').classList.add('show');
      document.body.style.overflow='hidden';
      syncPopupFilterTop();
      return;
    }
    // ===== โหมดวิชา: ตัวกรอง (ค้นหาวิชา/กรองครู) + เรียงลำดับ + กดขยายดูนักเรียนในวิชา =====
    if(cfg.subjectMode){
      var stopts='<option value="">ครูทุกคน</option>'+cfg.teachersList.map(function(t){ return '<option value="'+esc(t)+'">'+esc(t)+'</option>'; }).join('');
      body.innerHTML=''
        +'<div class="stu-filter">'
        +'<div class="fld grow"><label>ค้นหาวิชา / รหัส</label><input type="text" id="subjQ" placeholder="พิมพ์ชื่อวิชาหรือรหัส..."></div>'
        +'<div class="fld"><label>ครูผู้สอน</label><select id="subjTeacher">'+stopts+'</select></div>'
        +'</div>'
        +'<div class="stu-count" id="subjCount"></div>'
        +'<div id="subjTableWrap"></div>';
      var doS=function(){ renderSubjectCardTable(cfg); };
      document.getElementById('subjQ').addEventListener('input', debounce(doS, 200));
      document.getElementById('subjTeacher').addEventListener('change', doS);
      renderSubjectCardTable(cfg);
      document.getElementById('cardModal').classList.add('show');
      document.body.style.overflow='hidden';
      syncPopupFilterTop();
      return;
    }
    // ===== โหมดครู: ตัวกรอง (ค้นหาครู/รหัสวิชา) + เรียงลำดับ + กดขยายดูใบของครู =====
    if(cfg.teacherMode){
      var tcopts='<option value="">ทุกวิชา</option>'+cfg.codesList.map(function(c){ return '<option value="'+esc(c.code)+'">'+esc(c.label)+'</option>'; }).join('');
      body.innerHTML=''
        +'<div class="stu-filter">'
        +'<div class="fld grow"><label>ค้นหาชื่อครู</label><input type="text" id="teaQ" placeholder="พิมพ์ชื่อครู..."></div>'
        +'<div class="fld"><label>รหัสวิชา</label><select id="teaCode">'+tcopts+'</select></div>'
        +'</div>'
        +'<div class="stu-count" id="teaCount"></div>'
        +'<div id="teaTableWrap"></div>';
      var doT=function(){ renderTeacherTable(cfg); };
      document.getElementById('teaQ').addEventListener('input', debounce(doT, 200));
      document.getElementById('teaCode').addEventListener('change', doT);
      renderTeacherTable(cfg);
      document.getElementById('cardModal').classList.add('show');
      document.body.style.overflow='hidden';
      syncPopupFilterTop();
      return;
    }
    // ===== โหมดใบรายงาน: ตัวกรอง (ค้นหา/ครู/วิชา/ช่วงวันที่) + เรียงลำดับ + กดขยายดูรายชื่อในใบ =====
    if(cfg.reportMode){
      var topts='<option value="">ครูทุกคน</option>'+cfg.teachersList.map(function(t){ return '<option value="'+esc(t)+'">'+esc(t)+'</option>'; }).join('');
      var copts2='<option value="">ทุกวิชา</option>'+cfg.codesList.map(function(c){ return '<option value="'+esc(c.code)+'">'+esc(c.label)+'</option>'; }).join('');
      body.innerHTML=''
        +'<div class="stu-filter">'
        +'<div class="fld grow"><label>ค้นหา (ครู / วิชา / รหัส)</label><input type="text" id="repQ" placeholder="พิมพ์คำค้นหา..."></div>'
        +'<div class="fld"><label>ครูผู้สอน</label><select id="repTeacher">'+topts+'</select></div>'
        +'<div class="fld"><label>รหัสวิชา</label><select id="repCode">'+copts2+'</select></div>'
        +'<div class="fld"><label>วันที่ตั้งแต่</label><input type="date" id="repFrom"></div>'
        +'<div class="fld"><label>ถึงวันที่</label><input type="date" id="repTo"></div>'
        +'</div>'
        +'<div class="stu-count" id="repCount"></div>'
        +'<div id="repTableWrap"></div>';
      var doR=function(){ renderReportTable(cfg); };
      document.getElementById('repQ').addEventListener('input', debounce(doR, 200));
      document.getElementById('repTeacher').addEventListener('change', doR);
      document.getElementById('repCode').addEventListener('change', doR);
      document.getElementById('repFrom').addEventListener('change', doR);
      document.getElementById('repTo').addEventListener('change', doR);
      renderReportTable(cfg);
      document.getElementById('cardModal').classList.add('show');
      document.body.style.overflow='hidden';
      syncPopupFilterTop();
      return;
    }
    // ===== ตารางแบบกดขยาย (สำรองสำหรับการ์ดอื่นในอนาคต) — 1 แถวต่อคน กดดูรายวิชา/ครู =====
    if(cfg.expandable){
      var eh='';
      if(!cfg.groups.length){ eh='<div class="empty-hint">ไม่มีข้อมูล</div>'; }
      else {
        eh='<table class="rm-table rm-exp"><thead><tr><th class="exp-toggle"></th>';
        cfg.headers.forEach(function(h){ eh+='<th>'+esc(h)+'</th>'; });
        eh+='</tr></thead><tbody>';
        cfg.groups.forEach(function(g,gi){
          eh+='<tr class="exp-main" data-gi="'+gi+'" title="กดเพื่อดู/ซ่อนรายวิชาที่ขาด"><td class="exp-toggle"><span class="exp-arrow">▶</span></td>';
          g.main.forEach(function(c){ eh+='<td>'+esc(c)+'</td>'; });
          eh+='</tr>';
          eh+='<tr class="exp-sub" data-gi="'+gi+'" style="display:none"><td></td><td colspan="'+cfg.headers.length+'">';
          eh+='<table class="rm-subtable rm-sub-stu"><thead><tr>';
          cfg.subHeaders.forEach(function(sh){ eh+='<th>'+esc(sh)+'</th>'; });
          eh+='</tr></thead><tbody>';
          g.sub.forEach(function(srow){ eh+='<tr>'; srow.forEach(function(sc){ eh+='<td>'+esc(sc)+'</td>'; }); eh+='</tr>'; });
          eh+='</tbody></table></td></tr>';
        });
        eh+='</tbody></table>';
      }
      body.innerHTML=eh;
      body.querySelectorAll('.exp-main').forEach(function(tr){
        tr.addEventListener('click', function(){
          var gi=this.getAttribute('data-gi');
          var subRow=body.querySelector('.exp-sub[data-gi="'+gi+'"]');
          var arrow=this.querySelector('.exp-arrow');
          if(subRow){ var isOpen=subRow.style.display!=='none'; subRow.style.display=isOpen?'none':'table-row'; if(arrow) arrow.textContent=isOpen?'▶':'▼'; this.classList.toggle('open',!isOpen); }
        });
      });
      document.getElementById('cardModal').classList.add('show');
      document.body.style.overflow='hidden';
      syncPopupFilterTop();
      return;
    }
    var html='';
    if(!cfg.data.length){ html='<div class="empty-hint">ไม่มีข้อมูล</div>'; }
    else {
      html='<table class="rm-table"><thead><tr>';
      cfg.headers.forEach(function(h){ html+='<th>'+esc(h)+'</th>'; });
      if(cfg.pdf) html+='<th>เอกสาร</th>';
      html+='</tr></thead><tbody>';
      cfg.data.forEach(function(row){
        html+='<tr>';
        cfg.headers.forEach(function(h,ci){ html+='<td>'+esc(row[ci])+'</td>'; });
        if(cfg.pdf){ var ts=String(row[row.length-1]).replace(/"/g,'&quot;'); html+='<td><button class="btn-pdf-row" data-ts="'+ts+'">📄 PDF</button></td>'; }
        html+='</tr>';
      });
      html+='</tbody></table>';
    }
    body.innerHTML=html;
    if(cfg.pdf){ body.querySelectorAll('.btn-pdf-row').forEach(function(b){ b.addEventListener('click', function(){ var ts=this.getAttribute('data-ts'); closeCardModal(); openPdfForReport(ts); }); }); }
    document.getElementById('cardModal').classList.add('show');
    document.body.style.overflow='hidden'; // ล็อกการเลื่อนพื้นหลัง
  }
  function closeCardModal(){ document.getElementById('cardModal').classList.remove('show'); document.body.style.overflow=''; }
  // render ตารางรายชื่อนักเรียนในป๊อปอัป ตามตัวกรอง (ค้นหาชื่อ / ช่วง % รวม / รหัสวิชา)
  function renderStudentTable(cfg){
    var q=(document.getElementById('stuQ').value||'').trim().toLowerCase();
    var pr=document.getElementById('stuPct').value;
    var code=document.getElementById('stuCode').value;
    var gEl=document.getElementById('stuGrade'), rEl=document.getElementById('stuRoom');
    var grade=gEl?gEl.value:'', room=rEl?rEl.value:'';
    var rmEl=document.getElementById('stuRemark'); var rmk=rmEl?rmEl.value:'';
    var pfEl=document.getElementById('stuPrefix'); var pf=pfEl?pfEl.value:'';
    // กรองที่ระดับ record ก่อน: ระดับชั้น + ห้อง + รหัสวิชา + หมายเหตุ + ชื่อนักเรียน
    var recs=cfg.rawRows.filter(function(r){
      var pc=parseClass(r[COL.cls]);
      if(grade && pc.level!==grade) return false;
      if(room && pc.room!==room) return false;
      if(pf && (r[COL.sPrefix]||'')!==pf) return false;
      if(code){ if(String(r[COL.code]||'').replace(/\s+/g,'').trim()!==code) return false; }
      if(rmk){ if(rmk==='__other__'){ if(r[COL.remark]==='ขาดเรียนนาน') return false; } else if(r[COL.remark]!==rmk) return false; }
      if(q){ var nm=((r[COL.sPrefix]||'')+r[COL.sName]).toLowerCase(); if(nm.indexOf(q)<0) return false; }
      return true;
    });
    var built=buildStudentGroups(recs);
    // กรองช่วง % (คิดจาก % รวมของแต่ละคนหลังจัดกลุ่ม)
    var groups=built.groups.filter(function(g){
      if(!pr) return true;
      if(g.opNum==null) return false;
      if(pr==='0-49') return g.opNum<50;
      if(pr==='50-59') return g.opNum>=50 && g.opNum<60;
      if(pr==='60-69') return g.opNum>=60 && g.opNum<70;
      if(pr==='70+') return g.opNum>=70;
      return true;
    });
    groups=applySortState(groups, STU_COLS, studentSort);
    cardCurrent.lastGroups=groups; cardCurrent.lastRecs=recs;   // เก็บไว้ให้ปุ่ม "ปริ้นตามที่กรอง"
    // CSV ตามที่กรอง (เฉพาะนักเรียนที่เหลือ)
    var keep={}; groups.forEach(function(g){ keep[g.main[1]+'|'+g.main[2]]=1; });
    cardCurrent.csv={ headers:cfg.csvHeaders, rows:built.csvRows.filter(function(row){ return keep[row[1]+'|'+row[2]]; }) };
    document.getElementById('cardModalTitle').textContent='รายชื่อนักเรียนทั้งหมด ('+groups.length+' คน)';
    document.getElementById('stuCount').textContent='พบ '+groups.length+' คน'+( (q||pr||code) ? ' (กรองแล้ว)' : '' );
    var wrap=document.getElementById('stuTableWrap');
    if(!groups.length){ wrap.innerHTML='<div class="empty-hint">ไม่พบนักเรียนตามเงื่อนไข</div>'; return; }
    var eh='<table class="rm-table rm-exp"><thead><tr>'+sortHeadHTML(STU_COLS, studentSort)+'</tr></thead><tbody>';
    groups.forEach(function(g,gi){
      eh+='<tr class="exp-main" data-gi="'+gi+'"><td class="exp-toggle"><span class="exp-arrow">▶</span></td>';
      STU_COLS.forEach(function(col,ci){ var cn=col.center?' class="num"':''; var v=(col.disp||col.get)(g); eh+='<td'+cn+(ci===0?' data-tip="กดเพื่อดู / ซ่อนรายวิชาที่ขาด"':'')+'>'+esc(v==null?'':v)+'</td>'; });
      eh+='</tr>';
      eh+='<tr class="exp-sub" data-gi="'+gi+'" style="display:none"><td></td><td colspan="'+STU_COLS.length+'">';
      eh+='<table class="rm-subtable rm-sub-stu"><thead><tr>';
      cfg.subHeaders.forEach(function(sh){ eh+='<th>'+esc(sh)+'</th>'; });
      eh+='</tr></thead><tbody>';
      g.sub.forEach(function(srow){ eh+='<tr>'; srow.forEach(function(sc){ eh+='<td>'+esc(sc)+'</td>'; }); eh+='</tr>'; });
      eh+='</tbody></table></td></tr>';
    });
    eh+='</tbody></table>';
    wrap.innerHTML=eh;
    wrap.querySelectorAll('.exp-main').forEach(function(tr){
      tr.addEventListener('click', function(){
        var gi=this.getAttribute('data-gi');
        var subRow=wrap.querySelector('.exp-sub[data-gi="'+gi+'"]');
        var arrow=this.querySelector('.exp-arrow');
        if(subRow){ var isOpen=subRow.style.display!=='none'; subRow.style.display=isOpen?'none':'table-row'; if(arrow) arrow.textContent=isOpen?'▶':'▼'; this.classList.toggle('open',!isOpen); }
      });
    });
    bindSortHeads(wrap, STU_COLS, studentSort, function(){ renderStudentTable(cfg); });
  }
  // render ตารางใบรายงานในป๊อปอัป ตามตัวกรอง + เรียงลำดับ + กดขยายดูรายชื่อในใบ
  function renderReportTable(cfg){
    var q=(document.getElementById('repQ').value||'').trim().toLowerCase();
    var tf=document.getElementById('repTeacher').value;
    var cf=document.getElementById('repCode').value;
    var from=document.getElementById('repFrom').value, to=document.getElementById('repTo').value;
    function tsDate(ts){ var d=new Date(String(ts)); if(isNaN(d.getTime())) return ''; var t=new Date(d.getTime()+7*3600*1000); return t.toISOString().slice(0,10); }
    var recs=cfg.rawRows.filter(function(r){
      if(tf){ if(((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim()!==tf) return false; }
      if(cf){ if(String(r[COL.code]||'').replace(/\s+/g,'').trim()!==cf) return false; }
      if(from||to){ var d=tsDate(r[COL.ts]); if(from && d<from) return false; if(to && d>to) return false; }
      if(q){ var hay=(((r[COL.tPrefix]||'')+r[COL.tName])+' '+(r[COL.subject]||'')+' '+(r[COL.code]||'')).toLowerCase(); if(hay.indexOf(q)<0) return false; }
      return true;
    });
    var reps=applySortState(buildReportGroups(recs), REP_COLS, reportSort);
    cardCurrent.csv={ headers:cfg.csvHeaders, rows:reps.map(function(g,i){ return [String(i+1), fmtDate(g.date), fmtTime(g.ts), g.teacher, g.subjectLabel, String(g.count), g.avgStr]; }) };
    var filtered=(q||tf||cf||from||to);
    document.getElementById('cardModalTitle').textContent='รายการใบรายงาน ('+reps.length+' ใบ)';
    document.getElementById('repCount').textContent='พบ '+reps.length+' ใบ'+(filtered?' (กรองแล้ว)':'');
    var wrap=document.getElementById('repTableWrap');
    if(!reps.length){ wrap.innerHTML='<div class="empty-hint">ไม่พบใบรายงานตามเงื่อนไข</div>'; return; }
    var eh='<table class="rm-table rm-exp"><thead><tr>'+sortHeadHTML(REP_COLS, reportSort)+'<th style="width:14%">เอกสาร</th></tr></thead><tbody>';
    reps.forEach(function(g,gi){
      var tsAttr=String(g.ts).replace(/"/g,'&quot;');
      eh+='<tr class="exp-main" data-gi="'+gi+'"><td class="exp-toggle"><span class="exp-arrow">▶</span></td>';
      eh+='<td class="num" data-tip="กดเพื่อดู / ซ่อนรายชื่อนักเรียนในใบ">'+(gi+1)+'</td><td class="num">'+esc(fmtDate(g.date))+'</td><td class="num">'+esc(fmtTime(g.ts))+'</td><td>'+esc(g.teacher)+'</td><td>'+esc(g.subjectLabel)+'</td><td class="num">'+g.count+'</td><td class="num">'+esc(g.avgStr)+'</td>';
      eh+='<td><button class="btn-pdf-row" data-ts="'+tsAttr+'">📄 PDF</button></td></tr>';
      eh+='<tr class="exp-sub" data-gi="'+gi+'" style="display:none"><td></td><td colspan="'+(cfg.headers.length+1)+'">';
      eh+='<table class="rm-subtable rm-sub-rep"><thead><tr>';
      cfg.subHeaders.forEach(function(sh){ eh+='<th>'+esc(sh)+'</th>'; });
      eh+='</tr></thead><tbody>';
      g.sub.forEach(function(srow){ eh+='<tr>'; srow.forEach(function(sc){ eh+='<td>'+esc(sc)+'</td>'; }); eh+='</tr>'; });
      eh+='</tbody></table></td></tr>';
    });
    eh+='</tbody></table>';
    wrap.innerHTML=eh;
    bindSortHeads(wrap, REP_COLS, reportSort, function(){ renderReportTable(cfg); });
    wrap.querySelectorAll('.btn-pdf-row').forEach(function(b){
      b.addEventListener('click', function(e){ e.stopPropagation(); openPdfForReport(this.getAttribute('data-ts')); });
    });
    wrap.querySelectorAll('.exp-main').forEach(function(tr){
      tr.addEventListener('click', function(){
        var gi=this.getAttribute('data-gi');
        var subRow=wrap.querySelector('.exp-sub[data-gi="'+gi+'"]');
        var arrow=this.querySelector('.exp-arrow');
        if(subRow){ var isOpen=subRow.style.display!=='none'; subRow.style.display=isOpen?'none':'table-row'; if(arrow) arrow.textContent=isOpen?'▶':'▼'; this.classList.toggle('open',!isOpen); }
      });
    });
  }
  // render ตารางครูในป๊อปอัป ตามตัวกรอง + เรียงลำดับ + กดขยายดูใบที่ครูส่ง
  // render ตารางวิชาในป๊อปอัป ตามตัวกรอง + เรียงลำดับ + กดขยายดูนักเรียนในวิชา
  function renderSubjectCardTable(cfg){
    var q=(document.getElementById('subjQ').value||'').trim().toLowerCase();
    var tf=document.getElementById('subjTeacher').value;
    var recs=cfg.rawRows.filter(function(r){
      if(tf){ if(((r[COL.tPrefix]||'')+r[COL.tName]).replace(/\s+/g,' ').trim()!==tf) return false; }
      if(q){ var hay=((r[COL.subject]||'')+' '+(r[COL.code]||'')).toLowerCase(); if(hay.indexOf(q)<0) return false; }
      return true;
    });
    var subs=applySortState(buildSubjectGroups(recs), SUB_COLS, subjectSort);
    cardCurrent.csv={ headers:cfg.csvHeaders, rows:subs.map(function(g){ return g.main.slice(); }) };
    var filtered=(q||tf);
    document.getElementById('cardModalTitle').textContent='รายวิชา ('+subs.length+' วิชา)';
    document.getElementById('subjCount').textContent='พบ '+subs.length+' วิชา'+(filtered?' (กรองแล้ว)':'');
    var wrap=document.getElementById('subjTableWrap');
    if(!subs.length){ wrap.innerHTML='<div class="empty-hint">ไม่พบวิชาตามเงื่อนไข</div>'; return; }
    var eh='<table class="rm-table rm-exp"><thead><tr>'+sortHeadHTML(SUB_COLS, subjectSort)+'</tr></thead><tbody>';
    subs.forEach(function(g,gi){
      eh+='<tr class="exp-main" data-gi="'+gi+'"><td class="exp-toggle"><span class="exp-arrow">▶</span></td>';
      g.main.forEach(function(c,ci){
        if(ci===0) eh+='<td data-tip="กดเพื่อดู / ซ่อนนักเรียนในวิชา" style="white-space:normal;overflow-wrap:anywhere;min-width:180px">'+esc(c)+'</td>';
        else if(ci===3) eh+='<td style="white-space:normal;overflow-wrap:anywhere;min-width:160px">'+esc(c)+'</td>';
        else eh+='<td'+(SUB_COLS[ci]&&SUB_COLS[ci].center?' class="num"':'')+'>'+esc(c)+'</td>';
      });
      eh+='</tr>';
      eh+='<tr class="exp-sub" data-gi="'+gi+'" style="display:none"><td></td><td colspan="'+cfg.headers.length+'">';
      eh+='<table class="rm-subtable rm-sub-subj"><thead><tr>';
      cfg.subHeaders.forEach(function(sh){ eh+='<th>'+esc(sh)+'</th>'; });
      eh+='</tr></thead><tbody>';
      g.sub.forEach(function(srow){ eh+='<tr>'; srow.forEach(function(sc){ eh+='<td>'+esc(sc)+'</td>'; }); eh+='</tr>'; });
      eh+='</tbody></table></td></tr>';
    });
    eh+='</tbody></table>';
    wrap.innerHTML=eh;
    bindSortHeads(wrap, SUB_COLS, subjectSort, function(){ renderSubjectCardTable(cfg); });
    wrap.querySelectorAll('.exp-main').forEach(function(tr){
      tr.addEventListener('click', function(){
        var gi=this.getAttribute('data-gi');
        var subRow=wrap.querySelector('.exp-sub[data-gi="'+gi+'"]');
        var arrow=this.querySelector('.exp-arrow');
        if(subRow){ var isOpen=subRow.style.display!=='none'; subRow.style.display=isOpen?'none':'table-row'; if(arrow) arrow.textContent=isOpen?'▶':'▼'; this.classList.toggle('open',!isOpen); }
      });
    });
  }
  function renderTeacherTable(cfg){
    var q=(document.getElementById('teaQ').value||'').trim().toLowerCase();
    var code=document.getElementById('teaCode').value;
    var recs=cfg.rawRows.filter(function(r){
      if(code){ if(String(r[COL.code]||'').replace(/\s+/g,'').trim()!==code) return false; }
      if(q){ var nm=((r[COL.tPrefix]||'')+r[COL.tName]).toLowerCase(); if(nm.indexOf(q)<0) return false; }
      return true;
    });
    var teas=applySortState(buildTeacherGroups(recs), TEA_COLS, teacherSort);
    cardCurrent.csv={ headers:cfg.csvHeaders, rows:teas.map(function(g){ return g.main.slice(); }) };
    var filtered=(q||code);
    document.getElementById('cardModalTitle').textContent='ครูที่ส่งรายงาน ('+teas.length+' คน)';
    document.getElementById('teaCount').textContent='พบ '+teas.length+' คน'+(filtered?' (กรองแล้ว)':'');
    var wrap=document.getElementById('teaTableWrap');
    if(!teas.length){ wrap.innerHTML='<div class="empty-hint">ไม่พบครูตามเงื่อนไข</div>'; return; }
    var eh='<table class="rm-table rm-exp"><thead><tr>'+sortHeadHTML(TEA_COLS, teacherSort)+'</tr></thead><tbody>';
    teas.forEach(function(g,gi){
      eh+='<tr class="exp-main" data-gi="'+gi+'"><td class="exp-toggle"><span class="exp-arrow">▶</span></td>';
      g.main.forEach(function(c,ci){
        if(ci===0) eh+='<td data-tip="กดเพื่อดู / ซ่อนใบที่ครูส่ง">'+esc(c)+'</td>';
        else if(ci===4) eh+='<td style="white-space:normal;overflow-wrap:anywhere;min-width:200px">'+esc(c)+'</td>';
        else eh+='<td'+(TEA_COLS[ci]&&TEA_COLS[ci].center?' class="num"':'')+'>'+esc(c)+'</td>';
      });
      eh+='</tr>';
      eh+='<tr class="exp-sub" data-gi="'+gi+'" style="display:none"><td></td><td colspan="'+cfg.headers.length+'">';
      eh+='<table class="rm-subtable rm-sub-tea"><thead><tr>';
      cfg.subHeaders.forEach(function(sh){ eh+='<th>'+esc(sh)+'</th>'; });
      eh+='</tr></thead><tbody>';
      g.sub.forEach(function(srow){
        eh+='<tr>';
        eh+='<td>'+esc(srow[0])+'</td><td>'+esc(srow[1])+'</td><td>'+esc(srow[2])+'</td><td>'+esc(srow[3])+'</td>';
        eh+='<td><button class="btn-pdf-row" data-ts="'+String(srow[4]).replace(/"/g,'&quot;')+'">📄 PDF</button></td>';
        eh+='</tr>';
      });
      eh+='</tbody></table></td></tr>';
    });
    eh+='</tbody></table>';
    wrap.innerHTML=eh;
    bindSortHeads(wrap, TEA_COLS, teacherSort, function(){ renderTeacherTable(cfg); });
    wrap.querySelectorAll('.btn-pdf-row').forEach(function(b){
      b.addEventListener('click', function(e){ e.stopPropagation(); openPdfForReport(this.getAttribute('data-ts')); });
    });
    wrap.querySelectorAll('.exp-main').forEach(function(tr){
      tr.addEventListener('click', function(){
        var gi=this.getAttribute('data-gi');
        var subRow=wrap.querySelector('.exp-sub[data-gi="'+gi+'"]');
        var arrow=this.querySelector('.exp-arrow');
        if(subRow){ var isOpen=subRow.style.display!=='none'; subRow.style.display=isOpen?'none':'table-row'; if(arrow) arrow.textContent=isOpen?'▶':'▼'; this.classList.toggle('open',!isOpen); }
      });
    });
  }
  function cardExportCSV(){
    if(!cardCurrent) return;
    // การ์ดที่มี csv ละเอียด (เช่น รายชื่อนักเรียน → 1 แถวต่อวิชา) ใช้ชุดนั้น ไม่งั้นใช้ data ปกติ
    var headers = cardCurrent.csv ? cardCurrent.csv.headers : cardCurrent.headers;
    var dataRows = cardCurrent.csv ? cardCurrent.csv.rows : (cardCurrent.data||[]).map(function(r){ return r.slice(0, cardCurrent.headers.length); });
    if(!dataRows.length) return;
    var q=function(v){ v=(v==null?'':String(v)); if(/^[=+\-@\t\r]/.test(v)) v="'"+v; if(/[",\n]/.test(v)) v='"'+v.replace(/"/g,'""')+'"'; return v; };
    var lines=[headers.map(q).join(',')];
    dataRows.forEach(function(row){ lines.push(row.map(q).join(',')); });
    var csv='﻿'+lines.join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob); var a=document.createElement('a');
    a.href=url; a.download=String(cardCurrent.title||'ข้อมูล').replace(/[(),]/g,'').replace(/\s+/g,'_')+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  document.getElementById('cardCloseBtn').addEventListener('click', closeCardModal);
  document.getElementById('cardCsvBtn').addEventListener('click', cardExportCSV);
  // ไม่ผูก backdrop click — ป๊อปอัปปิดได้เฉพาะปุ่มปิด
  // ปุ่มขึ้นบนสุดในป๊อปอัป — โผล่เมื่อเลื่อนลง, กดแล้วเลื่อนขึ้นบนสุด (ใช้ทุกการ์ด เพราะ rm-scroll ตัวเดียว)
  (function(){
    var sc=document.querySelector('#cardModal .rm-scroll'), btn=document.getElementById('cardTopBtn');
    if(sc&&btn){
      sc.addEventListener('scroll', function(){ btn.classList.toggle('show', sc.scrollTop>200); });
      btn.addEventListener('click', function(){ sc.scrollTo({top:0, behavior:'smooth'}); });
    }
  })();
  // ปุ่มขึ้นบนสุดของหน้ารายงานหลัก — โผล่เมื่อเลื่อนหน้าลง, กดแล้วเลื่อนขึ้นสุด (เลื่อนทั้งหน้า/window)
  (function(){
    var btn=document.getElementById('mainTopBtn');
    if(btn){
      var onScroll=function(){ var y=window.scrollY||window.pageYOffset||document.documentElement.scrollTop||0; btn.classList.toggle('show', y>300); };
      window.addEventListener('scroll', onScroll, {passive:true});
      btn.addEventListener('click', function(){ window.scrollTo({top:0, behavior:'smooth'}); });
    }
  })();

  // ล้างตัวกรองในป๊อปอัป (ทุกการ์ด) — รีเซ็ตช่องกรอง + render ใหม่ตามชนิดการ์ด
  function clearPopupFilter(){
    if(!cardCurrent) return;
    var f=document.querySelector('#cardModalBody .stu-filter');
    if(f){ f.querySelectorAll('input').forEach(function(i){ i.value=''; }); f.querySelectorAll('select').forEach(function(s){ s.value=''; }); }
    var rm=document.getElementById('stuRoom'); if(rm){ rm.innerHTML='<option value="">เลือกระดับชั้นก่อน</option>'; rm.disabled=true; }
    // ล้างการตรึง + เรียงกลับค่าเริ่มต้นของการ์ดนั้น
    if(cardCurrent.studentMode){ studentSort={pins:[],active:{key:'cls',dir:1}}; renderStudentTable(cardCurrent); }
    else if(cardCurrent.reportMode){ reportSort={pins:[],active:{key:'date',dir:-1}}; renderReportTable(cardCurrent); }
    else if(cardCurrent.teacherMode){ teacherSort={pins:[],active:null}; renderTeacherTable(cardCurrent); }
    else if(cardCurrent.subjectMode){ subjectSort={pins:[],active:null}; renderSubjectCardTable(cardCurrent); }
  }
  document.getElementById('cardModalBody').addEventListener('click', function(e){
    if(e.target && e.target.closest && e.target.closest('.stu-clear')) clearPopupFilter();
  });
  // หัวตารางในป๊อปอัปตรึงใต้แถบกรอง (ที่ sticky) → ตั้ง --popfh = ความสูงแถบกรอง
  function syncPopupFilterTop(){
    var f=document.querySelector('#cardModalBody .stu-filter');
    if(f && !f.querySelector('.stu-clear')){
      var b=document.createElement('button'); b.type='button'; b.className='stu-clear'; b.textContent='✕ ล้างค่า';
      f.appendChild(b); // ปุ่มล้างค่า (delegated click → clearPopupFilter)
    }
    document.documentElement.style.setProperty('--popfh', (f?f.offsetHeight:0)+'px');
  }
  window.addEventListener('resize', syncPopupFilterTop);

  function renderTable(rows){
    var tb=document.getElementById('tbody');
    if(!rows.length){ tb.innerHTML='<tr><td colspan="13" class="empty-hint">ไม่พบข้อมูลตามเงื่อนไข</td></tr>'; return; }
    var grpIdx=0, prevTs=' '; // จัดกลุ่ม "ใบเดียวกัน" ด้วย timestamp → สลับสีพื้นต่อใบ
    tb.innerHTML=rows.map(function(r){
      var p=num(r[COL.percent]);
      var pCls=(p!=null && p<THRESHOLD)?' class="pct-bad"':'';
      var remark=r[COL.remark]||'';
      var remHtml=remark==='ขาดเรียนนาน' ? '<span class="badge badge-long">ขาดเรียนนาน</span>' : esc(remark);
      var tsRaw=String(r[COL.ts]||'');
      var ts=tsRaw.replace(/"/g,'&quot;');
      var newGrp=(tsRaw!==prevTs); if(newGrp){ grpIdx++; prevTs=tsRaw; }
      var rowCls='rpt-'+(grpIdx%2)+(newGrp?' rpt-top':''); // แถวแรกของใบ = เส้นคั่นบน
      return '<tr class="'+rowCls+'">'+
        '<td>'+esc(fmtDate(r[COL.date]||r[COL.ts]))+'</td>'+
        '<td>'+esc((r[COL.tPrefix]||'')+r[COL.tName])+'</td>'+
        '<td>'+esc(r[COL.subject])+'<div style="font-size:12px;color:#9ca3af">'+esc(r[COL.code])+'</div></td>'+
        '<td style="text-align:center">'+esc(r[COL.seat])+'</td>'+
        '<td style="text-align:center">'+esc(r[COL.sPrefix])+'</td>'+
        '<td>'+esc(r[COL.sName])+'</td>'+
        '<td style="text-align:center">'+esc(r[COL.cls])+'</td>'+
        '<td style="text-align:center">'+esc(r[COL.periods])+'</td>'+
        '<td style="text-align:center">'+esc(r[COL.present])+'</td>'+
        '<td style="text-align:center">'+esc(r[COL.absent])+'</td>'+
        '<td style="text-align:center"'+pCls+'>'+(p!=null?p.toFixed(1):esc(r[COL.percent]))+'</td>'+
        '<td>'+remHtml+'</td>'+
        '<td><button class="btn-pdf-row" data-ts="'+ts+'">📄 PDF</button></td>'+
      '</tr>';
    }).join('');
    tb.querySelectorAll('.btn-pdf-row').forEach(function(b){
      b.addEventListener('click', function(){ openPdfForReport(this.getAttribute('data-ts')); });
    });
    paintPinned(document.querySelector('table.data'), sortState);
  }

  // ====== Export CSV ======
  // mode='all' = ข้อมูลทั้งหมด | mode='filtered' (ค่าเริ่มต้น) = เฉพาะที่กำลังกรองอยู่
  function exportCSV(mode){
    var rows = (mode==='all') ? allRows : applyFilters();
    if(!rows.length){ alert('ไม่มีข้อมูลให้ดาวน์โหลด'); return; }
    var headers=[COL.date,COL.tPrefix,COL.tName,COL.group,COL.code,COL.subject,COL.credits,COL.hours,COL.sem,COL.year,COL.order,COL.seat,COL.sPrefix,COL.sName,COL.cls,COL.periods,COL.present,COL.absent,COL.percent,COL.remark];
    var esc2=function(v){ v=(v==null?'':String(v)); if(/^[=+\-@\t\r]/.test(v)) v="'"+v; /* กันสูตรแฝงใน Excel */ if(/[",\n]/.test(v)) v='"'+v.replace(/"/g,'""')+'"'; return v; };
    var lines=[headers.map(esc2).join(',')];
    rows.forEach(function(r){ lines.push(headers.map(function(h){ return esc2(r[h]); }).join(',')); });
    var csv='﻿'+lines.join('\r\n'); // BOM กันภาษาไทยเพี้ยนใน Excel
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='รายงานนักเรียน_'+(mode==='all'?'ทั้งหมด':'ตามตัวกรอง')+'_'+new Date().toISOString().substr(0,10)+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ====== PDF (sync logic กับ index.html) ======
  var pdfModal=document.getElementById('pdfModal'), printArea=document.getElementById('printArea');
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function thaiDate(iso){
    if(!iso) return 'วันที่ ............ เดือน ........................ พ.ศ. ............';
    var s=String(iso);
    // ISO datetime จากชีต → แปลงเป็นเวลาไทย (+7) ก่อน กัน timezone เพี้ยน -7 ชม. (วันที่ 8 กลายเป็น 7)
    if(s.indexOf('T')>0){
      var dt=new Date(s);
      if(!isNaN(dt.getTime())){ var th=new Date(dt.getTime()+7*3600*1000); return 'วันที่ '+th.getUTCDate()+' เดือน '+(THAI_MONTHS[th.getUTCMonth()+1]||'')+' พ.ศ. '+(th.getUTCFullYear()+543); }
      s=s.split('T')[0];
    }
    var p=s.split('-'); if(p.length<3) return s;
    var y=parseInt(p[0],10)+543, m=parseInt(p[1],10), d=parseInt(p[2],10);
    return 'วันที่ '+d+' เดือน '+(THAI_MONTHS[m]||'')+' พ.ศ. '+y;
  }
  function ob(v){ return(v===''||v==null)?'..........':v; }

  // ⚠️ buildDoc/fitNames ชุดนี้ซ้ำกับใน index.html — ถ้าแก้รูปแบบ PDF ต้องแก้คู่กันทั้ง 2 ไฟล์เสมอ
  function buildDoc(d){
    var rows=d.students.filter(function(s){return s.name;}), bodyHtml='', total=Math.max(MIN_DOC_ROWS,rows.length);
    for(var i=0;i<total;i++){
      var s=rows[i];
      if(s){
        var remStyle='text-align:left;padding-left:6px;'+(s.remark==='ขาดเรียนนาน'?'color:#dc2626;font-weight:700;':'');
        var fullName=(s.prefix||'')+s.name;
        bodyHtml+='<tr><td>'+(i+1)+'</td><td class="od-name" style="font-size:18.6667px;">'+esc(fullName)+'</td><td>'+esc(s.seat)+'</td><td>'+esc(s.classroom)+'</td><td>'+esc(s.periods)+'</td><td>'+esc(s.present)+'</td><td>'+esc(s.absent)+'</td><td>'+esc(s.percent)+'</td><td style="'+remStyle+'">'+esc(s.remark)+'</td></tr>';
      } else {
        bodyHtml+='<tr class="od-empty-row"><td>'+(i+1)+'</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
      }
    }
    var teacherFull=esc((d.teacherPrefix||'')+d.teacherName);
    return ''+
      '<div style="position:relative;text-align:center;margin-bottom:10px;min-height:96px;">'+
        '<div style="position:absolute;top:2px;right:0;text-align:right;font-size:14pt;font-weight:700;line-height:1.4;">โรงเรียนชานุมานวิทยาคม</div>'+
        '<img src="logo.png" style="height:63px;width:auto;display:inline-block;" alt="โลโก้" onerror="this.style.display=\'none\';">'+
        '<div style="font-size:18pt;font-weight:700;line-height:1.35;margin-top:4px;">แบบส่งรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึง '+THRESHOLD+' %</div>'+
      '</div>'+
      '<div class="od-date">'+thaiDate(d.dateInput)+'</div>'+
      '<div class="od-para">ข้าพเจ้า <b>'+esc((d.teacherPrefix||'')+d.teacherName)+'</b> '+
        'กลุ่มสาระการเรียนรู้ <b>'+esc(ob(d.subjectGroup))+'</b> '+
        'ได้รับมอบหมายให้ปฏิบัติหน้าที่สอนในรายวิชา <b>'+esc(ob(d.subjectName))+'</b> '+
        'รหัสวิชา <b>'+esc(ob(d.subjectCode))+'</b> '+
        'เวลาเรียนต่อสัปดาห์ <b>'+esc(ob(d.hoursPerWeek))+'</b> ชั่วโมง '+
        'ประจำภาคเรียนที่ <b>'+esc(ob(d.semester))+'</b> '+
        'ปีการศึกษา <b>'+esc(ob(d.academicYear))+'</b> '+
        'มีนักเรียนเวลาเรียนไม่ถึง '+THRESHOLD+' % ดังต่อไปนี้</div>'+
      '<table class="od-table">'+
        '<colgroup><col style="width:5%"><col style="width:40%"><col style="width:6%"><col style="width:7%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:9%"><col style="width:15%"></colgroup>'+
        '<thead>'+
          '<tr>'+
            '<th rowspan="2">ที่</th><th rowspan="2">ชื่อ – สกุล</th><th rowspan="2" style="white-space:nowrap">เลขที่</th><th rowspan="2">ชั้น/ห้อง</th>'+
            '<th colspan="3">จำนวนชั่วโมง</th>'+
            '<th rowspan="2">%<br/>การเข้าเรียน</th><th rowspan="2">หมายเหตุ</th>'+
          '</tr>'+
          '<tr><th>ทั้งหมด</th><th>มาเรียน</th><th>ขาดเรียน</th></tr>'+
        '</thead>'+
        '<tbody>'+bodyHtml+'</tbody>'+
      '</table>'+
      '<div class="od-sign">'+
        '<div class="intro">จึงเรียนมาเพื่อโปรดพิจารณา</div>'+
        '<div class="sign-block">'+
          '<div>ลงชื่อ................................................</div>'+
          '<div>('+teacherFull+')</div>'+
          '<div>ครูประจำวิชา</div>'+
        '</div>'+
        '<div class="od-sign-clear"></div>'+
      '</div>';
  }

  function fitNames(){
    var cells=printArea.querySelectorAll('td.od-name');
    if(!cells.length) return;
    var cv=fitNames._cv||(fitNames._cv=document.createElement('canvas'));
    var ctx=cv.getContext('2d');
    cells.forEach(function(td){
      td.style.fontSize=NAME_MAX_FS+'px';
      var cs=getComputedStyle(td);
      var padL=parseFloat(cs.paddingLeft)||0, padR=parseFloat(cs.paddingRight)||0;
      var avail=td.clientWidth-padL-padR-2;
      if(avail<=0) return;
      var text=td.textContent||'';
      ctx.font='400 '+NAME_MAX_FS+'px '+cs.fontFamily;
      var w=ctx.measureText(text).width;
      var fs=(w>avail) ? Math.max(NAME_MIN_FS, NAME_MAX_FS*avail/w) : NAME_MAX_FS;
      td.style.fontSize=fs.toFixed(2)+'px';
    });
  }

  // รวมแถวที่ timestamp เดียวกัน = 1 ใบรายงาน แล้วสร้าง PDF
  function openPdfForReport(ts){
    var group=allRows.filter(function(r){ return String(r[COL.ts])===String(ts); });
    if(!group.length) return;
    group.sort(function(a,b){ return (parseInt(a[COL.order],10)||0)-(parseInt(b[COL.order],10)||0); });
    var h=group[0];
    var d={
      dateInput:h[COL.date], teacherPrefix:h[COL.tPrefix], teacherName:h[COL.tName],
      subjectGroup:h[COL.group], subjectCode:h[COL.code], subjectName:h[COL.subject],
      hoursPerWeek:h[COL.hours], semester:h[COL.sem], academicYear:h[COL.year],
      students:group.map(function(r){ return {
        prefix:r[COL.sPrefix], name:r[COL.sName], seat:r[COL.seat], classroom:r[COL.cls],
        periods:r[COL.periods], present:r[COL.present], absent:r[COL.absent],
        percent:r[COL.percent], remark:r[COL.remark]
      }; })
    };
    printArea.innerHTML=buildDoc(d);
    pdfModal.classList.add('show'); document.body.style.overflow='hidden';
    var go=function(){ requestAnimationFrame(function(){ requestAnimationFrame(fitNames); }); };
    if(document.fonts && document.fonts.load){
      Promise.all([ document.fonts.load('400 18px "TH Sarabun New"'), document.fonts.load('400 18px "Sarabun"') ]).then(go).catch(go);
    } else { go(); }
  }
  function closePdf(){ pdfModal.classList.remove('show'); if(!document.getElementById('cardModal').classList.contains('show')) document.body.style.overflow=''; }
  document.getElementById('closePdfBtn').addEventListener('click', closePdf);
  // หน้า PDF ปิดได้เฉพาะปุ่ม "ปิด" เท่านั้น — กดพื้นที่ว่างรอบๆ ไม่ปิด (กันปิดพลาดตอนกำลังดู/พิมพ์)
  document.getElementById('printBtn').addEventListener('click', function(){ window.print(); });

  // ===================================================================
  // เอกสาร "บัญชีรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึงร้อยละ 70" (รวมทุกวิชา/ครู จัดกลุ่มตามระดับชั้น)
  // ปริ้นแยกจากใบรายงานครูเดี่ยว — ใช้ printArea + pdfModal + window.print ชุดเดิม
  // ===================================================================
  function _todayISO(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  // สรุปเงื่อนไขตัวกรองที่ใช้อยู่ในการ์ด → ข้อความกำกับใต้ชื่อเอกสาร (เฉพาะตอน "ปริ้นตามที่กรอง")
  function buildStuFilterDesc(){
    var gv=function(id){ var el=document.getElementById(id); return el?el.value:''; };
    var g=gv('stuGrade'), rm=gv('stuRoom'), pf=gv('stuPrefix'), pc=gv('stuPct'), cd=gv('stuCode'), rk=gv('stuRemark'), q=gv('stuQ');
    var seg=[];   // วลีบรรยายขอบเขต (ขยายคำย่อให้เป็นทางการ)
    if(g && rm) seg.push('ห้องมัธยมศึกษาปีที่ '+g+'/'+rm);
    else if(g) seg.push('ระดับชั้นมัธยมศึกษาปีที่ '+g);
    if(pf) seg.push('คำนำหน้า '+pf);
    if(cd){ var sel=document.getElementById('stuCode'); var lbl=(sel&&sel.selectedOptions&&sel.selectedOptions[0])?sel.selectedOptions[0].textContent:cd; seg.push('รายวิชา '+lbl); }
    if(rk) seg.push('หมายเหตุ '+(rk==='__other__'?'อื่น ๆ':rk));
    if(q) seg.push('ชื่อมีคำว่า “'+q+'”');
    var tail=[];   // เงื่อนไข % เข้าเรียน เชื่อมท้ายด้วย "ซึ่งมีเวลาเรียน..."
    if(pc){ var mp={'0-49':'น้อยกว่าร้อยละ 50','50-59':'ระหว่างร้อยละ 50 ถึง 59','60-69':'ระหว่างร้อยละ 60 ถึง 69','70+':'ตั้งแต่ร้อยละ 70 ขึ้นไป'}; tail.push('มีเวลาเรียน'+(mp[pc]||pc)); }
    if(!seg.length && !tail.length) return '';
    var s='คัดกรองเฉพาะนักเรียน';
    if(seg.length) s+=seg.join(' ');
    if(tail.length) s+=(seg.length?' ซึ่ง':'ที่')+tail.join(' และ');
    return s;
  }
  // สร้าง HTML เอกสาร — groups จาก buildStudentGroups, meta={sems,years,filterDesc,count}
  function buildStudentListDoc(groups, meta){
    meta=meta||{};
    // จัดกลุ่มตามระดับชั้น (level จาก ชั้น/ห้อง = main[2])
    var byLevel={}, levels=[];
    groups.forEach(function(g){
      var lv=parseClass(g.main[2]).level||'อื่นๆ';
      if(!byLevel[lv]){ byLevel[lv]=[]; levels.push(lv); }
      byLevel[lv].push(g);
    });
    levels.sort(function(a,b){ var na=parseInt(a,10), nb=parseInt(b,10); if(isNaN(na)&&isNaN(nb)) return 0; if(isNaN(na)) return 1; if(isNaN(nb)) return -1; return na-nb; });
    // ในแต่ละชั้น เรียงห้อง→เลขที่→ชื่อ (มาตรฐานเอกสาร ไม่อิงการเรียงในตาราง)
    levels.forEach(function(lv){
      byLevel[lv].sort(function(a,b){
        var ra=+parseClass(a.main[2]).room, rb=+parseClass(b.main[2]).room; ra=isNaN(ra)?9999:ra; rb=isNaN(rb)?9999:rb; if(ra!==rb) return ra-rb;
        var sa=+a.main[0], sb=+b.main[0]; sa=isNaN(sa)?9999:sa; sb=isNaN(sb)?9999:sb; if(sa!==sb) return sa-sb;
        return String(a.main[1]).localeCompare(String(b.main[1]),'th');
      });
    });
    var html=''+
      '<div class="sl-head">'+
        '<div class="sl-school">โรงเรียนชานุมานวิทยาคม</div>'+
        '<img src="logo.png" alt="โลโก้" onerror="this.style.display=\'none\';">'+
        '<div class="sl-title">บัญชีรายชื่อนักเรียนที่มีเวลาเรียนไม่ถึงร้อยละ '+THRESHOLD+'</div>'+
      '</div>';
    var sems=meta.sems||[], years=meta.years||[], semTxt='';
    if(sems.length===1 && years.length===1) semTxt='ภาคเรียนที่ '+sems[0]+' ปีการศึกษา '+years[0];
    else if(years.length===1) semTxt='ปีการศึกษา '+years[0];
    if(semTxt) html+='<div class="sl-meta">'+esc(semTxt)+'</div>';
    if(meta.filterDesc) html+='<div class="sl-meta sl-cond">'+esc(meta.filterDesc)+'</div>';
    html+='<div class="sl-asof">ข้อมูล ณ '+thaiDate(_todayISO())+' &nbsp; รวมทั้งสิ้น '+(meta.count||groups.length)+' คน</div>';
    if(!groups.length){ html+='<div class="sl-empty">— ไม่มีรายชื่อนักเรียนตามเงื่อนไข —</div>'; return html; }

    var colg='<colgroup><col style="width:5%"><col style="width:21%"><col style="width:24%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:10%"><col style="width:13%"></colgroup>';
    levels.forEach(function(lv){
      var list=byLevel[lv];
      html+='<div class="sl-grade">ระดับชั้น '+(lv==='อื่นๆ'?'ไม่ระบุ':'ม.'+esc(lv))+' &nbsp;(รวม '+list.length+' คน)</div>';
      html+='<table class="sl-table">'+colg+'<tbody>';
      list.forEach(function(g,gi){
        var fullName=(g.prefix||'')+g.main[1];
        var pctRvm=(g.opNum==null)?'–':(g.main[4]||'–');
        html+='<tr class="sl-stu">'+
          '<td>'+(gi+1)+'</td>'+
          '<td class="sl-name" colspan="2">'+esc(fullName)+'</td>'+
          '<td>'+esc(g.main[2])+'</td>'+
          '<td>เลขที่ '+esc(g.main[0])+'</td>'+
          '<td colspan="2">ขาดเรียน '+g.sub.length+' วิชา</td>'+
          '<td><span class="sl-lbl">% เข้าเรียน(รวม)</span>'+esc(pctRvm)+(pctRvm==='–'?'':' %')+'</td>'+
        '</tr>'+
        '<tr class="sl-subhead"><th></th><th>รายวิชา (รหัส)</th><th>ครูผู้สอน</th><th>คาบทั้งหมด</th><th>มาเรียน</th><th>ขาดเรียน</th><th>% เข้าเรียน</th><th>หมายเหตุ</th></tr>';
        g.sub.forEach(function(s){
          var long=(String(s[6]||'').indexOf('ขาดเรียนนาน')>=0);
          html+='<tr class="sl-sub">'+
            '<td></td>'+
            '<td class="sl-subj">'+esc(s[0])+'</td>'+
            '<td class="sl-tea">'+esc(s[1]||'')+'</td>'+
            '<td>'+esc(s[2]||'')+'</td>'+
            '<td>'+esc(s[3]||'')+'</td>'+
            '<td>'+esc(s[4]||'')+'</td>'+
            '<td>'+esc(s[5]||'')+'</td>'+
            '<td'+(long?' class="sl-long"':'')+'>'+esc(s[6]||'')+'</td>'+
          '</tr>';
        });
      });
      html+='</tbody></table>';
    });
    return html;
  }
  // เปิดเอกสารปริ้น mode='all' (ทุกคน) | 'filtered' (เฉพาะที่กรองในตารางตอนนี้)
  function openStudentListPdf(mode){
    if(!cardCurrent || !cardCurrent.studentMode) return;
    var recs, groups;
    if(mode==='filtered'){ recs=(cardCurrent.lastRecs||[]).slice(); groups=(cardCurrent.lastGroups||[]).slice(); }
    else { recs=(cardCurrent.rawRows||[]).slice(); groups=buildStudentGroups(recs).groups; }
    if(!groups.length){ showToast('ไม่มีรายชื่อให้ปริ้น'); return; }
    var sems=uniq(recs.map(function(r){ return r[COL.sem]; }).filter(Boolean));
    var years=uniq(recs.map(function(r){ return r[COL.year]; }).filter(Boolean));
    var fd=(mode==='filtered')?buildStuFilterDesc():'';
    if(!fd) fd='รวมรายชื่อนักเรียนทุกระดับชั้นทั้งโรงเรียน';   // ทั้งหมด/ไม่ได้กรอง → บอกขอบเขตให้สม่ำเสมอกับตอนกรอง
    printArea.innerHTML=buildStudentListDoc(groups, { sems:sems, years:years, filterDesc:fd, count:groups.length });
    pdfModal.classList.add('show'); document.body.style.overflow='hidden';
  }
  (function(){
    var ba=document.getElementById('stuPrintAllBtn'), bf=document.getElementById('stuPrintFilteredBtn');
    if(ba) ba.addEventListener('click', function(){ openStudentListPdf('all'); });
    if(bf) bf.addEventListener('click', function(){ openStudentListPdf('filtered'); });
  })();