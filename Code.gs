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
    var props = PropertiesService.getScriptProperties();
    var pass = props.getProperty('REPORT_PASSWORD') || DEFAULT_REPORT_PASSWORD;

    // เช็ครหัสผ่านฝั่งเซิร์ฟเวอร์ก่อนคืนข้อมูล (กันคนไม่มีรหัสดึงข้อมูล)
    if (String(params.key || '') !== String(pass)) {
      return jsonp(callback, { error: 'unauthorized' });
    }

    return jsonp(callback, { result: 'OK', rows: readSheet() });
  } catch (err) {
    return jsonp(callback, { error: 'server', message: err.message });
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
    out.push(obj);
  }
  return out;
}

// รับข้อมูลจากเว็บ Netlify (POST request)
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    saveToSheet(data);
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'OK' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'ERROR', message: err.message }))
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

    // เขียนข้อมูลนักเรียนแต่ละคน (1 คน = 1 แถว) + แนบ submission_id ท้ายแถว
    var timestamp = new Date();
    data.students.forEach(function(s) {
      sheet.appendRow([
        timestamp, data.dateInput, data.teacherPrefix, data.teacherName,
        data.subjectGroup, data.subjectCode, data.subjectName, data.credits,
        data.hoursPerWeek, data.semester, data.academicYear,
        s.order, s.seat, s.prefix, s.name, s.classroom,
        s.periods, s.present, s.absent, s.percent, s.remark, (data.submissionId || '')
      ]);
    });
  } finally {
    lock.releaseLock();
  }
}
