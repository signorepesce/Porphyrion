const root = document.documentElement; const $ = id => document.getElementById(id); const $$ = sel => document.querySelectorAll(sel);
const D = { darkToggle: $('darkToggle'), corsToggle: $('corsToggle'), hatsToggle: $('hatsToggle'), hatsBg: $('hatsBg'), savedList: $('savedList'), historyList: $('historyList'), tabBar: $('tabBar'), tabCollections: $('tab-collections'), tabHistory: $('tab-history'), reqName: $('reqName'), reqFolder: $('reqFolder'), method: $('method'), url: $('url'), authType: $('authType'), authToken: $('authToken'), authUser: $('authUser'), authPass: $('authPass'), apiKey: $('apiKey'), apiVal: $('apiVal'), apiLoc: $('apiLoc'), bearerSect: $('auth-bearer-sect'), basicSect: $('auth-basic-sect'), apikeySect: $('auth-apikey-sect'), body: $('body'), formGrid: $('formGrid'), paramsGrid: $('paramsGrid'), headersGrid: $('headersGrid'), sendBtn: $('sendBtn'), saveBtn: $('saveBtn'), gearBtn: $('gearBtn'), settingsPanel: $('settings-panel'), curlBtn: $('curlBtn'), resp: $('resp'), badge: $('badge'), timing: $('timing'), respSize: $('respSize'), pathIndicator: $('pathIndicator'), ctxMenu: $('ctxMenu'), modalOverlay: $('modalOverlay'), modalTitle: $('modalTitle'), modalInput: $('modalInput'), modalOk: $('modalOk'), modalCancel: $('modalCancel'), folderModal: $('folderModal'), fmPath: $('fmPath'), fmName: $('fmName'), fmAuthType: $('fmAuthType'), fmAuthToken: $('fmAuthToken'), fmAuthUser: $('fmAuthUser'), fmAuthPass: $('fmAuthPass'), fmApiKey: $('fmApiKey'), fmApiVal: $('fmApiVal'), fmApiLoc: $('fmApiLoc'), fmBearerSect: $('fm-auth-bearer'), fmBasicSect: $('fm-auth-basic'), fmApikeySect: $('fm-auth-apikey'), badgeParams: $('badge-params'), badgeHeaders: $('badge-headers'), reqTabs: $('reqTabs'), graphqlPane: $('graphqlPane'), gqlQuery: $('gqlQuery'), gqlVars: $('gqlVars'), respHeadersPane: $('respHeadersPane'), respHeadersTable: $('respHeadersTable'), respTabs: $('respTabs'), respCopyBtn: $('respCopyBtn'), envSelect: $('envSelect'), envEditor: $('envEditor'), addEnvBtn: $('addEnvBtn'), };
function applyTheme(dark) {
    root.setAttribute('data-theme', dark ? 'dark' : 'light'); if (D.darkToggle) D.darkToggle.checked = dark;
    localStorage.setItem('ph-theme', dark ? 'dark' : 'light');
} let hatsActive = true, lastTs = null;
function applyHats(on) {
    root.setAttribute('data-hats', on ? 'on' : 'off'); if (D.hatsToggle) D.hatsToggle.checked = on;
    localStorage.setItem('ph-hats', on ? 'on' : 'off'); hatsActive = on; lastTs = null; cachedHatOp = parseFloat(getComputedStyle(root).getPropertyValue('--hat-op')) || 0.4;
    if (!hatsActive) HATS.forEach(h => { h.el.style.opacity = 0; });
} const HATS = []; let cachedHatOp = 0.4;
class Hat {
    constructor() {
        this.el = document.createElement('img'); this.el.src = '/resources/hat.png';
        D.hatsBg.appendChild(this.el); this.reset();
    } reset(initial = false) {
        this.w = 28 + Math.random() * 55;
        this.x = Math.random() * (window.innerWidth - this.w); this.y = initial ? Math.random() * window.innerHeight : window.innerHeight + this.w;
        this.vx = (Math.random() < .5 ? -1 : 1) * (30 + Math.random() * 70); this.vy = -(45 + Math.random() * 75);
        this.rot = (Math.random() - .5) * 20; this.vr = (Math.random() - .5) * 25; this.el.style.width = this.w + 'px';
        this.el.style.opacity = initial ? cachedHatOp : 0;
    } update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.rot += this.vr * dt; const fb = (window.innerHeight - this.y) / (window.innerHeight * 0.25);
        const ft = this.y / (window.innerHeight * 0.25); this.el.style.opacity = cachedHatOp * Math.max(0, Math.min(1, Math.min(fb, ft)));
        this.el.style.transform = `translate(${this.x}px,${this.y}px) rotate(${this.rot}deg)`;
        if (this.y < -this.w * 2) this.reset();
    }
} for (let i = 0; i < 12; i++) {
    const h = new Hat(); h.reset(true);
    HATS.push(h);
} function animLoop(ts) {
    if (hatsActive) {
        const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0;
        lastTs = ts; HATS.forEach(h => h.update(dt));
    } requestAnimationFrame(animLoop);
} requestAnimationFrame(animLoop);
function makeResizable(resizerId, panelId) {
    const r = $(resizerId), p = $(panelId); let drag = false, sx, sw;
    r.addEventListener('mousedown', e => {
        drag = true; sx = e.clientX; sw = p.offsetWidth; r.classList.add('active');
        document.body.style.cssText = 'cursor:col-resize;user-select:none';
    }); document.addEventListener('mousemove', e => {
        if (drag) p.style.width = Math.max(140, sw + e.clientX - sx) + 'px';
    }); document.addEventListener('mouseup', () => {
        if (!drag) return; drag = false; r.classList.remove('active');
        document.body.style.cssText = '';
    });
} makeResizable('r1', 'panel-saved'); makeResizable('r2', 'panel-req');
const BODY_PLACEHOLDERS = { none: '', form: 'key=value&key2=value2', json: '{\n  "key": "value"\n}', xml: '<?xml version="1.0"?>\n<root>\n  <key>value</key>\n</root>', text: 'Plain text...', toon: 'context:\n  task: example\nitems[2]{id,name}:\n  1,Alpha\n  2,Beta' };
const BODY_CT = { form: 'application/x-www-form-urlencoded', json: 'application/json', xml: 'application/xml', text: 'text/plain', graphql: 'application/json', toon: 'text/toon' };
let formGridData = [{ k: '', v: '' }]; let paramsGridData = [{ k: '', v: '' }]; let headersGridData = [{ k: '', v: '' }];
let bodyType = 'form'; function showAuthSections(val, bearer, basic, apikey) {
    bearer.style.display = val === 'bearer' ? 'block' : 'none';
    basic.style.display = val === 'basic' ? 'block' : 'none'; apikey.style.display = val === 'apikey' ? 'block' : 'none';
} D.authType.addEventListener('change', e => showAuthSections(e.target.value, D.bearerSect, D.basicSect, D.apikeySect));
D.fmAuthType.addEventListener('change', e => showAuthSections(e.target.value, D.fmBearerSect, D.fmBasicSect, D.fmApikeySect));
D.reqTabs.addEventListener('click', e => {
    const tab = e.target.closest('.req-tab'); if (!tab) return;
    $$('.req-tab').forEach(t => t.classList.toggle('active', t === tab)); $$('.req-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + tab.dataset.tab));
}); D.respTabs.addEventListener('click', e => {
    const tab = e.target.closest('.resp-tab');
    if (!tab) return; $$('.resp-tab').forEach(t => t.classList.toggle('active', t === tab));
    const showBody = tab.dataset.rtab === 'body'; D.resp.style.display = showBody ? '' : 'none';
    D.respHeadersPane.style.display = showBody ? 'none' : '';
}); function renderGrid(containerId, dataArray) {
    const container = $(containerId);
    if (!container) return; container.innerHTML = ''; dataArray.forEach((row, idx) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'kv-row'; rowEl.innerHTML = `<input type="text" placeholder="Key" value="${row.k}" data-idx="${idx}" class="k-in"><input type="text" placeholder="Value" value="${row.v}" data-idx="${idx}" class="v-in"><div class="kv-del" data-idx="${idx}">&times;</div>`;
        container.appendChild(rowEl);
    }); const addBtn = document.createElement('button'); addBtn.className = 'kv-add';
    addBtn.textContent = '+ Add Field'; addBtn.onclick = () => {
        dataArray.push({ k: '', v: '' });
        renderGrid(containerId, dataArray); updateBadges();
    }; container.appendChild(addBtn);
} function updateBadges() {
    const pc = paramsGridData.filter(r => r.k).length; const hc = headersGridData.filter(r => r.k).length;
    D.badgeParams.style.display = pc ? 'inline' : 'none'; D.badgeParams.textContent = `(${pc})`;
    D.badgeHeaders.style.display = hc ? 'inline' : 'none'; D.badgeHeaders.textContent = `(${hc})`;
} function initGrids() {
    renderGrid('formGrid', formGridData); renderGrid('paramsGrid', paramsGridData);
    renderGrid('headersGrid', headersGridData); updateBadges();
} initGrids(); document.querySelector('.req-panes').addEventListener('input', e => {
    if (e.target.classList.contains('k-in') || e.target.classList.contains('v-in')) {
        const gridId = e.target.closest('.kv-grid').id;
        const data = gridId === 'formGrid' ? formGridData : (gridId === 'paramsGrid' ? paramsGridData : headersGridData);
        if (e.target.classList.contains('k-in')) data[e.target.dataset.idx].k = e.target.value;
        if (e.target.classList.contains('v-in')) data[e.target.dataset.idx].v = e.target.value;
        updateBadges();
    }
}); document.querySelector('.req-panes').addEventListener('click', e => {
    const delBtn = e.target.closest('.kv-del');
    if (delBtn) {
        const gridId = delBtn.closest('.kv-grid').id; const data = gridId === 'formGrid' ? formGridData : (gridId === 'paramsGrid' ? paramsGridData : headersGridData);
        data.splice(delBtn.dataset.idx, 1); renderGrid(gridId, data); updateBadges();
    }
}); $('bodyTypes').addEventListener('click', e => {
    const btn = e.target.closest('.bt');
    if (!btn) return; bodyType = btn.dataset.type; $$('.bt').forEach(b => b.classList.toggle('active', b === btn));
    setBodyUI(bodyType);
}); function openFolderMeta(path) {
    D.fmPath.value = path; D.fmName.textContent = path;
    const meta = savedList.find(e => e.isFolderMeta && e.path === path) || {}; D.fmAuthType.value = meta.authType || 'inherit';
    D.fmAuthToken.value = meta.authToken || ''; D.fmAuthUser.value = meta.authUser || ''; D.fmAuthPass.value = meta.authPass || '';
    D.fmApiKey.value = meta.apiKey || ''; D.fmApiVal.value = meta.apiVal || ''; D.fmApiLoc.value = meta.apiLoc || 'Header';
    D.fmAuthType.dispatchEvent(new Event('change')); D.folderModal.style.display = 'flex';
} function saveFolderMeta() {
    const p = D.fmPath.value; let meta = savedList.find(e => e.isFolderMeta && e.path === p);
    if (!meta) {
        meta = { id: Math.random().toString(36).substr(2, 9), isFolderMeta: true, path: p };
        savedList.push(meta);
    } meta.authType = D.fmAuthType.value; meta.authToken = D.fmAuthToken.value.trim();
    meta.authUser = D.fmAuthUser.value.trim(); meta.authPass = D.fmAuthPass.value.trim();
    meta.apiKey = D.fmApiKey.value.trim(); meta.apiVal = D.fmApiVal.value.trim(); meta.apiLoc = D.fmApiLoc.value;
    fetch('/save', { method: 'POST', body: JSON.stringify(savedList) }).then(() => {
        D.folderModal.style.display = 'none';
        renderTabs(); renderSaved();
    });
} let savedList = [], collapsedFolders = new Set(); let globalLayout = {}, graphNodes = [], graphNeedsRebuild = true;
async function loadSaved() {
    try {
        const r = await fetch('/requests.json'); if (r.ok) {
            savedList = await r.json();
            if (!Array.isArray(savedList)) savedList = []; renderSaved();
        }
    } catch (e) {
        console.error("Failed to load requests", e);
    }
} async function storeSaved() {
    try {
        await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedList) });
    } catch (e) { console.error("Failed to save requests", e); }
} function buildTree(list) {
    const root = { children: {}, items: [] };
    list.forEach(e => {
        if (e.isFolderMeta) return; const parts = (e.folder || 'Uncategorized').split('/').map(p => p.trim()).filter(Boolean);
        let node = root; parts.forEach(part => {
            if (!node.children[part]) node.children[part] = { children: {}, items: [] };
            node = node.children[part];
        }); node.items.push(e);
    }); return root;
} const FOLDER_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7;margin-right:4px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
const GEAR_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const FILE_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="opacity:.6"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
function renderSaved() {
    graphNeedsRebuild = true; const el = D.savedList; if (!savedList.length) {
        el.innerHTML = '<span class="empty">No saved requests.</span>';
        return;
    } el.innerHTML = ''; savedList.forEach(item => {
        if (!item.id) item.id = Math.random().toString(36).substr(2, 9);
    }); function renderNode(node, container, depth, folderPath) {
        Object.keys(node.children).sort().forEach(name => {
            const group = document.createElement('div');
            group.className = 'folder-group'; group.style.paddingLeft = (depth * 10) + 'px'; const thisPath = folderPath ? (folderPath + '/' + name) : name;
            if (collapsedFolders.has(thisPath)) group.classList.add('collapsed'); const title = document.createElement('div');
            title.className = 'folder-title'; title.innerHTML = `<div style="display:flex;align-items:center;flex:1">${FOLDER_SVG}<span>${name}</span></div><div onclick="event.stopPropagation();openFolderMeta('${thisPath.replace(/'/g, "\\'")}') " style="opacity:.5;padding:0 4px" title="Folder Auth">${GEAR_SVG}</div>`;
            title.onclick = () => {
                group.classList.toggle('collapsed'); if (group.classList.contains('collapsed')) collapsedFolders.add(thisPath);
                else collapsedFolders.delete(thisPath);
            }; const items = document.createElement('div');
            items.className = 'folder-items'; group.appendChild(title); group.appendChild(items);
            container.appendChild(group); title.addEventListener('contextmenu', e => {
                e.preventDefault();
                e.stopPropagation(); showContextMenu(e, 'folder', thisPath);
            }); title.addEventListener('dragover', e => {
                e.preventDefault();
                title.classList.add('drag-over');
            }); title.addEventListener('dragleave', () => title.classList.remove('drag-over'));
            group.addEventListener('drop', ev => {
                ev.preventDefault(); title.classList.remove('drag-over');
                const id = ev.dataTransfer.getData('text/plain'); const idx = savedList.findIndex(x => x.id === id);
                if (idx >= 0) {
                    savedList[idx].folder = thisPath; storeSaved(); renderSaved(); tabs.forEach(t => {
                        if (t.data.id === id) t.data.folder = thisPath;
                    }); renderTabs();
                }
            }); renderNode(node.children[name], items, depth + 1, thisPath);
        }); node.items.forEach(e => {
            const row = document.createElement('div');
            row.className = 's-item'; row.dataset.reqId = e.id; const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab && activeTab.data.id === e.id) row.classList.add('active'); row.draggable = true;
            row.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', e.id));
            row.innerHTML = `${FILE_SVG} <span class="s-method ${(e.method || '').toLowerCase()}">${e.method}</span><span class="s-name" title="${e.url}">${e.name || e.url}</span>`;
            row.addEventListener('contextmenu', ev => {
                ev.preventDefault(); showContextMenu(ev, 'request', e.id);
            }); row.addEventListener('click', () => createTab(e)); container.appendChild(row);
        });
    } const tree = buildTree(savedList); el.oncontextmenu = e => {
        if (e.target === el) {
            e.preventDefault();
            showContextMenu(e, 'root', null);
        }
    }; el.addEventListener('dragover', e => {
        if (e.target === el) {
            e.preventDefault();
            el.classList.add('drag-over');
        }
    }); el.addEventListener('dragleave', e => {
        if (e.target === el) el.classList.remove('drag-over');
    }); el.addEventListener('drop', e => {
        if (e.target === el) {
            e.preventDefault(); el.classList.remove('drag-over');
            const id = e.dataTransfer.getData('text/plain'); const item = savedList.find(x => x.id === id);
            if (item && item.folder !== 'Uncategorized') {
                item.folder = 'Uncategorized'; storeSaved();
                renderSaved();
            }
        }
    }); renderNode(tree, el, 0, '');
} loadSaved(); function doSave() {
    const name = D.reqName.value.trim() || 'Untitled';
    const folder = D.reqFolder.value.trim() || 'Uncategorized'; const url = D.url.value.trim();
    const method = D.method.value; if (!url) return; const entry = { id: Math.random().toString(36).substr(2, 9), name, folder, method, url, authType: D.authType.value, authToken: D.authToken.value.trim(), authUser: D.authUser.value.trim(), authPass: D.authPass.value.trim(), apiKey: D.apiKey.value.trim(), apiVal: D.apiVal.value.trim(), apiLoc: D.apiLoc.value, bodyType, body: D.body.value.trim(), gqlQuery: D.gqlQuery.value, gqlVars: D.gqlVars.value, };
    if (bodyType === 'form') entry.formGridData = JSON.parse(JSON.stringify(formGridData));
    entry.paramsGridData = JSON.parse(JSON.stringify(paramsGridData)); entry.headersGridData = JSON.parse(JSON.stringify(headersGridData));
    const activeTab = tabs.find(t => t.id === activeTabId); let idx = -1; if (activeTab && activeTab.data.id) idx = savedList.findIndex(e => e.id === activeTab.data.id);
    if (idx === -1) idx = savedList.findIndex(e => e.method === method && e.url === url && e.folder === folder);
    if (idx >= 0) { entry.id = savedList[idx].id; savedList[idx] = entry; } else {
        savedList.push(entry);
    } if (activeTab) activeTab.data.id = entry.id; renderSaved(); storeSaved(); D.saveBtn.textContent = idx >= 0 ? 'Updated' : 'Saved';
    setTimeout(() => D.saveBtn.textContent = 'Save', 1800);
} let tabs = [], activeTabId = null;
function createTab(data = null) {
    const id = Math.random().toString(36).substr(2, 9); const tab = { id, name: data ? (data.name || 'New Request') : 'New Request', data: data ? JSON.parse(JSON.stringify(data)) : { id: null, name: '', folder: 'Uncategorized', method: 'GET', url: '', authType: 'none', authToken: '', authUser: '', authPass: '', apiKey: '', apiVal: '', apiLoc: 'Header', bodyType: 'none', body: '', gqlQuery: '', gqlVars: '', formGridData: [{ k: '', v: '' }], paramsGridData: [{ k: '', v: '' }], headersGridData: [{ k: '', v: '' }] }, respState: data && data.respState ? JSON.parse(JSON.stringify(data.respState)) : { text: '', isJson: false, badge: '', timing: '', color: '', size: 0, respHeaders: '' } };
    tabs.push(tab); switchTab(id); renderTabs();
} function switchTab(id) {
    if (activeTabId) saveCurrentTabState();
    activeTabId = id; const tab = tabs.find(t => t.id === id); if (tab) {
        loadTabState(tab.data);
        loadResponseState(tab.respState); highlightSidebarItem(tab.data.id);
    } renderTabs();
} function closeTab(id, ev) {
    if (ev) ev.stopPropagation(); const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return; tabs.splice(idx, 1); if (activeTabId === id) {
        if (tabs.length) switchTab(tabs[tabs.length - 1].id);
        else { activeTabId = null; createTab(); }
    } renderTabs();
} function saveCurrentTabState() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return; tab.data = { id: tab.data.id, name: D.reqName.value, folder: D.reqFolder.value, method: D.method.value, url: D.url.value, authType: D.authType.value, authToken: D.authToken.value, authUser: D.authUser.value, authPass: D.authPass.value, apiKey: D.apiKey.value, apiVal: D.apiVal.value, apiLoc: D.apiLoc.value, bodyType, body: D.body.value, gqlQuery: D.gqlQuery.value, gqlVars: D.gqlVars.value, formGridData: JSON.parse(JSON.stringify(formGridData)), paramsGridData: JSON.parse(JSON.stringify(paramsGridData)), headersGridData: JSON.parse(JSON.stringify(headersGridData)) };
    tab.name = tab.data.name || 'Untitled';
} function setBodyUI(type) {
    bodyType = type; D.formGrid.style.display = 'none';
    D.body.style.display = 'none'; D.graphqlPane.style.display = 'none'; if (type === 'form') {
        D.formGrid.style.display = '';
    } else if (type === 'graphql') { D.graphqlPane.style.display = ''; } else if (type !== 'none') {
        D.body.style.display = '';
        D.body.placeholder = BODY_PLACEHOLDERS[type] || '';
    }
} function loadTabState(d) {
    D.reqName.value = d.name || '';
    D.reqFolder.value = d.folder || 'Uncategorized'; D.method.value = d.method || 'GET'; D.url.value = d.url || '';
    D.authType.value = d.authType || 'none'; D.authToken.value = d.authToken || ''; D.authUser.value = d.authUser || '';
    D.authPass.value = d.authPass || ''; D.apiKey.value = d.apiKey || ''; D.apiVal.value = d.apiVal || '';
    D.apiLoc.value = d.apiLoc || 'Header'; D.authType.dispatchEvent(new Event('change'));
    D.body.value = d.body || ''; D.gqlQuery.value = d.gqlQuery || ''; D.gqlVars.value = d.gqlVars || '';
    $$('.bt').forEach(b => b.classList.toggle('active', b.dataset.type === (d.bodyType || 'none')));
    setBodyUI(d.bodyType || 'none'); formGridData = d.formGridData ? JSON.parse(JSON.stringify(d.formGridData)) : [{ k: '', v: '' }];
    paramsGridData = d.paramsGridData ? JSON.parse(JSON.stringify(d.paramsGridData)) : [{ k: '', v: '' }];
    headersGridData = d.headersGridData ? JSON.parse(JSON.stringify(d.headersGridData)) : [{ k: '', v: '' }];
    initGrids(); updatePathIndicator(d.folder); colorMethodSelect();
} function renderTabs() {
    D.tabBar.innerHTML = '';
    tabs.forEach(t => {
        const tel = document.createElement('div'); tel.className = 'tab' + (t.id === activeTabId ? ' active' : '');
        tel.onclick = () => switchTab(t.id); tel.addEventListener('auxclick', e => {
            if (e.button === 1) {
                e.preventDefault();
                closeTab(t.id, e);
            }
        }); tel.innerHTML = `<span class="s-method ${((t.data && t.data.method) || '').toLowerCase()}">${(t.data && t.data.method) || ''}</span><span class="tab-name">${t.name}</span><span class="tab-close" onclick="closeTab('${t.id}', event)">×</span>`;
        D.tabBar.appendChild(tel);
    }); const add = document.createElement('div'); add.className = 'tab-add';
    add.textContent = '+'; add.onclick = () => createTab(); D.tabBar.appendChild(add);
} function highlightSidebarItem(reqId) {
    $$('.s-item').forEach(el => {
        el.classList.toggle('active', el.dataset.reqId === reqId);
    });
} function updatePathIndicator(path) {
    if (!D.pathIndicator) return; const parts = (path || 'Uncategorized').split('/');
    D.pathIndicator.innerHTML = '<div class="path-crumb">' + parts.map(p => `<span>${p}</span>`).join(' <span>&rsaquo;</span> ') + '</div>';
} function resolveEnvVars(str) {
    if (!str || !currentEnv) return str; return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const v = currentEnv.vars.find(e => e.k === key);
        return v ? v.v : match;
    });
} function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(2) + ' MB';
} async function doSend() {
    let url = D.url.value.trim(); const method = D.method.value;
    const btn = D.sendBtn; if (!url) return; btn.disabled = true; btn.textContent = 'Sending...';
    url = resolveEnvVars(url); let finalUrl = url; const urlParts = finalUrl.split('?'); const urlsp = new URLSearchParams(urlParts[1] || '');
    let qsAdded = false; paramsGridData.forEach(r => {
        if (r.k) {
            urlsp.append(resolveEnvVars(r.k), resolveEnvVars(r.v));
            qsAdded = true;
        }
    }); if (qsAdded || urlParts[1]) finalUrl = urlParts[0] + '?' + urlsp.toString();
    let finalBody = ''; if (bodyType === 'form') {
        const sp = new URLSearchParams(); formGridData.forEach(r => {
            if (r.k) sp.append(resolveEnvVars(r.k), resolveEnvVars(r.v));
        }); finalBody = sp.toString();
    } else if (bodyType === 'graphql') {
        const gqlObj = { query: resolveEnvVars(D.gqlQuery.value) };
        try {
            const v = D.gqlVars.value.trim(); if (v) gqlObj.variables = JSON.parse(resolveEnvVars(v));
        } catch (e) { } finalBody = JSON.stringify(gqlObj);
    } else {
        finalBody = resolveEnvVars(D.body.value.trim());
    } const ct = bodyType === 'none' ? '' : ((BODY_CT[bodyType] || 'text/plain') + '; charset=utf-8');
    const proxyParams = new URLSearchParams({ url: finalUrl, method, body: finalBody, ct }); const reqHeaders = [];
    headersGridData.forEach(r => {
        if (r.k) reqHeaders.push(resolveEnvVars(r.k) + ': ' + resolveEnvVars(r.v));
    }); let at = D.authType.value; let authMeta = { authToken: D.authToken.value.trim(), authUser: D.authUser.value.trim(), authPass: D.authPass.value.trim(), apiKey: D.apiKey.value.trim(), apiVal: D.apiVal.value.trim(), apiLoc: D.apiLoc.value };
    if (at === 'inherit') {
        let curFolder = D.reqFolder.value || 'Uncategorized', found = null; while (curFolder) {
            const m = savedList.find(e => e.isFolderMeta && e.path === curFolder);
            if (m && m.authType && m.authType !== 'inherit' && m.authType !== 'none') { found = m; break; } const si = curFolder.lastIndexOf('/');
            if (si === -1) break; curFolder = curFolder.substring(0, si);
        } if (found) {
            at = found.authType;
            authMeta = found;
        } else { at = 'none'; }
    } if (at === 'bearer') {
        reqHeaders.push('Authorization: Bearer ' + resolveEnvVars(authMeta.authToken));
    } else if (at === 'basic') {
        reqHeaders.push('Authorization: Basic ' + btoa(resolveEnvVars(authMeta.authUser) + ':' + resolveEnvVars(authMeta.authPass)));
    } else if (at === 'apikey' && authMeta.apiKey) {
        if (authMeta.apiLoc === 'Header') reqHeaders.push(resolveEnvVars(authMeta.apiKey) + ': ' + resolveEnvVars(authMeta.apiVal));
        else {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + encodeURIComponent(resolveEnvVars(authMeta.apiKey)) + '=' + encodeURIComponent(resolveEnvVars(authMeta.apiVal));
            proxyParams.set('url', finalUrl);
        }
    } if (reqHeaders.length) proxyParams.append('headers', reqHeaders.join('\n'));
    const t0 = Date.now(); try {
        if (D.corsToggle.checked) {
            const r = await fetch('/proxy', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' }, body: proxyParams.toString() });
            const text = await r.text(); const ms = (Date.now() - t0) + 'ms'; const status = parseInt(r.headers.get('X-Proxy-Status') || '0', 10);
            const respSize = parseInt(r.headers.get('X-Resp-Size') || text.length, 10); const respHdrsB64 = r.headers.get('X-Resp-Headers') || '';
            let respHeaders = ''; try { respHeaders = atob(respHdrsB64); } catch (e) { } const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
            let badgeColor = 'var(--save)'; if (status >= 500) badgeColor = 'var(--red)'; else if (status >= 400) badgeColor = '#e67e22';
            const s = { text, isJson, badge: status || 'Error', timing: ms, color: badgeColor, size: respSize, respHeaders };
            loadResponseState(s); const tab = tabs.find(t => t.id === activeTabId); if (tab) tab.respState = s;
        } else {
            const init = { method }; if (reqHeaders.length) {
                const hdrs = {}; reqHeaders.forEach(h => {
                    const colon = h.indexOf(':');
                    if (colon !== -1) hdrs[h.substring(0, colon).trim()] = h.substring(colon + 1).trim();
                }); if (ct) hdrs['Content-Type'] = ct;
                init.headers = hdrs;
            } else if (ct) { init.headers = { 'Content-Type': ct }; } if (finalBody && method !== 'GET' && method !== 'HEAD') init.body = finalBody;
            const r = await fetch(finalUrl, init); const text = await r.text(); const ms = (Date.now() - t0) + 'ms';
            const status = r.status || 0; const respSize = text.length; let respHeadersArr = []; r.headers.forEach((val, key) => respHeadersArr.push(key + ': ' + val));
            const respHeaders = respHeadersArr.join('\r\n'); const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
            let badgeColor = 'var(--save)'; if (status >= 500) badgeColor = 'var(--red)'; else if (status >= 400) badgeColor = '#e67e22';
            const s = { text, isJson, badge: status || 'Error', timing: ms, color: badgeColor, size: respSize, respHeaders };
            loadResponseState(s); const tab = tabs.find(t => t.id === activeTabId); if (tab) tab.respState = s;
        } addToHistory({ method, url: D.url.value.trim(), name: D.url.value.trim(), data: { method, url: D.url.value.trim(), body: finalBody, bodyType, authType: D.authType.value, authToken: D.authToken.value } });
    } catch (e) {
        loadResponseState({ text: 'Network Error: ' + e.message, isJson: false, badge: 'Failed', timing: (Date.now() - t0) + 'ms', color: 'var(--red)', size: 0, respHeaders: '' });
    } btn.disabled = false; btn.textContent = 'Send';
} function loadResponseState(s) {
    if (!s || !s.badge) {
        D.resp.innerHTML = 'Prepare to call your API...';
        D.resp.className = 'dim'; D.badge.textContent = ''; D.badge.className = ''; D.badge.style.background = '';
        D.badge.style.color = ''; D.timing.textContent = ''; D.respSize.textContent = ''; D.respHeadersTable.innerHTML = '';
        return;
    } D.badge.textContent = s.badge; const _code = parseInt(s.badge, 10); D.badge.className = !_code ? 'err' : (_code >= 500 ? 'err' : (_code >= 400 ? 'warn' : 'ok'));
    D.badge.style.color = ''; D.badge.style.background = ''; D.timing.textContent = s.timing;
    D.respSize.textContent = formatSize(s.size || 0); renderResponse(s.text, s.isJson); renderRespHeaders(s.respHeaders || '');
} function renderResponse(text, isJson) {
    D.resp.innerHTML = ''; D.resp.className = ''; if (isJson) {
        try {
            renderJsonNode(JSON.parse(text), D.resp, true);
        } catch (e) { D.resp.textContent = text; }
    } else { D.resp.textContent = text; }
} function renderRespHeaders(hdrs) {
    D.respHeadersTable.innerHTML = '';
    if (!hdrs) return; hdrs.split('\r\n').forEach(line => {
        if (!line.trim()) return; const colon = line.indexOf(':');
        if (colon === -1) {
            const tr = document.createElement('tr'); tr.innerHTML = `<td colspan="2" style="font-weight:700;color:var(--yel)">${line}</td>`;
            D.respHeadersTable.appendChild(tr);
        } else {
            const tr = document.createElement('tr'); tr.innerHTML = `<td>${line.substring(0, colon).trim()}</td><td>${line.substring(colon + 1).trim()}</td>`;
            D.respHeadersTable.appendChild(tr);
        }
    });
} function renderJsonNode(node, container, isRoot = false) {
    if (node === null) {
        const s = document.createElement('span');
        s.className = 'hl-null'; s.textContent = 'null'; container.appendChild(s);
    } else if (typeof node === 'boolean') {
        const s = document.createElement('span');
        s.className = 'hl-bool'; s.textContent = node.toString(); container.appendChild(s);
    } else if (typeof node === 'number') {
        const s = document.createElement('span');
        s.className = 'hl-num'; s.textContent = node.toString(); container.appendChild(s);
    } else if (typeof node === 'string') {
        const s = document.createElement('span');
        s.className = 'hl-string'; s.textContent = '"' + node + '"'; container.appendChild(s);
    } else if (Array.isArray(node)) {
        if (!node.length) {
            container.appendChild(document.createTextNode('[]'));
            return;
        } const toggle = document.createElement('span'); toggle.className = 'json-toggle';
        toggle.onclick = e => e.target.parentElement.classList.toggle('collapsed'); container.appendChild(toggle);
        container.appendChild(document.createTextNode('[')); const block = document.createElement('div');
        block.className = 'json-node'; node.forEach((child, i) => {
            const row = document.createElement('div');
            renderJsonNode(child, row); if (i < node.length - 1) row.appendChild(document.createTextNode(','));
            block.appendChild(row);
        }); container.appendChild(block); container.appendChild(document.createTextNode(']'));
    } else if (typeof node === 'object') {
        const keys = Object.keys(node); if (!keys.length) {
            container.appendChild(document.createTextNode('{}'));
            return;
        } if (!isRoot) {
            const toggle = document.createElement('span'); toggle.className = 'json-toggle';
            toggle.onclick = e => e.target.parentElement.classList.toggle('collapsed'); container.appendChild(toggle);
        } container.appendChild(document.createTextNode('{')); const block = document.createElement('div');
        block.className = 'json-node'; keys.forEach((k, i) => {
            const row = document.createElement('div');
            const kspan = document.createElement('span'); kspan.className = 'hl-key'; kspan.textContent = '"' + k + '"';
            row.appendChild(kspan); row.appendChild(document.createTextNode(': ')); renderJsonNode(node[k], row);
            if (i < keys.length - 1) row.appendChild(document.createTextNode(',')); block.appendChild(row);
        }); container.appendChild(block); container.appendChild(document.createTextNode('}'));
    }
} function curlTokens(s) {
    s = s.replace(/\\\r?\n/g, ' '); const out = []; let i = 0; while (i < s.length) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (i >= s.length) break; let buf = '', c = s[i]; if (c === "'" || c === '"') {
            i++; while (i < s.length && s[i] !== c) {
                if (s[i] === '\\' && c === '"' && i + 1 < s.length) {
                    buf += s[i + 1];
                    i += 2;
                } else buf += s[i++];
            } i++;
        } else {
            while (i < s.length && !/\s/.test(s[i])) {
                if (s[i] === "'" || s[i] === '"') {
                    const q = s[i++];
                    while (i < s.length && s[i] !== q) {
                        if (s[i] === '\\' && q === '"' && i + 1 < s.length) {
                            buf += s[i + 1]; i += 2;
                        } else buf += s[i++];
                    } i++;
                } else buf += s[i++];
            }
        } out.push(buf);
    } return out;
} function parseCurl(text) {
    const t = curlTokens(String(text).trim());
    let i = (t[0] && t[0].toLowerCase() === 'curl') ? 1 : 0; const r = { method: '', url: '', headers: [], body: '', user: null, get: false };
    const skip = { '-o': 1, '--output': 1, '-m': 1, '--max-time': 1, '--connect-timeout': 1 }; for (;
        i < t.length; i++) {
            const a = t[i]; if (a === '-X' || a === '--request') r.method = (t[++i] || '').toUpperCase();
            else if (a === '-H' || a === '--header') r.headers.push(t[++i] || ''); else if (a === '-d' || a === '--data' || a === '--data-raw' || a === '--data-ascii' || a === '--data-binary' || a === '--data-urlencode') r.body += (r.body ? '&' : '') + (t[++i] || '');
            else if (a === '-u' || a === '--user') r.user = t[++i] || ''; else if (a === '-b' || a === '--cookie') r.headers.push('Cookie: ' + (t[++i] || ''));
            else if (a === '-A' || a === '--user-agent') r.headers.push('User-Agent: ' + (t[++i] || ''));
            else if (a === '-e' || a === '--referer') r.headers.push('Referer: ' + (t[++i] || '')); else if (a === '--url') r.url = t[++i] || '';
            else if (a === '-G' || a === '--get') r.get = true; else if (skip[a]) i++; else if (a[0] === '-') { }
            else if (!r.url) r.url = a;
    } if (!r.method) r.method = (r.body && !r.get) ? 'POST' : 'GET'; if (r.get && r.body) {
        r.url += (r.url.includes('?') ? '&' : '?') + r.body;
        r.body = '';
    } let ct = '', authType = 'none', authToken = '', authUser = '', authPass = ''; const headersGridData = [];
    r.headers.forEach(h => {
        const ci = h.indexOf(':'); if (ci < 0) return; const k = h.slice(0, ci).trim(), v = h.slice(ci + 1).trim(), kl = k.toLowerCase();
        if (kl === 'content-type') { ct = v; return; } if (kl === 'authorization') {
            if (/^bearer\s+/i.test(v)) {
                authType = 'bearer';
                authToken = v.replace(/^bearer\s+/i, ''); return;
            } if (/^basic\s+/i.test(v)) {
                try {
                    const d = atob(v.replace(/^basic\s+/i, ''));
                    const ui = d.indexOf(':'); authType = 'basic'; authUser = ui >= 0 ? d.slice(0, ui) : d; authPass = ui >= 0 ? d.slice(ui + 1) : '';
                    return;
                } catch (e) { }
            }
        } headersGridData.push({ k, v });
    }); if (r.user) {
        authType = 'basic'; const ui = r.user.indexOf(':');
        authUser = ui >= 0 ? r.user.slice(0, ui) : r.user; authPass = ui >= 0 ? r.user.slice(ui + 1) : '';
    } let bodyType = 'none', body = '', formGridData = [{ k: '', v: '' }];
    if (r.body) {
        const low = ct.toLowerCase(); if (low.includes('application/json')) {
            bodyType = 'json';
            body = r.body;
        } else if (low.includes('xml')) { bodyType = 'xml'; body = r.body; } else if (low.includes('x-www-form-urlencoded') || (!ct && /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(r.body))) {
            bodyType = 'form';
            formGridData = r.body.split('&').map(p => {
                const eq = p.indexOf('='); const dk = x => {
                    try {
                        return decodeURIComponent(x.replace(/\+/g, ' '));
                    } catch (e) { return x; }
                }; return eq < 0 ? { k: dk(p), v: '' } : { k: dk(p.slice(0, eq)), v: dk(p.slice(eq + 1)) };
            }); if (!formGridData.length) formGridData = [{ k: '', v: '' }];
        } else {
            const tr = r.body.trim();
            bodyType = ct ? 'text' : (tr.startsWith('{') || tr.startsWith('[') ? 'json' : 'text'); body = r.body;
        }
    } if (ct && bodyType === 'none') headersGridData.push({ k: 'Content-Type', v: ct }); if (!headersGridData.length) headersGridData.push({ k: '', v: '' });
    let name = 'Imported'; try {
        const u = new URL(r.url.replace(/\{\{[^}]*\}\}/g, 'x')); name = (u.pathname.split('/').filter(Boolean).pop()) || u.hostname;
    } catch (e) {
        const seg = r.url.split(/[\/?]/).filter(Boolean); name = seg.length ? seg[seg.length - 1] : 'Imported';
    } return { name, folder: 'Uncategorized', method: r.method || 'GET', url: r.url, authType, authToken, authUser, authPass, apiKey: '', apiVal: '', apiLoc: 'Header', bodyType, body, gqlQuery: '', gqlVars: '', formGridData, paramsGridData: [{ k: '', v: '' }], headersGridData };
} function importCurl(text) {
    if (!text || !/curl\b/i.test(text)) return false; try {
        createTab(parseCurl(text));
        return true;
    } catch (e) { console.error('cURL import failed', e); return false; }
} function generateCurl() {
    let url = resolveEnvVars(D.url.value.trim());
    const method = D.method.value; if (!url) return ''; const parts = [`curl -X ${method}`]; parts.push(`'${url}'`);
    headersGridData.forEach(r => {
        if (r.k) parts.push(`-H '${resolveEnvVars(r.k)}: ${resolveEnvVars(r.v)}'`);
    }); let at = D.authType.value; let authMeta = { authToken: D.authToken.value.trim(), authUser: D.authUser.value.trim(), authPass: D.authPass.value.trim(), apiKey: D.apiKey.value.trim(), apiVal: D.apiVal.value.trim(), apiLoc: D.apiLoc.value };
    if (at === 'bearer') parts.push(`-H 'Authorization: Bearer ${resolveEnvVars(authMeta.authToken)}'`);
    else if (at === 'basic') parts.push(`-H 'Authorization: Basic ${btoa(resolveEnvVars(authMeta.authUser) + ':' + resolveEnvVars(authMeta.authPass))}'`);
    else if (at === 'apikey' && authMeta.apiKey) {
        if (authMeta.apiLoc === 'Header') parts.push(`-H '${resolveEnvVars(authMeta.apiKey)}: ${resolveEnvVars(authMeta.apiVal)}'`);
    } if (bodyType !== 'none') {
        const ct = BODY_CT[bodyType] || 'text/plain'; parts.push(`-H 'Content-Type: ${ct}; charset=utf-8'`);
        let bd = ''; if (bodyType === 'form') {
            const sp = new URLSearchParams(); formGridData.forEach(r => {
                if (r.k) sp.append(r.k, r.v);
            }); bd = sp.toString();
        } else if (bodyType === 'graphql') {
            const g = { query: D.gqlQuery.value };
            try { const v = D.gqlVars.value.trim(); if (v) g.variables = JSON.parse(v); } catch (e) { } bd = JSON.stringify(g);
        } else bd = D.body.value.trim(); if (bd) parts.push(`-d '${bd.replace(/'/g, "'\\''")}'`);
    } return parts.join(' \\\n  ');
} const ctxMenu = D.ctxMenu; let ctxTarget = null, ctxType = null;
function showContextMenu(e, type, targetId) {
    e.stopPropagation(); ctxType = type; ctxTarget = targetId;
    ctxMenu.innerHTML = ''; if (type === 'folder') ctxMenu.innerHTML = `<div class="ctx-item" onclick="ctxDo('newReq')">New Request</div><div class="ctx-item" onclick="ctxDo('newFolder')">New Folder</div><div class="ctx-sep"></div><div class="ctx-item" onclick="ctxDo('renameFolder')">Rename Path</div><div class="ctx-item danger" onclick="ctxDo('deleteFolder')">Delete Folder</div>`;
    else if (type === 'request') ctxMenu.innerHTML = `<div class="ctx-item" onclick="ctxDo('dupReq')">Duplicate</div><div class="ctx-sep"></div><div class="ctx-item danger" onclick="ctxDo('delReq')">Delete</div>`;
    else if (type === 'root') ctxMenu.innerHTML = `<div class="ctx-item" onclick="ctxDo('newReqRoot')">New Request</div><div class="ctx-item" onclick="ctxDo('newFolderRoot')">New Folder</div>`;
    ctxMenu.style.display = 'flex'; let x = e.clientX, y = e.clientY; if (x + ctxMenu.offsetWidth > window.innerWidth) x = window.innerWidth - ctxMenu.offsetWidth - 5;
    if (y + ctxMenu.offsetHeight > window.innerHeight) y = window.innerHeight - ctxMenu.offsetHeight - 5;
    ctxMenu.style.left = x + 'px'; ctxMenu.style.top = y + 'px';
} document.addEventListener('click', () => {
    ctxMenu.style.display = 'none';
}); ctxMenu.addEventListener('click', e => e.stopPropagation()); function showModal(title, type, defValue = '') {
    return new Promise(resolve => {
        const overlay = D.modalOverlay;
        D.modalTitle.textContent = title; if (type === 'prompt') {
            D.modalInput.style.display = 'block';
            D.modalInput.value = defValue; D.modalOk.className = 'modal-btn primary'; setTimeout(() => D.modalInput.focus(), 50);
        } else { D.modalInput.style.display = 'none'; D.modalOk.className = 'modal-btn danger'; }
        const done = val => {
            overlay.classList.remove('active'); D.modalOk.onclick = null; D.modalCancel.onclick = null;
            D.modalInput.onkeydown = null; resolve(val);
        }; D.modalOk.onclick = () => done(type === 'prompt' ? D.modalInput.value : true);
        D.modalCancel.onclick = () => done(null); D.modalInput.onkeydown = e => {
            if (e.key === 'Enter') D.modalOk.click();
            if (e.key === 'Escape') D.modalCancel.click();
        }; overlay.classList.add('active');
    });
}
async function ctxDo(action) {
    ctxMenu.style.display = 'none'; if (action === 'newReq' || action === 'newReqRoot') {
        createTab({ folder: action === 'newReq' ? ctxTarget : 'Uncategorized' });
    } else if (action === 'newFolder' || action === 'newFolderRoot') {
        const n = await showModal('Folder Name:', 'prompt', 'New Folder');
        if (n) {
            const r = { id: Math.random().toString(36).substr(2, 9), name: 'New Request', folder: action === 'newFolder' ? ctxTarget + '/' + n : n, method: 'GET', url: '' };
            savedList.push(r); storeSaved(); renderSaved(); createTab(r);
        }
    } else if (action === 'renameFolder') {
        const n = await showModal('New Path:', 'prompt', ctxTarget);
        if (n && n !== ctxTarget) {
            savedList.forEach(item => {
                if (item.folder === ctxTarget || item.folder.startsWith(ctxTarget + '/')) item.folder = item.folder.replace(ctxTarget, n);
            }); storeSaved(); renderSaved();
        }
    } else if (action === 'deleteFolder') {
        if (await showModal('Delete this folder?', 'confirm')) {
            savedList = savedList.filter(item => !(item.folder === ctxTarget || item.folder.startsWith(ctxTarget + '/')));
            storeSaved(); renderSaved();
        }
    } else if (action === 'dupReq') {
        const it = savedList.find(x => x.id === ctxTarget);
        if (it) {
            const copy = JSON.parse(JSON.stringify(it)); copy.id = Math.random().toString(36).substr(2, 9);
            copy.name += ' (Copy)'; savedList.push(copy); storeSaved(); renderSaved(); createTab(copy);
        }
    } else if (action === 'delReq') {
        if (await showModal('Delete request?', 'confirm')) {
            savedList = savedList.filter(x => x.id !== ctxTarget);
            storeSaved(); renderSaved(); tabs = tabs.filter(t => t.data.id !== ctxTarget); if (!tabs.length) createTab();
            else renderTabs();
        }
    }
} let historyList = []; try {
    historyList = JSON.parse(localStorage.getItem('ph-history') || '[]');
} catch (e) { } function addToHistory(e) {
    historyList.unshift(e); if (historyList.length > 50) historyList.pop();
    localStorage.setItem('ph-history', JSON.stringify(historyList)); if (D.historyList.style.display !== 'none') renderHistory();
} function renderHistory() {
    D.historyList.innerHTML = ''; if (!historyList.length) {
        D.historyList.innerHTML = '<span class="empty">No history.</span>';
        return;
    } historyList.forEach(e => {
        const row = document.createElement('div'); row.className = 's-item';
        row.innerHTML = `<span class="s-method ${(e.method || '').toLowerCase()}">${e.method}</span><span class="s-name" title="${e.url}">${e.url}</span>`;
        row.onclick = () => createTab(e); D.historyList.appendChild(row);
    });
} function switchSidebar(showSaved) {
    D.tabCollections.classList.toggle('active', showSaved);
    D.tabHistory.classList.toggle('active', !showSaved); D.savedList.style.display = showSaved ? '' : 'none';
    D.historyList.style.display = showSaved ? 'none' : ''; if (!showSaved) renderHistory();
} D.tabCollections.onclick = () => switchSidebar(true);
D.tabCollections.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    switchSidebar(true); showContextMenu(e, 'root', null);
}); D.tabHistory.onclick = () => switchSidebar(false);
let environments = []; let currentEnv = null; function loadEnvs() {
    try {
        environments = JSON.parse(localStorage.getItem('ph-envs') || '[]');
    } catch (e) { environments = []; } renderEnvSelect(); renderEnvEditor(); const lastEnv = localStorage.getItem('ph-active-env');
    if (lastEnv) {
        currentEnv = environments.find(e => e.name === lastEnv) || null; D.envSelect.value = lastEnv;
    }
} function saveEnvs() {
    localStorage.setItem('ph-envs', JSON.stringify(environments));
    renderEnvSelect();
} function renderEnvSelect() {
    const val = D.envSelect.value; D.envSelect.innerHTML = '<option value="">No Environment</option>';
    environments.forEach(env => {
        const o = document.createElement('option'); o.value = env.name;
        o.textContent = env.name; D.envSelect.appendChild(o);
    }); D.envSelect.value = val;
} function renderEnvEditor() {
    D.envEditor.innerHTML = '';
    environments.forEach((env, ei) => {
        const block = document.createElement('div'); block.style.cssText = 'margin-bottom:.5rem;';
        const header = document.createElement('div'); header.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;';
        header.innerHTML = `<input class="kv-input" style="flex:1;font-weight:700;font-size:.72rem" value="${env.name}" data-ei="${ei}" data-field="name"><div class="kv-del" data-ei="${ei}" style="width:22px;height:22px;font-size:.65rem">&times;</div>`;
        block.appendChild(header); env.vars.forEach((v, vi) => {
            const row = document.createElement('div');
            row.className = 'env-row'; row.innerHTML = `<input placeholder="key" value="${v.k}" data-ei="${ei}" data-vi="${vi}" data-field="k"><input placeholder="value" value="${v.v}" data-ei="${ei}" data-vi="${vi}" data-field="v"><div class="kv-del" data-ei="${ei}" data-vi="${vi}" data-field="del-var">&times;</div>`;
            block.appendChild(row);
        }); const addVar = document.createElement('button'); addVar.className = 'kv-add';
        addVar.style.cssText = 'font-size:.6rem;padding:.2rem;'; addVar.textContent = '+ Var';
        addVar.dataset.ei = ei; addVar.onclick = () => {
            env.vars.push({ k: '', v: '' }); saveEnvs(); renderEnvEditor();
        }; block.appendChild(addVar); D.envEditor.appendChild(block);
    });
} D.envEditor.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.ei) return; const ei = parseInt(t.dataset.ei); const env = environments[ei];
    if (!env) return; if (t.dataset.field === 'name') env.name = t.value; else if (t.dataset.vi !== undefined) {
        const vi = parseInt(t.dataset.vi);
        if (t.dataset.field === 'k') env.vars[vi].k = t.value; else if (t.dataset.field === 'v') env.vars[vi].v = t.value;
    } saveEnvs();
}); D.envEditor.addEventListener('click', e => {
    const del = e.target.closest('.kv-del');
    if (!del || !del.dataset.ei) return; const ei = parseInt(del.dataset.ei); if (del.dataset.field === 'del-var') {
        environments[ei].vars.splice(parseInt(del.dataset.vi), 1);
    } else { environments.splice(ei, 1); } saveEnvs(); renderEnvEditor();
}); D.addEnvBtn.onclick = () => {
    environments.push({ name: 'New Env', vars: [{ k: '', v: '' }] });
    saveEnvs(); renderEnvEditor();
}; D.envSelect.onchange = e => {
    currentEnv = environments.find(env => env.name === e.target.value) || null;
    localStorage.setItem('ph-active-env', e.target.value);
}; function colorMethodSelect() {
    const map = { GET: '--m-get', POST: '--m-post', PUT: '--m-put', DELETE: '--m-del', PATCH: '--m-patch' };
    D.method.style.color = getComputedStyle(root).getPropertyValue(map[D.method.value] || '--acc').trim();
} const init = () => {
    try {
        applyTheme(false); cachedHatOp = parseFloat(getComputedStyle(root).getPropertyValue('--hat-op')) || 0.4;
        applyHats(localStorage.getItem('ph-hats') === 'on');
    } catch (e) {
        console.warn("Init error:", e);
        applyTheme(false); applyHats(false);
    } loadEnvs(); createTab();
}; D.gearBtn.onclick = e => {
    e.stopPropagation();
    D.settingsPanel.classList.toggle('open');
}; document.addEventListener('click', e => {
    if (D.settingsPanel.classList.contains('open') && !D.settingsPanel.contains(e.target) && !D.gearBtn.contains(e.target)) D.settingsPanel.classList.remove('open');
}); window.addEventListener('resize', () => {
    HATS.forEach(h => {
        if (h.x > window.innerWidth) h.x = Math.random() * (window.innerWidth - h.w);
    });
}); D.hatsToggle.onchange = e => applyHats(e.target.checked); D.sendBtn.onclick = doSend;
D.saveBtn.onclick = doSave; D.curlBtn.onclick = () => {
    const cmd = generateCurl(); if (cmd) {
        navigator.clipboard.writeText(cmd).then(() => {
            D.curlBtn.textContent = 'Copied!';
            setTimeout(() => D.curlBtn.textContent = 'cURL', 1500);
        });
    }
}; D.respCopyBtn.onclick = () => {
    const txt = D.resp.textContent || '';
    if (!txt || D.resp.classList.contains('dim')) return; navigator.clipboard.writeText(txt).then(() => {
        D.respCopyBtn.textContent = 'Copied!';
        setTimeout(() => D.respCopyBtn.textContent = 'Copy', 1400);
    });
}; D.url.addEventListener('paste', e => {
    const txt = ((e.clipboardData || window.clipboardData) || { getData: () => '' }).getData('text') || '';
    if (/^\s*curl\b/i.test(txt)) { e.preventDefault(); importCurl(txt); }
}); $('importBtn').onclick = () => {
    $('importModal').classList.add('active');
    $('importText').value = ''; $('importText').style.borderColor = ''; setTimeout(() => $('importText').focus(), 50);
}; $('importCancel').onclick = () => $('importModal').classList.remove('active'); $('importOk').onclick = () => {
    if (importCurl($('importText').value)) {
        $('importModal').classList.remove('active');
    } else { $('importText').style.borderColor = 'var(--red)'; }
}; window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        doSend();
    } if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); doSave(); } if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        createTab();
    }
}); D.method.addEventListener('change', colorMethodSelect); init();