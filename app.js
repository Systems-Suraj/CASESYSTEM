// ==========================================
// 🔥 AUTO UPDATE SYSTEM (VERSION CONTROL)
// ==========================================
const APP_VERSION = "v10";

function checkAppUpdate() {
  const storedVersion = localStorage.getItem("app_version");

  if (!storedVersion) {
    localStorage.setItem("app_version", APP_VERSION);
    return;
  }

  if (storedVersion !== APP_VERSION) {
    console.log("🔄 New version detected");

    localStorage.setItem("app_version", APP_VERSION);

    // 🔥 FORCE CLEAN RELOAD
    setTimeout(() => {
      window.location.reload(true);
    }, 500);
  }
}

// Optional: Manual force update button function for debugging
window.forceUpdate = function() {
  caches.keys().then(keys => {
    keys.forEach(k => caches.delete(k));
  }).then(() => {
    window.location.reload(true);
  });
};

// ==========================================
// 🔥 FIREBASE INIT (TOP - ONE TIME ONLY)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAxn1ouF6XKnMGnD_unb4bxULotdL3VOko",
  authDomain: "casesys-d96b1.firebaseapp.com",
  projectId: "casesys-d96b1",
  messagingSenderId: "399513476851",
  appId: "1:399513476851:web:668ec94543bbe3c1186186"
};

// Initialize Firebase only once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

let messaging = null;

if (firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported()) {
  messaging = firebase.messaging();

  messaging.onMessage((payload) => {
    try {
      console.log("🔥 Foreground message:", payload);
      const data = payload?.data || {};
      let title = data.title || "Case Update";
      let body = data.body || "";
      const caseId = data.caseId || "";

      if (!body || body.trim() === "") return;

      if (typeof addNotification === "function") {
        addNotification(data);
      }

      if (typeof showToast === "function") {
        showToast(title, body, caseId);
      } else {
        console.log("🔔 " + title + " - " + body);
      }

    } catch (err) {
      console.error("❌ Foreground notification error:", err);
    }
  });

} else {
  console.log("⚠️ Firebase messaging not supported on this device");
}

// ==========================================
// CONFIGURATION: REPLACE THIS URL!
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxXQKRXvgVI-ryItvnhOm0SzJzh03I72QlOMGCRA4GDPMV2f6t6xevUeMfGrMkz_OtS/exec"; 

// ==========================================
// OFFLINE DATABASE (IndexedDB Setup)
// ==========================================
const DB_NAME = 'CaseSysOfflineDB';
const STORE_NAME = 'offlineRequests';

function openOfflineDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveOfflineRequest(action, params) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ action, params, timestamp: new Date().getTime() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getOfflineRequests() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteOfflineRequest(id) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ==========================================
// 🔥 API COMMUNICATION (WITH RETRY + OFFLINE)
// ==========================================
async function apiCall(action, params = {}, retries = 2) {
    if (currentUser && currentUser.email) {
        params.reqUserEmail = currentUser.email; 
    }

    if (!navigator.onLine) {
        if (action === 'createCase' || action === 'addNewComment' || action === 'uploadFile') {
            await saveOfflineRequest(action, params);
            showCustomDialog("You are Offline 📡", "Your action has been saved to the offline queue. It will automatically sync when you connect to the internet.", false);
            return { success: true, offline: true };
        } else {
            throw new Error("You are offline. This action requires internet.");
        }
    }

    try {
        // 🔥 FIXED: CORS Bypass using text/plain
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' 
            },
            body: JSON.stringify({
                action: action,
                params: params
            }),
            credentials: 'omit' 
        });
        
        const text = await response.text();
        const result = JSON.parse(text);
        
        if (!result.success) throw new Error(result.error || result.message);
        return result.data !== undefined ? result.data : result;

    } catch (err) {
        if (retries > 0 && navigator.onLine) {
            console.log(`🔁 Retrying [${action}]...`, retries);
            await new Promise(r => setTimeout(r, 1000));
            return apiCall(action, params, retries - 1);
        }
        console.error(`API Error [${action}]:`, err);
        throw err;
    }
}

// ==========================================
// STATE VARIABLES & NOTIFICATIONS
// ==========================================
let currentUser = null; 
let availableLabels = [];
let selectedLabels = new Set();
let allUsersList = []; 

let mentionSearchQuery = "";
let savedRange = null;
let pendingFiles = [];
let pendingReplyFiles = []; 
let composerRecipients = [];

let currentCaseAdmins = [];
let currentCaseUsers = [];
let replyComposerState = { recipients: [], mode: 'SAME', globalType: 'Message' };
let replySavedRange = null;
let tempAdmins = [];
let tempUsers = [];

let currentTab = 'Live';
let allCasesData = [];
let activeInlineBox = null;
let inlinePendingFiles = [];
let inlineSavedRange = null;
let inlineMentionSearchQuery = "";
let currentEditLabels = new Set();
let currentEditAttachments = [];
let newEditPendingFiles = [];

let page = 0;
const limit = 5; 
let isLoading = false;
let hasMore = true;

let lastTimestamp = 0;
let seenMessages = new Set();
let realtimeInterval = null;

let notifications = [];

function addNotification(data) {
  notifications.unshift(data);
  document.getElementById("notifCount").innerText = notifications.length;
  document.getElementById("notifCount").classList.remove("hidden");
  renderNotifications();
}

function renderNotifications() {
  const panel = document.getElementById("notifPanel");
  if(panel) {
      panel.innerHTML = notifications.map(n => `
        <div class="p-3 border-b cursor-pointer hover:bg-gray-50"
             onclick="openCase('${n.caseId}')">
          <div class="font-bold">${n.title}</div>
          <div class="text-sm text-gray-500">${n.body}</div>
        </div>
      `).join("");
  }
}

function toggleNotifications() {
  const panel = document.getElementById("notifPanel");
  if(panel) panel.classList.toggle("hidden");
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ==========================================
// 🔒 STRICT MENTION RESTRICTION LOGIC
// ==========================================
function checkComposerRestrictions(editor, type = 'main') {
    if (!editor) return;
    const hasMention = !!editor.querySelector('.mention-badge');
    const container = type === 'main' ? editor.closest('.border-slate-300') : editor.closest('[data-id="inline-reply-box"]');
    
    if (!container) return;

    const attachLabel = container.querySelector('.fa-paperclip')?.parentElement || container.querySelector('label');
    const attachInput = container.querySelector('input[type="file"]');
    const submitBtn = type === 'main' ? document.getElementById('detailSubmitBtn') : container.querySelector('button[onclick*="submitInlineReply"]');
    const formatBtns = container.querySelectorAll('button[onclick*="document.execCommand"]');
    const typeSelectors = container.querySelectorAll('#global_type_selector button, .inline-type-btn');

    if (hasMention) {
        if(attachLabel) attachLabel.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        if(attachInput) attachInput.disabled = false;
        if(submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
        formatBtns.forEach(b => { b.disabled = false; b.classList.remove('opacity-50', 'cursor-not-allowed'); });
        typeSelectors.forEach(b => { b.disabled = false; b.classList.remove('opacity-50', 'cursor-not-allowed'); });
    } else {
        if(attachLabel) attachLabel.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        if(attachInput) attachInput.disabled = true;
        if(submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('opacity-50', 'cursor-not-allowed'); }
        formatBtns.forEach(b => { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });
        typeSelectors.forEach(b => { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });
    }

    if (!hasMention) {
        const textContent = editor.textContent.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
        const hasHtmlNodes = editor.children.length > 0;
        
        if ((textContent.length > 0 && !textContent.startsWith('@')) || (hasHtmlNodes && textContent === '')) {
            editor.innerHTML = ''; 
            showCustomDialog("Mention Required ⚠️", "Aap bina kisi ko @mention kiye message type, format ya attach nahi kar sakte.\n\nPlease type '@' to select a user from the list first.", false);
        }
    }
}

// ==========================================
// DOM READY AND EVENT LISTENERS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // 🔥 AUTO UPDATE TRIGGER
  checkAppUpdate();

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "ping" })
  }).catch(e => console.log("Cold start ping skipped."));

  checkAuthStatus();
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
  if(document.getElementById('snoozeDateTime')) document.getElementById('snoozeDateTime').min = localISOTime;

  function handleScroll(e) {
      if (document.getElementById("caseDetailView") && document.getElementById("caseDetailView").classList.contains('hidden')) return;
      const convEl = document.getElementById("detail-conv-id");
      if(!convEl) return;
      const caseId = convEl.value;
      if (!caseId) return;

      const el = e.target;
      if (el === document || el === window) {
          if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100) {
              loadCommentsPaginated(caseId);
         }
      } else if (el && el.classList && el.classList.contains('overflow-y-auto')) {
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
              loadCommentsPaginated(caseId);
          }
      }
  }
  
  let ticking = false;
  function optimizedScroll(e) {
    if (!ticking) {
      window.requestAnimationFrame(() => { handleScroll(e); ticking = false; });
      ticking = true;
    }
  }

  window.addEventListener('scroll', optimizedScroll, { passive: true });
  document.addEventListener('scroll', optimizedScroll, { capture: true, passive: true });
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('#labelsFilterWrapper') && !e.target.closest('#membersFilterWrapper')) {
        document.querySelectorAll('[id$="Dropdown"]').forEach(d => toggleDropdown(d.id, true));
    }
});

document.addEventListener('keydown', function(e) {
    const target = e.target;
    if (target && (target.id === 'detail-reply-input' || target.classList?.contains('inline-reply-input'))) {
        const editor = target;
        const hasInitialMention = !!editor.querySelector('.mention-badge');
        const isDifferentMode = editor.id === 'detail-reply-input' && typeof replyComposerState !== 'undefined' && replyComposerState.mode === 'DIFFERENT';
        const isFunctionalKey = e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey;

        if (!hasInitialMention) {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                showCustomDialog("Mention Required ⚠️", "Please click/select a user from the dropdown list before typing further.", false);
                return;
            }
            const textContent = editor.textContent.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
            if (textContent.length === 0 && e.key !== '@' && !isFunctionalKey) {
                e.preventDefault();
                showCustomDialog("Mention Required ⚠️", "Please start by typing '@' to mention someone.", false);
                return;
            }
        } else if (isDifferentMode) {
            if (!isFunctionalKey && e.key !== '@') {
                e.preventDefault();
                showCustomDialog("Delegation Mode", "In 'Different Action' mode, please type your message in the specific boxes below.", false);
                return;
            }
        }
    }
});

document.addEventListener('paste', function(e) {
    const target = e.target;
    if (target && (target.id === 'detail-reply-input' || target.classList?.contains('inline-reply-input'))) {
        const editor = target;
        const hasInitialMention = !!editor.querySelector('.mention-badge');
        
        if (!hasInitialMention) {
            e.preventDefault();
            showCustomDialog("Mention Required ⚠️", "Please @mention someone from the list before pasting anything.", false);
            return;
        }
        
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    }
});

function setCursorToEnd(editor) {
    editor.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
}

function showCustomDialog(title, message, isConfirm, onConfirmCallback) {
    document.getElementById('dialogTitle').innerText = title;
    document.getElementById('dialogMessage').innerText = message;
    const btnContainer = document.getElementById('dialogButtons');
    btnContainer.innerHTML = '';
    if(isConfirm) {
        btnContainer.innerHTML = `<button onclick="closeDialog()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
            <button id="dialogConfirmBtn" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors">Confirm</button>`;
        document.getElementById('dialogConfirmBtn').onclick = () => { closeDialog(); if(onConfirmCallback) onConfirmCallback(); };
    } else {
        btnContainer.innerHTML = `<button onclick="closeDialog()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors">OK</button>`;
    }
    document.getElementById('customDialog').classList.remove('hidden');
}

function closeDialog() { document.getElementById('customDialog').classList.add('hidden'); }

// ==========================================
// 🔥 SIMPLE DIRECT LOGIN LOGIC (FIXED GLOBALLY)
// ==========================================

window.handleNextOrLogin = function() {
  const idVal = document.getElementById("email").value.trim();
  const pwd = document.getElementById("password").value.trim();
  const statusEl = document.getElementById("errorText");
  const loginBtn = document.getElementById("loginBtn");

  if (!idVal) {
    statusEl.style.display = "block";
    statusEl.innerText = "Enter ID first";
    return;
  }

  if (!pwd) {
    statusEl.style.display = "block";
    statusEl.innerText = "Enter Password";
    return;
  }

  loginBtn.disabled = true;
  statusEl.style.display = "block";
  statusEl.innerText = "Checking...";

  apiCall('loginUser', { 
    mobileOrEmail: idVal,
    password: pwd,
    isAutoLogin: false 
  })
  .then(res => {
    loginBtn.disabled = false;

    // 🔥 FIXED: Checking res.user directly
    if (res && res.user) {

      try {
        localStorage.setItem("user", JSON.stringify(res.user));
        sessionStorage.setItem("user", JSON.stringify(res.user));
      } catch(e) {
        console.log("Storage failed:", e);
      }

      showAppScreen(res.user);

    } else {
      statusEl.innerText = res.message || "Invalid Login";
    }
  })
  .catch(err => {
    loginBtn.disabled = false;
    statusEl.innerText = "Server Error: Make sure API_URL is correct.";
  });
};

function checkAuthStatus() {
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem("user"));
  } catch(e) {}

  if (!user) {
    try {
      user = JSON.parse(sessionStorage.getItem("user"));
    } catch(e) {}
  }

  if (user) {
    showAppScreen(user);
    return;
  }
}

window.logoutUser = function() { 
  localStorage.removeItem("user");
  sessionStorage.removeItem("user");
  currentUser = null;
  document.getElementById("appView").classList.add("hidden"); 
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("email").value = "";
  document.getElementById("email").disabled = false;
  document.getElementById("password").value = "";
  document.getElementById("errorText").style.display = "none";
  checkAuthStatus();
};

function showAppScreen(userObj) {
  currentUser = userObj;
  
  if (document.getElementById("loggedInUserEmail")) {
      document.getElementById("loggedInUserEmail").innerText = userObj.name || userObj.email;
  }
  
  if (document.getElementById("loginView")) document.getElementById("loginView").classList.add("hidden");
  if (document.getElementById("appView")) document.getElementById("appView").classList.remove("hidden");

  setTimeout(() => {
    if (window.Android && userObj.email) {
      try {
        Android.sendUserEmail(userObj.email);
      } catch(e) {
        console.log("Android bridge error", e);
      }
    }
  }, 2000);
}

window.onload = function() {
  setTimeout(() => {
    if (currentUser) {
        console.log("🔥 45 sec over: Loading background data...");
        fetchUsersForMentions(); 
        loadConversations();
        loadLabelsForForm();
    }
  }, 45000);
};

// ==========================================
// HELPERS
// ==========================================
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}

// ==========================================
// FILTERS & DROPDOWNS
// ==========================================
window.switchTab = function(tab) {
  currentTab = tab;
  ['Live', 'Snooze', 'Archive'].forEach(t => { 
    if(document.getElementById(`tab-${t}`)) {
      document.getElementById(`tab-${t}`).className = t === tab 
        ? "px-6 py-4 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition-colors" 
        : "px-6 py-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors"; 
    }
  });
  if(document.getElementById('bulkArchiveBtn')) document.getElementById('bulkArchiveBtn').classList.toggle('hidden', tab !== 'Live');
  document.querySelectorAll('.archive-cb-container').forEach(container => {
      if (tab === 'Live') { container.classList.remove('hidden'); container.classList.add('flex'); } 
      else { container.classList.add('hidden'); container.classList.remove('flex'); }
      container.querySelector('.bulk-archive-cb').checked = false;
  });
  if(document.getElementById('reply_mention_dropdown')) document.getElementById('reply_mention_dropdown').classList.add('hidden');
  document.querySelectorAll('.inline-mention-dropdown').forEach(d => d.classList.add('hidden'));

  applyFilters();
};

function populateFilterDropdowns() {
    renderLookerDropdown('labelsDropdown', availableLabels, 'Label');
    renderLookerDropdown('membersDropdown', allUsersList.map(u => u.name), 'Member');
}

function renderLookerDropdown(containerId, items, type) {
    const container = document.getElementById(containerId);
    if(!container) return;
    const inputClass = type === 'Label' ? 'flabel' : 'fmember';
    let html = `
       <div class="flex justify-between items-center px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
           <button type="button" onclick="selectAllInDropdown('${containerId}')" class="text-xs font-extrabold text-indigo-600 hover:text-indigo-800">Select All</button>
           <button type="button" onclick="clearAllInDropdown('${containerId}')" class="text-xs font-extrabold text-slate-500 hover:text-slate-700">Clear All</button>
       </div>
       <div class="p-2 border-b border-slate-100 bg-white">
           <input type="text" oninput="searchInDropdown(this, '${containerId}')" placeholder="Search options..." class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
       </div>
       <div class="max-h-56 overflow-y-auto p-1.5 bg-white dropdown-list-container" style="-webkit-overflow-scrolling: touch;">
           ${items.map(item => `
               <label class="flex items-center gap-3 p-2 text-sm cursor-pointer hover:bg-slate-50 rounded-lg dropdown-item" data-search="${item.toLowerCase()}">
                   <input type="checkbox" value="${item}" style="-webkit-appearance: auto; appearance: auto;" class="${inputClass} w-4 h-4 cursor-pointer accent-indigo-600"> 
                   <span class="truncate item-text text-slate-700 font-medium">${item}</span>
               </label>
           `).join('')}
       </div>
       <div class="flex justify-end gap-2 p-3 border-t border-slate-100 bg-slate-50/80">
           <button type="button" onclick="toggleDropdown('${containerId}', true)" class="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg shadow-sm border border-slate-200">Cancel</button>
           <button type="button" onclick="applyLookerFilters('${containerId}', '${type}')" class="px-5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">Apply</button>
       </div>
    `;
    container.innerHTML = html;
}

window.toggleDropdown = function(id, forceClose = false) {
    const drop = document.getElementById(id);
    if(!drop) return;
    if (forceClose) { drop.classList.add('hidden'); } else {
        const isClosing = !drop.classList.contains('hidden');
        if (isClosing) { drop.classList.add('hidden'); } else {
            document.querySelectorAll('[id$="Dropdown"]').forEach(d => { if(d.id !== id) d.classList.add('hidden'); });
            drop.classList.remove('hidden');
            drop.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = cb.hasAttribute('data-applied'); });
            const search = drop.querySelector('input[type="text"]');
            if(search) { search.value = ''; searchInDropdown(search, id); }
        }
    }
};

let dropdownSearchTimeout;
window.searchInDropdown = function(input, containerId) {
    clearTimeout(dropdownSearchTimeout);
    const term = input.value.toLowerCase();
    dropdownSearchTimeout = setTimeout(() => {
        const items = document.getElementById(containerId).querySelectorAll('.dropdown-item');
        items.forEach(item => { item.style.display = item.dataset.search.includes(term) ? 'flex' : 'none'; });
    }, 150);
};

window.selectAllInDropdown = function(containerId) { document.getElementById(containerId).querySelectorAll('.dropdown-item').forEach(item => { if (item.style.display !== 'none') item.querySelector('input[type="checkbox"]').checked = true; }); };
window.clearAllInDropdown = function(containerId) { document.getElementById(containerId).querySelectorAll('.dropdown-item').forEach(item => { if (item.style.display !== 'none') item.querySelector('input[type="checkbox"]').checked = false; }); };

window.applyLookerFilters = function(containerId, type) {
    const allBoxes = document.getElementById(containerId).querySelectorAll('input[type="checkbox"]');
    allBoxes.forEach(cb => { if (cb.checked) cb.setAttribute('data-applied', 'true'); else cb.removeAttribute('data-applied'); });
    const appliedBoxes = Array.from(document.getElementById(containerId).querySelectorAll('input[type="checkbox"][data-applied="true"]'));
    const btnText = document.getElementById(containerId + 'Text');
    if(btnText) {
        if (appliedBoxes.length === 0) { btnText.innerText = `Filter ${type}s`; btnText.classList.remove('text-indigo-700', 'font-extrabold'); } 
        else if (appliedBoxes.length === 1) { btnText.innerText = appliedBoxes[0].value; btnText.classList.add('text-indigo-700', 'font-extrabold'); } 
        else { btnText.innerText = `${appliedBoxes.length} Selected`; btnText.classList.add('text-indigo-700', 'font-extrabold'); }
    }
    toggleDropdown(containerId, true); applyFilters();
};

const applyFilters = debounce(function() {
  const filterInput = document.getElementById('filterId');
  if(!filterInput) return;
  const idQuery = filterInput.value.toLowerCase();
  const checkedLabels = Array.from(document.querySelectorAll('.flabel[data-applied="true"]')).map(cb => cb.value);
  const checkedMembers = Array.from(document.querySelectorAll('.fmember[data-applied="true"]')).map(cb => cb.value.toLowerCase());
  
  Array.from(document.getElementById('conversationFeed').children).forEach(card => {
    if(!card.dataset.convId) return; 
    const isArchived = card.dataset.status === 'Archived'; 
    const isSnoozed = parseInt(card.dataset.snooze || 0) > Date.now();
    let showTab = false;

    if (currentTab === 'Live' && !isArchived && !isSnoozed) showTab = true; 
    if (currentTab === 'Archive' && isArchived) showTab = true;
    if (currentTab === 'Snooze' && !isArchived && isSnoozed) showTab = true;

    const cardLabels = card._cachedLabels || JSON.parse(card.dataset.labels || '[]');
    const cardMembers = card._cachedMembers || JSON.parse(card.dataset.members || '[]'); 
  
    const matchesLabels = checkedLabels.length === 0 || checkedLabels.every(l => cardLabels.includes(l));
    const matchesMembers = checkedMembers.length === 0 || checkedMembers.some(m => cardMembers.some(cm => cm.toLowerCase().includes(m)));
    const matchesId = !idQuery || card.dataset.convId.toLowerCase().includes(idQuery);
    card.style.display = (showTab && matchesId && matchesLabels && matchesMembers) ? 'block' : 'none';
  });
}, 300);

// ==========================================
// ACTIONS: ARCHIVE, SNOOZE
// ==========================================
window.processBulkArchive = function() {
  const selectedIds = Array.from(document.querySelectorAll('.bulk-archive-cb:checked')).map(cb => cb.closest('.card-main').dataset.convId);
  if(selectedIds.length === 0) return showCustomDialog("Notice", "Please select at least one case to archive.", false);
  showCustomDialog("Confirm Archive", `Are you sure you want to archive ${selectedIds.length} selected case(s)?\n\nCase IDs: \n${selectedIds.join('\n')}`, true, async () => {
      const btn = document.getElementById('bulkArchiveBtn'); btn.innerText = "Archiving...";
      try { await apiCall('bulkArchive', { ids: selectedIds, user: currentUser.email || currentUser.name }); loadConversations(); } catch(e) { showCustomDialog("Error", "Failed to archive.", false); }
      btn.innerText = "Archive Selected";
  });
};

window.processUnarchive = async function(btn) {
  const convId = btn.dataset.convId || btn.closest('.card-main').dataset.convId; 
  btn.innerText = "Unarchiving..."; btn.disabled = true;
  try { await apiCall('unarchiveCaseServer', { id: convId, user: currentUser.email || currentUser.name }); loadConversations();
  if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail();
  } catch(e) { showCustomDialog("Error", "Failed to unarchive.", false); btn.innerText = "📂 Un-Archive"; btn.disabled = false; }
};

window.openSnoozeModal = function(btn) { 
    document.getElementById('snoozeConvId').value = btn.dataset.convId || btn.closest('.card-main').dataset.convId;
    document.getElementById('snoozeModal').classList.remove('hidden');
};

window.confirmSnooze = async function() {
    const dt = document.getElementById('snoozeDateTime').value;
    if (!dt) { return showCustomDialog("Notice", "Please select a date/time.", false); }
    const timestamp = new Date(dt).getTime();
    if (isNaN(timestamp)) { return showCustomDialog("Error", "Invalid date/time selected", false); }

    const id = document.getElementById('snoozeConvId').value;
    let btn = document.activeElement;
    if (!btn || btn.tagName !== 'BUTTON') { btn = document.querySelector('#snoozeModal button:last-of-type'); }
    const origText = btn ? btn.innerText : 'Snooze Now';
    if(btn) { btn.innerText = "Snoozing..."; btn.disabled = true; }

    try {
        const res = await apiCall('snoozeCase', { id: id, time: timestamp });
        document.getElementById('snoozeModal').classList.add('hidden');
        showCustomDialog("Success ✅", "Case Snoozed Successfully", false);
        setTimeout(() => {
            loadConversations();
            if(!document.getElementById('caseDetailView').classList.contains('hidden')) { closeCaseDetail(); }
        }, 500);
    } catch (e) {
        console.error("Snooze Error:", e);
        showCustomDialog("Error", "Failed to snooze.\n" + e.message, false);
    } finally {
        if(btn) { btn.innerText = origText; btn.disabled = false; }
    }
};

window.processUnsnooze = async function(btn) {
    const convId = btn.dataset.convId || btn.closest('.card-main').dataset.convId; 
    btn.innerText = "Un-snoozing..."; btn.disabled = true;
    try { await apiCall('unsnoozeCaseServer', { id: convId }); loadConversations(); if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail();
    } catch(e) { showCustomDialog("Error", "Failed to un-snooze.", false); btn.innerText = "🔔 Un-Snooze"; btn.disabled = false; }
};

window.openSnoozeModalFromCard = function(btn) {
  document.getElementById('snoozeConvId').value = btn.closest('.card-main').dataset.convId;
  document.getElementById('snoozeModal').classList.remove('hidden');
};

// ==========================================
// MEMBER MANAGEMENT
// ==========================================
function getFilteredUsersForMention(query) {
    const queryLower = query.toLowerCase().trim();
    let result = [];
    if (window.currentCaseHasAdminRights) {
        result = [...allUsersList];
    } else {
        const caseMembersLower = (window.currentCaseAllMembers || []).map(str => String(str).toLowerCase().trim());
        result = allUsersList.filter(u => {
            const uEmail = u.email.toLowerCase().trim();
            const uName = u.name.toLowerCase().trim();
            return caseMembersLower.includes(uEmail) || caseMembersLower.some(member => member.includes(uEmail) || member.includes(uName));
        });
    }
    if (queryLower) result = result.filter(u => u.name.toLowerCase().includes(queryLower) || u.email.toLowerCase().includes(queryLower));
    return result.filter((u, index, self) => index === self.findIndex((t) => t.email === u.email));
}

window.searchNewMember = debounce(function(q) {
   const dropdown = document.getElementById('member_search_dropdown');
   if(!q) { dropdown.classList.add('hidden'); return; }
   const filtered = allUsersList.filter(u => (u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())) && !tempAdmins.includes(u.name) && !tempUsers.includes(u.name));
   if(filtered.length === 0) { dropdown.innerHTML = '<div class="p-3 text-xs text-slate-500">No users found</div>'; }
   else {
      dropdown.innerHTML = filtered.map(u => `
        <div class="p-3 hover:bg-indigo-50 border-b flex justify-between items-center">
           <span class="text-sm font-medium text-slate-800">${u.name}</span>
           <div class="flex gap-1">
             <button type="button" onclick="addNewTempMember('${u.name.replace(/'/g, "\\'")}', 'Admin')" class="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-bold">Admin</button>
             <button type="button" onclick="addNewTempMember('${u.name.replace(/'/g, "\\'")}', 'User')" class="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded font-bold">User</button>
           </div>
        </div>`).join('');
   }
   dropdown.classList.remove('hidden');
}, 200);

window.openManageMembers = function() {
   tempAdmins = [...currentCaseAdmins].filter(String); tempUsers = [...currentCaseUsers].filter(String);
   document.getElementById('manageMembersModal').classList.remove('hidden'); renderManageMembersList();
};
window.closeManageMembers = function() { document.getElementById('manageMembersModal').classList.add('hidden'); document.getElementById('member_search_input').value = ''; document.getElementById('member_search_dropdown').classList.add('hidden'); };

function renderManageMembersList() {
   let allMems = [];
   tempAdmins.forEach(a => allMems.push({name: a, role: 'Admin'}));
   tempUsers.forEach(u => allMems.push({name: u, role: 'User'}));
   const list = document.getElementById('manage_members_list');
   if(allMems.length === 0) { list.innerHTML = '<p class="text-xs text-slate-400">No members assigned.</p>'; return; }
   list.innerHTML = allMems.map(m => `
     <div class="flex justify-between items-center bg-white border border-slate-200 rounded p-2 shadow-sm">
       <span class="text-sm font-bold text-slate-700">${m.name}</span>
       <div class="flex gap-2 items-center">
         <select onchange="updateTempRole('${m.name}', this.value)" class="text-xs font-bold border rounded p-1 bg-slate-50 text-slate-700">
            <option value="Admin" ${m.role==='Admin'?'selected':''}>Admin</option>
            <option value="User" ${m.role==='User'?'selected':''}>User</option>
         </select>
         <button onclick="removeTempMember('${m.name}')" class="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded font-bold text-lg leading-none">&times;</button>
       </div>
     </div>
   `).join('');
}

window.updateTempRole = function(name, newRole) { tempAdmins = tempAdmins.filter(n => n !== name); tempUsers = tempUsers.filter(n => n !== name); if(newRole === 'Admin') tempAdmins.push(name); if(newRole === 'User') tempUsers.push(name); renderManageMembersList(); };
window.removeTempMember = function(name) { tempAdmins = tempAdmins.filter(n => n !== name); tempUsers = tempUsers.filter(n => n !== name); renderManageMembersList(); };
window.addNewTempMember = function(name, role) { tempAdmins = tempAdmins.filter(n => n !== name); tempUsers = tempUsers.filter(n => n !== name); if(role === 'Admin') tempAdmins.push(name); else tempUsers.push(name); document.getElementById('member_search_input').value = ''; document.getElementById('member_search_dropdown').classList.add('hidden'); renderManageMembersList(); };

window.saveManagedMembers = async function() {
   const btn = document.getElementById('saveMembersBtn'); btn.innerText = "Saving..."; btn.disabled = true;
   const convId = document.getElementById('detail-conv-id').value;
   try {
       await apiCall('updateCaseMembers', { id: convId, admins: tempAdmins, users: tempUsers, userEmail: currentUser.email });
       currentCaseAdmins = [...tempAdmins]; currentCaseUsers = [...tempUsers];
       const detAdm = document.getElementById('detail-admins'); detAdm.innerHTML = '';
       const detUsr = document.getElementById('detail-users'); detUsr.innerHTML = '';
       currentCaseAdmins.forEach(a => { if(a) detAdm.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${a.split('@')[0]}</span>`; });
       currentCaseUsers.forEach(u => { if(u) detUsr.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${u.split('@')[0]}</span>`; });
       detAdm.innerHTML += `<button onclick="openManageMembers()" class="ml-1 text-blue-600 hover:text-blue-800 p-0.5 rounded-full hover:bg-blue-50 transition-colors" title="Manage Members"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>`;
       closeManageMembers(); loadConversations();
   } catch(e) { showCustomDialog("Error", "Failed to update members", false); } finally { btn.innerText = "Save Changes"; btn.disabled = false; }
};

// ==========================================
// MENTIONS & COMPOSER LOGIC
// ==========================================
window.triggerMention = function() {
  const editor = document.getElementById('detail-reply-input');
  editor.focus();
  const sel = window.getSelection(); let range;
  if (sel.rangeCount > 0) range = sel.getRangeAt(0); else { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
  const textNode = document.createTextNode(' @');
  range.insertNode(textNode); range.setStartAfter(textNode); range.setEndAfter(textNode);
  sel.removeAllRanges(); sel.addRange(range);
  window.handleReplyTyping({target: editor});
};

window.handleReplyTyping = function(e) {
  const editor = document.getElementById('detail-reply-input');
  const bubbles = editor.querySelectorAll('.mention-badge');
  const currentEmails = Array.from(bubbles).map(b => b.dataset.email);
  const oldLen = replyComposerState.recipients.length;
  replyComposerState.recipients = replyComposerState.recipients.filter(r => currentEmails.includes(r.email));
  if (oldLen !== replyComposerState.recipients.length) renderReplyDynamicUI();

  const sel = window.getSelection();
  if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      let text = '';
      if (range.startContainer.nodeType === Node.TEXT_NODE) { text = range.startContainer.textContent.substring(0, range.startOffset); } 
      else if (range.startContainer.nodeType === Node.ELEMENT_NODE) { text = range.startContainer.innerText ? range.startContainer.innerText.substring(0, range.startOffset) : ''; }

      const match = text.match(/(?:^|\s|\n|\u00A0)@([^\s]*)$/);
      if (match) { 
          mentionSearchQuery = match[1].toLowerCase(); 
          replySavedRange = range.cloneRange(); 
          showReplyUserList();
      } else { 
          document.getElementById('reply_mention_dropdown').classList.add('hidden');
      }
  }
  checkComposerRestrictions(editor, 'main');
};

function showReplyUserList() {
    const dropdown = document.getElementById('reply_mention_dropdown');
    dropdown.classList.remove('hidden');
    const filtered = getFilteredUsersForMention(mentionSearchQuery);
    dropdown.innerHTML = filtered.map(u => 
        `<div onclick="selectReplyMentionUser('${u.name.replace(/'/g, "\\'")}', '${u.email.replace(/'/g, "\\'")}')" class="p-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 text-left">
            <div class="text-sm font-bold text-slate-800">${u.name}</div>
            <div class="text-[11px] text-slate-500 truncate">${u.email}</div>
         </div>`
    ).join('');
    if(filtered.length === 0) dropdown.innerHTML = `<div class="p-3 text-[11px] text-slate-400 font-bold uppercase tracking-widest text-center">No match found</div>`;
}

window.selectReplyMentionUser = function(name, email) {
  const dropdown = document.getElementById('reply_mention_dropdown');
  const emailLower = email.toLowerCase(); const nameLower = name.toLowerCase();
  const isAdmin = currentCaseAdmins.some(a => a.toLowerCase().includes(emailLower) || a.toLowerCase().includes(nameLower));
  const isUser = currentCaseUsers.some(u => u.toLowerCase().includes(emailLower) || u.toLowerCase().includes(nameLower));
  const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
  
  if (isAdmin || isCreator) window.finalizeReplyMention(name, email, 'Admin');
  else if (isUser) window.finalizeReplyMention(name, email, 'User');
  else {
      if (!window.currentCaseHasAdminRights) {
          showCustomDialog("Action Blocked", "Only Case Admins can add new members.", false);
          dropdown.classList.add('hidden'); return;
      }
      dropdown.innerHTML = `
        <div class="bg-slate-800 px-3 py-2 text-xs font-bold text-white">Select Role for ${name}</div>
        <div onclick="finalizeReplyMention('${name}', '${email}', 'Admin')" class="p-2 hover:bg-blue-50 cursor-pointer border-b text-sm font-bold text-blue-700">👑 Admin</div>
        <div onclick="finalizeReplyMention('${name}', '${email}', 'User')" class="p-2 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700">👤 User</div>`;
  }
};

window.finalizeReplyMention = function(name, email, role) {
  const emailLower = email.toLowerCase(); const nameLower = name.toLowerCase();
  const isAdmin = currentCaseAdmins.some(a => a.toLowerCase() === emailLower || a.toLowerCase() === nameLower);
  const isUser = currentCaseUsers.some(u => u.toLowerCase() === emailLower || u.toLowerCase() === nameLower);
  const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
  
  if (!isAdmin && !isUser && !isCreator) {
      if (role === 'Admin') currentCaseAdmins.push(email); else currentCaseUsers.push(email);
      if (!window.currentCaseAllMembers) window.currentCaseAllMembers = [];
      window.currentCaseAllMembers.push(email);
      const detAdm = document.getElementById('detail-admins'); const detUsr = document.getElementById('detail-users');
      const badgeHtml = `<span class="px-2 py-0.5 ${role === 'Admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'} border text-[10px] rounded font-bold shadow-sm">${role === 'Admin' ? '👑' : '👤'} ${name.split('@')[0]}</span>`;
      if (role === 'Admin') { detAdm.insertAdjacentHTML('afterbegin', badgeHtml); } 
      else { detUsr.insertAdjacentHTML('afterbegin', badgeHtml); }
      apiCall('updateCaseMembers', { id: document.getElementById('detail-conv-id').value, admins: currentCaseAdmins, users: currentCaseUsers }).catch(e=>{});
  }

  if(!replyComposerState.recipients.find(r=>r.email === email)) { replyComposerState.recipients.push({name: name, email: email, role: role, type: replyComposerState.globalType, customText: ''}); }
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(replySavedRange);
  const textNode = replySavedRange.startContainer;
  replySavedRange.setStart(textNode, textNode.textContent.lastIndexOf('@', replySavedRange.startOffset - 1)); replySavedRange.deleteContents();
  const badge = document.createElement('span'); badge.contentEditable = "false";
  badge.className = `mention-badge mx-1 shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold ${role === 'Admin' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-800'}`;
  badge.dataset.email = email; badge.innerHTML = `@${name}`;
  replySavedRange.insertNode(badge); replySavedRange.setStartAfter(badge); 
  replySavedRange.insertNode(document.createTextNode('\u00A0')); replySavedRange.setStartAfter(badge.nextSibling);
  document.getElementById('reply_mention_dropdown').classList.add('hidden'); renderReplyDynamicUI();
  
  checkComposerRestrictions(document.getElementById('detail-reply-input'), 'main');
};

window.setReplyGlobalType = function(type) { 
    replyComposerState.globalType = type; replyComposerState.recipients.forEach(r => r.type = type);
    const btnReply = document.getElementById('btn_global_reply'); const btnAsk = document.getElementById('btn_global_ask');
    if(type === 'Message') { 
        btnReply.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all bg-white shadow-sm border border-slate-200 text-slate-800";
        btnAsk.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all text-slate-500 hover:text-slate-700";
    } else { 
        btnAsk.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all bg-white shadow-sm border border-slate-200 text-red-700";
        btnReply.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all text-slate-500 hover:text-slate-700";
    }
    renderReplyDynamicUI();
};

function renderReplyDynamicUI() {
  const container = document.getElementById('reply_dynamic_type_area'); const globalSelector = document.getElementById('global_type_selector');
  const userCount = replyComposerState.recipients.length;
  if (userCount === 0) { container.classList.add('hidden'); globalSelector.classList.remove('hidden'); globalSelector.classList.add('flex'); return; }
  
  container.classList.remove('hidden'); globalSelector.classList.add('hidden'); globalSelector.classList.remove('flex');
  let html = '';
  if (userCount === 1) {
    const r = replyComposerState.recipients[0];
    html = `<div class="flex items-center justify-between mb-1"><span class="text-xs font-bold text-blue-800 uppercase">Action for @${r.name} (${r.role})</span></div>
      <div class="flex items-center gap-3 py-1"><button type="button" onclick="setReplyGlobalType('Message')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Message' ? 'bg-slate-800 border-slate-900 text-white shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-50'}">💬 Message</button>
      <button type="button" onclick="setReplyGlobalType('Ask')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Ask' ? 'bg-red-100 border-red-500 text-red-700 shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-50'}">🎯 Ask</button></div>`;
  } else {
    html = `<div class="flex items-center justify-between mb-3 border-b border-blue-200 pb-2"><span class="text-xs font-bold text-blue-800 uppercase">Delegation Mode (${userCount} Users)</span><div class="flex bg-white rounded border border-slate-200 shadow-sm overflow-hidden"><button type="button" onclick="setReplyComposerMode('SAME')" class="px-3 py-1.5 text-xs font-bold transition-colors ${replyComposerState.mode === 'SAME' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}">Same Action</button><button type="button" onclick="setReplyComposerMode('DIFFERENT')" class="px-3 py-1.5 text-xs font-bold transition-colors border-l ${replyComposerState.mode === 'DIFFERENT' ? 'bg-purple-600 text-white' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}">Different Action</button></div></div>`;
    if (replyComposerState.mode === 'SAME') {
      html += `<div class="flex items-center gap-3 py-2 justify-center"><button type="button" onclick="setReplyGlobalType('Message')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Message' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'}">💬 Message All</button><button type="button" onclick="setReplyGlobalType('Ask')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Ask' ? 'bg-red-100 text-red-700' : 'bg-white text-slate-500'}">🎯 Ask All</button></div>`;
    } else {
      html += `<div class="max-h-60 overflow-y-auto pr-1 space-y-2">` + replyComposerState.recipients.map((r, idx) => `<div class="bg-white p-2.5 rounded border border-slate-200 shadow-sm"><div class="flex justify-between items-center mb-2"><span class="font-bold text-sm text-slate-800 bg-slate-100 px-2 py-0.5 rounded">@${r.name}</span><div class="flex gap-1"><button type="button" onclick="setReplyUserType(${idx}, 'Message')" class="px-3 py-1 text-[10px] rounded-full border font-bold transition-colors ${r.type === 'Message' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500'}">Message</button><button type="button" onclick="setReplyUserType(${idx}, 'Ask')" class="px-3 py-1 text-[10px] rounded-full border font-bold transition-colors ${r.type === 'Ask' ? 'bg-red-100 text-red-700' : 'bg-slate-50 text-slate-500'}">Ask</button></div></div><textarea oninput="setReplyUserText(${idx}, this.value)" placeholder="Custom note for ${r.name.split(' ')[0]}..." class="w-full text-sm p-2 border border-slate-200 rounded-lg bg-slate-50 outline-none" rows="1">${r.customText || ''}</textarea></div>`).join('') + `</div>`;
    }
  }
  container.innerHTML = html;
}

window.setReplyComposerMode = function(mode) { replyComposerState.mode = mode; renderReplyDynamicUI(); };
window.setReplyUserType = function(idx, type) { replyComposerState.recipients[idx].type = type; renderReplyDynamicUI(); };
window.setReplyUserText = function(idx, text) { replyComposerState.recipients[idx].customText = text; };

// ==========================================
// EDIT CASE MODAL LOGIC
// ==========================================
window.openEditCaseModal = function() {
    document.getElementById('edit_subject').value = document.getElementById('detail-subject').innerText;
    document.getElementById('edit_details').value = document.getElementById('detail-details').innerText;
    currentEditLabels = new Set(Array.from(document.getElementById('detail-labels').children).map(span => span.innerText));
    renderEditLabels();
    
    const convId = document.getElementById('detail-conv-id').value;
    const card = document.querySelector(`.card-main[data-conv-id="${convId}"]`);
    if(card) currentEditAttachments = JSON.parse(card.dataset.attachmentsData || '[]').filter(String);
    newEditPendingFiles = []; renderEditAttachments();
    document.getElementById('editCaseModal').classList.remove('hidden');
};

function renderEditLabels() {
    document.getElementById('edit_labels_container').innerHTML = availableLabels.map(label => `<span onclick="toggleEditLabel('${label}')" class="cursor-pointer px-3 py-1.5 rounded-full text-[10px] font-bold transition-all shadow-sm border ${currentEditLabels.has(label) ? 'bg-green-800 text-white border-green-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${label}</span>`).join('');
}

window.toggleEditLabel = function(label) { currentEditLabels.has(label) ? currentEditLabels.delete(label) : currentEditLabels.add(label); renderEditLabels(); };

function renderEditAttachments() {
    document.getElementById('edit_current_attachments').innerHTML = currentEditAttachments.map((url, i) => `<span class="bg-blue-50 text-blue-700 border border-blue-100 text-[10px] px-2 py-1 rounded flex gap-1 items-center font-bold shadow-sm">🔗 File ${i+1} <button type="button" onclick="removeCurrentEditAttachment(${i})" class="text-blue-400 hover:text-blue-700 ml-1 leading-none">&times;</button></span>`).join('');
    document.getElementById('edit_new_file_list').innerHTML = newEditPendingFiles.map((f, i) => `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] px-2 py-1 rounded flex gap-1 items-center font-bold shadow-sm">${f.name} <button type="button" onclick="removeNewEditFile(${i})" class="text-indigo-400 hover:text-indigo-700 ml-1 leading-none">&times;</button></span>`).join('');
}

window.removeCurrentEditAttachment = function(index) { currentEditAttachments.splice(index, 1); renderEditAttachments(); };
window.handleEditFileSelect = function(e) { Array.from(e.target.files).forEach(f => { if(newEditPendingFiles.length < 10) newEditPendingFiles.push(f); }); renderEditAttachments(); };
window.removeNewEditFile = function(index) { newEditPendingFiles.splice(index, 1); renderEditAttachments(); };

window.saveCaseEdits = async function() {
    const btn = document.getElementById('saveEditBtn'); btn.innerText = "Saving..."; btn.disabled = true;
    try {
        let finalUrls = [...currentEditAttachments];
        if(newEditPendingFiles.length > 0) {
            for(let file of newEditPendingFiles) {
                const base64 = await new Promise(res => { const reader = new FileReader(); reader.onload = ev => res(ev.target.result); reader.readAsDataURL(file); });
                const result = await apiCall('uploadFile', { base64: base64, filename: file.name });
                if(result && result.url) finalUrls.push(result.url);
            }
        }
        await apiCall('updateCaseDetails', { id: document.getElementById('detail-conv-id').value, subject: document.getElementById('edit_subject').value.trim(), details: document.getElementById('edit_details').value.trim(), labels: Array.from(currentEditLabels), attachments: finalUrls, userEmail: currentUser.email });
        document.getElementById('editCaseModal').classList.add('hidden');
        loadConversations(); closeCaseDetail(); 
    } catch(e) { showCustomDialog("Error", "Failed to save edits.", false); } finally { btn.innerText = "Save Changes"; btn.disabled = false; }
};

// ==========================================
// DETAIL VIEW & REPLIES
// ==========================================
window.handleCardClick = function(event, cardEl) {
   if (event.target.closest('button') || event.target.closest('label') || event.target.closest('.archive-cb-container') || event.target.closest('a')) return;
   window.openCaseDetail(cardEl);
};

window.openCaseDetail = function(cardEl) {
  try {
      const card = cardEl.closest('.card-main'); const dataset = card.dataset; const convId = dataset.convId;
      document.getElementById('detail-subject').innerText = card.querySelector('[data-id="subject"]').innerText; 
      document.getElementById('detail-id').innerText = convId; 
      document.getElementById('detail-author').innerText = card.querySelector('[data-id="author"]').innerText; 
      document.getElementById('detail-timestamp').innerText = card.querySelector('[data-id="timestamp"]').innerText;
      document.getElementById('detail-details').innerText = card.querySelector('[data-id="details"]').innerText; 
      document.getElementById('detail-message').innerHTML = card.querySelector('[data-id="message"]').innerHTML;
      document.getElementById('detail-labels').innerHTML = card.querySelector('[data-id="labels-container"]').innerHTML; 
      document.getElementById('detail-status-badge').innerHTML = card.querySelector('[data-id="status-badge"]').outerHTML;
      
      currentCaseAdmins = JSON.parse(dataset.caseAdmins || '[]').filter(String);
      let rawCaseUsers = JSON.parse(dataset.caseUsers || '[]').filter(String);
      const hasAdminRights = dataset.hasAdminRights === 'true';
      let adminSetUI = new Set(currentCaseAdmins.map(a => a.toLowerCase().trim()));
      currentCaseUsers = rawCaseUsers.filter(u => !adminSetUI.has(u.toLowerCase().trim()));
      window.currentCaseHasAdminRights = hasAdminRights;
      
      const editBtn = document.getElementById('edit-case-btn');
      if(editBtn) { if(hasAdminRights) editBtn.classList.remove('hidden'); else editBtn.classList.add('hidden'); }

      window.currentCaseAllMembers = JSON.parse(dataset.members || '[]');
      const detAdm = document.getElementById('detail-admins'); detAdm.innerHTML = '';
      const detUsr = document.getElementById('detail-users'); detUsr.innerHTML = '';
      currentCaseAdmins.forEach(a => { if(a) detAdm.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${a.split('@')[0]}</span>`; });
      currentCaseUsers.forEach(u => { if(u) detUsr.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${u.split('@')[0]}</span>`; });
      if(hasAdminRights) detAdm.innerHTML += `<button onclick="openManageMembers()" class="ml-1 text-blue-600 hover:text-blue-800 p-0.5 rounded-full hover:bg-blue-50 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>`;

      const attContainer = document.getElementById('detail-attachments'); attContainer.innerHTML = '';
      JSON.parse(dataset.attachmentsData || '[]').forEach(url => { 
          if(url) {
              const cleanUrl = url.replace(/\/view.*/, '/preview');
              attContainer.innerHTML += `<div class="flex flex-col gap-2 mt-3 w-full max-w-sm"><div class="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 relative w-full"><iframe src="${cleanUrl}" height="200" class="w-full" allow="autoplay; encrypted-media" frameborder="0" scrolling="no"></iframe></div><a href="${url}" target="_blank" class="self-start inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg shadow-sm border border-indigo-100">📎 Open Attachment</a></div>`;
          }
      });
      document.getElementById('detail-conv-id').value = convId;
      const status = dataset.status; const isSnoozed = parseInt(dataset.snooze) > Date.now();
      const unarchiveBtn = document.getElementById('detail-unarchive-btn'); const unsnoozeBtn = document.getElementById('detail-unsnooze-btn'); const snoozeBtn = document.getElementById('detail-snooze-btn');
      unarchiveBtn.classList.add('hidden'); unsnoozeBtn.classList.add('hidden'); snoozeBtn.classList.add('hidden');
      if (hasAdminRights) { if (status === 'Archived') unarchiveBtn.classList.remove('hidden'); else if (isSnoozed) unsnoozeBtn.classList.remove('hidden'); else snoozeBtn.classList.remove('hidden'); }

      ['Live', 'Snooze', 'Archive'].forEach(t => { if (t !== currentTab) document.getElementById(`tab-${t}`).style.display = 'none'; });
      
      replyComposerState = { recipients: [], mode: 'SAME', globalType: 'Message' };
      document.getElementById('detail-reply-input').innerHTML = ''; 
      window.setReplyGlobalType('Message');
      
      checkComposerRestrictions(document.getElementById('detail-reply-input'), 'main');

      document.getElementById('dashboardView').classList.add('hidden'); document.getElementById('caseDetailView').classList.remove('hidden');
      
      // 🔥 REALTIME START (Reset & Start Polling)
      lastTimestamp = 0;
      seenMessages.clear();
      if (realtimeInterval) {
          clearInterval(realtimeInterval);
      }
      realtimeInterval = setInterval(fetchNewMessages, 3000);

      loadCommentsPaginated(convId, true);
  } catch(e) { console.error("Open Case Error:", e); }
};

window.closeCaseDetail = function() { 
    if (realtimeInterval) {
        clearInterval(realtimeInterval);
        realtimeInterval = null;
    }

    document.getElementById('caseDetailView').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden'); 
    document.getElementById('detail-thread-container').innerHTML = '';
    document.getElementById('reply_mention_dropdown').classList.add('hidden');
    document.querySelectorAll('.inline-mention-dropdown').forEach(d => d.classList.add('hidden'));
    ['Live', 'Snooze', 'Archive'].forEach(t => { if(document.getElementById(`tab-${t}`)) document.getElementById(`tab-${t}`).style.display = ''; });
    loadConversations();
};

window.handleReplyFileSelect = function(e) {
    if (!document.getElementById('detail-reply-input').querySelector('.mention-badge')) {
        e.target.value = '';
        return showCustomDialog("Notice ⚠️", "Pehle kisi ko @mention karein tabhi attachment use kar sakte hain.", false);
    }
    Array.from(e.target.files).forEach(file => { 
        if(pendingReplyFiles.length >= 10) return; 
        if(!pendingReplyFiles.some(pf => pf.name === file.name)) pendingReplyFiles.push(file); 
    });
    renderReplyFileList();
};

function renderReplyFileList() { 
    const fileListEl = document.getElementById('reply_file_list');
    if(fileListEl) fileListEl.innerHTML = pendingReplyFiles.map((f, i) => `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] px-2 py-1 rounded-md flex gap-1 items-center font-bold shadow-sm">${f.name} <button type="button" onclick="removeReplyFile(${i})" class="text-indigo-400 hover:text-indigo-700 ml-1 font-extrabold">&times;</button></span>`).join('');
}
window.removeReplyFile = function(index) { pendingReplyFiles.splice(index, 1); renderReplyFileList(); };

// ==========================================
// ⚡ OPTIMISTIC UI: THREAD & COMMENT SYSTEM
// ==========================================
let allLoadedComments = [];

function renderAllCommentsLocally() {
    const container = document.getElementById("detail-thread-container");
    const threadsMap = {};
    allLoadedComments.forEach(c => {
        const tId = c.threadId || c.uniqueId || 'default_thread';
        if (!threadsMap[tId]) { threadsMap[tId] = { id: tId, items: [], startTime: new Date(c.timestamp) }; }
        threadsMap[tId].items.push(c);
        if (new Date(c.timestamp) < threadsMap[tId].startTime) { threadsMap[tId].startTime = new Date(c.timestamp); }
    });
    const sortedThreadGroups = Object.values(threadsMap).sort((a, b) => a.startTime - b.startTime);
    let finalHtml = '';
    sortedThreadGroups.forEach(threadGroup => {
        const roots = [];
        threadGroup.items.forEach(item => { item.children = []; });
        threadGroup.items.forEach(item => {
            if (item.type === 'Reply' && item.parentAskId) {
                const parentAsk = threadGroup.items.find(p => p.type === 'Ask' && String(p.askId).trim() === String(item.parentAskId).trim());
                if (parentAsk) parentAsk.children.push(item); else roots.push(item);
            } else { roots.push(item); }
        });
        roots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        finalHtml += renderThreadHTML(roots, 0); 
    });
    container.innerHTML = finalHtml;
}

function loadCommentsPaginated(caseId, reset = false) {
    if (isLoading || !hasMore) return;
    isLoading = true;
    const container = document.getElementById("detail-thread-container");
    if (reset) { page = 0; hasMore = true; allLoadedComments = []; container.innerHTML = '<div class="loader mx-auto my-10"></div>'; }

    apiCall('getPaginatedComments', { caseId: caseId, page: page, limit: limit })
        .then(data => {
            isLoading = false;
            if (!data || data.length === 0) {
                if(reset) container.innerHTML = `<p class="text-center py-5 text-slate-400 font-medium tracking-wide">Start the discussion below.</p>`;
                hasMore = false; return;
            }
            if (data.length < limit) hasMore = false;
            
            // 🔥 Update Timestamp & Seen Messages (Backend Tracking)
            data.forEach(msg => {
                if (msg.timestamp > lastTimestamp) {
                    lastTimestamp = msg.timestamp;
                }
                const id = msg.uniqueId || (msg.timestamp + msg.sender);
                seenMessages.add(id);
            });

            allLoadedComments = allLoadedComments.concat(data);
            
            renderAllCommentsLocally();
            page++;
        }).catch(err => { isLoading = false; console.error(err); });
}

// 🔥 REALTIME FETCH (MATCHING YOUR API)
async function fetchNewMessages() {

    const caseId = document.getElementById('detail-conv-id').value;
    if (!caseId || document.getElementById("caseDetailView").classList.contains("hidden")) return;

    try {

        const messages = await apiCall('getNewComments', {
            caseId: caseId,
            lastTimestamp: lastTimestamp
        });

        if (!messages || messages.length === 0) return;

        let hasNew = false;

        messages.forEach(msg => {

            const id = msg.uniqueId || (msg.timestamp + msg.sender);

            // 🔥 duplicate stop
            if (seenMessages.has(id)) return;

            seenMessages.add(id);
            allLoadedComments.push(msg);
            hasNew = true;

            // 🔥 update timestamp
            if (msg.timestamp > lastTimestamp) {
                lastTimestamp = msg.timestamp;
            }

            // ===================================
            // 🔥 OPTION 2 → MARK SEEN (ONLY IF NOT)
            // ===================================
            if (!msg.seen || !msg.seen.includes(currentUser.email)) {

                fetch(API_URL, {
                    method: "POST",
                    body: JSON.stringify({
                        action: "markSeen",
                        params: {
                            notificationId: msg.uniqueId,
                            userEmail: currentUser.email
                        }
                    })
                });

            }

        });

        if (hasNew) {

            renderAllCommentsLocally();

            setTimeout(() => {
                const scrollArea = document.getElementById("detail-thread-container").parentElement;
                if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
            }, 50);

        }

    } catch (err) {
        console.error("Realtime error:", err);
    }
}

window.setInlineType = function(btn, type) {
    const container = btn.closest('.flex.items-center');
    const valInput = container.querySelector('.inline-type-val');
    valInput.value = type;
    
    const replyBtn = container.querySelector('.inline-reply-btn');
    const askBtn = container.querySelector('.inline-ask-btn');
    if (type === 'Reply') {
        replyBtn.className = "inline-type-btn inline-reply-btn px-3 py-1 text-[10px] font-bold rounded-md bg-indigo-600 text-white shadow-sm transition-colors";
        askBtn.className = "inline-type-btn inline-ask-btn px-3 py-1 text-[10px] font-bold rounded-md bg-white/60 text-slate-700 hover:bg-white shadow-sm transition-colors";
    } else {
        askBtn.className = "inline-type-btn inline-ask-btn px-3 py-1 text-[10px] font-bold rounded-md bg-red-600 text-white shadow-sm transition-colors";
        replyBtn.className = "inline-type-btn inline-reply-btn px-3 py-1 text-[10px] font-bold rounded-md bg-white/60 text-slate-700 hover:bg-white shadow-sm transition-colors";
    }
};

function renderThreadHTML(list, level = 0) {
    return list.map(c => {
        const tColor = c.threadColor || '#f8fafc';
        const indentStyle = level > 0 ? `margin-left: ${level * 24}px;` : '';
        let badge = ''; const statusIcon = (c.type === 'Ask' && c.status === 'Closed') ? ' <i class="fas fa-check-circle ml-1"></i>' : '';
        if (c.type === 'Ask') badge = `<span class="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Ask ${c.askId ? `#${c.askId}` : ''}${statusIcon}</span>`;
        else if (c.type === 'Reply') badge = `<span class="bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Reply ${c.parentAskId ? `to #${c.parentAskId}` : ''}</span>`;
        else badge = `<span class="bg-slate-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Message</span>`;

        let attachmentPreviewHtml = '';
        if (c.attachmentUrl) {
            const cleanUrlForPreview = c.attachmentUrl.replace(/\/view.*/, '/preview');
            const isAudio = c.attachmentFileName && c.attachmentFileName.match(/\.(mp3|wav|ogg|m4a)$/i);
            const previewHeight = isAudio ? '80' : '300';
            attachmentPreviewHtml = `<div class="mt-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm inline-block w-full max-w-md"><div class="rounded-lg overflow-hidden bg-slate-50 relative w-full border border-slate-100"><iframe src="${cleanUrlForPreview}" height="${previewHeight}" class="w-full" allow="autoplay; encrypted-media" frameborder="0" scrolling="no"></iframe></div><div class="mt-2 text-left"><a href="${c.attachmentUrl}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-extrabold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-100">📎 ${escapeHTML(c.attachmentFileName || 'Open Full File')}</a></div></div>`;
        }

        const parentAskIdForBackend = (c.type === 'Ask') ? c.askId : (c.parentAskId || '');

        return `
            <div class="mb-4 group" style="${indentStyle}" data-id="reply-container">
                <div class="p-4 rounded-xl shadow-sm transition-all border border-slate-200/50" style="background-color: ${tColor}; border-left: 4px solid rgba(0,0,0,0.1);">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shadow-inner">${(c.sender || 'U').charAt(0).toUpperCase()}</div>
                        <span class="font-bold text-sm text-slate-900">${(c.sender || 'Unknown').split('@')[0]}</span>
                        ${badge}
                        <span class="text-[10px] text-slate-500 font-medium ml-auto">${new Date(c.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">${c.text}</div>
                    ${attachmentPreviewHtml}
                    <div class="mt-3 flex gap-3 items-center text-xs border-t border-slate-200/50 pt-2">
                        <button class="font-bold text-slate-500 hover:text-indigo-600 transition-colors inline-reply-toggle-btn" onclick="toggleInlineReply(this)" data-askid="${parentAskIdForBackend}" data-threadid="${c.threadId}" data-threadcolor="${c.threadColor}">Reply</button>
                    </div>
                    
                    <div class="hidden mt-3 flex gap-2 items-start relative" data-id="inline-reply-box">
                        <div class="flex-1 border border-slate-300 rounded-xl p-2 flex flex-col shadow-sm transition-all relative" style="background-color: ${tColor}; border-left: 4px solid rgba(0,0,0,0.15);">
                            <div class="flex gap-2 items-center px-1 mb-2 border-b border-black/10 pb-2">
                                <button type="button" onclick="setInlineType(this, 'Reply')" class="inline-type-btn inline-reply-btn px-3 py-1 text-[10px] font-bold rounded-md bg-indigo-600 text-white shadow-sm transition-colors">Reply</button>
                                <button type="button" onclick="setInlineType(this, 'Ask')" class="inline-type-btn inline-ask-btn px-3 py-1 text-[10px] font-bold rounded-md bg-white/60 text-slate-700 hover:bg-white shadow-sm transition-colors">New Ask</button>
                                <input type="hidden" class="inline-type-val" value="Reply">
                            </div>
                            <div contenteditable="true" oninput="handleInlineTyping(event)" data-placeholder="Start typing @ to mention..." class="w-full text-xs outline-none max-h-24 overflow-y-auto leading-relaxed inline-reply-input text-slate-900 px-2 py-2 bg-white/70 border border-black/5 rounded-lg shadow-inner"></div>
                            <div class="hidden absolute bottom-full mb-1 left-0 sm:left-2 w-[90vw] sm:w-64 max-w-full bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] overflow-hidden inline-mention-dropdown"></div>
                            <div class="flex flex-wrap gap-1 mt-2 empty:hidden inline-file-list px-1"></div>
                            <div class="flex justify-between items-center mt-2 border-t border-black/10 pt-2">
                                <label class="text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer p-1 rounded hover:bg-white/50">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                                    <input type="file" multiple class="hidden inline-file-input" onchange="handleInlineFileSelect(event, this)">
                                </label>
                                <button type="button" class="px-4 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-lg hover:bg-indigo-700 shadow-sm transition-colors" onclick="submitInlineReply(this)">Send</button>
                            </div>
                        </div>
                    </div>
                </div>
                ${c.children && c.children.length ? renderThreadHTML(c.children, level + 1) : ''}
            </div>
        `;
    }).join('');
}

// ⚡ COMPLETELY OPTIMISTIC: Updates UI instantly BEFORE waiting for server
window.submitDetailReply = async function() {
    const inputDiv = document.getElementById('detail-reply-input');
    const msgHTML = inputDiv.innerHTML.trim();
    if (!inputDiv.querySelector('.mention-badge')) {
        return showCustomDialog("Notice", "You must select someone using @ before sending a reply.", false);
    }
    if(!msgHTML && pendingReplyFiles.length === 0) return showCustomDialog("Notice", "Please write a message or attach a file.", false);
    
    const caseId = document.getElementById('detail-conv-id').value;
    const submitBtn = document.getElementById('detailSubmitBtn');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Posting...';
    submitBtn.disabled = true;
    
    try {
        let fileUrl = ''; let fileName = '';
        if(pendingReplyFiles.length > 0) { 
            const file = pendingReplyFiles[0];
            const base64 = await new Promise(res => { const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.readAsDataURL(file); });
            const result = await apiCall('uploadFile', { base64: base64, filename: file.name });
            if (result && result.error) throw new Error("File Upload Failed: " + result.error);
            if(result && result.url) { fileUrl = result.url; fileName = result.name || file.name; }
        }

        let payloadToSend;
        if (replyComposerState.mode === 'DIFFERENT' && replyComposerState.recipients.length > 0) {
            payloadToSend = replyComposerState.recipients.map(r => {
                const tempId = "TEMP-" + Date.now() + "-" + Math.floor(Math.random() * 10000); // 🔥 FIX 1
                return {
                    caseId: caseId, text: (r.customText && r.customText.trim() !== '') ? r.customText.trim() : msgHTML, mentionType: r.type || 'Message', sender: currentUser.email, receiver: r.email, parentAskId: '', threadId: '', attachmentUrl: fileUrl, attachmentFileName: fileName,
                    uniqueId: tempId // 🔥 FIX 2
                };
            });
        } else {
            const tempId = "TEMP-" + Date.now() + "-" + Math.floor(Math.random() * 10000); // 🔥 FIX 1
            payloadToSend = { caseId: caseId, text: msgHTML, mentionType: replyComposerState.globalType || 'Message', sender: currentUser.email, receiver: replyComposerState.recipients.map(r => r.email).join(','), parentAskId: '', threadId: '', attachmentUrl: fileUrl, attachmentFileName: fileName, uniqueId: tempId }; // 🔥 FIX 2
        }

        // ⚡ 1. INSTANT LOCAL UI UPDATE (0ms lag)
        const localSenderName = currentUser.name || currentUser.email;
        const payloads = Array.isArray(payloadToSend) ? payloadToSend : [payloadToSend];
        payloads.forEach(p => {
             const tempId = p.uniqueId; // 🔥 FIX 3
             seenMessages.add(tempId); // 🔥 BONUS: Track to avoid duplication
             
             allLoadedComments.push({
                 caseId: p.caseId,
                 timestamp: new Date().getTime(),
                 sender: localSenderName,
                 receiver: p.receiver || '',
                 text: p.text,
                 attachmentUrl: p.attachmentUrl || '',
                 attachmentFileName: p.attachmentFileName || '',
                 type: p.mentionType,
                 askId: '', 
                 status: '',
                 parentAskId: p.parentAskId || '',
                 uniqueId: tempId, // 🔥 FIX 3
                 threadId: p.threadId || 'LOCAL-T-' + Math.random(),
                 threadColor: p.threadColor || '#f8fafc'
             });
        });

        // 2. Clear Composer UI Instantly
        inputDiv.innerHTML = ''; pendingReplyFiles = []; 
        if(document.getElementById('reply_file_list')) renderReplyFileList();
        replyComposerState = { recipients: [], mode: 'SAME', globalType: 'Message' }; window.setReplyGlobalType('Message');
        checkComposerRestrictions(document.getElementById('detail-reply-input'), 'main');
        
        // 3. Re-render the chat feed and scroll to bottom
        renderAllCommentsLocally();
        setTimeout(() => {
            const scrollArea = document.getElementById("detail-thread-container").parentElement;
            if(scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
        }, 50);

        // 4. NOW hit backend silently in background
        await apiCall('addNewComment', payloadToSend);

    } catch(e) { 
        showCustomDialog("Error", "Failed to post reply. Reason: \n" + (e.message || e), false); 
    } finally { 
        submitBtn.disabled = false; submitBtn.innerText = originalText; 
    }
};

window.toggleInlineReply = function(btn) {
    const container = btn.closest('[data-id="reply-container"]');
    const replyBox = container.querySelector('[data-id="inline-reply-box"]');
    if (replyBox.classList.contains('hidden')) {
        document.querySelectorAll('[data-id="inline-reply-box"]').forEach(box => box.classList.add('hidden'));
        inlinePendingFiles = [];
        activeInlineBox = replyBox;
        replyBox.classList.remove('hidden');
        replyBox.querySelector('.inline-file-list').innerHTML = '';
        
        const editor = replyBox.querySelector('.inline-reply-input');
        editor.innerHTML = '';
        checkComposerRestrictions(editor, 'inline'); // Apply Default Lock
        editor.focus();
    } else {
        replyBox.classList.add('hidden');
    }
};

window.handleInlineFileSelect = function(e, inputEl) {
    activeInlineBox = inputEl.closest('[data-id="inline-reply-box"]');
    if (!activeInlineBox.querySelector('.inline-reply-input').querySelector('.mention-badge')) {
        e.target.value = '';
        return showCustomDialog("Notice ⚠️", "Pehle kisi ko @mention karein tabhi attachment use kar sakte hain.", false);
    }
    Array.from(e.target.files).forEach(file => { 
        if(inlinePendingFiles.length >= 10) return; 
        if(!inlinePendingFiles.some(pf => pf.name === file.name)) inlinePendingFiles.push(file); 
    });
    renderInlineFileList(); inputEl.value = ''; 
};

function renderInlineFileList() {
    if(!activeInlineBox) return;
    activeInlineBox.querySelector('.inline-file-list').innerHTML = inlinePendingFiles.map((f, i) => `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] px-1.5 py-0.5 rounded flex gap-1 items-center font-bold shadow-sm">${f.name} <button type="button" onclick="removeInlineFile(${i})" class="text-indigo-400 hover:text-indigo-700 ml-1">&times;</button></span>`).join('');
}
window.removeInlineFile = function(index) { inlinePendingFiles.splice(index, 1); renderInlineFileList(); };

window.triggerInlineMention = function(btn) {
    activeInlineBox = btn.closest('[data-id="inline-reply-box"]');
    const editor = activeInlineBox.querySelector('.inline-reply-input');
    editor.focus();
    const sel = window.getSelection(); let range;
    if (sel.rangeCount > 0) range = sel.getRangeAt(0); else { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
    const textNode = document.createTextNode(' @');
    range.insertNode(textNode); range.setStartAfter(textNode); range.setEndAfter(textNode);
    sel.removeAllRanges(); sel.addRange(range);
    window.handleInlineTyping({target: editor}); 
};

window.handleInlineTyping = function(e) {
    activeInlineBox = e.target.closest('[data-id="inline-reply-box"]');
    const dropdown = activeInlineBox.querySelector('.inline-mention-dropdown');
    const editor = e.target;
    
    const sel = window.getSelection();
    if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        let text = '';
        if (range.startContainer.nodeType === Node.TEXT_NODE) { text = range.startContainer.textContent.substring(0, range.startOffset); } 
        else if (range.startContainer.nodeType === Node.ELEMENT_NODE) { text = range.startContainer.innerText ? range.startContainer.innerText.substring(0, range.startOffset) : ''; }

        const match = text.match(/(?:^|\s|\n|\u00A0)@([^\s]*)$/);
        if (match) { 
            inlineMentionSearchQuery = match[1].toLowerCase();
            inlineSavedRange = range.cloneRange(); 
            dropdown.classList.remove('hidden');
            const filtered = getFilteredUsersForMention(inlineMentionSearchQuery);
            dropdown.innerHTML = filtered.map(u => 
                `<div onclick="selectInlineMentionUser('${u.name.replace(/'/g, "\\'")}', '${u.email.replace(/'/g, "\\'")}')" class="p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 text-left">
                    <div class="text-xs font-bold text-slate-800 leading-tight">${u.name}</div>
                    <div class="text-[9px] text-slate-500 truncate mt-0.5">${u.email}</div>
                 </div>`
            ).join('');
            if(filtered.length === 0) {
                dropdown.innerHTML = `<div class="p-2 text-[10px] text-slate-400 font-bold uppercase text-center">No match</div>`;
            }
        } else { 
            dropdown.classList.add('hidden');
        }
    }
    
    checkComposerRestrictions(editor, 'inline');
};

window.selectInlineMentionUser = function(name, email) {
    if(!activeInlineBox) return;
    const dropdown = activeInlineBox.querySelector('.inline-mention-dropdown');
    const emailLower = email.toLowerCase(); const nameLower = name.toLowerCase();
    const isAdmin = currentCaseAdmins.some(a => {
        const aLower = a.toLowerCase();
        return aLower === emailLower || aLower === nameLower || aLower.includes(nameLower) || nameLower.includes(aLower);
    });
    const isUser = currentCaseUsers.some(u => {
        const uLower = u.toLowerCase();
        return uLower === emailLower || uLower === nameLower || uLower.includes(nameLower) || nameLower.includes(uLower);
    });
    const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
    
    if (isAdmin || isCreator) { window.finalizeInlineMention(name, email, 'Admin'); }
    else if (isUser) { window.finalizeInlineMention(name, email, 'User'); }
    else {
        if (!window.currentCaseHasAdminRights) {
            showCustomDialog("Action Blocked", "Only Case Admins can add new members to this thread.", false);
            dropdown.classList.add('hidden');
            return;
        }
        dropdown.innerHTML = `
          <div class="bg-slate-800 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-wider">Role for ${name}</div>
          <div onclick="finalizeInlineMention('${name}', '${email}', 'Admin')" class="p-2 hover:bg-blue-50 cursor-pointer border-b text-xs font-bold text-blue-700">👑 Admin</div>
          <div onclick="finalizeInlineMention('${name}', '${email}', 'User')" class="p-2 hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-700">👤 User</div>`;
    }
};

window.finalizeInlineMention = function(name, email, role) {
    if(!activeInlineBox) return;

    const emailLower = email.toLowerCase();
    const nameLower = name.toLowerCase();
    const isAdmin = currentCaseAdmins.some(a => a.toLowerCase() === emailLower || a.toLowerCase() === nameLower);
    const isUser = currentCaseUsers.some(u => u.toLowerCase() === emailLower || u.toLowerCase() === nameLower);
    const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
    if (!isAdmin && !isUser && !isCreator) {
        if (role === 'Admin') currentCaseAdmins.push(email);
        else currentCaseUsers.push(email);

        if (!window.currentCaseAllMembers) window.currentCaseAllMembers = [];
        window.currentCaseAllMembers.push(email);

        const detAdm = document.getElementById('detail-admins');
        const detUsr = document.getElementById('detail-users');
        const shortName = email.split('@')[0];
        const badgeHtml = `<span class="px-2 py-0.5 ${role === 'Admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'} border text-[10px] rounded font-bold shadow-sm">${role === 'Admin' ? '👑' : '👤'} ${shortName}</span>`;

        if (role === 'Admin') detAdm.insertAdjacentHTML('afterbegin', badgeHtml);
        else detUsr.insertAdjacentHTML('afterbegin', badgeHtml);

        const convId = document.getElementById('detail-conv-id').value;
        apiCall('updateCaseMembers', { id: convId, admins: currentCaseAdmins, users: currentCaseUsers }).catch(e => console.error("Error updating members:", e));
    }

    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(inlineSavedRange);
    const textNode = inlineSavedRange.startContainer;
    inlineSavedRange.setStart(textNode, textNode.textContent.lastIndexOf('@', inlineSavedRange.startOffset - 1)); 
    inlineSavedRange.deleteContents(); 
    
    const badge = document.createElement('span'); badge.contentEditable = "false";
    badge.className = `mention-badge mx-1 shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold ${role === 'Admin' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-800'}`;
    badge.dataset.email = email; badge.innerHTML = `@${name}`;
    
    inlineSavedRange.insertNode(badge); inlineSavedRange.setStartAfter(badge); 
    inlineSavedRange.insertNode(document.createTextNode('\u00A0')); 
    inlineSavedRange.setStartAfter(badge.nextSibling);
    
    activeInlineBox.querySelector('.inline-mention-dropdown').classList.add('hidden');
    
    checkComposerRestrictions(activeInlineBox.querySelector('.inline-reply-input'), 'inline');
};

// ⚡ COMPLETELY OPTIMISTIC INLINE SUBMIT
window.submitInlineReply = async function(btn) {
    const container = btn.closest('[data-id="reply-container"]'); const replyBox = container.querySelector('[data-id="inline-reply-box"]');
    const inputDiv = replyBox.querySelector('.inline-reply-input');
    const msgHTML = inputDiv.innerHTML.trim();

    if (!inputDiv.querySelector('.mention-badge')) {
        return showCustomDialog("Notice", "You must select someone using @ before sending a reply.", false);
    }
    
    if(!msgHTML && inlinePendingFiles.length === 0) return showCustomDialog("Notice", "Please write a message or attach a file.", false);
    const caseId = document.getElementById('detail-conv-id').value;
    
    const toggleBtn = container.querySelector('.inline-reply-toggle-btn');
    const typeVal = replyBox.querySelector('.inline-type-val').value;
    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = '...';
    try {
        let fileUrl = '';
        let fileName = '';
        if(inlinePendingFiles.length > 0) { 
            const file = inlinePendingFiles[0];
            const base64 = await new Promise(res => { const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.readAsDataURL(file); });
            const result = await apiCall('uploadFile', { base64: base64, filename: file.name });
            if (result && result.error) throw new Error("Upload Failed: " + result.error);
            if(result && result.url) { fileUrl = result.url; fileName = result.name || file.name; }
        }

        const tempId = "TEMP-" + Date.now() + "-" + Math.floor(Math.random() * 10000); // 🔥 FIX 1
        const payload = { caseId: caseId, text: msgHTML, mentionType: typeVal, sender: currentUser.email, parentAskId: toggleBtn?toggleBtn.getAttribute('data-askid'):'', threadId: toggleBtn?toggleBtn.getAttribute('data-threadid'):'', threadColor: toggleBtn?toggleBtn.getAttribute('data-threadcolor'):'', attachmentUrl: fileUrl, attachmentFileName: fileName, uniqueId: tempId }; // 🔥 FIX 2

        // ⚡ 1. INSTANT LOCAL UI RENDER
        const localSenderName = currentUser.name || currentUser.email;
        seenMessages.add(tempId); // 🔥 BONUS: Track to avoid duplication
        
        allLoadedComments.push({
             caseId: caseId,
             timestamp: new Date().getTime(),
             sender: localSenderName,
             receiver: '', 
             text: msgHTML,
             attachmentUrl: fileUrl,
             attachmentFileName: fileName,
             type: typeVal,
             askId: '', 
             status: '',
             parentAskId: payload.parentAskId,
             uniqueId: tempId, // 🔥 FIX 3
             threadId: payload.threadId || 'LOCAL-T-' + Math.random(),
             threadColor: payload.threadColor || '#f8fafc'
         });

        // 2. Clear UI instantly
        inputDiv.innerHTML = ''; inlinePendingFiles = []; replyBox.querySelector('.inline-file-list').innerHTML = ''; replyBox.classList.add('hidden');
        
        // 3. Render feed instantly
        renderAllCommentsLocally();

        // 4. Send to backend silently
        await apiCall('addNewComment', payload);
        
    } catch(e) { 
        showCustomDialog("Error", "Failed to post inline reply.\n" + (e.message || e), false); 
    } finally {
        btn.disabled = false; btn.innerText = originalText;
    }
};

// ==========================================
// CREATE NEW CASE MODAL & UPLOADS
// ==========================================
async function fetchUsersForMentions() { try { allUsersList = await apiCall('getUsers'); populateFilterDropdowns(); } catch(e) {} }
window.handleFileSelect = function(e) { addFiles(e.target.files); }; 
window.handleDrop = function(e) { e.preventDefault(); addFiles(e.dataTransfer.files); }; 
function addFiles(files) { Array.from(files).forEach(file => { if(pendingFiles.length >= 10) return; if(!pendingFiles.some(pf => pf.name === file.name)) pendingFiles.push(file); }); renderFileList(); } 
function renderFileList() { document.getElementById('file_list').innerHTML = pendingFiles.map((f, i) => `<span class="bg-slate-200 text-xs px-2 py-1 rounded flex gap-1 items-center font-medium">${f.name} <button type="button" onclick="removeFile(${i})" class="text-red-500 hover:text-red-700 font-bold ml-1">&times;</button></span>`).join(''); } 
window.removeFile = function(index) { pendingFiles.splice(index, 1); renderFileList(); };

async function loadLabelsForForm() { availableLabels = await apiCall('getLabels'); renderLabels(); populateFilterDropdowns(); } 
function renderLabels() { document.getElementById('labels_container').innerHTML = availableLabels.map(label => `<span onclick="toggleLabel('${label}')" class="cursor-pointer px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm border ${selectedLabels.has(label) ? 'bg-green-800 text-white border-green-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${label}</span>`).join(''); } 
window.toggleLabel = function(label) { selectedLabels.has(label) ? selectedLabels.delete(label) : selectedLabels.add(label); renderLabels(); }; 
window.createNewLabel = async function() { const val = document.getElementById('new_label_input').value.trim(); if(!val) return; await apiCall('addLabel', {label: val}); availableLabels.push(val); selectedLabels.add(val); document.getElementById('new_label_input').value = ''; renderLabels(); populateFilterDropdowns(); };

window.openModal = function() { document.getElementById('appModal').classList.remove('hidden'); pendingFiles = []; renderFileList(); document.getElementById('f_message_plain').value = ''; document.getElementById('new_case_member_search').value = ''; composerRecipients = []; composerRecipients.push({ name: currentUser.name || currentUser.email, email: currentUser.email, role: 'Admin' }); window.renderNewCaseMembers(); }; 
window.closeModal = function() { document.getElementById('appModal').classList.add('hidden'); document.getElementById('convForm').reset(); };

window.handleFormSubmit = async function(e) { 
    e.preventDefault(); const btn = document.getElementById('submitBtn'); btn.disabled = true; btn.innerText = 'Uploading...';
    try {
        let fileUrls = [];
        if(pendingFiles.length > 0) { 
            for(let file of pendingFiles) { 
                const base64 = await new Promise(res => { const reader = new FileReader(); reader.onload = ev => res(ev.target.result); reader.readAsDataURL(file); });
                const result = await apiCall('uploadFile', { base64: base64, filename: file.name });
                if(result && result.url) fileUrls.push(result.url);
            } 
        } 
        const payload = { createdBy: currentUser.email || currentUser.name, subject: document.getElementById('f_subject').value, details: document.getElementById('f_details').value, message: document.getElementById('f_message_plain').value || '', labels: Array.from(selectedLabels), adminEmails: composerRecipients.filter(r => r.role === 'Admin').map(r => r.email), userEmails: composerRecipients.filter(r => r.role === 'User').map(r => r.email), attachments: fileUrls };
        await apiCall('createCase', payload); window.closeModal(); loadConversations(); 
    } catch(err) { showCustomDialog("Error", "Failed to create case.\n" + err.toString(), false); } finally { btn.disabled = false; btn.innerText = 'Post Case'; } 
};

// ==========================================
// LOAD CONVERSATIONS (DASHBOARD FEED)
// ==========================================
async function loadConversations() {
  const feed = document.getElementById('conversationFeed');
  if(!feed) return;
  try {
    allCasesData = await apiCall('getConversations', currentUser); feed.innerHTML = '';
    if(allCasesData.length === 0) { feed.innerHTML = `<p class="text-center py-10 text-slate-500 font-medium">No cases found.</p>`; return; }
    const uEmail = (currentUser.email || '').toLowerCase(); const uName = (currentUser.name || '').toLowerCase();
    const fragment = document.createDocumentFragment();
    
    allCasesData.forEach(conv => {
      const cardTemp = document.getElementById('cardTemplate');
      if(!cardTemp) return;
      const card = cardTemp.content.cloneNode(true); const cardDiv = card.querySelector('div');
      const hasAdminRights = conv.createdBy.toLowerCase().includes(uEmail) || conv.createdBy.toLowerCase().includes(uName) || conv.admins.some(a => a.toLowerCase().includes(uEmail) || a.toLowerCase().includes(uName));
      
      let safeSnoozeMs = 0;
      if (conv.snoozeTime) {
          safeSnoozeMs = (typeof conv.snoozeTime === 'string' && conv.snoozeTime.includes('T')) 
              ? new Date(conv.snoozeTime).getTime() 
              : parseInt(conv.snoozeTime, 10) || 0;
      }

      cardDiv._cachedLabels = conv.labels; cardDiv._cachedMembers = [...conv.admins, ...conv.users, conv.createdBy];
      
      cardDiv.dataset.convId = conv.id; cardDiv.dataset.status = conv.status; cardDiv.dataset.snooze = safeSnoozeMs; cardDiv.dataset.hasAdminRights = hasAdminRights; cardDiv.dataset.attachmentsData = JSON.stringify(conv.attachments); cardDiv.dataset.labels = JSON.stringify(conv.labels); cardDiv.dataset.members = JSON.stringify([...conv.admins, ...conv.users, conv.createdBy]); cardDiv.dataset.caseAdmins = JSON.stringify(conv.admins); cardDiv.dataset.caseUsers = JSON.stringify(conv.users);
      card.querySelector('[data-id="conv-id"]').textContent = conv.id; card.querySelector('[data-id="subject"]').textContent = conv.subject; card.querySelector('[data-id="details"]').textContent = conv.details; card.querySelector('[data-id="message"]').innerHTML = conv.message; card.querySelector('[data-id="author"]').textContent = conv.createdBy; card.querySelector('[data-id="timestamp"]').textContent = new Date(conv.timestamp).toLocaleDateString(); card.querySelector('[data-id="display-case-id"]').textContent = conv.id;
      
      const isSnoozed = safeSnoozeMs > Date.now(); 
      const badge = card.querySelector('[data-id="status-badge"]');
      badge.className = "text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-widest shadow-sm";
      
      if(conv.status === 'Archived') { badge.classList.add('bg-emerald-700','text-white'); badge.innerText = "ARCHIVED"; } else if(isSnoozed) { badge.classList.add('bg-orange-100','text-orange-700'); badge.innerText = "SNOOZED"; } else { badge.classList.add('bg-emerald-500','text-white'); badge.innerText = "ACTIVE"; }
      
      const footerActions = card.querySelector('.flex.items-center.gap-3.text-sm'); const cbContainer = footerActions.querySelector('.archive-cb-container'); const snoozeBtn = footerActions.querySelector('.snooze-card-btn'); const unsnoozeBtn = footerActions.querySelector('.unsnooze-card-btn'); const unarchiveBtn = footerActions.querySelector('.unarchive-card-btn'); const checkbox = footerActions.querySelector('.bulk-archive-cb');
      cbContainer.classList.add('hidden'); cbContainer.classList.remove('flex'); snoozeBtn.classList.add('hidden'); unsnoozeBtn.classList.add('hidden'); unarchiveBtn.classList.add('hidden');
      
      if (hasAdminRights) { if (conv.status === 'Archived') { unarchiveBtn.classList.remove('hidden'); } else if (isSnoozed) { unsnoozeBtn.classList.remove('hidden'); } }
      if (currentTab === 'Live' && conv.status !== 'Archived' && !isSnoozed) { cbContainer.classList.remove('hidden'); cbContainer.classList.add('flex'); checkbox.disabled = false; snoozeBtn.classList.remove('hidden'); }
      
      const lCont = card.querySelector('[data-id="labels-container"]'); conv.labels.forEach(l => { if(l){ const s = document.createElement('span'); s.className='px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded font-bold'; s.innerText=l; lCont.appendChild(s); } });
      const admCont = card.querySelector('[data-id="admins-container"]'); const usrCont = card.querySelector('[data-id="users-container"]');
      conv.admins.forEach(a => { if(a) admCont.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${a.split('@')[0]}</span>`; });
      conv.users.forEach(u => { if(u) usrCont.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${u.split('@')[0]}</span>`; });
      fragment.appendChild(card);
    });
    
    feed.appendChild(fragment); window.switchTab(currentTab); 
  } catch(e) { console.error(e); }
}

let deferredPrompt = null; 
const installBtn = document.getElementById('installAppBtn');

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

if (installBtn && isMobileDevice()) {
    installBtn.classList.remove('hidden');
}

window.addEventListener('beforeinstallprompt', (e) => { 
    e.preventDefault(); 
    deferredPrompt = e; 
    if (installBtn && isMobileDevice()) {
        installBtn.classList.remove('hidden');
    }
});

if (installBtn) { 
    installBtn.addEventListener('click', async () => { 
        if (deferredPrompt) { 
            deferredPrompt.prompt(); 
            deferredPrompt = null; 
            installBtn.classList.add('hidden'); 
        } else {
            showCustomDialog("Install CaseSys 📱", "Click 3-dots (⋮) and select 'Add to Home screen'.", false);
        }
    }); 
}

window.addEventListener('appinstalled', () => { 
    if (installBtn) { 
        installBtn.classList.add('hidden'); 
        installBtn.classList.remove('flex'); 
    } 
    console.log('CaseSys has been installed!');
});

window.addEventListener('online', async () => {
    const requests = await getOfflineRequests();
    if (requests.length > 0) {
        let successCount = 0;
        for (const req of requests) { 
            try { 
                await fetch(API_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
                    body: JSON.stringify({ action: req.action, params: req.params }) 
                }); 
                await deleteOfflineRequest(req.id); 
                successCount++; 
            } catch (err) { console.error("Sync failed:", err); } 
        }
        if (successCount > 0) { 
            if(currentUser) loadConversations(); 
            showCustomDialog("Sync Complete", `${successCount} items synced!`, false); 
        }
    }
});

window.addEventListener('offline', () => {
    console.log("You are now offline. Actions will be queued.");
});
