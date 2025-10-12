// --- script.js ---

// --- 1. DATA INDIKATOR DAN VARIABEL GLOBAL ---

// Data default (hanya dimuat jika belum ada data di Firestore)
let INDIKATOR_DATA = [];
let detailChartInstance = null; // Variabel global untuk instance Chart

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const NAMA_KLASTER = {
    1: "KLASTER 1: MANAJEMEN",
    2: "KLASTER 2: IBU DAN ANAK",
    3: "KLASTER 3: DEWASA DAN LANSIA",
    4: "KLASTER 4: P2M & KESLING",
    5: "KLASTER 5: LINTAS KLASTER"
};

// Variabel Periode dan Satuan
let currentYear = new Date().getFullYear().toString();
let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
let CURRENT_UNIT_TYPE = 'raw'; 


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

// Helper untuk membuat ID unik
const generateId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30) + '_' + Date.now();

// Data default untuk user baru
let INDIKATOR_DATA_DEFAULT = [
    { id: generateId("1_farmasi_klinik"), klaster: 1, indikator: "Persentase Kegiatan Pelayanan Farmasi Klinik", target: 100, satuan: "%", target_direction: 'higher', history: {} },
    { id: generateId("1_ketersediaan_obat"), klaster: 1, indikator: "Persentase Ketersediaan Obat dan Vaksin", target: 95, satuan: "%", target_direction: 'higher', history: {} },
    { id: generateId("2_cakupan_k1"), klaster: 2, indikator: "Cakupan K1 Akses", target: 98, satuan: "%", target_direction: 'higher', history: {} },
    { id: generateId("2_rate_kematian_ibu"), klaster: 2, indikator: "Rate Kematian Ibu", target: 50, satuan: "/100.000", target_direction: 'lower', history: {} },
    { id: generateId("5_survey_kepuasan"), klaster: 5, indikator: "Nilai Survey Kepuasan Masyarakat", target: 85, satuan: "Indeks", target_direction: 'higher', history: {} }
];


// --- 2. FUNGSI FIREBASE (AUTHENTICATION & FIRESTORE) ---

// Status Otentikasi Berubah
auth.onAuthStateChanged(user => {
    if (user) {
        // User telah Login
        CURRENT_USER_UID = user.uid;
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainContainer').classList.remove('content-hidden');
        document.getElementById('logout-btn').style.display = 'inline-block';
        loadDataFromFirestore(); // Load data dari Firestore setelah login
    } else {
        // User telah Logout
        CURRENT_USER_UID = null;
        INDIKATOR_DATA = [];
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('mainContainer').classList.add('content-hidden');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// Register Akun Baru
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const errorDisplay = document.getElementById('auth-error');
    errorDisplay.textContent = '';

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        // Setelah register berhasil, langsung inisialisasi data default di Firestore
        await initializeNewUser(userCredential.user.uid);
    } catch (error) {
        console.error("Register Gagal:", error);
        errorDisplay.textContent = `Register Gagal: ${error.message}`;
    }
});

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDisplay = document.getElementById('auth-error');
    errorDisplay.textContent = '';

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error("Login Gagal:", error);
        errorDisplay.textContent = `Login Gagal: ${error.message}`;
    }
});

// Logout
function logoutUser() {
    auth.signOut();
}

// Inisialisasi Data User Baru di Firestore
async function initializeNewUser(uid) {
    if (!uid) return;
    try {
        await db.collection(USER_COLLECTION).doc(uid).set({
            indikatorData: INDIKATOR_DATA_DEFAULT,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Gagal inisialisasi data user baru:", error);
    }
}


// Load Data dari Firestore
async function loadDataFromFirestore() {
    if (!CURRENT_USER_UID) return;

    try {
        const doc = await db.collection(USER_COLLECTION).doc(CURRENT_USER_UID).get();
        if (doc.exists && doc.data().indikatorData) {
            INDIKATOR_DATA = doc.data().indikatorData;
        } else {
            // Jika dokumen tidak ada, inisialisasi data default
            await initializeNewUser(CURRENT_USER_UID);
            INDIKATOR_DATA = INDIKATOR_DATA_DEFAULT;
        }
        
        // Setelah data dimuat, render semua elemen UI
        initPeriodControls();
        changePeriod(); 
        populateCapaianSelect();

    } catch (error) {
        console.error("Gagal memuat data dari Firestore:", error);
    }
}

// Simpan Data ke Firestore
async function saveDataToFirestore() {
    if (!CURRENT_USER_UID) return;

    try {
        await db.collection(USER_COLLECTION).doc(CURRENT_USER_UID).update({
            indikatorData: INDIKATOR_DATA,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Gagal menyimpan data ke Firestore:", error);
    }
}


// --- 3. FUNGSI DATA STORAGE & HELPER ---

function getIndicatorById(id) {
    return INDIKATOR_DATA.find(i => i.id === id);
}

// ... (Fungsi-fungsi Helper: convertValue, getDisplayUnit, getStatus, initPeriodControls,
// changePeriod, changeUnitType, renderKlasterSummary, renderDetailTable, 
// updateIndicatorDetails, handleCapaianInlineEdit, updateCapaian, addIndikator, 
// deleteIndikator, showMoveKlasterDialog, moveIndikatorToKlaster, 
// populateCapaianSelect, showTrendChart, renderDetailChart, downloadCurrentChart)
// ... (Karena terlalu panjang, anggap fungsi-fungsi ini sudah ada di file script.js Anda)


// --- 4. FUNGSI KONTROL PERIODE DAN SATUAN ---

function initPeriodControls() {
    // [Kode initPeriodControls di sini]
    const selectTahun = document.getElementById('select-tahun');
    const selectBulan = document.getElementById('select-bulan');
    
    const START_YEAR = 2024;
    const END_YEAR = 2040; 
    const currentYearNum = new Date().getFullYear();
    const maxYearDisplay = Math.max(currentYearNum, END_YEAR); 
    
    selectTahun.innerHTML = ''; 

    for (let i = maxYearDisplay; i >= START_YEAR; i--) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = i.toString();
        selectTahun.appendChild(option);
    }

    if (currentYearNum >= START_YEAR && currentYearNum <= END_YEAR) {
        selectTahun.value = currentYearNum.toString();
        currentYear = currentYearNum.toString();
    } else {
        selectTahun.value = maxYearDisplay.toString();
        currentYear = maxYearDisplay.toString();
    }

    NAMA_BULAN.forEach((name, index) => {
        const option = document.createElement('option');
        option.value = (index + 1).toString().padStart(2, '0');
        option.textContent = name;
        selectBulan.appendChild(option);
    });
    selectBulan.value = currentMonth;
}

function changePeriod() {
    // [Kode changePeriod di sini]
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
    // [Kode changeUnitType di sini]
    CURRENT_UNIT_TYPE = document.getElementById('select-unit-type').value;
    
    renderKlasterSummary();
    renderDetailTable();
    
    const currentIndikatorId = document.getElementById('detailChart').dataset.indikatorId;
    if (currentIndikatorId) {
         renderDetailChart(currentIndikatorId, currentYear);
    }
}


// ... (Sisanya dari script.js)

// --- 8. INISIASI SAAT HALAMAN DIMUAT ---
document.addEventListener('DOMContentLoaded', () => {
    // Fungsi initPeriodControls akan dipanggil di loadDataFromFirestore setelah login
    // Tidak perlu loadData() lokal lagi karena sudah diganti dengan Firestore
});


// ... (Tambahkan semua fungsi yang ada di script.js Anda di bawah ini, 
// pastikan fungsi saveData() diganti menjadi saveDataToFirestore() untuk sinkronisasi)

/**
 * Memperbarui data capaian dengan Pembilang dan Penyebut
 */
function updateCapaian(indikatorId, numerator, denominator) {
    const indikator = getIndicatorById(indikatorId);
    if (!indikator) return;
    
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
    
    saveDataToFirestore(); // Ganti saveData() menjadi saveDataToFirestore()
    renderKlasterSummary();
    renderDetailTable();
    if (document.getElementById('detailChart').dataset.indikatorId === indikatorId) {
        renderDetailChart(indikatorId, currentYear);
    }
}

// ... (dan seterusnya, untuk fungsi-fungsi lain seperti addIndikator, deleteIndikator, dll.)
// PASTIKAN SEMUA PANGGILAN 'saveData()' di file 'script.js' Anda DIGANTI dengan 'saveDataToFirestore()'.
