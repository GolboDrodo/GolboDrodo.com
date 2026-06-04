/**
 * VARIABILI DI SISTEMA
 */
let zIndexCounter = 100;
let contextFileId = null;    
let contextFolderId = null;
let selectedFileIds = [];    
let lastClickedId = null;    
let currentVisibleIds = [];  
let currentViewerId = null;  
let isRenaming = false;
let deleteActionType = 'trash'; 
let webcamStream = null;
let currentEditingNoteId = null;
let contextMenuX = 150;
let contextMenuY = 150;
let contextMenuLocalX = 20; 
let contextMenuLocalY = 20;
let clipboardItems = [];
let imageCache = {}; 

let isSelecting = false; 
let startX = 0, startY = 0;
let didDragSelection = false;
let didDragItem = false;
let selectionContainer = null;

// Sistema Cartelle e Undo
let foldersList = [];
let currentActiveFolderWindow = null; 
let historyStack = [];

/**
 * DATABASE CONFIG
 */
const DB_NAME = "VerbumOS_DB";
const STORE_NAME = "notes";

function initDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
    });
}

async function dbOp(mode, callback) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    return callback(store);
}

/**
 * STARTUP, EVENT BINDING E TASTIERA
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inizializzazione Cartelle e UI
    foldersList = JSON.parse(localStorage.getItem('verbum_folders') || '[]');
    renderDesktopFolders();
    loadIconPositions();
    document.querySelectorAll('.desktop-icon').forEach(icon => setupDrag(icon));
    document.querySelectorAll('.window').forEach(win => setupDrag(win));

    // 2. Binding degli eventi UI
    const bind = (id, event, handler) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener(event, handler);
    };

    // Icone Desktop
    bind('icon-scrivi', 'dblclick', openNewEditor);
    bind('icon-archivio', 'dblclick', openArchive);
    bind('icon-cestino', 'dblclick', openCestino);
    bind('icon-webcam', 'dblclick', openWebcam);
    bind('icon-galleria', 'dblclick', openGalleria);
    bind('icon-tetris', 'dblclick', () => { if(typeof openTetris === 'function') openTetris(); });

    // Finestre: pulsanti header
    bind('btn-save-scrivi', 'click', openSaveDialog);
    bind('btn-close-scrivi', 'click', closeEditor);
    bind('btn-close-archivio', 'click', () => closeWindow('window-archivio'));
    bind('btn-empty-cestino', 'click', askEmptyTrash);
    bind('btn-close-cestino', 'click', () => closeWindow('window-cestino'));
    bind('btn-scatta-webcam', 'click', takePhoto);
    bind('btn-close-webcam', 'click', closeWebcam);
    bind('btn-close-galleria', 'click', () => closeWindow('window-galleria'));
    bind('btn-close-tetris', 'click', () => { if(typeof closeTetris === 'function') closeTetris(); });
    bind('btn-close-viewer', 'click', () => closeWindow('window-viewer'));
    
    // Popup di sistema
    bind('btn-close-save', 'click', () => closeWindow('window-save'));
    bind('btn-confirm-save', 'click', confirmSave);
    bind('btn-yes-confirm', 'click', executeDelete);
    bind('btn-no-confirm', 'click', () => closeWindow('window-confirm'));

    // Context Menus
    bind('menu-copy', 'click', copySelected);
    bind('menu-rename', 'click', enableRenameMode);
    bind('menu-fav', 'click', toggleFavorite);
    bind('menu-delete-trash', 'click', (e) => askDeleteNote(e, 'trash'));
    bind('menu-restore', 'click', restoreNote);
    bind('menu-delete-perm', 'click', (e) => askDeleteNote(e, 'permanent'));
    bind('menu-paste-desktop', 'click', () => pasteCopied(null));
    bind('menu-new-folder-desk', 'click', () => createNewFolder(null));
    bind('menu-paste-folder', 'click', () => pasteCopied(currentActiveFolderWindow));
    bind('menu-new-folder-ins', 'click', createNewNestedFolder);
    bind('menu-copy-folder', 'click', copySelected);
    bind('menu-rename-folder', 'click', renameFolder);
    bind('menu-group-folder', 'click', groupSelectedIntoFolder);
    bind('menu-fav-folder', 'click', toggleFavorite);
    bind('menu-delete-folder', 'click', deleteFolder);

    // Selezione per icone App (scrivi, archivio, webcam, ecc.)
    document.querySelectorAll('.desktop-icon:not(.folder-custom)').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            if (didDragItem || didDragSelection) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey) toggleSelection(icon.id);
            else { clearSelection(); toggleSelection(icon.id); }
        });
    });

    // 3. Gestione Click globale
    document.addEventListener('click', (e) => {
        if (didDragSelection) {
            didDragSelection = false;
            return;
        }
        if(!e.target.closest('.file-item') && !e.target.closest('.gallery-item') && !e.target.closest('.context-menu') && !e.target.closest('.folder-custom') && !e.target.closest('.desktop-icon')) {
            clearSelection();
            lastClickedId = null;
        }
    });

    // 4. Input da tastiera
    document.addEventListener('keydown', (e) => {
        const windows = Array.from(document.querySelectorAll('.window')).filter(w => w.style.display === 'flex');
        windows.sort((a, b) => parseInt(b.style.zIndex || 0) - parseInt(a.style.zIndex || 0));
        const topWin = windows[0];

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undoLastAction();
            return;
        }

        if (!topWin) return;

        if (topWin.id === 'window-viewer') {
            if (e.key === "ArrowRight") navigateViewer(1);
            if (e.key === "ArrowLeft") navigateViewer(-1);
        }

        // DELEGA A TETRIS.JS
        if (topWin.id === 'window-tetris') {
            if (typeof handleTetrisKeyboard === 'function') {
                handleTetrisKeyboard(e);
            }
        }

        if (e.key === "Escape") {
            if (topWin.id === 'window-scrivi') closeEditor();
            else if (topWin.id === 'window-webcam') closeWebcam();
            else if (topWin.id === 'window-confirm') closeWindow('window-confirm');
            else if (topWin.id === 'window-tetris' && typeof closeTetris === 'function') closeTetris();
            else closeWindow(topWin.id);
        }

        if (e.key === "Enter") {
            if (topWin.id === 'window-confirm') { e.preventDefault(); executeDelete(); }
            else if (topWin.id === 'window-save') { e.preventDefault(); confirmSave(); }
            else if (topWin.id === 'window-webcam') { takePhoto(); }
            else if (topWin.id === 'window-scrivi' && document.activeElement.id !== 'note-input') {
                openSaveDialog(e);
            }
        }
    });
});

/**
 * LOGICA VISUALIZZATORE FOTO E SELEZIONE
 */
async function openPhotoViewer(id) {
    const note = await dbOp("readonly", s => new Promise(res => {
        const req = s.get(id); req.onsuccess = () => res(req.result);
    }));
    if (!note) return;
    currentViewerId = id;
    const viewer = document.getElementById('window-viewer');
    document.getElementById('viewer-img').src = note.content;
    document.getElementById('viewer-title').innerText = note.name;
    viewer.style.display = "flex";
    bringToFront('window-viewer');
}

function navigateViewer(direction) {
    if (!currentViewerId || currentVisibleIds.length === 0) return;
    let currentIndex = currentVisibleIds.indexOf(currentViewerId);
    let nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < currentVisibleIds.length) openPhotoViewer(currentVisibleIds[nextIndex]);
}

function updateSelectionUI() {
    document.querySelectorAll('.file-item, .gallery-item, .folder-custom, .desktop-icon:not(.folder-custom)').forEach(el => {
        const id = el.hasAttribute('data-id') ? Number(el.getAttribute('data-id')) : el.id;
        if (selectedFileIds.includes(id)) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

function toggleSelection(id) {
    if (selectedFileIds.includes(id)) selectedFileIds = selectedFileIds.filter(sid => sid !== id);
    else selectedFileIds.push(id);
    updateSelectionUI();
}

function selectRange(currentId) {
    if (!lastClickedId || !currentVisibleIds.includes(lastClickedId)) { toggleSelection(currentId); return; }
    const start = currentVisibleIds.indexOf(lastClickedId);
    const end = currentVisibleIds.indexOf(currentId);
    const range = currentVisibleIds.slice(Math.min(start, end), Math.max(start, end) + 1);
    range.forEach(id => { if (!selectedFileIds.includes(id)) selectedFileIds.push(id); });
    updateSelectionUI();
}

function clearSelection() {
    selectedFileIds = [];
    document.querySelectorAll('.file-item, .gallery-item, .desktop-icon, .folder-item').forEach(el => el.classList.remove('selected'));
}

/**
 * UTILITY FINESTRE E DRAG & DROP AVANZATO
 */
function hideContextMenus() {
    document.querySelectorAll('.context-menu').forEach(m => m.style.display = "none");
}

function openWindow(id) {
    const win = document.getElementById(id);
    if(win) { win.style.display = "flex"; bringToFront(id); }
}

function closeWindow(id) {
    const win = document.getElementById(id);
    if(win) win.style.display = "none";
}

function bringToFront(id) {
    const win = document.getElementById(id);
    if (win) { zIndexCounter++; win.style.zIndex = zIndexCounter; }
}

function setupDrag(el) {
    if (!el) return;
    const header = el.classList.contains('window') ? el.querySelector('.window-header') : el;
    
    header.onmousedown = (e) => {
        if (e.target.closest('.action-btn') || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        e.preventDefault(); 
        
        if (el.id) bringToFront(el.id);
        
        let isWindow = el.classList.contains('window');
        let isFolder = el.classList.contains('folder-custom');
        let isSystemIcon = el.id && el.id.startsWith('icon-');

        if (!isWindow && (isFolder || isSystemIcon) && !selectedFileIds.includes(el.id)) {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                clearSelection();
            } else {
                el.dataset.cmdAdded = "true";
            }
            selectedFileIds.push(el.id);
            el.classList.add('selected');
        }

        let draggedItems = [];
        if (isWindow) {
            draggedItems.push({ node: el, id: el.id, ox: e.clientX - el.getBoundingClientRect().left, oy: e.clientY - el.getBoundingClientRect().top });
        } else {
            selectedFileIds.forEach(id => {
                const node = document.getElementById(id);
                if (node) draggedItems.push({ node: node, id: id, ox: e.clientX - node.getBoundingClientRect().left, oy: e.clientY - node.getBoundingClientRect().top, wasNested: node.classList.contains('folder-item'), isApp: id.startsWith('icon-') });
            });
        }
        
        let isDragging = false; 
        let startClickX = e.clientX;
        let startClickY = e.clientY;
        
        document.onmousemove = (moveEvent) => { 
            if (!isDragging) {
                if (Math.abs(moveEvent.clientX - startClickX) < 4 && Math.abs(moveEvent.clientY - startClickY) < 4) return;

                isDragging = true;
                didDragItem = true; 
                draggedItems.forEach(item => {
                    if (item.wasNested) {
                        let currentRect = item.node.getBoundingClientRect();
                        item.ox = moveEvent.clientX - currentRect.left;
                        item.oy = moveEvent.clientY - currentRect.top;
                        document.body.appendChild(item.node);
                        item.node.style.position = 'absolute';
                        item.node.style.zIndex = 9999;
                        item.node.classList.remove('folder-item');
                        item.node.classList.add('desktop-icon');
                    }
                });
            }
            
            draggedItems.forEach(item => {
                item.node.style.left = (moveEvent.clientX - item.ox) + "px"; 
                item.node.style.top = (moveEvent.clientY - item.oy) + "px"; 
            });

            let hasApp = draggedItems.some(i => i.isApp);

            if (!isWindow && isDragging) {
                el.style.display = 'none'; 
                const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
                el.style.display = 'flex'; 

                document.querySelectorAll('.drag-target').forEach(t => t.classList.remove('drag-target'));
                
                if (!hasApp) { 
                    let blockDrop = false;

                    if (elementBelow) {
                        const targetFolderIcon = elementBelow.closest('.folder-custom');
                        const targetWindow = elementBelow.closest('.window');
                        let targetElement = null;
                        let targetIdToCheck = null;

                        if (targetFolderIcon && !selectedFileIds.includes(targetFolderIcon.id)) { targetIdToCheck = targetFolderIcon.id; targetElement = targetFolderIcon; } 
                        else if (targetWindow && targetWindow.id.startsWith('window-cartella-')) { targetIdToCheck = targetWindow.id.replace('window-', ''); targetElement = targetWindow; }

                        if (targetIdToCheck) {
                            blockDrop = draggedItems.some(item => isDescendant(targetIdToCheck, item.id));
                            if (!blockDrop && targetElement === targetFolderIcon) targetElement.classList.add('drag-target');
                        }
                    }

                    if (blockDrop) document.body.classList.add('no-drop-cursor');
                    else document.body.classList.remove('no-drop-cursor');
                }
            }
        };
        
        document.onmouseup = (mouseUpEvent) => { 
            document.onmousemove = null; 
            document.onmouseup = null;
            document.querySelectorAll('.drag-target').forEach(t => t.classList.remove('drag-target'));
            document.body.classList.remove('no-drop-cursor');
            
            if (!isDragging) return;
            setTimeout(() => didDragItem = false, 50);

            let hasApp = draggedItems.some(i => i.isApp);

            if (!isWindow) {
                el.style.display = 'none';
                const elementBelow = document.elementFromPoint(mouseUpEvent.clientX, mouseUpEvent.clientY);
                el.style.display = 'flex'; 
                
                let targetId = undefined; 

                if (hasApp) {
                    targetId = null; 
                } else if (elementBelow) {
                    const targetFolderIcon = elementBelow.closest('.folder-custom');
                    const targetWindow = elementBelow.closest('.window');
                    
                    if (targetFolderIcon && !selectedFileIds.includes(targetFolderIcon.id)) targetId = targetFolderIcon.id;
                    else if (targetWindow && targetWindow.id.startsWith('window-cartella-')) targetId = targetWindow.id.replace('window-', '');
                    else if (elementBelow.tagName === 'BODY' || elementBelow.classList.contains('desktop-title') || elementBelow.id === 'selection-box') targetId = null; 
                }

                if (targetId !== undefined && targetId !== null) {
                    let isInvalid = draggedItems.some(item => isDescendant(targetId, item.id));
                    if (isInvalid) { openErrorWindow("selezione multipla non valida"); targetId = undefined; }
                }

                if (targetId !== undefined) {
                    let parentsToUpdate = new Set();
                    
                    const targetObj = foldersList.find(f => f.id === targetId);
                    if (targetObj && (targetObj.type === 'note' || targetObj.type === 'photo')) {
                        const newFolderId = 'cartella-' + Date.now();
                        foldersList.push({ id: newFolderId, name: getUniqueFolderName('nuovo_gruppo', targetObj.parentId), parentId: targetObj.parentId, top: targetObj.top, left: targetObj.left });
                        if (targetObj.parentId) parentsToUpdate.add(targetObj.parentId);
                        
                        targetObj.parentId = newFolderId;
                        targetObj.top = '-999px'; 
                        const pos = getNextIconPosition(newFolderId);
                        targetObj.top = pos.top;
                        targetObj.left = pos.left;
                        
                        targetId = newFolderId;
                    }

                    if (targetId) parentsToUpdate.add(targetId);

                    draggedItems.forEach((item, index) => {
                        if (item.isApp) return; 
                        
                        const folderObj = foldersList.find(f => f.id === item.id);
                        if (!folderObj) return;
                        
                        if (folderObj.parentId) parentsToUpdate.add(folderObj.parentId);

                        let newTop = '20px';
                        let newLeft = '20px';
                        const elRect = item.node.getBoundingClientRect();

                        if (targetId === null) {
                            newTop = item.node.style.top;
                            newLeft = item.node.style.left;
                        } else {
                            const targetWin = document.getElementById('window-' + targetId);
                            if (targetWin && targetWin.style.display === 'flex' && (!elementBelow.closest('.folder-custom') || elementBelow.closest('.folder-custom').id === targetId)) {
                                const contentRect = targetWin.querySelector('.window-content').getBoundingClientRect();
                                newTop = Math.max(0, elRect.top - contentRect.top + (index * 5)) + 'px';
                                newLeft = Math.max(0, elRect.left - contentRect.left + (index * 5)) + 'px';
                            } else {
                                folderObj.parentId = targetId;
                                folderObj.top = '-999px'; 
                                const pos = getNextIconPosition(targetId);
                                newTop = pos.top;
                                newLeft = pos.left;
                            }
                        }

                        if (targetId !== folderObj.parentId) {
                            folderObj.parentId = targetId;
                            folderObj.top = newTop;
                            folderObj.left = newLeft;
                        } else {
                            folderObj.top = newTop;
                            folderObj.left = newLeft;
                        }
                        item.node.remove();
                    });
                    
                    localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
                    parentsToUpdate.forEach(pId => renderFolderContent(pId));
                    renderDesktopFolders(); 
                } else {
                    draggedItems.forEach(item => { if(!item.isApp) item.node.remove(); });
                    renderDesktopFolders();
                    document.querySelectorAll('.window').forEach(w => { if (w.id.startsWith('window-cartella-')) renderFolderContent(w.id.replace('window-', '')); });
                }
                saveIconPositions(); 
            }
        };
    };
}

function isDescendant(targetId, draggedId) {
    if (targetId === draggedId) return true;
    let parent = foldersList.find(f => f.id === targetId)?.parentId;
    while (parent) {
        if (parent === draggedId) return true;
        parent = foldersList.find(f => f.id === parent)?.parentId;
    }
    return false;
}

function moveFolderToFolder(draggedId, targetId, dropTop = null, dropLeft = null, isUndo = false) {
    const draggedFolder = foldersList.find(f => f.id === draggedId);
    if (!draggedFolder || draggedFolder.parentId === targetId) return;

    const originalParentId = draggedFolder.parentId;
    
    if (!isUndo) {
        historyStack.push({
            type: 'move_folder',
            id: draggedId,
            from: originalParentId,
            to: targetId,
            oldTop: draggedFolder.top,
            oldLeft: draggedFolder.left
        });
    }

    draggedFolder.parentId = targetId;
    draggedFolder.top = dropTop || (isUndo ? draggedFolder.top : '20px');
    draggedFolder.left = dropLeft || (isUndo ? draggedFolder.left : '20px');
    
    localStorage.setItem('verbum_folders', JSON.stringify(foldersList));

    const el = document.getElementById(draggedId);
    if(el) el.remove();

    if (!originalParentId) renderDesktopFolders();
    else renderFolderContent(originalParentId);

    if (!targetId) renderDesktopFolders();
    else renderFolderContent(targetId);
}

async function undoLastAction() {
    if (historyStack.length === 0) return;
    const action = historyStack.pop();

    if (action.type === 'move_folder') {
        moveFolderToFolder(action.id, action.from, action.oldTop, action.oldLeft, true);
    } 
    else if (action.type === 'delete_folder') {
        foldersList.push(action.folderData);
        localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
        await dbOp("readwrite", s => s.delete(action.trashId));

        if (action.folderData.parentId) renderFolderContent(action.folderData.parentId);
        else renderDesktopFolders();
        loadCestino();
    }
}

/**
 * LOGICA EDITOR E APP 
 */
function openNewEditor() { currentEditingNoteId = null; document.getElementById('note-input').value = ""; openWindow('window-scrivi'); }

async function confirmSave() {
    const nameInput = document.getElementById('filename-input');
    let name = nameInput.value.trim() || "nota"; if (!name.toLowerCase().includes('.')) name += ".txt";
    const input = document.getElementById('note-input');
    if (currentEditingNoteId) {
        const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(currentEditingNoteId); req.onsuccess = () => res(req.result); }));
        if(note) { note.name = name; note.content = input.value; await dbOp("readwrite", s => s.put(note)); }
    } else {
        const note = { id: Date.now(), name: name, content: input.value, fav: false, trashed: false };
        await dbOp("readwrite", s => s.put(note));
    }
    input.value = ""; nameInput.value = ""; currentEditingNoteId = null;
    closeWindow('window-save'); closeWindow('window-scrivi'); loadArchive();
}

async function closeEditor() {
    const input = document.getElementById('note-input'); const content = input.value.trim();
    if (currentEditingNoteId) {
        const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(currentEditingNoteId); req.onsuccess = () => res(req.result); }));
        if(note) { note.content = input.value; await dbOp("readwrite", s => s.put(note)); }
    } else if (content) {
        let name = content.substring(0, 10).replace(/\n/g, ' ') + (content.length > 10 ? ".." : "") + ".txt";
        const note = { id: Date.now(), name: name, content: input.value, fav: false, trashed: false };
        await dbOp("readwrite", s => s.put(note));
    }
    input.value = ""; currentEditingNoteId = null; closeWindow('window-scrivi'); loadArchive();
}

async function loadArchive() {
    const list = document.getElementById('archive-list');
    const notes = await dbOp("readonly", s => new Promise(res => { const req = s.getAll(); req.onsuccess = () => res(req.result); }));
    const activeNotes = notes.filter(n => !n.trashed && !n.name.toLowerCase().endsWith('.png') && n.content !== 'cartella_eliminata' && !n.hiddenFromApp).sort((a,b) => b.id - a.id);
    currentVisibleIds = activeNotes.map(n => n.id);
    if(activeNotes.length === 0) { list.innerHTML = "<p class='empty-msg'>archivio vuoto</p>"; return; }
    list.innerHTML = "";
    activeNotes.forEach(n => {
        const div = document.createElement('div'); div.className = 'file-item'; div.setAttribute('data-id', n.id);
        if (selectedFileIds.includes(n.id)) div.classList.add('selected');
        let d = new Date(n.id); let dateStr = d.toLocaleDateString('it-IT') + " " + d.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
        div.innerHTML = `<span class="file-name-text">${n.name}</span><span class="file-date">${n.fav?':-) ':''}${dateStr}</span>`;
        div.onclick = (e) => { 
            e.stopPropagation(); 
            if (didDragItem || didDragSelection) {
                div.dataset.cmdAdded = "false";
                return;
            }
            if (e.shiftKey) {
                selectRange(n.id);
            } else if (e.metaKey || e.ctrlKey) { 
                if (div.dataset.cmdAdded === "true") {
                    div.dataset.cmdAdded = "false";
                    lastClickedId = n.id;
                } else {
                    toggleSelection(n.id); 
                    lastClickedId = n.id; 
                }
            } else { 
                clearSelection(); 
                toggleSelection(n.id); 
                lastClickedId = n.id; 
                spawnNote(n); 
            } 
        };
        div.oncontextmenu = (e) => { e.preventDefault(); if (!selectedFileIds.includes(n.id)) { clearSelection(); selectedFileIds.push(n.id); div.classList.add('selected'); } contextFileId = n.id; const m = document.getElementById('context-menu'); m.style.display = "block"; m.style.left = e.pageX + "px"; m.style.top = e.pageY + "px"; };
        setupAppDrag(div, n);
        list.appendChild(div);
    });
}

async function loadGalleria() {
    const list = document.getElementById('galleria-list');
    const notes = await dbOp("readonly", s => new Promise(res => { const req = s.getAll(); req.onsuccess = () => res(req.result); }));
    const photos = notes.filter(n => !n.trashed && n.name.toLowerCase().endsWith('.png') && !n.hiddenFromApp).sort((a,b) => b.id - a.id);
    currentVisibleIds = photos.map(n => n.id); 
    if(photos.length === 0) { list.innerHTML = "<p class='empty-msg full-width'>Nessuna foto</p>"; return; }
    list.innerHTML = "";
    photos.forEach(n => {
        const div = document.createElement('div'); div.className = 'gallery-item'; div.setAttribute('data-id', n.id);
        if (selectedFileIds.includes(n.id)) div.classList.add('selected');
        div.innerHTML = `${n.fav ? `<div class="gallery-fav">:-)</div>` : ''}<img src="${n.content}"><span class="gallery-name" id="fn-${n.id}">${n.name}</span>`;
        
        div.onclick = (e) => { 
            e.stopPropagation(); 
            if (didDragItem || didDragSelection) {
                div.dataset.cmdAdded = "false";
                return;
            }
            if (e.shiftKey) {
                selectRange(n.id);
            } else if (e.metaKey || e.ctrlKey) { 
                if (div.dataset.cmdAdded === "true") {
                    div.dataset.cmdAdded = "false";
                    lastClickedId = n.id;
                } else {
                    toggleSelection(n.id); 
                    lastClickedId = n.id; 
                }
            } else { 
                clearSelection(); 
                toggleSelection(n.id); 
                lastClickedId = n.id; 
                openPhotoViewer(n.id); 
            } 
        };
        div.oncontextmenu = (e) => { e.preventDefault(); if (!selectedFileIds.includes(n.id)) { clearSelection(); selectedFileIds.push(n.id); div.classList.add('selected'); } contextFileId = n.id; const m = document.getElementById('context-menu'); m.style.display = "block"; m.style.left = e.pageX + "px"; m.style.top = e.pageY + "px"; };
        setupAppDrag(div, n);
        list.appendChild(div);
    });
}

function openArchive() { openWindow('window-archivio'); loadArchive(); }
function openGalleria() { openWindow('window-galleria'); loadGalleria(); }
function spawnNote(n) { currentEditingNoteId = n.id; document.getElementById('note-input').value = n.content; openWindow('window-scrivi');  }

/**
 * FOTOCAMERA E ELIMINAZIONI
 */
async function takePhoto() {
    const video = document.getElementById('webcam-video'); if (!webcamStream || video.videoWidth === 0) return;
    const flash = document.getElementById('camera-flash'); flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 100);
    const canvas = document.getElementById('photo-canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d'); ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const note = { id: Date.now(), name: "IMG_" + Math.floor(Date.now() / 1000) + ".png", content: canvas.toDataURL('image/png'), fav: false, trashed: false };
    await dbOp("readwrite", s => s.put(note)); loadGalleria();
}

async function executeDelete() {
    if (deleteActionType === 'empty_trash') {
        const notes = await dbOp("readonly", s => new Promise(res => { const req = s.getAll(); req.onsuccess = () => res(req.result); }));
        const trashed = notes.filter(n => n.trashed);
        for (let n of trashed) {
            await dbOp("readwrite", s => new Promise((res, rej) => { const req = s.delete(n.id); req.onsuccess = res; req.onerror = rej; }));
        }
    } else {
        const idsToProcess = pendingDeleteIds;
        for (let id of idsToProcess) {
            const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(id); req.onsuccess = () => res(req.result); }));
            if (deleteActionType === 'trash' && note) { 
                note.trashed = true; note.fav = false; 
                await dbOp("readwrite", s => new Promise((res, rej) => { const req = s.put(note); req.onsuccess = res; req.onerror = rej; })); 
            } else { 
                await dbOp("readwrite", s => new Promise((res, rej) => { const req = s.delete(id); req.onsuccess = res; req.onerror = rej; })); 
            }
        }
    }
    pendingDeleteIds = [];
    clearSelection(); closeWindow('window-confirm'); closeWindow('window-viewer'); loadArchive(); loadGalleria(); loadCestino();
}

async function toggleFavorite() {
    hideContextMenus(); 
    let idsToProcess = selectedFileIds.length > 0 ? [...selectedFileIds] : [];
    if (idsToProcess.length === 0) {
        if (contextFileId) idsToProcess.push(contextFileId);
        else if (contextFolderId) idsToProcess.push(contextFolderId);
    }
    
    for (let id of idsToProcess) {
        if (typeof id === 'number') {
            const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(id); req.onsuccess = () => res(req.result); }));
            if(note) { note.fav = !note.fav; await dbOp("readwrite", s => s.put(note)); }
        } else if (typeof id === 'string' && id.startsWith('shortcut-')) {
            const shortcut = foldersList.find(f => f.id === id);
            if (shortcut && shortcut.noteId) {
                const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(shortcut.noteId); req.onsuccess = () => res(req.result); }));
                if(note) { note.fav = !note.fav; await dbOp("readwrite", s => s.put(note)); }
            }
        } else if (typeof id === 'string' && id.startsWith('cartella-')) {
            const folderObj = foldersList.find(f => f.id === id);
            if (folderObj) {
                folderObj.fav = !folderObj.fav;
                localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
            }
        }
    }
    loadArchive(); 
    loadGalleria();
    renderDesktopFolders();
    document.querySelectorAll('.window').forEach(w => { if (w.id.startsWith('window-cartella-')) renderFolderContent(w.id.replace('window-', '')); });
    clearSelection();
}

function enableRenameMode() {
    hideContextMenus(); isRenaming = true;
    const span = document.getElementById('fn-' + contextFileId); if (!span) return;
    span.contentEditable = true; span.focus();
    const range = document.createRange(); range.selectNodeContents(span); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    span.onblur = async () => {
        isRenaming = false; span.contentEditable = false;
        const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(contextFileId); req.onsuccess = () => res(req.result); }));
        let newName = span.innerText.trim() || "file"; 
        
        if (note.name.toLowerCase().endsWith('.png')) {
            if (!newName.toLowerCase().endsWith('.png')) newName += '.png';
        } else {
            if (!newName.toLowerCase().endsWith('.txt')) newName += '.txt';
        }
        
        note.name = newName; await dbOp("readwrite", s => s.put(note)); loadArchive(); loadGalleria();
    };
    span.onkeydown = (e) => { if(e.key === "Enter") { e.preventDefault(); span.blur(); } };
}

function saveIconPositions() {
    const positions = {};
    document.querySelectorAll('.desktop-icon:not(.folder-custom)').forEach(icon => { positions[icon.id] = { top: icon.style.top, left: icon.style.left }; });
    localStorage.setItem('verbum_icon_positions', JSON.stringify(positions));
    
    document.querySelectorAll('.folder-custom').forEach(fNode => {
        const fObj = foldersList.find(f => f.id === fNode.id);
        if (fObj) { fObj.top = fNode.style.top; fObj.left = fNode.style.left; }
    });
    localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
}

function loadIconPositions() {
    const saved = JSON.parse(localStorage.getItem('verbum_icon_positions'));
    if (saved) { for (const [id, pos] of Object.entries(saved)) { const icon = document.getElementById(id); if (icon) { icon.style.top = pos.top; icon.style.left = pos.left; } } }
}

async function openWebcam() {
    openWindow('window-webcam'); const video = document.getElementById('webcam-video');
    try { webcamStream = await navigator.mediaDevices.getUserMedia({ video: true }); video.srcObject = webcamStream; } catch (err) { alert("Errore fotocamera."); }
}

function closeWebcam() { closeWindow('window-webcam'); if (webcamStream) { webcamStream.getTracks().forEach(track => track.stop()); webcamStream = null; } }

async function loadCestino() {
    const list = document.getElementById('cestino-list');
    const notes = await dbOp("readonly", s => new Promise(res => { const req = s.getAll(); req.onsuccess = () => res(req.result); }));
    const trashed = notes.filter(n => n.trashed).sort((a,b) => b.id - a.id);
    
    currentVisibleIds = trashed.map(n => n.id); 

    if(trashed.length === 0) { list.innerHTML = "<p class='empty-msg'>cestino vuoto</p>"; return; }
    list.innerHTML = "";
    
    trashed.forEach(n => {
        const div = document.createElement('div'); div.className = 'file-item'; div.setAttribute('data-id', n.id);
        if (selectedFileIds.includes(n.id)) div.classList.add('selected');
        
        div.innerHTML = `<span class="trash-text">${n.name}</span>`;
        
        div.onclick = (e) => { 
            e.stopPropagation(); 
            if (e.shiftKey) selectRange(n.id); 
            else if (e.metaKey || e.ctrlKey) { toggleSelection(n.id); lastClickedId = n.id; } 
            else { clearSelection(); toggleSelection(n.id); lastClickedId = n.id; } 
        };
        
        div.oncontextmenu = (e) => { 
            e.preventDefault(); 
            if (!selectedFileIds.includes(n.id)) { clearSelection(); selectedFileIds.push(n.id); div.classList.add('selected'); } 
            contextFileId = n.id; 
            const m = document.getElementById('context-menu-cestino'); 
            m.style.display = "block"; m.style.left = e.pageX + "px"; m.style.top = e.pageY + "px"; 
        };
        list.appendChild(div);
    });
}
function openCestino() { openWindow('window-cestino'); loadCestino(); }

async function restoreNote() { 
    hideContextMenus(); 
    const idsToProcess = selectedFileIds.length > 0 ? [...selectedFileIds] : (contextFileId ? [contextFileId] : []);
    
    for (let id of idsToProcess) {
        const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(id); req.onsuccess = () => res(req.result); })); 
        if(note) { 
            if (note.content === 'cartella_eliminata') {
                const newFolder = { id: note.folderId, name: getUniqueFolderName(note.name, note.parentId || null), parentId: note.parentId || null, top: note.top || '150px', left: note.left || '150px', type: note.type, noteId: note.noteId };
                foldersList.push(newFolder); localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
                if (newFolder.parentId) renderFolderContent(newFolder.parentId); else renderDesktopFolders();
                await dbOp("readwrite", s => s.delete(note.id));
            } else { 
                note.trashed = false; 
                note.hiddenFromApp = false; 
                await dbOp("readwrite", s => s.put(note)); 
            }
        }
    } 
    clearSelection(); loadArchive(); loadGalleria(); loadCestino(); 
}

function askEmptyTrash(e) { hideContextMenus(); deleteActionType = 'empty_trash'; const win = document.getElementById('window-confirm'); document.getElementById('confirm-msg-text').innerText = "Svuotare il cestino?"; win.style.left = (e.clientX - 125) + "px"; win.style.top = (e.clientY - 75) + "px"; openWindow('window-confirm'); }
function openSaveDialog(e) { const content = document.getElementById('note-input').value.trim(); if (!content) return; const win = document.getElementById('window-save'); win.style.left = (window.innerWidth / 2 - 150) + "px"; win.style.top = (window.innerHeight / 2 - 100) + "px"; openWindow('window-save'); }
let pendingDeleteIds = [];
function askDeleteNote(e, type) { 
    hideContextMenus(); 
    deleteActionType = type; 
    pendingDeleteIds = selectedFileIds.length > 0 ? [...selectedFileIds] : (contextFileId ? [contextFileId] : []);
    const win = document.getElementById('window-confirm'); 
    const msg = type === 'trash' ? "Spostare nel cestino?" : "Eliminare definitivamente?"; 
    document.getElementById('confirm-msg-text').innerText = msg; 
    win.style.left = (e.clientX - 125) + "px"; 
    win.style.top = (e.clientY - 75) + "px"; 
    openWindow('window-confirm'); 
}

/**
 * SELEZIONE DESKTOP E GESTIONE CARTELLE 
 */
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.context-menu') && !isRenaming) {
        hideContextMenus();
    }

    if (e.button !== 0) return; 
    
    if (e.target.closest('.file-item, .gallery-item, .folder-custom, .action-btn, textarea, input')) return;

    const windowContent = e.target.closest('.window-content');
    const isDesktop = e.target.tagName === 'BODY' || e.target.classList.contains('desktop-title');

    if (isDesktop || windowContent) {
        isSelecting = true; 
        didDragSelection = false; 
        selectionContainer = windowContent ? windowContent : document.body;
        
        const box = document.getElementById('selection-box'); 
        
        selectionContainer.appendChild(box);
        box.style.zIndex = selectionContainer === document.body ? '10' : '50';

        if (selectionContainer === document.body) {
            startX = e.pageX;
            startY = e.pageY;
        } else {
            const rect = selectionContainer.getBoundingClientRect();
            startX = e.clientX - rect.left + selectionContainer.scrollLeft;
            startY = e.clientY - rect.top + selectionContainer.scrollTop;
        }

        box.style.display = 'block'; 
        box.style.left = startX + 'px'; 
        box.style.top = startY + 'px'; 
        box.style.width = '0px'; 
        box.style.height = '0px';
        clearSelection();
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isSelecting || !selectionContainer) return;
    didDragSelection = true;
    
    const box = document.getElementById('selection-box'); 
    let currentX, currentY;
    
    if (selectionContainer === document.body) {
        currentX = e.pageX;
        currentY = e.pageY;
    } else {
        const rect = selectionContainer.getBoundingClientRect();
        currentX = e.clientX - rect.left + selectionContainer.scrollLeft;
        currentY = e.clientY - rect.top + selectionContainer.scrollTop;
    }

    const x = Math.min(startX, currentX); 
    const y = Math.min(startY, currentY); 
    const width = Math.abs(currentX - startX); 
    const height = Math.abs(currentY - startY);
    
    box.style.left = x + 'px'; 
    box.style.top = y + 'px'; 
    box.style.width = width + 'px'; 
    box.style.height = height + 'px';
    
    const boxRect = box.getBoundingClientRect();
    selectedFileIds = [];
    
    let elementsToCheck = [];
    if (selectionContainer === document.body) {
        document.querySelectorAll('.desktop-icon').forEach(el => {
            if(el.parentElement === document.body) elementsToCheck.push(el);
        });
    } else {
        elementsToCheck = selectionContainer.querySelectorAll('.folder-item, .file-item, .gallery-item');
    }

    elementsToCheck.forEach(el => {
        const elRect = el.getBoundingClientRect(); 
        const overlap = !(boxRect.right < elRect.left || boxRect.left > elRect.right || boxRect.bottom < elRect.top || boxRect.top > elRect.bottom);
        if (overlap) {
            el.classList.add('selected');
            const id = el.hasAttribute('data-id') ? Number(el.getAttribute('data-id')) : el.id;
            if (id && !selectedFileIds.includes(id)) selectedFileIds.push(id);
        } else {
            el.classList.remove('selected');
        }
    });
});

document.addEventListener('mouseup', () => { 
    if (isSelecting) { 
        isSelecting = false; 
        const box = document.getElementById('selection-box');
        box.style.display = 'none'; 
        document.body.appendChild(box); 
        selectionContainer = null;
    } 
});

document.addEventListener('contextmenu', (e) => {
    e.preventDefault(); 
    if (e.target.tagName === 'BODY' || e.target.classList.contains('desktop-title')) {
        hideContextMenus(); contextMenuX = e.pageX; contextMenuY = e.pageY;
        const pasteBtn = document.getElementById('menu-paste-desktop');
        if (pasteBtn) pasteBtn.style.display = (clipboardItems && clipboardItems.length > 0) ? 'block' : 'none';
        const menu = document.getElementById('context-menu-desktop'); menu.style.display = "block"; menu.style.left = contextMenuX + "px"; menu.style.top = contextMenuY + "px";
    }
});

// LOGICA NOMI UNICI
function getUniqueFolderName(baseName, parentId) {
    const existingNames = foldersList.filter(f => f.parentId === parentId).map(f => f.name);
    if (!existingNames.includes(baseName)) return baseName;
    let counter = 2; let newName = `${baseName}_${counter}`;
    while (existingNames.includes(newName)) { counter++; newName = `${baseName}_${counter}`; }
    return newName;
}

// RENDERIZZA IL DESKTOP
function renderDesktopFolders() {
    document.querySelectorAll('.desktop-icon.folder-custom').forEach(el => el.remove());
    const desktopFolders = foldersList.filter(f => !f.parentId);
    desktopFolders.forEach(f => { createFolderDOMElement(f, document.body, false); });
}

// RENDERIZZA L'INTERNO DI UNA CARTELLA
function renderFolderContent(parentId) {
    const win = document.getElementById('window-' + parentId);
    if (!win) return;
    const contentDiv = win.querySelector('.window-content');
    contentDiv.innerHTML = ''; 
    const children = foldersList.filter(f => f.parentId === parentId);
    
    contentDiv.style.display = 'block';

    if (children.length === 0) { 
        contentDiv.innerHTML = '<p class="empty-msg">cartella vuota</p>'; 
    } else {
        children.forEach(f => { createFolderDOMElement(f, contentDiv, true); });
    }

    contentDiv.oncontextmenu = (e) => {
        if(e.target.closest('.folder-item')) return; 
        e.preventDefault(); e.stopPropagation(); hideContextMenus(); currentActiveFolderWindow = parentId;
        const rect = contentDiv.getBoundingClientRect();
        contextMenuLocalX = e.clientX - rect.left;
        contextMenuLocalY = e.clientY - rect.top;
        const pasteBtn = document.getElementById('menu-paste-folder');
        if (pasteBtn) pasteBtn.style.display = (clipboardItems && clipboardItems.length > 0) ? 'block' : 'none';
        const menu = document.getElementById('context-menu-inside-folder'); menu.style.display = "block"; menu.style.left = e.pageX + "px"; menu.style.top = e.pageY + "px";
    };
}

// CREA IL BLOCCO HTML DELLA CARTELLA E DELLE FOTO-SHORTCUT
function createFolderDOMElement(fData, parentContainer, isNested) {
    const folder = document.createElement('div');
    folder.className = isNested ? 'folder-item folder-custom' : 'desktop-icon folder-custom'; 
    folder.id = fData.id;
    
    if(fData.type === 'photo') folder.classList.add('photo-shortcut');

    folder.style.position = 'absolute';
    folder.style.top = fData.top || '20px';
    folder.style.left = fData.left || '20px';

    if (fData.type === 'photo') {
        const cachedImg = imageCache[fData.noteId];
        folder.innerHTML = `
            <div id="fav-${fData.id}" class="fav-indicator ${fData.fav ? 'visible' : ''}">:-)</div>
            <img id="img-${fData.id}" src="${cachedImg || ''}" class="folder-icon-img">
            <span class="icon-label">${fData.name}</span>
        `;
        dbOp("readonly", s => new Promise(res => { const req = s.get(fData.noteId); req.onsuccess = () => res(req.result); })).then(note => {
            if (note) { 
                if (!cachedImg) {
                    imageCache[fData.noteId] = note.content;
                    const img = document.getElementById(`img-${fData.id}`); if(img) img.src = note.content; 
                }
                const fav = document.getElementById(`fav-${fData.id}`); if(fav && note.fav) fav.classList.add('visible');
            }
        });
    } else if (fData.type === 'note') {
        folder.innerHTML = `
            <div id="fav-${fData.id}" class="fav-indicator ${fData.fav ? 'visible' : ''}">:-)</div>
            <div class="icon-img icon-sheet icon-sheet-container"></div>
            <span class="icon-label">${fData.name}</span>
        `;
        dbOp("readonly", s => new Promise(res => { const req = s.get(fData.noteId); req.onsuccess = () => res(req.result); })).then(note => {
            if (note) { 
                const fav = document.getElementById(`fav-${fData.id}`); if(fav && note.fav) fav.classList.add('visible');
            }
        });
    } else {
        folder.innerHTML = `
            <div id="fav-${fData.id}" class="fav-indicator ${fData.fav ? 'visible' : ''}">:-)</div>
            <div class="icon-img icon-folder"></div>
            <span class="icon-label">${fData.name}</span>
        `;
    }
    
    folder.onclick = (e) => {
        e.stopPropagation();
        if (didDragItem || didDragSelection) {
            folder.dataset.cmdAdded = "false";
            return; 
        }

        if (e.metaKey || e.ctrlKey || e.shiftKey) { 
            if (folder.dataset.cmdAdded === "true") {
                folder.dataset.cmdAdded = "false";
                lastClickedId = fData.id;
            } else {
                toggleSelection(fData.id); 
                lastClickedId = fData.id; 
            }
        } 
        else { 
            clearSelection(); 
            toggleSelection(fData.id); 
            lastClickedId = fData.id; 
        }
    };

    folder.ondblclick = (e) => { 
        e.stopPropagation(); 
        if (fData.type === 'photo') openPhotoViewer(fData.noteId);
        else if (fData.type === 'note') {
            dbOp("readonly", s => new Promise(res => { const req = s.get(fData.noteId); req.onsuccess = () => res(req.result); })).then(note => {
                if (note) spawnNote(note);
            });
        }
        else openFolderWindow(fData.id, fData.name); 
    };
    
    folder.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation(); hideContextMenus(); 
        if (!selectedFileIds.includes(fData.id)) { 
            clearSelection(); 
            selectedFileIds.push(fData.id); 
            folder.classList.add('selected'); 
        }
        contextFolderId = fData.id;
        
        const groupBtn = document.getElementById('menu-group-folder');
        if (groupBtn) groupBtn.style.display = selectedFileIds.length > 1 ? 'block' : 'none';

        const menu = document.getElementById('context-menu-folder'); menu.style.display = "block"; menu.style.left = e.pageX + "px"; menu.style.top = e.pageY + "px";
    };
    
    parentContainer.appendChild(folder);
    setupDrag(folder); 
}

// APRE LA FINESTRA DELLA CARTELLA
function openFolderWindow(folderId, folderName) {
    let win = document.getElementById('window-' + folderId);
    if (!win) {
        win = document.createElement('div'); win.id = 'window-' + folderId; win.className = 'window'; win.style.top = '150px'; win.style.left = '200px'; win.style.width = '350px'; win.style.height = '300px';
        win.innerHTML = `<div class="window-header"><span>root/${folderName}</span><span class="action-btn" onclick="closeWindow('${win.id}')">X</span></div><div class="window-content"></div>`;
        document.body.appendChild(win); setupDrag(win);
    }
    openWindow(win.id); renderFolderContent(folderId);
}

// CREA UNA NUOVA CARTELLA 
function createNewFolder(parentId = null) {
    hideContextMenus(); const id = 'cartella-' + Date.now(); const name = getUniqueFolderName('nuova_cartella', parentId);
    const newFolder = { id: id, name: name, parentId: parentId, top: contextMenuY + 'px', left: contextMenuX + 'px' };
    foldersList.push(newFolder); localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
    if (parentId) renderFolderContent(parentId); else renderDesktopFolders();
}

function createNewNestedFolder() { 
    hideContextMenus(); 
    const id = 'cartella-' + Date.now(); 
    const name = getUniqueFolderName('nuova_cartella', currentActiveFolderWindow);
    const newFolder = { id: id, name: name, parentId: currentActiveFolderWindow, top: contextMenuLocalY + 'px', left: contextMenuLocalX + 'px' };
    foldersList.push(newFolder); localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
    renderFolderContent(currentActiveFolderWindow); 
}

// ELIMINA DI MASSA E STORICO UNDO
async function deleteFolder() {
    hideContextMenus(); 
    const idsToDelete = selectedFileIds.filter(id => typeof id === 'string' && (id.startsWith('cartella-') || id.startsWith('shortcut-')));
    if (idsToDelete.length === 0 && contextFolderId) idsToDelete.push(contextFolderId);
    if (idsToDelete.length === 0) return;

    let parentIdToUpdate = null;

    for (let id of idsToDelete) {
        const folderToDelete = foldersList.find(f => f.id === id); if (!folderToDelete) continue;
        parentIdToUpdate = folderToDelete.parentId;
        
        const trashId = Date.now() + Math.random(); 
        const trashFolder = { id: trashId, name: folderToDelete.name, content: 'cartella_eliminata', folderId: folderToDelete.id, parentId: folderToDelete.parentId, top: folderToDelete.top, left: folderToDelete.left, fav: false, trashed: true, type: folderToDelete.type, noteId: folderToDelete.noteId };
        await dbOp("readwrite", s => s.put(trashFolder));
        
        historyStack.push({ type: 'delete_folder', folderData: { ...folderToDelete }, trashId: trashId });
        foldersList = foldersList.filter(f => f.id !== id);
    }

    localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
    clearSelection();
    
    if (parentIdToUpdate) renderFolderContent(parentIdToUpdate); 
    else renderDesktopFolders();
    
    contextFolderId = null; loadCestino();
}

function renameFolder() {
    hideContextMenus(); if (!contextFolderId) return;
    const folderNode = document.getElementById(contextFolderId); if (!folderNode) return;
    isRenaming = true; const span = folderNode.querySelector('.icon-label'); span.contentEditable = true; span.focus();
    const range = document.createRange(); range.selectNodeContents(span); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    span.onblur = () => {
        isRenaming = false; span.contentEditable = false;
        const folderObj = foldersList.find(f => f.id === contextFolderId);
        let newName = span.innerText.trim() || (folderObj && folderObj.type === 'photo' ? 'foto' : 'cartella');
        
        if (folderObj) {
            if (folderObj.type === 'photo' && !newName.toLowerCase().endsWith('.png')) newName += '.png';
            if(folderObj.name !== newName) newName = getUniqueFolderName(newName, folderObj.parentId);
            folderObj.name = newName; localStorage.setItem('verbum_folders', JSON.stringify(foldersList)); span.innerText = newName; 
        }
        const win = document.getElementById('window-' + contextFolderId);
        if (win) { const titleSpan = win.querySelector('.window-header span:first-child'); if (titleSpan) titleSpan.innerText = 'root/' + newName; }
    };
    span.onkeydown = (e) => { if(e.key === "Enter") { e.preventDefault(); span.blur(); } };
}

// FINESTRA ERRORE SPOSTAMENTO CARTELLE
function openErrorWindow(folderName) {
    let win = document.getElementById('window-error');
    if (!win) {
        win = document.createElement('div');
        win.id = 'window-error';
        win.className = 'window';
        win.style.width = '320px';
        document.body.appendChild(win);
        setupDrag(win);
    }
    win.style.top = (window.innerHeight / 2 - 75) + 'px';
    win.style.left = (window.innerWidth / 2 - 160) + 'px';
    win.innerHTML = `
        <div class="window-header">
            <span>errore</span>
            <span class="action-btn" onclick="closeWindow('window-error')">X</span>
        </div>
        <div class="window-content text-center">
            <p class="error-msg">La cartella "${folderName}" non può essere spostata in una delle sue sottocartelle.</p>
            <button class="confirm-btn" onclick="closeWindow('window-error')">OK</button>
        </div>
    `;
    openWindow('window-error');
}

// SETUP TRASCINAMENTO DA APP (ARCHIVIO E GALLERIA)
function setupAppDrag(el, note) {
    el.onmousedown = (e) => {
        if(e.button !== 0 || e.target.closest('.gallery-fav')) return;
        
        if (!selectedFileIds.includes(note.id)) {
            if (e.shiftKey) return; 
            
            if (!e.metaKey && !e.ctrlKey) {
                clearSelection();
            } else {
                el.dataset.cmdAdded = "true";
            }
            toggleSelection(note.id);
            lastClickedId = note.id;
        }

        e.preventDefault(); 
        
        let isDragging = false;
        let ghost = null;
        let ox = 16, oy = 16; 
        let startClickX = e.clientX;
        let startClickY = e.clientY;
        
        document.onmousemove = (moveEvent) => {
            if(!isDragging) {
                if (Math.abs(moveEvent.clientX - startClickX) < 4 && Math.abs(moveEvent.clientY - startClickY) < 4) return;

                isDragging = true;
                didDragItem = true;
                
                let ghostText = selectedFileIds.length > 1 ? `${selectedFileIds.length} file` : note.name;
                
                ghost = document.createElement('div');
                ghost.className = 'desktop-icon folder-custom photo-shortcut';
                
                let isPhoto = note.name.toLowerCase().endsWith('.png');
                let imgHtml = isPhoto 
                    ? `<img src="${note.content}" class="folder-icon-img">`
                    : `<div class="icon-img icon-sheet icon-sheet-container"></div>`;
                    
                ghost.innerHTML = `${imgHtml}<span class="icon-label">${ghostText}</span>`;
                ghost.style.position = 'absolute';
                ghost.style.zIndex = 9999;
                document.body.appendChild(ghost);
            }
            ghost.style.left = (moveEvent.clientX - ox) + "px";
            ghost.style.top = (moveEvent.clientY - oy) + "px";
            
            ghost.style.display = 'none';
            const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
            ghost.style.display = 'flex';
            
            document.querySelectorAll('.drag-target').forEach(t => t.classList.remove('drag-target'));
            if (elementBelow) {
                const targetFolder = elementBelow.closest('.folder-custom:not(.photo-shortcut)');
                if (targetFolder) targetFolder.classList.add('drag-target');
            }
        };
        
        document.onmouseup = async (mouseUpEvent) => {
            document.onmousemove = null;
            document.onmouseup = null;
            document.querySelectorAll('.drag-target').forEach(t => t.classList.remove('drag-target'));
            
            if (!isDragging || !ghost) return;
            setTimeout(() => didDragItem = false, 50);
            
            ghost.style.display = 'none';
            const elementBelow = document.elementFromPoint(mouseUpEvent.clientX, mouseUpEvent.clientY);
            ghost.remove();
            
            let targetId = undefined;
            if (elementBelow) {
                const targetFolderIcon = elementBelow.closest('.folder-custom:not(.photo-shortcut)');
                const targetWindow = elementBelow.closest('.window');
                
                if (targetFolderIcon) targetId = targetFolderIcon.id;
                else if (targetWindow && targetWindow.id.startsWith('window-cartella-')) targetId = targetWindow.id.replace('window-', '');
                else if (elementBelow.tagName === 'BODY' || elementBelow.classList.contains('desktop-title')) targetId = null;
            }
            
            if (targetId !== undefined) {
                const idsToProcess = [...selectedFileIds];
                
                for (let noteId of idsToProcess) {
                    const originalNote = await dbOp("readonly", s => new Promise(res => { const req = s.get(Number(noteId)); req.onsuccess = () => res(req.result); }));
                    if (!originalNote) continue;
                    
                    const newNoteId = Date.now() + Math.random();
                    const isPhoto = originalNote.name.toLowerCase().endsWith('.png');
                    const newName = originalNote.name.replace(/(\.txt|\.png)$/i, "") + " copia" + (isPhoto ? ".png" : ".txt");
                    
                    const newNote = {
                        ...originalNote,
                        id: newNoteId,
                        name: newName,
                        fav: false,
                        trashed: false,
                        hiddenFromApp: true
                    };
                    await dbOp("readwrite", s => s.put(newNote));

                    const pos = getNextIconPosition(targetId);

                    const newShortcut = {
                        id: 'shortcut-' + Date.now() + Math.random(),
                        type: isPhoto ? 'photo' : 'note',
                        noteId: newNoteId,
                        name: newName,
                        parentId: targetId,
                        top: pos.top,
                        left: pos.left
                    };
                    foldersList.push(newShortcut);
                }
                
                localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
                if (targetId) renderFolderContent(targetId);
                else renderDesktopFolders();
                clearSelection();
                loadArchive();
                loadGalleria();
            }
        };
    };
}

function groupSelectedIntoFolder() {
    hideContextMenus(); 
    const idsToGroup = selectedFileIds.filter(id => typeof id === 'string');
    if (idsToGroup.length === 0 && contextFolderId) idsToGroup.push(contextFolderId);
    if (idsToGroup.length === 0) return;

    const firstItem = foldersList.find(f => f.id === idsToGroup[0]);
    const parentId = firstItem ? firstItem.parentId : null;

    const newFolderId = 'cartella-' + Date.now(); 
    const newFolderName = getUniqueFolderName('nuovo_gruppo', parentId);
    
    const newFolder = { 
        id: newFolderId, 
        name: newFolderName, 
        parentId: parentId, 
        top: firstItem ? firstItem.top : '100px', 
        left: firstItem ? firstItem.left : '100px' 
    };
    foldersList.push(newFolder);

    idsToGroup.forEach((id) => {
        const folderObj = foldersList.find(f => f.id === id);
        if (folderObj) {
            folderObj.parentId = newFolderId;
            folderObj.top = '-999px'; 
            const pos = getNextIconPosition(newFolderId);
            folderObj.top = pos.top; 
            folderObj.left = pos.left;
        }
    });

    localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
    clearSelection();
    
    if (parentId) renderFolderContent(parentId); 
    else renderDesktopFolders();
    
    openFolderWindow(newFolderId, newFolderName);
}

function copySelected() {
    hideContextMenus();
    clipboardItems = [];
    if (selectedFileIds.length > 0) {
        clipboardItems = [...selectedFileIds];
    } else if (contextFileId) {
        clipboardItems = [contextFileId];
    } else if (contextFolderId) {
        clipboardItems = [contextFolderId];
    }
}

async function pasteCopied(targetParentId) {
    hideContextMenus();
    if (!clipboardItems || clipboardItems.length === 0) return;

    for (let i = 0; i < clipboardItems.length; i++) {
        let id = clipboardItems[i];
        const pos = getNextIconPosition(targetParentId);
        let currentTop = pos.top;
        let currentLeft = pos.left;

        if (typeof id === 'number') {
            const note = await dbOp("readonly", s => new Promise(res => { const req = s.get(id); req.onsuccess = () => res(req.result); }));
            if (note) {
                const newNoteId = Date.now() + Math.random();
                let isPhoto = note.name.toLowerCase().endsWith('.png');
                const newName = note.name.replace(/(\.txt|\.png)$/i, "") + " copia" + (isPhoto ? ".png" : ".txt");
                
                const newNote = {
                    ...note,
                    id: newNoteId,
                    name: newName,
                    fav: false,
                    trashed: false,
                    hiddenFromApp: true
                };
                await dbOp("readwrite", s => s.put(newNote));

                const newShortcut = {
                    id: 'shortcut-' + Date.now() + Math.random(),
                    type: isPhoto ? 'photo' : 'note',
                    noteId: newNoteId,
                    name: newName,
                    parentId: targetParentId,
                    top: currentTop,
                    left: currentLeft
                };
                foldersList.push(newShortcut);
            }
        } else if (typeof id === 'string') {
            await duplicateFolderItem(id, targetParentId, currentTop, currentLeft);
        }
    }
    
    localStorage.setItem('verbum_folders', JSON.stringify(foldersList));
    if (targetParentId) renderFolderContent(targetParentId);
    else renderDesktopFolders();
}

function getNextIconPosition(targetId) {
    const existing = foldersList.filter(f => f.parentId === targetId);
    
    let columns = 4; 
    if (targetId === null) {
        columns = Math.floor(window.innerWidth / 80) || 10;
    } else {
        const win = document.getElementById('window-' + targetId);
        if (win) {
            const content = win.querySelector('.window-content');
            if (content && content.clientWidth > 0) {
                columns = Math.floor(content.clientWidth / 80) || 4;
            }
        }
    }
    
    const occupied = new Set();
    existing.forEach(f => {
        const top = parseInt(f.top) || 0;
        const left = parseInt(f.left) || 0;
        const r = Math.round((top - 20) / 90);
        const c = Math.round((left - 20) / 80);
        if (r >= 0 && c >= 0) occupied.add(`${r},${c}`);
    });
    
    if (targetId === null) {
        document.querySelectorAll('body > .desktop-icon').forEach(icon => {
            const top = parseInt(icon.style.top) || 0;
            const left = parseInt(icon.style.left) || 0;
            const r = Math.round((top - 20) / 90);
            const c = Math.round((left - 20) / 80);
            if (r >= 0 && c >= 0) occupied.add(`${r},${c}`);
        });
    }
    
    let slotIndex = targetId === null ? columns : 0;
    while (true) {
        let row = Math.floor(slotIndex / columns);
        let col = slotIndex % columns;
        if (!occupied.has(`${row},${col}`)) {
            return {
                top: (20 + row * 90) + 'px',
                left: (20 + col * 80) + 'px'
            };
        }
        slotIndex++;
    }
}

async function duplicateFolderItem(originalId, targetParentId, top, left) {
    const original = foldersList.find(f => f.id === originalId);
    if (!original) return;

    if (original.type === 'photo' || original.type === 'note') {
        const oldNote = await dbOp("readonly", s => new Promise(res => { const req = s.get(original.noteId); req.onsuccess = () => res(req.result); }));
        let newNoteId = original.noteId;
        let newName = original.name;

        if (oldNote) {
            newNoteId = Date.now() + Math.random();
            const isPhoto = original.type === 'photo';
            newName = oldNote.name.replace(/(\.txt|\.png)$/i, "") + " copia" + (isPhoto ? ".png" : ".txt");
            
            const newNote = { ...oldNote, id: newNoteId, name: newName, fav: false, trashed: false, hiddenFromApp: true };
            await dbOp("readwrite", s => s.put(newNote));
        }

        const newShortcut = {
            ...original,
            id: 'shortcut-' + Date.now() + Math.random(),
            name: newName, 
            noteId: newNoteId, 
            parentId: targetParentId,
            top: top,
            left: left
        };
        foldersList.push(newShortcut);
    } else {
        const newFolderId = 'cartella-' + Date.now() + Math.random();
        const newFolder = {
            ...original,
            id: newFolderId,
            name: getUniqueFolderName(original.name + " copia", targetParentId),
            parentId: targetParentId,
            top: top,
            left: left
        };
        foldersList.push(newFolder);

        const children = foldersList.filter(f => f.parentId === originalId);
        for (let i = 0; i < children.length; i++) {
            await duplicateFolderItem(children[i].id, newFolderId, children[i].top, children[i].left);
        }
    }
}