        let globalData = { classes: [], students: [], subjects: [], assignments: [], submissions: [], worksheets: [], config: [] };
        let isAdmin = false;
        
        // --- ตัวแปรสำหรับ Pagination & Auto-Refresh ---
        let adminCurrentPage = 1;
        let adminPageSize = 20;
        let adminAutoRefreshInterval = null;
        let isAdminInputFocused = false; // ป้องกันรีเฟรชกล่องทับข้อมูลที่ครูกำลังกรอก

        // --- Global Config ---
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer)
                toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
        });

        window.onload = function () { 
            loadAllData(); 
            
            // --- Initialize Flatpickr for Thai Buddhist Era ---
            if (typeof flatpickr !== 'undefined') {
                flatpickr.localize(flatpickr.l10ns.th);
                flatpickr.setDefaults({
                    dateFormat: "Y-m-d",
                    altInput: true,
                    altFormat: "TH", 
                    disableMobile: "true",
                    formatDate: (date, format, locale) => {
                        if (format === "TH") {
                            return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
                        }
                        return flatpickr.formatDate(date, format, locale);
                    }
                });
                flatpickr("#assignDate");
            }
        };

        function showLoading(show) { 
            const el = document.getElementById('loadingOverlay');
            if (el) el.style.display = show ? 'flex' : 'none'; 
        }

        // ปรับแก้เพิ่มโหมด isSilently เพื่อไม่ให้ขึ้นหน้าจอดำตอนอัปเดตอัตโนมัติ
        function loadAllData(isSilently = false) {
            if (!isSilently) showLoading(true);
            // document.getElementById('errorAlert').classList.add('hidden'); // Removed as it doesn't exist in index.html
            google.script.run.withSuccessHandler((data) => {
                if (!isSilently) showLoading(false);
                if (!data) { if (!isSilently) showError("ไม่ได้รับข้อมูลจาก Server (Data is null)"); return; }

                // อัปเดตสถานะการตั้งค่า Gemini AI
                if(data.config) {
                    const hasGemini = data.config.find(c => c[0] == 'has_gemini');
                    const icon = document.getElementById('geminiStatusIcon');
                    if (icon) {
                        if (hasGemini && hasGemini[1]) {
                            icon.innerHTML = '<i class="fas fa-check-circle text-green-500"></i> พร้อมใช้งาน';
                            icon.className = 'text-green-600 text-xs font-medium';
                        } else {
                            icon.innerHTML = '<i class="fas fa-exclamation-triangle text-amber-500"></i> ยังไม่ได้ตั้งค่า';
                            icon.className = 'text-amber-600 text-xs font-medium';
                        }
                    }
                }

                // เรียงลำดับชั้นเรียน
                if (data.classes && data.classes.length > 0) {
                    data.classes.sort((a, b) => {
                        const nameA = a[1];
                        const nameB = b[1];
                        const getLevel = (name) => {
                            if (name.startsWith('อ.')) return 1;
                            if (name.startsWith('ป.')) return 2;
                            if (name.startsWith('ม.')) return 3;
                            if (name.startsWith('ปวช.')) return 4;
                            if (name.startsWith('ปวส.')) return 5;
                            return 6;
                        };
                        const levelA = getLevel(nameA);
                        const levelB = getLevel(nameB);
                        if (levelA !== levelB) return levelA - levelB;
                        return nameA.localeCompare(nameB, 'th', { numeric: true });
                    });
                }

                globalData = data;
                try {
                    renderUI();
                    if (isAdmin) {
                        renderAdminAssignments(); // Refresh Assignments Table
                        loadSubmissionsForAdmin(); // Refresh Grading Table
                    }
                } catch (e) { console.error("UI Error:", e); showError("เกิดข้อผิดพลาดในการแสดงผล: " + e.message); }
            }).withFailureHandler((e) => { showLoading(false); console.error("Server Error:", e); showError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ [NEW]: " + e.message); }).getAllData();
        }

        function showError(msg) {
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: msg,
                confirmButtonColor: 'var(--theme1)'
            });
        }

        function renderUI() {
            renderSubmitForm();
            renderExamSelectForm();
            renderWorksheetFilter();
            renderStats();
            renderAdminPanel();
            renderCheckForm();
            if(isAdmin) {
                renderAdminExams();
                renderAdminWorksheets();
            }
        }

        function switchTab(tabId) {
            if (tabId === 'adminTab' && !isAdmin) { Swal.fire('Access Denied', 'กรุณาเข้าสู่ระบบ Admin ก่อน', 'warning'); return; }
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active', 'text-theme1'));
            document.getElementById(tabId).classList.remove('hidden');
            const btn = document.getElementById('btn-' + tabId); if (btn) btn.classList.add('active');
        }

        function switchAdminSection(sectionId) {
            document.querySelectorAll('.admin-section').forEach(el => {
                el.classList.add('hidden');
                el.classList.remove('block');
            });
            document.querySelectorAll('.admin-sidebar-btn').forEach(el => {
                el.classList.remove('text-purple-700', 'bg-purple-50', 'shadow-sm', 'text-pink-600', 'bg-pink-50', 'border-pink-100', 'text-cyan-600', 'bg-cyan-50', 'border-cyan-100');
                if (el.id !== 'btn_admin_sec_exams' && el.id !== 'btn_admin_sec_worksheets') el.classList.add('text-gray-600');
            });
            
            const targetEl = document.getElementById(sectionId);
            if(targetEl) {
                targetEl.classList.remove('hidden');
                targetEl.classList.add('block');
            }
            
            const btn = document.getElementById('btn_' + sectionId);
            if (btn) {
                if (sectionId === 'admin_sec_exams') {
                    btn.classList.add('text-pink-600', 'bg-pink-50', 'border-pink-100', 'shadow-sm');
                } else if (sectionId === 'admin_sec_worksheets') {
                    btn.classList.add('text-cyan-600', 'bg-cyan-50', 'border-cyan-100', 'shadow-sm');
                } else {
                    btn.classList.remove('text-gray-600');
                    btn.classList.add('text-purple-700', 'bg-purple-50', 'shadow-sm');
                }
            }
        }

        function renderSubmitForm() {
            if (!globalData.classes) globalData.classes = [];
            if (!globalData.subjects) globalData.subjects = [];
            const classSelect = document.getElementById('sub_class');
            classSelect.innerHTML = '<option value="">-- เลือกชั้นเรียน --</option>';
            globalData.classes.forEach(c => { classSelect.innerHTML += `<option value="${c[0]}">${c[1]}</option>`; });
            const subjectSelect = document.getElementById('sub_subject');
            subjectSelect.innerHTML = '<option value="">-- เลือกวิชา --</option>';
            globalData.subjects.forEach(s => { subjectSelect.innerHTML += `<option value="${s[0]}">${s[1]}</option>`; });
        }

        function loadStudentsForSubmission() {
            const classId = document.getElementById('sub_class').value;
            const studentSelect = document.getElementById('sub_student');
            studentSelect.innerHTML = '<option value="">-- เลือกนักเรียน --</option>';
            studentSelect.disabled = true;
            if (classId && globalData.students) {
                const students = globalData.students.filter(s => s[2] == classId);
                students.forEach(s => { studentSelect.innerHTML += `<option value="${s[0]}">${s[1]}</option>`; });
                studentSelect.disabled = false;
            }
        }

        function loadAssignmentsForSubmission() {
            const subjectId = document.getElementById('sub_subject').value;
            const classId = document.getElementById('sub_class').value;
            const assignSelect = document.getElementById('sub_assignment');
            assignSelect.innerHTML = '<option value="">-- เลือกงาน --</option>';
            assignSelect.disabled = true;
            if (subjectId && classId && globalData.assignments) {
                const assignments = globalData.assignments.filter(a => a[2] == subjectId && a[3] == classId);
                assignments.forEach(a => { assignSelect.innerHTML += `<option value="${a[0]}">${a[1]}</option>`; });
                assignSelect.disabled = false;
            }
        }

        function displayFileName() {
            const fileInput = document.getElementById('dropzone-file');
            const display = document.getElementById('fileNameDisplay');
            if (fileInput.files.length > 0) { display.innerHTML = `<span class="text-green-600 font-bold">${fileInput.files[0].name}</span>`; }
        }

        function handleSubmission(e) {
            e.preventDefault();
            const submitBtn = document.getElementById('btnSubmitForm');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังส่งข้อมูล...';
            submitBtn.classList.remove('hover:translate-y-1', 'transform');

            const fileInput = document.getElementById('dropzone-file');
            if (fileInput.files.length === 0) {
                Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์งาน', 'warning');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
                submitBtn.classList.add('hover:translate-y-1', 'transform');
                return;
            }

            const file = fileInput.files[0];
            const reader = new FileReader();
            document.getElementById('progressWrapper').classList.remove('hidden');
            let progress = 0;
            const interval = setInterval(() => { progress += 10; if (progress > 90) clearInterval(interval); document.getElementById('progressBar').style.width = progress + '%'; }, 200);

            reader.onload = function (e) {
                const studentSelect = document.getElementById('sub_student');
                const studentName = studentSelect.options[studentSelect.selectedIndex].text;
                const classSelect = document.getElementById('sub_class');
                const className = classSelect.options[classSelect.selectedIndex].text;
                const assignSelect = document.getElementById('sub_assignment');
                const assignTitle = assignSelect.options[assignSelect.selectedIndex].text;
                const formData = {
                    fileData: e.target.result, fileName: file.name, studentId: document.getElementById('sub_student').value,
                    studentName: studentName, className: className, assignmentId: document.getElementById('sub_assignment').value, assignmentTitle: assignTitle
                };
                google.script.run.withSuccessHandler((res) => {
                    clearInterval(interval);
                    document.getElementById('progressBar').style.width = '100%';
                    document.getElementById('progressWrapper').classList.add('hidden');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    submitBtn.classList.add('hover:translate-y-1', 'transform');

                    if (res === 'Success') {
                        Swal.fire('สำเร็จ', 'ส่งงานเรียบร้อยแล้ว', 'success');
                        document.getElementById('submissionForm').reset();
                        document.getElementById('fileNameDisplay').innerText = 'รองรับ PDF, DOCX, JPG, PNG';
                        loadAllData();
                    } else if (res === 'ERROR_DUPLICATE') {
                        Swal.fire({ icon: 'warning', title: 'ส่งงานซ้ำไม่ได้', text: 'คุณได้ส่งงานชิ้นนี้ไปแล้ว กรุณาติดต่อครูเพื่อลบงานเดิมหากต้องการส่งใหม่อีกครั้ง' });
                    } else if (res === 'ERROR_LATE') {
                        Swal.fire({
                            icon: 'error',
                            title: 'หมดเวลาส่งงาน',
                            text: 'งานนี้ปิดรับการส่งแล้ว เนื่องจากเลยกำหนดส่ง'
                        });
                    } else if (res.includes('ERROR_NO_FOLDER')) {
                        Swal.fire('ตั้งค่าไม่ครบ', 'กรุณาแจ้ง Admin ให้ตั้งค่า Google Drive Folder ID', 'error');
                    } else {
                        Swal.fire('ผิดพลาด', res, 'error');
                    }
                }).withFailureHandler((err) => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    Swal.fire('ข้อผิดพลาดระบบ', err.message, 'error');
                }).uploadSubmission(formData);
            };
            reader.readAsDataURL(file);
        }

        // --- Check Work Functions ---

        function renderCheckForm() {
            const classSelect = document.getElementById('check_class');
            classSelect.innerHTML = '<option value="">เลือกชั้นเรียน</option>';
            if (globalData.classes) globalData.classes.forEach(c => classSelect.innerHTML += `<option value="${c[0]}">${c[1]}</option>`);
        }

        function loadStudentsForCheck() {
            const classId = document.getElementById('check_class').value;
            const stuSelect = document.getElementById('check_student');
            stuSelect.innerHTML = '<option value="">เลือกนักเรียน</option>';
            stuSelect.disabled = true;
            document.getElementById('scoreCardContainer').innerHTML = '<div class="col-span-full p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200"><i class="fas fa-user text-3xl mb-2 text-gray-300"></i><br>กรุณาเลือกชื่อนักเรียนเพื่อดูคะแนน</div>';
            if (classId && globalData.students) {
                globalData.students.filter(s => s[2] == classId).forEach(s => {
                    stuSelect.innerHTML += `<option value="${s[0]}">${s[1]}</option>`;
                });
                stuSelect.disabled = false;
            }
        }

        function loadStudentScores() {
            const studentId = document.getElementById('check_student').value;
            const container = document.getElementById('scoreCardContainer');
            container.innerHTML = ''; 

            if (!studentId) {
                container.innerHTML = '<div class="col-span-full p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200"><i class="fas fa-info-circle text-3xl mb-2 text-gray-300"></i><br>กรุณาเลือกชื่อนักเรียนเพื่อค้นหาข้อมูล</div>';
                return;
            }

            if (!globalData.submissions) return;
            const mySubs = globalData.submissions.filter(sub => sub[2] == studentId);

            if (mySubs.length === 0) {
                container.innerHTML = '<div class="col-span-full p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200"><i class="fas fa-folder-open text-3xl mb-2 text-gray-300"></i><br>ยังไม่มีประวัติการส่งงาน</div>';
                return;
            }

            mySubs.forEach(sub => {
                const assign = globalData.assignments.find(a => a[0] == sub[1]);
                const subject = assign ? globalData.subjects.find(s => s[0] == assign[2]) : null;
                const isGraded = sub[5] !== "" && sub[5] !== null && sub[5] !== undefined;
                const badgeClass = isGraded ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200';
                const scoreHTML = isGraded ? `<div class="text-2xl font-bold text-emerald-600">${sub[5]}<span class="text-sm font-normal text-gray-500"> คะแนน</span></div>` : '<div class="text-sm font-medium text-amber-600 animate-pulse">รอตรวจคะแนน</div>';
                const feedbackSection = sub[6] ? `<div class="mt-3 p-3 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100 flex gap-2"><i class="fas fa-comment-dots mt-1 text-blue-500"></i><span>${sub[6]}</span></div>` : '';
                
                container.innerHTML += `
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div class="absolute top-0 left-0 w-1.5 h-full ${isGraded ? 'bg-emerald-500' : 'bg-amber-400'}"></div>
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <span class="text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeClass}">${subject ? subject[1] : '-'}</span>
                        </div>
                        <a href="${sub[3]}" target="_blank" class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center hover:bg-indigo-100 transition-colors" title="ดูไฟล์งาน"><i class="fas fa-file-alt"></i></a>
                    </div>
                    <h3 class="font-bold text-gray-800 text-lg leading-tight mb-1 group-hover:text-indigo-600 transition-colors">${assign ? assign[1] : 'งานถูกลบ'}</h3>
                    <div class="mt-4 pt-4 border-t border-gray-50 flex justify-between items-end">
                        <div class="text-xs text-gray-400 font-medium">สถานะ<br><span class="text-sm text-gray-600 ${isGraded?'':'text-amber-500'}">${isGraded ? 'ตรวจแล้ว ✅' : 'กำลังดำเนินการ ⏳'}</span></div>
                        ${scoreHTML}
                    </div>
                    ${feedbackSection}
                </div>`;
            });
        }

        // --- End Check Work Functions ---

        function renderStats() {
            if (!globalData.students || !globalData.classes) return;
            const classes = globalData.classes;
            const students = globalData.students;
            const assignments = globalData.assignments || [];
            const totalStudents = students.length;
            const totalAssignments = assignments.length;

            // Total students
            document.getElementById('statStudentCount').innerText = totalStudents;

            // --- Students per class ---
            const stuBody = document.getElementById('statStudentsByClass');
            let stuHTML = '';
            const classColors = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500'];
            classes.forEach((c, i) => {
                const count = students.filter(s => s[2] == c[0]).length;
                const pct = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
                const color = classColors[i % classColors.length];
                stuHTML += `<tr class="hover:bg-gray-50 transition-colors">
                    <td class="p-3 font-medium text-gray-800">${c[1]}</td>
                    <td class="p-3 text-center font-bold text-indigo-600">${count}</td>
                    <td class="p-3">
                        <div class="flex items-center gap-2">
                            <div class="flex-grow bg-gray-200 rounded-full h-2.5 overflow-hidden"><div class="${color} h-2.5 rounded-full transition-all duration-500" style="width:${pct}%"></div></div>
                            <span class="text-xs text-gray-500 w-10 text-right font-medium">${pct}%</span>
                        </div>
                    </td>
                </tr>`;
            });
            if (classes.length === 0) stuHTML = '<tr><td colspan="3" class="p-6 text-center text-gray-400">ยังไม่มีชั้นเรียน</td></tr>';
            stuBody.innerHTML = stuHTML;

            // --- Assignments per class ---
            const assignBody = document.getElementById('statAssignsByClass');
            let assignHTML = '';
            classes.forEach((c, i) => {
                const count = assignments.filter(a => a[3] == c[0]).length;
                const pct = totalAssignments > 0 ? Math.round((count / totalAssignments) * 100) : 0;
                const color = classColors[(i + 3) % classColors.length];
                assignHTML += `<tr class="hover:bg-gray-50 transition-colors">
                    <td class="p-3 font-medium text-gray-800">${c[1]}</td>
                    <td class="p-3 text-center font-bold text-amber-600">${count}</td>
                    <td class="p-3">
                        <div class="flex items-center gap-2">
                            <div class="flex-grow bg-gray-200 rounded-full h-2.5 overflow-hidden"><div class="${color} h-2.5 rounded-full transition-all duration-500" style="width:${pct}%"></div></div>
                            <span class="text-xs text-gray-500 w-10 text-right font-medium">${pct}%</span>
                        </div>
                    </td>
                </tr>`;
            });
            if (classes.length === 0) assignHTML = '<tr><td colspan="3" class="p-6 text-center text-gray-400">ยังไม่มีชั้นเรียน</td></tr>';
            assignBody.innerHTML = assignHTML;

            // --- Chart: students per class ---
            const ctx = document.getElementById('myChart').getContext('2d');
            const chartLabels = classes.map(c => c[1]);
            const chartData = classes.map(c => students.filter(s => s[2] == c[0]).length);
            const chartBgColors = classes.map((_, i) => ['#6366f1','#a855f7','#ec4899','#f43f5e','#f97316','#f59e0b','#10b981','#14b8a6','#06b6d4','#3b82f6'][i % 10]);
            if (window.myBarChart) window.myBarChart.destroy();
            window.myBarChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'จำนวนนักเรียน (คน)',
                        data: chartData,
                        backgroundColor: chartBgColors,
                        borderRadius: 8,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 12 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                        x: { ticks: { font: { size: 12 } }, grid: { display: false } }
                    }
                }
            });
        }

        function showLoginModal() {
            Swal.fire({ title: '🔒 เข้าสู่ระบบ Admin', input: 'password', showCancelButton: true, confirmButtonText: 'เข้าสู่ระบบ', }).then((result) => {
                if (result.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler(valid => {
                        showLoading(false);
                        if (valid) { isAdmin = true; document.getElementById('adminProfile').classList.remove('hidden'); document.getElementById('btn-adminTab').classList.remove('hidden'); Swal.fire('ยินดีต้อนรับ', 'เข้าสู่โหมดผู้ดูแลระบบ', 'success'); renderAdminPanel(); } else { Swal.fire('ผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error'); }
                    }).checkAdminPassword(result.value);
                }
            });
        }
        function logout() { isAdmin = false; document.getElementById('adminProfile').classList.add('hidden'); document.getElementById('btn-adminTab').classList.add('hidden'); switchTab('submitTab'); }

        function renderAdminPanel() {
            if (!isAdmin) return;
            const list = document.getElementById('adminClassList'); list.innerHTML = '';
            if (globalData.classes) { globalData.classes.forEach(c => { list.innerHTML += `<li class="flex justify-between bg-gray-50 p-2 rounded"><span>${c[1]}</span><button onclick="deleteRow('Classes', 0, '${c[0]}')" class="text-red-500"><i class="fas fa-trash"></i></button></li>`; }); }

            const stuClassSelect = document.getElementById('admin_student_class');
            const assignClass = document.getElementById('assignClass');
            const assignSubject = document.getElementById('assignSubject');
            const filterClass = document.getElementById('admin_filter_class');

            // Populate Dropdowns
            stuClassSelect.innerHTML = '<option value="">เลือกชั้นเรียน</option>';
            assignClass.innerHTML = '<option value="">เลือกชั้นเรียน</option>';
            assignSubject.innerHTML = '<option value="">เลือกวิชา</option>';
            filterClass.innerHTML = '<option value="">-- ทุกชั้นเรียน --</option>';

            // NEW: Populate Assignment Filter Class
            const filterAssignClass = document.getElementById('admin_assign_filter_class');
            filterAssignClass.innerHTML = '<option value="">-- แสดงทุกชั้นเรียน --</option>';

            if (globalData.classes) globalData.classes.forEach(c => {
                const opt = `<option value="${c[0]}">${c[1]}</option>`;
                stuClassSelect.innerHTML += opt;
                assignClass.innerHTML += opt;
                filterClass.innerHTML += opt;
                filterAssignClass.innerHTML += opt; // Add to assignment filter
            });
            if (globalData.subjects) globalData.subjects.forEach(s => assignSubject.innerHTML += `<option value="${s[0]}">${s[1]}</option>`);

            const adminStudentFilter = document.getElementById('admin_filter_student_class');
            if (adminStudentFilter) {
                adminStudentFilter.innerHTML = '<option value="">-- เลือกระดับชั้น --</option>';
                if (globalData.classes) globalData.classes.forEach(c => adminStudentFilter.innerHTML += `<option value="${c[0]}">${c[1]}</option>`);
            }

            // Worksheet Admin Dropdowns
            const wsSubject = document.getElementById('wsSubject');
            const wsClass = document.getElementById('wsClass');
            const adminWsFilter = document.getElementById('admin_ws_filter_class');
            if (wsSubject) {
                wsSubject.innerHTML = '<option value="">เลือกวิชา</option>';
                if (globalData.subjects) globalData.subjects.forEach(s => wsSubject.innerHTML += `<option value="${s[0]}">${s[1]}</option>`);
            }
            if (wsClass) {
                wsClass.innerHTML = '<option value="">เลือกระดับชั้น</option>';
                if (globalData.classes) globalData.classes.forEach(c => wsClass.innerHTML += `<option value="${c[0]}">${c[1]}</option>`);
            }
            if (adminWsFilter) {
                adminWsFilter.innerHTML = '<option value="">-- แสดงทุกระดับชั้น --</option>';
                if (globalData.classes) globalData.classes.forEach(c => adminWsFilter.innerHTML += `<option value="${c[0]}">${c[1]}</option>`);
            }

            renderAdminAssignments();
            loadSubmissionsForAdmin();
            if (typeof renderAdminStudents === 'function') renderAdminStudents();
        }

        // *** UPDATED: Render Admin Assignments with Filter & Sort ***
        function renderAdminAssignments() {
            const filterClassId = document.getElementById('admin_assign_filter_class').value;
            const tbody = document.getElementById('adminAssignmentList');
            tbody.innerHTML = '';

            if (!globalData.assignments) return;

            // 1. Filter
            let filtered = globalData.assignments;
            if (filterClassId) {
                filtered = filtered.filter(a => a[3] == filterClassId);
            }

            // 2. Sort (Newest First based on ID creation timestamp)
            const sortedAssigns = [...filtered].sort((a, b) => {
                // IDs are 'A' + timestamp e.g. A168... 
                // We extract timestamp number to sort
                const timeA = parseInt(a[0].substring(1)) || 0;
                const timeB = parseInt(b[0].substring(1)) || 0;
                return timeB - timeA;
            });

            if (sortedAssigns.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">ไม่พบงานที่กำหนด</td></tr>';
                return;
            }

            sortedAssigns.forEach(a => {
                const subject = globalData.subjects.find(s => s[0] == a[2]);
                const classObj = globalData.classes.find(c => c[0] == a[3]);
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-2 font-medium">${a[1]}</td>
                        <td class="p-2">${subject ? subject[1] : '-'}</td>
                        <td class="p-2">${classObj ? classObj[1] : '-'}</td>
                        <td class="p-2">${a[4]}</td>
                        <td class="p-2">
                             <button onclick="editAssignment('${a[0]}')" class="text-blue-500 hover:text-blue-700 mr-2" title="แก้ไข"><i class="fas fa-edit"></i></button>
                             <button onclick="deleteRow('Assignments', 0, '${a[0]}')" class="text-red-500 hover:text-red-700" title="ลบ"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }

        function editAssignment(id) {
            const assign = globalData.assignments.find(a => a[0] == id);
            if (!assign) return;
            let subOpts = globalData.subjects.map(s => `<option value="${s[0]}" ${s[0] == assign[2] ? 'selected' : ''}>${s[1]}</option>`).join('');
            let classOpts = globalData.classes.map(c => `<option value="${c[0]}" ${c[0] == assign[3] ? 'selected' : ''}>${c[1]}</option>`).join('');
            Swal.fire({
                title: 'แก้ไขงาน', 
                html: `
                    <div class="text-left space-y-3 mt-3">
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ชื่องาน</label><input type="text" id="edit_title" class="swal2-input !w-full !m-0 !h-10 text-sm" value="${assign[1]}"></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">วิชา</label><select id="edit_subject" class="swal2-select !w-full flex !m-0 !h-10 text-sm">${subOpts}</select></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ระดับชั้น</label><select id="edit_class" class="swal2-select !w-full flex !m-0 !h-10 text-sm">${classOpts}</select></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">กำหนดส่ง</label><input type="text" id="edit_date" placeholder="คลิกเพื่อเลือกวันที่" class="swal2-input !w-full !m-0 !h-10 text-sm cursor-pointer" value="${assign[4]}" readonly></div>
                    </div>
                `,
                showCancelButton: true, confirmButtonText: 'บันทึก', confirmButtonColor: '#3B82F6',
                didOpen: () => { flatpickr("#edit_date"); },
                preConfirm: () => { return { title: document.getElementById('edit_title').value, subject: document.getElementById('edit_subject').value, classId: document.getElementById('edit_class').value, date: document.getElementById('edit_date').value } }
            }).then((result) => { 
                if (result.isConfirmed) { 
                    showLoading(true); 
                    const d = result.value; 
                    google.script.run.withSuccessHandler(() => { 
                        loadAllData(); 
                        Toast.fire({ icon: 'success', title: 'แก้ไขข้อมูลเรียบร้อย' });
                    }).updateAssignment(id, d.title, d.subject, d.classId, d.date); 
                } 
            });
        }

        function downloadReport(type) {
            const classId = document.getElementById('admin_filter_class').value;
            if (!classId) { Toast.fire({ icon: 'warning', title: 'กรุณาเลือกชั้นเรียนก่อนดาวน์โหลด' }); return; }
            showLoading(true);
            google.script.run.withSuccessHandler((res) => {
                showLoading(false);
                if (res.error) { Swal.fire('ข้อผิดพลาด', res.error, 'error'); return; }
                const link = document.createElement('a');
                if (type === 'pdf') { link.href = 'data:application/pdf;base64,' + res.base64; } else { link.href = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(res.content); }
                link.download = res.filename; document.body.appendChild(link); link.click(); document.body.removeChild(link);
                Toast.fire({ icon: 'success', title: 'ดาวน์โหลดรายงานสำเร็จ' });
            }).withFailureHandler(err => { showLoading(false); Swal.fire('Error', err.message, 'error'); }).generateReport(classId, type);
        }

        function resetAdminPagination() {
            adminCurrentPage = 1;
        }

        function changeAdminPageSize() {
            adminPageSize = parseInt(document.getElementById('admin_page_size').value) || 20;
            resetAdminPagination();
            loadSubmissionsForAdmin();
        }

        function loadSubmissionsForAdmin() {
            if (isAdminInputFocused) return; // Prevent render if admin is editing score

            const filterClassId = document.getElementById('admin_filter_class').value;
            const filterStatus = document.getElementById('admin_filter_status').value;
            const searchText = document.getElementById('admin_search_text').value.toLowerCase();
            const tbody = document.getElementById('adminSubmissionTable');
            const countLabel = document.getElementById('submissionCount');
            const btnWord = document.getElementById('btnExportWord');
            const btnPDF = document.getElementById('btnExportPDF');
            
            if (filterClassId) { btnWord.disabled = false; btnPDF.disabled = false; } else { btnWord.disabled = true; btnPDF.disabled = true; }
            tbody.innerHTML = '';
            if (!globalData.submissions) { countLabel.innerText = "ไม่พบข้อมูล"; return; }
            
            let filteredSubs = globalData.submissions.filter(sub => {
                const student = globalData.students.find(s => s[0] == sub[2]);
                const assign = globalData.assignments.find(a => a[0] == sub[1]);
                
                let passClass = true; 
                if (filterClassId) { if (!student || student[2] != filterClassId) passClass = false; }
                
                let passStatus = true; 
                const score = sub[5]; 
                const isGraded = (score !== "" && score !== null && score !== undefined);
                if (filterStatus === 'pending' && isGraded) passStatus = false; 
                if (filterStatus === 'graded' && !isGraded) passStatus = false;
                
                let passSearch = true;
                if (searchText) {
                    const studentName = student ? student[1].toLowerCase() : '';
                    const assignName = assign ? assign[1].toLowerCase() : '';
                    if (!studentName.includes(searchText) && !assignName.includes(searchText)) {
                        passSearch = false;
                    }
                }
                
                return passClass && passStatus && passSearch;
            });
            
            filteredSubs.sort((a, b) => {
                const timeA = parseInt(a[0].substring(1)) || 0;
                const timeB = parseInt(b[0].substring(1)) || 0;
                return timeB - timeA;
            });

            countLabel.innerText = `พบ ${filteredSubs.length} รายการ`;
            
            const MathCeil = Math.ceil;
            const totalItems = filteredSubs.length;
            const totalPages = MathCeil(totalItems / adminPageSize) || 1;
            if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
            
            const startIndex = (adminCurrentPage - 1) * adminPageSize;
            const endIndex = startIndex + adminPageSize;
            const paginatedSubs = filteredSubs.slice(startIndex, endIndex);

            if (paginatedSubs.length === 0) { 
                tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-400 bg-gray-50"><i class="fas fa-folder-open text-3xl mb-2"></i><br>ไม่พบข้อมูลตามเงื่อนไขที่ค้นหา</td></tr>'; 
                renderAdminPaginationControls(totalPages);
                return; 
            }

            paginatedSubs.forEach(sub => {
                const student = globalData.students.find(s => s[0] == sub[2]);
                const studentClass = student ? globalData.classes.find(c => c[0] == student[2]) : null;
                const assign = globalData.assignments.find(a => a[0] == sub[1]);
                const score = sub[5]; 
                const isGraded = (score !== "" && score !== null && score !== undefined);
                const rowClass = isGraded ? 'border-b hover:bg-gray-50' : 'border-b bg-amber-50/20 hover:bg-amber-50';
                
                tbody.innerHTML += `
                <tr class="${rowClass}">
                    <td class="p-3 text-xs text-gray-500 whitespace-nowrap">${studentClass ? studentClass[1] : '-'}</td>
                    <td class="p-3 font-medium text-gray-700 min-w-[150px]">${student ? student[1] : 'Unknown'}</td>
                    <td class="p-3 text-gray-700 min-w-[150px]">${assign ? assign[1] : 'Unknown'}</td>
                    <td class="p-3 text-center"><a href="${sub[3]}" target="_blank" class="inline-flex w-8 h-8 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 items-center justify-center transition-colors" title="ดูไฟล์"><i class="fas fa-file-alt"></i></a></td>
                    <td class="p-2">
                        <div class="flex flex-col gap-1 w-full max-w-[150px]">
                            <input type="number" onfocus="isAdminInputFocused=true" onblur="isAdminInputFocused=false" class="score-input border border-gray-300 w-full text-center rounded-md p-1 focus:ring-2 focus:ring-theme1 outline-none shadow-sm ${isGraded ? 'bg-white' : 'bg-amber-50 border-amber-300'}" data-id="${sub[0]}" value="${sub[5] || ''}" placeholder="คะแนน" min="0">
                            <textarea onfocus="isAdminInputFocused=true" onblur="isAdminInputFocused=false" class="fb-input border border-gray-300 w-full text-xs rounded-md p-1 focus:ring-2 focus:ring-theme1 outline-none shadow-sm h-12 resize-none ${isGraded ? 'bg-white' : 'bg-amber-50 border-amber-300'}" data-id="${sub[0]}" placeholder="คำวิจารณ์จาก AI / ครู">${sub[6] || ''}</textarea>
                        </div>
                    </td>
                    <td class="p-3 text-center flex justify-center gap-1">
                        <button onclick="aiGradeSubmission('${sub[0]}')" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 w-8 h-8 flex items-center justify-center rounded transition-colors group relative" title="ให้ AI ตรวจและวิเคราะห์งาน"><i class="fas fa-sparkles group-hover:animate-pulse"></i></button>
                        <button onclick="saveScore('${sub[0]}')" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 w-8 h-8 flex items-center justify-center rounded transition-colors" title="บันทึกคะแนนข้อนี้"><i class="fas fa-save"></i></button>
                        <button onclick="deleteSubmission('${sub[0]}')" class="bg-red-100 hover:bg-red-200 text-red-700 w-8 h-8 flex items-center justify-center rounded transition-colors" title="ลบงานนี้"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
            
            renderAdminPaginationControls(totalPages);
        }

        function renderAdminPaginationControls(totalPages) {
            const container = document.getElementById('adminPaginationControls');
            container.innerHTML = '';
            if (totalPages <= 1) return;

            const prevDisabled = adminCurrentPage === 1 ? 'disabled class="px-2 py-1 rounded text-gray-300 cursor-not-allowed"' : 'class="px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition-colors" onclick="adminCurrentPage--; loadSubmissionsForAdmin()"';
            container.innerHTML += `<button ${prevDisabled}><i class="fas fa-chevron-left"></i></button>`;
            
            let startP = Math.max(1, adminCurrentPage - 2);
            let endP = Math.min(totalPages, startP + 4);
            if (endP - startP < 4) startP = Math.max(1, endP - 4);
            
            if (startP > 1) {
                container.innerHTML += `<button class="px-3 py-1 rounded hover:bg-gray-100 transition-colors" onclick="adminCurrentPage=1; loadSubmissionsForAdmin()">1</button>`;
                if (startP > 2) container.innerHTML += `<span class="px-1 text-gray-400">...</span>`;
            }

            for (let i = startP; i <= endP; i++) {
                if (i === adminCurrentPage) {
                    container.innerHTML += `<button class="px-3 py-1 rounded bg-blue-50 text-blue-600 font-bold border border-blue-100 shadow-sm">${i}</button>`;
                } else {
                    container.innerHTML += `<button class="px-3 py-1 rounded hover:bg-gray-100 transition-colors" onclick="adminCurrentPage=${i}; loadSubmissionsForAdmin()">${i}</button>`;
                }
            }
            
            if (endP < totalPages) {
                if (endP < totalPages - 1) container.innerHTML += `<span class="px-1 text-gray-400">...</span>`;
                container.innerHTML += `<button class="px-3 py-1 rounded hover:bg-gray-100 transition-colors" onclick="adminCurrentPage=${totalPages}; loadSubmissionsForAdmin()">${totalPages}</button>`;
            }

            const nextDisabled = adminCurrentPage === totalPages ? 'disabled class="px-2 py-1 rounded text-gray-300 cursor-not-allowed"' : 'class="px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition-colors" onclick="adminCurrentPage++; loadSubmissionsForAdmin()"';
            container.innerHTML += `<button ${nextDisabled}><i class="fas fa-chevron-right"></i></button>`;
        }

        // --- Auto Refresh Logic ---
        setInterval(() => {
            const adminTab = document.getElementById('adminTab');
            if (isAdmin && adminTab && !adminTab.classList.contains('hidden')) {
                const indicator = document.getElementById('autoUpdateIndicator');
                if (!isAdminInputFocused) {
                    if (indicator) {
                        indicator.classList.remove('bg-emerald-500');
                        indicator.classList.add('bg-blue-500');
                    }
                    loadAllData(true); // IsSilently = true
                } else {
                    if (indicator) {
                        indicator.classList.remove('bg-emerald-500', 'bg-blue-500');
                        indicator.classList.add('bg-amber-500'); // Warning color when blocked
                    }
                }
            }
        }, 30000); // 30 วินาที


        function addClass() { 
            const name = document.getElementById('newClassName').value; 
            if (!name) { Toast.fire({ icon: 'warning', title: 'กรุณากรอกชื่อชั้นเรียน' }); return; }
            showLoading(true);
            google.script.run.withSuccessHandler(() => { 
                showLoading(false);
                Toast.fire({ icon: 'success', title: 'เพิ่มชั้นเรียนสำเร็จ' });
                document.getElementById('newClassName').value = '';
                loadAllData(); 
            }).addRow('Classes', ['C' + Date.now(), name]); 
        }

        function addStudent() { 
            const name = document.getElementById('newStudentName').value; 
            const classId = document.getElementById('admin_student_class').value; 
            if (name && classId) {
                showLoading(true);
                google.script.run.withSuccessHandler(() => { 
                    showLoading(false);
                    Toast.fire({ icon: 'success', title: 'เพิ่มรายชื่อสำเร็จ' });
                    document.getElementById('newStudentName').value = ''; 
                    loadAllData(); 
                }).addRow('Students', ['S' + Date.now(), name, classId]); 
            } else {
                Toast.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
            }
        }

        function importCSV() { 
            const csv = document.getElementById('csvInput').value; 
            const classId = document.getElementById('admin_student_class').value; 
            if (csv && classId) {
                showLoading(true);
                google.script.run.withSuccessHandler(() => { 
                    showLoading(false);
                    Toast.fire({ icon: 'success', title: 'นำเข้าข้อมูลสำเร็จ' });
                    document.getElementById('csvInput').value = '';
                    loadAllData(); 
                }).importStudentsCSV(csv, classId); 
            } else {
                Toast.fire({ icon: 'warning', title: 'กรุณาเลือกชั้นเรียนและใส่ข้อมูล CSV' });
            }
        }

        function renderAdminStudents() {
            const adminStudentFilter = document.getElementById('admin_filter_student_class');
            if (!adminStudentFilter) return;
            const classId = adminStudentFilter.value;
            const tbody = document.getElementById('adminStudentList');
            if (!tbody) return;
            if (!classId) {
                tbody.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-gray-500">กรุณาเลือกระดับชั้นเพื่อดูรายชื่อ</td></tr>';
                return;
            }
            const studentsInClass = (globalData.students || []).filter(s => s[2] == classId);
            if (studentsInClass.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-gray-500">ไม่พบรายชื่อในชั้นเรียนนี้</td></tr>';
                return;
            }
            let html = '';
            studentsInClass.forEach((s, index) => {
                html += `<tr class="hover:bg-gray-50 transition-colors">
                    <td class="p-3 text-center text-gray-500">${index + 1}</td>
                    <td class="p-3 font-medium text-gray-700">${s[1]}</td>
                    <td class="p-3 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="editStudent('${s[0]}', '${s[1]}', '${s[2]}')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-600 transition-colors" title="แก้ไข"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteStudent('${s[0]}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors" title="ลบ"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        function editStudent(id, currentName, classId) {
            Swal.fire({
                title: 'แก้ไขชื่อผู้เรียน', input: 'text', inputValue: currentName,
                showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#3B82F6',
                inputValidator: (value) => { if (!value) return 'กรุณาระบุชื่อผู้เรียน!'; }
            }).then((result) => {
                if (result.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler((res) => {
                        showLoading(false);
                        if (res === "Updated") { Toast.fire({ icon: 'success', title: 'แก้ไขข้อมูลสำเร็จ' }); loadAllData(); }
                    }).updateStudent(id, result.value, classId);
                }
            });
        }

        function deleteStudent(id) {
            Swal.fire({
                title: 'ยืนยันการลบ?', text: 'ข้อมูลนี้จะถูกลบออกจากระบบอย่างถาวร', icon: 'warning',
                showCancelButton: true, confirmButtonText: 'ลบข้อมูล', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#d33'
            }).then((result) => {
                if (result.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler(() => {
                        showLoading(false);
                        Toast.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ' });
                        loadAllData();
                    }).deleteRow('Students', 0, id);
                }
            });
        }

        function addAssignment() {
            const title = document.getElementById('assignTitle').value;
            const classId = document.getElementById('assignClass').value;
            let subjectId = document.getElementById('assignSubject').value;
            const newSubject = document.getElementById('newSubjectName').value;
            const date = document.getElementById('assignDate').value;
            
            if (!title || (!subjectId && !newSubject) || !classId || !date) {
                Toast.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
                return;
            }

            showLoading(true);
            if (newSubject) { 
                subjectId = 'SUBJ' + Date.now(); 
                google.script.run.addRow('Subjects', [subjectId, newSubject]); 
            }
            
            google.script.run.withSuccessHandler(() => { 
                showLoading(false);
                Toast.fire({ icon: 'success', title: 'มอบหมายงานสำเร็จ' });
                document.getElementById('assignTitle').value = '';
                document.getElementById('newSubjectName').value = '';
                loadAllData(); 
            }).addRow('Assignments', ['A' + Date.now(), title, subjectId, classId, date, 'Active']); 
        }

        function saveScore(subId) { 
            const input = document.querySelector(`.score-input[data-id="${subId}"]`); 
            const score = input ? input.value : 0; 
            const fbInput = document.querySelector(`.fb-input[data-id="${subId}"]`); 
            const fbVal = fbInput ? fbInput.value : ''; 
            google.script.run.withSuccessHandler(() => { 
                Toast.fire({ icon: 'success', title: 'บันทึกคะแนนแล้ว' }); 
            }).updateScore(subId, score, fbVal); 
        }

        function saveAllScores() {
            const inputs = document.querySelectorAll('.score-input'); let updates = [];
            inputs.forEach(input => { 
                const val = input.value; 
                if (val !== "") { 
                    const fbInput = document.querySelector(`.fb-input[data-id="${input.getAttribute('data-id')}"]`); 
                    updates.push({ id: input.getAttribute('data-id'), score: val, feedback: fbInput ? fbInput.value : '' }); 
                } 
            });
            if (updates.length === 0) { 
                Toast.fire({ icon: 'info', title: 'กรุณากรอกคะแนนก่อนบันทึก' }); 
                return; 
            }
            showLoading(true); 
            google.script.run.withSuccessHandler(() => { 
                showLoading(false); 
                Toast.fire({ icon: 'success', title: `บันทึก ${updates.length} รายการเรียบร้อยแล้ว` }); 
            }).updateMultipleScoresAndFeedback(updates);
        }

        function deleteSubmission(subId) { 
            Swal.fire({ 
                title: 'ยืนยันการลบ?', 
                text: "ข้อมูลและไฟล์ใน Google Drive จะถูกลบถาวร!", 
                icon: 'warning', 
                showCancelButton: true, 
                confirmButtonColor: '#d33', 
                confirmButtonText: 'ลบข้อมูลและไฟล์', 
                cancelButtonText: 'ยกเลิก'
            }).then((result) => { 
                if (result.isConfirmed) { 
                    showLoading(true); 
                    google.script.run.withSuccessHandler((res) => { 
                        showLoading(false); 
                        Toast.fire({ icon: 'success', title: 'ลบข้อมูลและไฟล์เรียบร้อยแล้ว' });
                        loadAllData();
                    }).deleteSubmission(subId); 
                } 
            }); 
        }

        function deleteRow(sheet, colIndex, value) { 
            Swal.fire({ 
                title: 'ยืนยันการลบ?', 
                text: "ข้อมูลจะถูกลบออกจากระบบ!",
                icon: 'warning',
                showCancelButton: true, 
                confirmButtonColor: '#d33',
                confirmButtonText: 'ลบทิ้ง',
                cancelButtonText: 'ยกเลิก'
            }).then((r) => { 
                if (r.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler(() => {
                        showLoading(false);
                        Toast.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ' });
                        loadAllData();
                    }).deleteRow(sheet, colIndex, value); 
                }
            }); 
        }

        function changePassword() { 
            const pass = document.getElementById('newAdminPass').value; 
            if (pass) {
                showLoading(true);
                google.script.run.withSuccessHandler(() => { 
                    showLoading(false);
                    Toast.fire({ icon: 'success', title: 'เปลี่ยนรหัสผ่านสำเร็จ' });
                    document.getElementById('newAdminPass').value = '';
                }).updatePassword(pass); 
            } else {
                Toast.fire({ icon: 'warning', title: 'กรุณากรอกรหัสผ่านใหม่' });
            }
        }

        function saveFolderID() { 
            const id = document.getElementById('driveFolderId').value; 
            if (id) {
                showLoading(true);
                google.script.run.withSuccessHandler(() => { 
                    showLoading(false);
                    Toast.fire({ icon: 'success', title: 'บันทึก Folder ID สำเร็จ' });
                }).updateFolderId(id); 
            } else {
                Toast.fire({ icon: 'warning', title: 'กรุณากรอก Folder ID' });
            }
        }

        function saveGeminiKey() { 
            const key = document.getElementById('geminiApiKey').value; 
            if (key) { 
                showLoading(true); 
                google.script.run.withSuccessHandler(() => { 
                    showLoading(false); 
                    Toast.fire({ icon: 'success', title: 'บันทึก API Key แล้ว!' });
                    loadAllData(); 
                }).updateGeminiApiKey(key); 
            } else {
                Toast.fire({ icon: 'warning', title: 'กรุณากรอก API Key' });
            }
        }
        
        // --- ฟังก์ชัน AI Auto-Grading ---
        function aiGradeSubmission(subId) {
            Swal.fire({
                title: '✨ ให้ AI ช่วยตรวจ',
                html: `
                  <div class="text-left">
                     <p class="text-sm text-gray-600 mb-2">โปรดระบุเกณฑ์การประเมินชิ้นงานนี้ เพื่อให้ AI ให้คะแนนได้อย่างแม่นยำ</p>
                     <input id="ai_max_score" type="number" class="swal2-input !w-[90%] !mb-2" placeholder="คะแนนเต็ม (สำคัญมาก)" value="10">
                     <textarea id="ai_criteria" class="swal2-textarea !w-[90%] !h-24 !text-sm" placeholder="เช่น: สรุปใจความสำคัญได้ครบ 5 ข้อ ไม่สะกดผิด และอ่านเข้าใจง่าย"></textarea>
                  </div>
                `,
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-magic"></i> เริ่มวิเคราะห์',
                confirmButtonColor: '#6366f1',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => { 
                    const maxScore = document.getElementById('ai_max_score').value;
                    const criteria = document.getElementById('ai_criteria').value;
                    if(!maxScore || !criteria) {
                        Swal.showValidationMessage('กรุณากรอกคะแนนเต็มและเกณฑ์การประเมิน');
                        return false;
                    }
                    return { maxScore, criteria }; 
                }
            }).then((result) => {
                if(result.isConfirmed) {
                    isAdminInputFocused = true; // หยุด auto-refresh ระหว่างประมวลผล
                    Swal.fire({
                        title: '✨ AI กำลังวิเคราะห์ผลงาน...',
                        html: '<div class="text-sm text-gray-500">ขั้นตอนนี้อาจใช้เวลาประมาณ 10-30 วินาที ขึ้นอยู่กับขนาดและประเภทของหน้ากระดาษ...</div>',
                        allowOutsideClick: false,
                        didOpen: () => { Swal.showLoading(); }
                    });
                    
                    google.script.run.withSuccessHandler((res) => {
                        isAdminInputFocused = false;
                        if(res.error) {
                            Swal.fire('ข้อผิดพลาด', res.error, 'error');
                            return;
                        }
                        
                        Swal.fire({
                            title: 'ผลการประเมินจากข้อเสนอ AI',
                            html: `
                                <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-lg text-left mt-2">
                                    <h3 class="font-bold text-indigo-800 text-xl mb-1 flex items-center justify-between">
                                        <span>คะแนนที่แนะนำ:</span>
                                        <span class="bg-white px-3 py-1 rounded text-2xl shadow-sm text-indigo-600">${res.score}</span>
                                    </h3>
                                    <hr class="my-2 border-indigo-200">
                                    <p class="text-sm text-gray-700 leading-relaxed font-semibold">ข้อเสนอแนะ:</p>
                                    <p class="text-sm text-gray-700 leading-relaxed">${res.feedback}</p>
                                </div>
                            `,
                            showCancelButton: true,
                            confirmButtonText: 'ยอมรับคะแนนนี้',
                            confirmButtonColor: '#10b981',
                            cancelButtonText: 'ยกเลิก/ประเมินเอง'
                        }).then((acceptBtn) => {
                            if(acceptBtn.isConfirmed) {
                                // ยัดคะแนนที่ได้ลง input ตัวนั้น
                                const inputObj = document.querySelector(`.score-input[data-id="${subId}"]`);
                                const fbObj = document.querySelector(`.fb-input[data-id="${subId}"]`);
                                if(inputObj) {
                                    inputObj.value = res.score;
                                    inputObj.classList.add('animate-pulse', 'bg-green-100');
                                    setTimeout(()=> { inputObj.classList.remove('animate-pulse', 'bg-green-100'); }, 2000);
                                }
                                if(fbObj) {
                                    fbObj.value = res.feedback;
                                    fbObj.classList.add('animate-pulse', 'bg-green-100');
                                    setTimeout(()=> { fbObj.classList.remove('animate-pulse', 'bg-green-100'); }, 2000);
                                }
                            }
                        });
                        
                    }).withFailureHandler((err) => {
                        isAdminInputFocused = false;
                        Swal.fire('Error', 'ไม่สามารถเชื่อมต่อ Server: ' + err.toString(), 'error');
                    }).analyzeSubmissionWithGemini(subId, result.value.criteria, result.value.maxScore);
                }
            });
        }

        // --- ระบบสอบ (Exam System) ---
        let currentExamQuestions = [];
        let currentExamData = null;

        function renderExamSelectForm() {
            const classSelect = document.getElementById('exam_sub_class');
            if(classSelect && globalData.classes) {
                classSelect.innerHTML = '<option value="">-- เลือกชั้นเรียน --</option>';
                globalData.classes.forEach(c => { classSelect.innerHTML += `<option value="${c[0]}">${c[1]}</option>`; });
            }
        }

        function loadStudentsForExam() {
            const classId = document.getElementById('exam_sub_class').value;
            const studentSelect = document.getElementById('exam_sub_student');
            studentSelect.innerHTML = '<option value="">-- เลือกนักเรียน --</option>';
            document.getElementById('exam_sub_exam').innerHTML = '<option value="">-- รอเลือกนักเรียน --</option>';
            document.getElementById('exam_sub_exam').disabled = true;
            studentSelect.disabled = true;
            if (classId && globalData.students) {
                const students = globalData.students.filter(s => s[2] == classId);
                students.forEach(s => { studentSelect.innerHTML += `<option value="${s[0]}">${s[1]}</option>`; });
                studentSelect.disabled = false;
            }
        }

        function loadExamsForStudent() {
            const classId = document.getElementById('exam_sub_class').value;
            const studentId = document.getElementById('exam_sub_student').value;
            const examSelect = document.getElementById('exam_sub_exam');
            examSelect.innerHTML = '<option value="">-- เลือกชุดข้อสอบ --</option>';
            examSelect.disabled = true;
            if (classId && studentId && globalData.exams) {
                const exams = globalData.exams.filter(e => e[3] == classId && e[5] === 'Active');
                exams.forEach(e => {
                    const result = globalData.examResults.find(r => r[1] == e[0] && r[2] == studentId);
                    if(result) {
                        examSelect.innerHTML += `<option value="${e[0]}" disabled>${e[1]} (ทำไปแล้ว)</option>`;
                    } else {
                        examSelect.innerHTML += `<option value="${e[0]}">${e[1]}</option>`;
                    }
                });
                examSelect.disabled = false;
            }
        }

        function startExamWalkthrough() {
            const examId = document.getElementById('exam_sub_exam').value;
            const stuId = document.getElementById('exam_sub_student').value;
            if(!examId || !stuId) {
                Swal.fire('แจ้งเตือน', 'กรุณาเลือกข้อมูลให้ครบถ้วน', 'warning'); return;
            }
            
            const isTaken = globalData.examResults.find(r => r[1] == examId && r[2] == stuId);
            if(isTaken) { Swal.fire('ไม่สามารถสอบได้', 'คุณได้ทำข้อสอบชุดนี้ไปแล้ว หากต้องการสอบใหม่ กรุณาติดต่อครูผู้สอน', 'error'); return; }

            const exam = globalData.exams.find(e => e[0] == examId);
            const questions = globalData.questions.filter(q => q[1] == examId);
            if(questions.length === 0) {
                Swal.fire('ข้อผิดพลาด', 'ข้อสอบชุดนี้ยังไม่มีคำถาม กรุณาแจ้งผู้สอน', 'error'); return;
            }

            const maxQ = exam[4] || questions.length;
            const shuffledQ = questions.sort(() => 0.5 - Math.random()).slice(0, maxQ);
            
            currentExamQuestions = shuffledQ;
            currentExamData = { examId, stuId, exam };

            renderExamQuestions(shuffledQ);
            
            document.getElementById('examSelectView').classList.add('hidden');
            document.getElementById('examActiveView').classList.remove('hidden');
        }

        function renderExamQuestions(questions) {
            const container = document.getElementById('examQuestionContainer');
            container.innerHTML = '';
            questions.forEach((q, index) => {
                let opts = [
                    { id: 'ก', text: q[3] },
                    { id: 'ข', text: q[4] },
                    { id: 'ค', text: q[5] },
                    { id: 'ง', text: q[6] }
                ];
                opts = opts.sort(() => 0.5 - Math.random());
                
                let html = `<div class="bg-gray-50 p-5 rounded-2xl border border-gray-200 mb-4 shadow-sm">
                    <p class="font-bold text-gray-800 mb-3 text-lg">${index + 1}. ${q[2]}</p>
                    <div class="grid gap-2">`;
                
                const displayLabels = ['ก', 'ข', 'ค', 'ง'];
                opts.forEach((opt, i) => {
                    html += `
                        <label class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-rose-50 hover:border-rose-300 transition-all group">
                            <input type="radio" name="ans_${q[0]}" value="${opt.id}" class="w-5 h-5 text-rose-500 focus:ring-rose-400">
                            <span class="text-gray-700 font-medium">${displayLabels[i]}. ${opt.text}</span>
                        </label>
                    `;
                });
                html += `</div></div>`;
                container.innerHTML += html;
            });
            document.getElementById('btnSubmitExam').classList.remove('hidden');
        }

        function submitExamFinal() {
            Swal.fire({
                title: 'ยืนยันการส่งข้อสอบ',
                text: 'ตรวจสอบคำตอบให้ถี่ถ้วน ส่งแล้วจะไม่สามารถกลับมาแก้ไขได้อีก!',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'ยืนยันส่งข้อสอบ',
                cancelButtonText: 'กลับไปแก้'
            }).then(res => {
                if(res.isConfirmed) {
                    processExamAnswers();
                }
            });
        }

        function processExamAnswers() {
            let score = 0;
            currentExamQuestions.forEach(q => {
                const selected = document.querySelector(`input[name="ans_${q[0]}"]:checked`);
                if(selected && selected.value === q[7]) score++;
            });
            
            showLoading(true);
            google.script.run.withSuccessHandler((res) => {
                showLoading(false);
                if(res === 'ERROR_LOCKED') {
                    Swal.fire('ข้อผิดพลาด', 'คุณส่งข้อสอบชุดนี้ไปแล้ว', 'error');
                } else {
                    document.getElementById('examActiveView').classList.add('hidden');
                    document.getElementById('examResultView').classList.remove('hidden');
                    document.getElementById('examFinalScore').innerText = score;
                    globalData.examResults.push(['RES_TEMP', currentExamData.examId, currentExamData.stuId, score, new Date(), true]);
                }
            }).submitExam(currentExamData.examId, currentExamData.stuId, score);
        }

        function resetExamView() {
            document.getElementById('examResultView').classList.add('hidden');
            document.getElementById('examActiveView').classList.add('hidden');
            document.getElementById('examSelectView').classList.remove('hidden');
            document.getElementById('examQuestionContainer').innerHTML = '';
            
            const stuSelect = document.getElementById('exam_sub_student');
            const exSelect = document.getElementById('exam_sub_exam');
            if(stuSelect) { stuSelect.value = ""; stuSelect.disabled = true; }
            if(exSelect) { exSelect.value = ""; exSelect.disabled = true; }
            document.getElementById('exam_sub_class').value = "";
            
            // Reload data silently to update 'exam taken' status
            loadAllData(true);
        }

        // --- Admin Exam UI ---
        function renderAdminExams() {
            const tbody = document.getElementById('adminExamList');
            if(!tbody) return;
            
            if(!globalData.exams || globalData.exams.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500 bg-gray-50"><i class="fas fa-clipboard-list text-3xl mb-2 text-gray-300"></i><br>ยังไม่มีชุดข้อสอบ</td></tr>';
                return;
            }
            
            let htmlFragments = [];
            globalData.exams.forEach(ex => {
                const subj = globalData.subjects.find(s => s[0] == ex[2]);
                const cls = globalData.classes.find(c => c[0] == ex[3]);
                const qCount = globalData.questions ? globalData.questions.filter(q => q[1] == ex[0]).length : 0;
                
                htmlFragments.push(`
                    <tr class="border-b hover:bg-rose-50/30 transition-colors">
                        <td class="p-4 font-bold text-gray-800">${ex[1]}</td>
                        <td class="p-4 text-gray-600 font-medium">${subj ? subj[1] : '-'} <span class="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 ml-1">${cls ? cls[1] : '-'}</span></td>
                        <td class="p-4 text-center">
                            <span class="inline-block bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">${qCount} ข้อ</span><br>
                            <span class="text-xs text-gray-400 mt-1 inline-block">สุ่มสอบ ${ex[4]} ข้อ</span>
                        </td>
                        <td class="p-4 text-center flex justify-center gap-2">
                             <button onclick="manageExamQuestions('${ex[0]}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg shadow-sm transition text-xs flex items-center gap-1 font-medium" title="ลงโจทย์และชอยส์คำตอบ"><i class="fas fa-list-ol"></i> ข้อสอบ/เฉลย</button>
                             <button onclick="viewExamResults('${ex[0]}')" class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-sm transition text-xs flex items-center gap-1 font-medium"><i class="fas fa-chart-pie"></i> ผลลัพธ์</button>
                             <button onclick="editExam('${ex[0]}')" class="bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg shadow-sm transition text-xs flex items-center gap-1 font-medium" title="แก้ไข"><i class="fas fa-edit"></i></button>
                             <button onclick="deleteRow('Exams', 0, '${ex[0]}')" class="bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg shadow-sm transition text-xs flex items-center gap-1 font-medium" title="ลบ"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `);
            });
            tbody.innerHTML = htmlFragments.join('');
        }
        
        function openExamModal() {
            let classOps = '';  globalData.classes.forEach(c => classOps += `<option value="${c[0]}">${c[1]}</option>`);
            let subjOps = '';   globalData.subjects.forEach(s => subjOps += `<option value="${s[0]}">${s[1]}</option>`);
            Swal.fire({
                title: 'สร้างบทสอบใหม่',
                html: `
                    <div class="text-left space-y-3 mt-3">
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ชื่อชุดข้อสอบ</label><input type="text" id="ex_title" class="swal2-input !w-full !m-0 !h-10 text-sm"></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">วิชา</label><select id="ex_subj" class="swal2-select !w-full flex !m-0 !h-10 text-sm"><option value="">-- เลือก --</option>${subjOps}</select></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ระดับชั้น</label><select id="ex_class" class="swal2-select !w-full flex !m-0 !h-10 text-sm"><option value="">-- เลือก --</option>${classOps}</select></div>
                        <div class="bg-rose-50 p-3 rounded-lg border border-rose-100 mt-4">
                            <label class="text-sm font-bold text-rose-800 mb-1 flex items-center justify-between">จำกัดจำนวนข้อ <i class="fas fa-random"></i></label>
                            <p class="text-xs text-rose-600 mb-2">เมื่อเด็กเข้าสอบ ระบบจะสุ่มข้อจากฐานข้อมูลมาตามจำนวนนี้</p>
                            <input type="number" id="ex_max" class="swal2-input !w-full !m-0 !h-10 text-sm" value="20" min="1">
                        </div>
                    </div>
                `,
                showCancelButton:true,
                confirmButtonText: 'บันทึก',
                confirmButtonColor: '#f43f5e',
                preConfirm: () => {
                    const title = document.getElementById('ex_title').value;
                    const subj = document.getElementById('ex_subj').value;
                    const cls = document.getElementById('ex_class').value;
                    const max = document.getElementById('ex_max').value;
                    if(!title || !subj || !cls) { Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ'); return false; }
                    return {title,subj,cls,max};
                }
            }).then(r => {
                if(r.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler(() => {
                        loadAllData(); Toast.fire({ icon: 'success', title: 'บันทึกข้อสอบแล้ว' });
                    }).saveExam('', r.value.title, r.value.subj, r.value.cls, r.value.max, 'Active');
                }
            });
        }
        
        function manageExamQuestions(examId) {
            const exam = globalData.exams.find(e => e[0] == examId);
            const questions = globalData.questions ? globalData.questions.filter(q => q[1] == examId) : [];
            
            let qHtml = '<div class="space-y-3 mt-3 max-h-[60vh] overflow-y-auto px-2 pb-6 text-sm">';
            if(questions.length === 0) {
                qHtml += '<p class="text-center text-gray-500 py-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50"><i class="fas fa-info-circle text-2xl mb-2 text-gray-300"></i><br>ยังไม่มีข้อสอบในชุดนี้</p>';
            }
            questions.forEach((q, idx) => {
                qHtml += `
                    <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group text-left hover:border-indigo-200 transition-colors">
                        <div class="flex justify-between items-start mb-2">
                            <span class="font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded text-xs">ข้อ ${idx+1}.</span>
                            <div class="flex gap-1">
                                <button onclick="editQuestion('${q[0]}', '${examId}')" class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 shadow-sm transition" title="แก้ไขข้อสอบ"><i class="fas fa-edit"></i></button>
                                <button onclick="deleteQuestion('${q[0]}')" class="text-xs text-red-600 bg-red-50 px-2 py-1 rounded hover:bg-red-100 shadow-sm transition" title="ลบข้อสอบ"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <p class="text-gray-800 text-sm mb-3 break-words font-medium pl-1">${q[2]}</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div class="p-2 rounded-lg border ${q[7]==='ก'?'bg-emerald-50 border-emerald-300 font-bold text-emerald-800 ring-1 ring-emerald-300':'bg-gray-50 border-gray-100 text-gray-600'}">ก. ${q[3]}</div>
                            <div class="p-2 rounded-lg border ${q[7]==='ข'?'bg-emerald-50 border-emerald-300 font-bold text-emerald-800 ring-1 ring-emerald-300':'bg-gray-50 border-gray-100 text-gray-600'}">ข. ${q[4]}</div>
                            <div class="p-2 rounded-lg border ${q[7]==='ค'?'bg-emerald-50 border-emerald-300 font-bold text-emerald-800 ring-1 ring-emerald-300':'bg-gray-50 border-gray-100 text-gray-600'}">ค. ${q[5]}</div>
                            <div class="p-2 rounded-lg border ${q[7]==='ง'?'bg-emerald-50 border-emerald-300 font-bold text-emerald-800 ring-1 ring-emerald-300':'bg-gray-50 border-gray-100 text-gray-600'}">ง. ${q[6]}</div>
                        </div>
                    </div>
                `;
            });
            qHtml += '</div>';

            Swal.fire({
                title: `จัดการข้อสอบ: ${exam ? exam[1]:''}`,
                html: qHtml,
                width: 800,
                showCancelButton: true,
                showConfirmButton: true,
                showDenyButton: true,
                confirmButtonText: '<i class="fas fa-plus"></i> เพิ่มโจทย์ใหม่',
                confirmButtonColor: '#4f46e5',
                denyButtonText: '<i class="fas fa-file-import"></i> นำเข้าหลายข้อ',
                denyButtonColor: '#10b981',
                cancelButtonText: 'ปิด'
            }).then(r => {
                if(r.isConfirmed) {
                    editQuestion('', examId);
                } else if(r.isDenied) {
                    importMultipleQuestions(examId);
                }
            });
        }

        function editQuestion(qId, examId) {
            let q = ['', '', '', '', '', '', '', 'ก'];
            if(qId) {
                const found = globalData.questions.find(x => x[0] == qId);
                if(found) q = found;
            }
            
            Swal.fire({
                title: qId ? 'แก้ไขคำถาม' : 'เพิ่มคำถามใหม่',
                html: `
                    <div class="text-left space-y-4 mt-4">
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <label class="text-sm font-bold text-gray-800 mb-2 block">📋 โจทย์คำถาม / ข้อความ:</label>
                            <textarea id="q_text" class="border border-gray-300 p-3 rounded-xl w-full h-24 text-sm focus:ring-2 outline-none focus:ring-indigo-400 shadow-sm">${q[2]}</textarea>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <label class="text-sm font-bold text-gray-800 mb-3 block">ตัวเลือก (Choices):</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div class="flex items-center gap-2"><span class="font-bold text-gray-600 bg-white px-2 py-1 rounded shadow-sm">ก.</span><input type="text" id="q_a" value="${q[3]}" class="border border-gray-300 p-2 rounded-lg w-full text-sm shadow-sm focus:ring-2 focus:ring-indigo-400 outline-none"></div>
                                <div class="flex items-center gap-2"><span class="font-bold text-gray-600 bg-white px-2 py-1 rounded shadow-sm">ข.</span><input type="text" id="q_b" value="${q[4]}" class="border border-gray-300 p-2 rounded-lg w-full text-sm shadow-sm focus:ring-2 focus:ring-indigo-400 outline-none"></div>
                                <div class="flex items-center gap-2"><span class="font-bold text-gray-600 bg-white px-2 py-1 rounded shadow-sm">ค.</span><input type="text" id="q_c" value="${q[5]}" class="border border-gray-300 p-2 rounded-lg w-full text-sm shadow-sm focus:ring-2 focus:ring-indigo-400 outline-none"></div>
                                <div class="flex items-center gap-2"><span class="font-bold text-gray-600 bg-white px-2 py-1 rounded shadow-sm">ง.</span><input type="text" id="q_d" value="${q[6]}" class="border border-gray-300 p-2 rounded-lg w-full text-sm shadow-sm focus:ring-2 focus:ring-indigo-400 outline-none"></div>
                            </div>
                        </div>
                        <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between shadow-sm">
                            <label class="text-sm font-bold text-indigo-800">✅ เลือกเฉลยข้อที่ถูกต้องที่สุด:</label>
                            <select id="q_ans" class="border-2 border-indigo-200 p-2 rounded-lg bg-white w-32 font-bold text-indigo-700 outline-none focus:border-indigo-400 shadow-sm transition">
                                <option value="ก" ${q[7]==='ก'?'selected':''}>ก.</option>
                                <option value="ข" ${q[7]==='ข'?'selected':''}>ข.</option>
                                <option value="ค" ${q[7]==='ค'?'selected':''}>ค.</option>
                                <option value="ง" ${q[7]==='ง'?'selected':''}>ง.</option>
                            </select>
                        </div>
                    </div>
                `,
                width: 700,
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-save"></i> บันทึกข้อสอบนี้',
                confirmButtonColor: '#4f46e5',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => {
                    return {
                        text: document.getElementById('q_text').value,
                        a: document.getElementById('q_a').value,
                        b: document.getElementById('q_b').value,
                        c: document.getElementById('q_c').value,
                        d: document.getElementById('q_d').value,
                        ans: document.getElementById('q_ans').value
                    }
                }
            }).then(r => {
                if(r.isConfirmed) {
                    if(!r.value.text || !r.value.a || !r.value.ans) { Swal.fire('ผิดพลาด','กรุณากรอกโจทย์และชอยส์ให้ครบ','error'); return; }
                    showLoading(true);
                    google.script.run.withSuccessHandler(()=>{
                        showLoading(false);
                        loadAllData(true); 
                        setTimeout(() => manageExamQuestions(examId), 1000); 
                    }).withFailureHandler(err => {
                        showLoading(false);
                        Swal.fire('Error', err.message, 'error');
                    }).saveQuestion(examId, qId, r.value.text, r.value.a, r.value.b, r.value.c, r.value.d, r.value.ans);
                } else if(r.dismiss === Swal.DismissReason.cancel) {
                    manageExamQuestions(examId);
                }
            });
        }

        function deleteQuestion(qId) {
            Swal.fire({ title:'ลบข้อสอบนี้?', icon:'warning', showCancelButton:true, confirmButtonColor:'#d33', confirmButtonText: 'ลบทิ้ง' }).then(r=>{
                if(r.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler(()=>{ 
                        showLoading(false);
                        loadAllData(true);
                        Toast.fire({ icon: 'success', title: 'ลบข้อสอบแล้ว' }); 
                    }).withFailureHandler(err => {
                        showLoading(false);
                        Swal.fire('Error', err.message, 'error');
                    }).deleteRow('Questions', 0, qId);
                }
            });
        }

        function viewExamResults(examId) {
             const results = globalData.examResults.filter(r => r[1] == examId);
             
             // Sort by student name (handles roll numbers if included like "1. Name", "01. Name")
             results.sort((a,b) => {
                 const sA = globalData.students.find(s => s[0] == a[2]);
                 const sB = globalData.students.find(s => s[0] == b[2]);
                 const nameA = sA ? sA[1] : '';
                 const nameB = sB ? sB[1] : '';
                 return nameA.localeCompare(nameB, 'th', { numeric: true });
             });

             let html = '<div class="overflow-hidden border border-gray-200 rounded-xl"><table class="w-full text-sm text-left"><thead class="bg-gray-50"><th class="p-3 font-bold text-gray-700">ชื่อ-สกุล (เรียงตามเลขที่)</th><th class="p-3 font-bold text-gray-700 text-center">คะแนน</th><th class="p-3 font-bold text-gray-700 text-center">จัดการ</th></thead><tbody class="divide-y divide-gray-100">';
             results.forEach(r => {
                 const st = globalData.students.find(s => s[0] == r[2]);
                 html += `<tr>
                     <td class="p-3 text-gray-800 font-medium">${st?st[1]:'Unknown'}</td>
                     <td class="p-3 text-center"><span class="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded text-lg">${r[3]}</span></td>
                     <td class="p-3 text-center"><button onclick="unlockExamStudent('${r[0]}')" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg shadow-sm font-medium transition flex items-center gap-1 mx-auto" title="ให้สิทธิ์ทำข้อสอบใหม่"><i class="fas fa-lock-open"></i> ปลดล็อค</button></td>
                 </tr>`;
             });
             if(results.length===0) html += '<tr><td colspan="3" class="p-8 text-center text-gray-500 bg-gray-50"><i class="fas fa-folder-open mb-2 text-2xl"></i><br>ยังไม่มีนักเรียนส่งข้อสอบชุดนี้</td></tr>';
             html += '</tbody></table></div>';
             Swal.fire({
                 title: 'ผลการสอบเรียงตามเลขที่',
                 html: `<div class="max-h-[60vh] overflow-y-auto w-full">${html}</div>`,
                 width: 650,
                 showCancelButton: true,
                 showConfirmButton: false,
                 cancelButtonText: 'ปิด'
             });
        }
        
        function unlockExamStudent(resultId) {
             Swal.fire({ title: 'ปลดล็อคการสอบ?', text:'ประวัติและคะแนนเดิมจะถูกลบ และนักเรียนสามารถเข้าสอบใหม่ได้ทันที', icon:'warning', showCancelButton:true, confirmButtonColor: '#f43f5e', confirmButtonText: 'ปลดล็อค' })
             .then(r => {
                 if(r.isConfirmed) {
                     showLoading(true);
                     google.script.run.withSuccessHandler(()=>{ loadAllData(); Toast.fire({ icon: 'success', title: 'ปลดล็อคสำเร็จ' }); }).unlockExam(resultId);
                 }
             });
        }

        function importMultipleQuestions(examId) {
            Swal.fire({
                title: 'นำเข้าโจทย์หลายข้อ (Bulk Import)',
                html: `
                    <div class="text-left text-sm mt-3">
                        <p class="mb-2 text-gray-600">กรุณาวางโจทย์และตัวเลือกโดยใช้รูปแบบ <b>โจทย์ | ก | ข | ค | ง | เฉลย</b> (1 บรรทัดต่อ 1 ข้อ)</p>
                        <p class="mb-2 text-red-500 text-xs">** เฉลยต้องเป็นตัวอักษร ก ข ค หรือ ง เท่านั้น แยกด้วยเครื่องหมาย | (ไปป์)</p>
                        <textarea id="bulk_q_text" class="border border-gray-300 p-3 rounded-xl w-full h-48 text-sm focus:ring-2 outline-none focus:ring-indigo-400 shadow-sm" placeholder="ตัวอย่าง:\n1+1 เท่ากับเท่าไร? | 1 | 2 | 3 | 4 | ข\nเมืองหลวงของไทยคือ? | กรุงเทพ | เชียงใหม่ | ภูเก็ต | ชลบุรี | ก"></textarea>
                    </div>
                `,
                width: 700,
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-save"></i> นำเข้าโจทย์',
                confirmButtonColor: '#10b981',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => {
                    const text = document.getElementById('bulk_q_text').value.trim();
                    if (!text) { Swal.showValidationMessage('กรุณากรอกข้อมูลโจทย์'); return false; }
                    
                    const lines = text.split('\n');
                    const questionsToSave = [];
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const parts = line.split('|').map(p => p.trim());
                        if (parts.length < 6) {
                            Swal.showValidationMessage(`บรรทัดที่ ${i+1} มีรูปแบบไม่ถูกต้อง (ต้องการ 6 ส่วน คั่นด้วย |)`);
                            return false;
                        }
                        
                        const ans = parts[5].trim();
                        if (!['ก', 'ข', 'ค', 'ง'].includes(ans)) {
                            Swal.showValidationMessage(`บรรทัดที่ ${i+1} เฉลยต้องเป็น ก, ข, ค หรือ ง เท่านั้น`);
                            return false;
                        }
                        
                        questionsToSave.push({
                            text: parts[0],
                            a: parts[1],
                            b: parts[2],
                            c: parts[3],
                            d: parts[4],
                            ans: ans
                        });
                    }
                    return questionsToSave;
                }
            }).then(r => {
                if (r.isConfirmed && r.value.length > 0) {
                    showLoading(true);
                    google.script.run.withSuccessHandler((res) => {
                        showLoading(false);
                        loadAllData(true);
                        Toast.fire({ icon: 'success', title: `นำเข้าโจทย์ ${r.value.length} ข้อเรียบร้อย` });
                        setTimeout(() => manageExamQuestions(examId), 800);
                    }).withFailureHandler((err) => {
                        showLoading(false);
                        Swal.fire('ข้อผิดพลาด', err.message, 'error');
                    }).saveMultipleQuestions(examId, r.value);
                } else if(r.dismiss === Swal.DismissReason.cancel) {
                    manageExamQuestions(examId);
                }
            });
        }

        function editExam(id) {
            const exam = globalData.exams.find(e => e[0] == id);
            if (!exam) return;
            let classOps = '';  globalData.classes.forEach(c => classOps += `<option value="${c[0]}" ${c[0] == exam[3] ? 'selected' : ''}>${c[1]}</option>`);
            let subjOps = '';   globalData.subjects.forEach(s => subjOps += `<option value="${s[0]}" ${s[0] == exam[2] ? 'selected' : ''}>${s[1]}</option>`);
            
            Swal.fire({
                title: 'แก้ไขชุดข้อสอบ',
                html: `
                    <div class="text-left space-y-3 mt-3">
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ชื่อชุดข้อสอบ</label><input type="text" id="ex_title" class="swal2-input !w-full !m-0 !h-10 text-sm" value="${exam[1]}"></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">วิชา</label><select id="ex_subj" class="swal2-select !w-full flex !m-0 !h-10 text-sm">${subjOps}</select></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ระดับชั้น</label><select id="ex_class" class="swal2-select !w-full flex !m-0 !h-10 text-sm">${classOps}</select></div>
                        <div class="bg-rose-50 p-3 rounded-lg border border-rose-100 mt-4">
                            <label class="text-sm font-bold text-rose-800 mb-1 flex items-center justify-between">จำกัดจำนวนข้อ <i class="fas fa-random"></i></label>
                            <p class="text-xs text-rose-600 mb-2">เมื่อเด็กเข้าสอบ ระบบจะสุ่มข้อจากฐานข้อมูลมาตามจำนวนนี้</p>
                            <input type="number" id="ex_max" class="swal2-input !w-full !m-0 !h-10 text-sm" value="${exam[4]}" min="1">
                        </div>
                    </div>
                `,
                showCancelButton:true,
                confirmButtonText: 'บันทึก',
                confirmButtonColor: '#f43f5e',
                preConfirm: () => {
                    const title = document.getElementById('ex_title').value;
                    const subj = document.getElementById('ex_subj').value;
                    const cls = document.getElementById('ex_class').value;
                    const max = document.getElementById('ex_max').value;
                    if(!title || !subj || !cls) { Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ'); return false; }
                    return {title,subj,cls,max};
                }
            }).then(r => {
                if(r.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler(() => {
                        loadAllData(); Toast.fire({ icon: 'success', title: 'แก้ไขข้อสอบแล้ว' });
                    }).withFailureHandler(err => {
                        showLoading(false);
                        Swal.fire('Error', err.message, 'error');
                    }).saveExam(id, r.value.title, r.value.subj, r.value.cls, r.value.max, 'Active');
                }
            });
        }

        // --- Worksheet System ---
        function renderWorksheetFilter() {
            const filterSelect = document.getElementById('ws_filter_class');
            if (!filterSelect) return;
            filterSelect.innerHTML = '<option value="">-- แสดงทุกระดับชั้น --</option>';
            if (globalData.classes) {
                globalData.classes.forEach(c => {
                    filterSelect.innerHTML += `<option value="${c[0]}">${c[1]}</option>`;
                });
            }
        }

        function renderWorksheetCards() {
            const classId = document.getElementById('ws_filter_class').value;
            const container = document.getElementById('worksheetCardContainer');
            if (!container) return;

            if (!globalData.worksheets || globalData.worksheets.length === 0) {
                container.innerHTML = '<div class="col-span-full p-10 text-center text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200"><i class="fas fa-folder-open text-4xl mb-3 text-gray-300"></i><br><span class="text-sm">ยังไม่มีใบงานในระบบ</span></div>';
                return;
            }

            let filtered = globalData.worksheets;
            if (classId) {
                filtered = filtered.filter(ws => ws[3] == classId);
            }

            if (filtered.length === 0) {
                container.innerHTML = '<div class="col-span-full p-10 text-center text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200"><i class="fas fa-search text-4xl mb-3 text-gray-300"></i><br><span class="text-sm">ไม่พบใบงานสำหรับระดับชั้นที่เลือก</span></div>';
                return;
            }

            // Sort newest first
            const sorted = [...filtered].sort((a, b) => {
                const tA = parseInt(a[0].substring(2)) || 0;
                const tB = parseInt(b[0].substring(2)) || 0;
                return tB - tA;
            });

            const gradients = [
                'from-cyan-500 to-blue-500',
                'from-indigo-500 to-purple-500',
                'from-emerald-500 to-teal-500',
                'from-pink-500 to-rose-500',
                'from-amber-500 to-orange-500',
                'from-violet-500 to-fuchsia-500'
            ];

            let html = '';
            sorted.forEach((ws, idx) => {
                const subj = globalData.subjects ? globalData.subjects.find(s => s[0] == ws[2]) : null;
                const cls = globalData.classes ? globalData.classes.find(c => c[0] == ws[3]) : null;
                const grad = gradients[idx % gradients.length];
                const desc = ws[5] || '';

                html += `
                <div class="group bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div class="h-2 bg-gradient-to-r ${grad}"></div>
                    <div class="p-5">
                        <div class="flex items-start justify-between mb-3">
                            <div class="flex-1 min-w-0">
                                <h3 class="font-bold text-gray-800 text-lg leading-tight group-hover:text-cyan-600 transition-colors truncate">${ws[1]}</h3>
                                <div class="flex flex-wrap gap-1.5 mt-2">
                                    <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100">${subj ? subj[1] : '-'}</span>
                                    <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">${cls ? cls[1] : '-'}</span>
                                </div>
                            </div>
                            <div class="w-12 h-12 bg-gradient-to-br ${grad} rounded-xl flex items-center justify-center text-white text-lg shadow-sm flex-shrink-0 ml-3">
                                <i class="fas fa-file-pdf"></i>
                            </div>
                        </div>
                        ${desc ? `<p class="text-sm text-gray-500 mb-4 line-clamp-2">${desc}</p>` : '<div class="mb-4"></div>'}
                        <a href="${ws[4]}" target="_blank" rel="noopener noreferrer"
                            class="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r ${grad} text-white py-2.5 px-4 rounded-xl font-bold shadow-sm hover:shadow-md transition-all text-sm">
                            <i class="fas fa-download"></i> ดาวน์โหลดใบงาน
                        </a>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        function renderAdminWorksheets() {
            const filterClassId = document.getElementById('admin_ws_filter_class') ? document.getElementById('admin_ws_filter_class').value : '';
            const tbody = document.getElementById('adminWorksheetList');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (!globalData.worksheets || globalData.worksheets.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-500 bg-gray-50"><i class="fas fa-folder-open text-3xl mb-2 text-gray-300"></i><br>ยังไม่มีใบงาน</td></tr>';
                return;
            }

            let filtered = globalData.worksheets;
            if (filterClassId) {
                filtered = filtered.filter(ws => ws[3] == filterClassId);
            }

            // Sort newest first
            const sorted = [...filtered].sort((a, b) => {
                const tA = parseInt(a[0].substring(2)) || 0;
                const tB = parseInt(b[0].substring(2)) || 0;
                return tB - tA;
            });

            if (sorted.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">ไม่พบใบงานตามเงื่อนไข</td></tr>';
                return;
            }

            sorted.forEach(ws => {
                const subj = globalData.subjects ? globalData.subjects.find(s => s[0] == ws[2]) : null;
                const cls = globalData.classes ? globalData.classes.find(c => c[0] == ws[3]) : null;
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-cyan-50/30 transition-colors">
                        <td class="p-3 font-medium text-gray-800">${ws[1]}</td>
                        <td class="p-3 text-gray-600">${subj ? subj[1] : '-'}</td>
                        <td class="p-3"><span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100">${cls ? cls[1] : '-'}</span></td>
                        <td class="p-3 text-center"><a href="${ws[4]}" target="_blank" class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"><i class="fas fa-external-link-alt"></i> เปิดลิงก์</a></td>
                        <td class="p-3 text-center">
                            <button onclick="editWorksheet('${ws[0]}')" class="text-blue-500 hover:text-blue-700 mr-2" title="แก้ไข"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteRow('Worksheets', 0, '${ws[0]}')" class="text-red-500 hover:text-red-700" title="ลบ"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }

        function addWorksheet() {
            const title = document.getElementById('wsTitle').value.trim();
            const subjectId = document.getElementById('wsSubject').value;
            const classId = document.getElementById('wsClass').value;
            const driveLink = document.getElementById('wsDriveLink').value.trim();
            const description = document.getElementById('wsDescription').value.trim();

            if (!title || !subjectId || !classId || !driveLink) {
                Toast.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูลให้ครบ' });
                return;
            }

            showLoading(true);
            google.script.run.withSuccessHandler(() => {
                showLoading(false);
                Toast.fire({ icon: 'success', title: 'เพิ่มใบงานเรียบร้อย' });
                document.getElementById('wsTitle').value = '';
                document.getElementById('wsDriveLink').value = '';
                document.getElementById('wsDescription').value = '';
                loadAllData();
            }).withFailureHandler(err => {
                showLoading(false);
                Swal.fire('ข้อผิดพลาด', err.message, 'error');
            }).saveWorksheet('', title, subjectId, classId, driveLink, description);
        }

        function editWorksheet(id) {
            const ws = globalData.worksheets.find(w => w[0] == id);
            if (!ws) return;

            let subjOpts = globalData.subjects.map(s => `<option value="${s[0]}" ${s[0] == ws[2] ? 'selected' : ''}>${s[1]}</option>`).join('');
            let classOpts = globalData.classes.map(c => `<option value="${c[0]}" ${c[0] == ws[3] ? 'selected' : ''}>${c[1]}</option>`).join('');

            Swal.fire({
                title: 'แก้ไขใบงาน',
                html: `
                    <div class="text-left space-y-3 mt-3">
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ชื่อใบงาน</label><input type="text" id="edit_ws_title" class="swal2-input !w-full !m-0 !h-10 text-sm" value="${ws[1]}"></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">วิชา</label><select id="edit_ws_subj" class="swal2-select !w-full flex !m-0 !h-10 text-sm">${subjOpts}</select></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ระดับชั้น</label><select id="edit_ws_class" class="swal2-select !w-full flex !m-0 !h-10 text-sm">${classOpts}</select></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">ลิงก์ Google Drive</label><input type="url" id="edit_ws_link" class="swal2-input !w-full !m-0 !h-10 text-sm" value="${ws[4]}"></div>
                        <div><label class="text-sm font-bold text-gray-700 mb-1 block">คำอธิบาย</label><textarea id="edit_ws_desc" class="swal2-textarea !w-full !m-0 text-sm" style="height:80px">${ws[5] || ''}</textarea></div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                confirmButtonColor: '#06b6d4',
                cancelButtonText: 'ยกเลิก',
                preConfirm: () => {
                    const title = document.getElementById('edit_ws_title').value;
                    const subj = document.getElementById('edit_ws_subj').value;
                    const cls = document.getElementById('edit_ws_class').value;
                    const link = document.getElementById('edit_ws_link').value;
                    const desc = document.getElementById('edit_ws_desc').value;
                    if (!title || !subj || !cls || !link) { Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ'); return false; }
                    return { title, subj, cls, link, desc };
                }
            }).then(r => {
                if (r.isConfirmed) {
                    showLoading(true);
                    google.script.run.withSuccessHandler(() => {
                        loadAllData();
                        Toast.fire({ icon: 'success', title: 'แก้ไขใบงานเรียบร้อย' });
                    }).withFailureHandler(err => {
                        showLoading(false);
                        Swal.fire('Error', err.message, 'error');
                    }).saveWorksheet(id, r.value.title, r.value.subj, r.value.cls, r.value.link, r.value.desc);
                }
            });
        }
