/**
 * Claude Local Files — content.js
 * Injecté dans claude.ai, ajoute les fonctionnalités filesystem
 */

const SERVER = 'http://localhost:3747';
let serverOnline = false;
let toolbar = null;
let fileTreePanel = null;
let fileTreeVisible = false;

// ─── Init ───────────────────────────────────────────────────────────────────

async function init() {
  await checkServer();
  waitForEditor();
}

async function checkServer() {
  try {
    const r = await fetch(`${SERVER}/ping`, { signal: AbortSignal.timeout(1500) });
    serverOnline = r.ok;
  } catch {
    serverOnline = false;
  }
}

// Attend que l'éditeur de texte de claude.ai soit présent dans le DOM
function waitForEditor() {
  const observer = new MutationObserver(() => {
    const editor = getEditor();
    if (editor && !document.getElementById('clf-toolbar')) {
      injectUI();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Tentative immédiate aussi
  if (getEditor()) injectUI();
}

function getEditor() {
  // Sélecteur de la zone de saisie de claude.ai
  return document.querySelector('div[contenteditable="true"][data-placeholder]')
      || document.querySelector('div[contenteditable="true"].ProseMirror')
      || document.querySelector('textarea[placeholder*="message" i]')
      || document.querySelector('div[contenteditable="true"]');
}

// ─── Injection UI ────────────────────────────────────────────────────────────

function injectUI() {
  // Trouver le conteneur parent de l'éditeur
  const editor = getEditor();
  if (!editor) return;

  const editorParent = editor.closest('form') || editor.parentElement?.parentElement;
  if (!editorParent) return;

  // Barre d'outils
  toolbar = document.createElement('div');
  toolbar.id = 'clf-toolbar';
  toolbar.innerHTML = `
    <div class="clf-toolbar-inner">
      <button class="clf-btn clf-btn-files" id="clf-btn-tree" title="Parcourir les fichiers">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7v13h18V7M3 7h4l2-3h6l2 3h3M3 7h18"/>
        </svg>
        <span>Fichiers</span>
      </button>
      <button class="clf-btn clf-btn-open" id="clf-btn-open" title="Ouvrir un fichier">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>Ouvrir</span>
      </button>
      <button class="clf-btn clf-btn-save" id="clf-btn-save" title="Sauvegarder le dernier code généré">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>Sauver code</span>
      </button>
      <div class="clf-status" id="clf-status">
        <span class="clf-dot ${serverOnline ? 'online' : 'offline'}"></span>
        <span>${serverOnline ? 'Serveur connecté' : 'Serveur hors ligne'}</span>
      </div>
    </div>
  `;

  editorParent.insertAdjacentElement('beforebegin', toolbar);

  // Panel arborescence fichiers
  fileTreePanel = document.createElement('div');
  fileTreePanel.id = 'clf-filetree';
  fileTreePanel.innerHTML = `
    <div class="clf-panel-header">
      <span class="clf-panel-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7v13h18V7M3 7h4l2-3h6l2 3h3M3 7h18"/>
        </svg>
        Fichiers locaux
      </span>
      <button class="clf-panel-close" id="clf-close-tree">✕</button>
    </div>
    <div class="clf-breadcrumb" id="clf-breadcrumb">.</div>
    <div class="clf-tree-content" id="clf-tree-content">
      <div class="clf-loading">Chargement…</div>
    </div>
    <div class="clf-panel-footer">
      <button class="clf-action-btn" id="clf-inject-btn" disabled>
        📋 Injecter dans le chat
      </button>
    </div>
  `;

  document.body.appendChild(fileTreePanel);

  // Events
  document.getElementById('clf-btn-tree').addEventListener('click', toggleFileTree);
  document.getElementById('clf-btn-open').addEventListener('click', openFileDialog);
  document.getElementById('clf-btn-save').addEventListener('click', saveLastCode);
  document.getElementById('clf-close-tree').addEventListener('click', toggleFileTree);
  document.getElementById('clf-inject-btn').addEventListener('click', injectSelectedFile);

  // Refresh status périodique
  setInterval(refreshStatus, 5000);
}

// ─── Arborescence fichiers ────────────────────────────────────────────────────

async function toggleFileTree() {
  fileTreeVisible = !fileTreeVisible;
  fileTreePanel.classList.toggle('visible', fileTreeVisible);

  if (fileTreeVisible) {
    if (!serverOnline) {
      showTreeError('Serveur local hors ligne. Lance <code>node server.js</code> dans ton terminal.');
      return;
    }
    await loadDirectory('.');
  }
}

let currentPath = '.';
let selectedFile = null;

async function loadDirectory(path) {
  currentPath = path;
  const content = document.getElementById('clf-tree-content');
  const breadcrumb = document.getElementById('clf-breadcrumb');

  content.innerHTML = '<div class="clf-loading">Chargement…</div>';

  try {
    const r = await fetch(`${SERVER}/list?path=${encodeURIComponent(path)}`);
    const entries = await r.json();

    // Breadcrumb
    breadcrumb.textContent = path === '.' ? '/' : '/' + path.replace(/\\/g, '/');

    content.innerHTML = '';

    // Bouton "remonter"
    if (path !== '.') {
      const upBtn = document.createElement('div');
      upBtn.className = 'clf-entry clf-entry-up';
      upBtn.innerHTML = `<span class="clf-entry-icon">↩</span><span>.. (remonter)</span>`;
      upBtn.addEventListener('click', () => {
        const parts = path.replace(/\\/g, '/').split('/');
        parts.pop();
        loadDirectory(parts.length === 0 ? '.' : parts.join('/'));
      });
      content.appendChild(upBtn);
    }

    entries.forEach(entry => {
      const el = document.createElement('div');
      el.className = `clf-entry clf-entry-${entry.type}`;
      el.dataset.path = entry.path;
      el.dataset.type = entry.type;

      const icon = entry.type === 'directory' ? '📁' : getFileIcon(entry.name);
      el.innerHTML = `
        <span class="clf-entry-icon">${icon}</span>
        <span class="clf-entry-name">${entry.name}</span>
        ${entry.type === 'file' ? `<span class="clf-entry-size">${formatSize(entry.size)}</span>` : ''}
      `;

      el.addEventListener('click', () => {
        if (entry.type === 'directory') {
          loadDirectory(entry.path);
        } else {
          selectFile(el, entry);
        }
      });

      content.appendChild(el);
    });

    if (entries.length === 0) {
      content.innerHTML = '<div class="clf-empty">Dossier vide</div>';
    }

  } catch (err) {
    showTreeError('Erreur: ' + err.message);
  }
}

function selectFile(el, entry) {
  // Désélectionner le précédent
  document.querySelectorAll('.clf-entry.selected').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedFile = entry;
  document.getElementById('clf-inject-btn').disabled = false;
}

async function injectSelectedFile() {
  if (!selectedFile) return;

  try {
    const r = await fetch(`${SERVER}/read?path=${encodeURIComponent(selectedFile.path)}`);
    const data = await r.json();

    if (data.error) {
      alert('Erreur: ' + data.error);
      return;
    }

    // Injecter dans l'éditeur claude.ai
    const ext = selectedFile.name.split('.').pop();
    const text = `Voici le contenu de \`${selectedFile.path}\`:\n\`\`\`${ext}\n${data.content}\n\`\`\``;
    injectTextInEditor(text);

    // Fermer le panel
    toggleFileTree();

  } catch (err) {
    alert('Erreur lecture fichier: ' + err.message);
  }
}

// ─── Ouvrir fichier (input file dialog) ─────────────────────────────────────

function openFileDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.md,.js,.ts,.jsx,.tsx,.css,.html,.json,.py,.cs,.cpp,.c,.h,.php,.sql,.xml,.yaml,.yml,.sh,.bat,.ps1,.env,.gitignore,.log';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const ext = file.name.split('.').pop();
      const text = `Voici le contenu de \`${file.name}\`:\n\`\`\`${ext}\n${ev.target.result}\n\`\`\``;
      injectTextInEditor(text);
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── Sauvegarder le dernier code généré ──────────────────────────────────────

async function saveLastCode() {
  if (!serverOnline) {
    alert('Serveur local hors ligne. Lance node server.js');
    return;
  }

  // Cherche le dernier bloc de code dans les messages de Claude
  const codeBlocks = document.querySelectorAll('.prose pre code, pre code');
  if (codeBlocks.length === 0) {
    alert('Aucun bloc de code trouvé dans la conversation.');
    return;
  }

  const lastBlock = codeBlocks[codeBlocks.length - 1];
  const code = lastBlock.textContent;

  // Détecter l'extension depuis la classe CSS du bloc
  const langClass = lastBlock.className.match(/language-(\w+)/);
  const lang = langClass ? langClass[1] : 'txt';
  const extMap = { javascript: 'js', typescript: 'ts', python: 'py', csharp: 'cs', cpp: 'cpp', html: 'html', css: 'css', json: 'json', bash: 'sh', sql: 'sql', php: 'php' };
  const ext = extMap[lang] || lang;

  const filename = prompt(`Nom du fichier à sauvegarder:`, `output.${ext}`);
  if (!filename) return;

  try {
    const r = await fetch(`${SERVER}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filename, content: code })
    });
    const data = await r.json();
    if (data.success) {
      showNotification(`✅ Sauvegardé: ${filename}`);
    } else {
      alert('Erreur: ' + data.error);
    }
  } catch (err) {
    alert('Erreur: ' + err.message);
  }
}

// ─── Injection dans l'éditeur claude.ai ──────────────────────────────────────

function injectTextInEditor(text) {
  const editor = getEditor();
  if (!editor) {
    alert('Éditeur de claude.ai introuvable.');
    return;
  }

  // Focus l'éditeur
  editor.focus();

  // Méthode 1: contenteditable (ProseMirror de claude.ai)
  if (editor.isContentEditable) {
    // Insérer via execCommand (compatible avec ProseMirror)
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      document.execCommand('insertText', false, text);
    }

    // Déclencher les events pour que React/ProseMirror détecte le changement
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }
  // Méthode 2: textarea classique
  else if (editor.tagName === 'TEXTAREA') {
    const start = editor.selectionStart;
    editor.value = editor.value.slice(0, start) + text + editor.value.slice(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = start + text.length;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function refreshStatus() {
  await checkServer();
  const dot = document.querySelector('.clf-dot');
  const statusText = document.querySelector('#clf-status span:last-child');
  if (dot && statusText) {
    dot.className = `clf-dot ${serverOnline ? 'online' : 'offline'}`;
    statusText.textContent = serverOnline ? 'Serveur connecté' : 'Serveur hors ligne';
  }
}

function showTreeError(msg) {
  document.getElementById('clf-tree-content').innerHTML = `<div class="clf-error">${msg}</div>`;
}

function showNotification(msg) {
  const notif = document.createElement('div');
  notif.className = 'clf-notification';
  notif.textContent = msg;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = { js: '🟨', ts: '🔷', jsx: '⚛️', tsx: '⚛️', py: '🐍', cs: '💜', cpp: '⚙️', c: '⚙️', h: '⚙️', html: '🌐', css: '🎨', json: '📋', md: '📝', txt: '📄', sql: '🗄️', php: '🐘', xml: '📰', yaml: '⚙️', yml: '⚙️', sh: '💻', bat: '💻', ps1: '💻', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🎨', pdf: '📕', zip: '📦', rar: '📦' };
  return icons[ext] || '📄';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── Démarrage ────────────────────────────────────────────────────────────────
init();
