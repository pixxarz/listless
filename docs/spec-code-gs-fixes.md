# สเปกสำหรับหลังบ้าน — เก็บผลการตรวจสอบข้อมูลไว้ในชีต

> เอกสารนี้สำหรับคนที่ดูแล Google Apps Script ของโปรเจกต์นี้
> ตอนนี้ระบบตรวจสอบข้อมูล (ชื่อ / ห้อง / วิชา) **ทำงานได้เต็มรูปแบบแล้ว** แต่ยังเก็บผลการตัดสินไว้ในเครื่องของคนที่กด
> ทำตามเอกสารนี้แล้วผลจะย้ายไปเก็บในชีต ทุกคนที่เปิดหน้ารายงานจะเห็นตรงกัน

---

## ทำไมต้องย้ายไปเก็บในชีต

ตอนนี้ถ้าครู ก. กดยืนยันว่า "สาธิตา ทานะปัด" กับ "สาธิตา ทานะปัต" คือคนเดียวกัน
**ครู ข. ที่เปิดหน้ารายงานจากอีกเครื่องจะไม่เห็นการรวมนั้น** ต้องมากดเองใหม่

พอย้ายมาเก็บในชีต ทุกเครื่องจะเห็นเหมือนกัน และไม่หายแม้ล้างเบราว์เซอร์

---

## สิ่งที่ต้องทำ 3 ขั้น

### ขั้นที่ 1 — สร้างแผ่นใหม่ในชีต

สร้างแผ่นชื่อ **`แก้ข้อมูล`** (ระบบสร้างให้อัตโนมัติได้ ถ้าใช้โค้ดข้างล่าง) มี 8 คอลัมน์

| คอลัมน์ | ชื่อหัวตาราง | เก็บอะไร | ตัวอย่าง |
|---|---|---|---|
| A | `id` | รหัสประจำรายการ (ระบบสร้างเอง ห้ามแก้มือ) | `room:สาทิดาทานะบัด` |
| B | `ชนิด` | `name` / `teacher` / `room` / `subject` | `room` |
| C | `การกระทำ` | `merge` = แก้ให้เหมือนกัน · `ignore` = ไม่ต้องแก้ | `merge` |
| D | `ค่าที่ใช้` | ค่าที่ถูกต้อง (ถ้าเป็นวิชาจะเป็นข้อความ JSON) | `ม.6/4` |
| E | `สมาชิก` | ค่าเดิมทั้งหมดที่ถูกรวม คั่นด้วย `||` | `ม.6/3||ม.6/4` |
| F | `หัวข้อ` | ชื่อที่แสดงในหน้าจอ | `สุพัตรา เปรยรัตน์` |
| G | `ผู้ตรวจ` | ชื่อคนที่กดยืนยัน | `ครูพิยะวุฒิ` |
| H | `เวลา` | เวลาที่กด | `2026-08-10T09:15:00.000Z` |

### ขั้นที่ 2 — วางโค้ดนี้เพิ่มใน `Code.gs`

วางต่อท้ายไฟล์ได้เลย ไม่ต้องแก้ของเดิม

```javascript
// ===== แผ่นเก็บผลการตรวจสอบข้อมูล (ชื่อ / ห้อง / วิชา) =====
var FIX_SHEET = 'แก้ข้อมูล';
var FIX_HEADERS = ['id','ชนิด','การกระทำ','ค่าที่ใช้','สมาชิก','หัวข้อ','ผู้ตรวจ','เวลา'];

function getFixSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FIX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FIX_SHEET);
    sh.appendRow(FIX_HEADERS);
    sh.getRange(1, 1, 1, FIX_HEADERS.length).setFontWeight('bold').setBackground('#6b21a8').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
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
      value: String(row[3]),
      members: String(row[4]) ? String(row[4]).split('||') : [],
      title: String(row[5]),
      by: String(row[6]),
      at: (row[7] instanceof Date) ? row[7].toISOString() : String(row[7])
    });
  }
  return out;
}

// บันทึกหรือลบรายการ — id เดิมทับของเก่า (ลบแถวเก่าก่อนแล้วเขียนใหม่)
function saveFix(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
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
    if (data.remove) return { result: 'OK', removed: true };  // ยกเลิกการตัดสิน = ลบอย่างเดียว

    sh.appendRow([
      id,
      String(data.type || ''),
      String(data.action || ''),
      String(data.value || ''),
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
```

จากนั้น **แก้ 2 ฟังก์ชันเดิม** ให้รู้จักคำสั่งใหม่

ใน `doGet` เพิ่มบรรทัดนี้ **ก่อน** บรรทัดที่เช็ครหัสผ่าน (ให้อยู่ถัดจากบล็อก `action === 'verify'`)

```javascript
    // ส่งรายการผลการตรวจสอบข้อมูลกลับไป (ต้องมีรหัสผ่าน เพราะมีชื่อคนอยู่ในนั้น)
    if (params.action === 'fixes') {
      var pw = PropertiesService.getScriptProperties().getProperty('REPORT_PASSWORD') || DEFAULT_REPORT_PASSWORD;
      if (String(params.key || '') !== String(pw)) return jsonp(callback, { error: 'unauthorized' });
      return jsonp(callback, { result: 'OK', fixes: readFixes() });
    }
```

ใน `doPost` เปลี่ยนบรรทัด `saveToSheet(data);` เป็น

```javascript
    if (data.action === 'savefix') {
      var pw2 = PropertiesService.getScriptProperties().getProperty('REPORT_PASSWORD') || DEFAULT_REPORT_PASSWORD;
      if (String(data.key || '') !== String(pw2)) throw new Error('unauthorized');
      saveFix(data);
    } else {
      saveToSheet(data);
    }
```

### ขั้นที่ 3 — Deploy เวอร์ชันใหม่

**สำคัญมาก** — แก้โค้ดอย่างเดียวยังไม่มีผล ต้องกด Deploy ด้วย

Apps Script → เมนู **Deploy** → **Manage deployments** → กดรูป **ดินสอ** → ช่อง Version เลือก **New version** → **Deploy**

ลิงก์ (`SHEET_URL`) จะไม่เปลี่ยน หน้าเว็บเดิมใช้ได้ต่อทันที

---

## ทดสอบว่าใช้ได้

เปิดลิงก์นี้ในเบราว์เซอร์ (แทน `รหัสผ่าน` ด้วยรหัสจริงของหน้ารายงาน)

```
<SHEET_URL>?action=fixes&key=รหัสผ่าน&callback=cb
```

ถ้าได้ผลลัพธ์หน้าตาแบบนี้ = ใช้ได้แล้ว

```
cb({"result":"OK","fixes":[]});
```

ถ้าได้ `{"error":"unauthorized"}` แปลว่ารหัสผ่านไม่ตรง · ถ้าได้ `{"error":"server"}` แปลว่าโค้ดมีปัญหา ให้ดูใน Executions

---

## ฝั่งหน้าเว็บต้องแก้อะไรบ้าง

ไฟล์ `js/fixes.js` มีจุดเดียวที่ต้องเปลี่ยน — ส่วนที่ทำเครื่องหมายไว้ว่า **"ที่เก็บผลการตัดสิน"**
ตอนนี้เป็นการอ่าน/เขียน `localStorage` ให้เปลี่ยนเป็นเรียกผ่าน `action=fixes` และ `action=savefix` แทน
โครงสร้างข้อมูลออกแบบให้ตรงกับคอลัมน์ในชีตอยู่แล้ว จึงไม่ต้องแก้ส่วนอื่นของระบบเลย

---

## หมายเหตุความปลอดภัย

- แผ่น `แก้ข้อมูล` มีชื่อนักเรียนและชื่อครูอยู่ จึง **บังคับใส่รหัสผ่านทั้งตอนอ่านและตอนบันทึก**
- ระบบไม่ได้แก้ข้อมูลในแผ่น `รายงาน` เลย ใบต้นฉบับและเอกสารที่ปริ้นไปแล้วยังเป็นค่าเดิมทุกตัวอักษร
- ผลการตัดสินเป็นแค่ "ชั้นทับ" ที่หน้ารายงานเอาไปใช้ตอนแสดงผล ยกเลิกเมื่อไหร่ข้อมูลก็กลับเป็นเดิมทันที
