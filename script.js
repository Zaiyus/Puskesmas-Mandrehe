// --- script.js ---

// --- 1. DATA INDIKATOR DAN VARIABEL GLOBAL ---

// Hapus STORAGE_KEY karena kita akan pakai Firebase Firestore
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
let INDIKATOR_DATA = [];
let detailChartInstance = null;
let CURRENT_USER_UID = null; // Variabel untuk UID pengguna yang sedang login

// OPSI SATUAN LENGKAP untuk dropdown edit in-line
const SATUAN_OPTIONS = `
    <option value="%">% (Persen)</option>
    <option value="‰">‰ (Permil)</option>
    <option value="/100.000">/100.000 (Rate)</option>
    <option value="raw">Nilai Mentah</option>
`;

const DIRECTION_OPTIONS = `
    <option value="up">Semakin Tinggi Semakin Baik</option>
    <option value="down">Semakin Rendah Semakin Baik</option>
`;


// --- DATA INDIKATOR DEFAULT (Hanya digunakan untuk user baru) ---
// Structure: [id, nama, klasterId, target, satuan, direction]
// Capaian: [{tahun, bulan, num, den}]
const INDIKATOR_DATA_DEFAULT = [
    { id: 'I-M-1', nama: 'Indikator Manajemen 1', klasterId: 1, target: 100, satuan: '%', direction: 'up', capaian: [] },
    { id: 'I-M-2', nama: 'Indikator Manajemen 2', klasterId: 1, target: 100, satuan: '%', direction: 'up', capaian: [] },
    { id: 'I-IA-1', nama: 'Indikator Ibu & Anak 1', klasterId: 2, target: 95, satuan: '%', direction: 'up', capaian: [] },
    { id: 'I-IA-2', nama: 'Angka Kematian Bayi', klasterId: 2, target: 0, satuan: '‰', direction: 'down', capaian: [] },
    { id: 'I-DL-1', nama: 'Indikator Dewasa & Lansia 1', klasterId: 3, target: 90, satuan: '%', direction: 'up', capaian: [] },
    { id: 'I-P2M-1', nama: 'Indikator P2M 1', klasterId: 4, target: 90, satuan: '%', direction: 'up', capaian: [] },
    { id: 'I-LK-1', nama: 'Indikator Lintas Klaster 1', klasterId: 5, target: 80, satuan: '%', direction: 'up', capaian: [] },
];


// ====================================================================
// --- 2. FUNGSI AUTENTIKASI DAN DATA STORAGE FIRESTORE ---
// ====================================================================

/**
 * Menyimpan data indikator saat ini ke Cloud Firestore.
 */
async function saveData() {
    if (!CURRENT_USER_UID) {
        console.warn("Gagal menyimpan: Pengguna tidak terautentikasi.");
        return;
    }
    
    // Dokumen disimpan di koleksi 'users' dengan ID = UID pengguna
    const docRef = db.collection('users').doc(CURRENT_USER_UID);
    
    try {
        await docRef.set({ indikatorData: INDIKATOR_DATA }, { merge: false });
        console.log("Data berhasil disimpan ke Firestore.");
    } catch (error) {
        console.error("Gagal menyimpan data ke Firestore:", error);
        alert("Gagal menyimpan data ke cloud. Cek koneksi internet atau konsol.");
    }
}


/**
 * Memuat data indikator dari Cloud Firestore atau menggunakan data default jika user baru.
 */
async function loadData() {
    if (!CURRENT_USER_UID) return;

    const docRef = db.collection('users').doc(CURRENT_USER_UID);

    try {
        const doc = await docRef.get();
        if (doc.exists && doc.data().indikatorData) {
            // Data ada, muat
            INDIKATOR_DATA = doc.data().indikatorData;
            console.log("Data berhasil dimuat dari Firestore.");
        } else {
            // Data tidak ada (User baru), inisialisasi dengan data default dan simpan
            INDIKATOR_DATA = INDIKATOR_DATA_DEFAULT;
            await saveData();
            console.log("User baru, data default diinisialisasi dan disimpan.");
        }
    } catch (error) {
        console.error("Gagal memuat data dari Firestore:", error);
    }
    
    // Panggil fungsi render setelah data dimuat
    renderKlasterSummary();
    renderDetailTable();
    populateCapaianSelect();
}

/**
 * Mengatur event listener untuk form Login/Register.
 */
function setupAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authError = document.getElementById('auth-error');

    // Toggle forms
    document.getElementById('btn-show-register').addEventListener('click', () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        authError.textContent = '';
    });
    document.getElementById('btn-show-login').addEventListener('click', () => {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        authError.textContent = '';
    });

    // Handle Login
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        authError.textContent = '';

        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                authError.textContent = 'Login Gagal: ' + error.message;
            });
    });

    // Handle Register
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        authError.textContent = '';

        auth.createUserWithEmailAndPassword(email, password)
            .catch(error => {
                authError.textContent = 'Register Gagal: ' + error.message;
            });
    });
}

/**
 * Fungsi Logout
 */
function logoutUser() {
    auth.signOut();
}

/**
 * Mengelola tampilan dan memuat data saat status otentikasi berubah.
 */
function handleAuthStateChange() {
    const mainContainer = document.getElementById('mainContainer');
    const authSection = document.getElementById('authSection');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Gunakan onAuthStateChanged untuk mendengarkan status login
    auth.onAuthStateChanged(user => {
        if (user) {
            // User login: Tampilkan Dashboard
            CURRENT_USER_UID = user.uid;
            authSection.classList.add('content-hidden');
            mainContainer.classList.remove('content-hidden');
            logoutBtn.style.display = 'block';
            
            // Muat data dari Firestore
            loadData(); 

        } else {
            // User logout: Sembunyikan Dashboard
            CURRENT_USER_UID = null;
            authSection.classList.remove('content-hidden');
            mainContainer.classList.add('content-hidden');
            logoutBtn.style.display = 'none';
            INDIKATOR_DATA = []; // Hapus data lama

            // Reset UI
            if (detailChartInstance) { detailChartInstance.destroy(); }
            document.getElementById('detail-indicator-name').textContent = 'Pilih Indikator di Tabel Bawah';
            document.getElementById('download-chart-btn').style.display = 'none';
        }
    });
}


// ====================================================================
// --- 3. FUNGSI UTILITAS PENGHITUNGAN (TETAP SAMA) ---
// ====================================================================

function calculatePercentage(num, den) {
    if (num === null || den === null || den === 0) return 0;
    return (num / den) * 100;
}

function calculatePermil(num, den) {
    if (num === null || den === null || den === 0) return 0;
    return (num / den) * 1000;
}

function calculateRate100K(num, den) {
    if (num === null || den === null || den === 0) return 0;
    return (num / den) * 100000;
}

function calculateCapaianValue(indikator) {
    const dataPeriod = indikator.capaian.find(c => c.tahun === currentYear && c.bulan === currentMonth);
    if (!dataPeriod || dataPeriod.num === null) return { value: null, num: dataPeriod ? dataPeriod.num : null, den: dataPeriod ? dataPeriod.den : null };

    const num = dataPeriod.num;
    const den = dataPeriod.den;

    switch (indikator.satuan) {
        case '%':
            return { value: calculatePercentage(num, den), num, den };
        case '‰':
            return { value: calculatePermil(num, den), num, den };
        case '/100.000':
            return { value: calculateRate100K(num, den), num, den };
        case 'raw':
        default:
            return { value: num, num, den };
    }
}

function getStatus(value, target, direction) {
    if (value === null) return { status: 'Unknown', color: 'status-unknown', text: 'Data Belum Diisi' };

    let status = 'Poor';
    let color = 'status-poor';

    if (direction === 'up') {
        if (value >= target) {
            status = 'Excellent';
            color = 'status-excellent';
        } else if (value >= (target * 0.8)) {
            status = 'Good';
            color = 'status-good';
        }
    } else if (direction === 'down') {
        if (value <= target) {
            status = 'Excellent';
            color = 'status-excellent';
        } else if (value <= (target * 1.25)) { // Contoh batas toleransi 25% di atas target
            status = 'Good';
            color = 'status-good';
        }
    }
    
    return { status, color, text: status };
}

function formatValue(value, satuan) {
    if (value === null) return '-';
    // Format angka menggunakan toLocaleString untuk pemisah ribuan
    const formattedNumber = value.toLocaleString('id-ID', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    
    if (satuan === 'raw') return formattedNumber;
    
    // Khusus untuk persen, permil, rate
    return formattedNumber + (satuan === '/100.000' ? '' : satuan);
}


// ====================================================================
// --- 4. FUNGSI CRUD DATA (HARUS ASYNC) ---
// ====================================================================

/**
 * Menambahkan indikator baru.
 */
async function addIndikator(nama, klasterId, target, satuan, direction) {
    const newId = `I-${klasterId}-${Date.now()}`;
    const newIndikator = {
        id: newId,
        nama,
        klasterId: parseInt(klasterId),
        target: parseFloat(target),
        satuan,
        direction,
        capaian: []
    };
    INDIKATOR_DATA.push(newIndikator);
    await saveData(); // Simpan ke Firestore
    renderKlasterSummary();
    renderDetailTable();
    populateCapaianSelect();
}

/**
 * Mengupdate nilai capaian untuk periode terpilih.
 */
async function updateCapaian(indikatorId, numerator, denominator) {
    const indikator = INDIKATOR_DATA.find(i => i.id === indikatorId);
    if (!indikator) return;

    let capaianIndex = indikator.capaian.findIndex(c => c.tahun === currentYear && c.bulan === currentMonth);
    
    // Buat objek capaian baru
    const newCapaian = {
        tahun: currentYear,
        bulan: currentMonth,
        num: numerator,
        den: denominator
    };

    if (capaianIndex > -1) {
        // Update data yang sudah ada
        indikator.capaian[capaianIndex] = newCapaian;
    } else {
        // Tambah data baru
        indikator.capaian.push(newCapaian);
    }
    
    await saveData(); // Simpan ke Firestore
    renderKlasterSummary();
    renderDetailTable();
    updateChartDisplay(indikatorId);
}

/**
 * Mengupdate detail indikator (nama, target, satuan, arah).
 */
async function updateIndicatorDetails(indikatorId, field, value) {
    const indikator = INDIKATOR_DATA.find(i => i.id === indikatorId);
    if (!indikator) return;

    // Konversi tipe data jika perlu
    let finalValue = value;
    if (field === 'target') {
        finalValue = parseFloat(value);
    } else if (field === 'klasterId') {
        finalValue = parseInt(value);
    }
    
    indikator[field] = finalValue;

    await saveData(); // Simpan ke Firestore
    renderKlasterSummary();
    renderDetailTable();
    populateCapaianSelect();
    updateChartDisplay(indikatorId);
}

/**
 * Menghapus indikator.
 */
async function deleteIndikator(indikatorId) {
    const confirmDelete = confirm(`Apakah Anda yakin ingin menghapus indikator dengan ID ${indikatorId}?`);
    if (!confirmDelete) return;

    INDIKATOR_DATA = INDIKATOR_DATA.filter(i => i.id !== indikatorId);
    
    await saveData(); // Simpan ke Firestore
    renderKlasterSummary();
    renderDetailTable();
    populateCapaianSelect();
    
    // Clear chart jika yang dihapus sedang ditampilkan
    if (document.getElementById('data-table').dataset.activeId === indikatorId) {
        if (detailChartInstance) { detailChartInstance.destroy(); }
        document.getElementById('detail-indicator-name').textContent = 'Pilih Indikator di Tabel Bawah';
        document.getElementById('download-chart-btn').style.display = 'none';
    }
    alert(`Indikator ${indikatorId} berhasil dihapus.`);
}

/**
 * Memindahkan indikator ke klaster lain.
 */
async function moveIndikatorToKlaster(indikatorId, newKlasterId) {
    const indikator = INDIKATOR_DATA.find(i => i.id === indikatorId);
    if (!indikator) return;

    indikator.klasterId = parseInt(newKlasterId);
    await saveData(); // Simpan ke Firestore
    renderKlasterSummary();
    renderDetailTable();
    alert(`Indikator berhasil dipindahkan ke ${NAMA_KLASTER[newKlasterId]}.`);
}

/**
 * Menghapus entri capaian dari riwayat.
 */
async function deleteCapaianEntry(indikatorId, tahun, bulan) {
    const indikator = INDIKATOR_DATA.find(i => i.id === indikatorId);
    if (!indikator) return;

    indikator.capaian = indikator.capaian.filter(c => !(c.tahun === tahun.toString() && c.bulan === bulan.toString()));

    await saveData(); // Simpan ke Firestore
    renderKlasterSummary();
    renderDetailTable();
    updateChartDisplay(indikatorId); // Perbarui chart
}


// ====================================================================
// --- 5. FUNGSI RENDERING UI ---
// ====================================================================

function renderKlasterSummary() {
    const summaryCards = document.getElementById('summaryCards');
    summaryCards.innerHTML = '';
    
    const klasterResults = {};

    for (const klasterId in NAMA_KLASTER) {
        klasterResults[klasterId] = {
            total: 0,
            excellent: 0,
            good: 0,
            poor: 0
        };
    }

    INDIKATOR_DATA.forEach(indikator => {
        const result = calculateCapaianValue(indikator);
        const status = getStatus(result.value, indikator.target, indikator.direction);
        
        const klaster = klasterResults[indikator.klasterId];
        if (klaster) {
            klaster.total++;
            if (status.status === 'Excellent') klaster.excellent++;
            else if (status.status === 'Good') klaster.good++;
            else if (status.status === 'Poor') klaster.poor++;
        }
    });

    for (const klasterId in klasterResults) {
        const klaster = klasterResults[klasterId];
        const compliance = klaster.total > 0 ? ((klaster.excellent + klaster.good) / klaster.total) * 100 : 0;
        
        let complianceStatus = 'status-unknown';
        let complianceText = 'UNKNOWN';
        if (compliance >= 90) { complianceStatus = 'status-excellent'; complianceText = 'Excellent'; }
        else if (compliance >= 80) { complianceStatus = 'status-good'; complianceText = 'Good'; }
        else if (klaster.total > 0) { complianceStatus = 'status-poor'; complianceText = 'Poor'; }

        summaryCards.innerHTML += `
            <div class="card" onclick="document.getElementById('filter-klaster-table').value=${klasterId}; renderDetailTable();">
                <h4>${NAMA_KLASTER[klasterId]}</h4>
                <div class="card-value ${complianceStatus}">${compliance.toFixed(1)}%</div>
                <div class="card-detail">Total Indikator: ${klaster.total} | Target Tercapai: ${klaster.excellent + klaster.good}</div>
                <div class="display-badge ${complianceStatus}" style="margin-top: 10px;">Status Klaster: ${complianceText}</div>
            </div>
        `;
    }
}

function renderDetailTable() {
    const tableBody = document.getElementById('data-table');
    const filterKlasterId = document.getElementById('filter-klaster-table').value;
    tableBody.innerHTML = `
        <thead>
            <tr>
                <th>Nama Indikator Kinerja</th>
                <th>Klaster</th>
                <th>Target</th>
                <th>Satuan</th>
                <th>Arah</th>
                <th>Capaian (${NAMA_BULAN[parseInt(currentMonth) - 1]} ${currentYear})</th>
                <th>Status</th>
                <th>Aksi</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const filteredData = INDIKATOR_DATA.filter(i => 
        filterKlasterId === '0' || i.klasterId.toString() === filterKlasterId
    ).sort((a, b) => a.klasterId - b.klasterId);

    const tbody = tableBody.querySelector('tbody');
    
    filteredData.forEach(indikator => {
        const result = calculateCapaianValue(indikator);
        const status = getStatus(result.value, indikator.target, indikator.direction);
        
        const row = document.createElement('tr');
        row.dataset.indicatorId = indikator.id;
        row.onclick = () => updateChartDisplay(indikator.id);

        tbody.innerHTML += `
            <tr data-indicator-id="${indikator.id}" onclick="updateChartDisplay('${indikator.id}')">
                <td class="editable-cell" 
                    onclick="makeEditable(this, '${indikator.id}', 'nama', 'text', \`${indikator.nama}\`)">
                    ${indikator.nama}
                </td>
                <td class="editable-cell" 
                    onclick="makeEditable(this, '${indikator.id}', 'klasterId', 'select', '${indikator.klasterId}')">
                    ${NAMA_KLASTER[indikator.klasterId]}
                </td>
                <td class="editable-cell" 
                    onclick="makeEditable(this, '${indikator.id}', 'target', 'number', '${indikator.target}')">
                    ${indikator.target}
                </td>
                <td class="editable-cell" 
                    onclick="makeEditable(this, '${indikator.id}', 'satuan', 'select', '${indikator.satuan}')">
                    ${indikator.satuan}
                </td>
                <td class="editable-cell" 
                    onclick="makeEditable(this, '${indikator.id}', 'direction', 'select', '${indikator.direction}')">
                    ${indikator.direction === 'up' ? 'Semakin Tinggi Baik' : 'Semakin Rendah Baik'}
                </td>
                <td>${formatValue(result.value, indikator.satuan)}</td>
                <td><span class="status-badge ${status.color}">${status.text}</span></td>
                <td>
                    <button class="btn-trend" onclick="event.stopPropagation(); showTrendModal('${indikator.id}')"><i class="fas fa-history"></i> Riwayat</button>
                    <button class="btn-move" onclick="event.stopPropagation(); showMoveModal('${indikator.id}')"><i class="fas fa-arrows-alt"></i> Pindah</button>
                    <button class="btn-delete" onclick="event.stopPropagation(); deleteIndikator('${indikator.id}')"><i class="fas fa-trash"></i> Hapus</button>
                </td>
            </tr>
        `;
    });
}

/**
 * Membuat sel tabel bisa diedit langsung.
 */
function makeEditable(cell, id, field, type, currentValue) {
    if (cell.querySelector('input') || cell.querySelector('select')) return; // Sudah dalam mode edit

    // Simpan nilai lama
    const originalText = cell.innerHTML;
    cell.innerHTML = '';
    
    let inputElement;

    if (type === 'select') {
        inputElement = document.createElement('select');
        inputElement.className = 'editable-select';
        
        if (field === 'satuan') {
            inputElement.innerHTML = SATUAN_OPTIONS;
        } else if (field === 'direction') {
            inputElement.innerHTML = DIRECTION_OPTIONS;
        } else if (field === 'klasterId') {
             inputElement.innerHTML = `
                <option value="1">Klaster 1: MANAJEMEN</option>
                <option value="2">Klaster 2: IBU DAN ANAK</option>
                <option value="3">Klaster 3: DEWASA DAN LANSIA</option>
                <option value="4">Klaster 4: P2M & KESLING</option>
                <option value="5">Klaster 5: LINTAS KLASTER</option>
            `;
        }
        
        inputElement.value = currentValue;

    } else { // type === 'text' or 'number'
        inputElement = document.createElement('input');
        inputElement.type = type === 'number' ? 'number' : 'text';
        inputElement.className = 'editable-input';
        inputElement.value = currentValue;
        if (type === 'number') inputElement.step = 'any';
    }

    inputElement.onblur = async function() {
        const newValue = inputElement.value.trim();
        if (newValue !== currentValue.toString() && newValue !== '') {
            // Panggil fungsi update, ini sekarang async
            await updateIndicatorDetails(id, field, newValue); 
        }
        // Render ulang untuk menampilkan nilai yang sudah diupdate
        renderDetailTable(); 
    };

    inputElement.onkeydown = function(e) {
        if (e.key === 'Enter') {
            inputElement.blur();
        } else if (e.key === 'Escape') {
            cell.innerHTML = originalText; // Batalkan
        }
    };

    cell.appendChild(inputElement);
    inputElement.focus();
}


// ====================================================================
// --- 6. FUNGSI CHART.JS ---
// ====================================================================

function updateChartDisplay(indikatorId) {
    const indikator = INDIKATOR_DATA.find(i => i.id === indikatorId);
    if (!indikator) return;
    
    // Hapus instance chart lama
    if (detailChartInstance) {
        detailChartInstance.destroy();
    }

    // Update Detail Info di atas chart
    const result = calculateCapaianValue(indikator);
    const status = getStatus(result.value, indikator.target, indikator.direction);

    document.getElementById('detail-indicator-name').innerHTML = `<i class="fas fa-chart-area"></i> ${indikator.nama}`;
    document.getElementById('detail-current-capaian').textContent = `Capaian Saat Ini: ${formatValue(result.value, indikator.satuan)}`;
    
    const statusBadge = document.getElementById('detail-current-status');
    statusBadge.className = `display-badge status-badge ${status.color}`;
    statusBadge.textContent = `Status: ${status.text}`;

    document.getElementById('detail-current-target').textContent = `Target: ${indikator.target}${indikator.satuan === 'raw' ? '' : indikator.satuan}`;
    document.getElementById('download-chart-btn').style.display = 'inline-block';

    // Proses Data untuk Chart
    const chartData = indikator.capaian.map(c => {
        // Hitung nilai capaian berdasarkan data capaian spesifik (c)
        const value = calculateCapaianValue({ ...indikator, capaian: [c] }).value; 
        return {
            label: `${NAMA_BULAN[parseInt(c.bulan) - 1]} ${c.tahun}`,
            value: value,
            rawCapaian: c // Simpan data capaian mentah
        };
    }).sort((a, b) => {
        // Urutkan berdasarkan waktu
        const dateA = new Date(`${a.label.split(' ')[1]}-${parseInt(a.rawCapaian.bulan)}-01`);
        const dateB = new Date(`${b.label.split(' ')[1]}-${parseInt(b.rawCapaian.bulan)}-01`);
        return dateA - dateB;
    });

    const labels = chartData.map(d => d.label);
    let values = chartData.map(d => d.value);

    // Filter atau konversi nilai jika tampilan adalah persen (untuk indikator non-persen)
    if (CURRENT_UNIT_TYPE === 'persen') {
        values = chartData.map(d => {
            if (indikator.satuan === '%') return d.value;
            // Jika satuan bukan persen, tampilkan status sebagai representasi visual
            const status = getStatus(d.value, indikator.target, indikator.direction).status;
            if (status === 'Excellent') return 100;
            if (status === 'Good') return 90; // Representasi visual 'Good'
            if (status === 'Poor') return 50; // Representasi visual 'Poor'
            return 0; // Data kosong/belum diisi
        });
    }

    const ctx = document.getElementById('detailChart').getContext('2d');
    
    let datasets = [];

    // Dataset Capaian
    datasets.push({
        label: 'Capaian',
        data: values,
        borderColor: values.map(v => {
            // Berikan warna berdasarkan status
            const {color} = getStatus(v, indikator.target, indikator.direction);
            if (color === 'status-excellent') return '#2ECC71';
            if (color === 'status-good') return '#F39C12';
            if (color === 'status-poor') return '#E74C3C';
            return '#7F8C8D';
        }),
        backgroundColor: values.map(v => {
            const {color} = getStatus(v, indikator.target, indikator.direction);
            if (color === 'status-excellent') return 'rgba(46, 204, 113, 0.5)';
            if (color === 'status-good') return 'rgba(243, 156, 18, 0.5)';
            if (color === 'status-poor') return 'rgba(231, 76, 60, 0.5)';
            return 'rgba(127, 140, 141, 0.5)';
        }),
        fill: true,
        type: 'line',
        tension: 0.3
    });

    // Dataset Target (Garis Horizontal)
    let targetValue = indikator.target;
    if (CURRENT_UNIT_TYPE === 'persen' && indikator.satuan !== '%') {
        targetValue = 100; // Jika mode persen, target visual 100% (Excellent)
    }

    datasets.push({
        label: 'Target',
        data: labels.map(() => targetValue),
        borderColor: '#2C3E50',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        pointRadius: 0,
        type: 'line'
    });

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: CURRENT_UNIT_TYPE === 'persen' ? 'Tingkat Kepatuhan (%)' : `Nilai Capaian (${indikator.satuan})`
                }
            }
        },
        plugins: {
            legend: {
                display: true
            },
            tooltip: {
                 callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            if (context.dataset.label === 'Target') {
                                return label + indikator.target + (indikator.satuan === 'raw' ? '' : indikator.satuan);
                            }
                            // Tampilkan status dan nilai mentah jika mode tampilan persen
                            if (CURRENT_UNIT_TYPE === 'persen' && indikator.satuan !== '%') {
                                return label + `${getStatus(chartData[context.dataIndex].value, indikator.target, indikator.direction).status} (${formatValue(chartData[context.dataIndex].value, indikator.satuan)})`;
                            }
                            return label + formatValue(context.parsed.y, indikator.satuan);
                        }
                        return label;
                    }
                }
            }
        }
    };
    
    detailChartInstance = new Chart(ctx, {
        type: 'bar', // Gunakan bar chart dengan line chart overlay
        data: {
            labels: labels,
            datasets: datasets
        },
        options: chartOptions
    });
    
    // Simpan ID indikator aktif di elemen tabel
    document.getElementById('data-table').dataset.activeId = indikatorId;
}

/**
 * Mengubah tampilan chart menjadi nilai mentah atau persen.
 */
function changeUnitDisplay() {
    CURRENT_UNIT_TYPE = document.getElementById('select-unit').value;
    const activeId = document.getElementById('data-table').dataset.activeId;
    if (activeId) {
        updateChartDisplay(activeId);
    }
}


// ====================================================================
// --- 7. MODALS DAN KONTROL PERIODE ---
// ====================================================================

function initPeriodControls() {
    const selectTahun = document.getElementById('select-tahun');
    const selectBulan = document.getElementById('select-bulan');
    const currentYearInt = new Date().getFullYear();
    
    // Inisialisasi Tahun
    for (let y = currentYearInt + 2; y >= currentYearInt - 5; y--) {
        const option = document.createElement('option');
        option.value = y.toString();
        option.textContent = y.toString();
        selectTahun.appendChild(option);
    }
    selectTahun.value = currentYear;
    
    // Inisialisasi Bulan
    NAMA_BULAN.forEach((nama, index) => {
        const bulanValue = (index + 1).toString().padStart(2, '0');
        const option = document.createElement('option');
        option.value = bulanValue;
        option.textContent = nama;
        selectBulan.appendChild(option);
    });
    selectBulan.value = currentMonth;
}

function changePeriod() {
    currentYear = document.getElementById('select-tahun').value;
    currentMonth = document.getElementById('select-bulan').value;
    
    document.getElementById('input-period-display').textContent = `Periode: ${NAMA_BULAN[parseInt(currentMonth) - 1]} ${currentYear}`;
    
    // Jika data sudah dimuat (user sudah login), render ulang
    if (CURRENT_USER_UID) {
        renderKlasterSummary();
        renderDetailTable();
        populateCapaianSelect();
        
        const activeId = document.getElementById('data-table').dataset.activeId;
        if (activeId) {
            updateChartDisplay(activeId);
        }
    }
}

function populateCapaianSelect() {
    const select = document.getElementById('select-indikator-capaian');
    select.innerHTML = '<option value="">Pilih Indikator</option>';
    
    INDIKATOR_DATA.forEach(indikator => {
        const option = document.createElement('option');
        option.value = indikator.id;
        option.textContent = `[${NAMA_KLASTER[indikator.klasterId]}] ${indikator.nama}`;
        select.appendChild(option);
    });
    
    // Event listener untuk memuat nilai capaian saat indikator berubah
    select.onchange = function() {
        const selectedId = this.value;
        const numInput = document.getElementById('input-capaian-num');
        const denInput = document.getElementById('input-capaian-den');
        
        if (selectedId) {
            const indikator = INDIKATOR_DATA.find(i => i.id === selectedId);
            const dataPeriod = indikator.capaian.find(c => c.tahun === currentYear && c.bulan === currentMonth);
            
            numInput.value = dataPeriod && dataPeriod.num !== null ? dataPeriod.num : '';
            denInput.value = dataPeriod && dataPeriod.den !== null ? dataPeriod.den : '';
        } else {
            numInput.value = '';
            denInput.value = '';
        }
    };
}


// Modals Logic
let activeModalId = null;

function showModal(id) {
    const modal = document.getElementById(id);
    modal.style.display = 'block';
    activeModalId = id;
}

function closeModal(id) {
    const modal = document.getElementById(id);
    modal.style.display = 'none';
    activeModalId = null;
}

document.querySelectorAll('.close-btn').forEach(btn => {
    btn.onclick = (e) => closeModal(e.target.closest('.modal').id);
});

window.onclick = function(event) {
    if (activeModalId && event.target === document.getElementById(activeModalId)) {
        closeModal(activeModalId);
    }
};

let currentIndicatorIdForModal = null;

function showTrendModal(indikatorId) {
    currentIndicatorIdForModal = indikatorId;
    const indikator = INDIKATOR_DATA.find(i => i.id === indikatorId);
    if (!indikator) return;
    
    const trendBody = document.getElementById('trend-table').querySelector('tbody');
    trendBody.innerHTML = '';

    // Urutkan riwayat capaian dari yang terbaru
    const sortedCapaian = [...indikator.capaian].sort((a, b) => {
        const dateA = new Date(`${a.tahun}-${a.bulan}-01`);
        const dateB = new Date(`${b.tahun}-${b.bulan}-01`);
        return dateB - dateA; // Terbaru di atas
    });

    sortedCapaian.forEach(c => {
        const numText = c.num === null ? '-' : c.num.toLocaleString('id-ID');
        const denText = c.den === null ? '-' : c.den.toLocaleString('id-ID');
        
        trendBody.innerHTML += `
            <tr>
                <td>${c.tahun}</td>
                <td>${NAMA_BULAN[parseInt(c.bulan) - 1]}</td>
                <td>${numText}</td>
                <td>${denText}</td>
                <td><button class="btn-delete" style="padding: 5px 10px;" onclick="event.stopPropagation(); deleteTrendEntry('${indikatorId}', '${c.tahun}', '${c.bulan}')"><i class="fas fa-times"></i> Hapus</button></td>
            </tr>
        `;
    });
    
    showModal('modal-trend');
}

async function deleteTrendEntry(indikatorId, tahun, bulan) {
    const confirmDelete = confirm(`Hapus capaian bulan ${NAMA_BULAN[parseInt(bulan) - 1]} ${tahun}?`);
    if (!confirmDelete) return;

    // Gunakan fungsi async yang sudah dibuat
    await deleteCapaianEntry(indikatorId, tahun, bulan);

    // Muat ulang modal setelah penghapusan
    showTrendModal(indikatorId); 
    alert(`Capaian berhasil dihapus.`);
}

function showMoveModal(indikatorId) {
    currentIndicatorIdForModal = indikatorId;
    const indikator = INDIKATOR_DATA.find(i => i.id === indikatorId);
    if (!indikator) return;
    
    document.getElementById('move-indicator-name').textContent = indikator.nama;
    document.getElementById('move-klaster-select').value = indikator.klasterId;
    showModal('modal-move');
}

async function confirmMove() {
    const newKlasterId = document.getElementById('move-klaster-select').value;
    if (!currentIndicatorIdForModal || !newKlasterId) return;

    await moveIndikatorToKlaster(currentIndicatorIdForModal, newKlasterId);
    closeModal('modal-move');
    currentIndicatorIdForModal = null;
}

// Download Chart Function
document.getElementById('download-chart-btn').addEventListener('click', () => {
    const canvas = document.getElementById('detailChart');
    const indikatorName = document.getElementById('detail-indicator-name').textContent.replace(' Pilih Indikator di Tabel Bawah', '').trim();
    const link = document.createElement('a');
    // Tambahkan background putih sebelum download karena canvas defaultnya transparan
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);

    link.href = tempCanvas.toDataURL('image/png');
    link.download = `${indikatorName}_Trend_Kinerja.png`;
    link.click();
});


// ====================================================================
// --- 8. EVENT LISTENERS FORM ---
// ====================================================================

document.getElementById('add-indicator-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const nama = document.getElementById('add-nama').value;
    const klasterId = document.getElementById('add-klaster').value;
    const target = document.getElementById('add-target').value;
    const satuan = document.getElementById('add-satuan').value;
    const direction = document.getElementById('add-direction').value;
    
    addIndikator(nama, klasterId, target, satuan, direction);
    
    // Clear form
    this.reset();
    alert(`Indikator "${nama}" berhasil ditambahkan!`);
});

document.getElementById('capaian-form').addEventListener('submit', async function(e) {
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

    await updateCapaian(indikatorId, numerator, denominator);
    
    document.getElementById('input-capaian-num').value = '';
    document.getElementById('input-capaian-den').value = '';
    
    // Update input capaian select setelah simpan
    const select = document.getElementById('select-indikator-capaian');
    if (select.value === indikatorId) {
        // Panggil onchange listener secara manual untuk refresh nilai yang ditampilkan
        select.dispatchEvent(new Event('change'));
    }

    alert(`Capaian untuk bulan ${NAMA_BULAN[parseInt(currentMonth) - 1]} ${currentYear} berhasil diperbarui.`);
});


// ====================================================================
// --- 9. INISIASI SAAT HALAMAN DIMUAT (FINAL) ---
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    initPeriodControls();
    changePeriod(); // Set periode awal dan display
    
    // 1. Inisialisasi Auth Forms
    setupAuthForms();
    
    // 2. Dengarkan Status Auth dan Muat Data dari Firestore
    handleAuthStateChange(); 
});