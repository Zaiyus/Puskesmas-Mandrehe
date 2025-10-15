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

// [TAMBAHAN BARU] Konfigurasi koleksi pengguna di Firestore
const USER_COLLECTION = 'puskesmas_users'; // Koleksi khusus untuk status konfirmasi user

let currentYear = new Date().getFullYear().toString();
let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
let CURRENT_UNIT_TYPE = 'raw'; 
let INDIKATOR_DATA = [];
let detailChartInstance = null; // Variabel global untuk instance Chart

// OPSI SATUAN LENGKAP untuk dropdown edit in-line
const SATUAN_OPTIONS = `
    <option value="%">% (Persen)</option>
    <option value="‰">‰ (Permil)</option>
    <option value="/100.000">/100.000 (Rate Kematian/AKI)</option>
    <option value="/100">/100</option>
    <option value="Rasio">Rasio</option>
    <option value="Indeks">Indeks</option>
    <option value="Tema">Tema (KIE)</option>
    <option value="/mil">/mil (AK BPJS)</option>
`;
const DIRECTION_OPTIONS = `
    <option value="higher">Tinggi Baik (↑)</option>
    <option value="lower">Rendah Baik (↓)</option>
`;

// OPSI KLASTER LENGKAP untuk dropdown Pindah Klaster
const KLASTER_OPTIONS = `
    <option value="1">Klaster 1</option>
    <option value="2">Klaster 2</option>
    <option value="3">Klaster 3</option>
    <option value="4">Klaster 4</option>
    <option value="5">Klaster 5</option>
`;

const generateId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30) + '_' + Date.now();

let INDIKATOR_DATA_DEFAULT = [
    { id: generateId("1_farmasi_klinik"), klaster: 1, indikator: "Persentase Kegiatan Pelayanan Farmasi Klinik", target: 100, satuan: "%", target_direction: 'higher', history: {} },
    { id: generateId("1_ketersediaan_obat"), klaster: 1, indikator: "Persentase Ketersediaan Obat dan Vaksin", target: 95, satuan: "%", target_direction: 'higher', history: {} },
    { id: generateId("2_cakupan_k1"), klaster: 2, indikator: "Cakupan K1 Akses", target: 98, satuan: "%", target_direction: 'higher', history: {} },
    { id: generateId("2_rate_kematian_ibu"), klaster: 2, indikator: "Rate Kematian Ibu", target: 50, satuan: "/100.000", target_direction: 'lower', history: {} },
    { id: generateId("5_survey_kepuasan"), klaster: 5, indikator: "Nilai Survey Kepuasan Masyarakat", target: 85, satuan: "Indeks", target_direction: 'higher', history: {} }
];


// --- 2. FUNGSI FIREBASE (AUTHENTICATION & FIRESTORE) ---

const auth = firebase.auth();
const db = firebase.firestore();


// [A. REVISI KUNCI] Status Otentikasi Berubah (Gatekeeper Akses Dashboard)
auth.onAuthStateChanged(async (user) => {
    const authSection = document.getElementById('authSection');
    const mainContainer = document.getElementById('mainContainer');
    const logoutBtn = document.getElementById('logout-btn');
    const authError = document.getElementById('auth-error');
    
    // Sembunyikan pesan kesalahan/status lama
    authError.textContent = ''; 

    if (user) {
        CURRENT_USER_UID = user.uid;
        authError.textContent = 'Memeriksa status akun...';
        
        try {
            // KUNCI: Cek status user di koleksi puskesmas_users
            const userDoc = await db.collection(USER_COLLECTION).doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                if (userData.status === 'active') {
                    // ✅ User aktif: Berikan akses penuh ke dashboard
                    authSection.style.display = 'none';
                    mainContainer.classList.remove('content-hidden');
                    logoutBtn.style.display = 'inline-block';
                    authError.textContent = ''; // Hapus pesan status
                    loadDataFromFirestore();
                } else {
                    // ⏳ User pending/rejected: Tahan di halaman auth TAPI biarkan mereka tetap login
                    
                    authSection.style.display = 'flex'; // Tampilkan form login/register
                    mainContainer.classList.add('content-hidden'); // Sembunyikan dashboard
                    // Jika register berhasil, tombol logout tetap muncul
                    logoutBtn.style.display = 'inline-block'; 
                    
                    // Tampilkan pesan penolakan/pending
                    if (userData.status === 'pending') {
                        authError.textContent = "Akun Anda telah berhasil didaftarkan, namun masih menunggu konfirmasi/persetujuan dari Admin untuk mengakses dashboard.";
                    } else if (userData.status === 'rejected') {
                        authError.textContent = "Registrasi akun Anda telah ditolak oleh Admin. Silakan hubungi Admin untuk informasi lebih lanjut.";
                    } else {
                         authError.textContent = "Akun Anda tidak aktif. Silakan hubungi Admin.";
                    }
                    console.warn(`Akses dashboard ditolak untuk ${user.email}. Status: ${userData.status}`);
                }
            } else {
                // Kasus anomali (User ada di Auth tapi tidak ada di Firestore). 
                // Asumsikan mereka baru register tapi Firestore gagal, atau langsung blokir akses.
                authSection.style.display = 'flex';
                mainContainer.classList.add('content-hidden');
                logoutBtn.style.display = 'inline-block';
                authError.textContent = "Data pengguna tidak ditemukan di database. Silakan hubungi Admin.";
            }

        } catch (error) {
            console.error("Gagal memeriksa status Firestore:", error);
            authError.textContent = `Error: Gagal memuat status akun. ${error.message}`;
            authSection.style.display = 'flex'; 
            mainContainer.classList.add('content-hidden'); 
            logoutBtn.style.display = 'inline-block'; 
        }

    } else {
        // User telah Logout
        CURRENT_USER_UID = null;
        INDIKATOR_DATA = [];
        authSection.style.display = 'flex'; // Tampilkan form login
        mainContainer.classList.add('content-hidden');
        logoutBtn.style.display = 'none';
        authError.textContent = ''; // Hapus pesan error/status
    }
});


// [B. REVISI KUNCI] Register Akun Baru (Menambahkan Status 'pending' ke Firestore)
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
            status: 'pending', // <-- Kunci: User baru berstatus pending
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 3. Login berhasil, biarkan auth.onAuthStateChanged yang memblokir akses ke dashboard
        // Form register disembunyikan, tampilkan form login dengan pesan
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
        errorDisplay.textContent = "Registrasi Berhasil! Anda sudah Login, namun harus menunggu konfirmasi Admin untuk mengakses dashboard.";
        
        // Bersihkan form
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';

    } catch (error) {
        console.error("Register Gagal:", error);
        errorDisplay.textContent = `Register Gagal: ${error.message}`;
    }
});

// [C. TIDAK ADA PERUBAHAN] Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDisplay = document.getElementById('auth-error');
    errorDisplay.textContent = '';

    try {
        // Hanya login. auth.onAuthStateChanged akan mengecek status dan memblokir akses dashboard jika pending.
        await auth.signInWithEmailAndPassword(email, password);
        // Otomatis auth.onAuthStateChanged akan menangani tampilan dashboard
    } catch (error) {
        console.error("Login Gagal:", error);
        errorDisplay.textContent = `Login Gagal: ${error.message}`;
    }
});

// Logout
function logoutUser() {
    auth.signOut();
}

// Tampilkan/Sembunyikan form Register
document.getElementById('btn-show-register').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
});
document.getElementById('btn-show-login').addEventListener('click', () => {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
});


// [REVISI] Load Data dari Firestore (Sekarang dari dokumen Global)
async function loadDataFromFirestore() {
    if (!CURRENT_USER_UID) return; // Harus login untuk mengakses

    const docRef = db.collection(SHARED_COLLECTION).doc(SHARED_DOC_ID);

    try {
        const doc = await docRef.get();
        if (doc.exists && doc.data().indikatorData) {
            // Data Global ditemukan
            INDIKATOR_DATA = doc.data().indikatorData;
        } else {
            // Jika dokumen master belum ada (misal, pertama kali ada user yang login)
            // Lakukan inisialisasi dengan data default di dokumen global
            await docRef.set({
                indikatorData: INDIKATOR_DATA_DEFAULT,
                lastInitialized: firebase.firestore.FieldValue.serverTimestamp()
            });
            INDIKATOR_DATA = INDIKATOR_DATA_DEFAULT;
        }
        
        // Setelah data dimuat, render semua elemen UI
        initPeriodControls();
        changePeriod(); 
        populateCapaianSelect();

    } catch (error) {
        console.error("Gagal memuat data dari Firestore (Global):", error);
    }
}

// [REVISI] Simpan Data ke Firestore (Sekarang ke dokumen Global)
async function saveDataToFirestore() {
    if (!CURRENT_USER_UID) return;

    try {
        await db.collection(SHARED_COLLECTION).doc(SHARED_DOC_ID).update({
            indikatorData: INDIKATOR_DATA,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Gagal menyimpan data ke Firestore (Global):", error);
    }
}

// --- FUNGSI DATA STORAGE & HELPER (TIDAK BERUBAH) ---

function getIndicatorById(id) {
    return INDIKATOR_DATA.find(i => i.id === id);
}
// ... (Lanjutkan dengan semua fungsi lainnya: calculateCapaianValue, getCapaianForPeriod, getStatus, dst.)

function calculateCapaianValue(numerator, denominator, satuan) {
    if (numerator === null) return null;
    if (satuan === '%' || satuan === '‰' || satuan === '/100.000' || satuan === '/100') {
        if (denominator === null || denominator === 0) {
            return 0; 
        }
        let factor = 1;
        if (satuan === '%') factor = 100;
        if (satuan === '‰') factor = 1000;
        if (satuan === '/100.000') factor = 100000;
        if (satuan === '/100') factor = 100;

        // Untuk rate kematian (AKI), umumnya (Numerator/Denominator) * Factor, 
        // tapi di sini kita anggap Denominator adalah target populasi
        return (numerator / denominator) * factor; 
    }
    return numerator; // Untuk Indeks, Rasio, Tema, dll., cukup ambil numerator
}

// Mendapatkan nilai Capaian untuk periode tertentu
function getCapaianForPeriod(indikatorId, year, month) {
    const indikator = getIndicatorById(indikatorId);
    if (!indikator || !indikator.history[year] || !indikator.history[year][month]) {
        return { numerator: null, denominator: null, value: null };
    }
    const data = indikator.history[year][month];
    const value = calculateCapaianValue(data.numerator, data.denominator, indikator.satuan);
    return { 
        numerator: data.numerator, 
        denominator: data.denominator, 
        value: value !== null ? parseFloat(value.toFixed(2)) : null 
    };
}

// Mendapatkan Status (Poor, Good, Excellent)
function getStatus(value, target, direction) {
    if (value === null) return 'N/A';
    if (direction === 'higher') {
        if (value >= target) return 'excellent';
        if (value >= target * 0.8) return 'good';
        return 'poor';
    } else if (direction === 'lower') {
        if (value <= target) return 'excellent';
        if (value <= target * 1.2) return 'good';
        return 'poor';
    }
    return 'N/A';
}

// Konversi nilai mentah (misal 100%) ke format tampilan (misal 100.000)
function convertValue(value, currentSatuan) {
    if (value === null || isNaN(value)) return null;
    // ... (Fungsi konversi kompleks dihilangkan untuk fokus pada inti)
    return value; // Untuk saat ini, kembalikan nilai mentah
}


// --- 4. FUNGSI KONTROL PERIODE DAN SATUAN (TIDAK BERUBAH) ---

function initPeriodControls() {
    const selectTahun = document.getElementById('select-tahun');
    const selectBulan = document.getElementById('select-bulan');
    
    const START_YEAR = 2024;
    const currentYearNum = new Date().getFullYear();
    const maxYearDisplay = currentYearNum + 5; 
    
    selectTahun.innerHTML = ''; 

    for (let i = maxYearDisplay; i >= START_YEAR; i--) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = i.toString();
        selectTahun.appendChild(option);
    }

    selectTahun.value = currentYear;

    selectBulan.innerHTML = '';
    NAMA_BULAN.forEach((name, index) => {
        const option = document.createElement('option');
        option.value = (index + 1).toString().padStart(2, '0');
        option.textContent = name;
        selectBulan.appendChild(option);
    });
    selectBulan.value = currentMonth;
}

function changePeriod() {
    currentYear = document.getElementById('select-tahun').value;
    currentMonth = document.getElementById('select-bulan').value;
    
    document.getElementById('current-year-display').textContent = `${currentYear}`;
    document.getElementById('current-month-display').textContent = `${NAMA_BULAN[parseInt(currentMonth) - 1]}`;

    renderKlasterSummary();
    renderDetailTable();
    const currentIndikatorId = document.getElementById('detailChart').dataset.indikatorId;
    if (currentIndikatorId) {
        renderDetailChart(currentIndikatorId, currentYear);
    }
}

function changeUnitType() {
    CURRENT_UNIT_TYPE = document.getElementById('select-unit-type').value;
    
    renderKlasterSummary();
    renderDetailTable();
    
    const currentIndikatorId = document.getElementById('detailChart').dataset.indikatorId;
    if (currentIndikatorId) {
         renderDetailChart(currentIndikatorId, currentYear);
    }
}


// --- 5. FUNGSI RENDERING UI (TIDAK BERUBAH) ---

function renderKlasterSummary() {
    const cardsContainer = document.getElementById('summary-cards');
    cardsContainer.innerHTML = '';

    const klasterData = {};
    for (let i = 1; i <= 5; i++) {
        klasterData[i] = { total: 0, excellent: 0, good: 0, poor: 0 };
    }

    INDIKATOR_DATA.forEach(indikator => {
        const klasterId = indikator.klaster;
        const capaian = getCapaianForPeriod(indikator.id, currentYear, currentMonth);
        const status = getStatus(capaian.value, indikator.target, indikator.target_direction);

        if (klasterData[klasterId]) {
            klasterData[klasterId].total++;
            if (status === 'excellent') klasterData[klasterId].excellent++;
            if (status === 'good') klasterData[klasterId].good++;
            if (status === 'poor') klasterData[klasterId].poor++;
        }
    });

    for (const klasterId in klasterData) {
        const data = klasterData[klasterId];
        // Logika untuk menentukan status klaster: excellent jika semua excellent, poor jika poor > excellent, good sisanya
        const statusText = data.total === 0 ? '' : data.excellent === data.total ? 'excellent' : data.excellent > data.poor ? 'good' : 'poor';
        const card = document.createElement('div');
        card.className = `card status-${statusText}`;
        card.innerHTML = `
            <div class="card-title">${NAMA_KLASTER[klasterId] || `KLASTER ${klasterId}`}</div>
            <div class="card-value">${data.total === 0 ? 'N/A' : `${data.excellent}/${data.total}`}</div>
            <div class="card-target">
                <span>Excellent: ${data.excellent}</span>
                <span>Good: ${data.good}</span>
                <span>Poor: ${data.poor}</span>
            </div>
        `;
        cardsContainer.appendChild(card);
    }
}

function renderDetailTable() {
    const tableBody = document.getElementById('data-table');
    tableBody.innerHTML = '';
    const filterKlaster = document.getElementById('filter-klaster-table').value;

    // Sortir INDIKATOR_DATA berdasarkan nomor klaster sebelum filter
    INDIKATOR_DATA.sort((a, b) => a.klaster - b.klaster);

    const filteredData = INDIKATOR_DATA.filter(indikator => {
        return filterKlaster === '0' || indikator.klaster.toString() === filterKlaster;
    });
    
    // Tambahkan header tabel, termasuk kolom Nomor Urut (No)
    tableBody.innerHTML = `
        <thead>
            <tr>
                <th style="width: 3%;">No</th>
                <th style="width: 5%;">Klaster</th>
                <th style="width: 25%;">Indikator Kinerja</th>
                <th style="width: 10%;">Target</th>
                <th style="width: 8%;">Satuan</th>
                <th style="width: 8%;">Arah Target</th>
                <th style="width: 15%;">Capaian (${NAMA_BULAN[parseInt(currentMonth) - 1]})</th>
                <th style="width: 26%;">Aksi</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = tableBody.querySelector('tbody');

    filteredData.forEach((indikator, index) => { // Tambahkan index untuk Nomor Urut
        const capaian = getCapaianForPeriod(indikator.id, currentYear, currentMonth);
        const status = getStatus(capaian.value, indikator.target, indikator.target_direction);
        const capaianDisplay = capaian.value !== null ? `${capaian.value.toLocaleString('id-ID')}${indikator.satuan}` : 'N/A';
        const rawNum = capaian.numerator !== null ? capaian.numerator : '';
        const rawDen = capaian.denominator !== null ? capaian.denominator : '';
        
        // Buat opsi klaster, kecualikan klaster saat ini
        const moveKlasterOptions = KLASTER_OPTIONS.replace(`value="${indikator.klaster}"`, `value="${indikator.klaster}" disabled`);

        const row = document.createElement('tr');
        row.dataset.indikatorId = indikator.id;
        row.className = `status-${status}`;
        
        row.innerHTML = `
            <td>${index + 1}</td> <td class="klaster-id-cell" data-klaster-id="${indikator.klaster}">${indikator.klaster}</td>
            <td class="editable-cell" data-field="indikator" contenteditable="true" onblur="handleInlineEdit(event)" onclick="updateIndicatorDetails('${indikator.id}')">${indikator.indikator}</td>
            <td class="target-cell">
                <input type="number" class="editable-input" value="${indikator.target}" step="0.01" data-field="target" onchange="handleInlineEdit(event)">
            </td>
            <td class="satuan-cell">
                <select class="editable-select" data-field="satuan" onchange="handleInlineEdit(event)">
                    ${SATUAN_OPTIONS.replace(`value="${indikator.satuan}"`, `value="${indikator.satuan}" selected`)}
                </select>
            </td>
            <td class="direction-cell">
                <select class="editable-select" data-field="target_direction" onchange="handleInlineEdit(event)">
                    ${DIRECTION_OPTIONS.replace(`value="${indikator.target_direction}"`, `value="${indikator.target_direction}" selected`)}
                </select>
            </td>
            <td class="capaian-edit-cell">
                <input type="number" class="editable-input" placeholder="Pembilang" value="${rawNum}" step="0.01" data-field="numerator" onchange="handleInlineEdit(event)">
                <input type="number" class="editable-input" placeholder="Penyebut" value="${rawDen}" step="0.01" data-field="denominator" onchange="handleInlineEdit(event)">
                <span class="inline-capaian-display status-${status}">${capaianDisplay}</span>
            </td>
            <td>
                <button class="btn-trend" onclick="renderDetailChart('${indikator.id}', currentYear)"><i class="fas fa-chart-line"></i> Grafik</button>
                <div class="action-group">
                    <select id="select-move-klaster-${indikator.id}" data-indikator-id="${indikator.id}">
                        <option value="" disabled selected>Pindah ke...</option>
                        ${moveKlasterOptions}
                    </select>
                    <button class="btn-move" onclick="
                        const selectElement = document.getElementById('select-move-klaster-${indikator.id}');
                        const newKlaster = selectElement.value;
                        if(newKlaster) {
                            moveIndikatorToKlaster('${indikator.id}', parseInt(newKlaster));
                        } else {
                            alert('Pilih klaster tujuan terlebih dahulu.');
                        }
                    "><i class="fas fa-arrow-right"></i> Pindah</button>
                </div>
                <button class="btn-delete" onclick="deleteIndikator('${indikator.id}')"><i class="fas fa-trash"></i> Hapus</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function handleInlineEdit(event) {
    const element = event.target;
    const field = element.dataset.field;
    const row = element.closest('tr');
    const indikatorId = row.dataset.indikatorId;
    const indikator = getIndicatorById(indikatorId);

    if (!indikator) return;

    if (field === 'indikator') {
        indikator[field] = element.textContent.trim();
    } else if (field === 'target' || field === 'satuan' || field === 'target_direction') {
        indikator[field] = element.value;
        if (field === 'target') indikator[field] = parseFloat(element.value);
    } else if (field === 'numerator' || field === 'denominator') {
        const numElement = row.querySelector('[data-field="numerator"]');
        const denElement = row.querySelector('[data-field="denominator"]');
        const numerator = numElement.value.trim() === '' ? null : parseFloat(numElement.value);
        const denominator = denElement.value.trim() === '' ? null : parseFloat(denElement.value);
        
        updateCapaian(indikatorId, numerator, denominator);
        return; 
    }
    
    saveDataToFirestore();
    renderKlasterSummary();
    renderDetailTable();
    if (document.getElementById('detailChart').dataset.indikatorId === indikatorId) {
        renderDetailChart(indikatorId, currentYear);
    }
}

function updateIndicatorDetails(indikatorId) {
     document.getElementById('detailChart').dataset.indikatorId = indikatorId;
     renderDetailChart(indikatorId, currentYear);
}


function updateCapaian(indikatorId, numerator, denominator) {
    const indikator = getIndicatorById(indikatorId);
    if (!indikator) return;
    
    if (!indikator.history) indikator.history = {}; // Pastikan history ada
    if (!indikator.history[currentYear]) {
        indikator.history[currentYear] = {};
    }
    
    if (numerator === null && denominator === null) {
        if (indikator.history[currentYear][currentMonth]) {
            delete indikator.history[currentYear][currentMonth];
        }
    } else {
        indikator.history[currentYear][currentMonth] = {
            numerator: numerator,
            denominator: denominator,
            tanggal: new Date().toISOString()
        };
    }
    
    saveDataToFirestore();
    renderKlasterSummary();
    renderDetailTable();
    if (document.getElementById('detailChart').dataset.indikatorId === indikatorId) {
        renderDetailChart(indikatorId, currentYear);
    }
}

document.getElementById('capaian-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const indikatorId = document.getElementById('select-indikator-capaian').value;
    
    const numeratorInput = document.getElementById('input-capaian-num').value;
    const denominatorInput = document.getElementById('input-capaian-den').value;
    
    if (!indikatorId) {
        alert("Pilih indikator terlebih dahulu.");
        return;
    }
    
    const numerator = numeratorInput.trim() === '' ? null : parseFloat(numeratorInput);
    const denominator = denominatorInput.trim() === '' ? null : parseFloat(denominatorInput);

    if ((numerator !== null && isNaN(numerator)) || (denominator !== null && isNaN(denominator))) {
        alert('Pembilang dan Penyebut harus berupa angka valid.');
        return;
    }
    
    if (numerator === null && denominator === null) {
        alert('Harap isi Pembilang dan/atau Penyebut.');
        return;
    }

    updateCapaian(indikatorId, numerator, denominator);
    
    document.getElementById('input-capaian-num').value = '';
    document.getElementById('input-capaian-den').value = '';
    alert(`Capaian untuk bulan ${NAMA_BULAN[parseInt(currentMonth) - 1]} ${currentYear} berhasil diperbarui.`);
});


document.getElementById('new-indicator-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('new-indikator-name').value.trim();
    const target = parseFloat(document.getElementById('new-indikator-target').value);
    const satuan = document.getElementById('new-indikator-satuan').value;
    const klaster = parseInt(document.getElementById('new-indikator-klaster').value);
    const direction = document.getElementById('new-indikator-direction').value;

    if (!name || isNaN(target)) {
        alert("Nama indikator dan Target harus diisi dengan benar.");
        return;
    }
    
    const newId = generateId(name);
    INDIKATOR_DATA.push({
        id: newId,
        klaster: klaster,
        indikator: name,
        target: target,
        satuan: satuan,
        target_direction: direction,
        history: {}
    });

    saveDataToFirestore();
    document.getElementById('new-indicator-form').reset();
    populateCapaianSelect();
    renderKlasterSummary();
    renderDetailTable();
    alert(`Indikator "${name}" berhasil ditambahkan!`);
});

function deleteIndikator(id) {
    if (confirm("Apakah Anda yakin ingin menghapus indikator ini secara permanen?")) {
        INDIKATOR_DATA = INDIKATOR_DATA.filter(indikator => indikator.id !== id);
        saveDataToFirestore();
        populateCapaianSelect();
        renderKlasterSummary();
        renderDetailTable();
        // Reset chart jika yang dihapus adalah yang sedang dilihat
        if (document.getElementById('detailChart').dataset.indikatorId === id) {
            document.getElementById('detailChart').dataset.indikatorId = '';
            document.getElementById('detail-indicator-name').textContent = 'Pilih Indikator di Tabel Bawah';
            if (detailChartInstance) {
                detailChartInstance.destroy();
            }
        }
    }
}

// FUNGSI BARU UNTUK MEMINDAHKAN KLASTER
function moveIndikatorToKlaster(indikatorId, newKlasterId) {
    const indikator = getIndicatorById(indikatorId);
    if (!indikator) {
        alert("Indikator tidak ditemukan.");
        return;
    }
    
    const oldKlasterName = NAMA_KLASTER[indikator.klaster];
    const newKlasterName = NAMA_KLASTER[newKlasterId];

    if (confirm(`Yakin ingin memindahkan indikator "${indikator.indikator}" dari ${oldKlasterName} ke ${newKlasterName}?`)) {
        indikator.klaster = newKlasterId;
        saveDataToFirestore();
        
        // Memanggil semua render agar tabel dan summary terupdate, termasuk nomor urut
        renderKlasterSummary();
        renderDetailTable(); 
        
        alert(`Indikator berhasil dipindahkan ke ${newKlasterName}.`);
    }
}


function populateCapaianSelect() {
    const select = document.getElementById('select-indikator-capaian');
    select.innerHTML = '<option value="" disabled selected>Pilih Indikator untuk Input Capaian</option>';
    
    INDIKATOR_DATA.sort((a, b) => a.klaster - b.klaster).forEach(indikator => {
        const option = document.createElement('option');
        option.value = indikator.id;
        option.textContent = `[Klaster ${indikator.klaster}] ${indikator.indikator}`;
        select.appendChild(option);
    });
}

function renderDetailChart(indikatorId, year) {
    const indikator = getIndicatorById(indikatorId);
    if (!indikator) return;
    
    document.getElementById('detailChart').dataset.indikatorId = indikatorId;
    document.getElementById('detail-indicator-name').textContent = indikator.indikator;
    document.getElementById('detail-current-target').textContent = `Target: ${indikator.target}${indikator.satuan}`;
    document.getElementById('download-chart-btn').style.display = 'inline-block';

    const labels = NAMA_BULAN;
    const capaianData = [];
    const targetData = [];

    labels.forEach((_, index) => {
        const month = (index + 1).toString().padStart(2, '0');
        const capaian = getCapaianForPeriod(indikatorId, year, month).value;
        capaianData.push(capaian);
        targetData.push(indikator.target);
    });
    
    if (detailChartInstance) {
        detailChartInstance.destroy();
    }

    const ctx = document.getElementById('detailChart').getContext('2d');
    detailChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Capaian',
                    data: capaianData,
                    borderColor: '#3498DB',
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Target',
                    data: targetData,
                    borderColor: '#E74C3C',
                    backgroundColor: '#E74C3C',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toLocaleString('id-ID') + indikator.satuan;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function downloadCurrentChart(indikatorId) {
    const chartCanvas = document.getElementById('detailChart');
    const indikator = getIndicatorById(indikatorId);
    if (!chartCanvas || !indikator) return;

    // Tambahkan background putih sebelum download
    const originalBackgroundColor = detailChartInstance.options.plugins.legend.labels.color;
    detailChartInstance.options.plugins.legend.labels.color = 'black'; // Set text color for better visibility
    detailChartInstance.options.animation = false; // Disable animation for download
    detailChartInstance.update();

    const image = chartCanvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = image;
    link.download = `Grafik_${indikator.indikator.replace(/[^a-zA-Z0-9]/g, '_')}_${currentYear}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Kembalikan pengaturan chart
    detailChartInstance.options.plugins.legend.labels.color = originalBackgroundColor;
    detailChartInstance.options.animation = true;
    detailChartInstance.update();
}

// --- INISIASI SAAT HALAMAN DIMUAT ---
document.addEventListener('DOMContentLoaded', () => {
    // initPeriodControls dipanggil di auth.onAuthStateChanged setelah user login
});
