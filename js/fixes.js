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
     ตอนนี้เก็บในเครื่อง (localStorage) ชั่วคราว
     เมื่อฝั่ง Apps Script เพิ่มแผ่น "แก้ข้อมูล" แล้ว ให้สลับ adapter ตัวนี้เป็นการอ่าน/เขียนผ่าน API
     รูปแบบข้อมูลออกแบบให้ตรงกับคอลัมน์ในชีตอยู่แล้ว จึงสลับได้โดยไม่ต้องแก้ส่วนอื่น
     ดู docs/spec-code-gs-fixes.md
     ------------------------------------------------- */
  var STORE_KEY='chanu_data_fixes_v1';
  var decisions=[];   // [{id,type,action,value,members,by,at}]

  function storage(){ try{ return window.localStorage; }catch(e){ return null; } }
  function loadDecisions(){
    var st=storage(); if(!st) { decisions=[]; return decisions; }
    try{ var raw=st.getItem(STORE_KEY); decisions=raw?(JSON.parse(raw)||[]):[]; }catch(e){ decisions=[]; }
    return decisions;
  }
  function saveDecisions(){
    var st=storage(); if(!st) return;
    try{ st.setItem(STORE_KEY, JSON.stringify(decisions)); }catch(e){}
  }
  function findDecision(id){
    for(var i=0;i<decisions.length;i++){ if(decisions[i].id===id) return decisions[i]; }
    return null;
  }
  function putDecision(d){
    var old=findDecision(d.id);
    if(old){ for(var k in d) old[k]=d[k]; } else decisions.push(d);
    saveDecisions();
  }
  function removeDecision(id){
    decisions=decisions.filter(function(d){ return d.id!==id; });
    saveDecisions();
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
    loadDecisions();
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
    var n=o.tickets+' ใบ';
    if(o.teachers && o.teachers.length) n+=' · ครู '+o.teachers.length+' คนกรอกตรงกัน';
    if(o.stuck) n+=' · มีคำนำหน้าติดมา';
    if(o.badFormat) n+=' · รหัสผิดรูปแบบ';
    return n;
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

    h+='<div class="fx-opts">';
    it.options.forEach(function(o,i){
      var v=optLabel(o);
      h+='<label class="fx-opt'+(i===0?' fx-pick':'')+'">'
        + '<input type="radio" name="fx'+idx+'" value="'+i+'"'+(i===0?' checked':'')+'>'
        + '<span class="fx-val">'+esc(v)+'</span>'
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

    h+='<div class="fx-actions">'
      + '<button type="button" class="fx-btn fx-ok">'+(it.type==='room'?'ใช้ห้องนี้ทุกใบ':(it.type==='subject'?'รวมเป็นวิชาเดียวกัน':'ใช้ชื่อนี้ทุกใบ'))+'</button>'
      + '<button type="button" class="fx-btn fx-no">'+(it.type==='room'?'ไม่แก้':(it.type==='subject'?'คนละวิชา':'คนละคน'))+'</button>'
      + '</div>';
    return h+'</div>';
  }

  function ticketHTML(t){
    return '<div class="fx-ticket"><b>ใบนี้อาจกรอกห้องผิดทั้งใบ</b> — '+esc(t.teacher)+' · '+esc(t.subject)+(t.code?' ('+esc(t.code)+')':'')
      + '<div class="fx-dim">'+t.students.map(function(s){ return esc(s.name)+' : '+esc(s.from)+' → '+esc(s.to); }).join(' · ')+'</div></div>';
  }

  // สลับระหว่างโหมด "ระบบตรวจพบ" กับ "แก้เอง"
  var panelMode='auto';
  function renderPanel(box, rows, onChange){
    var res=detect(rows);
    box.innerHTML='<div class="fx-modes">'
      + '<button type="button" class="fx-mode'+(panelMode==='auto'?' on':'')+'" data-m="auto">ระบบตรวจพบ'
      + (res.counts.pending?' <span class="fx-count">'+res.counts.pending+'</span>':'')+'</button>'
      + '<button type="button" class="fx-mode'+(panelMode==='manual'?' on':'')+'" data-m="manual">แก้เอง</button>'
      + '<span class="fx-who">ผู้ตรวจ <input type="text" id="fxWho" placeholder="ชื่อผู้ตรวจ" value="'+esc(lastWho)+'"></span>'
      + '</div><div id="fxInner"></div>';
    box.querySelectorAll('.fx-mode').forEach(function(b){
      b.addEventListener('click', function(){ panelMode=this.getAttribute('data-m'); renderPanel(box, rows, onChange); });
    });
    var who=document.getElementById('fxWho');
    if(who) who.addEventListener('input', function(){ lastWho=this.value; });
    var inner=document.getElementById('fxInner');
    if(panelMode==='manual') renderManual(inner, rows, function(){ if(onChange) onChange(); });
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
    var pending=res.items.filter(function(i){ return !i.decision; });
    // รายการที่ตัดสินไปแล้วต้องอ่านจากบันทึกการตัดสินโดยตรง ไม่ใช่จากผลตรวจ
    // เพราะพอแก้ข้อมูลแล้วตัวตรวจจับจะไม่เจอปัญหานั้นอีก การ์ดจะหายไปทั้งที่ควรเห็นไว้ย้อนดูและกดยกเลิกได้
    var doneList=decisions.map(function(d){
      return { id:d.id, type:d.type, level:'high', title:d.title||d.id,
               reason:(d.action==='merge'?'แก้ไขแล้ว':'ทำเครื่องหมายว่าไม่ต้องแก้'),
               options:[], members:d.members||[], decision:d, cls:'' };
    });
    var ordered=pending.concat(doneList);

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
      if(undo) undo.addEventListener('click', function(){ removeDecision(it.id); redraw(); });

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
        FIXESAPI.decide(it,'merge',val,(document.getElementById('fxWho')||{}).value);
        redraw();
      });

      var no=card.querySelector('.fx-no');
      if(no) no.addEventListener('click', function(){
        FIXESAPI.decide(it,'ignore',null,(document.getElementById('fxWho')||{}).value);
        redraw();
      });
    });
  }
  var lastWho='';
  var manualKind='student';   // แท็บย่อยในโหมดแก้เอง: student / teacher / subject

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

        if(manualKind==='subject'){
          var cd=v2.replace(/\s+/g,'').trim();
          if(!v1 || !cd){ edit.querySelector('.fx-actions').insertAdjacentHTML('beforeend','<div class="fx-err">กรอกชื่อวิชาและรหัสให้ครบก่อน</div>'); return; }
          putDecision({ id:'manual:subject:'+sel.map(function(x){return x.key;}).sort().join('||'), type:'subject', action:'merge',
            value:{name:v1, code:cd}, members:sel.map(function(x){ return x.key; }), title:v1, by:by, at:new Date().toISOString() });
        } else if(manualKind==='teacher'){
          if(!v1){ edit.querySelector('.fx-actions').insertAdjacentHTML('beforeend','<div class="fx-err">กรอกชื่อครูก่อน</div>'); return; }
          putDecision({ id:'manual:teacher:'+sel.map(function(x){return x.key;}).sort().join('||'), type:'teacher', action:'merge',
            value:v1, members:sel.map(function(x){ return x.key; }), title:v1, by:by, at:new Date().toISOString() });
        } else {
          if(!v1){ edit.querySelector('.fx-actions').insertAdjacentHTML('beforeend','<div class="fx-err">กรอกชื่อนักเรียนก่อน</div>'); return; }
          var members=sel.map(function(x){ return x.label; });   // ชื่อดิบทั้งหมดที่เลือก
          // บันทึกเรื่องชื่อเฉพาะเมื่อมีอะไรเปลี่ยนจริง — เลือกคนเดียวแล้วชื่อเท่าเดิม (ตั้งใจมาแก้แค่ห้อง) ไม่ต้องบันทึก
          if(sel.length>1 || v1!==sel[0].label){
            putDecision({ id:'manual:name:'+members.slice().sort().join('||'), type:'name', action:'merge',
              value:v1, members:members, title:v1, by:by, at:new Date().toISOString() });
          }
          var room=v2.replace(/\s+/g,'').trim();
          if(sel.length===1 && room===sel[0].extra) room='';   // ห้องเท่าเดิม = ไม่ได้ตั้งใจแก้ห้อง
          if(room){
            if(!/^ม\.?\d\/\d+$/.test(room)){ edit.querySelector('.fx-actions').insertAdjacentHTML('beforeend','<div class="fx-err">กรอกห้องในรูปแบบ ม.6/4</div>'); return; }
            if(room.indexOf('ม.')!==0) room=room.replace('ม','ม.');
            // ห้องผูกกับตัวนักเรียน จึงใช้คีย์เสียงของชื่อที่แก้แล้วเป็นสมาชิก
            putDecision({ id:'manual:room:'+nameKey(v1), type:'room', action:'merge', value:room,
              members:[nameKey(v1)].concat(sel.map(function(x){ return x.nameKey; })), title:v1, by:by, at:new Date().toISOString() });
          }
        }
        if(onChange) onChange();
        renderManual(box, rows, onChange);
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
  var FIXESAPI=window.FIXES={
    setCol:function(c){ COL=c; loadDecisions(); },
    detect:detect,
    apply:apply,
    render:renderPanel,
    decisions:function(){ return decisions.slice(); },
    decide:function(item, action, value, by){
      putDecision({
        id:item.id, type:item.type, action:action, value:value,
        members:item.members, title:item.title,
        by:(by||'').trim(), at:new Date().toISOString()
      });
    },
    undo:removeDecision,
    // เปิดออกมาให้ report.js และการทดสอบเรียกใช้ได้
    util:{ baseName:baseName, phonetic:phonetic, nameKey:nameKey, lev:lev, hasStuckPrefix:hasStuckPrefix, CODE_OK:CODE_OK }
  };

})();
