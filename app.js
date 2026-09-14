/**
 * 服務業預約排程登記系統
 * - 支援身分切換：
 *   1. 客戶模式（預設）：預約時段反灰鎖定，不顯示姓名，僅公開電話末三碼。
 *   2. 管理員模式：登入後可完整查看客戶姓名、完整電話號碼、時段分配與預約管理。
 * - 請務必上線前修改預設密碼（建議以環境變數或後端驗證取代硬編碼）
 */

const CONFIG = {
  START_HOUR: 9,      // 09:00
  END_HOUR: 24,       // 24:00 (晚上 12:00 / 午夜 00:00)
  INTERVAL_MINS: 30,  // 每單元 30 分鐘
  STORAGE_KEY: 'service_schedule_reservations_v3',
  ADMIN_AUTH_KEY: 'service_schedule_admin_auth',
  DEFAULT_ADMIN_USER: 'admin',
  DEFAULT_ADMIN_PASS: 'admin888'  // 上線前務必更改
};

// 系統狀態
let currentDate = getTodayDateString();
let selectedDurationMins = 60; // 60, 90, 120
let selectedStartIndex = null;
let reservations = loadReservations();
let isAdminLoggedIn = checkAdminAuth(); // 管理員登入狀態

// DOM 元素
const bookingDateInput = document.getElementById('bookingDate');
const todayBtn = document.getElementById('todayBtn');
const displayDateLabel = document.getElementById('displayDateLabel');
const currentDurationBadge = document.getElementById('currentDurationBadge');
const bookedSlotsBadge = document.getElementById('bookedSlotsBadge');
const occupancyProgressBar = document.getElementById('occupancyProgressBar');
const timeSlotsGrid = document.getElementById('timeSlotsGrid');
const roleIndicatorBadge = document.getElementById('roleIndicatorBadge');
const dbStatusBadge = document.getElementById('dbStatusBadge');
const viewModeHintText = document.getElementById('viewModeHintText');

// 管理員控制元素
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const adminModal = document.getElementById('adminModal');
const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
const cancelAdminModalBtn = document.getElementById('cancelAdminModalBtn');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminUsernameInput = document.getElementById('adminUsername');
const adminPasswordInput = document.getElementById('adminPassword');

// 表單相關
const durationButtons = document.querySelectorAll('.duration-btn');
const bookingForm = document.getElementById('bookingForm');
const slotPreviewBox = document.getElementById('slotPreviewBox');
const previewTimeText = document.getElementById('previewTimeText');
const previewDurationText = document.getElementById('previewDurationText');
const currentStepTag = document.getElementById('currentStepTag');
const clientNameInput = document.getElementById('clientName');
const clientPhoneInput = document.getElementById('clientPhone');
const clientNoteInput = document.getElementById('clientNote');
const submitBookingBtn = document.getElementById('submitBookingBtn');
const bookedListContainer = document.getElementById('bookedListContainer');
const sidebarBookedBadge = document.getElementById('sidebarBookedBadge');
const toastNotification = document.getElementById('toastNotification');
function init() {
  bookingDateInput.value = currentDate;
  bookingDateInput.min = currentDate;

  // 日期事件
  bookingDateInput.addEventListener('change', handleDateChange);
  todayBtn.addEventListener('click', () => {
    bookingDateInput.value = getTodayDateString();
    handleDateChange();
  });

  // 時長切換
  durationButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      durationButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDurationMins = parseInt(btn.dataset.duration, 10);
      handleDurationChange();
    });
  });

  // 表單輸入
  bookingForm.addEventListener('submit', handleFormSubmit);
  clientNameInput.addEventListener('input', validateFormState);
  clientPhoneInput.addEventListener('input', validateFormState);

  // 管理員登入 Modal 控制
  adminLoginBtn.addEventListener('click', openAdminModal);
  closeAdminModalBtn.addEventListener('click', closeAdminModal);
  cancelAdminModalBtn.addEventListener('click', closeAdminModal);
  adminModal.addEventListener('click', (e) => {
    if (e.target === adminModal) closeAdminModal();
  });
  adminLoginForm.addEventListener('submit', handleAdminLogin);
  adminLogoutBtn.addEventListener('click', handleAdminLogout);

  updateRoleUI();
  updateDbBadge(typeof isFirebaseConnected !== 'undefined' && isFirebaseConnected);
  subscribeToDate(currentDate);
  renderAll();
}

// ======================= 管理員身分認證 =======================
function checkAdminAuth() {
  return sessionStorage.getItem(CONFIG.ADMIN_AUTH_KEY) === 'true';
}

function openAdminModal() {
  adminUsernameInput.value = 'admin';
  adminPasswordInput.value = '';
  adminModal.classList.remove('hidden');
  adminPasswordInput.focus();
}

function closeAdminModal() {
  adminModal.classList.add('hidden');
}

function handleAdminLogin(e) {
  e.preventDefault();
  const user = adminUsernameInput.value.trim();
  const pass = adminPasswordInput.value.trim();

  if (user === CONFIG.DEFAULT_ADMIN_USER && pass === CONFIG.DEFAULT_ADMIN_PASS) {
    isAdminLoggedIn = true;
    sessionStorage.setItem(CONFIG.ADMIN_AUTH_KEY, 'true');
    closeAdminModal();
    updateRoleUI();
    renderAll();
    showToast('🎉 管理員登入成功！已解除隱私保護，現可查看全名與完整電話。', 'success');
  } else {
    showToast('帳號或密碼錯誤！', 'error');
  }
}

function handleAdminLogout() {
  if (confirm('確定要退出管理員模式，回到客戶公開視圖嗎？')) {
    isAdminLoggedIn = false;
    sessionStorage.removeItem(CONFIG.ADMIN_AUTH_KEY);
    updateRoleUI();
    renderAll();
    showToast('已安全登出管理員，恢復客戶隱私防護模式。', 'info');
  }
}

function updateRoleUI() {
  if (isAdminLoggedIn) {
    roleIndicatorBadge.className = 'role-badge admin-role';
    roleIndicatorBadge.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
      管理員專用模式（檢視全名電話）
    `;
    adminLoginBtn.classList.add('hidden');
    adminLogoutBtn.classList.remove('hidden');
    viewModeHintText.textContent = '★ 管理員模式已啟用：時段卡片完整顯示客戶全名及完整電話號碼';
  } else {
    roleIndicatorBadge.className = 'role-badge client-role';
    roleIndicatorBadge.textContent = '客戶公開模式';
    adminLoginBtn.classList.remove('hidden');
    adminLogoutBtn.classList.add('hidden');
    viewModeHintText.textContent = '* 客戶公開模式：預約時段反灰鎖定，不揭露姓名，僅顯示電話後三碼';
  }
}

// ======================= 時段計算 =======================
function generateTimeSlots() {
  const slots = [];
  let currentMinutes = CONFIG.START_HOUR * 60;
  const endMinutes = CONFIG.END_HOUR * 60;
  let index = 0;

  while (currentMinutes < endMinutes) {
    const startStr = minutesToTimeString(currentMinutes);
    const endSlotMinutes = currentMinutes + CONFIG.INTERVAL_MINS;
    const endStr = minutesToTimeString(endSlotMinutes);
    slots.push({
      index: index,
      startStr: startStr,
      endStr: endStr,
      label: `${startStr} - ${endStr}`,
      startMin: currentMinutes,
      endMin: endSlotMinutes
    });
    currentMinutes = endSlotMinutes;
    index++;
  }
  return slots;
}

function minutesToTimeString(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getRequiredSlotCount() {
  return selectedDurationMins / CONFIG.INTERVAL_MINS;
}

// ======================= 衝突檢核 =======================
function checkSlotAvailability(startIndex, allSlots, dayOccupiedMap) {
  const needed = getRequiredSlotCount();
  
  if (startIndex + needed > allSlots.length) {
    return {
      canBook: false,
      reason: `此時段加上 ${selectedDurationMins / 60} 小時會超過 24:00 打烊時間`
    };
  }

  for (let i = 0; i < needed; i++) {
    const slotIdx = startIndex + i;
    if (dayOccupiedMap[slotIdx]) {
      const bookedRecord = dayOccupiedMap[slotIdx];
      const identifier = isAdminLoggedIn 
        ? `${bookedRecord.name} / ${bookedRecord.phone}`
        : `尾號：${extractLastThreeDigits(bookedRecord.phone)}`;
      return {
        canBook: false,
        reason: `延伸範圍內之 ${allSlots[slotIdx].label} 已預約（${identifier}），時段衝突！`
      };
    }
  }

  return { canBook: true };
}

// ======================= 時區設定 =======================
const TIMEZONE = 'Asia/Taipei'; // UTC+8

function getLocalDateString() {
  const now = new Date();
  // 轉換為台北時間：UTC時間 + 8小時
  const taipeiTime = new Date(now.getTime() + 8 * 3600000);
  const year = taipeiTime.getUTCFullYear();
  const month = String(taipeiTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(taipeiTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalNow() {
  const now = new Date();
  // 轉換為台北時間：UTC時間 + 8小時
  return new Date(now.getTime() + 8 * 3600000);
}

// ======================= 判斷過去時間 =======================
function isPastSlot(slotIndex) {
  // 只有「今天」的時段才需要比對現在時間
  const today = getLocalDateString();
  if (currentDate !== today) return false;

  const now = getLocalNow();
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  // 從 09:00 開始計算每格的絕對時間（分鐘）
  const slotStartMin = CONFIG.START_HOUR * 60 + slotIndex * CONFIG.INTERVAL_MINS;
  return slotStartMin <= currentMin;
}

// ======================= 渲染畫面 =======================
function renderAll() {
  updateDateBanner();
  renderTimeSlots();
  renderBookedSidebarList();
  validateFormState();
}

function updateDateBanner() {
  const dateObj = new Date(currentDate + 'T00:00:00');
  const daysOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const formatted = `${dateObj.getFullYear()}年${String(dateObj.getMonth() + 1).padStart(2, '0')}月${String(dateObj.getDate()).padStart(2, '0')}日 ${daysOfWeek[dateObj.getDay()]}`;
  displayDateLabel.textContent = formatted;

  const durationHours = selectedDurationMins / 60;
  const slotCount = getRequiredSlotCount();
  currentDurationBadge.textContent = `服務時長：${durationHours} 小時（連續佔 ${slotCount} 個半小時）`;
}

function renderTimeSlots() {
  const allSlots = generateTimeSlots();
  const dayOccupiedMap = getDayOccupiedMap();
  const neededCount = getRequiredSlotCount();

  timeSlotsGrid.innerHTML = '';
  let occupiedCount = Object.keys(dayOccupiedMap).length;

  const selectedIndices = new Set();
  if (selectedStartIndex !== null) {
    for (let i = 0; i < neededCount; i++) {
      selectedIndices.add(selectedStartIndex + i);
    }
  }

  allSlots.forEach(slot => {
    const isBooked = !!dayOccupiedMap[slot.index];
    const isSelected = selectedIndices.has(slot.index);
    const isStart = selectedStartIndex === slot.index;
    const isPast = isPastSlot(slot.index);

    const availCheck = !isBooked ? checkSlotAvailability(slot.index, allSlots, dayOccupiedMap) : null;
    const isConflictStart = !isBooked && !availCheck.canBook;

    const card = document.createElement('div');
    card.dataset.index = slot.index;

    if (isPast && !isBooked && !isSelected) {
      // 狀態0：已過去的時段（灰色不可點選）
      card.className = 'slot-card is-past';
      card.innerHTML = `
        <div class="slot-time">${slot.label}</div>
        <div class="slot-status-pill">
          <span>已過去</span>
        </div>
        <div class="slot-booked-info" style="border:none; color: #94a3b8;">
          <span>不可選取</span>
        </div>
      `;
    } else if (isBooked) {
      // 狀態1：已預約
      const record = dayOccupiedMap[slot.index];
      const lastThreeDigits = extractLastThreeDigits(record.phone);

      card.className = 'slot-card is-booked';

      // 判斷是否管理員展示姓名與電話
      if (isAdminLoggedIn) {
        const noteDisplay = record.note
          ? `<div class="admin-client-note"><span>📝 備註：</span>${record.note}</div>`
          : '';
        card.innerHTML = `
          <div class="slot-time">${slot.label}</div>
          <div class="slot-status-pill">
            <span>已預約</span>
          </div>
          <div class="slot-booked-info">
            <div class="admin-card-details">
              <span class="admin-client-name">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                ${record.name}
              </span>
              <span class="admin-client-phone">${record.phone}</span>
              ${noteDisplay}
            </div>
          </div>
        `;
        card.addEventListener('click', () => {
          let msg = `【管理員查閱】客戶：${record.name}｜電話：${record.phone}｜時段：${record.timeRange}`;
          if (record.note) msg += `｜備註：${record.note}`;
          showToast(msg, 'info');
        });
      } else {
        // 客戶模式：不顯示姓名，僅顯示電話末三碼
        card.innerHTML = `
          <div class="slot-time">${slot.label}</div>
          <div class="slot-status-pill">
            <span>已預約</span>
          </div>
          <div class="slot-booked-info" title="已預約時段不可選取">
            <span>預約尾號：</span>
            <span class="phone-digits">${lastThreeDigits}</span>
          </div>
        `;
        card.addEventListener('click', () => {
          showToast(`時段 ${slot.label} 已被預約（客戶尾號：${lastThreeDigits}），不可選取！`, 'error');
        });
      }

    } else if (isSelected) {
      // 狀態2：目前選取中
      card.className = `slot-card is-selected ${isStart ? 'is-selected-start' : ''}`;
      card.innerHTML = `
        <div class="slot-time">${slot.label}</div>
        <div class="slot-status-pill">
          <span>${isStart ? '起始點' : '包含時段'}</span>
        </div>
        <div class="slot-booked-info" style="border:none; color: #1e40af;">
          <span>時長涵蓋中</span>
        </div>
      `;
      card.addEventListener('click', () => selectStartIndex(slot.index));

    } else if (isConflictStart) {
      // 狀態3：時長衝突不可選
      card.className = 'slot-card is-conflict';
      card.innerHTML = `
        <div class="slot-time">${slot.label}</div>
        <div class="slot-status-pill">
          <span>時長衝突</span>
        </div>
        <div class="slot-booked-info" style="border:none; color: #be123c;">
          <span>無法排入 ${selectedDurationMins / 60}h</span>
        </div>
      `;
      card.addEventListener('click', () => {
        showToast(availCheck.reason, 'error');
      });

    } else {
      // 狀態4：完全可用起始點
      card.className = 'slot-card is-available';
      card.innerHTML = `
        <div class="slot-time">${slot.label}</div>
        <div class="slot-status-pill">
          <span class="slot-dot"></span>
          <span>可選起始</span>
        </div>
        <div class="slot-booked-info" style="border:none; color: #166534;">
          <span>可排入 ${selectedDurationMins / 60}h</span>
        </div>
      `;
      card.addEventListener('click', () => selectStartIndex(slot.index));
    }

    timeSlotsGrid.appendChild(card);
  });

  const total = allSlots.length;
  bookedSlotsBadge.textContent = `已佔用：${occupiedCount} / ${total} 單元`;
  const percentage = Math.round((occupiedCount / total) * 100);
  occupancyProgressBar.style.width = `${percentage}%`;
}

function renderBookedSidebarList() {
  const dayRecords = reservations[currentDate] || [];
  sidebarBookedBadge.textContent = `${dayRecords.length} 筆`;

  if (dayRecords.length === 0) {
    bookedListContainer.innerHTML = '<div class="empty-placeholder">本日尚無預約記錄</div>';
    return;
  }

  const sorted = [...dayRecords].sort((a, b) => a.startIndex - b.startIndex);

  bookedListContainer.innerHTML = '';
  sorted.forEach(record => {
    const lastThree = extractLastThreeDigits(record.phone);
    const row = document.createElement('div');
    row.className = 'booked-item-row';

    // 根據管理員登入切換顯示內容與取消按鈕
    const phoneDisplay = isAdminLoggedIn
      ? `<span class="admin-tag">全名電話</span><strong>${record.name}</strong> (${record.phone})`
      : `客戶電話後三碼：***-***-${lastThree}`;

    // 取消按鈕僅管理員可見
    const cancelBtn = isAdminLoggedIn
      ? `<button class="btn-cancel-slot" title="取消此筆預約" data-id="${record.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>`
      : '';

    row.innerHTML = `
      <div class="booked-row-left">
        <span class="booked-item-time">${record.timeRange} (${record.durationHours}小時)</span>
        <span class="booked-item-phone">${phoneDisplay}</span>
      </div>
      ${cancelBtn}
    `;

    if (isAdminLoggedIn) {
      row.querySelector('.btn-cancel-slot').addEventListener('click', (e) => {
        e.stopPropagation();
        cancelReservation(record.id);
      });
    }

    bookedListContainer.appendChild(row);
  });
}

// ======================= 互動操作 =======================
function handleDurationChange() {
  updateDateBanner();
  if (selectedStartIndex !== null) {
    const allSlots = generateTimeSlots();
    const dayOccupiedMap = getDayOccupiedMap();
    const check = checkSlotAvailability(selectedStartIndex, allSlots, dayOccupiedMap);
    if (!check.canBook) {
      showToast(`切換至 ${selectedDurationMins / 60} 小時後原選取時段發生衝突，已自動重設！`, 'info');
      resetSlotPreview();
    } else {
      updateSlotPreview();
    }
  }
  renderTimeSlots();
  validateFormState();
}

function selectStartIndex(index) {
  const allSlots = generateTimeSlots();
  const dayOccupiedMap = getDayOccupiedMap();
  const check = checkSlotAvailability(index, allSlots, dayOccupiedMap);

  if (!check.canBook) {
    showToast(check.reason, 'error');
    return;
  }

  selectedStartIndex = index;
  updateSlotPreview();
  renderTimeSlots();
  validateFormState();
}

function updateSlotPreview() {
  if (selectedStartIndex === null) return;
  const allSlots = generateTimeSlots();
  const needed = getRequiredSlotCount();
  const startSlot = allSlots[selectedStartIndex];
  const endSlot = allSlots[selectedStartIndex + needed - 1];

  slotPreviewBox.classList.add('active');
  previewTimeText.textContent = `${startSlot.startStr} - ${endSlot.endStr}`;
  previewDurationText.textContent = `服務時長：${selectedDurationMins / 60} 小時（日期：${currentDate}）`;
  currentStepTag.textContent = '步驟 4: 填寫資料';
}

function resetSlotPreview() {
  selectedStartIndex = null;
  slotPreviewBox.classList.remove('active');
  previewTimeText.textContent = '尚未選取起始時間（請點選左側看板）';
  previewDurationText.textContent = `時長：${selectedDurationMins / 60} 小時`;
  validateFormState();
}

function handleDateChange() {
  const newDate = bookingDateInput.value;
  if (!newDate) return;
  currentDate = newDate;
  resetSlotPreview();
  subscribeToDate(currentDate);
  renderAll();
  showToast(`已切換預約日期至：${currentDate}`, 'info');
}

function validateFormState() {
  const name = clientNameInput.value.trim();
  const phone = clientPhoneInput.value.trim();
  const isValidPhone = validatePhoneNumber(phone);

  const canSubmit = selectedStartIndex !== null && name.length >= 1 && isValidPhone;
  submitBookingBtn.disabled = !canSubmit;

  if (selectedStartIndex === null) {
    currentStepTag.textContent = '步驟 1~3: 選擇時段';
    currentStepTag.className = 'step-tag';
  } else if (!name || !isValidPhone) {
    currentStepTag.textContent = '步驟 4: 填寫資料';
    currentStepTag.className = 'step-tag active';
  } else {
    currentStepTag.textContent = '步驟 5: 可確認登記';
    currentStepTag.className = 'step-tag complete';
  }
}

function validatePhoneNumber(phone) {
  const cleanNumber = phone.replace(/\D/g, '');
  return cleanNumber.length >= 7 && cleanNumber.length <= 12;
}

function extractLastThreeDigits(phone) {
  const cleanNumber = (phone || '').replace(/\D/g, '');
  if (cleanNumber.length < 3) {
    return cleanNumber.padStart(3, '*');
  }
  return cleanNumber.slice(-3);
}

function getDayOccupiedMap() {
  const map = {};
  const dayRecords = reservations[currentDate] || [];
  dayRecords.forEach(record => {
    record.slotIndices.forEach(idx => {
      map[idx] = record;
    });
  });
  return map;
}

function handleFormSubmit(e) {
  e.preventDefault();

  if (selectedStartIndex === null) {
    showToast('請先選取起始時段！', 'error');
    return;
  }

  const allSlots = generateTimeSlots();
  const dayOccupiedMap = getDayOccupiedMap();
  const check = checkSlotAvailability(selectedStartIndex, allSlots, dayOccupiedMap);

  if (!check.canBook) {
    showToast(`衝突錯誤：${check.reason}`, 'error');
    resetSlotPreview();
    renderAll();
    return;
  }

  const name = clientNameInput.value.trim();
  const phone = clientPhoneInput.value.trim();
  const lastThreeDigits = extractLastThreeDigits(phone);
  const needed = getRequiredSlotCount();

  const slotIndices = [];
  for (let i = 0; i < needed; i++) {
    slotIndices.push(selectedStartIndex + i);
  }

  const startSlot = allSlots[selectedStartIndex];
  const endSlot = allSlots[selectedStartIndex + needed - 1];
  const timeRange = `${startSlot.startStr} - ${endSlot.endStr}`;

  const newRecord = {
    id: 'res_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    phone: phone,
    durationMins: selectedDurationMins,
    durationHours: selectedDurationMins / 60,
    startIndex: selectedStartIndex,
    slotIndices: slotIndices,
    timeRange: timeRange,
    createdAt: new Date().toISOString()
  };

  if (!reservations[currentDate]) {
    reservations[currentDate] = [];
  }
  reservations[currentDate].push(newRecord);
  saveReservations();

  clientNameInput.value = '';
  clientPhoneInput.value = '';
  clientNoteInput.value = '';
  resetSlotPreview();
  renderAll();

  showToast(`預約登記成功！時段：${timeRange}（服務時間：${newRecord.durationHours}h，尾號：${lastThreeDigits}）`, 'success');
}

function cancelReservation(recordId) {
  // 只有管理員可以取消預約
  if (!isAdminLoggedIn) {
    showToast('僅管理員可取消預約，請先登入管理員帳號', 'error');
    return;
  }

  const dayRecords = reservations[currentDate] || [];
  const target = dayRecords.find(r => r.id === recordId);
  if (!target) return;

  const displayName = `${target.name} (${target.phone})`;
  if (confirm(`確定要取消 ${currentDate} 時段 ${target.timeRange}（${displayName}）的預約登記嗎？`)) {
    reservations[currentDate] = dayRecords.filter(r => r.id !== recordId);
    if (reservations[currentDate].length === 0) {
      delete reservations[currentDate];
    }
    saveReservations();
    renderAll();
    showToast(`已成功取消 ${target.timeRange} 之預約，時段已釋出！`, 'info');
  }
}

function handleClearAll() {
  if (confirm('警告：確定要清空本日所有預約登記嗎？此動作無法復原。')) {
    reservations[currentDate] = [];
    saveReservations();
    if (typeof isFirebaseConnected !== 'undefined' && isFirebaseConnected && db) {
      db.collection('reservations').doc(currentDate).delete().catch(e => console.error(e));
    }
    resetSlotPreview();
    renderAll();
    showToast(`已清空 ${currentDate} 的所有預約記錄！`, 'info');
  }
}

function loadSampleData() {
  if (!reservations[currentDate]) {
    reservations[currentDate] = [];
  }

  const allSlots = generateTimeSlots();

  const samples = [
    { startIdx: 1, duration: 60, name: '張曉芬', phone: '0912-345-678' },
    { startIdx: 8, duration: 90, name: '李國強', phone: '0988-123-556' },
    { startIdx: 18, duration: 120, name: '王淑惠', phone: '0933-776-889' }
  ];

  samples.forEach(s => {
    const needed = s.duration / CONFIG.INTERVAL_MINS;
    const slotIndices = [];
    for (let i = 0; i < needed; i++) {
      slotIndices.push(s.startIdx + i);
    }
    const startSlot = allSlots[s.startIdx];
    const endSlot = allSlots[s.startIdx + needed - 1];

    reservations[currentDate].push({
      id: 'sample_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: s.name,
      phone: s.phone,
      durationMins: s.duration,
      durationHours: s.duration / 60,
      startIndex: s.startIdx,
      slotIndices: slotIndices,
      timeRange: `${startSlot.startStr} - ${endSlot.endStr}`,
      createdAt: new Date().toISOString()
    });
  });

  saveReservations();
  renderAll();
  showToast('已載入示範預約！點擊右上角「管理員登入」即可切換查閱人名與電話。', 'success');
}

// ======================= Firebase 與 LocalStorage 同步 =======================
let unsubscribeDateListener = null;

function updateDbBadge(connected) {
  if (!dbStatusBadge) return;
  if (connected) {
    dbStatusBadge.className = 'db-badge cloud';
    dbStatusBadge.textContent = '☁️ Firebase 已連線';
    dbStatusBadge.title = '即時雲端同步中';
  } else {
    dbStatusBadge.className = 'db-badge local';
    dbStatusBadge.textContent = '💾 本地模式';
    dbStatusBadge.title = '離線或尚未填入 Firebase API Key';
  }
}

function subscribeToDate(dateStr) {
  if (unsubscribeDateListener) {
    unsubscribeDateListener();
    unsubscribeDateListener = null;
  }

  if (typeof isFirebaseConnected !== 'undefined' && isFirebaseConnected && db) {
    updateDbBadge(true);
    try {
      unsubscribeDateListener = db.collection('reservations').doc(dateStr).onSnapshot((docSnapshot) => {
        if (docSnapshot.exists) {
          const data = docSnapshot.data();
          reservations[dateStr] = Array.isArray(data.items) ? data.items : [];
        } else {
          reservations[dateStr] = [];
        }
        saveToLocalStorageOnly();
        renderAll();
      }, (err) => {
        console.error("Firestore onSnapshot 監聽錯誤:", err);
        updateDbBadge(false);
      });
    } catch (e) {
      console.error("Firestore 訂閱失敗:", e);
      updateDbBadge(false);
    }
  } else {
    updateDbBadge(false);
  }
}

function loadReservations() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to parse localStorage', e);
    return {};
  }
}

function saveToLocalStorageOnly() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(reservations));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

function saveReservations() {
  saveToLocalStorageOnly();

  // 若 Firebase 已連線，同步儲存至 Cloud Firestore
  if (typeof isFirebaseConnected !== 'undefined' && isFirebaseConnected && db) {
    const items = reservations[currentDate] || [];
    db.collection('reservations').doc(currentDate).set({
      items: items,
      updatedAt: new Date().toISOString()
    }).catch(err => {
      console.error("Firestore 寫入失敗:", err);
      showToast('雲端同步失敗，已暫存至本地', 'error');
    });
  }
}

function getTodayDateString() {
  return getLocalDateString();
}

let toastTimer = null;
function showToast(message, type = 'info') {
  clearTimeout(toastTimer);
  toastNotification.textContent = message;
  toastNotification.className = `toast ${type}`;

  toastTimer = setTimeout(() => {
    toastNotification.className = 'toast hidden';
  }, 3500);
}

document.addEventListener('DOMContentLoaded', init);
