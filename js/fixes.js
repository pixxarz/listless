/* ===================================================================
   fixes.js — ระบบตรวจสอบและแก้ข้อมูลที่กรอกผิด (ชื่อ / ห้อง / วิชา)
   โหลดก่อน report.js · ใช้ผ่าน window.FIXES

   ปัญหาที่แก้ (พบจากข้อมูลจริง 215 แถว):
   1. ชื่อคนเดียวกันเขียนไม่เหมือนกัน  — เคณคูณ/เคนคูณ · ทานะปัด/ทานะปัต · ธีรพงษ์/ธีระพงษ์
   2. คำนำหน้าหลุดเข้าไปในช่องชื่อ     — "นางสาวฉัตรชนก บัวศรี" ทั้งที่ช่องคำนำหน้าเลือกไว้แล้ว
   3. เด็กคนเดียวกันถูกกรอกคนละห้อง    — ครู 4 คนกรอก ม.6/4 แต่ครู 1 คนกรอก ม.6/3
   4. รหัสวิชาพิมพ์ผิด                 — ว311101 (6 หลัก) ที่จริงคือ ว31101

   หลักการ: ระบบแค่ "เสนอ" คนเป็นผู้ตัดสินเสมอ และเลือกพิมพ์ค่าที่ถูกเองได้
   การตัดสินถูกเก็บไว้แล้วเอามาทับข้อมูลตอนแสดงผล — ไม่แตะข้อมูลต้นฉบับในชีต
   =================================================================== */
(function(){

  var COL=null;
  // ตัวคั่นวิชาที่ยังไม่มีรหัส — ใช้ชื่อแทนรหัสโดยเติมหัวไว้กันชนกับรหัสจริง
  var NOCODE='n:';

  /* ---------- ชั้นที่ 1-3 : ทำให้ชื่อเทียบกันได้ ---------- */

  // คำนำหน้าที่ครูมักพิมพ์ติดมาในช่องชื่อ (ทั้งของนักเรียนและครู)
  var PREFIX_RE=/^(เด็กชาย|เด็กหญิง|นางสาว|ด\.ช\.|ด\.ญ\.|น\.ส\.|นาย|นาง)\s*/;

  // ชั้น 1 — ตัดคำนำหน้าที่หลุดเข้ามา + ยุบช่องว่างซ้ำ + ตัดหัวท้าย
  function baseName(s){
    var t=String(s==null?'':s).replace(/\s+/g,' ').trim();
    var prev='';
    while(t!==prev){ prev=t; t=t.replace(PREFIX_RE,'').trim(); } // เผื่อพิมพ์ซ้อนกันหลายชั้น
    return t;
  }
  function hasStuckPrefix(s){ return PREFIX_RE.test(String(s==null?'':s).trim()); }

  // ข้อความดิบที่เก็บอยู่จริง (ยุบช่องว่างซ้ำเท่านั้น ไม่ตัดคำนำหน้า)
  // ต้องเทียบด้วยตัวนี้ ไม่ใช่ baseName มิฉะนั้นเคส "นางสาวฉัตรชนก บัวศรี" กับ "ฉัตรชนก บัวศรี"
  // จะถูกมองว่าเหมือนกันแล้วตั้งแต่แรก ทั้งที่ในชีตยังเก็บต่างกันและยังถูกนับเป็น 2 คน
  function rawName(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim(); }

  // ชั้น 2 — ยุบตัวอักษรที่ออกเสียงเหมือนกันให้เหลือตัวแทนเดียว
  // ภาษาไทยมีตัวที่เสียงเดียวกันแต่เขียนต่างเยอะ ครูคนละคนจึงสะกดชื่อเด็กคนเดียวกันไม่ตรงกัน
  function phonetic(s){
    return String(s==null?'':s)
      .replace(/[ณน]/g,'น').replace(/[ดต]/g,'ด').replace(/[ทธถฐฑฒ]/g,'ท')
      .replace(/[ศษส]/g,'ส').replace(/[ฎฏ]/g,'ฎ').replace(/[ฃข]/g,'ข').replace(/[ฅคฆ]/g,'ค')
      .replace(/[ยญ]/g,'ย').replace(/[ลฬ]/g,'ล').replace(/[บป]/g,'บ').replace(/[ฝฟ]/g,'ฟ')
      .replace(/[่้๊๋์็ั]/g,'')                                   // วรรณยุกต์และไม้ไต่คู้ ตัดทิ้ง
      .replace(/[ิีึื]/g,'ิ').replace(/[ุู]/g,'ุ').replace(/[เแโใไ]/g,'เ') // สระเสียงใกล้กัน ยุบรวม
      .replace(/\s+/g,'');
  }
  function nameKey(s){ return phonetic(baseName(s)); }

  // ชั้น 3 — นับว่าต้องแก้กี่ตัวอักษรถึงจะกลายเป็นอีกคำ (ยิ่งน้อย ยิ่งใกล้)
  function lev(a,b){
    a=String(a); b=String(b);
    if(a===b) return 0;
    if(Math.abs(a.length-b.length)>2) return 99; // ต่างความยาวมาก ไม่ต้องคำนวณให้เปลืองแรง
    var m=a.length,n=b.length,prev=[],cur=[],i,j;
    for(j=0;j<=n;j++) prev[j]=j;
    for(i=1;i<=m;i++){
      cur[0]=i;
      for(j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a.charAt(i-1)===b.charAt(j-1)?0:1));
      prev=cur.slice();
    }
    return prev[n];
  }

  function classLevel(cls){ var m=String(cls||'').match(/ม\.?\s*(\d)/); return m?m[1]:''; }
  function familyName(s){ var p=baseName(s).split(' '); return p.length>1?p.slice(1).join(' '):''; }
  function firstName(s){ return baseName(s).split(' ')[0]||''; }

  /* ---------- ที่เก็บผลการตัดสิน ----------
     ความจริงอยู่ที่แผ่น "แก้ข้อมูล" ในชีต (Code.gs → readFixes / saveFix)
     ทุกเครื่องที่เปิดหน้ารายงานจึงเห็นผลการตรวจชุดเดียวกัน และไม่หายเมื่อล้างเบราว์เซอร์

     เก็บ 3 ชั้น — จำเป็น เพราะการส่งขึ้น Apps Script ต้องใช้ no-cors ซึ่ง "อ่านคำตอบไม่ได้เลย"
     ยิงไปแล้วจึงไม่มีทางรู้จากตัว fetch ว่าถึงชีตจริงไหม (บั๊กเดียวกับที่หน้ากรอกเคยเจอ)
       serverList = สิ่งที่อยู่ในชีตจริง — ได้มาจาก doGet ตอนโหลด/ตอนเช็ครายงานใหม่
       queue      = รายการที่กดแล้วแต่ยังไม่ยืนยันว่าถึงชีต เก็บลงเครื่องด้วยกันหายตอนปิดหน้า
       decisions  = serverList ทับด้วย queue = สิ่งที่หน้าจอเห็น (กดแล้วเห็นผลทันที ไม่ต้องรอเน็ต)
     ยืนยันด้วยการ "อ่านกลับ" (action=fixes) แบบเดียวกับที่หน้ากรอกใช้ action=verify
     ดู docs/spec-code-gs-fixes.md
     ------------------------------------------------- */
  var OLD_KEY='chanu_data_fixes_v1';        // ที่เก็บเดิม (เก็บในเครื่องล้วน) — ย้ายขึ้นชีตให้อัตโนมัติ
  var QUEUE_KEY='chanu_data_fixes_queue_v1';
  var serverList=[];  // [{id,type,action,value,members,title,by,at}] ตามที่อยู่ในชีต
  var queue=[];       // [{id, rec:{...}}] = บันทึก · [{id, remove:true}] = ยกเลิกการตัดสิน
  var decisions=[];   // ผลรวมที่ทุกส่วนของหน้าจอใช้
  var api={ url:'', key:'', ready:false, onRows:null };  // ready=false → Apps Script ที่ deploy ไว้ยังเป็นเวอร์ชันเก่า
  var sync={ busy:false, okAt:0, main:null };
  var mainRows=null;   // แถวชุดล่าสุดที่หน้ารายงานถืออยู่ ใช้คำนวณว่าจะแก้ช่องไหนในแผ่น "รายงาน"

  function storage(){ try{ return window.localStorage; }catch(e){ return null; } }
  function findIn(list,id){ for(var i=0;i<list.length;i++){ if(list[i].id===id) return list[i]; } return null; }

  // ลายเซ็นของการตัดสิน 1 รายการ — ใช้เทียบว่าที่อยู่ในชีตตรงกับที่เพิ่งกดไปหรือยัง
  // ค่าของวิชาเป็น object (ชื่อ+รหัส) จึงต้องแปลงเป็นข้อความก่อนเทียบ · null กับ '' ถือว่าค่าเดียวกัน
  // (ตอนกด "ไม่ต้องแก้" ฝั่งเว็บส่ง null แต่ชีตเก็บเป็นช่องว่าง)
  function valStr(v){ return (v===null||v===undefined)?'':((typeof v==='object')?JSON.stringify(v):String(v)); }
  function sig(d){ return d?(String(d.action||'')+'|'+valStr(d.value)+'|'+(d.members||[]).join('||')):''; }

  function loadQueue(){
    var st=storage(); if(!st) return;
    try{ queue=JSON.parse(st.getItem(QUEUE_KEY)||'[]')||[]; }catch(e){ queue=[]; }
    // ย้ายผลการตัดสินที่ค้างอยู่ในที่เก็บเดิมมาเข้าคิว — ของเดิมยังไม่เคยขึ้นชีตเลยสักรายการ
    try{
      var old=JSON.parse(st.getItem(OLD_KEY)||'[]')||[];
      old.forEach(function(d){ if(d && d.id && !findIn(queue,d.id)) queue.push({ id:d.id, rec:d }); });
      if(old.length) st.removeItem(OLD_KEY);   // ย้ายเข้าคิวแล้ว (คิวก็เก็บในเครื่อง) จึงไม่มีอะไรหาย
    }catch(e){}
    saveQueue();
  }
  function saveQueue(){
    var st=storage(); if(!st) return;
    try{ st.setItem(QUEUE_KEY, JSON.stringify(queue)); }catch(e){}
  }

  // ผลรวมที่หน้าจอเห็น = ของในชีต แล้วเอาคิวทับ (ลบออกถ้าคิวสั่งยกเลิก)
  function rebuild(){
    var out=serverList.filter(function(d){ var q=findIn(queue,d.id); return !q; });
    queue.forEach(function(q){ if(!q.remove && q.rec) out.push(q.rec); });
    decisions=out;
  }
  function setServer(list){ serverList=(list||[]).slice(); rebuild(); }

  // ตัดรายการที่ชีตรับไปแล้วออกจากคิว — เทียบทั้ง id และลายเซ็น กันกรณีชีตยังเป็นค่าเก่า
  function reconcile(){
    queue=queue.filter(function(q){
      var on=findIn(serverList,q.id);
      return q.remove ? !!on : !(on && sig(on)===sig(q.rec));
    });
    saveQueue(); rebuild();
  }

  function findDecision(id){ return findIn(decisions,id); }
  function putDecision(d){ queueUp({ id:d.id, rec:d }); }
  function removeDecision(id){ queueUp({ id:id, remove:true }); }
  function queueUp(q){
    queue=queue.filter(function(x){ return x.id!==q.id; });
    queue.push(q);
    saveQueue(); rebuild();
    if(flushing) dirty=true;   // เผื่อเข้ามาตอนรอบนั้นเลยขั้นส่งไปแล้ว — finish() จะเปิดรอบใหม่ให้
    else flush();
  }

  /* ---------- คุยกับ Apps Script ---------- */
  // JSONP (ขาอ่าน) — เลี่ยง CORS แบบเดียวกับที่หน้ารายงานใช้ดึงข้อมูลหลัก
  // ต้องลองใหม่เมื่อเน็ตสะดุดเหมือนกัน: บนเครื่องจริงเจอคำขอแรกล้มด้วย ERR_NAME_NOT_RESOLVED
  // (เบราว์เซอร์แปลชื่อ script.google.com ไม่ได้ชั่วขณะ) แล้วครั้งถัดมาสำเร็จ
  var FX_TIMEOUT=45000, FX_RETRIES=5;   // จำนวนเท่ากับหน้ารายงาน (ดูเหตุผลใน js/report.js)
  function jsonpGet(params, cb){
    var attempt=0;
    (function go(){
      attempt++;
      jsonpOnce(params, function(d){
        if(d==null && attempt<=FX_RETRIES){ setTimeout(go, Math.min(Math.pow(2, attempt-1)*1000, 4000)); return; }
        cb(d);
      });
    })();
  }
  function jsonpOnce(params, cb){
    var name='__fx'+(new Date().getTime())+'_'+Math.floor(Math.random()*1e9);
    var s=document.createElement('script'), done=false;
    var timer=setTimeout(function(){ if(!done){ done=true; cleanup(); cb(null); } }, FX_TIMEOUT);
    // กันคอนโซลขึ้น "callback is not defined" ตอนข้อมูลกลับมาช้ากว่ากำหนด — รับไว้เงียบ ๆ แล้วทิ้ง
    function cleanup(){ clearTimeout(timer); try{ window[name]=function(){}; }catch(e){} if(s.parentNode) s.parentNode.removeChild(s); }
    window[name]=function(d){ if(done) return; done=true; cleanup(); cb(d); };
    var q=[]; for(var k in params){ q.push(encodeURIComponent(k)+'='+encodeURIComponent(params[k])); }
    q.push('callback='+name);
    s.src=api.url+'?'+q.join('&');
    s.onerror=function(){ if(!done){ done=true; cleanup(); cb(null); } };
    document.body.appendChild(s);
  }
  // ขาเขียน — no-cors ส่งได้แต่อ่านผลไม่ได้ จึงต้องไปยืนยันด้วยการอ่านกลับเสมอ
  function post(body, cb){
    var opts={ method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(body) };
    var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
    var tm=null;
    if(ctrl){ opts.signal=ctrl.signal; tm=setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, 20000); }
    fetch(api.url, opts).then(function(){ if(tm) clearTimeout(tm); cb(); }, function(){ if(tm) clearTimeout(tm); cb(); });
  }
  // ห่อรายการในคิวเป็น payload — ตัวรายการต้องอยู่ใน fix ไม่ใช่ระดับบนสุด
  // เพราะระดับบนสุดใช้ช่อง action บอกชนิดคำสั่ง (savefix) ส่วนในรายการ action คือ merge/ignore
  function payload(q){
    var fix=q.remove ? { id:q.id, remove:true } : q.rec;
    return { action:'savefix', key:api.key, fix:fix };
  }

  /* ---------- แก้ข้อมูลในแผ่น "รายงาน" จริง ----------
     ชีตหลักคือของที่ครูเอาไปทำงานต่อ ไม่ใช่แค่ให้หน้าเว็บสวย จึงต้องแก้ลงไปจริง
     ส่งเป็น "รายการช่อง" (แถว + ชื่อคอลัมน์ + ค่าเดิม + ค่าใหม่) ไม่ใช่สั่งลอยๆ
     🚨 ค่าเดิมที่ส่งไปคือด่านกันพลาด — หลังบ้านจะเขียนต่อเมื่อช่องนั้นยังเป็นค่าเดิมอยู่จริง
     ค่าเดิมถูกเก็บไว้ที่แผ่น "ค่าเดิม" (คนละแผ่นกับรายงาน) จึงกดย้อนได้
     ------------------------------------------------- */
  // ค่าที่อยู่ในชีตจริง — แถวบนจอถูกทับด้วยผลการตัดสินไปแล้ว ต้องย้อนดูค่าก่อนทับที่เก็บไว้ที่ _orig*
  function origName(r){ return r._origName!=null?String(r._origName):sName(r); }
  function origCls(r){ return r._origCls!=null?String(r._origCls):cls(r); }
  function origTeacher(r){
    if(r._origTeacher!=null){
      var s=String(r._origTeacher), m=s.match(PREFIX_RE);
      return { prefix:m?m[1]:'', name:s.replace(PREFIX_RE,'').trim(), full:rawName(s) };
    }
    return { prefix:String(r[COL.tPrefix]||''), name:String(r[COL.tName]||''), full:rawName(tName(r)) };
  }
  function origSubject(r){
    if(r._origSubject!=null){
      var m=String(r._origSubject).match(/^(.*)\s\(([^)]*)\)$/);
      if(m) return { name:m[1], code:m[2] };
    }
    return { name:subjName(r), code:code(r) };
  }

  function mainEdits(rows, d){
    var out=[];
    if(!COL || !rows || !rows.length || !d || d.action!=='merge') return out;
    rows.forEach(function(r){
      var rw=r._row; if(!rw) return;   // หลังบ้านเวอร์ชันเก่าไม่ส่งเลขแถวมา ข้ามไปดีกว่าเขียนมั่ว
      if(d.type==='name'){
        var cur=origName(r);
        if(d.members.indexOf(rawName(cur))>=0 && cur!==d.value)
          out.push({ row:rw, col:COL.sName, from:cur, to:d.value });
      } else if(d.type==='teacher'){
        var t=origTeacher(r);
        if(d.members.indexOf(t.full)>=0 && t.full!==d.value){
          // ค่าที่เลือกเป็น "คำนำหน้า+ชื่อ" รวมกัน ต้องแยกกลับลง 2 ช่องตามโครงสร้างชีต
          var m=String(d.value).match(PREFIX_RE);
          var np=m?m[1]:'', nn=String(d.value).replace(PREFIX_RE,'').trim();
          if(t.prefix!==np) out.push({ row:rw, col:COL.tPrefix, from:t.prefix, to:np });
          if(t.name!==nn)   out.push({ row:rw, col:COL.tName,   from:t.name,   to:nn });
        }
      } else if(d.type==='room'){
        // ห้องผูกกับตัวนักเรียน เทียบด้วยคีย์เสียง — เช็คทั้งชื่อบนจอและชื่อในชีต เผื่อชื่อถูกทับไปแล้ว
        var oc=origCls(r);
        if((d.members.indexOf(nameKey(sName(r)))>=0 || d.members.indexOf(nameKey(origName(r)))>=0) && oc!==d.value)
          out.push({ row:rw, col:COL.cls, from:oc, to:d.value });
      } else if(d.type==='subject'){
        if(!d.value || typeof d.value!=='object') return;
        var s=origSubject(r);
        var hit=(d.members.indexOf(s.code)>=0) || (d.members.indexOf(NOCODE+s.name)>=0);
        if(!hit) return;
        if(s.name!==d.value.name) out.push({ row:rw, col:COL.subject, from:s.name, to:d.value.name });
        if(s.code!==d.value.code) out.push({ row:rw, col:COL.code,    from:s.code, to:d.value.code });
      }
    });
    return out;
  }

  // นับแถวที่ถูกกระทบ (1 แถวอาจมีหลายช่อง เช่นวิชาแก้ทั้งชื่อและรหัส)
  function editRowCount(edits){
    var s={},n=0;
    edits.forEach(function(e){ if(!s[e.row]){ s[e.row]=1; n++; } });
    return n;
  }

  function applyMain(d, done){
    var edits=mainEdits(mainRows, d);
    if(!api.ready || !edits.length){ if(done) done(0, edits.length); return; }
    sync.main={ busy:true, bad:false, msg:'กำลังแก้ข้อมูลในแผ่นรายงาน...' }; paintSync();
    post({ action:'applymain', key:api.key, fixId:d.id, title:d.title||'', by:d.by||'', edits:edits },
      function(){ verifyMain(edits, 0, done); });
  }
  // ยิงแบบ no-cors อ่านผลไม่ได้ จึงดึงข้อมูลกลับมาดูเองว่าช่องนั้นเปลี่ยนจริงไหม
  function verifyMain(edits, round, done){
    jsonpGet({ key:api.key }, function(res){
      var rows=(res && res.result==='OK' && res.rows) ? res.rows : null;
      if(!rows){
        if(round>=2){ sync.main={ busy:false, bad:true, msg:'ตรวจผลการแก้แผ่นรายงานไม่ได้ ลองรีเฟรชหน้า' }; paintSync(); if(done) done(0, edits.length); return; }
        setTimeout(function(){ verifyMain(edits, round+1, done); }, 1500*(round+1)); return;
      }
      var byRow={};
      rows.forEach(function(r){ if(r._row) byRow[r._row]=r; });
      var left=edits.filter(function(e){
        var r=byRow[e.row];
        if(!r) return false;   // แถวนั้นไม่อยู่แล้ว (ครูกดส่งใบเดิมซ้ำ) ไม่นับว่าค้าง
        return String(r[e.col]==null?'':r[e.col])!==String(e.to);
      });
      if(left.length && round<2){ setTimeout(function(){ verifyMain(edits, round+1, done); }, 1500*(round+1)); return; }
      sync.main={ busy:false, bad:!!left.length,
        msg: left.length ? ('แก้ในแผ่นรายงานไม่ครบ เหลือ '+left.length+' ช่อง กดปุ่มแก้ซ้ำอีกครั้งได้')
                         : ('แก้ในแผ่นรายงานแล้ว '+edits.length+' ช่อง') };
      paintSync();
      if(api.onRows) api.onRows(rows, res.fixes);   // ให้หน้ารายงานอัปเดตตารางตามข้อมูลใหม่
      if(done) done(edits.length-left.length, edits.length);
    });
  }

  // ย้อนกลับ — หลังบ้านอ่านจากแผ่น "ค่าเดิม" เอง ฝั่งนี้แค่สั่งแล้วดึงข้อมูลใหม่มาแสดง
  function undoMain(id, done){
    if(!api.ready){ if(done) done(); return; }
    sync.main={ busy:true, bad:false, msg:'กำลังย้อนข้อมูลในแผ่นรายงาน...' }; paintSync();
    post({ action:'undomain', key:api.key, fixId:id }, function(){
      setTimeout(function(){
        jsonpGet({ key:api.key }, function(res){
          var ok=(res && res.result==='OK' && res.rows);
          sync.main={ busy:false, bad:!ok, msg: ok?'ย้อนข้อมูลในแผ่นรายงานแล้ว':'ตรวจผลการย้อนไม่ได้ ลองรีเฟรชหน้า' };
          paintSync();
          if(ok && api.onRows) api.onRows(res.rows, res.fixes);
          if(done) done();
        });
      }, 1200);
    });
  }

  var flushing=false, dirty=false;
  function qKey(q){ return q.id+'|'+(q.remove?'ลบ':sig(q.rec)); }
  function flush(){
    if(!api.ready || flushing || !queue.length) { paintSync(); return; }
    flushing=true; dirty=false; sync.busy=true; paintSync();
    // ไล่ส่งจากคิวตัวจริง ไม่ใช่สำเนา — รายการที่เพิ่งกดเพิ่มระหว่างรอบนี้จะถูกส่งไปด้วยเลย
    // (โหมดแก้เองกดครั้งเดียวได้ทั้งชื่อและห้อง ถ้าใช้สำเนาจะไปแค่ตัวแรก อีกตัวค้างรอรอบหน้า)
    var sent={};
    (function next(){
      var q=null;
      for(var i=0;i<queue.length;i++){ if(!sent[qKey(queue[i])]){ q=queue[i]; break; } }
      if(!q){ verify(0); return; }
      sent[qKey(q)]=1;
      post(payload(q), next);
    })();
    // ชีตเขียนเสร็จช้ากว่าตอนที่ fetch คืนค่า (แถมมีคิวรอ lock) — อ่านกลับซ้ำได้ถึง 3 รอบก่อนยอมแพ้
    function verify(round){
      jsonpGet({ action:'fixes', key:api.key }, function(d){
        if(d && d.result==='OK' && Object.prototype.toString.call(d.fixes)==='[object Array]'){
          setServer(d.fixes); reconcile();
        }
        if(!queue.length || round>=2){ finish(); return; }
        setTimeout(function(){ verify(round+1); }, 1500*(round+1));
      });
    }
    function finish(){
      flushing=false; sync.busy=false;
      if(!queue.length) sync.okAt=new Date().getTime();
      paintSync();
      if(dirty && queue.length){ dirty=false; flush(); }   // มีรายการเข้ามาระหว่างรอบที่แล้ว ส่งต่อให้จบ
    }
  }

  /* ---------- ตัวช่วยอ่านค่าในแถว ---------- */
  function sName(r){ return String(r[COL.sName]||''); }
  // ต่อคำนำหน้ากับชื่อแบบเดียวกับที่หน้ารายงานใช้ (ต่อตรงๆ ไม่เว้นวรรค) ผลนับจึงตรงกัน
  function tName(r){ return String((r[COL.tPrefix]||'')+(r[COL.tName]||'')).replace(/\s+/g,' ').trim(); }
  function tNameOnly(r){ return String(r[COL.tName]||''); }
  function cls(r){ return String(r[COL.cls]||''); }
  function code(r){ return String(r[COL.code]||'').replace(/\s+/g,'').trim(); }
  function subjName(r){ return String(r[COL.subject]||'').replace(/\s+/g,' ').trim(); }
  function subjKey(r){ return code(r) || (NOCODE+subjName(r)); }
  function ticket(r){ return String(r[COL.ts]||''); }

  // นับจำนวนใบ (การกรอก 1 ครั้ง = 1 ใบ) ไม่ใช่นับจำนวนแถว เพราะใบเดียวมีเด็กหลายคน
  function countTickets(rows){
    var s={},n=0;
    rows.forEach(function(r){ var t=ticket(r); if(t && !s[t]){ s[t]=1; n++; } });
    return n;
  }
  function teacherList(rows){
    var s={},o=[];
    rows.forEach(function(r){ var t=tName(r); if(t && !s[t]){ s[t]=1; o.push(t); } });
    return o;
  }

  /* ---------- ตัวตรวจจับ ---------- */

  // จัดกลุ่มแถวตามคีย์ที่คำนวณได้
  function groupBy(rows, fn){
    var m={},order=[];
    rows.forEach(function(r){ var k=fn(r); if(k==null||k==='') return; if(!m[k]){ m[k]=[]; order.push(k); } m[k].push(r); });
    return { map:m, order:order };
  }

  // เรียงตัวเลือกจากที่มีหลักฐานมากสุดไปน้อยสุด — ดูจำนวนใบก่อน ถ้าเท่ากันดูจำนวนแถว
  function sortOptions(a,b){ return (b.tickets-a.tickets) || (b.rows-a.rows); }

  // ---- ชื่อคน (ใช้ได้ทั้งนักเรียนและครู) ----
  // จับ 2 แบบ: (ก) คีย์เสียงตรงกันแต่เขียนต่าง  (ข) คีย์ต่างกันแต่ห่างกันแค่ 1-2 ตัว และอยู่ชั้นเดียวกัน
  function detectNames(rows, kind){
    // ครู: เทียบด้วยคำนำหน้า+ชื่อรวมกัน เพราะหน้ารายงานนับครูจาก 2 ช่องนี้ต่อกัน
    // "นางสุมาลี สัตปานนท์" กับ "นายสุมาลี สัตปานนท์" จึงถูกนับเป็นคนละคน ทั้งที่ชื่อในช่องเดียวกันเป๊ะ
    var getName=(kind==='teacher')?tName:sName;
    var items=[];

    // (ก) เสียงตรงกัน
    var g=groupBy(rows, function(r){ return nameKey(getName(r)); });
    var variantOfKey={};
    g.order.forEach(function(k){
      var list=g.map[k];
      var byText=groupBy(list, function(r){ return rawName(getName(r)); });
      variantOfKey[k]=byText.order;
      if(byText.order.length<2) return;
      items.push(makeNameItem(kind, byText, 'high', 'ออกเสียงเหมือนกัน ต่างที่ตัวสะกด'));
    });

    // (ข) ต่างกัน 1-2 ตัว และอยู่ชั้นเดียวกัน (นักเรียน) หรือกลุ่มสาระเดียวกัน (ครู)
    var keys=g.order;
    for(var i=0;i<keys.length;i++){
      for(var j=i+1;j<keys.length;j++){
        var ka=keys[i], kb=keys[j];
        var d=lev(ka,kb);
        if(d<1 || d>2) continue;
        var la=g.map[ka], lb=g.map[kb];
        if(kind==='student'){
          // ต้องอยู่ระดับชั้นเดียวกัน ไม่งั้นเป็นคนละคนที่ชื่อบังเอิญคล้ายกัน
          if(classLevel(cls(la[0]))!==classLevel(cls(lb[0]))) continue;
          // นามสกุลต้องเหมือนกัน มิฉะนั้นเป็นคนละคน (เช่น ฐิติกร กับ ณัฎฐภัทร จันทร์มลต์ = พี่น้อง)
          if(phonetic(familyName(getName(la[0])))!==phonetic(familyName(getName(lb[0])))) continue;
          // ชื่อตัวต้องใกล้กันด้วย ไม่ใช่ต่างกันคนละชื่อ (กันเคสพี่น้อง ธนภัทร/ศศิธร กุระจินดา)
          if(lev(phonetic(firstName(getName(la[0]))), phonetic(firstName(getName(lb[0]))))>2) continue;
        }
        var merged={ map:{}, order:[] };
        [ka,kb].forEach(function(k){
          (variantOfKey[k]||[]).forEach(function(txt){
            merged.order.push(txt);
            merged.map[txt]=g.map[k].filter(function(r){ return rawName(getName(r))===txt; });
          });
        });
        items.push(makeNameItem(kind, merged, 'medium', 'ชื่อต่างกัน '+d+' ตัวอักษร และอยู่ชั้นเดียวกัน'));
      }
    }
    return items;
  }

  function makeNameItem(kind, byText, level, reason){
    var opts=byText.order.map(function(txt){
      var list=byText.map[txt];
      // นักเรียน: ดูว่ามีคำนำหน้าติดมาในช่องชื่อไหม (ครูไม่ต้องดู เพราะรวมคำนำหน้ามาตั้งแต่ต้นอยู่แล้ว)
      var stuck=(kind==='teacher')?false:hasStuckPrefix(list[0][COL.sName]);
      return { value:txt, tickets:countTickets(list), rows:list.length, teachers:teacherList(list), stuck:stuck };
    }).sort(function(a,b){
      if(a.stuck!==b.stuck) return a.stuck?1:-1;   // ชื่อที่มีคำนำหน้าติดมา ไม่ควรถูกเสนอเป็นค่าที่ถูก
      return sortOptions(a,b);
    });
    if(opts.some(function(o){ return o.stuck; })) reason='มีคำนำหน้าติดมาในช่องชื่อ ทำให้ถูกนับเป็นคนละคน';
    // ครูคนเดียวกันแต่เลือกคำนำหน้าไม่ตรงกัน — ชื่อหลังตัดคำนำหน้าออกจะเหมือนกันเป๊ะ
    else if(kind==='teacher' && byText.order.length>1 &&
            baseName(byText.order[0])===baseName(byText.order[1])) reason='ชื่อครูตรงกัน แต่เลือกคำนำหน้าไม่ตรงกัน จึงถูกนับเป็นครู 2 คน';
    var members=byText.order.slice().sort();
    return {
      id:(kind==='teacher'?'teacher:':'name:')+members.join('||'),
      type:(kind==='teacher'?'teacher':'name'),
      level:level,
      reason:reason,
      title:opts[0].value,
      cls:(kind==='student'? cls(byText.map[byText.order[0]][0]) : ''),
      options:opts,
      members:members
    };
  }

  // ---- ห้องของนักเรียน ----
  // เด็กคนเดียวกัน (เทียบด้วยคีย์เสียง) ถูกกรอกมากกว่า 1 ห้อง = มีใบใดใบหนึ่งกรอกผิด
  function detectRooms(rows){
    var items=[];
    var g=groupBy(rows, function(r){ return nameKey(sName(r)); });
    g.order.forEach(function(k){
      var list=g.map[k];
      var byRoom=groupBy(list, function(r){ return cls(r); });
      if(byRoom.order.length<2) return;
      var opts=byRoom.order.map(function(rm){
        var l=byRoom.map[rm];
        return { value:rm, tickets:countTickets(l), rows:l.length, teachers:teacherList(l) };
      }).sort(sortOptions);
      items.push({
        id:'room:'+k,
        type:'room',
        level:(opts[0].tickets>opts[1].tickets)?'high':'medium', // เสียงข้างมากชัด = มั่นใจสูง
        reason:(opts[0].tickets>opts[1].tickets)
          ? ('ครู '+opts[0].tickets+' คนกรอกตรงกันว่า '+opts[0].value+' มีเพียง '+opts[1].tickets+' ใบที่ต่างออกไป')
          : 'ถูกกรอกคนละห้อง จำนวนใบเท่ากัน ตัดสินจากหลักฐานในระบบไม่ได้',
        title:baseName(sName(list[0])),
        options:opts,
        members:[nameKey(sName(list[0]))]
      });
    });
    return items;
  }

  // ---- ใบที่น่าจะกรอกห้องผิดทั้งใบ ----
  // ถ้าใบเดียวกันมีเด็กที่ห้องไม่ตรงกับครูคนอื่นหลายคน แปลว่าครูกรอกผิดยกใบ ไม่ใช่พิมพ์พลาดรายคน
  function detectTicketRoomIssues(roomItems, rows){
    var byTicket={};
    roomItems.forEach(function(it){
      if(it.options.length<2 || it.options[0].tickets<=it.options[1].tickets) return;
      var right=it.options[0].value;
      it.options.slice(1).forEach(function(op){
        rows.forEach(function(r){
          if(nameKey(sName(r))!==it.members[0] || cls(r)!==op.value) return;
          var t=ticket(r);
          if(!byTicket[t]) byTicket[t]={ ts:t, teacher:tName(r), subject:subjName(r), code:code(r), students:[] };
          byTicket[t].students.push({ name:baseName(sName(r)), from:op.value, to:right });
        });
      });
    });
    return Object.keys(byTicket).map(function(t){ return byTicket[t]; }).filter(function(x){ return x.students.length>=2; });
  }

  // ---- วิชา ----
  // ยึด "รหัสวิชา" เป็นตัวตัดสิน เพราะชื่อวิชาซ้ำข้ามระดับชั้นได้เป็นเรื่องปกติ
  // (ภาษาอังกฤษ 5 มีทั้ง อ23101 ของ ม.3 และ อ33101 ของ ม.6 — คนละวิชากันจริง ห้ามรวม)
  var CODE_OK=/^[ก-ฮ]\d{5}$/;   // รูปแบบมาตรฐาน: อักษรไทย 1 ตัว + เลข 5 หลัก
  function detectSubjects(rows){
    var items=[];

    // (ก) ชื่อวิชาเดียวกัน แต่รหัสต่างกัน — เสนอเฉพาะเมื่อรหัสหนึ่งผิดรูปแบบ หรือรหัสใกล้กันมาก
    var byName=groupBy(rows, function(r){ return subjName(r); });
    byName.order.forEach(function(nm){
      var list=byName.map[nm];
      var byCode=groupBy(list, function(r){ return code(r); });
      if(byCode.order.length<2) return;
      var bad=byCode.order.filter(function(c){ return c && !CODE_OK.test(c); });
      // 🚨 เสนอเฉพาะเมื่อมีรหัส "ผิดรูปแบบ" เท่านั้น
      // ห้ามใช้เกณฑ์ "ต่างกัน 1 ตัว" กับรหัสวิชาเด็ดขาด เพราะหลักที่ 2-3 ของรหัสคือระดับชั้น
      // อ23101 (ม.3) กับ อ33101 (ม.6) ต่างกัน 1 ตัวและชื่อวิชาเหมือนกัน แต่เป็นคนละวิชาจริง
      // เช่นเดียวกับ ศ22101 (ม.2) กับ ศ23101 (ม.3) — รวมเข้าด้วยกันคือทำข้อมูลพัง
      if(!bad.length) return;
      var opts=byCode.order.map(function(c){
        var l=byCode.map[c];
        return { value:{name:nm, code:c}, label:nm+' ('+c+')', tickets:countTickets(l), rows:l.length, badFormat:!!(c && !CODE_OK.test(c)) };
      }).sort(sortOptions);
      items.push({
        id:'subject:'+byCode.order.slice().sort().join('||'),
        type:'subject',
        level:bad.length?'high':'medium',
        reason:'รหัส '+bad.join(', ')+' ผิดรูปแบบ ควรเป็นอักษรไทย 1 ตัวตามด้วยเลข 5 หลัก',
        title:nm,
        options:opts,
        members:byCode.order.slice()
      });
    });

    // (ข) รหัสเดียวกัน แต่ชื่อวิชาเขียนไม่ตรงกัน
    var byCode2=groupBy(rows, function(r){ return code(r); });
    byCode2.order.forEach(function(c){
      if(!c) return;
      var list=byCode2.map[c];
      var byNm=groupBy(list, function(r){ return subjName(r); });
      if(byNm.order.length<2) return;
      var opts=byNm.order.map(function(nm){
        var l=byNm.map[nm];
        return { value:{name:nm, code:c}, label:nm+' ('+c+')', tickets:countTickets(l), rows:l.length, badFormat:false };
      }).sort(sortOptions);
      items.push({
        id:'subject:code:'+c,
        type:'subject',
        level:'medium',
        reason:'รหัสวิชาเดียวกัน แต่ชื่อวิชาเขียนไม่ตรงกัน',
        title:c,
        options:opts,
        members:[c]
      });
    });

    return items;
  }

  /* ---------- รวมผลการตรวจ ---------- */
  function detect(rows){
    if(!COL) return { items:[], tickets:[], counts:{} };
    var items=[]
      .concat(detectNames(rows,'student'))
      .concat(detectNames(rows,'teacher'))
      .concat(detectRooms(rows))
      .concat(detectSubjects(rows));

    // ตัดรายการซ้ำ (คีย์เดียวกันอาจถูกจับได้จาก 2 ทาง)
    var seen={}, uniq=[];
    items.forEach(function(it){ if(seen[it.id]) return; seen[it.id]=1; uniq.push(it); });

    // แนบสถานะการตัดสินที่บันทึกไว้แล้ว
    uniq.forEach(function(it){ it.decision=findDecision(it.id); });

    var pending=uniq.filter(function(it){ return !it.decision; });
    var counts={
      total:uniq.length,
      pending:pending.length,
      name:pending.filter(function(i){ return i.type==='name'; }).length,
      teacher:pending.filter(function(i){ return i.type==='teacher'; }).length,
      room:pending.filter(function(i){ return i.type==='room'; }).length,
      subject:pending.filter(function(i){ return i.type==='subject'; }).length
    };
    return { items:uniq, tickets:detectTicketRoomIssues(uniq.filter(function(i){return i.type==='room';}), rows), counts:counts };
  }

  /* ---------- เอาผลการตัดสินมาทับข้อมูล ----------
     เรียกหลัง normalizeRows ทุกครั้งที่ดึงข้อมูลมาใหม่
     เขียนทับค่าในแถวเลย เพื่อให้ทุกส่วนของหน้ารายงาน (การ์ด กราฟ ตาราง CSV) เห็นค่าที่แก้แล้วเหมือนกันหมด
     ค่าเดิมถูกเก็บไว้ที่ _orig* เผื่อต้องอ้างอิงย้อนกลับ · ข้อมูลในชีตไม่ถูกแตะ
     ------------------------------------------------- */
  // คืนค่าเดิมก่อนทับใหม่ทุกครั้ง — ทำให้เรียก apply ซ้ำได้เรื่อยๆ และยกเลิกการตัดสินแล้วข้อมูลกลับเป็นเดิมทันที
  function restore(rows){
    rows.forEach(function(r){
      if(r._origName!=null){ r[COL.sName]=r._origName; delete r._origName; }
      if(r._origTeacher!=null){
        var m=String(r._origTeacher).match(PREFIX_RE);
        r[COL.tPrefix]=m?m[1]:''; r[COL.tName]=String(r._origTeacher).replace(PREFIX_RE,'').trim();
        delete r._origTeacher;
      }
      if(r._origCls!=null){ r[COL.cls]=r._origCls; delete r._origCls; }
      if(r._origSubject!=null){
        var s=String(r._origSubject).match(/^(.*)\s\(([^)]*)\)$/);
        if(s){ r[COL.subject]=s[1]; r[COL.code]=s[2]; }
        delete r._origSubject;
      }
      delete r._fixed;
    });
  }

  function apply(rows){
    if(!COL || !rows || !rows.length) return rows;
    mainRows=rows;   // จำไว้ใช้ตอนคำนวณช่องที่ต้องแก้ในแผ่น "รายงาน"
    restore(rows);
    var merges=decisions.filter(function(d){ return d.action==='merge'; });
    if(!merges.length) return rows;

    rows.forEach(function(r){
      merges.forEach(function(d){
        if(d.type==='name'){
          if(d.members.indexOf(rawName(sName(r)))>=0 && sName(r)!==d.value){
            r._origName=r._origName||sName(r); r[COL.sName]=d.value; r._fixed=true;
          }
        } else if(d.type==='teacher'){
          // ค่าที่เลือกเป็น "คำนำหน้า+ชื่อ" รวมกัน ต้องแยกกลับลง 2 ช่องตามโครงสร้างชีต
          if(d.members.indexOf(rawName(tName(r)))>=0 && rawName(tName(r))!==d.value){
            var m=String(d.value).match(PREFIX_RE);
            r._origTeacher=r._origTeacher||tName(r);
            r[COL.tPrefix]=m?m[1]:'';
            r[COL.tName]=String(d.value).replace(PREFIX_RE,'').trim();
            r._fixed=true;
          }
        } else if(d.type==='room'){
          if(d.members.indexOf(nameKey(sName(r)))>=0 && cls(r)!==d.value){
            r._origCls=r._origCls||cls(r); r[COL.cls]=d.value; r._fixed=true;
          }
        } else if(d.type==='subject'){
          // ค่าของวิชาต้องเป็น object (ชื่อ+รหัส) เสมอ — ถ้าหลังบ้านคืนมาเป็นข้อความแสดงว่าอ่านค่าผิดรูป ข้ามไป ดีกว่าเขียนทับข้อมูลให้พัง
          if(!d.value || typeof d.value!=='object') return;
          var hit=(d.members.indexOf(code(r))>=0) || (d.members.indexOf(NOCODE+subjName(r))>=0);
          if(hit && (subjName(r)!==d.value.name || code(r)!==d.value.code)){
            r._origSubject=r._origSubject||(subjName(r)+' ('+code(r)+')');
            r[COL.subject]=d.value.name; r[COL.code]=d.value.code; r._fixed=true;
          }
        }
      });
    });
    return rows;
  }

  /* ---------- หน้าจอตรวจสอบข้อมูล ---------- */
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  var LABEL={ name:'ชื่อนักเรียน', teacher:'ชื่อครู', room:'ห้องเรียน', subject:'รายวิชา' };
  var BADGE={ name:'ชื่อเขียนต่างกัน', teacher:'ชื่อครูซ้ำ', room:'ห้องไม่ตรงกัน', subject:'รหัสวิชาน่าจะผิด' };

  function optLabel(o){ return (o.value && typeof o.value==='object')?o.label:o.value; }
  function optNote(o){
    // ห้ามใช้คำว่า "ใบ" — เป็นศัพท์ในหัวคนทำระบบ ครูที่มาเจอครั้งแรกไม่รู้ว่าหมายถึงอะไร
    var n=[];
    if(o.teachers && o.teachers.length) n.push('ครู '+o.teachers.length+' คนกรอกแบบนี้');
    else n.push('พบ '+o.tickets+' ครั้ง');
    if(o.stuck) n.push('มีคำนำหน้าติดมาในชื่อ');
    if(o.badFormat) n.push('รหัสผิดรูปแบบ');
    return n.join(' · ');
  }

  /* ---------- ไฮไลต์ตัวอักษรที่ต่างกัน ----------
     🚨 นี่คือหัวใจของการ์ดนี้ ไม่ใช่ของประดับ
     เคสจริงต่างกันแค่ตัวเดียว — "พิมพะวงศ์" กับ "พิมพะวงศ" ต่างกันที่ไม้ทัณฑฆาตตัวเดียว
     ถ้าไม่ทำเครื่องหมายไว้ ครูมองด้วยตาเปล่าไม่มีทางเห็น แล้วจะกดเลือกโดยไม่รู้ว่าเลือกอะไรอยู่
     ------------------------------------------------- */
  // สระบนล่างและวรรณยุกต์ไทย — ลอยเดี่ยวไม่ได้ ต้องเกาะตัวพยัญชนะข้างหน้าเสมอ
  var THAI_MARK=/[ัิ-ฺ็-๎]/;
  function diffHTML(a, b){
    a=String(a==null?'':a); b=String(b==null?'':b);
    if(!b || a===b) return esc(a);
    var m=a.length, n=b.length, i, j;
    // ตารางความยาวลำดับตัวอักษรร่วมที่ยาวที่สุด (LCS) — ตัวที่ไม่อยู่ใน LCS คือตัวที่ต่าง
    var dp=[]; for(i=0;i<=m;i++){ dp.push([]); for(j=0;j<=n;j++) dp[i][j]=0; }
    for(i=1;i<=m;i++) for(j=1;j<=n;j++)
      dp[i][j]=(a.charAt(i-1)===b.charAt(j-1)) ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
    // เดินย้อนกลับเก็บเป็นคำสั่งทีละตัว
    //   s = มีเหมือนกัน · d = ตัวของฝั่งนี้ที่อีกฝั่งไม่มี · i = ตัวของอีกฝั่งที่ฝั่งนี้ขาดไป
    var ops=[]; i=m; j=n;
    while(i>0 || j>0){
      if(i>0 && j>0 && a.charAt(i-1)===b.charAt(j-1)){ ops.push({t:'s', c:a.charAt(i-1)}); i--; j--; }
      else if(j>0 && (i===0 || dp[i][j-1]>=dp[i-1][j])){ ops.push({t:'i'}); j--; }
      else { ops.push({t:'d', c:a.charAt(i-1)}); i--; }
    }
    ops.reverse();
    // ถ้าตัวที่ต่างเป็นสระ/วรรณยุกต์ ต้องลากพยัญชนะข้างหน้ามาไฮไลต์ด้วย
    // ไม่งั้นมันจะถูกตัดออกมาลอยเดี่ยวๆ แล้วแสดงผลเพี้ยน อ่านไม่ออกเลย
    for(i=0;i<ops.length;i++){
      if(ops[i].t!=='d' || !THAI_MARK.test(ops[i].c||'')) continue;
      for(j=i-1;j>=0;j--){ if(ops[j].c!=null){ ops[j].t='d'; break; } }
    }
    var out='', open=false;
    for(i=0;i<ops.length;i++){
      var op=ops[i];
      if(op.t==='i'){
        // อีกฝั่งมีตัวอักษรตรงนี้ แต่ฝั่งนี้ขาดไป — ต้องบอกด้วย ไม่งั้นฝั่งที่ "ขาด" จะดูสะอาดเหมือนไม่มีอะไรผิด
        if(open){ out+='</mark>'; open=false; }
        if(ops[i-1] && ops[i-1].t==='i') continue;   // ขาดติดกันหลายตัว ขีดเดียวพอ
        out+='<span class="fx-df-gap" title="ตัวเลือกอีกอันมีตัวอักษรตรงนี้"></span>';
        continue;
      }
      if(op.t==='d' && !open){ out+='<mark class="fx-df">'; open=true; }
      if(op.t==='s' && open){ out+='</mark>'; open=false; }
      out+=esc(op.c);
    }
    return out+(open?'</mark>':'');
  }
  // ตัวเลือกแรกเทียบกับตัวที่สอง ตัวที่เหลือเทียบกับตัวแรก — คนอ่านจะเห็นว่า "ต่างกันตรงนี้" ทั้งสองฝั่ง
  function optHTML(list, i){
    var self=String(optLabel(list[i])==null?'':optLabel(list[i]));
    var other=list.length>1 ? String(optLabel(list[i===0?1:0])||'') : '';
    return diffHTML(self, other);
  }

  // การ์ด 1 รายการ
  function cardHTML(it, idx){
    var done=it.decision;
    var h='<div class="fx-card'+(done?' fx-done':'')+'" data-idx="'+idx+'">';
    h+='<div class="fx-head">'
      + '<span class="fx-badge fx-'+it.level+'">'+esc(BADGE[it.type])+'</span>'
      + '<span class="fx-title">'+esc(it.title)+(it.cls?' <span class="fx-dim">'+esc(it.cls)+'</span>':'')+'</span>'
      + '</div>';
    h+='<div class="fx-reason">'+esc(it.reason)+'</div>';

    if(done){
      // ระวัง: typeof null คือ 'object' ต้องเช็คว่ามีค่าจริงก่อน ไม่งั้นตอนกดว่า "ไม่ต้องแก้" (value = null) จะพัง
      var shown=(done.value && typeof done.value==='object')?(done.value.name+' ('+done.value.code+')'):done.value;
      h+='<div class="fx-result">'+(done.action==='merge'
          ? ('ใช้ค่านี้ทุกใบแล้ว: <b>'+esc(shown)+'</b>')
          : 'ทำเครื่องหมายไว้ว่าไม่ต้องแก้')
        +(done.by?' <span class="fx-dim">โดย '+esc(done.by)+'</span>':'')+'</div>';
      h+='<div class="fx-actions"><button type="button" class="fx-btn fx-undo">ยกเลิกการตัดสิน</button></div>';
      return h+'</div>';
    }

    h+='<div class="fx-hint">แตะเลือกค่าที่ถูก แล้วกดปุ่มสีม่วง — <b class="fx-df-legend">ตัวที่ไฮไลต์</b> คือจุดที่เขียนต่างกัน</div>';
    h+='<div class="fx-opts">';
    it.options.forEach(function(o,i){
      h+='<label class="fx-opt'+(i===0?' fx-pick':'')+'">'
        + '<input type="radio" name="fx'+idx+'" value="'+i+'"'+(i===0?' checked':'')+'>'
        + '<span class="fx-val">'+optHTML(it.options,i)+'</span>'
        + (i===0?'<span class="fx-best">ระบบแนะนำ</span>':'')
        + '<span class="fx-dim">'+esc(optNote(o))+'</span></label>';
    });
    // ช่องพิมพ์ค่าที่ถูกเอง เผื่อครูกรอกผิดทั้งคู่ ไม่มีตัวเลือกไหนถูกเลย
    h+='<label class="fx-opt fx-custom"><input type="radio" name="fx'+idx+'" value="custom">'
      + '<span class="fx-val">พิมพ์ค่าที่ถูกเอง</span>';
    if(it.type==='subject'){
      h+='<input type="text" class="fx-in fx-in-name" placeholder="ชื่อวิชา"><input type="text" class="fx-in fx-in-code" placeholder="รหัส">';
    } else if(it.type==='room'){
      h+='<input type="text" class="fx-in fx-in-room" placeholder="เช่น ม.6/5">';
    } else {
      h+='<input type="text" class="fx-in fx-in-name" placeholder="ชื่อ - นามสกุล">';
    }
    h+='</label></div>';

    // ปุ่มที่สองไม่ใช่ "ยกเลิก" แต่เป็นการตัดสินใจอีกแบบ — ต้องเขียนให้อ่านออกว่าเลือกอะไร
    // ของเดิมเขียนว่า "คนละคน" วางข้างปุ่มม่วงเหมือนปุ่มรอง ครูจะกดเพราะนึกว่าปิดหน้าต่าง
    var altText=(it.type==='room') ? 'ห้องนี้ถูกอยู่แล้ว ไม่ต้องแก้'
              : (it.type==='subject') ? 'เป็นคนละวิชากัน ไม่ต้องรวม'
              : 'เป็นคนละคนกัน ไม่ต้องรวม';
    h+='<div class="fx-actions">'
      + '<button type="button" class="fx-btn fx-ok">'+(it.type==='room'?'แก้ห้องให้เป็นค่าที่เลือก':(it.type==='subject'?'รวมเป็นวิชาที่เลือก':'แก้ชื่อให้เป็นค่าที่เลือก'))+'</button>'
      + '<button type="button" class="fx-btn fx-no fx-alt">'+altText+'</button>'
      + '</div>';
    h+='<div class="fx-willdo">กดปุ่มม่วงแล้ว <b>ข้อมูลในแผ่นรายงานจะถูกแก้จริง</b> ทุกแถวที่เขียนแบบเดิม '
      + 'ระบบจะถามยืนยันอีกครั้งพร้อมบอกว่ากระทบกี่แถว และย้อนกลับได้ที่แท็บ <b>แก้ไปแล้ว</b></div>';
    return h+'</div>';
  }

  function ticketHTML(t){
    return '<div class="fx-ticket"><b>ใบนี้อาจกรอกห้องผิดทั้งใบ</b> — '+esc(t.teacher)+' · '+esc(t.subject)+(t.code?' ('+esc(t.code)+')':'')
      + '<div class="fx-dim">'+t.students.map(function(s){ return esc(s.name)+' : '+esc(s.from)+' → '+esc(s.to); }).join(' · ')+'</div></div>';
  }

  /* ---------- แถบบอกสถานะการบันทึกลงชีต ----------
     ยิงแบบ no-cors อ่านผลไม่ได้ ถ้าไม่บอกสถานะไว้ ผู้ใช้จะเข้าใจว่าบันทึกแล้วทั้งที่ยังไม่ถึงชีต
     ------------------------------------------------- */
  // สถานะการแก้แผ่น "รายงาน" — แยกบรรทัดจากสถานะการบันทึกผลการตัดสิน เพราะเป็นคนละแผ่นคนละเรื่อง
  function mainHTML(){
    var m=sync.main; if(!m || !m.msg) return '';
    var cls=m.busy?'fx-sync-busy':(m.bad?'fx-sync-bad':'fx-sync-ok');
    return '<div class="fx-sync '+cls+'">'+esc(m.msg)+'</div>';
  }
  function syncHTML(){
    if(!api.url) return '';
    if(!api.ready){
      return '<div class="fx-sync fx-sync-bad">ยังบันทึกลงชีตไม่ได้ — Apps Script ที่ใช้อยู่ยังเป็นเวอร์ชันเก่า '
        + 'ผลการตรวจจะอยู่แค่ในเครื่องนี้จนกว่าจะ Deploy เวอร์ชันใหม่ (Deploy → Manage deployments → New version)</div>';
    }
    if(sync.busy) return '<div class="fx-sync fx-sync-busy">กำลังบันทึกลงชีต...</div>';
    if(queue.length){
      return '<div class="fx-sync fx-sync-bad">ยังไม่ได้บันทึกลงชีต <b>'+queue.length+'</b> รายการ '
        + '<button type="button" class="fx-retry" id="fxRetry">ลองส่งอีกครั้ง</button></div>';
    }
    if(new Date().getTime()-sync.okAt < 6000) return '<div class="fx-sync fx-sync-ok">บันทึกลงชีตแล้ว</div>';
    return '<div class="fx-sync fx-sync-idle">ผลการตรวจถูกเก็บไว้ในชีต ทุกเครื่องที่เปิดหน้ารายงานเห็นตรงกัน</div>';
  }
  // อัปเดตเฉพาะแถบสถานะ ไม่วาดแผงใหม่ทั้งอัน — วาดใหม่ตอนกำลังพิมพ์อยู่จะทำให้ช่องค้นหาหลุดโฟกัส
  function paintSync(){
    var el=document.getElementById('fxSync'); if(!el) return;
    el.innerHTML=syncHTML()+mainHTML();
    var r=document.getElementById('fxRetry');
    if(r) r.addEventListener('click', function(){ flush(); });
  }

  /* ---------- กล่องยืนยันก่อนเปลี่ยนข้อมูล ----------
     ทุกปุ่มที่แตะข้อมูลจริงต้องผ่านกล่องนี้ก่อน — แผ่น "รายงาน" คือของที่ครูเอาไปทำงานต่อ
     กดพลาดแล้วมารู้ทีหลังเสียเวลากว่าการกดยืนยันเพิ่มอีกครั้งเยอะ
     ------------------------------------------------- */
  function confirmBox(opt, onYes){
    var wrap=document.createElement('div');
    wrap.className='fx-cfm';
    wrap.innerHTML='<div class="fx-cfm-box">'
      + '<div class="fx-cfm-head">'+esc(opt.title)+'</div>'
      + '<div class="fx-cfm-body">'+opt.body+'</div>'
      + '<div class="fx-cfm-act">'
      + '<button type="button" class="fx-btn fx-no" data-a="no">ยกเลิก</button>'
      + '<button type="button" class="fx-btn'+(opt.danger?' fx-danger':'')+'" data-a="yes">'+esc(opt.yes||'ยืนยัน')+'</button>'
      + '</div></div>';
    document.body.appendChild(wrap);
    function close(){ if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.addEventListener('click', function(e){
      if(e.target===wrap){ close(); return; }               // กดพื้นหลัง = ยกเลิก
      var b=e.target.closest && e.target.closest('[data-a]');
      if(!b) return;
      close();
      if(b.getAttribute('data-a')==='yes') onYes();
    });
  }

  function valText(v){ return (v && typeof v==='object') ? (v.name+' ('+v.code+')') : String(v==null?'':v); }
  function cfmRow(label, val){ return '<div class="fx-cfm-row"><span>'+esc(label)+'</span><b>'+esc(val)+'</b></div>'; }

  // กล่องยืนยันสำหรับ "ใช้ค่านี้" — บอกให้ครบว่าจะทับอะไร เป็นอะไร กี่ช่อง กี่แถว
  function askMerge(it, val, onGo){
    var d={ id:it.id, type:it.type, action:'merge', value:val, members:it.members||[] };
    var edits=mainEdits(mainRows, d);
    var froms={}, list=[];
    edits.forEach(function(e){ var k=String(e.from); if(k && !froms[k]){ froms[k]=1; list.push(k); } });
    var body=cfmRow('หัวข้อ', it.title||'')
      + cfmRow('เปลี่ยนเป็น', valText(val))
      + (list.length?cfmRow('ทับค่าเดิม', list.join(' · ')):'')
      + cfmRow('กระทบในแผ่นรายงาน', edits.length+' ช่อง · '+editRowCount(edits)+' แถว');
    body += edits.length
      ? '<div class="fx-cfm-warn">ข้อมูลในแผ่น <b>รายงาน</b> จะถูกเปลี่ยนจริง (ไม่มีการลบแถว) ย้อนกลับได้ที่แท็บ <b>แก้ไปแล้ว</b></div>'
      : '<div class="fx-cfm-warn">ไม่มีช่องไหนต้องเปลี่ยนในแผ่นรายงาน บันทึกไว้เป็นผลการตรวจอย่างเดียว</div>';
    confirmBox({ title:'ยืนยันการแก้ข้อมูล', body:body, yes:'ยืนยัน แก้เลย', danger:!!edits.length }, onGo);
  }

  // กล่องยืนยันสำหรับ "ยกเลิกการตัดสิน" — ย้อนค่าในแผ่นรายงานกลับด้วย
  function askUndo(it, after){
    var d=it.decision||findDecision(it.id)||{};
    var body=cfmRow('หัวข้อ', it.title||'')
      + (d.action==='merge'?cfmRow('ค่าที่ใช้อยู่', valText(d.value)):'')
      + '<div class="fx-cfm-warn">ยกเลิกแล้วระบบจะ<b>ย้อนค่าในแผ่นรายงานกลับเป็นของเดิม</b> ตามที่จดไว้ในแผ่น <b>ค่าเดิม</b> '
      + 'ช่องที่มีคนไปแก้มือทีหลังจะไม่ถูกแตะ</div>';
    confirmBox({ title:'ยืนยันการยกเลิก', body:body, yes:'ยืนยัน ย้อนกลับ', danger:true }, function(){
      FIXESAPI.undo(it.id);
      if(after) after();
    });
  }

  // สลับระหว่างโหมด "ระบบตรวจพบ" กับ "แก้เอง"
  var panelMode='auto';
  function renderPanel(box, rows, onChange){
    var res=detect(rows);
    box.innerHTML='<div class="fx-modes">'
      + '<button type="button" class="fx-mode'+(panelMode==='auto'?' on':'')+'" data-m="auto">ระบบตรวจพบ'
      + (res.counts.pending?' <span class="fx-count">'+res.counts.pending+'</span>':'')+'</button>'
      + '<button type="button" class="fx-mode'+(panelMode==='manual'?' on':'')+'" data-m="manual">แก้เอง</button>'
      + '<button type="button" class="fx-mode'+(panelMode==='done'?' on':'')+'" data-m="done">แก้ไปแล้ว'
      + (decisions.length?' <span class="fx-count fx-count-done">'+decisions.length+'</span>':'')+'</button>'
      + '<span class="fx-who">ผู้ตรวจ <input type="text" id="fxWho" placeholder="ชื่อผู้ตรวจ" value="'+esc(lastWho)+'"></span>'
      + '<div class="fx-syncwrap" id="fxSync">'+syncHTML()+'</div>'
      + '</div><div id="fxInner"></div>';
    var rt=document.getElementById('fxRetry');
    if(rt) rt.addEventListener('click', function(){ flush(); });
    box.querySelectorAll('.fx-mode').forEach(function(b){
      b.addEventListener('click', function(){ panelMode=this.getAttribute('data-m'); renderPanel(box, rows, onChange); });
    });
    var who=document.getElementById('fxWho');
    if(who) who.addEventListener('input', function(){ lastWho=this.value; });
    var inner=document.getElementById('fxInner');
    if(panelMode==='manual') renderManual(inner, rows, function(){ if(onChange) onChange(); });
    else if(panelMode==='done') renderDone(inner, rows, onChange, box);
    else renderAuto(inner, rows, onChange, box);
    syncStickyTop(box);
  }

  // แถบที่สองต้องตรึงพอดีใต้แถบแท็บ — วัดความสูงจริงเสมอ ห้ามตั้งเลขตายตัว
  // เพราะแถบแท็บมี flex-wrap พอจอแคบจะขึ้นบรรทัดใหม่แล้วสูงขึ้น ตำแหน่งตรึงจะเพี้ยนทันที
  function syncStickyTop(box){
    var bar=box.querySelector('.fx-modes'); if(!bar) return;
    var set=function(){ document.documentElement.style.setProperty('--fxtop', bar.offsetHeight+'px'); };
    set();
    if(window.ResizeObserver && !bar._ro){ bar._ro=new ResizeObserver(set); bar._ro.observe(bar); }
  }

  // โหมดที่ระบบตรวจให้
  var autoFilter='';
  function renderAuto(box, rows, onChange, outer){
    var res=detect(rows);
    // แท็บนี้เหลือเฉพาะ "ที่ยังไม่ได้ตัดสิน" — ที่ตัดสินไปแล้วย้ายไปอยู่แท็บ "แก้ไปแล้ว" ของตัวเอง
    // เดิมเอาไปต่อท้ายรายการเดียวกัน พอตัดสินไปเยอะ ต้องเลื่อนยาวมากกว่าจะเจอของที่ยังไม่ได้ทำ
    var ordered=res.items.filter(function(i){ return !i.decision; });

    // ชิปด้านบนกดกรองได้ — ไม่งั้นกว่าจะถึงการ์ดวิชาต้องเลื่อนผ่านการ์ดชื่อทั้งหมด
    var chip=function(key,label,n){
      return '<button type="button" class="fx-chip'+(autoFilter===key?' on':'')+'" data-f="'+key+'">'
        + label+' <b>'+n+'</b></button>';
    };
    var h='<div class="fx-top">'
      + '<span class="fx-sum">รอตรวจ <b>'+res.counts.pending+'</b> รายการ</span>'
      + chip('','ทั้งหมด',res.counts.pending)
      + chip('name','ชื่อนักเรียน',res.counts.name)
      + chip('teacher','ชื่อครู',res.counts.teacher)
      + chip('room','ห้อง',res.counts.room)
      + chip('subject','วิชา',res.counts.subject)
      + '</div>';
    if(autoFilter) ordered=ordered.filter(function(it){ return it.type===autoFilter; });
    if(res.tickets.length && (!autoFilter || autoFilter==='room')) h+=res.tickets.map(ticketHTML).join('');
    h+= ordered.length ? ordered.map(function(it,i){ return cardHTML(it,i); }).join('')
                       : '<div class="fx-empty">'+(autoFilter?'ไม่มีรายการในหมวดนี้':'ไม่พบข้อมูลที่ต้องตรวจสอบ')+'</div>';
    box.innerHTML=h;

    box.querySelectorAll('.fx-chip').forEach(function(b){
      b.addEventListener('click', function(){ autoFilter=this.getAttribute('data-f'); renderAuto(box, rows, onChange, outer); });
    });

    box.querySelectorAll('.fx-card').forEach(function(card){
      var it=ordered[+card.getAttribute('data-idx')];
      // ต้องให้ข้อมูลถูกคืนค่า/ทับใหม่ก่อน (onChange) แล้วค่อยวาดหน้าจอ
      // ไม่งั้นตอนกดยกเลิกการตัดสิน ตัวตรวจจับจะยังเห็นข้อมูลที่ถูกแก้ไปแล้ว การ์ดจึงไม่กลับมา
      var redraw=function(){ if(onChange) onChange(); renderPanel(outer||box, rows, onChange); };

      var undo=card.querySelector('.fx-undo');
      if(undo) undo.addEventListener('click', function(){ askUndo(it, redraw); });

      var ok=card.querySelector('.fx-ok');
      if(ok) ok.addEventListener('click', function(){
        var sel=card.querySelector('input[type=radio]:checked');
        var val;
        if(sel && sel.value==='custom'){
          if(it.type==='subject'){
            var nm=(card.querySelector('.fx-in-name').value||'').trim();
            var cd=(card.querySelector('.fx-in-code').value||'').replace(/\s+/g,'').trim();
            if(!nm || !cd){ alertBox(card,'กรอกชื่อวิชาและรหัสให้ครบก่อน'); return; }
            val={name:nm, code:cd};
          } else if(it.type==='room'){
            var rm=(card.querySelector('.fx-in-room').value||'').replace(/\s+/g,'').trim();
            if(!/^ม\.?\d\/\d+$/.test(rm)){ alertBox(card,'กรอกห้องในรูปแบบ ม.6/4'); return; }
            val=rm.indexOf('ม.')===0?rm:rm.replace('ม','ม.');
          } else {
            var nn=(card.querySelector('.fx-in-name').value||'').replace(/\s+/g,' ').trim();
            if(!nn){ alertBox(card,'กรอกชื่อที่ถูกก่อน'); return; }
            val=nn;
          }
        } else {
          val=it.options[+(sel?sel.value:0)].value;
        }
        askMerge(it, val, function(){
          FIXESAPI.decide(it,'merge',val,(document.getElementById('fxWho')||{}).value);
          redraw();
        });
      });

      var no=card.querySelector('.fx-no');
      if(no) no.addEventListener('click', function(){
        confirmBox({ title:'ยืนยันว่าไม่ต้องแก้', yes:'ยืนยัน',
          body:cfmRow('หัวข้อ', it.title||'')
             + '<div class="fx-cfm-warn">บันทึกไว้ว่าตรวจแล้วไม่ต้องแก้ ข้อมูลในแผ่นรายงานไม่ถูกแตะ</div>'
        }, function(){
          FIXESAPI.decide(it,'ignore',null,(document.getElementById('fxWho')||{}).value);
          redraw();
        });
      });
    });
  }
  var lastWho='';
  var manualKind='student';   // แท็บย่อยในโหมดแก้เอง: student / teacher / subject

  /* ---------- แท็บ "แก้ไปแล้ว" ----------
     สร้างจากบันทึกการตัดสินโดยตรง ไม่ใช่จากผลตรวจ
     เพราะพอแก้ข้อมูลแล้วตัวตรวจจับจะไม่เห็นปัญหานั้นอีก การ์ดจะหายไปทั้งที่ควรเห็นไว้ย้อนดูและกดยกเลิกได้
     ------------------------------------------------- */
  var doneFilter='';
  function doneItems(){
    return decisions.map(function(d){
      return { id:d.id, type:d.type, level:'high', title:d.title||d.id,
               reason:(d.action==='merge'?('แก้เป็น '+valText(d.value)):'ทำเครื่องหมายว่าไม่ต้องแก้'),
               options:[], members:d.members||[], decision:d, cls:'' };
    });
  }
  function renderDone(box, rows, onChange, outer){
    var all=doneItems();
    var n=function(t){ return all.filter(function(x){ return x.type===t; }).length; };
    var chip=function(key,label,c){
      return '<button type="button" class="fx-chip'+(doneFilter===key?' on':'')+'" data-f="'+key+'">'+label+' <b>'+c+'</b></button>';
    };
    var list=doneFilter?all.filter(function(x){ return x.type===doneFilter; }):all;
    var h='<div class="fx-top">'
      + '<span class="fx-sum">แก้ไปแล้ว <b>'+all.length+'</b> รายการ</span>'
      + chip('','ทั้งหมด',all.length) + chip('name','ชื่อนักเรียน',n('name'))
      + chip('teacher','ชื่อครู',n('teacher')) + chip('room','ห้อง',n('room')) + chip('subject','วิชา',n('subject'))
      + '</div>';
    h+= list.length ? list.map(function(it,i){ return cardHTML(it,i); }).join('')
                    : '<div class="fx-empty">'+(doneFilter?'ไม่มีรายการในหมวดนี้':'ยังไม่ได้แก้อะไร')+'</div>';
    box.innerHTML=h;

    box.querySelectorAll('.fx-chip').forEach(function(b){
      b.addEventListener('click', function(){ doneFilter=this.getAttribute('data-f'); renderDone(box, rows, onChange, outer); });
    });
    box.querySelectorAll('.fx-card').forEach(function(card){
      var it=list[+card.getAttribute('data-idx')];
      var undo=card.querySelector('.fx-undo');
      if(undo) undo.addEventListener('click', function(){
        askUndo(it, function(){ if(onChange) onChange(); renderPanel(outer||box, rows, onChange); });
      });
    });
  }

  /* ---------- โหมดแก้เอง ----------
     สำหรับกรณีที่ตัวตรวจจับมองไม่เห็น เช่น ชื่อสะกดต่างกันเยอะเกินไป
     หรือกรอกผิดในใบเดียวจนไม่มีอะไรให้เทียบ — เลือกเองแล้วแก้ได้ตรงๆ
     ------------------------------------------------- */

  // ---- จับของที่ "ผิดชัดๆ แต่ไม่มีคู่ให้เทียบ" ----
  // ตัวตรวจจับหลักทำงานด้วยการจับคู่ ถ้าชื่อผิดอยู่คนเดียวในระบบจึงเงียบสนิท
  // เช่น "นางสาวสมหญิง ใจดี" ที่ถูกรายงานใบเดียว — ผิดตั้งแต่แรกเห็นแต่ไม่มีอะไรให้รวมด้วย
  var ROOM_OK=/^ม\.\d\/\d+$/;
  function suspectNote(kind, label, extra){
    var notes=[];
    if(kind==='subject'){
      if(!extra) notes.push('ไม่มีรหัสวิชา');
      else if(!CODE_OK.test(extra)) notes.push('รหัสวิชาผิดรูปแบบ');
      return notes.join(' · ');
    }
    if(hasStuckPrefix(label)) notes.push('มีคำนำหน้าติดมาในชื่อ');
    if(baseName(label).split(' ').length<2) notes.push('ไม่มีนามสกุล');
    if(/[0-9๐-๙]/.test(label)) notes.push('มีตัวเลขปนในชื่อ');
    if(/[^ก-๙a-zA-Z\s.]/.test(label)) notes.push('มีอักขระแปลกในชื่อ');
    if(kind==='student' && extra && !ROOM_OK.test(extra)) notes.push('รูปแบบห้องไม่ถูกต้อง');
    return notes.join(' · ');
  }

  // รวบรวมรายการทั้งหมดที่มีในระบบ ตามชนิดที่เลือก
  function listAll(rows, kind){
    var m={}, order=[];
    rows.forEach(function(r){
      var key,label,extra;
      if(kind==='student'){ key=rawName(sName(r))+'|'+cls(r); label=rawName(sName(r)); extra=cls(r); }
      else if(kind==='teacher'){ key=rawName(tName(r)); label=key; extra=''; }
      else { key=subjKey(r); label=subjName(r); extra=code(r); }
      if(!key || key==='|') return;
      if(!m[key]){ m[key]={ key:key, label:label, extra:extra, rows:[] }; order.push(key); }
      m[key].rows.push(r);
    });
    // สถานะของแต่ละรายการ: ระบบเสนอแล้ว / ตัดสินไปแล้ว / น่าสงสัยแต่ไม่มีคู่ให้เทียบ
    var res=detect(rows);
    var pend={}, decided={};
    res.items.filter(function(i){ return !i.decision; }).forEach(function(i){ (i.members||[]).forEach(function(v){ pend[v]=1; }); });
    decisions.forEach(function(d){ (d.members||[]).forEach(function(v){ decided[v]=1; }); });

    return order.map(function(k){
      var x=m[k];
      var nk=(kind==='student')?nameKey(x.label):'';
      var ids=[x.label, x.key, nk].filter(Boolean);
      var status='', note='';
      if(ids.some(function(v){ return pend[v]; })) { status='pending'; note='ระบบเสนอให้ตรวจ'; }
      else if(ids.some(function(v){ return decided[v]; })) { status='decided'; note='แก้ไปแล้ว'; }
      else { var s=suspectNote(kind, x.label, x.extra); if(s){ status='suspect'; note=s; } }
      return { key:k, label:x.label, extra:x.extra, tickets:countTickets(x.rows), count:x.rows.length,
               nameKey:nk, status:status, note:note };
    }).sort(function(a,b){
      var rank={ pending:0, suspect:1, '':2, decided:3 };   // ที่ต้องดูก่อนอยู่บนสุด
      if(rank[a.status]!==rank[b.status]) return rank[a.status]-rank[b.status];
      return String(a.label).localeCompare(String(b.label),'th');
    });
  }

  var manualOnly=false;   // กรองเฉพาะรายการที่ต้องดู
  function renderManual(box, rows, onChange){
    var q=(manualQ||'').trim().toLowerCase();
    var all=listAll(rows, manualKind);
    var flagged=all.filter(function(x){ return x.status==='pending' || x.status==='suspect'; }).length;
    var list=all.filter(function(x){
      if(manualOnly && x.status!=='pending' && x.status!=='suspect') return false;
      return !q || (x.label+' '+x.extra).toLowerCase().indexOf(q)>=0;
    });

    var h='<div class="fx-mtabs">'
      + ['student','teacher','subject'].map(function(k){
          return '<button type="button" class="fx-mtab'+(manualKind===k?' on':'')+'" data-kind="'+k+'">'
            + (k==='student'?'นักเรียน':(k==='teacher'?'ครูผู้สอน':'รายวิชา'))+'</button>';
        }).join('')
      + '<button type="button" class="fx-mtab fx-only'+(manualOnly?' on':'')+'" id="fxOnly">'
      + (manualOnly?'✓ ':'')+'เฉพาะที่ต้องดู'+(flagged?' <span class="fx-count">'+flagged+'</span>':'')+'</button>'
      + '<input type="text" class="fx-msearch" id="fxSearch" placeholder="พิมพ์คำค้นหา..." value="'+esc(manualQ)+'">'
      + '<span class="fx-dim">'+list.length+' รายการ</span></div>';

    h+='<div class="fx-mlist">';
    if(!list.length) h+='<div class="fx-empty">ไม่พบรายการตามเงื่อนไข</div>';
    list.forEach(function(x,i){
      h+='<label class="fx-mitem'+(x.status?' fx-s-'+x.status:'')+'"><input type="checkbox" class="fx-mcheck" data-i="'+i+'">'
        + '<span class="fx-val">'+esc(x.label)+'</span>'
        + (x.extra?'<span class="fx-mextra">'+esc(x.extra)+'</span>':'')
        + (x.note?'<span class="fx-snote fx-n-'+x.status+'">'+esc(x.note)+'</span>':'')
        + '<span class="fx-dim">'+x.tickets+' ใบ · '+x.count+' รายการ</span></label>';
    });
    h+='</div>';

    // แผงแก้ไข โผล่เมื่อเลือกรายการแล้ว
    h+='<div class="fx-medit" id="fxEdit"><div class="fx-dim">ติ๊กรายการที่ต้องการแก้ — ติ๊กหลายอันเพื่อรวมเป็นรายการเดียวกัน</div></div>';
    box.innerHTML=h;

    box.querySelectorAll('.fx-mtab[data-kind]').forEach(function(b){
      b.addEventListener('click', function(){ manualKind=this.getAttribute('data-kind'); renderManual(box, rows, onChange); });
    });
    var only=document.getElementById('fxOnly');
    if(only) only.addEventListener('click', function(){ manualOnly=!manualOnly; renderManual(box, rows, onChange); });
    var s=document.getElementById('fxSearch');
    if(s) s.addEventListener('input', function(){ manualQ=this.value; var pos=this.selectionStart; renderManual(box, rows, onChange);
      var n=document.getElementById('fxSearch'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } });

    var edit=document.getElementById('fxEdit');
    function picked(){
      return [].slice.call(box.querySelectorAll('.fx-mcheck:checked')).map(function(c){ return list[+c.getAttribute('data-i')]; });
    }
    function drawEdit(){
      var sel=picked();
      if(!sel.length){ edit.innerHTML='<div class="fx-dim">ติ๊กรายการที่ต้องการแก้ — ติ๊กหลายอันเพื่อรวมเป็นรายการเดียวกัน</div>'; return; }
      var e='<div class="fx-mhead">'+(sel.length>1?('รวม '+sel.length+' รายการเป็นรายการเดียวกัน'):'แก้ไขรายการนี้')+'</div>';
      e+='<div class="fx-mpicked">'+sel.map(function(x){ return esc(x.label)+(x.extra?' <span class="fx-dim">'+esc(x.extra)+'</span>':''); }).join(' · ')+'</div>';

      if(manualKind==='subject'){
        var f=sel[0];
        e+='<div class="fx-mrow"><label>ชื่อวิชาที่ถูก</label><input type="text" id="fxV1" value="'+esc(f.label)+'"></div>'
          + '<div class="fx-mrow"><label>รหัสวิชาที่ถูก</label><input type="text" id="fxV2" value="'+esc(f.extra)+'"></div>';
      } else if(manualKind==='teacher'){
        e+='<div class="fx-mrow"><label>ชื่อครูที่ถูก (ใส่คำนำหน้าด้วย)</label><input type="text" id="fxV1" value="'+esc(sel[0].label)+'"></div>';
      } else {
        e+='<div class="fx-mrow"><label>ชื่อที่ถูก</label><input type="text" id="fxV1" value="'+esc(sel[0].label)+'"></div>'
          + '<div class="fx-mrow"><label>ห้องที่ถูก</label><input type="text" id="fxV2" value="'+esc(sel[0].extra)+'" placeholder="เช่น ม.6/4"></div>'
          + '<div class="fx-dim">เว้นช่องไหนไว้เหมือนเดิม = ไม่แก้ช่องนั้น</div>';
      }
      e+='<div class="fx-actions"><button type="button" class="fx-btn" id="fxSave">บันทึกการแก้ไข</button></div>';
      edit.innerHTML=e;

      document.getElementById('fxSave').addEventListener('click', function(){
        var by=(document.getElementById('fxWho')||{}).value;
        var v1=(document.getElementById('fxV1')||{}).value||'';
        var v2=(document.getElementById('fxV2')||{}).value||'';
        v1=v1.replace(/\s+/g,' ').trim();
        var now=new Date().toISOString();
        var bad=function(m){
          var old=edit.querySelector('.fx-err'); if(old) old.remove();
          edit.querySelector('.fx-actions').insertAdjacentHTML('beforeend','<div class="fx-err">'+esc(m)+'</div>');
        };
        // ตรวจให้ครบก่อน แล้วค่อยรวบเป็นรายการเดียว — กดครั้งเดียวอาจได้ทั้งชื่อและห้อง
        // ต้องผ่านกล่องยืนยันก่อนถึงจะเขียนอะไรลงชีต ห้ามเขียนทีละอันระหว่างตรวจ
        var pend=[];

        if(manualKind==='subject'){
          var cd=v2.replace(/\s+/g,'').trim();
          if(!v1 || !cd){ bad('กรอกชื่อวิชาและรหัสให้ครบก่อน'); return; }
          pend.push({ id:'manual:subject:'+sel.map(function(x){return x.key;}).sort().join('||'), type:'subject', action:'merge',
            value:{name:v1, code:cd}, members:sel.map(function(x){ return x.key; }), title:v1, by:by, at:now });
        } else if(manualKind==='teacher'){
          if(!v1){ bad('กรอกชื่อครูก่อน'); return; }
          pend.push({ id:'manual:teacher:'+sel.map(function(x){return x.key;}).sort().join('||'), type:'teacher', action:'merge',
            value:v1, members:sel.map(function(x){ return x.key; }), title:v1, by:by, at:now });
        } else {
          if(!v1){ bad('กรอกชื่อนักเรียนก่อน'); return; }
          var members=sel.map(function(x){ return x.label; });   // ชื่อดิบทั้งหมดที่เลือก
          // บันทึกเรื่องชื่อเฉพาะเมื่อมีอะไรเปลี่ยนจริง — เลือกคนเดียวแล้วชื่อเท่าเดิม (ตั้งใจมาแก้แค่ห้อง) ไม่ต้องบันทึก
          if(sel.length>1 || v1!==sel[0].label){
            pend.push({ id:'manual:name:'+members.slice().sort().join('||'), type:'name', action:'merge',
              value:v1, members:members, title:v1, by:by, at:now });
          }
          var room=v2.replace(/\s+/g,'').trim();
          if(sel.length===1 && room===sel[0].extra) room='';   // ห้องเท่าเดิม = ไม่ได้ตั้งใจแก้ห้อง
          if(room){
            if(!/^ม\.?\d\/\d+$/.test(room)){ bad('กรอกห้องในรูปแบบ ม.6/4'); return; }
            if(room.indexOf('ม.')!==0) room=room.replace('ม','ม.');
            // ห้องผูกกับตัวนักเรียน จึงใช้คีย์เสียงของชื่อที่แก้แล้วเป็นสมาชิก
            pend.push({ id:'manual:room:'+nameKey(v1), type:'room', action:'merge', value:room,
              members:[nameKey(v1)].concat(sel.map(function(x){ return x.nameKey; })), title:v1, by:by, at:now });
          }
        }
        if(!pend.length){ bad('ยังไม่ได้เปลี่ยนอะไร'); return; }

        var edits=[];
        pend.forEach(function(d){ edits=edits.concat(mainEdits(mainRows, d)); });
        var body=cfmRow('รายการที่เลือก', sel.map(function(x){ return x.label; }).join(' · '))
          + pend.map(function(d){ return cfmRow(LABEL[d.type]+'ที่ถูก', valText(d.value)); }).join('')
          + cfmRow('กระทบในแผ่นรายงาน', edits.length+' ช่อง · '+editRowCount(edits)+' แถว')
          + (edits.length
              ? '<div class="fx-cfm-warn">ข้อมูลในแผ่น <b>รายงาน</b> จะถูกเปลี่ยนจริง (ไม่มีการลบแถว) ย้อนกลับได้ที่แท็บ <b>แก้ไปแล้ว</b></div>'
              : '<div class="fx-cfm-warn">ไม่มีช่องไหนต้องเปลี่ยนในแผ่นรายงาน บันทึกไว้เป็นผลการตรวจอย่างเดียว</div>');
        confirmBox({ title:'ยืนยันการแก้ข้อมูล', body:body, yes:'ยืนยัน แก้เลย', danger:!!edits.length }, function(){
          pend.forEach(function(d){ putDecision(d); applyMain(d); });
          if(onChange) onChange();
          renderManual(box, rows, onChange);
        });
      });
    }
    box.querySelectorAll('.fx-mcheck').forEach(function(c){ c.addEventListener('change', drawEdit); });
  }
  var manualQ='';

  function alertBox(card,msg){
    var old=card.querySelector('.fx-err'); if(old) old.remove();
    var d=document.createElement('div'); d.className='fx-err'; d.textContent=msg;
    card.querySelector('.fx-actions').appendChild(d);
  }

  /* ---------- API ที่หน้าเว็บเรียกใช้ ---------- */
  var loaded=false;
  function ensureLoaded(){ if(loaded) return; loaded=true; loadQueue(); rebuild(); }

  var FIXESAPI=window.FIXES={
    setCol:function(c){ COL=c; ensureLoaded(); },
    // ต่อกับหลังบ้าน — เรียกทันทีที่ล็อกอินผ่าน ก่อน normalizeRows รอบแรก
    // fixes ที่แนบมากับ doGet เป็นตัวบอกด้วยว่า Apps Script ที่ deploy ไว้รองรับแล้วหรือยัง
    // (เวอร์ชันเก่าคืนมาแต่ rows ไม่มีช่อง fixes เลย)
    connect:function(o){
      ensureLoaded();
      api.url=o.url||''; api.key=o.key||''; api.onRows=o.onRows||null;
      api.ready=(Object.prototype.toString.call(o.fixes)==='[object Array]');
      if(api.ready) setServer(o.fixes);
      flush();   // ส่งของที่ค้างจากคราวก่อน (หรือที่ย้ายมาจากที่เก็บเดิม) ขึ้นชีตให้
    },
    // ผลการตรวจล่าสุดจากชีต — เรียกทุกครั้งที่ดึงข้อมูลใหม่ เครื่องอื่นกดอะไรไว้จะตามมาเอง
    setServerFixes:function(list){
      if(Object.prototype.toString.call(list)!=='[object Array]') return;
      ensureLoaded(); api.ready=true; setServer(list); reconcile(); paintSync();
    },
    detect:detect,
    apply:apply,
    render:renderPanel,
    decisions:function(){ return decisions.slice(); },
    unsent:function(){ return queue.length; },   // จำนวนรายการที่ยังยืนยันไม่ได้ว่าถึงชีต
    retry:function(){ flush(); },
    decide:function(item, action, value, by){
      var d={
        id:item.id, type:item.type, action:action, value:value,
        members:item.members, title:item.title,
        by:(by||'').trim(), at:new Date().toISOString()
      };
      putDecision(d);                      // 1) จดผลการตัดสินไว้ที่แผ่น "แก้ข้อมูล"
      if(action==='merge') applyMain(d);   // 2) แก้ข้อมูลจริงในแผ่น "รายงาน"
    },
    // ยกเลิก = ลบผลการตัดสิน แล้วย้อนค่าในแผ่น "รายงาน" กลับจากแผ่น "ค่าเดิม"
    undo:function(id){ removeDecision(id); undoMain(id); },
    // เปิดออกมาให้ report.js และการทดสอบเรียกใช้ได้
    util:{ baseName:baseName, phonetic:phonetic, nameKey:nameKey, lev:lev, hasStuckPrefix:hasStuckPrefix,
           CODE_OK:CODE_OK, diffHTML:diffHTML }
  };

})();
