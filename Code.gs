// ====================================================
// Code.gs — วางไฟล์นี้ใน Google Apps Script
// ====================================================

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

// เขียนข้อมูลลง Google Sheet
function saveToSheet(data) {
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
      'ลำดับที่', 'คำนำหน้านักเรียน', 'ชื่อ-สกุล', 'ชั้น/ห้อง',
      'คาบทั้งหมด', 'มาเรียน', 'ขาดเรียน', '% การเข้าเรียน', 'หมายเหตุ'
    ]);
    var headerRange = sheet.getRange(1, 1, 1, 20);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#6b21a8');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  // เขียนข้อมูลนักเรียนแต่ละคน (1 คน = 1 แถว)
  var timestamp = new Date();
  data.students.forEach(function(s) {
    sheet.appendRow([
      timestamp, data.dateInput, data.teacherPrefix, data.teacherName,
      data.subjectGroup, data.subjectCode, data.subjectName, data.credits,
      data.hoursPerWeek, data.semester, data.academicYear,
      s.order, s.prefix, s.name, s.classroom,
      s.periods, s.present, s.absent, s.percent, s.remark
    ]);
  });
}
