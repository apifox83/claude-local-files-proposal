/**
 * Claude Local Files — server.js
 * Serveur Node.js local (port 3747)
 * Expose le système de fichiers à l'extension Chrome
 *
 * Usage: node server.js
 * Optionnel: node server.js "C:\Dev\MonProjet"
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3747;
const CONFIG_FILE = path.join(process.env.APPDATA || process.env.HOME, '.claude-local-files.json');

// ─── Config ──────────────────────────────────────────────────────────────────

let config = { rootDirectory: '' };

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {}
}

// Si répertoire passé en argument
if (process.argv[2]) {
  config.rootDirectory = path.resolve(process.argv[2]);
  saveConfig();
} else {
  loadConfig();
}

// ─── Sécurité ─────────────────────────────────────────────────────────────────

function safePath(relativePath) {
  if (!config.rootDirectory) throw new Error('Répertoire racine non configuré');
  const root = path.resolve(config.rootDirectory);
  const full = path.resolve(path.join(root, relativePath.replace(/^[/\\]+/, '')));
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error('Accès refusé (hors du répertoire racine)');
  }
  return full;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handlePing(res) {
  respond(res, 200, { ok: true });
}

function handleConfig(req, res) {
  if (req.method === 'GET') {
    respond(res, 200, { rootDirectory: config.rootDirectory });
    return;
  }
  if (req.method === 'POST') {
    readBody(req, (body) => {
      try {
        const data = JSON.parse(body);
        const dir = data.rootDirectory?.trim();
        if (!dir) { respond(res, 400, { error: 'Répertoire vide' }); return; }
        if (!fs.existsSync(dir)) { respond(res, 400, { error: 'Répertoire introuvable: ' + dir }); return; }
        config.rootDirectory = path.resolve(dir);
        saveConfig();
        console.log(`📁 Répertoire racine: ${config.rootDirectory}`);
        respond(res, 200, { success: true });
      } catch (e) {
        respond(res, 400, { error: e.message });
      }
    });
    return;
  }
  respond(res, 405, { error: 'Méthode non autorisée' });
}

function handleList(req, res, params) {
  try {
    const relPath = params.get('path') || '.';
    const fullPath = safePath(relPath);

    if (!fs.existsSync(fullPath)) {
      respond(res, 404, { error: 'Chemin introuvable: ' + relPath });
      return;
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      respond(res, 400, { error: 'Ce chemin n\'est pas un dossier' });
      return;
    }

    const entries = [];
    const items = fs.readdirSync(fullPath);

    // Dossiers d'abord, puis fichiers
    const dirs = [], files = [];
    for (const item of items) {
      if (item.startsWith('.')) continue; // Ignorer les fichiers cachés
      const itemPath = path.join(fullPath, item);
      try {
        const s = fs.statSync(itemPath);
        const rel = path.relative(config.rootDirectory, itemPath).replace(/\\/g, '/');
        if (s.isDirectory()) dirs.push({ type: 'directory', name: item, path: rel });
        else files.push({ type: 'file', name: item, path: rel, size: s.size, modified: s.mtime.toISOString() });
      } catch {}
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    respond(res, 200, [...dirs, ...files]);
  } catch (e) {
    respond(res, 500, { error: e.message });
  }
}

function handleRead(req, res, params) {
  try {
    const relPath = params.get('path');
    if (!relPath) { respond(res, 400, { error: 'Paramètre path manquant' }); return; }

    const fullPath = safePath(relPath);
    if (!fs.existsSync(fullPath)) { respond(res, 404, { error: 'Fichier introuvable' }); return; }

    const stat = fs.statSync(fullPath);
    if (stat.size > 2 * 1024 * 1024) { respond(res, 400, { error: 'Fichier trop volumineux (> 2MB)' }); return; }

    const content = fs.readFileSync(fullPath, 'utf8');
    respond(res, 200, { content, size: stat.size, path: relPath });
  } catch (e) {
    respond(res, 500, { error: e.message });
  }
}

function handleWrite(req, res) {
  readBody(req, (body) => {
    try {
      const data = JSON.parse(body);
      const { path: relPath, content } = data;
      if (!relPath) { respond(res, 400, { error: 'Paramètre path manquant' }); return; }
      if (content === undefined) { respond(res, 400, { error: 'Paramètre content manquant' }); return; }

      const fullPath = safePath(relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`✅ Écrit: ${relPath}`);
      respond(res, 200, { success: true, path: relPath });
    } catch (e) {
      respond(res, 500, { error: e.message });
    }
  });
}

function handleDelete(req, res, params) {
  try {
    const relPath = params.get('path');
    if (!relPath) { respond(res, 400, { error: 'Paramètre path manquant' }); return; }
    const fullPath = safePath(relPath);
    if (!fs.existsSync(fullPath)) { respond(res, 404, { error: 'Fichier introuvable' }); return; }
    fs.unlinkSync(fullPath);
    console.log(`🗑️  Supprimé: ${relPath}`);
    respond(res, 200, { success: true });
  } catch (e) {
    respond(res, 500, { error: e.message });
  }
}

function handleSearch(req, res, params) {
  try {
    const pattern = params.get('q')?.toLowerCase();
    const searchContent = params.get('content') === 'true';
    if (!pattern) { respond(res, 400, { error: 'Paramètre q manquant' }); return; }
    if (!config.rootDirectory) { respond(res, 400, { error: 'Répertoire racine non configuré' }); return; }

    const results = [];
    walkDir(config.rootDirectory, (filePath) => {
      const rel = path.relative(config.rootDirectory, filePath).replace(/\\/g, '/');
      const name = path.basename(filePath).toLowerCase();

      if (name.includes(pattern)) {
        results.push({ type: 'name', path: rel, name: path.basename(filePath) });
        return;
      }
      if (searchContent) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.size < 500 * 1024) {
            const text = fs.readFileSync(filePath, 'utf8').toLowerCase();
            if (text.includes(pattern)) {
              results.push({ type: 'content', path: rel, name: path.basename(filePath) });
            }
          }
        } catch {}
      }
    });

    respond(res, 200, results);
  } catch (e) {
    respond(res, 500, { error: e.message });
  }
}

function walkDir(dir, callback) {
  try {
    for (const item of fs.readdirSync(dir)) {
      if (item.startsWith('.') || item === 'node_modules') continue;
      const full = path.join(dir, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walkDir(full, callback);
        else callback(full);
      } catch {}
    }
  } catch {}
}

// ─── Utilitaires HTTP ─────────────────────────────────────────────────────────

function respond(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req, callback) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => callback(body));
}

// ─── Serveur HTTP ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const params = new URLSearchParams(parsed.query);

  if (pathname === '/ping')           handlePing(res);
  else if (pathname === '/config')    handleConfig(req, res);
  else if (pathname === '/list')      handleList(req, res, params);
  else if (pathname === '/read')      handleRead(req, res, params);
  else if (pathname === '/write')     handleWrite(req, res);
  else if (pathname === '/delete')    handleDelete(req, res, params);
  else if (pathname === '/search')    handleSearch(req, res, params);
  else respond(res, 404, { error: 'Route inconnue: ' + pathname });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   Claude Local Files — Serveur       ║');
  console.log(`  ║   http://localhost:${PORT}             ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  if (config.rootDirectory) {
    console.log(`  📁 Répertoire: ${config.rootDirectory}`);
  } else {
    console.log('  ⚠️  Aucun répertoire configuré.');
    console.log('     Configure-le depuis le popup de l\'extension.');
    console.log(`     Ou: node server.js "C:\\Dev\\MonProjet"`);
  }
  console.log('');
  console.log('  Ctrl+C pour arrêter');
  console.log('');
});
