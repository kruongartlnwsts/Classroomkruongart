/**
 * Project: Online Homework Submission System (Update: Fix Due Date Check)
 * Developer: ครูองอาจ อินต๊ะวงค์
 */

const SUPABASE_URL = 'https://gmoullxfmfauwubtruji.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb3VsbHhmbWZhdXd1YnRydWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MTk5NzUsImV4cCI6MjA5MzE5NTk3NX0.6RcXFN31PEt29sMex3Oc2u8Z6po48gd9c9VnO-io684';

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('ระบบส่งงานออนไลน์ - โรงเรียนบ้านสันติสุข')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'uploadSubmission') {
      const result = uploadSubmission(data);
      return ContentService.createTextOutput(JSON.stringify({ result: result }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid Action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  createSheetIfNotExists(ss, 'Config', ['Key', 'Value']);
  const configSheet = ss.getSheetByName('Config');
  if (configSheet.getLastRow() < 2) {
    configSheet.appendRow(['admin_password', '1234']); 
    configSheet.appendRow(['root_folder_id', '']); 
  }

  createSheetIfNotExists(ss, 'Classes', ['ClassID', 'ClassName']);
  createSheetIfNotExists(ss, 'Students', ['StudentID', 'Name', 'ClassID']);
  createSheetIfNotExists(ss, 'Subjects', ['SubjectID', 'SubjectName']);
  createSheetIfNotExists(ss, 'Assignments', ['AssignmentID', 'Title', 'SubjectID', 'ClassID', 'DueDate', 'Active']);
  createSheetIfNotExists(ss, 'Submissions', ['SubmissionID', 'AssignmentID', 'StudentID', 'FileURL', 'Timestamp', 'Score', 'Feedback']);
  createSheetIfNotExists(ss, 'Exams', ['ExamID', 'Title', 'SubjectID', 'ClassID', 'MaxQuestions', 'Active']);
  createSheetIfNotExists(ss, 'Questions', ['QuestionID', 'ExamID', 'QuestionText', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'Answer']);
  createSheetIfNotExists(ss, 'ExamResults', ['ResultID', 'ExamID', 'StudentID', 'Score', 'Timestamp', 'IsLocked']);
  createSheetIfNotExists(ss, 'Worksheets', ['WorksheetID', 'Title', 'SubjectID', 'ClassID', 'DriveLink', 'Description', 'CreatedDate']);

  return "Setup Complete";
}

function createSheetIfNotExists(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
  }
}

function getAllData() {
  const configRaw = getData('Config') || [];
  const geminiRow = configRaw.find(r => r[0] === 'gemini_api_key');
  const hasGemini = !!(geminiRow && geminiRow[1]); // ตรวจสอบว่าแอดมินเซ็ต API Key หรือยัง

  return {
    classes: getData('Classes') || [],
    students: getData('Students') || [],
    subjects: getData('Subjects') || [],
    assignments: getData('Assignments') || [],
    submissions: getData('Submissions') || [],
    exams: getData('Exams') || [],
    questions: getData('Questions') || [],
    examResults: getData('ExamResults') || [],
    worksheets: getData('Worksheets') || [],
    config: [['has_gemini', hasGemini]] // เซ็นเซอร์ไม่ส่งข้อมูล config หรือรหัสผ่านให้ Client แต่ส่งสถานะ API Key
  };
}

function getData(sheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return [];
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    return data.map(row => row.map(cell => {
      if (cell instanceof Date) {
        return Utilities.formatDate(cell, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      return cell;
    }));
  } catch (e) {
    return [];
  }
}

// --- Actions ---

function checkAdminPassword(inputPass) {
  const config = getData('Config');
  const savedPass = config.find(row => row[0] === 'admin_password');
  return savedPass ? (savedPass[1] == inputPass) : false;
}

function updatePassword(newPass) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  const data = sheet.getDataRange().getValues();
  for(let i=0; i<data.length; i++) {
    if(data[i][0] == 'admin_password') {
      sheet.getRange(i+1, 2).setValue(newPass);
      return true;
    }
  }
  return false;
}

function updateFolderId(newId) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  const data = sheet.getDataRange().getValues();
  for(let i=0; i<data.length; i++) {
    if(data[i][0] == 'root_folder_id') {
      sheet.getRange(i+1, 2).setValue(newId);
      return true;
    }
  }
  sheet.appendRow(['root_folder_id', newId]);
  return true;
}

function updateGeminiApiKey(newKey) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  const data = sheet.getDataRange().getValues();
  for(let i=0; i<data.length; i++) {
    if(data[i][0] == 'gemini_api_key') {
      sheet.getRange(i+1, 2).setValue(newKey);
      return true;
    }
  }
  sheet.appendRow(['gemini_api_key', newKey]);
  return true;
}

function addRow(sheetName, rowData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  sheet.appendRow(rowData);
  return "Success";
}

function deleteRow(sheetName, colIndex, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][colIndex] == value) {
      sheet.deleteRow(i + 1);
    }
  }
  return "Deleted";
}

function deleteSubmission(submissionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Submissions');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) { 
    if (data[i][0] == submissionId) {
      const fileUrl = data[i][3]; 
      if (fileUrl) {
        try {
          const idMatch = fileUrl.match(/[-\w]{25,}/);
          if(idMatch) {
            DriveApp.getFileById(idMatch[0]).setTrashed(true);
          }
        } catch (e) {
          Logger.log("File delete error: " + e.toString());
        }
      }
      sheet.deleteRow(i + 1);
      return "Deleted";
    }
  }
  return "Not Found";
}

function analyzeSubmissionWithGemini(subId, criteria, maxScore) {
  try {
    const configData = getData('Config');
    let apiKeyRow = configData.find(row => row[0] === 'gemini_api_key');
    let apiKey = apiKeyRow ? apiKeyRow[1] : '';
    if (!apiKey) return { error: "กรุณาตั้งค่า Gemini API Key ในส่วนตั้งค่าก่อนใช้งาน AI ตรวจงาน" };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Submissions');
    const data = sheet.getDataRange().getValues();
    let fileUrl = "";
    
    for (let i = 1; i < data.length; i++) { 
      if (data[i][0] == subId) {
        fileUrl = data[i][3]; 
        break;
      }
    }
    
    if (!fileUrl) return { error: "ไม่พบข้อมูลไฟล์ที่ส่ง" };
    
    const idMatch = fileUrl.match(/[-\w]{25,}/);
    if (!idMatch) return { error: "รูปแบบ URL ไฟล์ไม่ถูกต้อง ไม่สามารถดึงเชื่อมโยงไฟล์ได้" };
    
    const fileId = idMatch[0];
    const file = DriveApp.getFileById(fileId);
    if (!file) return { error: "หาไฟล์ในระบบ Google Drive ไม่พบ" };
    
    const mimeType = file.getMimeType();
    
    // สร้างข้อความรับคำสั่งตีกรอบพฤติกรรม AI
    const prompt = `ทำหน้าที่เป็นครูผู้ตรวจงาน\nวิเคราะห์และอ่านเนื้องานที่ส่งมา เพื่อประเมินคะแนนตามเกณฑ์\n\nเกณฑ์การให้คะแนน (Criteria): ${criteria}\nคะแนนเต็ม: ${maxScore} คะแนน\n\nโปรดส่งคืนผลลัพธ์ในรูปแบบ JSON โดยตอบกลับมาแค่ String ของ JSON เพียวๆ ห้ามใส่ \`\`\`json (markdown) ครอบ\nโครงสร้าง JSON คือ:\n{\n  "score": (ตัวเลขคะแนนที่ได้),\n  "feedback": "(คำวิจารณ์สั้นๆ 1-2 บรรทัดว่าพบข้อดี/ข้อควรปรับปรุงอย่างไรบ้าง ตามเกณฑ์)"\n}`;

    let payload = null;
    
    // รูปแบบการเรียกเนื้อหา (วิเคราะห์จาก MimeType)
    if (mimeType === MimeType.GOOGLE_DOCS || mimeType === MimeType.PLAIN_TEXT) {
       let textContent = "";
       if (mimeType === MimeType.GOOGLE_DOCS) {
           textContent = DocumentApp.openById(fileId).getBody().getText();
       } else {
           textContent = file.getBlob().getDataAsString();
       }
       // ตัดข้อความถ้าเกิน 30K ตัวอักษร เพื่อประหยัด Token API
       if (textContent.length > 30000) textContent = textContent.slice(0, 30000) + '... (ข้อความยาวเกินไป)';
       
       payload = {
            contents: [{
                parts: [
                    {text: prompt + "\n\n=== เนื้อหาผลงาน ===\n" + textContent}
                ]
            }],
            generationConfig: { response_mime_type: "application/json" }
        };
    } else {
       // รองรับภาพและ PDF (Gemini 1.5 Flash สามารถอ่าน PDF base64 ผ่าน inline_data ได้)
       const supportedMimes = [
         MimeType.JPEG, MimeType.PNG, MimeType.BMP, MimeType.PDF, "image/webp", "image/heic"
       ];
       if (supportedMimes.includes(mimeType)) {
          const base64Bytes = Utilities.base64Encode(file.getBlob().getBytes());
          payload = {
              contents: [{
                  parts: [
                      {text: prompt},
                      {
                          inline_data: {
                              mime_type: mimeType === MimeType.BMP ? MimeType.JPEG : mimeType, // หลบเลี่ยงบั๊กบางเวอร์ชั่น
                              data: base64Bytes
                          }
                      }
                  ]
              }],
              generationConfig: { response_mime_type: "application/json" }
          };
       } else {
          return { error: `AI ยังไม่รองรับการตรวจไฟล์ประเภท ${mimeType} (รองรับ ไฟล์เอกสาร, รูปภาพ และ PDF)` };
       }
    }

    // --- Dynamic Model Selection with Retry logic ---
    let modelsToTry = ["models/gemini-1.5-flash-latest"]; // default fallback
    try {
        const listRes = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey, {muteHttpExceptions: true});
        if (listRes.getResponseCode() === 200) {
            const modelsData = JSON.parse(listRes.getContentText());
            if (modelsData.models) {
                const supportedModels = modelsData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
                const preferred = ["gemini-3.1-flash", "gemini-3.0-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-flash"];
                const foundModels = [];
                for (let pref of preferred) {
                    let found = supportedModels.find(m => m.name === "models/" + pref || m.name === "models/" + pref + "-latest" || m.name.includes(pref));
                    if (found && !foundModels.includes(found.name)) { foundModels.push(found.name); }
                }
                
                // Add all other flash models
                supportedModels.filter(m => m.name.includes("flash")).forEach(m => {
                    if (!foundModels.includes(m.name)) foundModels.push(m.name);
                });
                
                // Add any remaining supported models
                supportedModels.forEach(m => {
                    if (!foundModels.includes(m.name)) foundModels.push(m.name);
                });

                if (foundModels.length > 0) modelsToTry = foundModels;
            }
        }
    } catch(e) { }

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    let resultObj = null;
    let lastError = null;

    for (let currentModel of modelsToTry) {
        const url = "https://generativelanguage.googleapis.com/v1beta/" + currentModel + ":generateContent?key=" + apiKey;
        const response = UrlFetchApp.fetch(url, options);
        resultObj = JSON.parse(response.getContentText());
        
        if (resultObj.error) {
           lastError = resultObj.error.message;
           // Retry with next requested model if it's a quota/rate-limit issue
           if (response.getResponseCode() === 429 || lastError.toLowerCase().includes("quota") || lastError.toLowerCase().includes("limit:")) {
               continue;
           }
           // Break for normal errors (like Safety issue or invalid API key)
           break;
        } else {
           // Success
           break; 
        }
    }

    if (!resultObj || resultObj.error) {
       let errorMsg = lastError || "Unknown Error";
       if (errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("limit: 0")) {
           errorMsg = "API Key ของคุณติด Limit/Quota Exceeded (อาจไม่รองรับแบบฟรีในภูมิภาคนี้ หรือโควต้ารายวันเต็มแล้ว) กรุณาตรวจสอบหรือเปลี่ยนการตั้งค่า Billing ใน Google AI Studio";
       }
       return { error: "Gemini API Error: " + errorMsg };
    }
    
    if (resultObj.candidates && resultObj.candidates.length > 0) {
      const parts = resultObj.candidates[0].content.parts;
      if (parts && parts.length > 0) {
        let aiText = parts[0].text;
        // กรณี AI ส่ง Markdown ติดมา
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        const finalObj = JSON.parse(aiText);
        return {
           success: true,
           score: finalObj.score || 0,
           feedback: finalObj.feedback || "-"
        };
      }
    }
    
    return { error: "AI วิเคราะห์ผลลัพธ์ไม่สำเร็จ (ไม่มีส่วน Response ตรงตามรูปแบบ)" };
    
  } catch(e) {
    return { error: "เกิดข้อผิดพลาดในการรัน AI: " + e.toString() };
  }
}

function importStudentsCSV(csvData, classId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Students');
  const rows = csvData.split('\n');
  rows.forEach(row => {
    const name = row.trim();
    if(name) {
      const id = 'S' + new Date().getTime() + Math.floor(Math.random()*1000);
      sheet.appendRow([id, name, classId]);
    }
  });
  return "Imported";
}

function uploadSubmission(formObject) {
  const lock = LockService.getScriptLock();
  try {
    // ให้คอยคิวได้สูงสุด 30 วินาที ป้องกันข้อมูลทับซ้อนเมื่อเด็กกดส่งพร้อมกัน
    lock.waitLock(30000); 
  } catch (e) {
    return "Error: " + "ระบบกำลังประมวลผลให้เพื่อนคนอื่นอยู่ กรุณาลองกดส่งใหม่อีกครั้ง";
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // --- 1. ตรวจสอบการส่งซ้ำ (Duplicate Check) ---
    const subSheet = ss.getSheetByName('Submissions');
    const existingData = subSheet.getDataRange().getValues();
    for (let i = 1; i < existingData.length; i++) {
        if (existingData[i][1] == formObject.assignmentId && existingData[i][2] == formObject.studentId) {
            return "ERROR_DUPLICATE";
        }
    }

    // --- 2. ตรวจสอบวันหมดเขต (Due Date Check) ---
    const assignSheet = ss.getSheetByName('Assignments');
    const assignData = assignSheet.getDataRange().getValues();
    for (let i = 1; i < assignData.length; i++) {
        if (assignData[i][0] == formObject.assignmentId) {
            const dueDateValue = assignData[i][4]; // Column 5 is DueDate
            if (dueDateValue) {
                const dueDate = new Date(dueDateValue);
                // กำหนดให้ส่งได้จนถึงสิ้นวันของวันที่กำหนด (23:59:59)
                dueDate.setHours(23, 59, 59, 999);
                const now = new Date();
                if (now > dueDate) {
                    return "ERROR_LATE";
                }
            }
            break;
        }
    }

    const configData = getData('Config');
    let rootFolderId = configData.find(row => row[0] === 'root_folder_id');
    rootFolderId = rootFolderId ? rootFolderId[1] : '';

    if (!rootFolderId) throw new Error("ERROR_NO_FOLDER: ยังไม่ได้กำหนด Root Folder ID");

    const fileData = formObject.fileData;
    const fileName = formObject.fileName;
    const studentName = formObject.studentName;
    const className = formObject.className;
    const assignmentTitle = formObject.assignmentTitle;

    const contentType = fileData.substring(5, fileData.indexOf(';'));
    const bytes = Utilities.base64Decode(fileData.substr(fileData.indexOf('base64,')+7));
    const blob = Utilities.newBlob(bytes, contentType, fileName);

    const rootFolder = DriveApp.getFolderById(rootFolderId);
    
    let classFolder;
    const classFolders = rootFolder.getFoldersByName(className);
    if (classFolders.hasNext()) { classFolder = classFolders.next(); } 
    else { classFolder = rootFolder.createFolder(className); }

    let studentFolder;
    const studentFolders = classFolder.getFoldersByName(studentName);
    if (studentFolders.hasNext()) { studentFolder = studentFolders.next(); } 
    else { studentFolder = classFolder.createFolder(studentName); }

    const file = studentFolder.createFile(blob);
    
    let extension = "";
    if(fileName.lastIndexOf(".") !== -1) {
      extension = fileName.substring(fileName.lastIndexOf("."));
    }
    file.setName(assignmentTitle + extension); 

    const subId = 'SUB' + new Date().getTime();
    subSheet.appendRow([
      subId, 
      formObject.assignmentId, 
      formObject.studentId, 
      file.getUrl(), 
      new Date(), 
      '', 
      '' 
    ]);

    // --- 3. Sync to Supabase ---
    try {
      const supabasePayload = {
        assignment_id: formObject.assignmentId,
        student_id: formObject.studentId,
        file_url: file.getUrl()
      };
      
      const supabaseOptions = {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        },
        payload: JSON.stringify(supabasePayload),
        muteHttpExceptions: true
      };
      
      const response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/submissions', supabaseOptions);
      console.log("Supabase Sync Response: " + response.getContentText());
    } catch (supabaseErr) {
      console.log("Supabase Sync Error: " + supabaseErr.toString());
    }

    return "Success";

  } catch (e) {
    return "Error: " + e.toString();
  } finally {
    // ปล่อยล็อคเมื่อทำงานเสร็จหรือเกิดข้อผิดพลาด
    lock.releaseLock();
  }
}

function updateScore(submissionId, score, feedback) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Submissions');
  const data = sheet.getDataRange().getValues();
  for(let i=0; i<data.length; i++) {
    if(data[i][0] == submissionId) {
      sheet.getRange(i+1, 6).setValue(score);
      if(feedback !== undefined) {
        sheet.getRange(i+1, 7).setValue(feedback);
      }
      return "Updated";
    }
  }
}

function updateMultipleScoresAndFeedback(updates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Submissions');
  const data = sheet.getDataRange().getValues();
  
  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[data[i][0]] = i + 1; 
  }

  updates.forEach(update => {
    const row = idMap[update.id];
    if (row) {
      sheet.getRange(row, 6).setValue(update.score);
      if(update.feedback !== undefined) {
        sheet.getRange(row, 7).setValue(update.feedback);
      }
    }
  });

  return "Batch Updated";
}

function updateMultipleScores(updates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Submissions');
  const data = sheet.getDataRange().getValues();
  
  const idMap = {};
  for (let i = 1; i < data.length; i++) {
    idMap[data[i][0]] = i + 1; 
  }

  updates.forEach(update => {
    const row = idMap[update.id];
    if (row) {
      sheet.getRange(row, 6).setValue(update.score);
    }
  });

  return "Batch Updated";
}

function updateStudent(studentId, newName, classId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(data[i][0] == studentId) {
      sheet.getRange(i+1, 2).setValue(newName);
      sheet.getRange(i+1, 3).setValue(classId);
      return "Updated";
    }
  }
  return "Not Found";
}

function updateAssignment(id, title, subjectId, classId, dueDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Assignments');
  const data = sheet.getDataRange().getValues();
  for(let i=0; i<data.length; i++) {
    if(data[i][0] == id) {
      sheet.getRange(i+1, 2).setValue(title);
      sheet.getRange(i+1, 3).setValue(subjectId);
      sheet.getRange(i+1, 4).setValue(classId);
      sheet.getRange(i+1, 5).setValue(dueDate);
      return "Updated";
    }
  }
  return "Not Found";
}

// *** Generate Report (Sarabun Font 16pt & Beautiful Table & Landscape) ***
function generateReport(classId, type) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Prepare Data
  const classData = ss.getSheetByName('Classes').getDataRange().getValues();
  let className = "ไม่ระบุชั้นเรียน";
  for(let i=1; i<classData.length; i++) {
    if(classData[i][0] == classId) { className = classData[i][1]; break; }
  }

  const allStudents = ss.getSheetByName('Students').getDataRange().getValues();
  const students = allStudents.filter(r => r[2] == classId);
  if(students.length === 0) return { error: "ไม่มีนักเรียนในชั้นเรียนนี้" };

  const allAssigns = ss.getSheetByName('Assignments').getDataRange().getValues();
  const assignments = allAssigns.filter(r => r[3] == classId); 

  const allSubs = ss.getSheetByName('Submissions').getDataRange().getValues();

  const header = ["ชื่อ-สกุล"];
  assignments.forEach(a => header.push(a[1])); 
  header.push("รวมคะแนน");

  const tableData = [header];

  students.forEach(stu => {
    const row = [stu[1]]; 
    let totalScore = 0;
    
    assignments.forEach(assign => {
      const sub = allSubs.find(s => s[1] == assign[0] && s[2] == stu[0]);
      let score = "";
      if(sub && sub[5] !== "") {
        score = sub[5];
        totalScore += parseFloat(score) || 0;
      }
      row.push(score);
    });
    
    row.push(totalScore);
    tableData.push(row);
  });

  // 2. Export Logic
  if (type === 'pdf') {
    // --- PDF Generation using DocumentApp ---
    const doc = DocumentApp.create('Report_' + className);
    const body = doc.getBody();
    
    // Set Page Orientation to Landscape (A4: 595.276 x 841.89 points)
    body.setPageHeight(595.276);
    body.setPageWidth(841.89);
    
    // Define Fonts & Styles
    const fontName = 'Sarabun'; 
    const fontSize = 16;

    const titleStyle = {};
    titleStyle[DocumentApp.Attribute.FONT_FAMILY] = fontName;
    titleStyle[DocumentApp.Attribute.FONT_SIZE] = 20;
    titleStyle[DocumentApp.Attribute.BOLD] = true;
    titleStyle[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = DocumentApp.HorizontalAlignment.CENTER;

    const subtitleStyle = {};
    subtitleStyle[DocumentApp.Attribute.FONT_FAMILY] = fontName;
    subtitleStyle[DocumentApp.Attribute.FONT_SIZE] = 18;
    subtitleStyle[DocumentApp.Attribute.BOLD] = true;
    subtitleStyle[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = DocumentApp.HorizontalAlignment.CENTER;

    const normalStyle = {};
    normalStyle[DocumentApp.Attribute.FONT_FAMILY] = fontName;
    normalStyle[DocumentApp.Attribute.FONT_SIZE] = fontSize;

    // Header Content
    body.appendParagraph("รายงานคะแนนสะสม").setAttributes(titleStyle);
    body.appendParagraph("ชั้นเรียน: " + className).setAttributes(subtitleStyle);
    const datePara = body.appendParagraph("วันที่ออกรายงาน: " + Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm"));
    datePara.setAttributes(normalStyle);
    datePara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    body.appendParagraph(" "); // Spacer

    // Table Content
    const table = body.appendTable(tableData);
    
    // Table Styling
    table.setBorderWidth(1).setBorderColor('#000000'); // Solid black border
    
    const numRows = table.getNumRows();
    for (let i = 0; i < numRows; i++) {
        const row = table.getRow(i);
        const numCells = row.getNumCells();
        for (let j = 0; j < numCells; j++) {
            const cell = row.getCell(j);
            
            // Set Font 16 for all cells
            if (cell.getNumChildren() > 0) {
               for (let k = 0; k < cell.getNumChildren(); k++) {
                   const child = cell.getChild(k);
                   if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
                       child.asParagraph().setAttributes(normalStyle);
                   }
               }
            }
            
            cell.setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(5).setPaddingRight(5);
            
            if (i === 0) {
                // Header Row Style
                cell.setBackgroundColor('#D9D9D9'); // Light Gray
                if(cell.getNumChildren() > 0) {
                    const p = cell.getChild(0).asParagraph();
                    p.setBold(true);
                    p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
                }
            } else {
                // Data Row Style
                if (j > 0) { // Scores and Total -> Center Align
                    if(cell.getNumChildren() > 0) {
                        cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
                    }
                }
            }
        }
    }

    doc.saveAndClose();
    
    // Convert to PDF
    const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
    const base64 = Utilities.base64Encode(pdfBlob.getBytes());
    
    DriveApp.getFileById(doc.getId()).setTrashed(true); // Delete temp file
    
    return { base64: base64, filename: `Report_${className}.pdf` };

  } else if (type === 'word') {
    // --- Word Generation using HTML/CSS ---
    let html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Report</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>
            @page { size: landscape; } /* Set Landscape for Word */
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
            
            body { 
                font-family: 'Sarabun', 'TH Sarabun New', sans-serif; 
                font-size: 16pt; 
            }
            h2 { font-size: 20pt; text-align: center; margin-bottom: 5px; }
            h3 { font-size: 18pt; text-align: center; margin-top: 0; }
            p { font-size: 16pt; }
            
            table { 
                border-collapse: collapse; 
                width: 100%; 
                font-family: 'Sarabun', 'TH Sarabun New', sans-serif; 
                font-size: 16pt;
                margin-top: 20px;
            }
            td, th { 
                border: 1px solid #000000; 
                padding: 8px; 
                vertical-align: middle;
            }
            th { 
                background-color: #D9D9D9; 
                font-weight: bold;
                text-align: center;
            }
            td { text-align: center; }
            td:first-child { text-align: left; } /* Align names to left */
            .text-right { text-align: right; }
        </style>
      </head>
      <body>
        <h2>รายงานคะแนนสะสม</h2>
        <h3>ชั้นเรียน: ${className}</h3>
        <p class="text-right">วันที่: ${Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm")}</p>
        <table>
    `;
    
    tableData.forEach((row, i) => {
      html += "<tr>";
      row.forEach((cell, j) => {
        const tag = i === 0 ? "th" : "td";
        html += `<${tag}>${cell === "" ? "-" : cell}</${tag}>`;
      });
      html += "</tr>";
    });
    
    html += "</table></body></html>";
    
    return { content: html, filename: `Report_${className}.doc` };
  }
}

// --- Exam System Functions ---
function saveExam(id, title, subjectId, classId, maxQuestions, active) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Exams');
  if (id) {
    const data = sheet.getDataRange().getValues();
    for(let i=0; i<data.length; i++) {
      if(data[i][0] == id) {
        sheet.getRange(i+1, 2).setValue(title);
        sheet.getRange(i+1, 3).setValue(subjectId);
        sheet.getRange(i+1, 4).setValue(classId);
        sheet.getRange(i+1, 5).setValue(maxQuestions);
        sheet.getRange(i+1, 6).setValue(active);
        return "Updated";
      }
    }
  } else {
    sheet.appendRow(['EXM' + Date.now(), title, subjectId, classId, maxQuestions || 50, active || 'Active']);
    return "Added";
  }
}

function saveQuestion(examId, qId, qText, optA, optB, optC, optD, ans) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Questions');
  if (qId) {
    const data = sheet.getDataRange().getValues();
    for(let i=0; i<data.length; i++) {
      if(data[i][0] == qId) {
        sheet.getRange(i+1, 3).setValue(qText);
        sheet.getRange(i+1, 4).setValue(optA);
        sheet.getRange(i+1, 5).setValue(optB);
        sheet.getRange(i+1, 6).setValue(optC);
        sheet.getRange(i+1, 7).setValue(optD);
        sheet.getRange(i+1, 8).setValue(ans);
        return "Updated";
      }
    }
  } else {
    sheet.appendRow(['Q' + Date.now() + Math.floor(Math.random()*1000), examId, qText, optA, optB, optC, optD, ans]);
    return "Added";
  }
}

function submitExam(examId, studentId, score) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ExamResults');
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(data[i][1] == examId && data[i][2] == studentId) {
      return "ERROR_LOCKED"; // If taken at all, block it. Requires teacher to unlock.
    }
  }
  sheet.appendRow(['RES' + Date.now(), examId, studentId, score, new Date(), true]);
  return "Success";
}

function unlockExam(resultId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ExamResults');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] == resultId) {
      sheet.deleteRow(i + 1); // Delete the record entirely to unlock
      return "Unlocked";
    }
  }
  return "Not Found";
}

function saveMultipleQuestions(examId, questions) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Questions');
  
  if (!questions || questions.length === 0) return "No data";
  
  const rows = [];
  const now = Date.now();
  questions.forEach((q, idx) => {
    rows.push([
      'Q' + (now + idx) + Math.floor(Math.random()*1000), 
      examId, 
      q.text, 
      q.a, 
      q.b, 
      q.c, 
      q.d, 
      q.ans
    ]);
  });
  
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return "Added";
}

// --- Worksheet System Functions ---
function saveWorksheet(id, title, subjectId, classId, driveLink, description) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Worksheets');
  if (id) {
    // Update existing
    const data = sheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] == id) {
        sheet.getRange(i+1, 2).setValue(title);
        sheet.getRange(i+1, 3).setValue(subjectId);
        sheet.getRange(i+1, 4).setValue(classId);
        sheet.getRange(i+1, 5).setValue(driveLink);
        sheet.getRange(i+1, 6).setValue(description);
        return "Updated";
      }
    }
  } else {
    // Create new
    sheet.appendRow(['WS' + Date.now(), title, subjectId, classId, driveLink, description, new Date()]);
    return "Added";
  }
}