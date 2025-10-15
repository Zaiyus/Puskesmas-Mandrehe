// --- script.js ---

// --- 1. DATA INDIKATOR DAN VARIABEL GLOBAL ---

// CATATAN: STORAGE_KEY lokal telah dihapus karena kita menggunakan Firestore.
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const NAMA_KLASTER = {
    1: "KLASTER 1: MANAJEMEN",
    2: "KLASTER 2: IBU DAN ANAK",
    3: "KLASTER 3: DEWASA DAN LANSIA",
    4: "KLASTER 4: P2M & KESLING",
    5: "KLASTER 5: LINTAS KLASTER"
};

// [BARU] Konfigurasi lokasi data Global di Firestore
const SHARED_COLLECTION = 'puskesmas_data'; // Koleksi khusus untuk data global aplikasi
const SHARED_DOC_ID = 'indikator_data_master'; // Dokumen tunggal yang menyimpan semua data indikator

// [BARU] Konfigurasi koleksi pengguna di Firestore
const USER_COLLECTION = 'puskesmas_users'; // Koleksi khusus untuk status konfirmasi user

let currentYear = new Date().getFullYear().toString();
let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
let CURRENT_UNIT_TYPE = 'raw'; 
let INDIKATOR_DATA = [];
let detailChartInstance = null; // Variabel global untuk instance Chart

// OPSI SATUAN LENGKAP untuk dropdown edit in-line
const SATUAN_OPTIONS = [
    'persen (%)', 'permil (‰)', 'rasio', 'kali', 'angka'
];


// --- 2. FUNGSI FIREBASE (AUTHENTICATION & FIRESTORE) ---

// Inisialisasi Firebase (Harus menggunakan versi compat karena ini adalah project lama)
// Pastikan konfigurasi (API Key dll.) sudah ada di file index.html atau di sini jika Anda ingin memindahkannya.
// Jika Anda menggunakan file index.html, hapus atau komentari baris di bawah ini:
// firebase.initializeApp(firebaseConfig); 

const auth = firebase.auth();
const db = firebase.firestore();


// [REVISI TOTAL] Status Otentikasi Berubah (MEMERLUKAN KONFIRMASI ADMIN)
auth.onAuthStateChanged(async (user) => {
    const authSection = document.getElementById('authSection');
    const mainContainer = document.getElementById('mainContainer');
    const logoutBtn = document.getElementById('logout-btn');
    const authError = document.getElementById('auth-error');
    
    // Sembunyikan pesan kesalahan lama
    authError.textContent = ''; 

    if (user) {
        // Tampilkan status pemeriksaan
        authError.textContent = 'Memeriksa status akun...';
        
        try {
            // Cek status user di koleksi puskesmas_users
            const userDoc = await db.collection(USER_COLLECTION).doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                if (userData.status === 'active') {
                    // ✅ User aktif: Berikan akses penuh
                    CURRENT_USER_UID = user.uid;
                    authSection.style.display = 'none';
                    mainContainer.classList.remove('content-hidden');
                    logoutBtn.style.display = 'inline-block';
                    authError.textContent = ''; // Hapus pesan status
                    loadDataFromFirestore();
                } else {
                    // ⏳ User pending/rejected: Tahan di halaman auth
                    await auth.signOut(); // Logout user dari Auth
                    
                    authSection.style.display = 'flex';
                    mainContainer.classList.add('content-hidden');
                    logoutBtn.style.display = 'none';
                    
                    // Tampilkan pesan penolakan/pending
                    if (userData.status === 'pending') {
                        authError.textContent = "Akun Anda sedang menunggu konfirmasi/persetujuan dari Admin. Silakan coba lagi nanti.";
                    } else if (userData.status === 'rejected') {
                        authError.textContent = "Registrasi akun Anda telah ditolak oleh Admin.";
                    } else {
                         authError.textContent = "Akun Anda tidak aktif. Silakan hubungi Admin.";
                    }
                    console.warn(`Akses ditolak untuk ${user.email}. Status: ${userData.status}`);
                }
            } else {
                // Kasus anomali: User di Auth tapi tidak di Firestore. Logout dan minta registrasi ulang.
                await auth.signOut();
                authError.textContent = "Data pengguna tidak ditemukan. Silakan Register kembali atau hubungi Admin.";
            }

        } catch (error) {
            console.error("Gagal memeriksa status Firestore:", error);
            authError.textContent = `Error: Gagal memuat status akun. ${error.message}`;
            // Untuk jaga-jaga, logout user jika error
            await auth.signOut().catch(e => console.error("Gagal logout saat error:", e));
        }

    } else {
        // User telah Logout
        CURRENT_USER_UID = null;
        INDIKATOR_DATA = [];
        authSection.style.display = 'flex'; // Tampilkan form login
        mainContainer.classList.add('content-hidden');
        logoutBtn.style.display = 'none';
        // Biarkan pesan error/pending tetap ada jika ada, atau hapus jika user baru saja logout
        if (authError.textContent.includes('status akun...')) {
            authError.textContent = ''; 
        }
    }
});


// Load data dari Firestore
async function loadDataFromFirestore() {
    try {
        const docRef = db.collection(SHARED_COLLECTION).doc(SHARED_DOC_ID);
        const doc = await docRef.get();

        if (doc.exists) {
            INDIKATOR_DATA = doc.data().data || [];
            console.log("Data berhasil dimuat dari Firestore.", INDIKATOR_DATA.length, "indikator.");
            renderAll();
        } else {
            // Jika dokumen belum ada, inisialisasi dengan data kosong atau struktur default jika diperlukan
            console.log("Dokumen indikator master tidak ditemukan, menggunakan data kosong.");
            INDIKATOR_DATA = [];
            renderAll();
        }
    } catch (error) {
        console.error("Gagal memuat data dari Firestore:", error);
        document.getElementById('auth-error').textContent = `Gagal memuat data. Error: ${error.message}`;
        // Jika gagal, pastikan dashboard kosong
        INDIKATOR_DATA = [];
        renderAll();
    }
}

// Simpan data ke Firestore
async function saveDataToFirestore() {
    // Hanya simpan jika ada user yang aktif dan terkonfirmasi
    if (!auth.currentUser || !document.getElementById('mainContainer').classList.contains('content-hidden')) {
        try {
            // Gunakan set dengan merge: true untuk memastikan dokumen indikator master dibuat/diperbarui
            await db.collection(SHARED_COLLECTION).doc(SHARED_DOC_ID).set({
                data: INDIKATOR_DATA,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: auth.currentUser ? auth.currentUser.email : 'system'
            }, { merge: true });
            console.log("Data berhasil disimpan ke Firestore.");
        } catch (error) {
            console.error("Gagal menyimpan data ke Firestore:", error);
            alert(`Gagal menyimpan data: ${error.message}`);
        }
    }
}

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDisplay = document.getElementById('auth-error');
    errorDisplay.textContent = 'Mencoba login...';

    try {
        // Cukup panggil signInWithEmailAndPassword. 
        // Proses validasi status pending/active akan ditangani oleh auth.onAuthStateChanged.
        await auth.signInWithEmailAndPassword(email, password);
        // Jika login berhasil, onAuthStateChanged akan mengambil alih.
        // Jika statusnya pending, onAuthStateChanged akan melogout user kembali.

    } catch (error) {
        console.error("Login Gagal:", error);
        errorDisplay.textContent = `Login Gagal: ${error.message}`;
    }
});


// [REVISI] Register Akun Baru (Menambahkan Status 'pending' ke Firestore)
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const errorDisplay = document.getElementById('auth-error');
    errorDisplay.textContent = 'Memproses registrasi...';

    try {
        // 1. Buat user di Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password); 
        const uid = userCredential.user.uid;

        // 2. Simpan status user ke Firestore sebagai 'pending'
        await db.collection(USER_COLLECTION).doc(uid).set({
            email: email,
            status: 'pending', // ⬅️ Kunci: User baru berstatus pending
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 3. Informasikan pengguna dan logout mereka (agar auth.onAuthStateChanged menangani penolakan)
        alert("Registrasi Berhasil! Akun Anda sekarang berstatus 'Menunggu Konfirmasi Admin'. Silakan Login untuk memeriksa status.");
        await auth.signOut(); // Pastikan mereka dialihkan ke halaman login/pending
        
        // Alihkan kembali ke form Login
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
        errorDisplay.textContent = 'Akun berhasil dibuat. Silakan Login untuk melihat status konfirmasi.';

    } catch (error) {
        console.error("Register Gagal:", error);
        errorDisplay.textContent = `Register Gagal: ${error.message}`;
    }
});


// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    await auth.signOut();
    // auth.onAuthStateChanged akan menangani tampilan dashboard
});

// Toggle antara Login dan Register
document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
});


// --- 3. FUNGSI UTILITAS DATA ---

// Fungsi untuk mendapatkan objek indikator berdasarkan ID
function getIndicatorById(id) {
    return INDIKATOR_DATA.find(i => i.id === id);
}

// Fungsi untuk membuat ID baru yang unik (UUID sederhana)
function generateUniqueId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Fungsi untuk menghasilkan data kumulatif (berdasarkan target & satuan)
function calculateCumulative(indikator) {
    const dataTahun = indikator.data[currentYear] || {};
    const bulan = NAMA_BULAN.map((_, i) => (i + 1).toString().padStart(2, '0'));
    
    // Inisialisasi data untuk chart: Nilai, Target
    const nilaiBulan = [];
    const targetBulan = [];

    // Tentukan apakah indikator memerlukan perhitungan kumulatif (e.g., Target tahunan yang dibagi rata per bulan)
    const isCumulative = indikator.target_type === 'yearly_distribute'; 

    let kumulatifNilai = 0;

    bulan.forEach((bln, index) => {
        const dataBulan = dataTahun[bln] || { nilai: 0 };
        const nilaiSaatIni = parseFloat(dataBulan.nilai) || 0;
        
        // Hitung Nilai Kumulatif
        if (isCumulative) {
            kumulatifNilai += nilaiSaatIni;
            nilaiBulan.push(kumulatifNilai);
        } else {
            // Jika bukan kumulatif (target per bulan), nilai ambil nilai bulan itu saja
            nilaiBulan.push(nilaiSaatIni);
        }
        
        // Hitung Target Kumulatif
        const targetTahunan = parseFloat(indikator.target_value) || 0;
        let targetSaatIni = 0;
        
        if (isCumulative) {
            // Target didistribusikan secara linier per bulan (Target Tahunan / 12) * (index + 1)
            targetSaatIni = (targetTahunan / 12) * (index + 1);
        } else {
            // Jika target per bulan, targetnya sama di setiap bulan (Target Tahunan)
            targetSaatIni = targetTahunan;
        }

        targetBulan.push(targetSaatIni);
    });
    
    // Hitung status terakhir (bulan terakhir yang ada datanya)
    const lastMonthIndex = nilaiBulan.findIndex(n => n > 0 || n < 0);
    const lastReportedMonth = lastMonthIndex !== -1 ? NAMA_BULAN[nilaiBulan.length - 1] : NAMA_BULAN[parseInt(currentMonth) - 1]; // Gunakan bulan terakhir yang diinput atau bulan sekarang
    const lastNilai = nilaiBulan[nilaiBulan.length - 1] || 0;
    const lastTarget = targetBulan[targetBulan.length - 1] || 0;
    
    const [status, statusColor] = getStatus(lastNilai, lastTarget, indikator.satuan, indikator.target_trend);

    return {
        nilaiBulan,
        targetBulan,
        lastNilai,
        lastTarget,
        status,
        statusColor
    };
}


// Fungsi penentuan status (Excellent, Good, Poor)
function getStatus(nilai, target, satuan, trend) {
    let status = 'T/A';
    let color = '#7F8C8D'; // Medium Text Color

    if (target === 0) {
        // Jika target 0, status tidak relevan, kecuali ada trend khusus.
        if (nilai > 0 && trend === 'up') {
            status = 'Data Masuk';
            color = '#3498DB'; // Biru Info
        } else if (nilai === 0) {
            status = 'T/A';
            color = '#7F8C8D';
        }
    } else {
        const rasio = (nilai / target) * 100;

        if (trend === 'up') {
            // Target semakin tinggi semakin baik
            if (rasio >= 100) {
                status = 'Excellent';
                color = '#2ECC71'; // Hijau (Success)
            } else if (rasio >= 80) {
                status = 'Good';
                color = '#F39C12'; // Kuning (Warning)
            } else {
                status = 'Poor';
                color = '#E74C3C'; // Merah (Danger)
            }
        } else if (trend === 'down') {
            // Target semakin rendah semakin baik
            if (rasio <= 100) {
                status = 'Excellent';
                color = '#2ECC71'; // Hijau (Success)
            } else if (rasio <= 120) {
                status = 'Good';
                color = '#F39C12'; // Kuning (Warning)
            } else {
                status = 'Poor';
                color = '#E74C3C'; // Merah (Danger)
            }
        } else if (trend === 'stable') {
            // Target harus mendekati target ideal
            if (rasio >= 95 && rasio <= 105) {
                status = 'Excellent';
                color = '#2ECC71'; 
            } else if (rasio >= 90 && rasio <= 110) {
                status = 'Good';
                color = '#F39C12'; 
            } else {
                status = 'Poor';
                color = '#E74C3C'; 
            }
        }
    }
    
    return [status, color];
}


// --- 4. FUNGSI RENDERING UI ---

function renderAll() {
    renderSummaryCards();
    renderDropdowns();
    renderDetailTable();
    // Defaultkan ke indikator pertama jika ada data
    if (INDIKATOR_DATA.length > 0) {
        const defaultIndikator = INDIKATOR_DATA[0];
        document.getElementById('detail-indikator-select').value = defaultIndikator.id;
        renderDetailChart(defaultIndikator.id);
    }
    // Update tahun di dashboard
    document.getElementById('current-year-display').textContent = currentYear;
}

// Render Kartu Ringkasan (Summary Cards)
function renderSummaryCards() {
    const cardContainer = document.getElementById('summary-cards-container');
    cardContainer.innerHTML = '';
    const summary = {
        totalIndikator: INDIKATOR_DATA.length,
        klaster: {}, // Hitungan status per klaster
    };

    // 1. Hitung Status dan Data
    INDIKATOR_DATA.forEach(indikator => {
        const klasterId = indikator.klaster_id.toString();
        if (!summary.klaster[klasterId]) {
            summary.klaster[klasterId] = { excellent: 0, good: 0, poor: 0, total: 0 };
        }
        
        const cumulativeData = calculateCumulative(indikator);
        const status = cumulativeData.status;

        summary.klaster[klasterId].total++;

        if (status === 'Excellent') {
            summary.klaster[klasterId].excellent++;
        } else if (status === 'Good') {
            summary.klaster[klasterId].good++;
        } else if (status === 'Poor') {
            summary.klaster[klasterId].poor++;
        }
        // Catatan: T/A tidak dihitung ke dalam status
    });

    // 2. Render Kartu
    
    // Kartu Total Indikator
    cardContainer.innerHTML += `
        <div class="card summary-card card-total">
            <i class="fas fa-list-check icon-total"></i>
            <div class="card-content">
                <p class="card-label">Total Indikator</p>
                <h2 class="card-value">${summary.totalIndikator}</h2>
                <p class="card-detail">Tahun ${currentYear}</p>
            </div>
        </div>
    `;

    // Kartu per Klaster
    Object.keys(NAMA_KLASTER).forEach(klasterId => {
        const klasterSummary = summary.klaster[klasterId] || { excellent: 0, good: 0, poor: 0, total: 0 };
        const namaKlasterSingkat = NAMA_KLASTER[klasterId].split(':')[0];
        const statusReported = klasterSummary.excellent + klasterSummary.good + klasterSummary.poor;

        if (klasterSummary.total > 0) {
            cardContainer.innerHTML += `
                <div class="card summary-card card-klaster-${klasterId}">
                    <i class="fas fa-layer-group icon-klaster"></i>
                    <div class="card-content">
                        <p class="card-label">${namaKlasterSingkat.trim()}</p>
                        <h2 class="card-value">${statusReported}/${klasterSummary.total}</h2>
                        <p class="card-detail">
                            <span class="status-excellent" style="font-weight: 600;">${klasterSummary.excellent} Excl.</span> |
                            <span class="status-good" style="font-weight: 600;">${klasterSummary.good} Good</span>
                        </p>
                    </div>
                </div>
            `;
        }
    });
}

// Render Dropdown untuk pemilih Indikator di bagian detail
function renderDropdowns() {
    const select = document.getElementById('detail-indikator-select');
    select.innerHTML = '<option value="">Pilih Indikator Kinerja</option>';

    // Urutkan Indikator berdasarkan Klaster ID
    const sortedData = [...INDIKATOR_DATA].sort((a, b) => a.klaster_id - b.klaster_id || a.indikator.localeCompare(b.indikator));

    let currentKlaster = null;
    sortedData.forEach(indikator => {
        // Tambahkan optgroup jika klaster berubah
        if (indikator.klaster_id !== currentKlaster) {
            if (currentKlaster !== null) {
                select.innerHTML += '</optgroup>';
            }
            select.innerHTML += `<optgroup label="${NAMA_KLASTER[indikator.klaster_id]}">`;
            currentKlaster = indikator.klaster_id;
        }

        select.innerHTML += `<option value="${indikator.id}">${indikator.indikator}</option>`;
    });

    // Tutup optgroup terakhir
    if (currentKlaster !== null) {
        select.innerHTML += '</optgroup>';
    }
}

// Render Tabel Detail (untuk Editing dan Tinjauan)
function renderDetailTable() {
    const tableBody = document.getElementById('data-table');
    const filterKlaster = document.getElementById('filter-klaster-table').value;
    tableBody.innerHTML = `
        <thead>
            <tr>
                <th>No</th>
                <th>Klaster</th>
                <th>Indikator Kinerja</th>
                <th>Satuan</th>
                <th>Target</th>
                <th>Trend</th>
                ${NAMA_BULAN.map(b => `<th class="month-col">${b.substring(0, 3)}</th>`).join('')}
                <th>Status T/A</th>
                <th style="width: 1%;">Aksi</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = tableBody.querySelector('tbody');
    const filteredData = INDIKATOR_DATA.filter(i => filterKlaster === '0' || i.klaster_id.toString() === filterKlaster);

    // Urutkan data berdasarkan Klaster ID
    const sortedData = [...filteredData].sort((a, b) => a.klaster_id - b.klaster_id || a.indikator.localeCompare(b.indikator));

    sortedData.forEach((indikator, index) => {
        const dataTahun = indikator.data[currentYear] || {};
        const cumulativeData = calculateCumulative(indikator);

        let row = `
            <tr data-indikator-id="${indikator.id}">
                <td>${index + 1}</td>
                <td>${NAMA_KLASTER[indikator.klaster_id]}</td>
                <td class="editable" data-field="indikator">${indikator.indikator}</td>
                <td>${createDropdown('satuan', indikator.id, indikator.satuan, SATUAN_OPTIONS)}</td>
                <td class="editable" data-field="target_value">${indikator.target_value}</td>
                <td>${createDropdown('target_trend', indikator.id, indikator.target_trend, ['up', 'down', 'stable'])}</td>
        `;

        // Kolom Data Bulanan
        NAMA_BULAN.forEach((_, monthIndex) => {
            const monthKey = (monthIndex + 1).toString().padStart(2, '0');
            const nilai = dataTahun[monthKey]?.nilai || 0;
            row += `<td class="editable data-input-cell" data-field="data" data-month="${monthKey}">${nilai}</td>`;
        });
        
        // Kolom Status Akhir
        row += `
                <td class="display-badge status-badge" style="background-color: ${cumulativeData.statusColor};">${cumulativeData.status}</td>
                <td>
                    <button onclick="deleteIndikator('${indikator.id}')" title="Hapus Indikator"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
    
    // Aktifkan event listener untuk editing
    attachTableEditListeners();
}

// Fungsi untuk membuat dropdown HTML
function createDropdown(field, id, selectedValue, options) {
    let html = `<select class="inline-select" data-field="${field}" data-indikator-id="${id}">`;
    options.forEach(option => {
        const value = option.split(' ')[0].toLowerCase().trim().replace('%', ''); // Ambil hanya nilai, e.g. 'persen' dari 'persen (%)'
        html += `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${option.toUpperCase()}</option>`;
    });
    html += '</select>';
    return html;
}

// Fungsi untuk mengatur event listener pada sel yang dapat diedit di tabel
function attachTableEditListeners() {
    // 1. Event Listener untuk Cell Text (Indikator Kinerja, Target Value)
    document.querySelectorAll('#data-table .editable:not(.data-input-cell)').forEach(cell => {
        cell.onclick = function() {
            if (this.querySelector('input')) return; // Hindari re-edit

            const originalValue = this.textContent.trim();
            const field = this.dataset.field;
            const indikatorId = this.closest('tr').dataset.indikatorId;
            const isTarget = field === 'target_value';

            // Ganti sel dengan input
            this.innerHTML = `<input type="${isTarget ? 'number' : 'text'}" value="${originalValue}" class="${isTarget ? 'target-input' : ''}" style="width: 100%; box-sizing: border-box;">`;
            const input = this.querySelector('input');
            input.focus();

            const saveChanges = () => {
                const newValue = input.value.trim();
                this.textContent = newValue; // Kembalikan ke teks
                
                // Simpan perubahan ke data array dan Firestore
                if (newValue !== originalValue) {
                    const indikator = getIndicatorById(indikatorId);
                    if (indikator) {
                        indikator[field] = isTarget ? parseFloat(newValue) || 0 : newValue;
                        saveDataToFirestore();
                        renderSummaryCards();
                        // Update chart detail jika indikator yang diedit sedang ditampilkan
                        if (document.getElementById('detail-indikator-select').value === indikatorId) {
                            renderDetailChart(indikatorId);
                        }
                    }
                }
            };

            input.onblur = saveChanges;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveChanges();
                }
            };
        };
    });

    // 2. Event Listener untuk Cell Data Bulanan
    document.querySelectorAll('#data-table .data-input-cell').forEach(cell => {
        cell.onclick = function() {
            if (this.querySelector('input')) return;

            const originalValue = this.textContent.trim();
            const indikatorId = this.closest('tr').dataset.indikatorId;
            const monthKey = this.dataset.month;

            // Ganti sel dengan input
            this.innerHTML = `<input type="number" value="${originalValue}" style="width: 100%; box-sizing: border-box; text-align: center;">`;
            const input = this.querySelector('input');
            input.focus();

            const saveChanges = () => {
                const newValue = parseFloat(input.value) || 0;
                this.textContent = newValue; // Kembalikan ke teks
                
                // Simpan perubahan ke data array dan Firestore
                if (newValue !== parseFloat(originalValue) || newValue === 0 && parseFloat(originalValue) !== 0) {
                    const indikator = getIndicatorById(indikatorId);
                    if (indikator) {
                        if (!indikator.data[currentYear]) {
                            indikator.data[currentYear] = {};
                        }
                        indikator.data[currentYear][monthKey] = { nilai: newValue };
                        saveDataToFirestore();
                        renderSummaryCards();
                        // Update status di baris tabel saat ini
                        const cumulativeData = calculateCumulative(indikator);
                        this.closest('tr').querySelector('.status-badge').textContent = cumulativeData.status;
                        this.closest('tr').querySelector('.status-badge').style.backgroundColor = cumulativeData.statusColor;

                        // Update chart detail jika indikator yang diedit sedang ditampilkan
                        if (document.getElementById('detail-indikator-select').value === indikatorId) {
                            renderDetailChart(indikatorId);
                        }
                    }
                }
            };

            input.onblur = saveChanges;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveChanges();
                }
            };
        };
    });

    // 3. Event Listener untuk Dropdown (Satuan, Trend)
    document.querySelectorAll('#data-table .inline-select').forEach(select => {
        select.onchange = function() {
            const indikatorId = this.dataset.indikatorId;
            const field = this.dataset.field;
            const newValue = this.value;
            
            const indikator = getIndicatorById(indikatorId);
            if (indikator) {
                if (field === 'satuan') {
                    indikator.satuan = newValue;
                } else if (field === 'target_trend') {
                    indikator.target_trend = newValue;
                }
                saveDataToFirestore();
                renderSummaryCards();

                // Update status di baris tabel saat ini
                const cumulativeData = calculateCumulative(indikator);
                this.closest('tr').querySelector('.status-badge').textContent = cumulativeData.status;
                this.closest('tr').querySelector('.status-badge').style.backgroundColor = cumulativeData.statusColor;

                // Update chart detail jika indikator yang diedit sedang ditampilkan
                if (document.getElementById('detail-indikator-select').value === indikatorId) {
                    renderDetailChart(indikatorId);
                }
            }
        };
    });
}


// Fungsi untuk merender chart detail
function renderDetailChart(indikatorId) {
    const indikator = getIndicatorById(indikatorId);
    const chartCanvas = document.getElementById('detailChart');
    const detailHeader = document.getElementById('detail-header');
    const detailTarget = document.getElementById('detail-current-target');
    const detailStatus = document.getElementById('detail-current-status');
    const downloadBtn = document.getElementById('download-chart-btn');

    if (!indikator) {
        detailHeader.textContent = "Pilih Indikator";
        detailTarget.textContent = "Target: -";
        detailStatus.textContent = "Status: -";
        detailStatus.style.backgroundColor = '#7F8C8D';
        downloadBtn.style.display = 'none';
        if (detailChartInstance) {
             detailChartInstance.destroy();
             detailChartInstance = null;
        }
        return;
    }

    const { nilaiBulan, targetBulan, lastNilai, lastTarget, status, statusColor } = calculateCumulative(indikator);
    
    // Update Header dan Status
    detailHeader.textContent = indikator.indikator;
    detailTarget.textContent = `Target: ${indikator.target_value} ${indikator.satuan.toUpperCase()}`;
    detailStatus.textContent = `Status: ${status}`;
    detailStatus.style.backgroundColor = statusColor;
    downloadBtn.style.display = 'inline-block';
    downloadBtn.setAttribute('onclick', `downloadCurrentChart('${indikatorId}')`);

    // Hancurkan instance chart yang lama jika ada
    if (detailChartInstance) {
        detailChartInstance.destroy();
    }

    const data = {
        labels: NAMA_BULAN,
        datasets: [
            {
                label: `Realisasi Nilai (${indikator.satuan.toUpperCase()})`,
                data: nilaiBulan,
                borderColor: '#3498DB', // Biru Info
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                tension: 0.4,
                fill: false,
                borderWidth: 3,
                yAxisID: 'y'
            },
            {
                label: `Target (${indikator.satuan.toUpperCase()})`,
                data: targetBulan,
                borderColor: '#E74C3C', // Merah Danger
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                borderDash: [5, 5],
                tension: 0.4,
                fill: false,
                borderWidth: 2,
                yAxisID: 'y'
            }
        ]
    };
    
    // Tentukan jenis sumbu Y berdasarkan Satuan
    let yAxisType = 'linear';
    if (indikator.satuan.toLowerCase().includes('persen')) {
         yAxisType = 'percentage';
    }

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: `${indikator.satuan.toUpperCase()}`
                    },
                    // Khusus untuk persen
                    ...(yAxisType === 'percentage' && {
                        min: 0,
                        max: 150, // Max 150% untuk visualisasi
                        ticks: {
                            callback: function(value, index, ticks) {
                                return value + '%';
                            }
                        }
                    })
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-dark').trim(),
                        font: {
                            family: 'Inter',
                            size: 14,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(2).replace(/\.00$/, '') + (indikator.satuan.toLowerCase().includes('persen') ? '%' : '');
                            }
                            return label;
                        }
                    }
                }
            }
        }
    };

    detailChartInstance = new Chart(chartCanvas, config);
}


// --- 5. FUNGSI MANAJEMEN INDIKATOR (CRUD) ---

// Tambah Indikator
