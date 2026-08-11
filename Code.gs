// ====================================================
// Code.gs — วางไฟล์นี้ใน Google Apps Script
// ====================================================
//
// 🔑 รหัสผ่านหน้ารายงาน (report.html):
//   - ค่าเริ่มต้นอยู่ที่ตัวแปร DEFAULT_REPORT_PASSWORD ด้านล่าง
//   - ถ้าจะเปลี่ยนรหัสแบบปลอดภัย: เมนู Project Settings (รูปเฟือง) →
//     เลื่อนลงหา "Script Properties" → Add → ตั้งชื่อ REPORT_PASSWORD แล้วใส่รหัสที่ต้องการ
//   - ทุกครั้งที่แก้ไฟล์นี้ ต้อง Deploy เวอร์ชันใหม่ (Manage deployments → ดินสอ → New version)
// ====================================================

var DEFAULT_REPORT_PASSWORD = 'chanu2025';

// ===== อ่านข้อมูลไปแสดงหน้ารายงาน (GET request, ตอบแบบ JSONP) =====
function doGet(e) {
  var params = (e && e.parameter) || {};
  var callback = params.callback || 'callback';
  try {
    // ===== ยืนยันว่าบันทึกสำเร็จจริง (ไม่ต้องใช้รหัสผ่าน — แค่นับแถวของ submission_id ตัวเอง ไม่คืนข้อมูล) =====
    if (params.action === 'verify') {
      return jsonp(callback, { result: 'OK', saved: countBySubmissionId(params.sid) });
    }

    var props = PropertiesService.getScriptProperties();
    var pass = props.getProperty('REPORT_PASSWORD') || DEFAULT_REPORT_PASSWORD;

    // เช็ครหัสผ่านฝั่งเซิร์ฟเวอร์ก่อนคืนข้อมูล (กันคนไม่มีรหัสดึงข้อมูล)
    if (String(params.key || '') !== String(pass)) {
      return jsonp(callback, { error: 'unauthorized' });
    }

    // ===== ผลการตรวจสอบข้อมูล (ชื่อ / ห้อง / วิชา ที่คนยืนยันแล้ว) =====
    // มีชื่อนักเรียนและชื่อครูอยู่ในนั้น จึงต้องผ่านการเช็ครหัสผ่านด้านบนก่อนเสมอ
    if (params.action === 'fixes') {
      return jsonp(callback, { result: 'OK', fixes: readFixes() });
    }

    return jsonp(callback, { result: 'OK', rows: readSheet(), fixes: readFixes() });
  } catch (err) {
    Logger.log('doGet error: ' + err); // เก็บรายละเอียดไว้ฝั่งเซิร์ฟเวอร์ ไม่ส่งกลับ
    return jsonp(callback, { error: 'server' });
  }
}

// นับจำนวนแถวที่มี submission_id ตรงกับ id (ใช้ยืนยันว่าบันทึกเข้าชีตจริง)
function countBySubmissionId(id) {
  if (!id) return 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('รายงาน');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var values = sheet.getDataRange().getValues();
  var n = 0;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][21]) === String(id)) n++; // submission_id = คอลัม 22 (index 21)
  }
  return n;
}

// ====================================================
// แผ่น "แก้ข้อมูล" — เก็บผลการตรวจสอบข้อมูลที่กรอกผิด (ชื่อ / ห้อง / วิชา)
// ====================================================
// หน้ารายงานมีระบบตรวจหาข้อมูลที่น่าจะกรอกผิด แล้วให้คนกดยืนยันว่าค่าที่ถูกคืออะไร
// ผลการยืนยันเก็บไว้ที่แผ่นนี้ ทุกคนที่เปิดหน้ารายงานจึงเห็นตรงกัน
// ⚠️ ระบบไม่แก้ข้อมูลในแผ่น "รายงาน" เลย ใบต้นฉบับและเอกสารที่ปริ้นไปแล้วยังเป็นค่าเดิมทุกตัวอักษร
var FIX_SHEET = 'แก้ข้อมูล';
var FIX_HEADERS = ['id', 'ชนิด', 'การกระทำ', 'ค่าที่ใช้', 'สมาชิก', 'หัวข้อ', 'ผู้ตรวจ', 'เวลา'];

// หาแผ่น ถ้ายังไม่มีก็สร้างให้พร้อมหัวตาราง
function getFixSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FIX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FIX_SHEET);
    sh.appendRow(FIX_HEADERS);
    var head = sh.getRange(1, 1, 1, FIX_HEADERS.length);
    head.setFontWeight('bold');
    head.setBackground('#6b21a8');
    head.setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ===== ช่อง "ค่าที่ใช้" เก็บได้ 2 แบบ =====
// ชื่อ/ห้อง = ข้อความธรรมดา · วิชา = ต้องเก็บทั้งชื่อและรหัสคู่กัน จึงเก็บเป็นข้อความ JSON
// ถ้าเขียนลงไปตรงๆ จะได้คำว่า [object Object] แล้วหน้าเว็บอ่านกลับมาใช้ไม่ได้
function fixValueOut_(v) {
  if (v === null || v === undefined) return '';
  return (typeof v === 'object') ? JSON.stringify(v) : String(v);
}
function fixValueIn_(s) {
  var t = String(s === null || s === undefined ? '' : s);
  if (t.charAt(0) === '{') { try { return JSON.parse(t); } catch (e) {} }
  return t;
}

// อ่านรายการทั้งหมด — หน้ารายงานเรียกตอนโหลดข้อมูล
function readFixes() {
  var sh = getFixSheet_();
  if (sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[0]) continue;
    out.push({
      id: String(row[0]),
      type: String(row[1]),
      action: String(row[2]),
      value: fixValueIn_(row[3]),
      members: String(row[4]) ? String(row[4]).split('||') : [],
      title: String(row[5]),
      by: String(row[6]),
      at: (row[7] instanceof Date) ? row[7].toISOString() : String(row[7])
    });
  }
  return out;
}

// บันทึกหรือลบรายการ — id เดิมทับของเก่า (ลบแถวเก่าก่อนแล้วเขียนใหม่)
// ส่ง remove:true มา = ยกเลิกการตัดสิน ลบอย่างเดียวไม่เขียนกลับ
function saveFix(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);   // กันหลายคนกดพร้อมกัน เข้าทีละคน
  try {
    var sh = getFixSheet_();
    var id = String(data.id || '');
    if (!id) throw new Error('ไม่มี id');

    // ลบแถวเดิมของ id นี้ก่อน (ลบจากล่างขึ้นบนกัน index เลื่อน)
    if (sh.getLastRow() >= 2) {
      var values = sh.getDataRange().getValues();
      for (var r = values.length - 1; r >= 1; r--) {
        if (String(values[r][0]) === id) sh.deleteRow(r + 1);
      }
    }
    if (data.remove) return { result: 'OK', removed: true };

    sh.appendRow([
      id,
      String(data.type || ''),
      String(data.action || ''),
      fixValueOut_(data.value),
      (data.members || []).join('||'),
      String(data.title || ''),
      String(data.by || ''),
      new Date()
    ]);
    return { result: 'OK' };
  } finally {
    lock.releaseLock();
  }
}

// ====================================================
// แผ่น "ค่าเดิม" — สมุดสำรองก่อนแก้แผ่น "รายงาน"
// ====================================================
// ⚠️ ห้ามเก็บค่าเดิมไว้ในแผ่น "รายงาน" เด็ดขาด (เช่นเพิ่มคอลัมน์ที่ 23)
//    เพราะครูเอาแผ่นนั้นไปทำงานต่อ คอลัมน์แปลกปลอมจะไปพังของเขา
//    เก็บแยกแผ่นนี้แทน ทำให้ย้อนกลับได้โดยแผ่นรายงานยังหน้าตาเดิมเป๊ะ 22 คอลัมน์
var BACKUP_SHEET = 'ค่าเดิม';
var BACKUP_HEADERS = ['เวลา', 'id การแก้', 'หัวข้อ', 'แถวในชีต', 'คอลัมน์', 'ค่าเดิม', 'ค่าใหม่', 'ผู้ตรวจ', 'สถานะ'];

// คอลัมน์ที่ยอมให้แก้ได้เท่านั้น (ชื่อ -> เลขคอลัมน์ในแผ่น "รายงาน" นับจาก 1)
// ทำเป็นรายชื่อขาว: ส่งชื่อคอลัมน์อื่นมาเท่ากับถูกปฏิเสธ ไม่ว่าจะพลาดหรือจงใจ
// ห้ามใส่ timestamp / submission_id / ตัวเลขคาบเรียน เข้ามาในนี้
var MAIN_EDITABLE = {
  'คำนำหน้าครู': 3, 'ชื่อครู': 4, 'รหัสวิชา': 6, 'ชื่อรายวิชา': 7, 'ชื่อ-สกุล': 15, 'ชั้น/ห้อง': 16
};

function getBackupSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BACKUP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(BACKUP_SHEET);
    sh.appendRow(BACKUP_HEADERS);
    var head = sh.getRange(1, 1, 1, BACKUP_HEADERS.length);
    head.setFontWeight('bold');
    head.setBackground('#6b21a8');
    head.setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ===== แก้ข้อมูลในแผ่น "รายงาน" จริง =====
// 🚨 แก้เฉพาะ "ค่าในช่อง" เท่านั้น ห้ามลบแถว ห้ามเพิ่มแถว ห้ามสลับลำดับ เด็ดขาด
//    ในนี้จึงมีแต่ setValue ทีละช่อง ไม่มี deleteRow / insertRow / setValues ทั้งแผ่น
// ทุกช่องต้องผ่าน 3 ด่าน: คอลัมน์อยู่ในรายชื่อขาว · เลขแถวอยู่ในช่วงจริง · ค่าปัจจุบันตรงกับที่ฝั่งเว็บเห็น
// ด่านที่ 3 สำคัญที่สุด — ถ้าชีตถูกแก้ไปแล้วระหว่างทาง (ครูกดส่งใบเดิมซ้ำ แถวจึงเลื่อน) จะข้ามไป ไม่ทับมั่ว
function applyMainEdits(data) {
  var edits = (data && data.edits) || [];
  if (!edits.length) return { result: 'OK', changed: 0, skipped: 0 };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);   // ใช้ล็อกตัวเดียวกับ saveToSheet — กันเขียนชนกับตอนครูกดส่งใบ
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('รายงาน');
    if (!sheet || sheet.getLastRow() < 2) throw new Error('ไม่มีข้อมูลในแผ่นรายงาน');
    var values = sheet.getDataRange().getValues();
    var now = new Date(), log = [], changed = 0, skipped = 0;

    for (var i = 0; i < edits.length; i++) {
      var e = edits[i] || {};
      var col = MAIN_EDITABLE[String(e.col)];
      var row = parseInt(e.row, 10);
      if (!col) { skipped++; continue; }                          // คอลัมน์ไม่อยู่ในรายชื่อขาว
      if (!(row >= 2) || row > values.length) { skipped++; continue; }  // แถว 1 คือหัวตาราง ห้ามแตะ
      var cur = String(values[row - 1][col - 1]);
      if (cur !== String(e.from)) { skipped++; continue; }         // ชีตไม่ตรงกับที่เว็บเห็น ไม่ทับ
      if (cur === String(e.to)) { skipped++; continue; }           // เหมือนเดิมอยู่แล้ว ไม่ต้องเขียน

      sheet.getRange(row, col).setValue(String(e.to));
      values[row - 1][col - 1] = String(e.to);                     // กันแก้ช่องเดิมซ้ำในรอบเดียวกัน
      log.push([now, String(data.fixId || ''), String(data.title || ''), row,
                String(e.col), cur, String(e.to), String(data.by || ''), '']);
      changed++;
    }

    if (log.length) {
      var bk = getBackupSheet_();
      bk.getRange(bk.getLastRow() + 1, 1, log.length, BACKUP_HEADERS.length).setValues(log);
    }
    return { result: 'OK', changed: changed, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

// ===== ย้อนการแก้กลับเป็นค่าเดิม =====
// อ่านจากแผ่น "ค่าเดิม" เฉพาะรายการของ id นี้ที่ยังไม่ถูกย้อน แล้วเขียนค่าเดิมกลับ
// เขียนกลับต่อเมื่อค่าปัจจุบันยังเป็น "ค่าใหม่" อยู่ — ถ้ามีคนไปแก้มือทีหลัง จะไม่ไปทับของเขา
// ไม่ลบแถวใน "ค่าเดิม" แต่ประทับสถานะไว้ ประวัติจึงยังอยู่ครบ
function undoMainEdits(data) {
  var id = String((data && data.fixId) || '');
  if (!id) return { result: 'OK', restored: 0, skipped: 0 };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var bk = getBackupSheet_();
    if (bk.getLastRow() < 2) return { result: 'OK', restored: 0, skipped: 0 };
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('รายงาน');
    if (!sheet || sheet.getLastRow() < 2) throw new Error('ไม่มีข้อมูลในแผ่นรายงาน');
    var values = sheet.getDataRange().getValues();
    var logs = bk.getDataRange().getValues();
    var restored = 0, skipped = 0;

    for (var r = logs.length - 1; r >= 1; r--) {
      if (String(logs[r][1]) !== id) continue;
      if (String(logs[r][8])) continue;                            // ย้อนไปแล้ว ข้าม
      var col = MAIN_EDITABLE[String(logs[r][4])];
      var row = parseInt(logs[r][3], 10);
      if (!col || !(row >= 2) || row > values.length) { skipped++; continue; }
      if (String(values[row - 1][col - 1]) !== String(logs[r][6])) { skipped++; continue; }
      sheet.getRange(row, col).setValue(String(logs[r][5]));
      values[row - 1][col - 1] = String(logs[r][5]);
      bk.getRange(r + 1, 9).setValue('ย้อนแล้ว');
      restored++;
    }
    return { result: 'OK', restored: restored, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

// ห่อผลลัพธ์เป็น JSONP — เลี่ยงปัญหา CORS เวลาเรียกข้ามโดเมน (Netlify -> Apps Script)
function jsonp(callback, obj) {
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// อ่านทั้งชีต "รายงาน" แปลงเป็น array ของ object (key = ชื่อหัวคอลัม)
function readSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('รายงาน');
  if (!sheet || sheet.getLastRow() < 2) return [];
  // อ่านตามลำดับคอลัมคงที่ (ตรงกับ saveToSheet) — ไม่อิงหัวตารางในชีต กัน mapping เพี้ยนถ้าหัวเก่าค้าง
  var FIELDS = ['timestamp','วันที่กรอก','คำนำหน้าครู','ชื่อครู','กลุ่มสาระ','รหัสวิชา','ชื่อรายวิชา','หน่วยกิต','ชั่วโมง/สัปดาห์','ภาคเรียน','ปีการศึกษา','ลำดับที่','เลขที่','คำนำหน้านักเรียน','ชื่อ-สกุล','ชั้น/ห้อง','คาบทั้งหมด','มาเรียน','ขาดเรียน','% การเข้าเรียน','หมายเหตุ'];
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r], obj = {};
    for (var c = 0; c < FIELDS.length; c++) {
      var v = row[c];
      if (v instanceof Date) v = v.toISOString(); // แปลงวันที่เป็น ISO string ให้ฝั่งเว็บ parse ได้
      obj[FIELDS[c]] = (v===undefined ? '' : v);
    }
    // เลขแถวจริงในชีต — ฝั่งเว็บใช้ระบุว่าจะให้แก้ช่องไหน ตอนสั่งแก้แผ่น "รายงาน"
    // ส่งคู่กับค่าเดิมเสมอ ฝั่งนี้จึงตรวจได้ว่าแถวยังตรงกันอยู่ก่อนเขียนทับ
    obj._row = r + 1;
    out.push(obj);
  }
  return out;
}

// รับข้อมูลจากเว็บ Netlify (POST request)
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // ===== บันทึก/ลบ ผลการตรวจสอบข้อมูล (มาจากหน้ารายงาน ต้องมีรหัสผ่าน) =====
    // ⚠️ ตัวรายการอยู่ใน data.fix ไม่ใช่ตัว data เอง เพราะทั้งคู่มีช่องชื่อ action
    //    ข้างนอกคือชนิดคำสั่ง (savefix) ข้างในคือผลการตัดสิน (merge / ignore)
    //    ถ้าอ่านจากตัว data ตรงๆ ช่อง "การกระทำ" ในชีตจะกลายเป็นคำว่า savefix ทุกแถว
    if (data.action === 'savefix') {
      var props2 = PropertiesService.getScriptProperties();
      var pass2 = props2.getProperty('REPORT_PASSWORD') || DEFAULT_REPORT_PASSWORD;
      if (String(data.key || '') !== String(pass2)) throw new Error('unauthorized');
      saveFix(data.fix || data);
      return ContentService
        .createTextOutput(JSON.stringify({ result: 'OK' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ===== แก้ข้อมูลในแผ่น "รายงาน" จริง / ย้อนกลับ (ต้องมีรหัสผ่านเหมือนกัน) =====
    if (data.action === 'applymain' || data.action === 'undomain') {
      var props3 = PropertiesService.getScriptProperties();
      var pass3 = props3.getProperty('REPORT_PASSWORD') || DEFAULT_REPORT_PASSWORD;
      if (String(data.key || '') !== String(pass3)) throw new Error('unauthorized');
      var res = (data.action === 'applymain') ? applyMainEdits(data) : undoMainEdits(data);
      return ContentService
        .createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    saveToSheet(data);
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'OK' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log('doPost error: ' + err); // เก็บรายละเอียดไว้ฝั่งเซิร์ฟเวอร์ ไม่ส่งกลับ
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'ERROR' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ลบแถวเก่าที่เป็น "การกรอกครั้งเดียวกัน" (submission_id เดียวกัน) — ลบล่างขึ้นบนกัน index เลื่อน
// แถวเก่าที่ไม่มี submission_id (ข้อมูลที่กรอกก่อนมีระบบนี้) จะไม่ถูกแตะ — ปลอดภัย ไม่หาย
function removeRowsBySubmissionId(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return;
  var values = sheet.getDataRange().getValues();
  // submission_id อยู่คอลัมที่ 22 (index 21)
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][21]) === String(id)) {
      sheet.deleteRow(r + 1); // sheet เป็น 1-indexed
    }
  }
}

// เขียนข้อมูลลง Google Sheet + กันบันทึกชนกัน
// บันทึกซ้ำด้วยรหัสเดิม (หน้าเดิมไม่ปิด) = ทับของเก่า | รหัสใหม่ (เปิดหน้าใหม่) = เพิ่มไม่ลบ
function saveToSheet(data) {
  // 🛡 กันข้อมูลหาย: ถ้าไม่มีรายชื่อนักเรียน หยุดทันที — อย่าลบของเก่าทิ้งโดยไม่มีอะไรเขียนกลับ
  if (!data || !Array.isArray(data.students) || data.students.length === 0) {
    throw new Error('ไม่มีรายชื่อนักเรียน — ยกเลิกการบันทึก (กันข้อมูลเดิมหาย)');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // กันหลายคนบันทึกพร้อมกัน — เข้าทีละคน ข้อมูลไม่ปนกัน
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = 'รายงาน';
    var sheet = ss.getSheetByName(sheetName);

    // สร้าง sheet ถ้ายังไม่มี
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // สร้างหัวตารางถ้า sheet ยังว่าง
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'timestamp', 'วันที่กรอก', 'คำนำหน้าครู', 'ชื่อครู',
        'กลุ่มสาระ', 'รหัสวิชา', 'ชื่อรายวิชา', 'หน่วยกิต',
        'ชั่วโมง/สัปดาห์', 'ภาคเรียน', 'ปีการศึกษา',
        'ลำดับที่', 'เลขที่', 'คำนำหน้านักเรียน', 'ชื่อ-สกุล', 'ชั้น/ห้อง',
        'คาบทั้งหมด', 'มาเรียน', 'ขาดเรียน', '% การเข้าเรียน', 'หมายเหตุ', 'submission_id'
      ]);
      var headerRange = sheet.getRange(1, 1, 1, 22);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#6b21a8');
      headerRange.setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // ถ้าเป็นการบันทึกซ้ำจากหน้าเดิม (รหัสเดิม) → ลบของเก่าทิ้งก่อน แล้วเขียนใหม่ = ทับ
    removeRowsBySubmissionId(sheet, data.submissionId);

    // เตรียมข้อมูลนักเรียนทุกคน (1 คน = 1 แถว) + แนบ submission_id ท้ายแถว
    var timestamp = new Date();
    var newRows = data.students.map(function(s) {
      return [
        timestamp, data.dateInput, data.teacherPrefix, data.teacherName,
        data.subjectGroup, data.subjectCode, data.subjectName, data.credits,
        data.hoursPerWeek, data.semester, data.academicYear,
        s.order, s.seat, s.prefix, s.name, s.classroom,
        s.periods, s.present, s.absent, s.percent, s.remark, (data.submissionId || '')
      ];
    });
    // เขียนทีเดียวทั้งชุด (เร็วกว่า appendRow ทีละแถว — ลดการคุยกับ Google เหลือครั้งเดียว)
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 22).setValues(newRows);
  } finally {
    lock.releaseLock();
  }
}
