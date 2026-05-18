// ==========================================
// 🔒 UI PROTECTION STATE & GLOBAL HELPERS
// ==========================================
window.normalizeCaseId = function(id) {
    return String(id || '')
        .trim()
        .replace(/\s+/g, '') // Removes accidental spaces
        .toUpperCase();      // Strict uppercase match
};

window.isUserTypingGlobal = false;
let activeInputElement = null;
document.addEventListener('focusin', (e) => {
if (e.target && (
e.target.id === 'detail-reply-input' ||
e.target.classList?.contains('inline-reply-input') ||
e.target.tagName === 'TEXTAREA' ||
e.target.tagName === 'INPUT' ||
e.target.id === 'f_details_rich' ||
e.target.id === 'f_message_rich' ||
e.target.id === 'edit_details_rich'
)) {
window.isUserTypingGlobal = true;
activeInputElement = e.target;
}
});
document.addEventListener('focusout', (e) => {
if (e.target && (
e.target.id === 'detail-reply-input' ||
e.target.classList?.contains('inline-reply-input') ||
e.target.tagName === 'TEXTAREA' ||
e.target.tagName === 'INPUT' ||
e.target.id === 'f_details_rich' ||
e.target.id === 'f_message_rich' ||
e.target.id === 'edit_details_rich'
)) {
setTimeout(() => {
window.isUserTypingGlobal = false;
activeInputElement = null;
}, 200);
}
});

// ==========================================
// 🔥 AUTO UPDATE SYSTEM (VERSION CONTROL)
// ==========================================
const APP_VERSION = "v36";
function checkAppUpdate() {
const storedVersion = localStorage.getItem("app_version");
if (!storedVersion) {
localStorage.setItem("app_version", APP_VERSION);
return;
}
if (storedVersion !== APP_VERSION) {
console.log("🔄 New version detected");
localStorage.setItem("app_version", APP_VERSION);
setTimeout(() => {
  if (!window.isUserTypingGlobal) {
      window.location.reload(true);
  } else {
      console.log("⛔ App update delayed (user typing)");
  }
}, 500);
}
}
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
  if (data.receiver && currentUser?.email) {
      const receivers = data.receiver.split(',').map(e => e.toLowerCase().trim());
      const myEmail = currentUser.email.toLowerCase().trim();
      if (!receivers.includes(myEmail)) {
          return; 
      }
  }

  let title = data.title || "Case Update";
  let body = data.body || "";
  const caseId = data.caseId || "";

  if (!body || body.trim() === "") return;

  if (typeof addNotification === "function") {
    addNotification(data);
  }

  if (typeof showToast === "function") {
    showToast(title, body, caseId);
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
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, params: params }),
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
// STATE VARIABLES
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
let isInitialLoadDone = false;
let allLoadedComments = [];

// ==========================================
// 🔥 CASE OPEN PROTECTION
// ==========================================
let isOpeningCase = false;
let currentOpenRequest = null;
window.isOpeningDetailView = false;

// ==========================================
// 🚀 ADVANCED CHUNKED UPLOADER & BEAUTIFUL FILE CARDS
// ==========================================
function formatSize(bytes){
if(!bytes) return "0 KB";
const kb = bytes / 1024;
if(kb < 1024) return kb.toFixed(1) + " KB";
return (kb / 1024).toFixed(1) + " MB";
}
window.createBeautifulFileCard = function(file, index, removeFnName) {
let previewHTML = '';
if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    previewHTML = `<img src="${url}" class="w-full h-full object-cover">`;
} else if (file.type.startsWith('video/')) {
    previewHTML = `<div class="w-full h-full bg-slate-800 flex items-center justify-center"><i class="fas fa-play text-white/70 text-xs"></i></div>`;
} else {
    previewHTML = `<i class="fas fa-file-alt text-indigo-400 text-xl"></i>`;
}

return `
    <div class="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-2 pr-8 relative shadow-sm w-60 max-w-full hover:border-indigo-300 transition-colors group">
        <div class="w-10 h-10 rounded-lg bg-slate-50 shrink-0 flex items-center justify-center overflow-hidden border border-slate-100">
            ${previewHTML}
        </div>
        <div class="flex flex-col min-w-0 flex-1">
            <span class="text-xs font-bold text-slate-800 truncate block">${file.name}</span>
            <span class="text-[10px] font-semibold text-slate-400 mt-0.5">${formatSize(file.size)}</span>
        </div>
        <button type="button" onclick="${removeFnName}(${index})" class="absolute top-2 right-2 w-5 h-5 bg-slate-100 hover:bg-red-500 text-slate-600 hover:text-white rounded-full flex items-center justify-center text-[10px] transition-all cursor-pointer opacity-80 hover:opacity-100 shadow-sm" title="Remove File">
            <i class="fas fa-times"></i>
        </button>
    </div>
`;
};
window.cancelUploadFlags = {};
function showUploadOverlay(title, filesArray) {
document.getElementById('globalUploadTitle').innerText = title || 'Processing...';
document.getElementById('globalUploadText').innerText = filesArray ? `0 of ${filesArray.length} Files Uploaded` : 'Starting...';
if(document.getElementById('globalUploadBar')) document.getElementById('globalUploadBar').parentElement.style.display = 'none';
if(document.getElementById('globalUploadSize')) document.getElementById('globalUploadSize').style.display = 'none';

const overlay = document.getElementById('globalUploadOverlay');
if (overlay) {
    let listContainer = document.getElementById('customUploadProgressList');
    if (!listContainer) {
        listContainer = document.createElement('div');
        listContainer.id = 'customUploadProgressList';
        listContainer.className = 'flex flex-col gap-2 max-h-48 overflow-y-auto w-full mt-4 pr-1';
        
        let cancelAllBtn = document.createElement('button');
        cancelAllBtn.id = 'customUploadCancelAllBtn';
        cancelAllBtn.className = 'mt-4 w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors border border-slate-200';
        cancelAllBtn.innerText = 'Cancel All Remaining';
        cancelAllBtn.onclick = window.cancelAllUploads;

        const sizeEl = document.getElementById('globalUploadSize');
        if (sizeEl && sizeEl.parentElement) {
            sizeEl.parentElement.appendChild(listContainer);
            sizeEl.parentElement.appendChild(cancelAllBtn);
        } else {
            const contentBox = overlay.querySelector('.bg-white') || overlay.firstElementChild || overlay;
            contentBox.appendChild(listContainer);
            contentBox.appendChild(cancelAllBtn);
        }
    }
    
    let html = '';
    window.cancelUploadFlags = {};
    if (filesArray && filesArray.length > 0) {
        filesArray.forEach((f, i) => {
            window.cancelUploadFlags[i] = false;
            html += `
            <div id="upload-item-${i}" class="flex items-center justify-between p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-left relative overflow-hidden">
                <div id="upload-bg-${i}" class="absolute left-0 top-0 bottom-0 bg-indigo-50/50 transition-all w-0"></div>
                <div class="flex-1 min-w-0 pr-3 relative z-10">
                    <div class="text-[11px] font-bold text-slate-700 truncate">${f.name}</div>
                    <div class="w-full bg-slate-200 rounded-full h-1.5 mt-1.5 overflow-hidden shadow-inner">
                        <div id="upload-bar-${i}" class="bg-indigo-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
                    </div>
                    <div class="flex justify-between items-center mt-1">
                        <div id="upload-status-${i}" class="text-[9px] text-slate-500 font-bold uppercase tracking-wide">Waiting in queue...</div>
                        <div id="upload-pct-${i}" class="text-[9px] text-indigo-600 font-bold">0%</div>
                    </div>
                </div>
                <button id="upload-cancel-${i}" onclick="cancelSpecificUpload(${i})" class="relative z-10 w-7 h-7 shrink-0 bg-white border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 rounded-full flex items-center justify-center text-xs transition-all shadow-sm" title="Cancel this file">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        });
    }
    listContainer.innerHTML = html;
    const btnAll = document.getElementById('customUploadCancelAllBtn');
    if(btnAll) btnAll.style.display = (filesArray && filesArray.length > 0) ? 'block' : 'none';
    
    overlay.classList.remove('hidden'); 
    overlay.classList.add('flex');
}
}
window.cancelSpecificUpload = function(index) {
window.cancelUploadFlags[index] = true;
const statusEl = document.getElementById(`upload-status-${index}`);
if(statusEl) {
statusEl.innerText = "CANCELED ❌";
statusEl.className = "text-[9px] text-red-500 font-bold uppercase tracking-wide";
}
const bar = document.getElementById(`upload-bar-${index}`);
if(bar) bar.classList.replace('bg-indigo-500', 'bg-red-500');
const pct = document.getElementById(`upload-pct-${index}`);
if(pct) { pct.innerText = "X"; pct.classList.replace('text-indigo-600', 'text-red-500'); }
const btn = document.getElementById(`upload-cancel-${index}`);
if(btn) btn.classList.add('hidden');
};
window.cancelAllUploads = function() {
Object.keys(window.cancelUploadFlags).forEach(k => {
if(!window.cancelUploadFlags[k] && document.getElementById(`upload-status-${k}`) && document.getElementById(`upload-status-${k}`).innerText !== 'COMPLETED ✅') {
window.cancelSpecificUpload(k);
}
});
};
function hideUploadOverlay() {
const overlay = document.getElementById('globalUploadOverlay');
if (overlay) { overlay.classList.add('hidden'); overlay.classList.remove('flex'); }
}
async function uploadFileResumable(file, fileIndex, onProgress) {
if (typeof fileIndex === 'function') {
onProgress = fileIndex;
fileIndex = -1;
}
const uploadUrl = await apiCall('getResumableUploadUrl', { fileName: file.name, mimeType: file.type });
const chunkSize = 2097152;
let start = 0;
return new Promise((resolve, reject) => {
    function uploadNext() {
        if (fileIndex >= 0 && window.cancelUploadFlags[fileIndex]) return reject(new Error("Canceled"));
        
        let end = Math.min(start + chunkSize, file.size) - 1;
        let blob = file.slice(start, end + 1);
        let reader = new FileReader();
        
        reader.onload = async function(e) {
            if (fileIndex >= 0 && window.cancelUploadFlags[fileIndex]) return reject(new Error("Canceled"));
            
            let base64Data = e.target.result.split(",")[1];
            let percent = Math.round(((end + 1) / file.size) * 100);
            if(onProgress) onProgress(percent, end + 1, file.size);

            try {
                let res = await apiCall('uploadChunkToDrive', {
                    uploadUrl: uploadUrl, base64Data: base64Data, start: start, end: end, totalSize: file.size
                });
                
                if (res.status === "incomplete") {
                    start = end + 1;
                    uploadNext();
                } else if (res.status === "done") {
                    let pUrl = `https://drive.google.com/file/d/${res.fileId}/view`;
                    if(file.type.startsWith('video/')) pUrl = `https://drive.google.com/file/d/${res.fileId}/preview`;
                    else if(file.type.startsWith('image/')) pUrl = `https://drive.google.com/thumbnail?id=${res.fileId}&sz=w2000`;
                    resolve({ url: pUrl, name: file.name, id: res.fileId });
                }
            } catch(err) { reject(err); }
        };
        reader.readAsDataURL(blob);
    }
    uploadNext();
});
}
async function uploadMultipleFilesResumable(filesArray) {
let uploadedData = [];
for (let i = 0; i < filesArray.length; i++) {
if (window.cancelUploadFlags[i]) continue;
    const file = filesArray[i];
    const statusEl = document.getElementById(`upload-status-${i}`);
    if (statusEl) {
        statusEl.innerText = "Uploading...";
        statusEl.classList.replace('text-slate-500', 'text-indigo-600');
    }
    
    try {
        const result = await uploadFileResumable(file, i, (percent, loaded, total) => {
            const bar = document.getElementById(`upload-bar-${i}`);
            if(bar) bar.style.width = `${percent}%`;
            const bg = document.getElementById(`upload-bg-${i}`);
            if(bg) bg.style.width = `${percent}%`;
            const pct = document.getElementById(`upload-pct-${i}`);
            if(pct) pct.innerText = `${percent}%`;
            
            const globalText = document.getElementById('globalUploadText');
            if (globalText) globalText.innerText = `Uploading File ${i + 1} of ${filesArray.length}...`;
        });
        
        if (result && result.url) {
            uploadedData.push({ url: result.url, name: result.name });
            if (statusEl) {
                statusEl.innerText = "COMPLETED ✅";
                statusEl.className = "text-[9px] text-green-600 font-bold uppercase tracking-wide";
            }
            const bar = document.getElementById(`upload-bar-${i}`);
            if (bar) bar.classList.replace('bg-indigo-500', 'bg-green-500');
            const pct = document.getElementById(`upload-pct-${i}`);
            if (pct) { pct.innerText = "100%"; pct.classList.replace('text-indigo-600', 'text-green-600'); }
            const btn = document.getElementById(`upload-cancel-${i}`);
            if (btn) btn.classList.add('hidden');
        }
    } catch(e) {
        if (statusEl) {
            statusEl.innerText = e.message === "Canceled" ? "CANCELED ❌" : "FAILED ⚠️";
            statusEl.className = "text-[9px] text-red-500 font-bold uppercase tracking-wide";
        }
        const bar = document.getElementById(`upload-bar-${i}`);
        if (bar) bar.classList.replace('bg-indigo-500', 'bg-red-500');
        const pct = document.getElementById(`upload-pct-${i}`);
        if (pct) { pct.innerText = "Error"; pct.classList.replace('text-indigo-600', 'text-red-500'); }
        const btn = document.getElementById(`upload-cancel-${i}`);
        if (btn) btn.classList.add('hidden');
    }
}
return uploadedData;
}

// ==========================================
// 🔥 GLOBAL UNREAD FETCHER & NOTIFICATIONS
// ==========================================
let notifications = [];
let unreadCount = 0;
let globalNotifInterval = null;
let locallySeenNotifications = new Set();
const tingSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function addNotification(msg) {
if (msg.status && String(msg.status).toLowerCase().trim() === 'closed') return;
if (msg.seen && currentUser?.email && msg.type !== 'Ask') {
const seenArr = String(msg.seen).toLowerCase().split(',').map(e => e.trim());
const myEmail = currentUser.email.toLowerCase().trim();
if (seenArr.includes(myEmail)) return;
}
if (msg.sender && currentUser?.email && msg.sender.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) return;
if (msg.sender && currentUser?.name && msg.sender.toLowerCase().trim() === currentUser.name.toLowerCase().trim()) return;
if (msg.receiver && currentUser?.email) {
const receivers = msg.receiver.split(',').map(e => e.toLowerCase().trim());
const myEmail = currentUser.email.toLowerCase().trim();
if (!receivers.includes(myEmail)) return;
}
const activeCaseId = document.getElementById('detail-conv-id')?.value;
const isCaseViewOpen = document.getElementById('caseDetailView') && !document.getElementById('caseDetailView').classList.contains('hidden');
const msgCaseId = msg.caseId || msg.id || "";
if (isCaseViewOpen && window.normalizeCaseId(activeCaseId) === window.normalizeCaseId(msgCaseId) && msg.type !== 'Ask') return;
let cleanText = msg.text || msg.body || "New activity on your case";
cleanText = String(cleanText).replace(/<[^>]*>?/gm, '');
cleanText = cleanText.replace(/ /gi, ' ').replace(/\s+/g, ' ').trim();
const notifId = msg.uniqueId || (msgCaseId + "" + msg.timestamp + "" + msg.sender);
if (locallySeenNotifications.has(notifId)) return;
if (notifications.some(n => n.id === notifId)) return;
const notif = {
id: notifId,
text: cleanText,
caseId: msgCaseId,
sender: msg.sender || msg.title || "System",
time: msg.timestamp || Date.now(),
type: msg.type || 'Message',
askId: msg.askId || msg.parentAskId || '',
status: msg.status || ''
};
notifications.unshift(notif);
unreadCount++;
tingSound.play().catch(e => console.log("Sound blocked"));
updateNotificationUI();
}

function updateNotificationUI() {
const countEl = document.getElementById("notifCount");
if (countEl) {
if (unreadCount > 0) {
countEl.innerText = unreadCount > 99 ? '99+' : unreadCount;
countEl.classList.remove("hidden");
countEl.classList.add("scale-110");
setTimeout(() => countEl.classList.remove("scale-110"), 200);
} else {
countEl.classList.add("hidden");
}
}
const panel = document.getElementById("notifPanel");
if (panel) {
if (notifications.length === 0) {
panel.innerHTML = `<div class="p-5 text-center text-sm text-slate-500 font-medium w-72 sm:w-80">No new notifications</div>`;
} else {
panel.innerHTML = `<div class="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50 sticky top-0 z-10 w-72 sm:w-80"> <span class="font-extrabold text-sm text-slate-800">Notifications</span> <button type="button" onclick="clearAllNotifications()" class="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 px-2 py-1 rounded-md">Clear All</button> </div> <div class="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto w-72 sm:w-80"> ${notifications.map(n => `
<div class="p-4 hover:bg-slate-50 cursor-pointer transition-colors" onclick="openFromNotification('${n.caseId}', '${n.id}')">
<div class="flex justify-between items-start mb-1"><span class="font-bold text-sm text-slate-800">${escapeHTML(window.getUserNameByEmail(n.sender))}</span><span class="text-[10px] text-slate-400 font-medium">${new Date(n.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
<div class="text-xs text-slate-600 line-clamp-2 leading-relaxed">${escapeHTML(n.text)}</div>
</div>
`).join("")} </div>`;
}
}
}

function toggleNotifications(event) {
if(event) event.stopPropagation();
const panel = document.getElementById("notifPanel");
if (panel) {
panel.classList.toggle("hidden");
if (!panel.classList.contains("hidden")) {
unreadCount = 0;
updateNotificationUI();
}
}
}

window.openFromNotification = async function(caseId, uniqueId) {
  if (isOpeningCase) return;
  isOpeningCase = true;

  try {
    const panel = document.getElementById("notifPanel");
    if (panel) panel.classList.add("hidden");

    if (!caseId || caseId === 'undefined') {
      showCustomDialog("Notice", "Case ID missing hai.", false);
      return;
    }

    const cleanCaseId = window.normalizeCaseId(caseId);

    await new Promise(r => setTimeout(r, 150));

    const card = [...document.querySelectorAll('[data-conv-id]')]
      .find(el => window.normalizeCaseId(el.dataset.convId) === cleanCaseId);

    if (uniqueId) {
      const notif = notifications.find(n => n.id === uniqueId);
      if (notif && notif.type !== 'Ask') {
        locallySeenNotifications.add(uniqueId);
      }
    }

    notifications = notifications.filter(n => n.id !== uniqueId || n.type === 'Ask');
    unreadCount = notifications.length;
    updateNotificationUI();

    if (uniqueId && currentUser?.email) {
      apiCall('markSeen', {
        notificationId: uniqueId,
        userEmail: currentUser.email,
        userName: currentUser.name || currentUser.email
      }).catch(e => console.log(e));
    }

    if (!card) {
      showCustomDialog("Loading...", "Case is still loading in dashboard. Please wait 1 second and try again.", false);
      return;
    }

    const requestId = Date.now();
    currentOpenRequest = requestId;
    await window.openCaseDetail(card);
    if (currentOpenRequest !== requestId) return;

  } catch (err) {
    console.error("Notification Open Error:", err);
    showCustomDialog("Error", "Failed to load case properly.", false);
  } finally {
    setTimeout(() => {
      isOpeningCase = false;
    }, 300);
  }
};

function clearAllNotifications() {
notifications = notifications.filter(n => n.type === 'Ask');
unreadCount = notifications.length;
updateNotificationUI();
}

async function fetchGlobalNotifications() {
if (window.isOpeningDetailView) return;
if(!currentUser || !currentUser.email) return;
try {
const unread = await apiCall('getUnreadNotifications', { reqUserEmail: currentUser.email });
if(unread && unread.length > 0) unread.reverse().forEach(msg => addNotification(msg));
} catch(e) {}
}

document.addEventListener('click', function(e) {
const panel = document.getElementById('notifPanel');
const wrapper = document.getElementById('notifWrapper');
if (panel && !panel.classList.contains('hidden') && wrapper && !wrapper.contains(e.target)) {
panel.classList.add('hidden');
}
});

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
const micBtns = container.querySelectorAll('#mic-btn, .inline-mic-btn');

if (hasMention) {
    if(attachLabel) attachLabel.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    if(attachInput) attachInput.disabled = false;
    if(submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
    formatBtns.forEach(b => { b.disabled = false; b.classList.remove('opacity-50', 'cursor-not-allowed'); });
    typeSelectors.forEach(b => { b.disabled = false; b.classList.remove('opacity-50', 'cursor-not-allowed'); });
    micBtns.forEach(b => { b.disabled = false; b.classList.remove('opacity-50', 'cursor-not-allowed'); });
} else {
    if(attachLabel) attachLabel.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    if(attachInput) attachInput.disabled = true;
    if(submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('opacity-50', 'cursor-not-allowed'); }
    formatBtns.forEach(b => { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });
    typeSelectors.forEach(b => { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });
    micBtns.forEach(b => { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });
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
checkAppUpdate();
fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "ping" }) }).catch(e => {});
checkAuthStatus();
const tzoffset = (new Date()).getTimezoneOffset() * 60000;
const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
if(document.getElementById('snoozeDateTime')) document.getElementById('snoozeDateTime').min = localISOTime;
let ticking = false;
function optimizedScroll(e) {
if (!ticking) {
window.requestAnimationFrame(() => {
if (document.getElementById("caseDetailView") && document.getElementById("caseDetailView").classList.contains('hidden')) return;
const convEl = document.getElementById("detail-conv-id");
if(!convEl || !convEl.value) return;
const el = e.target;
if (el === document || el === window) {
if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100) loadCommentsPaginated(convEl.value);
} else if (el && el.classList && el.classList.contains('overflow-y-auto')) {
if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) loadCommentsPaginated(convEl.value);
}
ticking = false;
});
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

function showCustomDialog(title, message, isConfirm, onConfirmCallback) {
document.getElementById('dialogTitle').innerText = title;
document.getElementById('dialogMessage').innerText = message;
const btnContainer = document.getElementById('dialogButtons');
btnContainer.innerHTML = '';
if(isConfirm) {
btnContainer.innerHTML = `<button onclick="closeDialog()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button> <button id="dialogConfirmBtn" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors">Confirm</button>`;
document.getElementById('dialogConfirmBtn').onclick = () => { closeDialog(); if(onConfirmCallback) onConfirmCallback(); };
} else {
btnContainer.innerHTML = `<button onclick="closeDialog()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors">OK</button>`;
}
document.getElementById('customDialog').classList.remove('hidden');
}

function closeDialog() { document.getElementById('customDialog').classList.add('hidden'); }

// ==========================================
// 🔥 DATA LOAD CONTROLLER
// ==========================================
async function initDataLoad() {
if (isInitialLoadDone) return;
isInitialLoadDone = true;
await fetchUsersForMentions();
loadConversations();
loadLabelsForForm();
}
window.onload = function() {
if (currentUser) initDataLoad();
};

// ==========================================
// 🔥 LOGIN / LOGOUT LOGIC
// ==========================================
window.handleNextOrLogin = function() {
const idVal = document.getElementById("email").value.trim();
const pwd = document.getElementById("password").value.trim();
const statusEl = document.getElementById("errorText");
const loginBtn = document.getElementById("loginBtn");
if (!idVal) { statusEl.style.display = "block"; statusEl.innerText = "Enter ID first"; return; }
if (!pwd) { statusEl.style.display = "block"; statusEl.innerText = "Enter Password"; return; }
loginBtn.disabled = true;
statusEl.style.display = "block";
statusEl.innerText = "Checking...";
apiCall('loginUser', { mobileOrEmail: idVal, password: pwd, isAutoLogin: false })
.then(res => {
loginBtn.disabled = false;
if (res && res.user) {
try {
localStorage.setItem("user", JSON.stringify(res.user));
sessionStorage.setItem("user", JSON.stringify(res.user));
} catch(e) {}
showAppScreen(res.user);
} else {
statusEl.innerText = res.message || "Invalid Login";
}
}).catch(err => {
loginBtn.disabled = false;
statusEl.innerText = "Server Error: Make sure API_URL is correct.";
});
};

function checkAuthStatus() {
let user = null;
try { user = JSON.parse(localStorage.getItem("user")); } catch(e) {}
if (!user) { try { user = JSON.parse(sessionStorage.getItem("user")); } catch(e) {} }
if (user) showAppScreen(user);
}

window.logoutUser = function() {
localStorage.removeItem("user");
sessionStorage.removeItem("user");
currentUser = null;
isInitialLoadDone = false;
document.getElementById("appView").classList.add("hidden");
document.getElementById("loginView").classList.remove("hidden");
document.getElementById("email").value = "";
document.getElementById("password").value = "";
document.getElementById("errorText").style.display = "none";
checkAuthStatus();
};

function showAppScreen(userObj) {
currentUser = userObj;
if (document.getElementById("loggedInUserEmail")) document.getElementById("loggedInUserEmail").innerText = userObj.name || userObj.email;
if (document.getElementById("loginView")) document.getElementById("loginView").classList.add("hidden");
if (document.getElementById("appView")) document.getElementById("appView").classList.remove("hidden");
fetchGlobalNotifications();
if(globalNotifInterval) clearInterval(globalNotifInterval);
globalNotifInterval = setInterval(fetchGlobalNotifications, 15000);
if (typeof initNotifications === 'function') initNotifications(userObj);
initDataLoad();
setTimeout(() => { if (window.Android && userObj.email) { try { Android.sendUserEmail(userObj.email); } catch(e) {} } }, 2000);
}

async function initNotifications(user) {
try {
if (!('Notification' in window)) return;
const permission = await Notification.requestPermission();
if (permission !== "granted") return;
const registration = await navigator.serviceWorker.register('service-worker.js');
await navigator.serviceWorker.ready;
const token = await messaging.getToken({
vapidKey: "BGF23YCUEVWA9ZKDyD0NduAyLU_Cijhc_ZsO2UMAb8kQTThWSEBMJjnE3Qq3Ad1ys4ms1vETk3KyBeffAx9lHEw",
serviceWorkerRegistration: registration
});
if (token) {
await apiCall('saveToken', { person: user.name || user.email, email: user.email, token: token, platform: "web" });
}
} catch (err) { console.error("Notification Error:", err); }
}

// ==========================================
// HELPERS
// ==========================================
function escapeHTML(str) {
if (!str) return '';
return String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}
window.getUserNameByEmail = function(email) {
if (!email) return 'Unknown';
if (typeof allUsersList !== 'undefined' && allUsersList.length > 0) {
const user = allUsersList.find(u => u && u.email && u.email.toLowerCase().trim() === String(email).toLowerCase().trim());
if (user && user.name) return user.name;
}
return String(email).split('@')[0];
};
window.makeLinksClickable = function(html) {
if (!html) return '';
const tempDiv = document.createElement('div');
tempDiv.innerHTML = html;
const walk = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
let node;
const nodesToReplace = [];
while(node = walk.nextNode()) {
if(node.parentNode && node.parentNode.tagName === 'A') continue;
if(/(https?:\/\/[^\s<]+)/g.test(node.nodeValue)) { nodesToReplace.push(node); }
}
nodesToReplace.forEach(n => {
const span = document.createElement('span');
span.innerHTML = String(n.nodeValue).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="text-blue-600 hover:underline">Open</a>');
n.parentNode.replaceChild(span, n);
});
return tempDiv.innerHTML;
};

// ==========================================
// FILTERS & DROPDOWNS
// ==========================================
window.switchTab = function(tab) {
currentTab = tab;
['Live', 'Snooze', 'Archive'].forEach(t => {
if(document.getElementById(`tab-${t}`)) {
document.getElementById(`tab-${t}`).className = t === tab
? "px-4 sm:px-6 py-4 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition-colors flex items-center gap-2"
: "px-4 sm:px-6 py-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2";
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
renderLookerDropdown('membersDropdown', allUsersList.map(u => u.name || u.email).filter(Boolean), 'Member');
}

function renderLookerDropdown(containerId, items, type) {
const container = document.getElementById(containerId);
if(!container) return;
const inputClass = type === 'Label' ? 'flabel' : 'fmember';
let html = `<div class="flex justify-between items-center px-4 py-2.5 border-b border-slate-100 bg-slate-50/80"> <button type="button" onclick="selectAllInDropdown('${containerId}')" class="text-xs font-extrabold text-indigo-600 hover:text-indigo-800">Select All</button> <button type="button" onclick="clearAllInDropdown('${containerId}')" class="text-xs font-extrabold text-slate-500 hover:text-slate-700">Clear All</button> </div> <div class="p-2 border-b border-slate-100 bg-white"> <input type="text" oninput="searchInDropdown(this, '${containerId}')" placeholder="Search options..." class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"> </div> <div class="max-h-56 overflow-y-auto p-1.5 bg-white dropdown-list-container" style="-webkit-overflow-scrolling: touch;"> ${items.map(item => `
<label class="dropdown-item flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer rounded-lg group" data-search="${String(item).toLowerCase()}" data-available="true">
<input type="checkbox" value="${item}" class="${inputClass} w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
<span class="text-sm text-slate-700 group-hover:text-indigo-700 transition-colors">${item}</span>
</label>
`).join('')} </div> <div class="flex justify-end gap-2 p-3 border-t border-slate-100 bg-slate-50/80"> <button type="button" onclick="toggleDropdown('${containerId}', true)" class="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg shadow-sm border border-slate-200">Cancel</button> <button type="button" onclick="applyLookerFilters('${containerId}', '${type}')" class="px-5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">Apply</button> </div>`;
container.innerHTML = html;
}

window.toggleDropdown = function(id, forceClose = false) {
const drop = document.getElementById(id);
if(!drop) return;
const revertCheckboxes = (dropdownEl) => {
dropdownEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = cb.hasAttribute('data-applied'); });
};
if (forceClose) {
drop.classList.add('hidden'); revertCheckboxes(drop);
} else {
if (!drop.classList.contains('hidden')) {
drop.classList.add('hidden'); revertCheckboxes(drop);
} else {
document.querySelectorAll('[id$="Dropdown"]').forEach(d => { if(d.id !== id) { d.classList.add('hidden'); revertCheckboxes(d); } });
drop.classList.remove('hidden'); revertCheckboxes(drop);
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
items.forEach(item => {
const matchesSearch = item.dataset.search.includes(term);
const isAvailable = item.dataset.available !== 'false';
item.style.display = (matchesSearch && isAvailable) ? 'flex' : 'none';
});
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

window.resetAllFilters = function() {
const filterInput = document.getElementById('filterId');
if (filterInput) filterInput.value = '';
document.querySelectorAll('.flabel').forEach(cb => { cb.checked = false; cb.removeAttribute('data-applied'); });
const labelsBtnText = document.getElementById('labelsDropdownText');
if (labelsBtnText) { labelsBtnText.innerText = 'Filter Labels'; labelsBtnText.classList.remove('text-indigo-700', 'font-extrabold'); }
document.querySelectorAll('.fmember').forEach(cb => { cb.checked = false; cb.removeAttribute('data-applied'); });
const membersBtnText = document.getElementById('membersDropdownText');
if (membersBtnText) { membersBtnText.innerText = 'Filter Members'; membersBtnText.classList.remove('text-indigo-700', 'font-extrabold'); }
document.querySelectorAll('.dropdown-item').forEach(item => item.style.display = 'flex');
document.querySelectorAll('[id$="Dropdown"] input[type="text"]').forEach(inp => inp.value = '');
applyFilters();
};

window.applyFilters = debounce(function() {
try {
const filterInput = document.getElementById('filterId');
if(!filterInput) return;
const idQuery = filterInput.value.toLowerCase().trim();
const checkedLabels = Array.from(document.querySelectorAll('.flabel[data-applied="true"]')).map(cb => cb.value);
const checkedMembers = Array.from(document.querySelectorAll('.fmember[data-applied="true"]')).map(cb => String(cb.value).toLowerCase().trim());
let visibleLabels = new Set(); let visibleMembers = new Set();
    Array.from(document.getElementById('conversationFeed').children).forEach(wrapper => {
        const card = wrapper.classList.contains('card-main') ? wrapper : wrapper.querySelector('.card-main');
        if(!card || !card.dataset.convId) return; 
        const isArchived = card.dataset.status === 'Archived';
        const isSnoozed = parseInt(card.dataset.snooze || 0) > Date.now();
        let showTab = false;
        if (currentTab === 'Live' && !isArchived && !isSnoozed) showTab = true; 
        if (currentTab === 'Archive' && isArchived) showTab = true;
        if (currentTab === 'Snooze' && !isArchived && isSnoozed) showTab = true;

        let cardLabels = card._cachedLabels || JSON.parse(card.dataset.labels || '[]');
        if(!Array.isArray(cardLabels)) cardLabels = [];
        let cardMembers = card._cachedMembers || JSON.parse(card.dataset.members || '[]');
        if(!Array.isArray(cardMembers)) cardMembers = [];
        
        const matchesLabels = checkedLabels.length === 0 || checkedLabels.every(l => cardLabels.includes(l));
        const matchesMembers = checkedMembers.length === 0 || checkedMembers.every(m => 
            cardMembers.some(cm => {
                if (!cm) return false;
                const cmEmail = String(cm).toLowerCase().trim();
                const cmName = String(window.getUserNameByEmail(cm)).toLowerCase().trim();
                return cmEmail === m || cmName === m;
            })
        );
        const matchesId = !idQuery || String(card.dataset.convId).toLowerCase().includes(idQuery) || (card.dataset.subject && String(card.dataset.subject).toLowerCase().includes(idQuery));
        const baseMatch = showTab && matchesId;
        
        if (baseMatch && matchesLabels && matchesMembers) wrapper.style.display = 'block';
        else wrapper.style.display = 'none';

        if (baseMatch && matchesMembers) cardLabels.forEach(l => visibleLabels.add(String(l)));
        if (baseMatch && matchesLabels) cardMembers.forEach(m => {
            if(m) { visibleMembers.add(String(m).toLowerCase().trim()); visibleMembers.add(String(window.getUserNameByEmail(m)).toLowerCase().trim()); }
        });
    });

    document.querySelectorAll('#labelsDropdown .dropdown-item').forEach(item => {
        const cb = item.querySelector('input[type="checkbox"]');
        if(!cb) return;
        if (cb.hasAttribute('data-applied') || visibleLabels.has(cb.value)) { item.style.display = 'flex'; item.dataset.available = 'true'; } 
        else { item.style.display = 'none'; item.dataset.available = 'false'; }
    });
    
    document.querySelectorAll('#membersDropdown .dropdown-item').forEach(item => {
        const cb = item.querySelector('input[type="checkbox"]');
        if(!cb) return;
        const valLower = String(cb.value).toLowerCase().trim();
        const isVisible = visibleMembers.has(valLower);
        if (cb.hasAttribute('data-applied') || isVisible) { item.style.display = 'flex'; item.dataset.available = 'true'; } 
        else { item.style.display = 'none'; item.dataset.available = 'false'; }
    });
} catch(e) {}
}, 150);

// ==========================================
// ACTIONS: ARCHIVE, SNOOZE
// ==========================================
window.processBulkArchive = function() {
    const selectedIds = Array.from(document.querySelectorAll('.bulk-archive-cb:checked')).map(cb => { 
        const card = cb.closest('[data-conv-id]'); 
        return card ? String(card.dataset.convId).trim() : null; 
    }).filter(Boolean);

    if(selectedIds.length === 0) return showCustomDialog("Notice", "Please select at least one case to archive.", false);
    
    showCustomDialog("Confirm Archive", `Are you sure you want to archive ${selectedIds.length} selected case(s)?\n\nCase IDs: \n${selectedIds.join('\n')}`, true, async () => {
        const btn = document.getElementById('bulkArchiveBtn'); 
        btn.innerText = "Archiving..."; 
        btn.disabled = true;
        try { 
            await apiCall('bulkArchive', { ids: selectedIds, user: currentUser.email || currentUser.name }); 
            await loadConversations(); 
        }
        catch(e) { 
            showCustomDialog("Error", "Failed to archive.", false); 
        }
        finally { 
            btn.innerText = "Archive Selected"; 
            btn.disabled = false; 
        }
    });
};

window.processUnarchive = async function(btn) {
const parent = btn.closest('[data-conv-id]');
const convId = parent ? String(parent.dataset.convId).trim() : document.getElementById('detail-conv-id')?.value;
if(!convId) return;
btn.innerText = "Unarchiving..."; btn.disabled = true;
try { await apiCall('unarchiveCaseServer', { id: convId, user: currentUser.email || currentUser.name }); loadConversations(); if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail(); }
catch(e) { showCustomDialog("Error", "Failed to unarchive.", false); btn.innerText = "📂 Un-Archive"; btn.disabled = false; }
};

window.processUnsnooze = async function(btn) {
const parent = btn.closest('[data-conv-id]');
const convId = parent ? String(parent.dataset.convId).trim() : document.getElementById('detail-conv-id')?.value;
if(!convId) return;
btn.innerText = "Un-snoozing..."; btn.disabled = true;
try { await apiCall('unsnoozeCaseServer', { id: convId, userEmail: currentUser.email }); loadConversations(); if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail(); }
catch(e) { showCustomDialog("Error", "Failed to un-snooze.", false); btn.innerText = "🔔 Un-Snooze"; btn.disabled = false; }
};

window.confirmSnooze = async function() {
const dt = document.getElementById('snoozeDateTime').value;
if (!dt) return showCustomDialog("Notice", "Please select a date/time.", false);
const timestamp = new Date(dt).getTime();
if (isNaN(timestamp)) return showCustomDialog("Error", "Invalid date/time selected", false);
const caseId = String(document.getElementById('snoozeConvId').value).trim();
if (!caseId) return showCustomDialog("Error", "Missing Case ID", false);
let btn = document.activeElement;
if (!btn || btn.tagName !== 'BUTTON') btn = document.querySelector('#snoozeModal button:last-of-type');
const origText = btn ? btn.innerText : 'Snooze Now';
if(btn) { btn.innerText = "Snoozing..."; btn.disabled = true; }

try {
    await apiCall('snoozeCase', { id: caseId, time: timestamp, userEmail: currentUser.email });
    document.getElementById('snoozeModal').classList.add('hidden');
    showCustomDialog("Success ✅", "Case Snoozed for you.", false);
    setTimeout(() => { loadConversations(); if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail(); }, 500);
} catch (e) { showCustomDialog("Error", "Failed to snooze.\n" + e.message, false); } 
finally { if(btn) { btn.innerText = origText; btn.disabled = false; } }
};

window.openSnoozeModal = function(btn) {
const convId = document.getElementById('detail-conv-id')?.value;
if(!convId) return showCustomDialog("Error", "Case ID not found.", false);
document.getElementById('snoozeConvId').value = String(convId).trim();
document.getElementById('snoozeModal').classList.remove('hidden');
};

window.openSnoozeModalFromCard = function(btn) {
const parent = btn.closest('[data-conv-id]');
if(!parent) return showCustomDialog("Error", "Card ID not found.", false);
document.getElementById('snoozeConvId').value = String(parent.dataset.convId).trim();
document.getElementById('snoozeModal').classList.remove('hidden');
};

// ==========================================
// MEMBER MANAGEMENT
// ==========================================
function getFilteredUsersForMention(query) {
const queryLower = query.toLowerCase().trim();
let result = [];
if (window.currentCaseHasAdminRights) {
result = [...allUsersList].filter(u => u && u.email);
} else {
const caseMembersLower = (window.currentCaseAllMembers || []).map(str => String(str).toLowerCase().trim());
result = allUsersList.filter(u => {
if(!u || !u.email) return false;
const uEmail = String(u.email).toLowerCase().trim();
const uName = String(u.name || '').toLowerCase().trim();
return caseMembersLower.includes(uEmail) || caseMembersLower.some(member => member.includes(uEmail) || member.includes(uName));
});
}
if (queryLower) result = result.filter(u => {
if(!u || !u.email) return false;
const uName = String(u.name || '').toLowerCase();
const uEmail = String(u.email).toLowerCase();
return uName.includes(queryLower) || uEmail.includes(queryLower);
});
return result.filter((u, index, self) => index === self.findIndex((t) => t.email === u.email));
}

window.searchNewMember = debounce(function(q) {
const dropdown = document.getElementById('member_search_dropdown');
if(!q) { dropdown.classList.add('hidden'); return; }
const queryLower = q.toLowerCase();
const filtered = allUsersList.filter(u => {
if(!u || !u.email) return false;
const uName = String(u.name || '').toLowerCase();
const uEmail = String(u.email).toLowerCase();
return (uName.includes(queryLower) || uEmail.includes(queryLower)) && !tempAdmins.includes(u.email) && !tempUsers.includes(u.email);
});
if(filtered.length === 0) { dropdown.innerHTML = 'No users found'; }
else {
dropdown.innerHTML = filtered.map(u => `<div class="p-3 hover:bg-indigo-50 border-b flex justify-between items-center"> <span class="text-sm font-medium text-slate-800">${escapeHTML(u.name || u.email || 'Unknown')}</span> <div class="flex gap-1"> <button type="button" onclick="addNewTempMember('${String(u.email || '').replace(/'/g, "\\'")}', 'Admin')" class="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-bold">Admin</button> <button type="button" onclick="addNewTempMember('${String(u.email || '').replace(/'/g, "\\'")}', 'User')" class="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded font-bold">User</button> </div> </div>`).join('');
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
tempAdmins.forEach(email => allMems.push({email: email, role: 'Admin'}));
tempUsers.forEach(email => allMems.push({email: email, role: 'User'}));
const list = document.getElementById('manage_members_list');
if(allMems.length === 0) { list.innerHTML = 'No members assigned.'; return; }
list.innerHTML = allMems.map(m => `<div class="flex justify-between items-center bg-white border border-slate-200 rounded p-2 shadow-sm"> <span class="text-sm font-bold text-slate-700">${escapeHTML(window.getUserNameByEmail(m.email))}</span> <div class="flex gap-2 items-center"> <select onchange="updateTempRole('${m.email}', this.value)" class="text-xs font-bold border rounded p-1 bg-slate-50 text-slate-700"> <option value="Admin" ${m.role==='Admin'?'selected':''}>Admin</option> <option value="User" ${m.role==='User'?'selected':''}>User</option> </select> <button onclick="removeTempMember('${m.email}')" class="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded font-bold text-lg leading-none">&times;</button> </div> </div>`).join('');
}

window.updateTempRole = function(email, newRole) { tempAdmins = tempAdmins.filter(e => e !== email); tempUsers = tempUsers.filter(e => e !== email);
if(newRole === 'Admin') tempAdmins.push(email); if(newRole === 'User') tempUsers.push(email); renderManageMembersList(); };
window.removeTempMember = function(email) { tempAdmins = tempAdmins.filter(e => e !== email); tempUsers = tempUsers.filter(e => e !== email); renderManageMembersList(); };
window.addNewTempMember = function(email, role) { tempAdmins = tempAdmins.filter(e => e !== email); tempUsers = tempUsers.filter(e => e !== email);
if(role === 'Admin') tempAdmins.push(email); else tempUsers.push(email); document.getElementById('member_search_input').value = ''; document.getElementById('member_search_dropdown').classList.add('hidden'); renderManageMembersList(); };

window.saveManagedMembers = async function() {
const btn = document.getElementById('saveMembersBtn'); btn.innerText = "Saving..."; btn.disabled = true;
const convId = document.getElementById('detail-conv-id').value;
try {
await apiCall('updateCaseMembers', { id: convId, admins: tempAdmins, users: tempUsers, userEmail: currentUser.email });
currentCaseAdmins = [...tempAdmins]; currentCaseUsers = [...tempUsers];
const detAdm = document.getElementById('detail-admins'); detAdm.innerHTML = '';
const detUsr = document.getElementById('detail-users'); detUsr.innerHTML = '';
currentCaseAdmins.forEach(a => { if(a) detAdm.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${window.getUserNameByEmail(a)}</span>`; });
currentCaseUsers.forEach(u => { if(u) detUsr.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${window.getUserNameByEmail(u)}</span>`; });
detAdm.innerHTML += `<button onclick="openManageMembers()" class="ml-1 text-blue-600 hover:text-blue-800 p-0.5 rounded-full hover:bg-blue-50 transition-colors" title="Manage Members"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>`;
closeManageMembers(); loadConversations();
} catch(e) { showCustomDialog("Error", "Failed to update members", false); } finally { btn.innerText = "Save Changes"; btn.disabled = false; }
};

// ==========================================
// 🎙️ AUDIO RECORDING LOGIC (GLOBAL + TIMER)
// ==========================================
let mediaRecorder;
let audioChunks = [];
let recordTimerInterval;
let recordSeconds = 0;

window.toggleAudioRecording = async function() {
const micBtn = document.getElementById('mic-btn');
const recordingUI = document.getElementById('recording-ui-main');
const timerEl = document.getElementById('recording-timer-main');
if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    micBtn.classList.remove('text-red-600', 'bg-red-100');
    micBtn.classList.add('text-slate-500');
    recordingUI.classList.add('hidden');
    recordingUI.classList.remove('flex');
    clearInterval(recordTimerInterval);
    return;
}
try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `VoiceNote_${new Date().toLocaleTimeString().replace(/:/g,'-')}.webm`, { type: 'audio/webm' });
        
        if(pendingReplyFiles && pendingReplyFiles.length < 10) {
            pendingReplyFiles.push(audioFile);
            if(typeof renderReplyFileList === 'function') renderReplyFileList();
        }
        stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorder.start();
    
    micBtn.classList.remove('text-slate-500');
    micBtn.classList.add('text-red-600', 'bg-red-100');
    recordingUI.classList.remove('hidden');
    recordingUI.classList.add('flex');
    
    recordSeconds = 0;
    timerEl.innerText = "00:00";
    recordTimerInterval = setInterval(() => {
        recordSeconds++;
        const min = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
        const sec = String(recordSeconds % 60).padStart(2, '0');
        timerEl.innerText = `${min}:${sec}`;
    }, 1000);
    
} catch(e) {
    showCustomDialog("Microphone Error", "Could not access microphone.", false);
}
};

window.toggleInlineAudioRecording = async function(btn) {
const activeBox = btn.closest('[data-id="inline-reply-box"]');
const recordingUI = activeBox.querySelector('.inline-recording-ui');
const timerEl = activeBox.querySelector('.inline-recording-timer');
if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    btn.classList.remove('text-red-600', 'bg-red-100');
    btn.classList.add('text-slate-500');
    recordingUI.classList.add('hidden');
    recordingUI.classList.remove('flex');
    clearInterval(recordTimerInterval);
    return;
}
try {
    activeInlineBox = activeBox;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `VoiceNote_${new Date().toLocaleTimeString().replace(/:/g,'-')}.webm`, { type: 'audio/webm' });
        
        if(inlinePendingFiles && inlinePendingFiles.length < 10) {
            inlinePendingFiles.push(audioFile);
            if(typeof renderInlineFileList === 'function') renderInlineFileList();
        }
        stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorder.start();
    
    btn.classList.remove('text-slate-500');
    btn.classList.add('text-red-600', 'bg-red-100');
    recordingUI.classList.remove('hidden');
    recordingUI.classList.add('flex');
    
    recordSeconds = 0;
    timerEl.innerText = "00:00";
    recordTimerInterval = setInterval(() => {
        recordSeconds++;
        const min = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
        const sec = String(recordSeconds % 60).padStart(2, '0');
        timerEl.innerText = `${min}:${sec}`;
    }, 1000);
    
} catch(e) {
    showCustomDialog("Microphone Error", "Could not access microphone.", false);
}
};

window.toggleNewCaseAudioRecording = async function(btn) {
const recordingUI = btn.nextElementSibling;
const timerEl = recordingUI.querySelector('.new-case-recording-timer');
const textSpan = btn.querySelector('span');
if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    btn.classList.remove('bg-red-600', 'text-white', 'border-red-700', 'animate-pulse');
    btn.classList.add('bg-red-50', 'text-red-600');
    textSpan.innerText = "Record Audio";
    btn.querySelector('i').className = "fas fa-microphone";
    
    recordingUI.classList.add('hidden');
    recordingUI.classList.remove('flex');
    clearInterval(recordTimerInterval);
    return;
}
try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `VoiceNote_${new Date().toLocaleTimeString().replace(/:/g,'-')}.webm`, { type: 'audio/webm' });
        
        if(pendingFiles && pendingFiles.length < 10) {
            pendingFiles.push(audioFile);
            if(typeof renderFileList === 'function') renderFileList();
        } else {
            showCustomDialog("Notice", "Max 10 attachments allowed.", false);
        }
        stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorder.start();
    
    btn.classList.remove('bg-red-50', 'text-red-600');
    btn.classList.add('bg-red-600', 'text-white', 'border-red-700');
    textSpan.innerText = "Stop Recording";
    btn.querySelector('i').className = "fas fa-stop";
    
    recordingUI.classList.remove('hidden');
    recordingUI.classList.add('flex');
    
    recordSeconds = 0;
    timerEl.innerText = "00:00";
    recordTimerInterval = setInterval(() => {
        recordSeconds++;
        const min = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
        const sec = String(recordSeconds % 60).padStart(2, '0');
        timerEl.innerText = `${min}:${sec}`;
    }, 1000);
    
} catch(e) {
    showCustomDialog("Microphone Error", "Could not access microphone. Allow permissions.", false);
}
};

// ==========================================
// MENTIONS & COMPOSER LOGIC
// ==========================================
window.openAssignTask = function() {
if (!currentUser || !currentUser.email) {
showCustomDialog("Notice", "User not logged in properly. Cannot find email.", false);
return;
}
const userEmailEncoded = encodeURIComponent(currentUser.email);
const url = `https://script.google.com/a/macros/hosexperts.com/s/AKfycbyisCYLtOoFaDdjrIQCu6A1QSROpKrKp5ROBIzyT5IXwiEk4FJ7E5oKbvzQi8yfyaayLw/exec?useremail=${userEmailEncoded}&tab=Delegate%20Task`;
window.open(url, '_blank');
};

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
`<div onclick="selectReplyMentionUser('${String(u.name||'').replace(/'/g, "\\'")}', '${String(u.email||'').replace(/'/g, "\\'")}')" class="p-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 text-left"> <div class="text-sm font-bold text-slate-800">${u.name || u.email || 'Unknown'}</div> <div class="text-[11px] text-slate-500 truncate">${u.email || ''}</div> </div>`
).join('');
if(filtered.length === 0) dropdown.innerHTML = `<div class="p-3 text-[11px] text-slate-400 font-bold uppercase tracking-widest text-center">No match found</div>`;
}

window.selectReplyMentionUser = function(name, email) {
const dropdown = document.getElementById('reply_mention_dropdown');
const emailLower = String(email).toLowerCase(); const nameLower = String(name).toLowerCase();
const isAdmin = currentCaseAdmins.some(a => String(a).toLowerCase().includes(emailLower) || String(a).toLowerCase().includes(nameLower));
const isUser = currentCaseUsers.some(u => String(u).toLowerCase().includes(emailLower) || String(u).toLowerCase().includes(nameLower));
const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
if (isAdmin || isCreator) window.finalizeReplyMention(name, email, 'Admin');
else if (isUser) window.finalizeReplyMention(name, email, 'User');
else {
if (!window.currentCaseHasAdminRights) {
showCustomDialog("Action Blocked", "Only Case Admins can add new members.", false);
dropdown.classList.add('hidden'); return;
}
dropdown.innerHTML = `<div class="bg-slate-800 px-3 py-2 text-xs font-bold text-white">Select Role for ${name}</div> <div onclick="finalizeReplyMention('${String(name).replace(/'/g, "\\'")}', '${String(email).replace(/'/g, "\\'")}', 'Admin')" class="p-2 hover:bg-blue-50 cursor-pointer border-b text-sm font-bold text-blue-700">👑 Admin</div> <div onclick="finalizeReplyMention('${String(name).replace(/'/g, "\\'")}', '${String(email).replace(/'/g, "\\'")}', 'User')" class="p-2 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700">👤 User</div>`;
}
};

window.finalizeReplyMention = function(name, email, role) {
const emailLower = String(email).toLowerCase(); const nameLower = String(name).toLowerCase();
const isAdmin = currentCaseAdmins.some(a => String(a).toLowerCase() === emailLower || String(a).toLowerCase() === nameLower);
const isUser = currentCaseUsers.some(u => String(u).toLowerCase() === emailLower || String(u).toLowerCase() === nameLower);
const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
if (!isAdmin && !isUser && !isCreator) {
if (role === 'Admin') currentCaseAdmins.push(email); else currentCaseUsers.push(email);
if (!window.currentCaseAllMembers) window.currentCaseAllMembers = [];
window.currentCaseAllMembers.push(email);
const detAdm = document.getElementById('detail-admins'); const detUsr = document.getElementById('detail-users');
const badgeHtml = `<span class="px-2 py-0.5 ${role === 'Admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'} border text-[10px] rounded font-bold shadow-sm">${role === 'Admin' ? '👑' : '👤'} ${name}</span>`;
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
const btnReply = document.getElementById('btn_global_reply');
const btnAsk = document.getElementById('btn_global_ask');
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
html = `<div class="flex items-center justify-between mb-1"><span class="text-xs font-bold text-blue-800 uppercase">Action for @${r.name} (${r.role})</span></div> <div class="flex items-center gap-3 py-1"><button type="button" onclick="setReplyGlobalType('Message')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Message' ? 'bg-slate-800 border-slate-900 text-white shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-50'}">💬 Message</button> <button type="button" onclick="setReplyGlobalType('Ask')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Ask' ? 'bg-red-100 border-red-500 text-red-700 shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-50'}">🎯 Ask</button></div>`;
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
document.getElementById('edit_details_rich').innerHTML = document.getElementById('detail-details').innerHTML;
currentEditLabels = new Set(Array.from(document.getElementById('detail-labels').children).map(span => span.innerText));
renderEditLabels();
const convId = document.getElementById('detail-conv-id').value;
let card = document.querySelector(`[data-conv-id="${convId}"]`);
if(card && !card.dataset.attachmentsData) card = card.querySelector('.card-main') || card.closest('.card-main');

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
renderEditFileList();
}

window.removeCurrentEditAttachment = function(index) { currentEditAttachments.splice(index, 1); renderEditAttachments(); };
window.handleEditFileSelect = function(e) { Array.from(e.target.files).forEach(f => { if(newEditPendingFiles.length < 10) newEditPendingFiles.push(f); }); renderEditAttachments(); };
window.removeEditNewFile = function(index) { newEditPendingFiles.splice(index, 1); renderEditAttachments(); };

window.saveCaseEdits = async function() {
const btn = document.getElementById('saveEditBtn');
btn.innerText = "Saving...";
btn.disabled = true;
try {
let finalUrls = [...currentEditAttachments];
    if(newEditPendingFiles.length > 0) {
        showUploadOverlay("Updating Attachments", newEditPendingFiles);
        const newlyUploadedData = await uploadMultipleFilesResumable(newEditPendingFiles);
        const newlyUploadedUrls = newlyUploadedData.map(d => d.url);
        finalUrls = finalUrls.concat(newlyUploadedUrls);
        hideUploadOverlay();
    }
    
    await apiCall('updateCaseDetails', { 
        id: document.getElementById('detail-conv-id').value, 
        subject: document.getElementById('edit_subject').value.trim(), 
        details: document.getElementById('edit_details_rich').innerHTML.trim(), 
        labels: Array.from(currentEditLabels), 
        attachments: finalUrls, 
        userEmail: currentUser.email 
    });
    
    document.getElementById('editCaseModal').classList.add('hidden');
    
    if(window.isMobileClient && window.isMobileClient()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
    }
    
    loadConversations(); 
    closeCaseDetail(); 
} catch(e) { 
    hideUploadOverlay();
    showCustomDialog("Error", "Failed to save edits.", false); 
} finally { 
    btn.innerText = "Save Changes"; 
    btn.disabled = false; 
}
};

// ==========================================
// FULL STATE AND UI RESET
// ==========================================
function resetCaseState() {
lastTimestamp = 0;
seenMessages = new Set();
page = 0;
hasMore = true;
allLoadedComments = []; // ✅ FIX: Wipes old comments from memory preventing bleed
currentCaseAdmins = [];
currentCaseUsers = [];
const threadContainer = document.getElementById("detail-thread-container");
if (threadContainer) threadContainer.innerHTML = "";
const replyInput = document.getElementById("detail-reply-input");
if (replyInput) replyInput.innerHTML = "";
if (realtimeInterval) {
clearInterval(realtimeInterval);
realtimeInterval = null;
}
}

// ==========================================
// DETAIL VIEW & REPLIES
// ==========================================
window.handleCardClick = function(event, cardEl) {
if (event.target.closest('button') || event.target.closest('label') || event.target.closest('.archive-cb-container') || event.target.closest('a')) return;
window.openCaseDetail(cardEl);
};

window.openCaseDetail = async function(cardEl) {
  window.isOpeningDetailView = true;

  // RESET OLD UI
  if(document.getElementById('detail-subject')) document.getElementById('detail-subject').innerHTML = '';
  if(document.getElementById('detail-details')) document.getElementById('detail-details').innerHTML = '';
  if(document.getElementById('detail-message')) document.getElementById('detail-message').innerHTML = '';
  if(document.getElementById('detail-labels')) document.getElementById('detail-labels').innerHTML = '';
  if(document.getElementById('detail-admins')) document.getElementById('detail-admins').innerHTML = '';
  if(document.getElementById('detail-users')) document.getElementById('detail-users').innerHTML = '';
  if(document.getElementById('detail-attachments')) document.getElementById('detail-attachments').innerHTML = '';

  if(document.getElementById('detail-thread-container')) document.getElementById('detail-thread-container').innerHTML = `
    <div class="flex justify-center py-10">
        <div class="loader"></div>
    </div>
  `;

try {
let card = cardEl.classList && cardEl.classList.contains('card-main') ? cardEl : null;
if (!card && cardEl.closest) card = cardEl.closest('.card-main');
if (!card && cardEl.querySelector) card = cardEl.querySelector('.card-main');
if (!card) card = cardEl.closest('[data-conv-id]');
  if (!card) {
      console.error("Card element not found for opening.");
      return;
  }

  resetCaseState();

  const dataset = card.dataset; 
  const convId = String(dataset.convId || "").trim();
  const rawSnooze = parseInt(dataset.snoozeRaw || 0, 10);
  const currentSafeSnooze = parseInt(dataset.snooze || 0, 10);
  
  if (rawSnooze > Date.now() && currentSafeSnooze === 0) {
        apiCall('unsnoozeCaseServer', { id: convId, userEmail: currentUser.email }).catch(e => {});
  }
  
  document.getElementById('detail-subject').innerText = card.querySelector('[data-id="subject"]').innerText;
  document.getElementById('detail-id').innerText = convId; 
  document.getElementById('detail-conv-id').value = convId; 
  const creatorName = card.querySelector('[data-id="author"]').innerText;
  document.getElementById('detail-author').innerText = creatorName; 
  document.getElementById('detail-timestamp').innerText = card.querySelector('[data-id="timestamp"]').innerText;
  
  const rawDetails = card.querySelector('[data-id="details"]').innerHTML;
  const rawMsg = card.querySelector('[data-id="message"]').innerHTML;
  
  document.getElementById('detail-details').innerHTML = typeof window.makeLinksClickable === 'function' ? window.makeLinksClickable(rawDetails) : rawDetails;
  document.getElementById('detail-message').innerHTML = typeof window.makeLinksClickable === 'function' ? window.makeLinksClickable(rawMsg) : rawMsg;
  
  document.getElementById('detail-labels').innerHTML = card.querySelector('[data-id="labels-container"]').innerHTML; 
  document.getElementById('detail-status-badge').innerHTML = card.querySelector('[data-id="status-badge"]').outerHTML;
  
  const detailAvatar = document.getElementById('detail-avatar-letter');
  if(detailAvatar) detailAvatar.textContent = creatorName.charAt(0).toUpperCase();
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
  currentCaseAdmins.forEach(a => { if(a) detAdm.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${window.getUserNameByEmail(a)}</span>`; });
  currentCaseUsers.forEach(u => { if(u) detUsr.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${window.getUserNameByEmail(u)}</span>`; });
  if(hasAdminRights) detAdm.innerHTML += `<button onclick="openManageMembers()" class="ml-1 text-blue-600 hover:text-blue-800 p-0.5 rounded-full hover:bg-blue-50 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>`;
  
  // ✅ SMART FIX: Top description images and iframe fix
  const attContainer = document.getElementById('detail-attachments'); attContainer.innerHTML = '';
  JSON.parse(dataset.attachmentsData || '[]').forEach(url => { 
      if(url) {
          const isThumbnail = String(url).includes('thumbnail');
          let previewElement = '';
          
          if (isThumbnail) {
              let fileIdMatch = String(url).match(/id=([^&]+)/) || String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
              let fileId = fileIdMatch ? fileIdMatch[1] : '';
              
              // 🔥 100% Stable Image Links
              let primaryImg = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
              let fallbackImg = `https://drive.google.com/uc?export=view&id=${fileId}`;
              
              previewElement = `<img src="${primaryImg}" onerror="this.onerror=null; this.src='${fallbackImg}';" class="w-full h-auto max-h-64 object-contain rounded" alt="Attachment">`;
          } else {
              const cleanUrl = String(url).replace(/\/view.*/, '/preview');
              previewElement = `<iframe src="${cleanUrl}" height="200" class="w-full" allow="autoplay; encrypted-media" frameborder="0" scrolling="no"></iframe>`;
          }

          attContainer.innerHTML += `
          <div class="flex flex-col gap-2 mt-3 w-full max-w-sm">
              <div class="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 relative w-full flex justify-center">
                  ${previewElement}
              </div>
              <a href="${url}" target="_blank" class="self-start inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg shadow-sm border border-indigo-100">📎 Open Attachment</a>
          </div>`;
      }
  });

  const status = dataset.status;
  const isSnoozed = parseInt(dataset.snooze) > Date.now();
  const unarchiveBtn = document.getElementById('detail-unarchive-btn'); const unsnoozeBtn = document.getElementById('detail-unsnooze-btn'); const snoozeBtn = document.getElementById('detail-snooze-btn');
  
  unarchiveBtn.classList.add('hidden'); unsnoozeBtn.classList.add('hidden'); snoozeBtn.classList.add('hidden');
  
  if (status === 'Archived') { 
      unarchiveBtn.classList.remove('hidden');
  }
  
  if (status !== 'Archived') {
      if (isSnoozed) { unsnoozeBtn.classList.remove('hidden'); } 
      else { snoozeBtn.classList.remove('hidden'); }
  }
  ['Live', 'Snooze', 'Archive'].forEach(t => { if (t !== currentTab) document.getElementById(`tab-${t}`).style.display = 'none'; });
  
  const caseNotifs = notifications.filter(n => window.normalizeCaseId(n.caseId) === window.normalizeCaseId(convId));
  if (caseNotifs.length > 0) {
      caseNotifs.forEach(n => {
          apiCall('markSeen', { notificationId: n.id, userEmail: currentUser.email, userName: currentUser.name || currentUser.email }).catch(e => console.log(e));
          if (n.type !== 'Ask') { 
              locallySeenNotifications.add(n.id);
          }
      });
      notifications = notifications.filter(n => window.normalizeCaseId(n.caseId) !== window.normalizeCaseId(convId) || n.type === 'Ask');
      unreadCount = notifications.length;
      updateNotificationUI();
  }
  
  replyComposerState = { recipients: [], mode: 'SAME', globalType: 'Message' };
  document.getElementById('detail-reply-input').innerHTML = ''; 
  window.setReplyGlobalType('Message');
  
  checkComposerRestrictions(document.getElementById('detail-reply-input'), 'main');

  document.getElementById('dashboardView').classList.add('hidden'); document.getElementById('caseDetailView').classList.remove('hidden');
  
  realtimeInterval = setInterval(fetchNewMessages, 3000);
  loadCommentsPaginated(convId, true);
} catch(e) { console.error("Open Case Error:", e); }
  window.isOpeningDetailView = false;
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

window.renderReplyFileList = function() {
const list = document.getElementById('reply_file_list');
if(list) {
list.innerHTML = '';
pendingReplyFiles.forEach((file, index) => {
list.innerHTML += createBeautifulFileCard(file, index, 'removeReplyFile');
});
}
};

window.removeReplyFile = function(index) { pendingReplyFiles.splice(index, 1); renderReplyFileList(); };

// ==========================================
// ⚡ OPTIMISTIC UI: THREAD & COMMENT SYSTEM
// ==========================================
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
    // ✅ FIX: Allow reset to bypass the opening block!
    if (window.isOpeningDetailView && !reset) return; 
    
    if (isLoading || !hasMore) return;
    isLoading = true;
    
    const container = document.getElementById("detail-thread-container");
    if (reset) { 
        page = 0; 
        hasMore = true; 
        allLoadedComments = []; // ✅ FIX: Wipes old comments from memory
        container.innerHTML = ''; 
    }
    
    apiCall('getPaginatedComments', { caseId: caseId, page: page, limit: limit })
        .then(data => {
            isLoading = false;
            if (!data || data.length === 0) {
                if(reset) container.innerHTML = `<p class="text-center py-5 text-slate-400 font-medium tracking-wide">Start the discussion below.</p>`;
                hasMore = false; return;
            }
            if (data.length < limit) hasMore = false;
            
            // ✅ FIX: Strictly normalize the active Case ID
            const cleanActiveCaseId = window.normalizeCaseId(caseId);
            
            const validData = [];
            data.forEach(msg => {
                // ✅ FIX: Strictly compare incoming messages
                if (window.normalizeCaseId(msg.caseId) !== cleanActiveCaseId) return;

                const id = msg.uniqueId || (msg.timestamp + msg.sender);
                
                const isDuplicate = seenMessages.has(id) || allLoadedComments.some(c => 
                    (c.uniqueId && msg.uniqueId && c.uniqueId === msg.uniqueId) || 
                    (String(c.text || '').trim() === String(msg.text || '').trim() && 
                     String(c.sender || '').trim() === String(msg.sender || '').trim() && 
                     Math.abs(new Date(c.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 60000)
                );
                
                if (!isDuplicate) {
                    if (msg.timestamp > lastTimestamp) lastTimestamp = msg.timestamp;
                    seenMessages.add(id);
                    validData.push(msg);
                }
            });

            allLoadedComments = allLoadedComments.concat(validData);
            renderAllCommentsLocally();
            page++;
        }).catch(err => { isLoading = false; console.error(err); });
}

async function fetchNewMessages() {
    if (window.isOpeningDetailView) return;
    const caseId = document.getElementById('detail-conv-id')?.value;
    if (!caseId || document.getElementById("caseDetailView").classList.contains("hidden") || isLoading) return;
    if (window.isUserTypingGlobal) {
        return;
    }

    try {
        const messages = await apiCall('getNewComments', {
            caseId: caseId,
            lastTimestamp: lastTimestamp
        });
        if (!messages || messages.length === 0) return;

        let hasNew = false;
        
        // ✅ FIX: Strictly normalize the active Case ID
        const cleanActiveCaseId = window.normalizeCaseId(caseId);
        
        messages.forEach(msg => {
            // ✅ FIX: Strictly compare incoming messages
            if (window.normalizeCaseId(msg.caseId) !== cleanActiveCaseId) return;

            const id = msg.uniqueId || (msg.timestamp + msg.sender);

            const isDuplicate = seenMessages.has(id) || allLoadedComments.some(c => 
                (c.uniqueId && msg.uniqueId && c.uniqueId === msg.uniqueId) || 
                (String(c.text || '').trim() === String(msg.text || '').trim() && 
                 String(c.sender || '').trim() === String(msg.sender || '').trim() && 
                 Math.abs(new Date(c.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 60000)
            );

            if (isDuplicate) {
                if (msg.timestamp > lastTimestamp) lastTimestamp = msg.timestamp;
                return;
            }

            seenMessages.add(id);
            allLoadedComments.push(msg);
            hasNew = true;

            if (msg.timestamp > lastTimestamp) {
                lastTimestamp = msg.timestamp;
            }

            if (!msg.seen || !msg.seen.includes(currentUser.email)) {
                fetch(API_URL, {
                    method: "POST",
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: "markSeen",
                        params: {
                            notificationId: msg.uniqueId,
                            userEmail: currentUser.email,
                            userName: currentUser.name || currentUser.email 
                        }
                    })
                }).catch(() => console.log("Silent background update failed."));
            }
        });
        
        if (hasNew) {
            renderAllCommentsLocally();
        }

    } catch (err) {
        console.error("Realtime fetch skipped due to network or sync:", err);
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
let badge = ''; const statusIcon = (c.type === 'Ask' && c.status === 'Closed') ? ' ✅' : '';
if (c.type === 'Ask') badge = `<span class="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Ask ${c.askId ? `#${c.askId}` : ''}${statusIcon}</span>`;
else if (c.type === 'Reply') badge = `<span class="bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Reply ${c.parentAskId ? `to #${c.parentAskId}` : ''}</span>`;
else badge = `<span class="bg-slate-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Message</span>`;
    
    // ✅ SMART FIX: Support multiple attachments & bypass 403 for images
    let attachmentPreviewHtml = '';
    if (c.attachmentUrl) {
        const urls = String(c.attachmentUrl).split(',').filter(String);
        const names = String(c.attachmentFileName || '').split(',').map(s => s.trim());
        
        attachmentPreviewHtml = urls.map((url, idx) => {
            const fName = names[idx] || 'Attached File';
            const cleanUrlForPreview = String(url).trim().replace(/\/view.*/, '/preview');
            const isImage = fName.match(/\.(png|jpe?g|gif|webp)$/i);
            const isAudio = fName.match(/\.(mp3|wav|ogg|m4a|webm)$/i);
            const previewHeight = isAudio ? '80' : '300';
            
            let previewElement = '';
            if (isImage) {
                let fileIdMatch = url.match(/id=([^&]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                let fileId = fileIdMatch ? fileIdMatch[1] : '';
                
                // 🔥 100% Stable Image Links
                let primaryImg = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
                let fallbackImg = `https://drive.google.com/uc?export=view&id=${fileId}`;
                
                previewElement = `<img src="${primaryImg}" onerror="this.onerror=null; this.src='${fallbackImg}';" class="w-full h-auto max-h-64 object-contain rounded" alt="Attachment">`;
            } else {
                previewElement = `<iframe src="${cleanUrlForPreview}" height="${previewHeight}" class="w-full" allow="autoplay; encrypted-media" frameborder="0" scrolling="no"></iframe>`;
            }

            return `
            <div class="mt-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm inline-block w-full max-w-md mr-2">
                <div class="rounded-lg overflow-hidden bg-slate-50 relative w-full border border-slate-100 flex justify-center">
                    ${previewElement}
                </div>
                <div class="mt-2 text-left">
                    <a href="${url.trim()}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-extrabold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-100">📎 ${escapeHTML(fName)}</a>
                </div>
            </div>`;
        }).join('');
    }

    const parentAskIdForBackend = (c.type === 'Ask') ? c.askId : (c.parentAskId || '');
    const senderName = window.getUserNameByEmail(c.sender || 'Unknown');

    return `
        <div class="mb-4 group" style="${indentStyle}" data-id="reply-container">
            <div class="p-4 rounded-xl shadow-sm transition-all border border-slate-200/50" style="background-color: ${tColor}; border-left: 4px solid rgba(0,0,0,0.1);">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shadow-inner">${senderName.charAt(0).toUpperCase()}</div>
                    <span class="font-bold text-sm text-slate-900">${senderName}</span>
                    ${badge}
                    <span class="text-[10px] text-slate-500 font-medium ml-auto">${new Date(c.timestamp).toLocaleString()}</span>
                </div>
                
                <div class="rich-text text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">${typeof window.makeLinksClickable === 'function' ? window.makeLinksClickable(c.text) : c.text}</div>
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

                        <div contenteditable="true" oninput="handleInlineTyping(event)" data-placeholder="Start typing @ to mention..." class="rich-text w-full text-xs outline-none max-h-24 overflow-y-auto leading-relaxed inline-reply-input text-slate-900 px-2 py-2 bg-white/70 border border-black/5 rounded-lg shadow-inner"></div>
                        <div class="hidden absolute bottom-full mb-1 left-0 sm:left-2 w-[90vw] sm:w-64 max-w-full bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] overflow-hidden inline-mention-dropdown"></div>
                        
                        <div class="flex flex-wrap gap-1 mt-2 empty:hidden inline-file-list px-1"></div>
                        <div class="flex justify-between items-center mt-2 border-t border-black/10 pt-2 flex-wrap gap-2">
                            <div class="flex items-center gap-2">
                                <div class="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
                                    <label class="text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer p-1.5 rounded hover:bg-indigo-50" title="Attach File">
                                        <i class="fas fa-paperclip"></i>
                                        <input type="file" multiple class="hidden inline-file-input" onchange="handleInlineFileSelect(event, this)">
                                    </label>
                                    <div class="w-px h-4 bg-slate-300 mx-0.5"></div>
                                    <button type="button" class="text-slate-500 hover:text-red-600 transition-colors p-1.5 rounded hover:bg-red-50 inline-mic-btn" onclick="toggleInlineAudioRecording(this)" title="Record Voice Note">
                                        <i class="fas fa-microphone"></i>
                                    </button>
                                </div>
                                <div class="hidden items-center gap-2 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full inline-recording-ui shadow-inner">
                                    <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                    <span class="inline-recording-timer text-[10px] font-bold text-red-600 font-mono tracking-wider">00:00</span>
                                    <div class="recording-wave !h-3"><span></span><span></span><span></span><span></span><span></span></div>
                                </div>
                            </div>
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
    // ✅ SMART FIX: Multi-file handling with custom Progress UI
    if(pendingReplyFiles.length > 0) { 
        showUploadOverlay("Uploading Attachments", pendingReplyFiles);
        const uploadedData = await uploadMultipleFilesResumable(pendingReplyFiles);
        fileUrl = uploadedData.map(d => d.url).join(',');
        fileName = uploadedData.map(d => d.name).join(',');
        hideUploadOverlay();
    }

    let payloadToSend;
    if (replyComposerState.mode === 'DIFFERENT' && replyComposerState.recipients.length > 0) {
        payloadToSend = replyComposerState.recipients.map(r => {
            const tempId = "TEMP-" + Date.now() + "-" + Math.floor(Math.random() * 10000); 
            
            // 🔥 FIX: Automatically prepend the @Mention Badge HTML so the name shows perfectly in the chat for individual messages!
            const badgeClass = r.role === 'Admin' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-800';
            const badgeHtml = `<span class="mention-badge mx-1 shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeClass}" data-email="${r.email}">@${r.name}</span>&nbsp;`;
            
            let finalCustomText = (r.customText && r.customText.trim() !== '') ? (badgeHtml + r.customText.trim()) : msgHTML;

            return {
                caseId: caseId, 
                text: finalCustomText, 
                mentionType: r.type || 'Message', 
                sender: currentUser.email, 
                receiver: r.email, 
                parentAskId: '', 
                threadId: '', 
                attachmentUrl: fileUrl, 
                attachmentFileName: fileName,
                uniqueId: tempId 
            };
        });
    }else {
        const tempId = "TEMP-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
        payloadToSend = { caseId: caseId, text: msgHTML, mentionType: replyComposerState.globalType || 'Message', sender: currentUser.email, receiver: replyComposerState.recipients.map(r => r.email).join(','), parentAskId: '', threadId: '', attachmentUrl: fileUrl, attachmentFileName: fileName, uniqueId: tempId };
    }

    const localSenderName = currentUser.name || currentUser.email;
    const payloads = Array.isArray(payloadToSend) ? payloadToSend : [payloadToSend];
    payloads.forEach(p => {
         const tempId = p.uniqueId; 
         seenMessages.add(tempId); 
         
         allLoadedComments.push({
             caseId: String(p.caseId).trim(),
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
             uniqueId: tempId, 
             threadId: p.threadId || 'LOCAL-T-' + Math.random(),
             threadColor: p.threadColor || '#f8fafc'
         });
    });
    
    inputDiv.innerHTML = ''; pendingReplyFiles = [];
    if(document.getElementById('reply_file_list')) renderReplyFileList();
    replyComposerState = { recipients: [], mode: 'SAME', globalType: 'Message' }; window.setReplyGlobalType('Message');
    checkComposerRestrictions(document.getElementById('detail-reply-input'), 'main');
    
    renderAllCommentsLocally();
    setTimeout(() => {
        const scrollArea = document.getElementById("detail-thread-container").parentElement;
        if(scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
    }, 50);
    
    await apiCall('addNewComment', payloadToSend);
    
    if(window.isMobileClient && window.isMobileClient()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
    }
    setTimeout(() => loadCaseDetails(caseId), 500);

} catch(e) { 
    hideUploadOverlay();
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
    checkComposerRestrictions(editor, 'inline');
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
const fileList = activeInlineBox.querySelector('.inline-file-list');
fileList.innerHTML = '';
inlinePendingFiles.forEach((file, idx) => {
fileList.innerHTML += createBeautifulFileCard(file, idx, 'removeInlineFile');
});
}

window.removeInlineFile = function(index) { inlinePendingFiles.splice(index, 1); renderInlineFileList(); };

window.triggerInlineMention = function(btn) {
activeInlineBox = btn.closest('[data-id="inline-reply-box"]');
const editor = activeInlineBox.querySelector('.inline-reply-input');
editor.focus();
const sel = window.getSelection(); let range;
if (sel.rangeCount > 0) range = sel.getRangeAt(0);
else { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
const textNode = document.createTextNode(' @');
range.insertNode(textNode); range.setStartAfter(textNode); range.setEndAfter(textNode);
sel.removeAllRanges();
sel.addRange(range);
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
            `<div onclick="selectInlineMentionUser('${String(u.name||'').replace(/'/g, "\\'")}', '${String(u.email||'').replace(/'/g, "\\'")}')" class="p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 text-left">
                <div class="text-xs font-bold text-slate-800 leading-tight">${u.name || u.email || 'Unknown'}</div>
                <div class="text-[9px] text-slate-500 truncate mt-0.5">${u.email || ''}</div>
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
const emailLower = String(email).toLowerCase();
const nameLower = String(name).toLowerCase();
const isAdmin = currentCaseAdmins.some(a => {
const aLower = String(a).toLowerCase();
return aLower === emailLower || aLower === nameLower || aLower.includes(nameLower) || nameLower.includes(aLower);
});
const isUser = currentCaseUsers.some(u => {
const uLower = String(u).toLowerCase();
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
      <div onclick="finalizeInlineMention('${String(name).replace(/'/g, "\\'")}', '${String(email).replace(/'/g, "\\'")}', 'Admin')" class="p-2 hover:bg-blue-50 cursor-pointer border-b text-xs font-bold text-blue-700">👑 Admin</div>
      <div onclick="finalizeInlineMention('${String(name).replace(/'/g, "\\'")}', '${String(email).replace(/'/g, "\\'")}', 'User')" class="p-2 hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-700">👤 User</div>`;
}
};

window.finalizeInlineMention = function(name, email, role) {
if(!activeInlineBox) return;
const emailLower = String(email).toLowerCase();
const nameLower = String(name).toLowerCase();
const isAdmin = currentCaseAdmins.some(a => String(a).toLowerCase() === emailLower || String(a).toLowerCase() === nameLower);
const isUser = currentCaseUsers.some(u => String(u).toLowerCase() === emailLower || String(u).toLowerCase() === nameLower);
const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
if (!isAdmin && !isUser && !isCreator) {
    if (role === 'Admin') currentCaseAdmins.push(email);
    else currentCaseUsers.push(email);

    if (!window.currentCaseAllMembers) window.currentCaseAllMembers = [];
    window.currentCaseAllMembers.push(email);

    const detAdm = document.getElementById('detail-admins');
    const detUsr = document.getElementById('detail-users');
    const shortName = window.getUserNameByEmail(email);
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
const container = btn.closest('[data-id="reply-container"]');
const replyBox = container.querySelector('[data-id="inline-reply-box"]');
const inputDiv = replyBox.querySelector('.inline-reply-input');
const msgHTML = inputDiv.innerHTML.trim();
if (!inputDiv.querySelector('.mention-badge')) {
return showCustomDialog("Notice", "You must select someone using @ before sending a reply.", false);
}
if(!msgHTML && inlinePendingFiles.length === 0) return showCustomDialog("Notice", "Please write a message or attach a file.", false);
const caseId = document.getElementById('detail-conv-id').value;

const mentionedEmails = Array.from(inputDiv.querySelectorAll('.mention-badge'))
    .map(badge => badge.dataset.email)
    .filter(Boolean)
    .join(',');
const toggleBtn = container.querySelector('.inline-reply-toggle-btn');
const typeVal = replyBox.querySelector('.inline-type-val').value;
btn.disabled = true;
const originalText = btn.innerText;
btn.innerText = '...';
try {
    let fileUrl = '';
    let fileName = '';
    
    // ✅ SMART FIX: Support multiple files with live progress
    if(inlinePendingFiles.length > 0) { 
        showUploadOverlay("Uploading Attachments", inlinePendingFiles);
        const uploadedData = await uploadMultipleFilesResumable(inlinePendingFiles);
        fileUrl = uploadedData.map(d => d.url).join(',');
        fileName = uploadedData.map(d => d.name).join(',');
        hideUploadOverlay();
    }

    const tempId = "TEMP-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    const payload = { caseId: caseId, text: msgHTML, mentionType: typeVal, sender: currentUser.email, receiver: mentionedEmails, parentAskId: toggleBtn?toggleBtn.getAttribute('data-askid'):'', threadId: toggleBtn?toggleBtn.getAttribute('data-threadid'):'', threadColor: toggleBtn?toggleBtn.getAttribute('data-threadcolor'):'', attachmentUrl: fileUrl, attachmentFileName: fileName, uniqueId: tempId };
    
    const localSenderName = currentUser.name || currentUser.email;
    seenMessages.add(tempId); 
    
    allLoadedComments.push({
         caseId: String(caseId).trim(),
         timestamp: new Date().getTime(),
         sender: localSenderName,
         receiver: mentionedEmails, 
         text: msgHTML,
         attachmentUrl: fileUrl,
         attachmentFileName: fileName,
         type: typeVal,
         askId: '', 
         status: '',
         parentAskId: payload.parentAskId,
         uniqueId: tempId, 
         threadId: payload.threadId || 'LOCAL-T-' + Math.random(),
         threadColor: payload.threadColor || '#f8fafc'
     });

    if (payload.parentAskId) {
        notifications = notifications.filter(n => n.askId !== payload.parentAskId && n.id !== payload.parentAskId);
        unreadCount = notifications.length;
        updateNotificationUI();
    }

    inputDiv.innerHTML = '';
    inlinePendingFiles = []; replyBox.querySelector('.inline-file-list').innerHTML = ''; replyBox.classList.add('hidden');
    
    renderAllCommentsLocally();

    await apiCall('addNewComment', payload);
    
    if(window.isMobileClient && window.isMobileClient()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
    }
    setTimeout(() => loadCaseDetails(caseId), 500);

} catch(e) { 
    hideUploadOverlay();
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
window.renderFileList = function() {
const list = document.getElementById('file_list');
list.innerHTML = '';
pendingFiles.forEach((file, index) => {
list.innerHTML += createBeautifulFileCard(file, index, 'removePendingFile');
});
};
window.removePendingFile = function(index) { pendingFiles.splice(index, 1); renderFileList(); };

// ==========================================
// NEW CASE MEMBER SEARCH & RENDER FIX
// ==========================================
window.renderNewCaseMembers = function() {
const listContainer = document.getElementById('new_case_members_list');
if (!listContainer) return;
listContainer.innerHTML = composerRecipients.map((m, i) => `
    <span class="px-2 py-1 ${m.role === 'Admin' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-800 border-slate-200'} border text-xs rounded-lg font-bold shadow-sm flex items-center gap-1">
        ${m.role === 'Admin' ? '👑' : '👤'} ${escapeHTML(m.name)}
        ${(m.email !== currentUser.email) ? `<button type="button" onclick="removeNewCaseMember(${i})" class="ml-1 text-red-500 hover:text-red-700 font-extrabold">&times;</button>` : ''}
    </span>
`).join('');
};

window.removeNewCaseMember = function(index) {
composerRecipients.splice(index, 1);
window.renderNewCaseMembers();
};

window.searchNewCaseMember = debounce(function(q) {
const dropdown = document.getElementById('new_case_member_dropdown');
if (!q) {
dropdown.classList.add('hidden');
return;
}
const existingEmails = composerRecipients.map(r => r.email);
const queryLower = q.toLowerCase();

const filtered = allUsersList.filter(u => {
    if(!u || !u.email) return false;
    const uName = String(u.name || '').toLowerCase();
    const uEmail = String(u.email).toLowerCase();
    return (uName.includes(queryLower) || uEmail.includes(queryLower)) && !existingEmails.includes(u.email);
});

if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="p-3 text-xs text-slate-500 text-center">No users found</div>';
} else {
    dropdown.innerHTML = filtered.map(u => `
        <div class="p-3 hover:bg-indigo-50 border-b flex justify-between items-center cursor-pointer">
            <div class="flex flex-col">
                <span class="text-sm font-medium text-slate-800">${escapeHTML(u.name || u.email || 'Unknown')}</span>
                <span class="text-[10px] text-slate-500">${escapeHTML(u.email || '')}</span>
            </div>
            <div class="flex gap-1">
                <button type="button" onclick="addNewCaseMember('${String(u.name || '').replace(/'/g, "\\'")}', '${String(u.email||'').replace(/'/g, "\\'")}', 'Admin')" class="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] rounded font-bold shadow-sm">Admin</button>
                <button type="button" onclick="addNewCaseMember('${String(u.name || '').replace(/'/g, "\\'")}', '${String(u.email||'').replace(/'/g, "\\'")}', 'User')" class="px-2 py-1 bg-slate-200 text-slate-700 text-[10px] rounded font-bold shadow-sm">User</button>
            </div>
        </div>
    `).join('');
}
dropdown.classList.remove('hidden');
}, 200);

window.addNewCaseMember = function(name, email, role) {
composerRecipients.push({ name: name || window.getUserNameByEmail(email), email: email, role: role });
document.getElementById('new_case_member_search').value = '';
document.getElementById('new_case_member_dropdown').classList.add('hidden');
window.renderNewCaseMembers();
};

async function loadLabelsForForm() { availableLabels = await apiCall('getLabels'); renderLabels(); populateFilterDropdowns(); }
function renderLabels() { document.getElementById('labels_container').innerHTML = availableLabels.map(label => `<span onclick="toggleLabel('${label}')" class="cursor-pointer px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm border ${selectedLabels.has(label) ? 'bg-green-800 text-white border-green-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${label}</span>`).join(''); }
window.toggleLabel = function(label) { selectedLabels.has(label) ? selectedLabels.delete(label) : selectedLabels.add(label); renderLabels(); };
window.createNewLabel = async function() { const val = document.getElementById('new_label_input').value.trim(); if(!val) return; await apiCall('addLabel', {label: val}); availableLabels.push(val); selectedLabels.add(val); document.getElementById('new_label_input').value = ''; renderLabels(); populateFilterDropdowns(); };

window.openModal = function() {
document.getElementById('appModal').classList.remove('hidden');
pendingFiles = []; renderFileList();
if(document.getElementById('f_message_rich')) document.getElementById('f_message_rich').innerHTML = ''; 
if(document.getElementById('f_details_rich')) document.getElementById('f_details_rich').innerHTML = ''; 

document.getElementById('new_case_member_search').value = '';
composerRecipients = []; composerRecipients.push({ name: currentUser.name || currentUser.email, email: currentUser.email, role: 'Admin' }); 
window.renderNewCaseMembers(); 
};
window.closeModal = function() { document.getElementById('appModal').classList.add('hidden'); document.getElementById('convForm').reset(); };

window.handleFormSubmit = async function(e) {
e.preventDefault();
const btn = document.getElementById('submitBtn');
btn.disabled = true;
btn.innerText = 'Uploading...';
try {
    let fileUrls = [];
    
    // ✅ SMART FIX: Multi-file handling with real-time UI
    if(pendingFiles.length > 0) { 
        showUploadOverlay("Creating New Case", pendingFiles);
        const uploadedData = await uploadMultipleFilesResumable(pendingFiles);
        fileUrls = uploadedData.map(d => d.url);
        hideUploadOverlay();
    } 
    
    const payload = { 
        createdBy: currentUser.email || currentUser.name, 
        subject: document.getElementById('f_subject').value, 
        details: document.getElementById('f_details_rich') ? document.getElementById('f_details_rich').innerHTML : '', 
        message: document.getElementById('f_message_rich') ? document.getElementById('f_message_rich').innerHTML : '', 
        labels: Array.from(selectedLabels), 
        adminEmails: composerRecipients.filter(r => r.role === 'Admin').map(r => r.email), 
        userEmails: composerRecipients.filter(r => r.role === 'User').map(r => r.email), 
        attachments: fileUrls 
    };
    
    await apiCall('createCase', payload); 
    
    if(window.isMobileClient && window.isMobileClient()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
    }
    window.closeModal(); 
    loadConversations(); 
} catch(err) { 
    hideUploadOverlay();
    showCustomDialog("Error", "Failed to create case.\n" + err.toString(), false);
} finally { 
    btn.disabled = false; 
    btn.innerText = 'Post Case'; 
} 
};

// ==========================================
// LOAD CONVERSATIONS (DASHBOARD FEED)
// ==========================================
async function loadConversations() {
if (window.isOpeningDetailView) return;
const feed = document.getElementById('conversationFeed');
if(!feed) return;
try {
allCasesData = await apiCall('getConversations', currentUser); feed.innerHTML = '';
let counts = { Live: 0, Snooze: 0, Archive: 0 };
const uEmail = (currentUser.email || '').toLowerCase();
const uName = (currentUser.name || '').toLowerCase();

allCasesData.forEach(c => {
    let originalSnoozeMs = parseInt(c.snoozeTime || "0", 10);
    if (String(c.snoozeTime).startsWith('{')) {
        try { originalSnoozeMs = parseInt(JSON.parse(c.snoozeTime)[uEmail], 10) || 0; } catch(e){}
    }
    
    const hasUnread = notifications.filter(n => String(n.caseId).trim() === String(c.id).trim()).length > 0;
    const isSnoozed = originalSnoozeMs > Date.now();
    
    if (c.status === 'Archived') counts.Archive++;
    else if (isSnoozed && !hasUnread) counts.Snooze++;
    else counts.Live++;
});

if(document.getElementById('count-Live')) document.getElementById('count-Live').innerText = counts.Live;
if(document.getElementById('count-Snooze')) document.getElementById('count-Snooze').innerText = counts.Snooze;
if(document.getElementById('count-Archive')) document.getElementById('count-Archive').innerText = counts.Archive;

if(allCasesData.length === 0) { feed.innerHTML = `<p class="text-center py-10 text-slate-500 font-medium">No cases found.</p>`; return; }

const fragment = document.createDocumentFragment();

allCasesData.forEach(conv => {
  const cardTemp = document.getElementById('cardTemplate');
  if(!cardTemp) return;
  const cardFragment = cardTemp.content.cloneNode(true); 
  
  const wrapperDiv = cardFragment.firstElementChild;
  const cardDiv = wrapperDiv.classList.contains('card-main') ? wrapperDiv : wrapperDiv.querySelector('.card-main');
  
  const hasAdminRights = conv.createdBy.toLowerCase().includes(uEmail) || conv.createdBy.toLowerCase().includes(uName) || conv.admins.some(a => String(a).toLowerCase().includes(uEmail) || String(a).toLowerCase().includes(uName));
  
  let originalSnoozeMs = 0;
  const snoozeStr = String(conv.snoozeTime || "").trim();
  
  if (snoozeStr && snoozeStr !== '0' && snoozeStr !== 'NaN') {
      if (snoozeStr.startsWith('{')) {
          try {
              const obj = JSON.parse(snoozeStr);
              originalSnoozeMs = parseInt(obj[uEmail], 10) || 0;
          } catch(e) { originalSnoozeMs = 0; }
      } else {
          originalSnoozeMs = parseInt(snoozeStr, 10) || 0;
      }
  }

  const unreadNotifsForCase = notifications.filter(n => String(n.caseId).trim() === String(conv.id).trim());
  const hasUnread = unreadNotifsForCase.length > 0;
  
  let isSnoozed = false;
  let badgeText = "ACTIVE";
  let badgeClasses = ['bg-emerald-500', 'text-white'];
  if (conv.status === 'Archived') {
      badgeText = "ARCHIVED";
      badgeClasses = ['bg-emerald-700', 'text-white'];
  } else if (hasUnread && originalSnoozeMs > 0) {
      const lastNotif = unreadNotifsForCase[0];
      const replierName = window.getUserNameByEmail(lastNotif.sender);
      const actType = String(lastNotif.type || "REPLY").toUpperCase();
      badgeText = `MOVED TO LIVE: ${actType} BY ${replierName.toUpperCase()}`;
      badgeClasses = ['bg-blue-100', 'text-blue-800', 'border', 'border-blue-300'];
      isSnoozed = false; 
  } else if (originalSnoozeMs > Date.now()) {
      const snoozeDateStr = new Date(originalSnoozeMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      badgeText = `SNOOZED TILL ${snoozeDateStr.toUpperCase()}`;
      badgeClasses = ['bg-orange-100', 'text-orange-700'];
      isSnoozed = true;
  } else if (originalSnoozeMs > 0 && originalSnoozeMs <= Date.now()) {
      badgeText = "MOVED TO LIVE: TIME EXPIRED";
      badgeClasses = ['bg-purple-100', 'text-purple-800', 'border', 'border-purple-200'];
      isSnoozed = false; 
  }

  let safeSnoozeMs = isSnoozed ? originalSnoozeMs : 0;

  cardDiv._cachedLabels = conv.labels; 
  cardDiv._cachedMembers = [...conv.admins, ...conv.users, conv.createdBy];
  
  cardDiv.dataset.convId = String(conv.id).trim(); 
  cardDiv.dataset.subject = String(conv.subject).toLowerCase(); 
  cardDiv.dataset.status = conv.status;
  cardDiv.dataset.snooze = safeSnoozeMs; 
  cardDiv.dataset.snoozeRaw = originalSnoozeMs; 
  cardDiv.dataset.hasAdminRights = hasAdminRights;
  cardDiv.dataset.attachmentsData = JSON.stringify(conv.attachments); 
  cardDiv.dataset.labels = JSON.stringify(conv.labels); 
  cardDiv.dataset.members = JSON.stringify([...conv.admins, ...conv.users, conv.createdBy]); 
  cardDiv.dataset.caseAdmins = JSON.stringify(conv.admins); 
  cardDiv.dataset.caseUsers = JSON.stringify(conv.users);
  if (wrapperDiv !== cardDiv) {
      wrapperDiv.dataset.convId = String(conv.id).trim();
  }

  const creatorName = window.getUserNameByEmail(conv.createdBy);
  
  cardDiv.querySelector('[data-id="conv-id"]').textContent = conv.id; 
  cardDiv.querySelector('[data-id="subject"]').textContent = conv.subject; 
  
  cardDiv.querySelector('[data-id="details"]').innerHTML = typeof makeLinksClickable === 'function' ? makeLinksClickable(conv.details) : conv.details;
  cardDiv.querySelector('[data-id="message"]').innerHTML = typeof makeLinksClickable === 'function' ? makeLinksClickable(conv.message) : conv.message; 
  
  cardDiv.querySelector('[data-id="author"]').textContent = creatorName; 
  cardDiv.querySelector('[data-id="timestamp"]').textContent = new Date(conv.timestamp).toLocaleDateString(); 
  cardDiv.querySelector('[data-id="display-case-id"]').textContent = conv.id;
  
  const avatarEl = cardDiv.querySelector('[data-id="avatar-letter"]');
  if(avatarEl) avatarEl.textContent = String(creatorName).charAt(0).toUpperCase();

  const badge = cardDiv.querySelector('[data-id="status-badge"]');
  badge.className = "text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-widest shadow-sm";
  badge.classList.add(...badgeClasses);
  badge.innerText = badgeText;

  const footerActions = cardDiv.querySelector('.flex.items-center.gap-3.text-sm'); 
  const cbContainer = footerActions.querySelector('.archive-cb-container');
  const snoozeBtn = footerActions.querySelector('.snooze-card-btn'); 
  const unsnoozeBtn = footerActions.querySelector('.unsnooze-card-btn'); 
  const unarchiveBtn = footerActions.querySelector('.unarchive-card-btn'); 
  const checkbox = footerActions.querySelector('.bulk-archive-cb');
  
  cbContainer.classList.add('hidden'); cbContainer.classList.remove('flex'); snoozeBtn.classList.add('hidden'); unsnoozeBtn.classList.add('hidden');
  unarchiveBtn.classList.add('hidden');
  
  if (conv.status === 'Archived') { 
      unarchiveBtn.classList.remove('hidden');
  }

  if (currentTab === 'Live' && conv.status !== 'Archived' && !isSnoozed) { 
      cbContainer.classList.remove('hidden');
      cbContainer.classList.add('flex'); 
      checkbox.disabled = false; 
  }
  
  if (conv.status !== 'Archived') {
      if (isSnoozed) { unsnoozeBtn.classList.remove('hidden'); } 
      else if (currentTab === 'Live') { snoozeBtn.classList.remove('hidden'); }
  }
  
  const lCont = cardDiv.querySelector('[data-id="labels-container"]');
  conv.labels.forEach(l => { if(l){ const s = document.createElement('span'); s.className='px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded font-bold'; s.innerText=l; lCont.appendChild(s); } });
  const admCont = cardDiv.querySelector('[data-id="admins-container"]'); 
  const usrCont = cardDiv.querySelector('[data-id="users-container"]');
  conv.admins.forEach(a => { if(a) admCont.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${window.getUserNameByEmail(a)}</span>`; });
  conv.users.forEach(u => { if(u) usrCont.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${window.getUserNameByEmail(u)}</span>`; });
  
  let showInitial = false;
  if (currentTab === 'Live' && conv.status !== 'Archived' && !isSnoozed) showInitial = true;
  if (currentTab === 'Archive' && conv.status === 'Archived') showInitial = true;
  if (currentTab === 'Snooze' && conv.status !== 'Archived' && isSnoozed) showInitial = true;
  
  wrapperDiv.style.display = showInitial ? 'block' : 'none';

  fragment.appendChild(cardFragment);
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
