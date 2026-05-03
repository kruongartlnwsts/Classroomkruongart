// Mock Google Apps Script Interface using Supabase
window.google = {
    script: {
        run: {
            withSuccessHandler: function(onSuccess) { return this._createChain(onSuccess, null); },
            withFailureHandler: function(onFailure) { return this._createChain(null, onFailure); },
            _createChain: function(onSuccess, onFailure) {
                const chain = {
                    withSuccessHandler: function(cb) { onSuccess = cb; return chain; },
                    withFailureHandler: function(cb) { onFailure = cb; return chain; }
                };
                
                const methods = [
                    'getAllData', 'uploadSubmission', 'checkAdminPassword', 'saveWorksheet', 
                    'deleteRow', 'saveExam', 'saveQuestion', 'submitExam', 'unlockExam',
                    'deleteSubmission', 'addAssignment', 'updateAssignment', 'updateScore',
                    'updateMultipleScoresAndFeedback', 'updateMultipleScores',
                    'saveGeminiKey', 'saveFolderID', 'changePassword', 'analyzeSubmissionWithGemini',
                    'generateReport', 'saveMultipleQuestions', 'addClass', 'addStudent', 'importCSV',
                    'updatePassword', 'addRow'
                ];

                methods.forEach(method => {
                    chain[method] = async function(...args) {
                        try {
                            const result = await backendMocks[method](...args);
                            if (onSuccess) onSuccess(result);
                        } catch (err) {
                            if (onFailure) onFailure(err);
                            else console.error("Unhandled Backend Error in " + method + ":", err);
                        }
                    };
                });
                
                return chain;
            }
        }
    }
};

const backendMocks = {
    getAllData: async () => {
        const fetchTable = async (table) => {
            const { data, error } = await supabaseClient.from(table).select('*');
            if (error) { console.error('Error fetching ' + table, error); return []; }
            return data;
        };

        const [config, classes, students, subjects, assignments, submissions, exams, questions, results, worksheets] = await Promise.all([
            fetchTable('config'), fetchTable('classes'), fetchTable('students'), fetchTable('subjects'),
            fetchTable('assignments'), fetchTable('submissions'), fetchTable('exams'), fetchTable('questions'),
            fetchTable('exam_results'), fetchTable('worksheets')
        ]);
        
        return {
            config: config.map(c => [c.key, c.value]),
            classes: classes.map(c => [c.id, c.name]),
            students: students.map(s => [s.id, s.name, s.class_id]),
            subjects: subjects.map(s => [s.id, s.name]),
            assignments: assignments.map(a => [a.id, a.title, a.subject_id, a.class_id, a.due_date, a.active]),
            submissions: submissions.map(s => [s.id, s.assignment_id, s.student_id, s.file_url, s.created_at, s.score, s.feedback]),
            exams: exams.map(e => [e.id, e.title, e.subject_id, e.class_id, e.max_questions, e.active]),
            questions: questions.map(q => [q.id, q.exam_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.answer]),
            examResults: results.map(r => [r.id, r.exam_id, r.student_id, r.score, r.created_at, r.is_locked]),
            worksheets: worksheets.map(w => [w.id, w.title, w.subject_id, w.class_id, w.drive_link, w.description, w.created_at])
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
        if (assign && assign.due_date) {
            const dueDate = new Date(assign.due_date);
            dueDate.setHours(23, 59, 59, 999);
            if (new Date() > dueDate) return "ERROR_LATE";
        }

        // Upload to Google Drive via GAS Web App
        const gasResponse = await fetch(window.GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'uploadFile',
                formObject: formObject
            })
        });

        const gasResult = await gasResponse.json();
        if (gasResult.error) throw new Error(gasResult.error);

        // Save metadata to Supabase
        const { error: insertError } = await supabaseClient.from('submissions').insert({
            assignment_id: formObject.assignmentId,
            student_id: formObject.studentId,
            file_url: gasResult.url
        });

        if (insertError) throw new Error(insertError.message);
        return "Success";
    },

    saveWorksheet: async (id, title, subjectId, classId, driveLink, description) => {
        const payload = { title, subject_id: subjectId, class_id: classId, drive_link: driveLink, description };
        if (id) {
            await supabaseClient.from('worksheets').update(payload).eq('id', id);
        } else {
            await supabaseClient.from('worksheets').insert(payload);
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
        const payload = { title, subject_id: subjectId, class_id: classId, max_questions: maxQuestions, active: active === 'Active' };
        if (id) {
            await supabaseClient.from('exams').update(payload).eq('id', id);
        } else {
            await supabaseClient.from('exams').insert(payload);
        }
        return "Success";
    },

    saveQuestion: async (examId, qId, qText, optA, optB, optC, optD, ans) => {
        const payload = { exam_id: examId, question_text: qText, option_a: optA, option_b: optB, option_c: optC, option_d: optD, answer: ans };
        if (qId) {
            await supabaseClient.from('questions').update(payload).eq('id', qId);
        } else {
            await supabaseClient.from('questions').insert(payload);
        }
        return "Success";
    },

    submitExam: async (examId, studentId, score) => {
        const { data: existing } = await supabaseClient.from('exam_results').select('id').eq('exam_id', examId).eq('student_id', studentId);
        if (existing && existing.length > 0) return "ERROR_LOCKED";

        await supabaseClient.from('exam_results').insert({ exam_id: examId, student_id: studentId, score: score, is_locked: true });
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
        await supabaseClient.from('assignments').insert({ title, subject_id: subjectId, class_id: classId, due_date: dueDate || null });
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
        await supabaseClient.from('classes').insert({ name });
        return "Success";
    },

    addStudent: async (classId, name) => {
        await supabaseClient.from('students').insert({ class_id: classId, name });
        return "Success";
    },

    importCSV: async (csvData, classId) => {
        const rows = csvData.split('\n');
        const inserts = [];
        rows.forEach(row => {
            const name = row.trim();
            if(name) inserts.push({ name, class_id: classId });
        });
        if(inserts.length > 0) await supabaseClient.from('students').insert(inserts);
        return "Imported";
    },

    saveFolderID: async (id) => { return "Success"; },
    saveGeminiKey: async (key) => {
        const { error } = await supabaseClient.from('config').upsert({ key: 'gemini_api_key', value: key });
        if(error) throw new Error(error.message);
        return "Success";
    },

    saveMultipleQuestions: async (examId, questionsData) => {
        const inserts = questionsData.map(q => ({
            exam_id: examId, question_text: q.text, option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, answer: q.ans
        }));
        await supabaseClient.from('questions').insert(inserts);
        return "Success";
    },

    addRow: async (tableName, rowData) => {
        if (tableName === 'Classes') {
            await supabaseClient.from('classes').insert({ name: rowData[1] });
        } else if (tableName === 'Students') {
            await supabaseClient.from('students').insert({ name: rowData[1], class_id: rowData[2] });
        } else if (tableName === 'Subjects') {
            await supabaseClient.from('subjects').insert({ name: rowData[1] });
        } else if (tableName === 'Worksheets') {
            await supabaseClient.from('worksheets').insert({ 
                title: rowData[1], subject_id: rowData[2], class_id: rowData[3], 
                drive_link: rowData[4], description: rowData[5] 
            });
        }
        return "Success";
    },

    generateReport: async (classId, type) => {
        return { error: "ฟีเจอร์นี้ต้องใช้งานผ่าน Client-Side (jsPDF)" };
    },
    
    analyzeSubmissionWithGemini: async (subId, criteria, maxScore) => {
        return { error: "AI Grading is mocked. Setup Gemini REST endpoint or use Vercel Serverless Function." };
    }
};
