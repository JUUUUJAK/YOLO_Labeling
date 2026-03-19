const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 다른 PC에서 빈 화면이 나올 때 GPU 비활성화로 해결되는 경우가 많음
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
let mainWindow = null;
let workspaceRoot = null;

function getIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'logo.ico'),
    path.join(process.resourcesPath || __dirname, 'app.asar', 'public', 'logo.ico'),
    path.join(process.resourcesPath || __dirname, 'public', 'logo.ico'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createWindow() {
  const iconPath = getIconPath();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'INTELLIVIX YOLO',
  });

  const useDevServer = process.env.ELECTRON_DEV === '1';
  if (useDevServer) {
    mainWindow.loadURL('http://localhost:5175/');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerYoloProtocol() {
  protocol.registerBufferProtocol('yolo', (request, callback) => {
    if (!workspaceRoot) {
      callback({ error: -2 });
      return;
    }
    const u = request.url.replace('yolo://workspace/', '');
    const decoded = decodeURIComponent(u);
    const filePath = path.join(workspaceRoot, decoded);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(workspaceRoot))) {
      callback({ error: -10 });
      return;
    }
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
      callback({ mimeType: mime, data });
    } catch (e) {
      callback({ error: -2 });
    }
  });
}

app.on('ready', () => {
  registerYoloProtocol();
  createWindow();
});

app.on('window-all-closed', () => { app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

ipcMain.handle('openFolderDialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

ipcMain.handle('setWorkspaceRoot', (_, root) => {
  workspaceRoot = root || null;
  return true;
});

ipcMain.handle('scanFolder', (_, dirPath) => {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const items = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!IMAGE_EXT.includes(ext)) continue;
    const base = e.name.slice(0, -ext.length);
    const txtPath = path.join(dirPath, base + '.txt');
    items.push({
      name: e.name,
      imagePath: path.join(dirPath, e.name),
      txtPath: txtPath,
      imageUrl: 'yolo://workspace/' + encodeURIComponent(e.name),
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return items;
});

ipcMain.handle('readTxt', (_, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('writeTxt', (_, filePath, content) => {
  if (!filePath) return false;
  try {
    fs.writeFileSync(filePath, content || '', 'utf-8');
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
});

ipcMain.handle('openLabelFileDialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Label file', extensions: ['txt'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

ipcMain.handle('readLabelFile', (_, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('showItemInFolder', (_, filePath) => {
  if (!filePath || typeof filePath !== 'string') return;
  const normalized = path.normalize(String(filePath).trim());
  if (fs.existsSync(normalized)) {
    shell.showItemInFolder(normalized);
  } else {
    const dir = path.dirname(normalized);
    if (fs.existsSync(dir)) shell.openPath(dir);
  }
});
