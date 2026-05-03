// Mock Google Apps Script Interface using Supabase
(function() {
    const methods = [
        'getAllData', 'uploadSubmission', 'checkAdminPassword', 'saveWorksheet', 
        'deleteRow', 'saveExam', 'saveQuestion', 'submitExam', 'unlockExam',
        'deleteSubmission', 'addAssignment', 'updateAssignment', 'updateScore',
        'updateMultipleScoresAndFeedback', 'updateMultipleScores',
        'saveGeminiKey', 'saveFolderID', 'changePassword', 'analyzeSubmissionWithGemini',
        'generateReport', 'saveMultipleQuestions', 'addClass', 'addStudent', 'importCSV',
        'updatePassword', 'addRow', 'updateFolderId', 'updateGeminiApiKey', 'updateStudent'
    ];

    function createRunner(onSuccess, onFailure) {
        const runner = {};
        methods.forEach(method => {
            runner[method] = async function(...args) {
                try {
                    const result = await backendMocks[method](...args);
                    if (onSuccess) onSuccess(result);
                } catch (err) {
                    if (onFailure) onFailure(err);
                    else console.error("Unhandled Backend Error in " + method + ":", err);
                }
            };
        });
        runner.withSuccessHandler = function(callback) {
            return createRunner(callback, onFailure);
        };
        runner.withFailureHandler = function(callback) {
            return createRunner(onSuccess, callback);
        };
        return runner;
    }

    window.google = {
        script: {
            run: createRunner()
        }
    };
})();

const backendMocks = {
    getAllData: async () => {
        const fetchTable = async (table) => {
            const { data, error } = await supabaseClient.from(table).select('*');
            if (error) { console.error(`Error fetching ${table}:`, error); return []; }
            return data;
        };

        const [classesRaw, studentsRaw, subjectsRaw, assignmentsRaw, submissionsRaw, examsRaw, questionsRaw, examResultsRaw, worksheetsRaw, configRaw] = await Promise.all([
            fetchTable('classes'), fetchTable('students'), fetchTable('subjects'), fetchTable('assignments'),
            fetchTable('submissions'), fetchTable('exams'), fetchTable('questions'), fetchTable('exam_results'),
            fetchTable('worksheets'), fetchTable('config')
        ]);

        const transform = (raw, mapping) => raw.map(item => mapping.map(key => {
            let val = item[key];
            if ((key === 'is_active' || key === 'is_locked') && val === true) return 'Active';
            if ((key === 'is_active' || key === 'is_locked') && val === false) return 'Inactive';
            if (val && (key === 'created_at' || key === 'due_date')) {
                try { return new Date(val).toISOString().split('T')[0]; } catch(e) { return val; }
            }
            return val !== undefined ? val : "";
        }));

        return {
            classes: transform(classesRaw, ['id', 'name']),
            students: transform(studentsRaw, ['id', 'name', 'class_id']),
            subjects: transform(subjectsRaw, ['id', 'name']),
            assignments: transform(assignmentsRaw, ['id', 'title', 'subject_id', 'class_id', 'due_date', 'is_active']),
            submissions: transform(submissionsRaw, ['id', 'assignment_id', 'student_id', 'file_url', 'created_at', 'score', 'feedback']),
            exams: transform(examsRaw, ['id', 'title', 'subject_id', 'class_id', 'max_questions', 'is_active']),
            questions: transform(questionsRaw, ['id', 'exam_id', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'answer']),
            examResults: transform(examResultsRaw, ['id', 'exam_id', 'student_id', 'score', 'created_at', 'is_locked']),
            worksheets: transform(worksheetsRaw, ['id', 'title', 'subject_id', 'class_id', 'drive_link', 'description', 'created_at']),
            config: configRaw.map(c => [c.key, c.value])
        };
    },
    
    checkAdminPassword: async (inputPass) => {
        const { data, error } = await supabaseClient.from('config').select('value').eq('key', 'admin_password').maybeSingle();
        if (error) { console.error("Error checking password:", error); return false; }
        return data && data.value === inputPass;
    },
    
    changePassword: async (newPass) => {
        const { error } = await supabaseClient.from('config').upsert({ key: 'admin_password', value: newPass });
        if(error) throw new Error(error.message);
        return true;
    },

    uploadSubmission: async (formObject) => {
        const { data: existing } = await supabaseClient.from('submissions')
            .select('id')
            .eq('assignment_id', formObject.assignmentId)
            .eq('student_id', formObject.studentId);
        
        if (existing && existing.length > 0) return "ERROR_DUPLICATE";

        const { data: assign, error: assignError } = await supabaseClient.from('assignments').select('due_date').eq('id', formObject.assignmentId).maybeSingle();
        if (assignError || !assign) { console.error("Assignment not found"); return "Error: Assignment not found"; }

        // Logic for Drive Upload (handled via backend script proxy)
        const response = await fetch(window.GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'uploadFileOnly',
                fileData: formObject.fileData,
                fileName: formObject.fileName,
                studentName: formObject.studentName,
                className: formObject.className,
                assignmentTitle: formObject.assignmentTitle
            })
        });
        const driveRes = await response.json();
        
        if (driveRes.status === 'success') {
            await supabaseClient.from('submissions').insert({
                id: 'SUB' + Date.now(),
                assignment_id: formObject.assignmentId,
                student_id: formObject.studentId,
                file_url: driveRes.url
            });
            return "Success";
        }
        return "Error Uploading to Drive";
    },

    saveWorksheet: async (id, title, subjectId, classId, driveLink, description) => {
        const payload = { title, subject_id: subjectId, class_id: classId, drive_link: driveLink, description };
        if (id) {
            await supabaseClient.from('worksheets').update(payload).eq('id', id);
        } else {
            const newId = 'W' + Date.now();
            await supabaseClient.from('worksheets').insert({ id: newId, ...payload });
        }
        return "Success";
    },

    deleteRow: async (sheetName, colIndex, value) => {
        const tableMap = {
            'Classes': 'classes', 'Students': 'students', 'Subjects': 'subjects',
            'Assignments': 'assignments', 'Worksheets': 'worksheets', 'Exams': 'exams',
            'Questions': 'questions', 'Submissions': 'submissions'
        };
        const table = tableMap[sheetName];
        if (!table) return "Not Found";
        
        await supabaseClient.from(table).delete().eq('id', value);
        return "Deleted";
    },

    saveExam: async (id, title, subjectId, classId, maxQuestions, active) => {
        const payload = { title, subject_id: subjectId, class_id: classId, max_questions: maxQuestions, is_active: active === 'Active' };
        if (id) {
            await supabaseClient.from('exams').update(payload).eq('id', id);
        } else {
            const newId = 'E' + Date.now();
            await supabaseClient.from('exams').insert({ id: newId, ...payload });
        }
        return "Success";
    },

    saveQuestion: async (examId, qId, qText, optA, optB, optC, optD, ans) => {
        const payload = { exam_id: examId, question_text: qText, option_a: optA, option_b: optB, option_c: optC, option_d: optD, answer: ans };
        if (qId) {
            await supabaseClient.from('questions').update(payload).eq('id', qId);
        } else {
            const newId = 'Q' + Date.now();
            await supabaseClient.from('questions').insert({ id: newId, ...payload });
        }
        return "Success";
    },

    submitExam: async (examId, studentId, score) => {
        const { data: existing } = await supabaseClient.from('exam_results').select('id').eq('exam_id', examId).eq('student_id', studentId);
        if (existing && existing.length > 0) return "ERROR_LOCKED";

        const newId = 'RES' + Date.now();
        await supabaseClient.from('exam_results').insert({ id: newId, exam_id: examId, student_id: studentId, score: score, is_locked: true });
        return "Success";
    },

    unlockExam: async (resultId) => {
        await supabaseClient.from('exam_results').delete().eq('id', resultId);
        return "Success";
    },

    deleteSubmission: async (submissionId) => {
        await supabaseClient.from('submissions').delete().eq('id', submissionId);
        return "Deleted";
    },

    addAssignment: async (title, subjectId, classId, dueDate) => {
        const newId = 'A' + Date.now();
        await supabaseClient.from('assignments').insert({ id: newId, title, subject_id: subjectId, class_id: classId, due_date: dueDate || null });
        return "Success";
    },

    updateAssignment: async (id, title, subjectId, classId, dueDate) => {
        await supabaseClient.from('assignments').update({ title, subject_id: subjectId, class_id: classId, due_date: dueDate || null }).eq('id', id);
        return "Updated";
    },

    updateScore: async (submissionId, score, feedback) => {
        const payload = { score };
        if (feedback !== undefined) payload.feedback = feedback;
        await supabaseClient.from('submissions').update(payload).eq('id', submissionId);
        return "Updated";
    },

    updateMultipleScoresAndFeedback: async (updates) => {
        for (const update of updates) {
            await supabaseClient.from('submissions').update({ score: update.score, feedback: update.feedback }).eq('id', update.id);
        }
        return "Batch Updated";
    },
    
    updateMultipleScores: async (updates) => {
        for (const update of updates) {
            await supabaseClient.from('submissions').update({ score: update.score }).eq('id', update.id);
        }
        return "Batch Updated";
    },

    addClass: async (name) => {
        const newId = 'C' + Date.now();
        await supabaseClient.from('classes').insert({ id: newId, name });
        return "Success";
    },

    addStudent: async (classId, name) => {
        const newId = 'S' + Date.now();
        await supabaseClient.from('students').insert({ id: newId, class_id: classId, name });
        return "Success";
    },

    importCSV: async (csvData, classId) => {
        const rows = csvData.split('\n');
        const inserts = [];
        rows.forEach(row => {
            const name = row.trim();
            if(name) {
                const newId = 'S' + Date.now() + Math.random().toString(36).substr(2, 5);
                inserts.push({ id: newId, name, class_id: classId });
            }
        });
        if(inserts.length > 0) await supabaseClient.from('students').insert(inserts);
        return "Imported";
    },

    updateFolderId: async (id) => {
        const { error } = await supabaseClient.from('config').upsert({ key: 'root_folder_id', value: id });
        if(error) throw new Error(error.message);
        return "Success";
    },
    updateGeminiApiKey: async (key) => {
        const { error } = await supabaseClient.from('config').upsert({ key: 'gemini_api_key', value: key });
        if(error) throw new Error(error.message);
        return "Success";
    },
    saveFolderID: async (id) => { return await backendMocks.updateFolderId(id); },
    saveGeminiKey: async (key) => {
        const { error } = await supabaseClient.from('config').upsert({ key: 'gemini_api_key', value: key });
        if(error) throw new Error(error.message);
        return "Success";
    },

    saveMultipleQuestions: async (examId, questionsData) => {
        const inserts = questionsData.map(q => ({
            id: 'Q' + Date.now() + Math.random().toString(36).substr(2, 5),
            exam_id: examId, question_text: q.text, option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, answer: q.ans
        }));
        await supabaseClient.from('questions').insert(inserts);
        return "Success";
    },

    addRow: async (tableName, rowData) => {
        if (tableName === 'Classes') {
            await supabaseClient.from('classes').insert({ id: rowData[0], name: rowData[1] });
        } else if (tableName === 'Students') {
            await supabaseClient.from('students').insert({ id: rowData[0], name: rowData[1], class_id: rowData[2] });
        } else if (tableName === 'Subjects') {
            await supabaseClient.from('subjects').insert({ id: rowData[0], name: rowData[1] });
        } else if (tableName === 'Worksheets') {
            await supabaseClient.from('worksheets').insert({ 
                id: rowData[0], title: rowData[1], subject_id: rowData[2], class_id: rowData[3], 
                drive_link: rowData[4], description: rowData[5] 
            });
        } else if (tableName === 'Assignments') {
            await supabaseClient.from('assignments').insert({ 
                id: rowData[0], title: rowData[1], subject_id: rowData[2], class_id: rowData[3], 
                due_date: rowData[4] || null,
                is_active: rowData[5] === 'Active'
            });
        }
        return "Success";
    },

    updateStudent: async (studentId, name, classId) => {
        await supabaseClient.from('students').update({ name, class_id: classId }).eq('id', studentId);
        return "Updated";
    },

    generateReport: async (classId, type) => {
        return { error: "ฟีเจอร์นี้ต้องใช้งานผ่าน Client-Side (jsPDF)" };
    },
    
    analyzeSubmissionWithGemini: async (subId, criteria, maxScore) => {
        return { error: "AI Grading is mocked. Setup Gemini REST endpoint or use Vercel Serverless Function." };
    }
};
