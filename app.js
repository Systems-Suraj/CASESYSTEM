// ==========================================
// CONFIGURATION: REPLACE THIS URL!
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycby7v3RgQBtfhHAIMA5wFA1IL-Qife_1jSF341RBvYt4jqiuA8-oA6E4cg-F_1jM4jPWOQ/exec"; 

// ==========================================
// API COMMUNICATION (Replaces google.script.run)
// ==========================================
async function apiCall(action, params = {}) {
    if (currentUser && currentUser.email) {
        params.reqUserEmail = currentUser.email; 
    }
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: action, params: params })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || result.message);
        return result.data !== undefined ? result.data : result;
    } catch (err) {
        console.error(`API Error [${action}]:`, err);
        throw err;
    }
}

// ==========================================
// STATE VARIABLES
// ==========================================
let currentUser = null; 
let loginStep = 1;      
let detectedUser = null;
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

// === UTILITY: DEBOUNCE FOR MOBILE PERFORMANCE ===
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ==========================================
// DOM READY AND EVENT LISTENERS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  checkAuthStatus();
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
  document.getElementById('snoozeDateTime').min = localISOTime;

  function handleScroll(e) {
      if (document.getElementById("caseDetailView").classList.contains('hidden')) return;
      const caseId = document.getElementById("detail-conv-id").value;

      if (!caseId) return;

      const el = e.target;
      if (el === document || el === window) {
          if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100) {
              loadCommentsPaginated(caseId);
         }
      } 
      else if (el && el.classList && el.classList.contains('overflow-y-auto')) {
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
              loadCommentsPaginated(caseId);
          }
      }
  }
  
  let ticking = false;
  function optimizedScroll(e) {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        handleScroll(e);
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

// ==========================================
// MENTION BLOCK LOGIC
// ==========================================
document.addEventListener('keydown', function(e) {
    const target = e.target;
    if (target && (target.id === 'detail-reply-input' || target.classList?.contains('inline-reply-input'))) {
        const editor = target;
        const sel = window.getSelection();
        let isTypingMention = false;
        
        if (sel.rangeCount > 0 && sel.getRangeAt(0).startContainer.nodeType === Node.TEXT_NODE) {
            const range = sel.getRangeAt(0);
            const text = range.startContainer.textContent.substring(0, range.startOffset);
            const currentWord = text.split(/[\s\u00A0]+/).pop(); 
            if (currentWord && currentWord.startsWith('@')) {
                isTypingMention = true;
            }
        }

        if (e.key.length > 1 || e.key === '@' || e.ctrlKey || e.metaKey || e.altKey) return;
        const hasInitialMention = !!editor.querySelector('.mention-badge');
        const isDifferentMode = editor.id === 'detail-reply-input' && typeof replyComposerState !== 'undefined' && replyComposerState.mode === 'DIFFERENT';
        
        if (!hasInitialMention && !isTypingMention) {
            e.preventDefault();
            return;
        }

        if (isDifferentMode && !isTypingMention) {
            e.preventDefault();
            return;
        }
    }
});

document.addEventListener('paste', function(e) {
    const target = e.target;
    if (target && (target.id === 'detail-reply-input' || target.classList?.contains('inline-reply-input'))) {
        const editor = target;
        const hasInitialMention = !!editor.querySelector('.mention-badge');
        const isDifferentMode = editor.id === 'detail-reply-input' && typeof replyComposerState !== 'undefined' && replyComposerState.mode === 'DIFFERENT';

        if (!hasInitialMention) {
            e.preventDefault();
            return;
        }
        if (isDifferentMode) {
            e.preventDefault();
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

function closeDialog() { 
    document.getElementById('customDialog').classList.add('hidden');
}

// ==========================================
// AUTHENTICATION LOGIC (Fetch Based)
// ==========================================
function checkAuthStatus() {
  const localUser = localStorage.getItem("user");
  if (localUser) { 
      showAppScreen(JSON.parse(localUser)); return;
  }
}

function handleNextOrLogin() {
  const idVal = document.getElementById("login_id").value.trim();
  const statusEl = document.getElementById("login_status");
  const loginBtn = document.getElementById("loginBtn");
  
  if (loginStep === 1) {
    if(!idVal) return;
    loginBtn.disabled = true;
    
    apiCall('verifyUserId', { id: idVal })
      .then(res => {
        loginBtn.disabled = false;
        if(res.success) {
          loginStep = 2; detectedUser = res;
          document.getElementById('login_id').disabled = true;
          document.getElementById('nameField').classList.remove('hidden'); document.getElementById('login_name').value = res.name;
          document.getElementById('pwdField').classList.remove('hidden'); document.getElementById('btnText').innerText = "Sign In";
        } else { 
          statusEl.innerText = res.message || "User not found."; 
        }
      })
      .catch(err => {
        loginBtn.disabled = false;
        statusEl.innerText = "Error connecting to server.";
      });

  } else if (loginStep === 2) {
    const pwd = document.getElementById("login_password").value.trim();
    if(!pwd) return;
    loginBtn.disabled = true;
    
    apiCall('loginUser', { mobileOrEmail: detectedUser.mobile || detectedUser.email, password: pwd, isAutoLogin: false })
      .then(handleLoginResponse)
      .catch(err => {
         loginBtn.disabled = false;
         statusEl.innerText = "Error connecting to server.";
      });
  }
}

function handleLoginResponse(res) {
  if(res.status === "success" || res.success){ 
      localStorage.setItem("user", JSON.stringify(res.user));
      showAppScreen(res.user); 
  } else { 
      document.getElementById("login_status").innerText = res.message || "Login failed.";
      document.getElementById("loginBtn").disabled = false;
  }
}

function logoutUser() { 
  localStorage.removeItem("user");
  currentUser = null;
  document.getElementById("appView").classList.add("hidden"); 
  document.getElementById("loginView").classList.remove("hidden");
  loginStep = 1;
  document.getElementById("login_id").value = "";
  document.getElementById("login_id").disabled = false;
  document.getElementById("nameField").classList.add("hidden");
  document.getElementById("pwdField").classList.add("hidden");
  document.getElementById("login_password").value = "";
  document.getElementById("btnText").innerText = "Continue";
  document.getElementById("login_status").innerText = "";
  checkAuthStatus();
}

function showAppScreen(userObj) {
  currentUser = userObj;
  document.getElementById("loggedInUserEmail").innerText = userObj.name || userObj.email;
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  fetchUsersForMentions(); 
  loadConversations();
  loadLabelsForForm();
}

// ==========================================
// HELPERS
// ==========================================
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[match]));
}

function getMessageOnly(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    temp.querySelectorAll('.mention-badge').forEach(b => b.remove());
    let msgOnly = temp.textContent || temp.innerText || "";
    return msgOnly.replace(/\u00A0/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ==========================================
// FILTERS & DROPDOWNS
// ==========================================
function switchTab(tab) {
  currentTab = tab;
  ['Live', 'Snooze', 'Archive'].forEach(t => { 
    document.getElementById(`tab-${t}`).className = t === tab 
      ? "px-6 py-4 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition-colors" 
      : "px-6 py-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors"; 
  });
  document.getElementById('bulkArchiveBtn').classList.toggle('hidden', tab !== 'Live');
  document.querySelectorAll('.archive-cb-container').forEach(container => {
      if (tab === 'Live') { container.classList.remove('hidden'); container.classList.add('flex'); } 
      else { container.classList.add('hidden'); container.classList.remove('flex'); }
      container.querySelector('.bulk-archive-cb').checked = false;
  });
  document.getElementById('reply_mention_dropdown').classList.add('hidden');
  document.querySelectorAll('.inline-mention-dropdown').forEach(d => d.classList.add('hidden'));

  applyFilters();
}

function populateFilterDropdowns() {
    renderLookerDropdown('labelsDropdown', availableLabels, 'Label');
    renderLookerDropdown('membersDropdown', allUsersList.map(u => u.name), 'Member');
}

function renderLookerDropdown(containerId, items, type) {
    const container = document.getElementById(containerId);
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

function toggleDropdown(id, forceClose = false) {
    const drop = document.getElementById(id);
    if (forceClose) {
        drop.classList.add('hidden');
    } else {
        const isClosing = !drop.classList.contains('hidden');
        if (isClosing) {
            drop.classList.add('hidden');
        } else {
            document.querySelectorAll('[id$="Dropdown"]').forEach(d => { if(d.id !== id) d.classList.add('hidden'); });
            drop.classList.remove('hidden');
            drop.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = cb.hasAttribute('data-applied');
            });
            const search = drop.querySelector('input[type="text"]');
            if(search) { search.value = ''; searchInDropdown(search, id); }
        }
    }
}

let dropdownSearchTimeout;
function searchInDropdown(input, containerId) {
    clearTimeout(dropdownSearchTimeout);
    const term = input.value.toLowerCase();
    dropdownSearchTimeout = setTimeout(() => {
        const items = document.getElementById(containerId).querySelectorAll('.dropdown-item');
        items.forEach(item => {
            const text = item.dataset.search;
            item.style.display = text.includes(term) ? 'flex' : 'none';
        });
    }, 150);
}

function selectAllInDropdown(containerId) {
    const items = document.getElementById(containerId).querySelectorAll('.dropdown-item');
    items.forEach(item => {
        if (item.style.display !== 'none') {
            item.querySelector('input[type="checkbox"]').checked = true;
        }
    });
}

function clearAllInDropdown(containerId) {
    const items = document.getElementById(containerId).querySelectorAll('.dropdown-item');
    items.forEach(item => {
        if (item.style.display !== 'none') {
            item.querySelector('input[type="checkbox"]').checked = false;
        }
    });
}

function applyLookerFilters(containerId, type) {
    const allBoxes = document.getElementById(containerId).querySelectorAll('input[type="checkbox"]');
    allBoxes.forEach(cb => {
        if (cb.checked) cb.setAttribute('data-applied', 'true');
        else cb.removeAttribute('data-applied');
    });
    const appliedBoxes = Array.from(document.getElementById(containerId).querySelectorAll('input[type="checkbox"][data-applied="true"]'));
    const count = appliedBoxes.length;
    const btnText = document.getElementById(containerId + 'Text');
    if (count === 0) {
        btnText.innerText = `Filter ${type}s`;
        btnText.classList.remove('text-indigo-700', 'font-extrabold');
    } else if (count === 1) {
        btnText.innerText = appliedBoxes[0].value;
        btnText.classList.add('text-indigo-700', 'font-extrabold');
    } else {
        btnText.innerText = `${count} Selected`;
        btnText.classList.add('text-indigo-700', 'font-extrabold');
    }

    toggleDropdown(containerId, true);
    applyFilters();
}

const applyFilters = debounce(function() {
  const idQuery = document.getElementById('filterId').value.toLowerCase();
  const checkedLabels = Array.from(document.querySelectorAll('.flabel[data-applied="true"]')).map(cb => cb.value);
  const checkedMembers = Array.from(document.querySelectorAll('.fmember[data-applied="true"]')).map(cb => cb.value.toLowerCase());
  
  const feed = document.getElementById('conversationFeed');
  
  Array.from(feed.children).forEach(card => {
    if(!card.dataset.convId) return; 
    const isArchived = card.dataset.status === 'Archived'; 
    const snoozeTime = parseInt(card.dataset.snooze || 0); 
    const isSnoozed = snoozeTime > Date.now();
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
function processBulkArchive() {
  const selectedIds = Array.from(document.querySelectorAll('.bulk-archive-cb:checked')).map(cb => cb.closest('.card-main').dataset.convId);
  if(selectedIds.length === 0) return showCustomDialog("Notice", "Please select at least one case to archive.", false);
  showCustomDialog("Confirm Archive", `Are you sure you want to archive ${selectedIds.length} selected case(s)?\n\nCase IDs: \n${selectedIds.join('\n')}`, true, async () => {
      const btn = document.getElementById('bulkArchiveBtn'); btn.innerText = "Archiving...";
      try { await apiCall('bulkArchive', { ids: selectedIds, user: currentUser.email || currentUser.name }); loadConversations(); } catch(e) { showCustomDialog("Error", "Failed to archive.", false); }
      btn.innerText = "Archive Selected";
  });
}

async function processUnarchive(btn) {
  const convId = btn.dataset.convId || btn.closest('.card-main').dataset.convId; 
  btn.innerText = "Unarchiving...";
  btn.disabled = true;
  try { await apiCall('unarchiveCaseServer', { id: convId, user: currentUser.email || currentUser.name }); loadConversations();
  if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail();
  } catch(e) { showCustomDialog("Error", "Failed to unarchive.", false); btn.innerText = "📂 Un-Archive"; btn.disabled = false; }
}

function openSnoozeModal(btn) { 
    document.getElementById('snoozeConvId').value = btn.dataset.convId || btn.closest('.card-main').dataset.convId;
    document.getElementById('snoozeModal').classList.remove('hidden');
}

async function confirmSnooze() {
    const dt = document.getElementById('snoozeDateTime').value;
    if(!dt) return showCustomDialog("Notice", "Please select a date/time.", false);
    const timestamp = new Date(dt).getTime(); const id = document.getElementById('snoozeConvId').value;
    try { await apiCall('snoozeCase', { id: id, time: timestamp }); document.getElementById('snoozeModal').classList.add('hidden'); loadConversations(); if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail();
    } catch(e) { showCustomDialog("Error", "Failed to snooze.", false); }
}

async function processUnsnooze(btn) {
    const convId = btn.dataset.convId || btn.closest('.card-main').dataset.convId; 
    btn.innerText = "Un-snoozing..."; btn.disabled = true;
    try { await apiCall('unsnoozeCaseServer', { id: convId }); loadConversations(); if(!document.getElementById('caseDetailView').classList.contains('hidden')) closeCaseDetail();
    } catch(e) { showCustomDialog("Error", "Failed to un-snooze.", false); btn.innerText = "🔔 Un-Snooze"; btn.disabled = false; }
}

function openSnoozeModalFromCard(btn) {
  const convId = btn.closest('.card-main').dataset.convId;
  if(!convId) return;
  document.getElementById('snoozeConvId').value = convId;
  document.getElementById('snoozeModal').classList.remove('hidden');
}

// ==========================================
// MEMBER MANAGEMENT
// ==========================================
const searchNewCaseMember = debounce(function(q) {
   const dropdown = document.getElementById('new_case_member_dropdown');
   if(!q) { dropdown.classList.add('hidden'); return; }
   const qLower = q.toLowerCase();
   const filtered = allUsersList.filter(u =>
      (u.name.toLowerCase().includes(qLower) || u.email.toLowerCase().includes(qLower)) &&
      !composerRecipients.some(r => r.email === u.email)
    );
   if(filtered.length === 0) { dropdown.innerHTML = '<div class="p-3 text-xs text-slate-500">No users found</div>'; }
   else {
      dropdown.innerHTML = filtered.map(u => `
        <div class="p-2 hover:bg-indigo-50 cursor-pointer border-b flex justify-between items-center text-sm">
           <span class="font-medium text-slate-800">${u.name}</span>
           <div class="flex gap-1">
             <button type="button" onclick="addNewCaseMember('${u.name.replace(/'/g, "\\'")}', '${u.email.replace(/'/g, "\\'")}', 'Admin')" class="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-bold hover:bg-blue-200">Admin</button>
             <button type="button" onclick="addNewCaseMember('${u.name.replace(/'/g, "\\'")}', '${u.email.replace(/'/g, "\\'")}', 'User')" class="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded font-bold hover:bg-slate-300">User</button>
           </div>
         </div>`).join('');
   }
   dropdown.classList.remove('hidden');
}, 200);

function addNewCaseMember(name, email, role) {
   if(composerRecipients.some(r => r.email === email)) return;
   composerRecipients.push({ name, email, role });
   document.getElementById('new_case_member_search').value = '';
   document.getElementById('new_case_member_dropdown').classList.add('hidden');
   renderNewCaseMembers();
}

function removeNewCaseMember(index) {
   composerRecipients.splice(index, 1);
   renderNewCaseMembers();
}

function renderNewCaseMembers() {
   const container = document.getElementById('new_case_members_list');
   container.innerHTML = composerRecipients.map((r, i) => `
     <span class="px-2 py-1 ${r.role === 'Admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'} border text-[11px] rounded font-bold shadow-sm flex items-center gap-1">
       ${r.role === 'Admin' ? '👑' : '👤'} ${r.name.split('@')[0]}
       ${r.email !== currentUser.email ? `<button type="button" onclick="removeNewCaseMember(${i})" class="hover:text-red-500 ml-1 leading-none text-sm">&times;</button>` : ''}
     </span>
    `).join('');
}

function openManageMembers() {
   tempAdmins = [...currentCaseAdmins].filter(String);
   tempUsers = [...currentCaseUsers].filter(String);
   document.getElementById('manageMembersModal').classList.remove('hidden');
   renderManageMembersList();
}

function closeManageMembers() {
   document.getElementById('manageMembersModal').classList.add('hidden');
   document.getElementById('member_search_input').value = '';
   document.getElementById('member_search_dropdown').classList.add('hidden');
}

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
         <select onchange="updateTempRole('${m.name}', this.value)" class="text-xs font-bold border rounded p-1 focus:outline-none bg-slate-50 text-slate-700">
            <option value="Admin" ${m.role==='Admin'?'selected':''}>Admin</option>
            <option value="User" ${m.role==='User'?'selected':''}>User</option>
         </select>
         <button onclick="removeTempMember('${m.name}')" class="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded font-bold text-lg leading-none">&times;</button>
       </div>
     </div>
   `).join('');
}

function updateTempRole(name, newRole) {
   tempAdmins = tempAdmins.filter(n => n !== name);
   tempUsers = tempUsers.filter(n => n !== name);
   if(newRole === 'Admin') tempAdmins.push(name); if(newRole === 'User') tempUsers.push(name);
   renderManageMembersList();
}

function removeTempMember(name) {
   tempAdmins = tempAdmins.filter(n => n !== name);
   tempUsers = tempUsers.filter(n => n !== name);
   renderManageMembersList();
}

const searchNewMember = debounce(function(q) {
   const dropdown = document.getElementById('member_search_dropdown');
   if(!q) { dropdown.classList.add('hidden'); return; }
   const qLower = q.toLowerCase();
   const filtered = allUsersList.filter(u => 
      (u.name.toLowerCase().includes(qLower) || u.email.toLowerCase().includes(qLower)) &&
      !tempAdmins.includes(u.name) && !tempUsers.includes(u.name)
   );
   if(filtered.length === 0) { dropdown.innerHTML = '<div class="p-3 text-xs text-slate-500">No users found</div>'; }
   else {
      dropdown.innerHTML = filtered.map(u => `
        <div class="p-3 hover:bg-indigo-50 border-b flex justify-between items-center">
           <span class="text-sm font-medium text-slate-800">${u.name}</span>
           <div class="flex gap-1">
             <button type="button" onclick="addNewTempMember('${u.name.replace(/'/g, "\\'")}', 'Admin')" class="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-bold hover:bg-blue-200 transition-colors">Admin</button>
             <button type="button" onclick="addNewTempMember('${u.name.replace(/'/g, "\\'")}', 'User')" class="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded font-bold hover:bg-slate-300 transition-colors">User</button>
           </div>
        </div>`).join('');
   }
   dropdown.classList.remove('hidden');
}, 200);

function addNewTempMember(name, role) {
   tempAdmins = tempAdmins.filter(n => n !== name);
   tempUsers = tempUsers.filter(n => n !== name);

   if(role === 'Admin') tempAdmins.push(name);
   else tempUsers.push(name);

   document.getElementById('member_search_input').value = '';
   document.getElementById('member_search_dropdown').classList.add('hidden');
   renderManageMembersList();
}

async function saveManagedMembers() {
   const btn = document.getElementById('saveMembersBtn');
   btn.innerText = "Saving...";
   btn.disabled = true;
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
   } catch(e) { showCustomDialog("Error", "Failed to update members", false);
   } finally { btn.innerText = "Save Changes"; btn.disabled = false; }
}

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
    
    if (queryLower) {
        result = result.filter(u => u.name.toLowerCase().includes(queryLower) || u.email.toLowerCase().includes(queryLower));
    }
    
    return result.filter((u, index, self) => index === self.findIndex((t) => t.email === u.email));
}

// ==========================================
// MENTIONS: MAIN COMPOSER
// ==========================================
function triggerMention() {
  const editor = document.getElementById('detail-reply-input');
  editor.focus();
  
  const sel = window.getSelection();
  let range;
  if (sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
  } else {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
  }
  
  const textNode = document.createTextNode(' @');
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  sel.removeAllRanges();
  sel.addRange(range);
  
  handleReplyTyping({target: editor});
}

function handleReplyTyping(e) {
  const editor = document.getElementById('detail-reply-input');
  const bubbles = editor.querySelectorAll('.mention-badge');
  const currentEmails = Array.from(bubbles).map(b => b.dataset.email);
  const oldLen = replyComposerState.recipients.length;
  replyComposerState.recipients = replyComposerState.recipients.filter(r => currentEmails.includes(r.email));
  if (oldLen !== replyComposerState.recipients.length) {
      renderReplyDynamicUI();
  }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  let text = '';
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
      text = range.startContainer.textContent.substring(0, range.startOffset);
  } else if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
      text = range.startContainer.innerText ? range.startContainer.innerText.substring(0, range.startOffset) : '';
  }

  const match = text.match(/(?:^|\s|\n|\u00A0)@([^\s]*)$/);
  if (match) { 
      mentionSearchQuery = match[1].toLowerCase();
      replySavedRange = range.cloneRange(); 
      showReplyUserList();
  } else { 
      document.getElementById('reply_mention_dropdown').classList.add('hidden');
  }
}

function showReplyUserList() {
    const dropdown = document.getElementById('reply_mention_dropdown');
    dropdown.classList.remove('hidden');
    const filtered = getFilteredUsersForMention(mentionSearchQuery);

    dropdown.innerHTML = filtered.map(u => 
        `<div onclick="selectReplyMentionUser('${u.name.replace(/'/g, "\\'")}', '${u.email.replace(/'/g, "\\'")}')" class="p-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors text-left">
            <div class="text-sm font-bold text-slate-800 leading-tight">${u.name}</div>
            <div class="text-[11px] text-slate-500 truncate mt-0.5">${u.email}</div>
         </div>`
    ).join('');
    if(filtered.length === 0) {
        dropdown.innerHTML = `<div class="p-3 text-[11px] text-slate-400 font-bold uppercase tracking-widest text-center">No match found</div>`;
    }
}

function selectReplyMentionUser(name, email) {
  const dropdown = document.getElementById('reply_mention_dropdown');
  const emailLower = email.toLowerCase();
  const nameLower = name.toLowerCase();
  
  const isAdmin = currentCaseAdmins.some(a => a.toLowerCase().includes(emailLower) || a.toLowerCase().includes(nameLower));
  const isUser = currentCaseUsers.some(u => u.toLowerCase().includes(emailLower) || u.toLowerCase().includes(nameLower));
  const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
  
  if (isAdmin || isCreator) { finalizeReplyMention(name, email, 'Admin'); }
  else if (isUser) { finalizeReplyMention(name, email, 'User'); }
  else {
      if (!window.currentCaseHasAdminRights) {
          showCustomDialog("Action Blocked", "Only Case Admins can add new members.", false);
          dropdown.classList.add('hidden');
          return;
      }
      dropdown.innerHTML = `
        <div class="bg-slate-800 px-3 py-2 text-xs font-bold text-white">Select Role for ${name}</div>
        <div onclick="finalizeReplyMention('${name}', '${email}', 'Admin')" class="p-2 hover:bg-blue-50 cursor-pointer border-b text-sm font-bold text-blue-700">👑 Admin</div>
        <div onclick="finalizeReplyMention('${name}', '${email}', 'User')" class="p-2 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700">👤 User</div>`;
  }
}

function finalizeReplyMention(name, email, role) {
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
      const displayName = name.includes('@') ? name.split('@')[0] : name;
      const badgeHtml = `<span class="px-2 py-0.5 ${role === 'Admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'} border text-[10px] rounded font-bold shadow-sm">${role === 'Admin' ? '👑' : '👤'} ${displayName}</span>`;

      if (role === 'Admin') { detAdm.insertAdjacentHTML('afterbegin', badgeHtml); } 
      else { detUsr.insertAdjacentHTML('afterbegin', badgeHtml); }

      const convId = document.getElementById('detail-conv-id').value;
      apiCall('updateCaseMembers', { id: convId, admins: currentCaseAdmins, users: currentCaseUsers }).catch(e => console.error("Error updating members:", e));
  }

  if(!replyComposerState.recipients.find(r=>r.email === email)) { replyComposerState.recipients.push({name: name, email: email, role: role, type: replyComposerState.globalType, customText: ''}); }
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(replySavedRange);
  const textNode = replySavedRange.startContainer;
  replySavedRange.setStart(textNode, textNode.textContent.lastIndexOf('@', replySavedRange.startOffset - 1)); replySavedRange.deleteContents();
  const badge = document.createElement('span'); badge.contentEditable = "false";
  badge.className = `mention-badge mx-1 shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold ${role === 'Admin' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-800'}`;
  badge.dataset.email = email; badge.innerHTML = `@${name}`;
  
  replySavedRange.insertNode(badge); replySavedRange.setStartAfter(badge); 
  replySavedRange.insertNode(document.createTextNode('\u00A0')); 
  replySavedRange.setStartAfter(badge.nextSibling);
  document.getElementById('reply_mention_dropdown').classList.add('hidden'); renderReplyDynamicUI();
}

function setReplyGlobalType(type) { 
    replyComposerState.globalType = type;
    replyComposerState.recipients.forEach(r => r.type = type);
    const btnReply = document.getElementById('btn_global_reply'); const btnAsk = document.getElementById('btn_global_ask');
    if(type === 'Message') { 
        btnReply.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all bg-white shadow-sm border border-slate-200 text-slate-800";
        btnAsk.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all text-slate-500 hover:text-slate-700";
    } else { 
        btnAsk.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all bg-white shadow-sm border border-slate-200 text-red-700";
        btnReply.className = "px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-extrabold transition-all text-slate-500 hover:text-slate-700";
    }
    renderReplyDynamicUI();
}

function renderReplyDynamicUI() {
  const container = document.getElementById('reply_dynamic_type_area');
  const globalSelector = document.getElementById('global_type_selector');
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
      html += `<div class="flex items-center gap-3 py-2 justify-center"><span class="text-xs text-slate-600 font-medium">Apply to all:</span><button type="button" onclick="setReplyGlobalType('Message')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Message' ? 'bg-slate-800 border-slate-900 text-white shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-50'}">💬 Message All</button><button type="button" onclick="setReplyGlobalType('Ask')" class="px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${replyComposerState.globalType === 'Ask' ? 'bg-red-100 border-red-500 text-red-700 shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-50'}">🎯 Ask All</button></div>`;
    } else {
      html += `<div class="max-h-60 overflow-y-auto pr-1 space-y-2">`;
      html += replyComposerState.recipients.map((r, idx) => `<div class="bg-white p-2.5 rounded border border-slate-200 shadow-sm"><div class="flex justify-between items-center mb-2"><span class="font-bold text-sm text-slate-800 bg-slate-100 px-2 py-0.5 rounded">@${r.name}</span><div class="flex gap-1"><button type="button" onclick="setReplyUserType(${idx}, 'Message')" class="px-3 py-1 text-[10px] rounded-full border font-bold transition-colors ${r.type === 'Message' ? 'bg-slate-800 text-white border-slate-900 shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}">Message</button><button type="button" onclick="setReplyUserType(${idx}, 'Ask')" class="px-3 py-1 text-[10px] rounded-full border font-bold transition-colors ${r.type === 'Ask' ? 'bg-red-100 text-red-700 border-red-400 shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}">Ask</button></div></div><textarea oninput="setReplyUserText(${idx}, this.value)" placeholder="Custom note for ${r.name.split(' ')[0]}..." class="w-full text-sm p-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none" rows="1">${r.customText || ''}</textarea></div>`).join('');
      html += `</div>`;
    }
  }
  container.innerHTML = html;
}

function setReplyComposerMode(mode) { replyComposerState.mode = mode; renderReplyDynamicUI(); }
function setReplyUserType(idx, type) { replyComposerState.recipients[idx].type = type; renderReplyDynamicUI(); }
function setReplyUserText(idx, text) { replyComposerState.recipients[idx].customText = text; }

// ==========================================
// EDIT CASE MODAL LOGIC
// ==========================================
function openEditCaseModal() {
    document.getElementById('edit_subject').value = document.getElementById('detail-subject').innerText;
    document.getElementById('edit_details').value = document.getElementById('detail-details').innerText;
    
    currentEditLabels = new Set(Array.from(document.getElementById('detail-labels').children).map(span => span.innerText));
    renderEditLabels();
    
    const convId = document.getElementById('detail-conv-id').value;
    const card = document.querySelector(`.card-main[data-conv-id="${convId}"]`);
    if(card) {
        currentEditAttachments = JSON.parse(card.dataset.attachmentsData || '[]').filter(String);
    }
    newEditPendingFiles = [];
    renderEditAttachments();
    
    document.getElementById('editCaseModal').classList.remove('hidden');
}

function renderEditLabels() {
    document.getElementById('edit_labels_container').innerHTML = availableLabels.map(label => { 
        const isSelected = currentEditLabels.has(label); 
        return `<span onclick="toggleEditLabel('${label}')" class="cursor-pointer px-3 py-1.5 rounded-full text-[10px] font-bold transition-all shadow-sm border ${isSelected ? 'bg-green-800 text-white border-green-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${label}</span>`; 
    }).join('');
}

function toggleEditLabel(label) {
    currentEditLabels.has(label) ? currentEditLabels.delete(label) : currentEditLabels.add(label);
    renderEditLabels();
}

function renderEditAttachments() {
    const currCont = document.getElementById('edit_current_attachments');
    currCont.innerHTML = currentEditAttachments.map((url, i) => {
        return `<span class="bg-blue-50 text-blue-700 border border-blue-100 text-[10px] px-2 py-1 rounded flex gap-1 items-center font-bold shadow-sm">🔗 File ${i+1} <button type="button" onclick="removeCurrentEditAttachment(${i})" class="text-blue-400 hover:text-blue-700 ml-1 text-sm leading-none">&times;</button></span>`;
    }).join('');
    const newCont = document.getElementById('edit_new_file_list');
    newCont.innerHTML = newEditPendingFiles.map((f, i) => `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] px-2 py-1 rounded flex gap-1 items-center font-bold shadow-sm">${f.name} <button type="button" onclick="removeNewEditFile(${i})" class="text-indigo-400 hover:text-indigo-700 ml-1 text-sm leading-none">&times;</button></span>`).join('');
}

function removeCurrentEditAttachment(index) { currentEditAttachments.splice(index, 1); renderEditAttachments(); }
function handleEditFileSelect(e) { Array.from(e.target.files).forEach(f => { if(newEditPendingFiles.length < 10) newEditPendingFiles.push(f); }); renderEditAttachments(); }
function removeNewEditFile(index) { newEditPendingFiles.splice(index, 1); renderEditAttachments(); }

async function saveCaseEdits() {
    const btn = document.getElementById('saveEditBtn');
    btn.innerText = "Saving...";
    btn.disabled = true;
    
    try {
        let finalUrls = [...currentEditAttachments];
        if(newEditPendingFiles.length > 0) {
            for(let file of newEditPendingFiles) {
                const base64 = await new Promise(res => { const reader = new FileReader(); reader.onload = ev => res(ev.target.result); reader.readAsDataURL(file); });
                const result = await apiCall('uploadFile', { base64: base64, filename: file.name });
                if(result && result.url) finalUrls.push(result.url);
            }
        }

        const payload = {
            id: document.getElementById('detail-conv-id').value,
            subject: document.getElementById('edit_subject').value.trim(),
            details: document.getElementById('edit_details').value.trim(),
            labels: Array.from(currentEditLabels),
            attachments: finalUrls,
            userEmail: currentUser.email
        };
        await apiCall('updateCaseDetails', payload);
        document.getElementById('editCaseModal').classList.add('hidden');
        
        loadConversations(); 
        closeCaseDetail(); 
    } catch(e) {
        showCustomDialog("Error", "Failed to save edits.", false);
    } finally {
        btn.innerText = "Save Changes";
        btn.disabled = false;
    }
}

// ==========================================
// CARD CLICK AND DETAIL VIEW
// ==========================================
function handleCardClick(event, cardEl) {
   if (event.target.closest('button') || event.target.closest('label') || event.target.closest('.archive-cb-container') || event.target.closest('a')) {
       return;
   }
   openCaseDetail(cardEl);
}

function openCaseDetail(cardEl) {
  try {
      const card = cardEl.closest('.card-main');
      const dataset = card.dataset; const convId = dataset.convId;
      
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
      if(editBtn) {
          if(hasAdminRights) { editBtn.classList.remove('hidden'); } 
          else { editBtn.classList.add('hidden'); }
      }

      window.currentCaseAllMembers = JSON.parse(dataset.members || '[]');
      const detAdm = document.getElementById('detail-admins'); detAdm.innerHTML = '';
      const detUsr = document.getElementById('detail-users'); detUsr.innerHTML = '';
      currentCaseAdmins.forEach(a => { if(a) detAdm.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${a.split('@')[0]}</span>`; });
      currentCaseUsers.forEach(u => { if(u) detUsr.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${u.split('@')[0]}</span>`; });
      if(hasAdminRights) {
          detAdm.innerHTML += `<button onclick="openManageMembers()" class="ml-1 text-blue-600 hover:text-blue-800 p-0.5 rounded-full hover:bg-blue-50 transition-colors" title="Manage Members"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>`;
      }

      const attContainer = document.getElementById('detail-attachments'); attContainer.innerHTML = '';
      JSON.parse(dataset.attachmentsData || '[]').forEach(url => { 
          if(url) {
              const cleanUrl = url.replace(/\/view.*/, '/preview');
              attContainer.innerHTML += `
              <div class="flex flex-col gap-2 mt-3 w-full max-w-sm">
                  <div class="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 relative w-full">
                      <iframe src="${cleanUrl}" height="200" class="w-full" allow="autoplay; encrypted-media" frameborder="0" scrolling="no"></iframe>
                  </div>
                  <a href="${url}" target="_blank" class="self-start inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors shadow-sm border border-indigo-100">
                      📎 Open Attachment
                  </a>
              </div>`;
          }
      });
      document.getElementById('detail-conv-id').value = convId;
      const status = dataset.status; const isSnoozed = parseInt(dataset.snooze) > Date.now();
      const unarchiveBtn = document.getElementById('detail-unarchive-btn');
      const unsnoozeBtn = document.getElementById('detail-unsnooze-btn'); const snoozeBtn = document.getElementById('detail-snooze-btn');
      unarchiveBtn.classList.add('hidden'); unsnoozeBtn.classList.add('hidden'); snoozeBtn.classList.add('hidden');
      unarchiveBtn.dataset.convId = convId; unsnoozeBtn.dataset.convId = convId; snoozeBtn.dataset.convId = convId;
      if (hasAdminRights) {
          if (status === 'Archived') unarchiveBtn.classList.remove('hidden');
          else if (isSnoozed) unsnoozeBtn.classList.remove('hidden');
          else snoozeBtn.classList.remove('hidden');
      }

      ['Live', 'Snooze', 'Archive'].forEach(t => {
          if (t !== currentTab) { document.getElementById(`tab-${t}`).style.display = 'none'; }
      });
      replyComposerState = { recipients: [], mode: 'SAME', globalType: 'Message' };
      document.getElementById('detail-reply-input').innerHTML = ''; setReplyGlobalType('Message');
      document.getElementById('dashboardView').classList.add('hidden'); document.getElementById('caseDetailView').classList.remove('hidden');
      
      loadCommentsPaginated(convId, true);
  } catch(e) {
      console.error("Open Case Error:", e);
  }
}

function closeCaseDetail() { 
    document.getElementById('caseDetailView').classList.add('hidden');
    document.getElementById('dashboardView').classList.remove('hidden'); 
    document.getElementById('detail-thread-container').innerHTML = '';
    
    document.getElementById('reply_mention_dropdown').classList.add('hidden');
    document.querySelectorAll('.inline-mention-dropdown').forEach(d => d.classList.add('hidden'));

    ['Live', 'Snooze', 'Archive'].forEach(t => {
        document.getElementById(`tab-${t}`).style.display = '';
    });
    loadConversations();
}

function handleReplyFileSelect(e) {
    Array.from(e.target.files).forEach(file => { 
        if(pendingReplyFiles.length >= 10) return; 
        if(!pendingReplyFiles.some(pf => pf.name === file.name)) pendingReplyFiles.push(file); 
    });
    renderReplyFileList();
}

function renderReplyFileList() { 
    const fileListEl = document.getElementById('reply_file_list');
    if(fileListEl) {
        fileListEl.innerHTML = pendingReplyFiles.map((f, i) => `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] px-2 py-1 rounded-md flex gap-1 items-center font-bold shadow-sm">${f.name} <button type="button" onclick="removeReplyFile(${i})" class="text-indigo-400 hover:text-indigo-700 ml-1 font-extrabold">&times;</button></span>`).join('');
    }
}

function removeReplyFile(index) { 
    pendingReplyFiles.splice(index, 1);
    renderReplyFileList();
}

// ==========================================
// THREAD & COMMENT SYSTEM
// ==========================================
let allLoadedComments = [];
function loadCommentsPaginated(caseId, reset = false) {
    if (isLoading || !hasMore) return;
    isLoading = true;

    const container = document.getElementById("detail-thread-container");

    if (reset) {
        page = 0;
        hasMore = true;
        allLoadedComments = [];
        container.innerHTML = '<div class="loader mx-auto my-10"></div>';
    }

    apiCall('getPaginatedComments', { caseId: caseId, page: page, limit: limit })
        .then(data => {
            isLoading = false;
            
            if (!data || data.length === 0) {
                if(reset) container.innerHTML = `<p class="text-center py-5 text-slate-400 font-medium tracking-wide">Start the discussion below.</p>`;
                hasMore = false;
                return;
            }
            if (data.length < limit) {
                hasMore = false;
            }
            
            allLoadedComments = allLoadedComments.concat(data);
            
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
                        if (parentAsk) parentAsk.children.push(item);
                        else roots.push(item);
                    } else {
                        roots.push(item);
                    }
                });
                roots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                finalHtml += renderThreadHTML(roots, 0); 
            });
            container.innerHTML = finalHtml;
            page++;
        })
        .catch(err => {
            isLoading = false;
            console.error("Error loading comments:", err);
        });
}

function setInlineType(btn, type) {
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
}

function renderThreadHTML(list, level = 0) {
    return list.map(c => {
        const tColor = c.threadColor || '#f8fafc';
        const indentStyle = level > 0 ? `margin-left: ${level * 24}px;` : '';
        
        let badge = '';
        const statusIcon = (c.type === 'Ask' && c.status === 'Closed') ? ' <i class="fas fa-check-circle ml-1"></i>' : '';
        
        if (c.type === 'Ask') {
            badge = `<span class="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Ask ${c.askId ? `#${c.askId}` : ''}${statusIcon}</span>`;
        } else if (c.type === 'Reply') {
            badge = `<span class="bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Reply ${c.parentAskId ? `to #${c.parentAskId}` : ''}</span>`;
        } else {
            badge = `<span class="bg-slate-500 text-white px-2 py-0.5 rounded text-[10px] font-extrabold shadow-sm uppercase">Message</span>`;
        }

        let attachmentPreviewHtml = '';
        if (c.attachmentUrl) {
            const cleanUrlForPreview = c.attachmentUrl.replace(/\/view.*/, '/preview');
            const isAudio = c.attachmentFileName && c.attachmentFileName.match(/\.(mp3|wav|ogg|m4a)$/i);
            const previewHeight = isAudio ? '80' : '300';
            attachmentPreviewHtml = `
            <div class="mt-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm inline-block w-full max-w-md">
                <div class="rounded-lg overflow-hidden bg-slate-50 relative w-full border border-slate-100">
                    <iframe src="${cleanUrlForPreview}" height="${previewHeight}" class="w-full" allow="autoplay; encrypted-media" frameborder="0" scrolling="no"></iframe>
                </div>
                <div class="mt-2 text-left">
                    <a href="${c.attachmentUrl}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-extrabold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors border border-blue-100">
                        📎 ${escapeHTML(c.attachmentFileName || 'Open Full File')}
                    </a>
                </div>
            </div>`;
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
                        <div class="flex-1 border border-slate-300 rounded-xl p-2 flex flex-col shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 transition-all relative" style="background-color: ${tColor}; border-left: 4px solid rgba(0,0,0,0.15);">
                            <div class="flex gap-2 items-center px-1 mb-2 border-b border-black/10 pb-2">
                                <button type="button" onclick="setInlineType(this, 'Reply')" class="inline-type-btn inline-reply-btn px-3 py-1 text-[10px] font-bold rounded-md bg-indigo-600 text-white shadow-sm transition-colors">Reply</button>
                                <button type="button" onclick="setInlineType(this, 'Ask')" class="inline-type-btn inline-ask-btn px-3 py-1 text-[10px] font-bold rounded-md bg-white/60 text-slate-700 hover:bg-white shadow-sm transition-colors">New Ask</button>
                                <input type="hidden" class="inline-type-val" value="Reply">
                            </div>
                            
                            <div contenteditable="true" oninput="handleInlineTyping(event)" data-placeholder="Start typing to mention someone..." class="w-full text-xs outline-none max-h-24 overflow-y-auto leading-relaxed inline-reply-input text-slate-900 px-2 py-2 bg-white/70 border border-black/5 rounded-lg shadow-inner"></div>
                            
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

async function submitDetailReply() {
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
        let fileUrl = '';
        let fileName = '';
        if(pendingReplyFiles.length > 0) { 
            const file = pendingReplyFiles[0];
            const base64 = await new Promise(res => { const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.readAsDataURL(file); });
            const result = await apiCall('uploadFile', { base64: base64, filename: file.name });
            if (result && result.error) throw new Error("File Upload Failed: " + result.error);
            if(result && result.url) { fileUrl = result.url; fileName = result.name || file.name; }
        }

        let payloadToSend;
        if (replyComposerState.mode === 'DIFFERENT' && replyComposerState.recipients.length > 0) {
            payloadToSend = replyComposerState.recipients.map(r => ({
                caseId: caseId,
                text: (r.customText && r.customText.trim() !== '') ? r.customText.trim() : msgHTML,
                mentionType: r.type || 'Message',
                sender: currentUser.email,
                receiver: r.email,
                parentAskId: '',
                threadId: '',
                attachmentUrl: fileUrl,
                attachmentFileName: fileName
            }));
        } else {
            payloadToSend = { 
                caseId: caseId, 
                text: msgHTML, 
                mentionType: replyComposerState.globalType || 'Message', 
                sender: currentUser.email,
                receiver: replyComposerState.recipients.map(r => r.email).join(','),
                parentAskId: '', 
                threadId: '',   
                attachmentUrl: fileUrl,
                attachmentFileName: fileName
            };
        }

        await apiCall('addNewComment', payloadToSend);
        inputDiv.innerHTML = '';
        pendingReplyFiles = []; 
        if(document.getElementById('reply_file_list')) renderReplyFileList();
        replyComposerState = { recipients: [], mode: 'SAME', globalType: 'Message' }; 
        setReplyGlobalType('Message');
        loadCommentsPaginated(caseId, true);
    } catch(e) { 
        showCustomDialog("Error", "Failed to post reply. Reason: \n" + (e.message || e), false);
    } finally { 
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
}

function toggleInlineReply(btn) {
    const container = btn.closest('[data-id="reply-container"]');
    const replyBox = container.querySelector('[data-id="inline-reply-box"]');
    if (replyBox.classList.contains('hidden')) {
        document.querySelectorAll('[data-id="inline-reply-box"]').forEach(box => box.classList.add('hidden'));
        inlinePendingFiles = [];
        activeInlineBox = replyBox;
        replyBox.classList.remove('hidden');
        replyBox.querySelector('.inline-file-list').innerHTML = '';
        replyBox.querySelector('.inline-reply-input').focus();
    } else {
        replyBox.classList.add('hidden');
    }
}

function handleInlineFileSelect(e, inputEl) {
    activeInlineBox = inputEl.closest('[data-id="inline-reply-box"]');
    Array.from(e.target.files).forEach(file => { 
        if(inlinePendingFiles.length >= 10) return; 
        if(!inlinePendingFiles.some(pf => pf.name === file.name)) inlinePendingFiles.push(file); 
    });
    renderInlineFileList();
    inputEl.value = ''; 
}

function renderInlineFileList() {
    if(!activeInlineBox) return;
    const fileListEl = activeInlineBox.querySelector('.inline-file-list');
    fileListEl.innerHTML = inlinePendingFiles.map((f, i) => `<span class="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] px-1.5 py-0.5 rounded flex gap-1 items-center font-bold shadow-sm">${f.name} <button type="button" onclick="removeInlineFile(${i})" class="text-indigo-400 hover:text-indigo-700 ml-1">&times;</button></span>`).join('');
}

function removeInlineFile(index) {
    inlinePendingFiles.splice(index, 1);
    renderInlineFileList();
}

function triggerInlineMention(btn) {
    activeInlineBox = btn.closest('[data-id="inline-reply-box"]');
    const editor = activeInlineBox.querySelector('.inline-reply-input');
    editor.focus();
    const sel = window.getSelection(); let range;
    if (sel.rangeCount > 0) range = sel.getRangeAt(0);
    else { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
    
    const textNode = document.createTextNode(' @');
    range.insertNode(textNode); range.setStartAfter(textNode); range.setEndAfter(textNode);
    sel.removeAllRanges(); sel.addRange(range);
    
    handleInlineTyping({target: editor}); 
}

function handleInlineTyping(e) {
    activeInlineBox = e.target.closest('[data-id="inline-reply-box"]');
    const dropdown = activeInlineBox.querySelector('.inline-mention-dropdown');
    const editor = e.target;
    
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    let text = '';
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
        text = range.startContainer.textContent.substring(0, range.startOffset);
    } else if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
        text = range.startContainer.innerText ? range.startContainer.innerText.substring(0, range.startOffset) : '';
    }

    const match = text.match(/(?:^|\s|\n|\u00A0)@([^\s]*)$/);
    if (match) { 
        inlineMentionSearchQuery = match[1].toLowerCase();
        inlineSavedRange = range.cloneRange(); 
        dropdown.classList.remove('hidden');
        const filtered = getFilteredUsersForMention(inlineMentionSearchQuery);
        dropdown.innerHTML = filtered.map(u => 
            `<div onclick="selectInlineMentionUser('${u.name.replace(/'/g, "\\'")}', '${u.email.replace(/'/g, "\\'")}')" class="p-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors text-left">
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

function selectInlineMentionUser(name, email) {
    if(!activeInlineBox) return;
    const dropdown = activeInlineBox.querySelector('.inline-mention-dropdown');
    const emailLower = email.toLowerCase();
    const nameLower = name.toLowerCase();
    const isAdmin = currentCaseAdmins.some(a => {
        const aLower = a.toLowerCase();
        return aLower === emailLower || aLower === nameLower || aLower.includes(nameLower) || nameLower.includes(aLower);
    });
    const isUser = currentCaseUsers.some(u => {
        const uLower = u.toLowerCase();
        return uLower === emailLower || uLower === nameLower || uLower.includes(nameLower) || nameLower.includes(uLower);
    });
    const isCreator = (document.getElementById('detail-author').innerText || '').toLowerCase().includes(nameLower);
    
    if (isAdmin || isCreator) { finalizeInlineMention(name, email, 'Admin'); }
    else if (isUser) { finalizeInlineMention(name, email, 'User'); }
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
}

function finalizeInlineMention(name, email, role) {
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
}

async function submitInlineReply(btn) {
    const container = btn.closest('[data-id="reply-container"]');
    const replyBox = container.querySelector('[data-id="inline-reply-box"]');
    const inputDiv = replyBox.querySelector('.inline-reply-input');
    const msgHTML = inputDiv.innerHTML.trim();
    if (!inputDiv.querySelector('.mention-badge')) {
        return showCustomDialog("Notice", "You must select someone using @ before sending a reply.", false);
    }
    
    if(!msgHTML && inlinePendingFiles.length === 0) return showCustomDialog("Notice", "Please write a message or attach a file.", false);
    const caseId = document.getElementById('detail-conv-id').value;
    
    const toggleBtn = container.querySelector('.inline-reply-toggle-btn');
    const parentAskId = toggleBtn ? toggleBtn.getAttribute('data-askid') : '';
    const threadId = toggleBtn ? toggleBtn.getAttribute('data-threadid') : '';
    const threadColor = toggleBtn ? toggleBtn.getAttribute('data-threadcolor') : '';
    
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

        await apiCall('addNewComment', { 
            caseId: caseId, 
            text: msgHTML, 
            mentionType: typeVal, 
            sender: currentUser.email,
            parentAskId: parentAskId,
            threadId: threadId,
            threadColor: threadColor,
            attachmentUrl: fileUrl,
            attachmentFileName: fileName
        });
        inputDiv.innerHTML = '';
        inlinePendingFiles = [];
        replyBox.querySelector('.inline-file-list').innerHTML = '';
        replyBox.classList.add('hidden');
        
        loadCommentsPaginated(caseId, true);
    } catch(e) { 
        showCustomDialog("Error", "Failed to post inline reply. Reason:\n" + (e.message || e), false);
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// ==========================================
// CREATE NEW CASE MODAL & UPLOADS
// ==========================================
async function fetchUsersForMentions() { try { allUsersList = await apiCall('getUsers'); populateFilterDropdowns(); } catch(e) {} }

function handleFileSelect(e) { addFiles(e.target.files); } 
function handleDrop(e) { e.preventDefault(); addFiles(e.dataTransfer.files); } 
function addFiles(files) { Array.from(files).forEach(file => { if(pendingFiles.length >= 10) return; if(!pendingFiles.some(pf => pf.name === file.name)) pendingFiles.push(file); }); renderFileList(); } 
function renderFileList() { document.getElementById('file_list').innerHTML = pendingFiles.map((f, i) => `<span class="bg-slate-200 text-xs px-2 py-1 rounded flex gap-1 items-center font-medium">${f.name} <button type="button" onclick="removeFile(${i})" class="text-red-500 hover:text-red-700 font-bold ml-1">&times;</button></span>`).join(''); } 
function removeFile(index) { pendingFiles.splice(index, 1); renderFileList(); }

async function loadLabelsForForm() { availableLabels = await apiCall('getLabels'); renderLabels(); populateFilterDropdowns(); } 
function renderLabels() { document.getElementById('labels_container').innerHTML = availableLabels.map(label => { const isSelected = selectedLabels.has(label); return `<span onclick="toggleLabel('${label}')" class="cursor-pointer px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm border ${isSelected ? 'bg-green-800 text-white border-green-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${label}</span>`; }).join(''); } 
function toggleLabel(label) { selectedLabels.has(label) ? selectedLabels.delete(label) : selectedLabels.add(label); renderLabels(); } 
async function createNewLabel() { const val = document.getElementById('new_label_input').value.trim();
  if(!val) return; await apiCall('addLabel', {label: val});
  availableLabels.push(val); selectedLabels.add(val);
  document.getElementById('new_label_input').value = ''; renderLabels(); populateFilterDropdowns(); 
}

function openModal() { 
  document.getElementById('appModal').classList.remove('hidden');
  pendingFiles = [];
  renderFileList(); 
  document.getElementById('f_message_plain').value = ''; 
  document.getElementById('new_case_member_search').value = '';
  
  composerRecipients = [];
  composerRecipients.push({ name: currentUser.name || currentUser.email, email: currentUser.email, role: 'Admin' });
  renderNewCaseMembers();
} 

function closeModal() { document.getElementById('appModal').classList.add('hidden'); document.getElementById('convForm').reset(); }

async function handleFormSubmit(e) { 
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); btn.disabled = true; btn.innerText = 'Uploading...';
    try {
        let fileUrls = [];
        if(pendingFiles.length > 0) { 
            for(let file of pendingFiles) { 
                const base64 = await new Promise(res => { const reader = new FileReader(); reader.onload = ev => res(ev.target.result); reader.readAsDataURL(file); });
                const result = await apiCall('uploadFile', { base64: base64, filename: file.name });
                if (result && result.error) throw new Error("Upload Error: " + result.error);
                if(result && result.url) fileUrls.push(result.url);
            } 
        } 
        
        const admins = composerRecipients.filter(r => r.role === 'Admin').map(r => r.email);
        const users = composerRecipients.filter(r => r.role === 'User').map(r => r.email);
        const payload = { 
            createdBy: currentUser.email || currentUser.name, 
            subject: document.getElementById('f_subject').value, 
            details: document.getElementById('f_details').value, 
            message: document.getElementById('f_message_plain').value || '', 
            labels: Array.from(selectedLabels), 
            adminEmails: admins, 
            userEmails: users, 
            attachments: fileUrls 
        };
        await apiCall('createCase', payload); 
        closeModal(); 
        loadConversations(); 
    } catch(err) { 
        showCustomDialog("Error", "Failed to create case.\n" + err.toString(), false);
    } finally { 
        btn.disabled = false;
        btn.innerText = 'Post Case';
    } 
}

// ==========================================
// LOAD CONVERSATIONS (DASHBOARD FEED)
// ==========================================
async function loadConversations() {
  const feed = document.getElementById('conversationFeed');
  try {
    allCasesData = await apiCall('getConversations', currentUser); 
    feed.innerHTML = '';
    if(allCasesData.length === 0) { feed.innerHTML = `<p class="text-center py-10 text-slate-500 font-medium">No cases found.</p>`; return; }
    
    const uEmail = (currentUser.email || '').toLowerCase();
    const uName = (currentUser.name || '').toLowerCase();
    
    const fragment = document.createDocumentFragment();
    allCasesData.forEach(conv => {
      const card = document.getElementById('cardTemplate').content.cloneNode(true); 
      const cardDiv = card.querySelector('div');
      
      const isCreator = conv.createdBy.toLowerCase().includes(uEmail) || conv.createdBy.toLowerCase().includes(uName);
      const isAdminRole = conv.admins.some(a => a.toLowerCase().includes(uEmail) || a.toLowerCase().includes(uName));
      const hasAdminRights = isCreator || isAdminRole;

      cardDiv._cachedLabels = conv.labels;
      cardDiv._cachedMembers = [...conv.admins, ...conv.users, conv.createdBy];

      cardDiv.dataset.convId = conv.id; 
      cardDiv.dataset.status = conv.status; 
      cardDiv.dataset.snooze = conv.snoozeTime; 
      cardDiv.dataset.hasAdminRights = hasAdminRights; 
      cardDiv.dataset.attachmentsData = JSON.stringify(conv.attachments); 
      cardDiv.dataset.labels = JSON.stringify(conv.labels); 
      cardDiv.dataset.members = JSON.stringify([...conv.admins, ...conv.users, conv.createdBy]);
      cardDiv.dataset.caseAdmins = JSON.stringify(conv.admins); 
      cardDiv.dataset.caseUsers = JSON.stringify(conv.users);

      card.querySelector('[data-id="conv-id"]').textContent = conv.id;
      card.querySelector('[data-id="subject"]').textContent = conv.subject; 
      card.querySelector('[data-id="details"]').textContent = conv.details; 
      card.querySelector('[data-id="message"]').innerHTML = conv.message;
      card.querySelector('[data-id="author"]').textContent = conv.createdBy; 
      card.querySelector('[data-id="timestamp"]').textContent = new Date(conv.timestamp).toLocaleDateString();
      card.querySelector('[data-id="display-case-id"]').textContent = conv.id;
      
      const isSnoozed = conv.snoozeTime > Date.now(); 
      const badge = card.querySelector('[data-id="status-badge"]');
      badge.className = "text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-widest shadow-sm";
      if(conv.status === 'Archived') { 
          badge.classList.add('bg-emerald-700','text-white');
          badge.innerText = "ARCHIVED";
      } else if(isSnoozed) { 
          badge.classList.add('bg-orange-100','text-orange-700');
          badge.innerText = "SNOOZED";
      } else { 
          badge.classList.add('bg-emerald-500','text-white');
          badge.innerText = "ACTIVE";
      }

      const footerActions = card.querySelector('.flex.items-center.gap-3.text-sm');
      const cbContainer = footerActions.querySelector('.archive-cb-container');
      const snoozeBtn = footerActions.querySelector('.snooze-card-btn');
      const unsnoozeBtn = footerActions.querySelector('.unsnooze-card-btn');
      const unarchiveBtn = footerActions.querySelector('.unarchive-card-btn');
      const checkbox = footerActions.querySelector('.bulk-archive-cb');
      cbContainer.classList.add('hidden'); cbContainer.classList.remove('flex'); 
      snoozeBtn.classList.add('hidden'); unsnoozeBtn.classList.add('hidden'); unarchiveBtn.classList.add('hidden');
      if (hasAdminRights) {
          if (conv.status === 'Archived') { unarchiveBtn.classList.remove('hidden'); } 
          else if (isSnoozed) { unsnoozeBtn.classList.remove('hidden'); } 
      }

      if (currentTab === 'Live' && conv.status !== 'Archived' && !isSnoozed) {
           cbContainer.classList.remove('hidden');
           cbContainer.classList.add('flex'); 
           checkbox.disabled = false; snoozeBtn.classList.remove('hidden');
      }

      const lCont = card.querySelector('[data-id="labels-container"]');
      conv.labels.forEach(l => { if(l){ const s = document.createElement('span'); s.className='px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded font-bold'; s.innerText=l; lCont.appendChild(s); } });
      const admCont = card.querySelector('[data-id="admins-container"]');
      const usrCont = card.querySelector('[data-id="users-container"]');
      conv.admins.forEach(a => { if(a) admCont.innerHTML += `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] rounded font-bold shadow-sm">👑 ${a.split('@')[0]}</span>`; });
      conv.users.forEach(u => { if(u) usrCont.innerHTML += `<span class="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] rounded font-bold shadow-sm">👤 ${u.split('@')[0]}</span>`; });

      fragment.appendChild(card);
    });
    
    feed.appendChild(fragment);
    switchTab(currentTab); 
  } catch(e) { console.error(e); }
}

// ==========================================
// PWA INSTALLATION LOGIC
// ==========================================
let deferredPrompt;
const installBtn = document.getElementById('installAppBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  // Browser ke default popup ko rokein
  e.preventDefault();
  // Event ko save karein taaki button click par use kar sakein
  deferredPrompt = e;
  
  // Apna custom Install Button show karein
  if (installBtn) {
    installBtn.classList.remove('hidden');
    installBtn.classList.add('flex');
  }
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    
    // Install prompt show karein
    deferredPrompt.prompt();
    
    // User ke response ka wait karein
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // Prompt use ho gaya, ab isse clear kar dein
    deferredPrompt = null;
    
    // Button ko wapas hide kar dein
    installBtn.classList.add('hidden');
    installBtn.classList.remove('flex');
  });
}

// Agar user ne app successfully install kar liya hai
window.addEventListener('appinstalled', () => {
  if (installBtn) {
    installBtn.classList.add('hidden');
    installBtn.classList.remove('flex');
  }
  console.log('PWA CaseSys install ho gaya!');
});
