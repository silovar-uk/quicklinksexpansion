// sidepanel.js
// --- グローバル変数 ---
let items = [];
let projects = ['未分類']; 
let projectColors = {}; 
let currentFilter = 'ALL';
let showArchived = false;
let floatingSearchEnabled = true;
let draggedItemId = null;
let editingItemId = null;
let editingProjectName = null;
let selectedColor = null;

// ソートモード: 'DATE' (日付), 'PROJECT' (分類), 'CLICKS' (回数)
let currentSortMode = 'DATE'; 
let searchQuery = '';
let sidePanelHeartbeatTimer = null;
let projectPickerQuery = '';

// --- 定数 ---
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HEAT_CLICKS = 15;
const SIDE_PANEL_HEARTBEAT_INTERVAL_MS = 1000;
const TOP_PROJECT_FILTER_LIMIT = 6;

// カラープリセット
const PRESET_COLORS = [
  { id: 'red', bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  { id: 'orange', bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' },
  { id: 'amber', bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  { id: 'green', bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  { id: 'teal', bg: '#ccfbf1', text: '#115e59', border: '#99f6e4' },
  { id: 'blue', bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  { id: 'indigo', bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
  { id: 'purple', bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
  { id: 'pink', bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  { id: 'gray', bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
];

// --- ユーティリティ: URLからの自動プロジェクト判定 ---
function getAutoProjectName(url) {
  const value = String(url || '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();

  // LINE WORKS IDだけ貼った場合
  if (!/^https?:\/\//i.test(value) && /^[a-zA-Z0-9-]+$/.test(value)) return "LINEWORKS";

  // 社内・業務系
  if (lower.includes('line.worksmobile.com/message/send')) return "LINEWORKS";
  if (lower.includes('board.worksmobile.com')) return "掲示板";
  if (lower.includes('mail.worksmobile.com/')) return "メールアーカイブ";
  if (lower.includes('drive.worksmobile.com') || lower.includes('jp1-link.drive.worksmobile.com')) return "LWドライブ";

  // Google / ストレージ系
  if (lower.includes('docs.google.com/spreadsheets')) return "スプレッドシート";
  if (lower.includes('docs.google.com/presentation')) return "Googleドキュメント";
  if (lower.includes('docs.google.com/document')) return "Googleドキュメント";
  if (lower.includes('docs.google.com/forms')) return "Googleドキュメント";
  if (lower.includes('drive.google.com')) return "ストレージ";
  if (lower.includes('dropbox.com')) return "ストレージ";

  // 浦和レッズ・公式系
  if (lower.includes('www.urawa-reds.co.jp') || lower.includes('rexclub.urawa-reds.co.jp') || lower.includes('jleague.jp')) return "クラブ発信";
  if (lower.includes('urawa-demo.sb-factory.com')) return "一時保存";

  // 制作・AI・自作ツール系は分類を増やしすぎないため「ツール」に寄せる
  if (lower.includes('github.com')) return "ツール";
  if (lower.includes('gemini.google.com') || lower.includes('claude.ai') || lower.includes('chatgpt.com') || lower.includes('copilot.microsoft.com')) return "ツール";
  if (lower.includes('canva.com') || lower.includes('backlog.com') || lower.includes('00m.in')) return "ツール";
  if (lower.includes('silovar-uk.github.io') || lower.includes('script.google.com/macros')) return "ツール";
  if (lower.includes('platinumaps.jp')) return "ツール";

  return null;
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderFilters();
  updateSortButton();
  
  const cb = document.getElementById('check-show-archived');
  if (cb) cb.checked = showArchived;
  const floatingCb = document.getElementById('check-floating-search-enabled');
  if (floatingCb) floatingCb.checked = floatingSearchEnabled;

  startSidePanelHeartbeat();
  syncSidePanelHeartbeatVisibility();
  document.addEventListener('visibilitychange', syncSidePanelHeartbeatVisibility);
  window.addEventListener('beforeunload', stopSidePanelHeartbeat);
  window.addEventListener('unload', stopSidePanelHeartbeat);
  window.addEventListener('pagehide', stopSidePanelHeartbeat);

  renderList();
  setupEventListeners();
  checkCleanupCandidates();
  setupPromptMemoFeature();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.items) {
        items = changes.items.newValue || [];
        checkCleanupCandidates();
        renderFilters();
      }
      if (changes.projects) {
        projects = changes.projects.newValue || [];
        renderFilters();
      }
      if (changes.projectColors) {
        projectColors = changes.projectColors.newValue || {};
        renderFilters();
        renderList();
      }
      if (changes.showArchived) {
        showArchived = changes.showArchived.newValue || false;
        const cb = document.getElementById('check-show-archived');
        if (cb) cb.checked = showArchived;
        renderFilters();
        renderList();
      }
      if (changes.floatingSearchEnabled) {
        floatingSearchEnabled = changes.floatingSearchEnabled.newValue !== false;
        const floatingCb = document.getElementById('check-floating-search-enabled');
        if (floatingCb) floatingCb.checked = floatingSearchEnabled;
      }
      renderList();
    }
  });
});

// --- データ読み込み ---
async function loadData() {
  const result = await chrome.storage.local.get(['items', 'projects', 'projectColors', 'currentSortMode', 'showArchived', 'floatingSearchEnabled']);
  if (result.items) items = result.items;
  if (result.projects && result.projects.length > 0) projects = result.projects;
  if (result.projectColors) projectColors = result.projectColors;
  if (result.currentSortMode) currentSortMode = result.currentSortMode;
  if (result.showArchived !== undefined) showArchived = result.showArchived;
  if (result.floatingSearchEnabled !== undefined) floatingSearchEnabled = result.floatingSearchEnabled;
}

// --- データ保存 ---
async function saveData() {
  await chrome.storage.local.set({ items, projects, projectColors, currentSortMode, showArchived, floatingSearchEnabled });
}

function getProjectColor(name) {
  if (!name || name === '未分類' || name === '') {
    return { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' };
  }
  if (projectColors[name]) {
    return projectColors[name];
  }
  
  // 既存ユーザー向け：クラブ発信のデフォルトカラー強制適用
  if (name === 'クラブ発信') {
    return { bg: '#fef2f2', text: '#991b1b', border: '#E03E3E' };
  }

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return {
    bg: `hsl(${h}, 85%, 94%)`,
    text: `hsl(${h}, 70%, 30%)`,
    border: `hsl(${h}, 60%, 85%)`
  };
}

function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (!hex) return `rgba(255,255,255,${alpha})`;
    if (hex.startsWith('hsl')) return hex; 

    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex[1] + hex[2], 16);
        g = parseInt(hex[3] + hex[4], 16);
        b = parseInt(hex[5] + hex[6], 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- フィルタボタン生成（件数表示対応） ---
function createFilterBtn(label, value) {
  const btn = document.createElement('button');
  const isActive = currentFilter === value;
  
  // 検索キーワードで事前に絞り込む
  let baseItems = items;
  if (searchQuery) {
    const q = normalizeString(searchQuery);
    baseItems = baseItems.filter(item => 
      normalizeString(item.title).includes(q) ||
      normalizeString(item.url).includes(q) ||
      normalizeString(item.projectName).includes(q) ||
      normalizeString(item.note).includes(q)
    );
  }

  // 件数の計算
  let activeCount = 0;
  let archivedCount = 0;
  if (value === 'ALL') {
    activeCount = baseItems.filter(item => !item.archived).length;
    archivedCount = baseItems.filter(item => item.archived).length;
  } else if (value === 'FAVORITES') {
    activeCount = baseItems.filter(item => item.favoriteType !== 'none' && !item.archived).length;
    archivedCount = baseItems.filter(item => item.favoriteType !== 'none' && item.archived).length;
  } else {
    activeCount = baseItems.filter(item => item.projectName === value && !item.archived).length;
    archivedCount = baseItems.filter(item => item.projectName === value && item.archived).length;
  }
  
  btn.className = `filter-btn ${isActive ? 'active' : ''}`;
  
  // アーカイブも表示されている場合は「(通常件数+アーカイブ件数)」と表示する
  const countText = showArchived && archivedCount > 0 ? `${activeCount}+${archivedCount}` : `${activeCount}`;
  btn.innerHTML = `<span class="filter-label">${escapeHtml(label)}</span><span class="filter-count">(${escapeHtml(countText)})</span>`;
  
  if (value === 'FAVORITES') {
    btn.classList.add('favorite');
  } else if (value !== 'ALL') {
    const colors = getProjectColor(value);
    btn.style.backgroundColor = colors.bg;
    btn.style.color = colors.text;
    btn.style.borderColor = colors.border;
    
    if (isActive) {
      btn.style.borderWidth = '2px';
      btn.style.borderColor = colors.text;
      btn.style.fontWeight = 'bold';
      btn.style.boxShadow = `0 1px 2px ${colors.border}`;
    }

    btn.ondblclick = (e) => {
      e.stopPropagation();
      openProjectEditModal(value);
    };
    btn.title = "ダブルクリックで編集";
  }
  
  btn.onclick = () => {
    currentFilter = value;
    renderFilters();
    renderList();
  };
  return btn;
}

// --- プロジェクト編集モーダル関連 ---
function openProjectEditModal(projectName) {
  editingProjectName = projectName;
  document.getElementById('edit-project-name').value = projectName;
  const currentColor = getProjectColor(projectName);
  selectedColor = currentColor;

  const paletteContainer = document.getElementById('project-color-palette');
  paletteContainer.innerHTML = '';
  
  PRESET_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color.bg;
    swatch.style.borderColor = color.border;
    if (color.bg === currentColor.bg) {
      swatch.classList.add('selected');
    }
    swatch.onclick = () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      selectedColor = color;
    };
    paletteContainer.appendChild(swatch);
  });
  document.getElementById('project-edit-modal').classList.add('open');
}

function closeProjectEditModal() {
  document.getElementById('project-edit-modal').classList.remove('open');
  editingProjectName = null;
  selectedColor = null;
}

async function saveProjectEdit() {
  if (!editingProjectName) return;

  const newName = document.getElementById('edit-project-name').value.trim();
  if (!newName) {
    alert('プロジェクト名は空にできません');
    return;
  }

  if (newName !== editingProjectName) {
    items.forEach(item => {
      if (item.projectName === editingProjectName) {
        item.projectName = newName;
      }
    });
    projects = projects.filter(p => p !== editingProjectName);
    if (!projects.includes(newName)) {
      projects.push(newName);
    }
    delete projectColors[editingProjectName];
    if (currentFilter === editingProjectName) {
      currentFilter = newName;
    }
  }

  if (selectedColor) {
    projectColors[newName] = {
      bg: selectedColor.bg,
      text: selectedColor.text,
      border: selectedColor.border
    };
  }

  await saveData();
  renderFilters(); 
  renderList();
  closeProjectEditModal();
}

// --- 分類（プロジェクト）の削除 ---
async function deleteProject(projectName) {
  if (projectName === '未分類') {
    alert('「未分類」は削除できません。');
    return;
  }
  if (!confirm(`分類「${projectName}」を削除しますか？\n※中のリンクは「未分類」に移動し、リンク自体は消えません。`)) {
    return;
  }

  // リンクを「未分類」に移動
  items.forEach(item => {
    if (item.projectName === projectName) {
      item.projectName = '未分類';
    }
  });

  // プロジェクト一覧から削除
  projects = projects.filter(p => p !== projectName);
  delete projectColors[projectName];

  if (currentFilter === projectName) {
    currentFilter = 'ALL';
  }

  // 「未分類」が存在しなければ追加
  if (!projects.includes('未分類')) projects.push('未分類');

  await saveData();
  renderFilters();
  renderList();
  closeProjectEditModal();
  if (document.getElementById('project-manage-modal').classList.contains('open')) {
    openManageModal(); // 管理画面を開いたままなら再描画
  }
}

// --- 分類（プロジェクト）管理・整理機能 ---
let draggedManageItemIndex = null;

function openManageModal() {
  const container = document.getElementById('manage-project-list');
  const select = document.getElementById('merge-target-select');
  container.innerHTML = '';
  select.innerHTML = '';

  projects.forEach((p, index) => {
    // リストアイテム生成
    const el = document.createElement('div');
    el.className = 'manage-project-item';
    el.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px; background:white; border:1px solid #e5e7eb; border-radius:4px; cursor:grab;';
    el.draggable = true;
    el.dataset.index = index;

    const colors = getProjectColor(p);
    
    // チェックボックス
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = p;
    cb.className = 'merge-checkbox';
    
    const handle = document.createElement('span');
    handle.textContent = '≡';
    handle.style.cssText = 'color:#9ca3af; cursor:grab; font-weight:bold; padding:0 4px;';

    const nameBadge = document.createElement('span');
    nameBadge.textContent = p;
    nameBadge.style.cssText = `background-color:${colors.bg}; color:${colors.text}; border:1px solid ${colors.border}; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;`;

    el.appendChild(handle);
    el.appendChild(cb);
    el.appendChild(nameBadge);

    // ドラッグ＆ドロップイベント
    el.addEventListener('dragstart', (e) => {
      draggedManageItemIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.5';
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.style.borderTop = '2px solid #2563eb';
    });
    el.addEventListener('dragleave', () => {
      el.style.borderTop = '1px solid #e5e7eb';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
      document.querySelectorAll('.manage-project-item').forEach(item => {
        item.style.borderTop = '1px solid #e5e7eb';
      });
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.style.borderTop = '1px solid #e5e7eb';
      const targetIndex = index;
      if (draggedManageItemIndex !== null && draggedManageItemIndex !== targetIndex) {
        // 配列の並び替え
        const [movedItem] = projects.splice(draggedManageItemIndex, 1);
        projects.splice(targetIndex, 0, movedItem);
        await saveData();
        renderFilters();
        openManageModal(); // 再描画
      }
    });

    container.appendChild(el);

    // 統合先セレクトボックスの選択肢
    const option = document.createElement('option');
    option.value = p;
    option.textContent = p;
    select.appendChild(option);
  });

  document.getElementById('project-manage-modal').classList.add('open');
}

async function handleMerge() {
  const checkboxes = document.querySelectorAll('.merge-checkbox:checked');
  const sourceProjects = Array.from(checkboxes).map(cb => cb.value);
  const targetProject = document.getElementById('merge-target-select').value;

  if (sourceProjects.length === 0) {
    alert('統合元の分類（チェックボックス）を選択してください。');
    return;
  }
  if (sourceProjects.includes(targetProject)) {
    alert('統合元と統合先が同じです。チェックを外してください。');
    return;
  }

  if (confirm(`${sourceProjects.length}件の分類を「${targetProject}」に統合しますか？\n（元の分類名は削除されます）`)) {
    // リンクの書き換え
    items.forEach(item => {
      if (sourceProjects.includes(item.projectName)) {
        item.projectName = targetProject;
      }
    });

    // プロジェクトリストから削除
    projects = projects.filter(p => !sourceProjects.includes(p));
    sourceProjects.forEach(p => delete projectColors[p]);

    if (sourceProjects.includes(currentFilter)) {
      currentFilter = targetProject;
    }

    await saveData();
    renderFilters();
    renderList();
    openManageModal(); // 再描画
  }
}

// --- クリーンアップ提案 ---
function checkCleanupCandidates() {
  const now = Date.now();
  const candidates = items.filter(item => {
    if (item.archived) return false;
    const lastActiveTime = item.lastClickedAt ? new Date(item.lastClickedAt).getTime() : new Date(item.addedAt).getTime();
    return (now - lastActiveTime) > TWO_WEEKS_MS;
  });

  const bar = document.getElementById('cleanup-bar');
  const msg = document.getElementById('cleanup-message');
  const btn = document.getElementById('btn-cleanup-action');
  
  if (candidates.length > 0) {
    bar.classList.add('visible');
    msg.textContent = `${candidates.length}件のリンクをアーカイブします`;
    btn.textContent = '確認してアーカイブ';
    btn.onclick = () => showCleanupDialog(candidates);
  } else {
    bar.classList.remove('visible');
  }
}

async function showCleanupDialog(candidates) {
  const message = "以下のリンクは直近2週間アクセスがありません。\n表から隠してアーカイブに移動しますか？\n\n" + 
                  candidates.map(i => `・${i.title}`).join('\n');
  
  if (confirm(message)) {
    const candidateIds = new Set(candidates.map(c => c.id));
    items = items.map(item => {
      if (candidateIds.has(item.id)) {
        return { ...item, archived: true };
      }
      return item;
    });
    await saveData();
    document.getElementById('cleanup-bar').classList.remove('visible');
    renderFilters();
    renderList(); 
  }
}

// --- リンクのクリック記録 ---
async function recordClick(id) {
  const index = items.findIndex(i => i.id === id);
  if (index > -1) {
    items[index].lastClickedAt = new Date().toISOString();
    items[index].clickCount = (items[index].clickCount || 0) + 1;
    if (items[index].archived) {
      items[index].archived = false; // アーカイブされたリンクをクリックしたらアーカイブから戻す
    }
    await saveData();
    renderFilters();
    renderList();
  }
}

// お気に入りのトグル（なし -> 通常 -> 3日間限定 -> なし）
async function toggleFavorite(id) {
  const index = items.findIndex(i => i.id === id);
  if (index > -1) {
    const item = items[index];
    
    // データ互換性対応
    if (!item.favoriteType) {
      item.favoriteType = item.isFavorite ? 'normal' : 'none';
    }

    if (item.favoriteType === 'none') {
      item.favoriteType = 'normal';
      item.isFavorite = true;
      item.favoriteExpiry = null;
    } else if (item.favoriteType === 'normal') {
      item.favoriteType = 'temp';
      item.isFavorite = true;
      const d = new Date();
      d.setDate(d.getDate() + 3);
      item.favoriteExpiry = d.toISOString();
    } else if (item.favoriteType === 'temp') {
      item.favoriteType = 'none';
      item.isFavorite = false;
      item.favoriteExpiry = null;
    }

    await saveData();
    renderFilters();
    renderList();
  }
}

// --- リスト描画 ---
function renderList() {
  const container = document.getElementById('link-list');
  container.innerHTML = '';

  const nowTime = Date.now();
  let needsSave = false;

  // 描画前に3日間限定のお気に入り期限切れをチェックして解除
  items.forEach(item => {
    // 互換性対応
    if (!item.favoriteType) {
      item.favoriteType = item.isFavorite ? 'normal' : 'none';
    }
    
    if (item.favoriteType === 'temp' && item.favoriteExpiry) {
      if (nowTime > new Date(item.favoriteExpiry).getTime()) {
        item.favoriteType = 'none';
        item.isFavorite = false;
        item.favoriteExpiry = null;
        needsSave = true;
      }
    }
  });

  if (needsSave) {
    saveData(); // 保存
  }

  let displayItems = items;
  
  // 1. アーカイブ設定で絞り込み
  if (!showArchived) {
    displayItems = displayItems.filter(item => !item.archived);
  }

  // 2. 選択中のタブ（分類やお気に入り）で絞り込み
  if (currentFilter === 'FAVORITES') {
    displayItems = displayItems.filter(item => item.favoriteType !== 'none');
  } else if (currentFilter !== 'ALL') {
    displayItems = displayItems.filter(item => item.projectName === currentFilter);
  }

  // 3. 検索キーワードで絞り込み
  if (searchQuery) {
    const q = normalizeString(searchQuery);
    displayItems = displayItems.filter(item => 
      normalizeString(item.title).includes(q) ||
      normalizeString(item.url).includes(q) ||
      normalizeString(item.projectName).includes(q) ||
      normalizeString(item.note).includes(q)
    );
  }

  // ソート処理
  displayItems.sort((a, b) => {
    // ユーザーが選択した現在のソートモード（新着順・分類順・回数順）のみに従う
    if (currentSortMode === 'PROJECT') {
      if (a.projectName < b.projectName) return -1;
      if (a.projectName > b.projectName) return 1;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else if (currentSortMode === 'CLICKS') {
      const countA = a.clickCount || 0;
      const countB = b.clickCount || 0;
      if (countA !== countB) return countB - countA;
      return new Date(b.addedAt) - new Date(a.addedAt);
    } else {
      return new Date(b.addedAt) - new Date(a.addedAt);
    }
  });

  if (displayItems.length === 0) {
    let msg = 'リンクがありません';
    if (searchQuery) msg = '一致するリンクが見つかりません';
    else if (currentFilter === 'FAVORITES') msg = 'お気に入りのリンクはありません';
    
    container.innerHTML = `<div style="text-align:center; color:#9ca3af; margin-top:20px;">${msg}</div>`;
    return;
  }

  displayItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'link-item';
    
    const isItemArchived = item.archived;
    const isSearching = !!searchQuery;

    // お気に入りクラスの付与
    if (!isItemArchived) {
      if (item.favoriteType === 'normal') {
        el.classList.add('favorite-item');
      } else if (item.favoriteType === 'temp') {
        el.classList.add('favorite-temp-item');
      }
    }
    
    if (isItemArchived) {
      el.classList.add('archived');
    }

    el.draggable = (!isItemArchived && currentSortMode === 'DATE' && !isSearching && currentFilter === 'ALL');
    el.dataset.id = item.id;

    const count = item.clickCount || 0;
    const colors = getProjectColor(item.projectName);

    // お気に入りでない場合のみ、クリック数によるスタイル変動（ヒートマップ/左ボーダー）を適用
    if (item.favoriteType === 'none' && !isItemArchived) {
      if (count > 0) {
          el.style.borderLeftColor = colors.border;
          el.style.borderLeftWidth = count >= 10 ? '6px' : '4px';
      } else {
          el.style.borderLeftColor = 'transparent';
      }

      if (count > 0) {
          const heatRatio = Math.min(count / MAX_HEAT_CLICKS, 1.0);
          const opacity = 0.02 + (heatRatio * 0.18);
          el.style.backgroundColor = hexToRgba(colors.border, opacity);
      }
    }

    const dateStr = new Date(item.addedAt).toLocaleDateString();
    const noteElement = item.note ? `<div class="item-note">${escapeHtml(item.note)}</div>` : '';
    const clickCountBadge = currentSortMode === 'CLICKS' ? `<span style="font-size:10px; color:#94a3b8; margin-left:4px; font-weight:500; opacity:.72;">(${count}回)</span>` : '';
    const archivedBadge = isItemArchived ? '<span style="font-size:10px; background:#9ca3af; color:white; padding:1px 4px; border-radius:2px; margin-left:4px;">📦Archive</span>' : '';

    let actionButtons = '';
    
    // お気に入りアイコンとクラスの切り替え
    let favClass = 'action-btn favorite';
    let favIcon = '☆';
    if (item.favoriteType === 'normal') {
      favClass += ' active';
      favIcon = '★';
    } else if (item.favoriteType === 'temp') {
      favClass += ' active'; 
      favIcon = '⏳'; 
    }

    if (isItemArchived) {
      actionButtons = `
        <button class="action-btn restore" title="リストに戻す">↩️</button>
        <button class="action-btn delete" title="完全に削除">🗑️</button>
      `;
    } else {
      actionButtons = `
        <button class="${favClass}" title="お気に入り">${favIcon}</button>
        <button class="action-btn edit" title="編集・メモ">✎</button>
        <button class="action-btn archive" title="アーカイブへ移動">📦</button>
        <button class="action-btn delete" title="完了（削除）">🗑️</button>
      `;
    }

    el.innerHTML = `
      <div class="drag-handle" style="opacity: ${el.draggable ? 1 : 0.2};">
        <span>⋮⋮</span>
      </div>
      <div class="item-content">
        <div class="item-meta">
          <span class="badge" style="background-color: ${colors.bg}; color: ${colors.text}; border-color: ${colors.border};">
            ${escapeHtml(item.projectName)}
          </span>
          <span class="date">${dateStr}</span>
          ${clickCountBadge}
          ${archivedBadge}
        </div>
        <a href="${escapeHtml(item.url)}" target="_blank" class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a>
        <div class="item-url">${escapeHtml(item.url)}</div>
        ${noteElement}
      </div>
      <div class="item-actions">
        ${actionButtons}
      </div>
    `;

    if (isItemArchived) {
      el.querySelector('.restore').addEventListener('click', () => handleRestore(item.id));
      el.querySelector('.delete').addEventListener('click', () => handleDelete(item.id, true));
    } else {
      el.querySelector('.favorite').addEventListener('click', () => toggleFavorite(item.id));
      el.querySelector('.archive').addEventListener('click', () => handleArchive(item.id));
      el.querySelector('.edit').addEventListener('click', () => openEditModal(item));
      el.querySelector('.delete').addEventListener('click', () => handleDelete(item.id));
    }
    el.querySelector('.item-title').addEventListener('click', () => recordClick(item.id));

    if (el.draggable) {
      el.addEventListener('dragstart', handleDragStart);
      el.addEventListener('dragover', handleDragOver);
      el.addEventListener('dragleave', handleDragLeave);
      el.addEventListener('dragend', handleDragEnd);
      el.addEventListener('drop', handleDrop);
    }
    container.appendChild(el);
  });
}

function getProjectStats(projectName) {
  const related = (items || []).filter(item => (item.projectName || '未分類') === projectName);
  const activeCount = related.filter(item => !item.archived).length;
  const archivedCount = related.filter(item => item.archived).length;
  const totalClicks = related.reduce((sum, item) => sum + Number(item.clickCount || 0), 0);
  const lastActive = related.reduce((max, item) => {
    const raw = item.lastClickedAt || item.addedAt || '';
    const time = raw ? new Date(raw).getTime() : 0;
    return Math.max(max, Number.isFinite(time) ? time : 0);
  }, 0);
  return { projectName, activeCount, archivedCount, totalCount: related.length, totalClicks, lastActive };
}

function getSortedProjectsByUsage() {
  return [...new Set((projects || ['未分類']).map(p => String(p || '未分類').trim() || '未分類'))]
    .map(projectName => getProjectStats(projectName))
    .sort((a, b) => {
      if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
      if (b.totalClicks !== a.totalClicks) return b.totalClicks - a.totalClicks;
      if (b.archivedCount !== a.archivedCount) return b.archivedCount - a.archivedCount;
      return b.lastActive - a.lastActive;
    });
}

function getVisibleProjectFilters() {
  const sorted = getSortedProjectsByUsage().map(s => s.projectName);
  const visible = sorted.slice(0, TOP_PROJECT_FILTER_LIMIT);
  if (!['ALL', 'FAVORITES'].includes(currentFilter) && currentFilter && !visible.includes(currentFilter) && sorted.includes(currentFilter)) {
    if (visible.length >= TOP_PROJECT_FILTER_LIMIT) visible[visible.length - 1] = currentFilter;
    else visible.push(currentFilter);
  }
  return visible;
}

function renderFilters() {
  const container = document.getElementById('filter-container');
  container.innerHTML = '';

  const allBtn = createFilterBtn('すべて', 'ALL');
  container.appendChild(allBtn);

  const favBtn = createFilterBtn('★ お気に入り', 'FAVORITES');
  container.appendChild(favBtn);

  const visibleProjects = getVisibleProjectFilters();
  visibleProjects.forEach(p => {
    container.appendChild(createFilterBtn(p, p));
  });

  if ((projects || []).length > TOP_PROJECT_FILTER_LIMIT) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'filter-btn filter-more-btn';
    moreBtn.innerHTML = `<span class="filter-label">More</span><span class="filter-count">(${escapeHtml(String(projects.length))})</span>`;
    moreBtn.title = 'すべての分類から選ぶ';
    moreBtn.onclick = openProjectPickerModal;
    container.appendChild(moreBtn);
  }
  
  const updateDatalist = (id) => {
    const list = document.getElementById(id);
    if (!list) return;
    list.innerHTML = '';
    projects.forEach(p => {
      const option = document.createElement('option');
      option.value = p;
      list.appendChild(option);
    });
  };
  updateDatalist('project-list');
  updateDatalist('project-list-edit');
  updateDatalist('project-picker-category-list');
}


function openProjectPickerModal() {
  projectPickerQuery = '';
  const modal = document.getElementById('project-picker-modal');
  if (!modal) return;
  modal.classList.add('open');
  const input = document.getElementById('project-picker-search');
  if (input) input.value = '';
  const sourceInput = document.getElementById('project-picker-source');
  const targetInput = document.getElementById('project-picker-target');
  if (sourceInput) sourceInput.value = '';
  if (targetInput) targetInput.value = '';
  renderProjectPickerList();
  setTimeout(() => input?.focus(), 0);
}

function closeProjectPickerModal() {
  const modal = document.getElementById('project-picker-modal');
  if (modal) modal.classList.remove('open');
}

function renderProjectPickerList() {
  const list = document.getElementById('project-picker-list');
  if (!list) return;
  const q = normalizeString(projectPickerQuery || '');
  let stats = getSortedProjectsByUsage();
  if (q) {
    stats = stats.filter(stat => normalizeString(stat.projectName).includes(q));
  }

  if (!stats.length) {
    list.innerHTML = '<div class="project-picker-empty">一致する分類がありません</div>';
    return;
  }

  list.innerHTML = stats.map(stat => {
    const colors = getProjectColor(stat.projectName);
    const isActive = currentFilter === stat.projectName;
    const archivedText = stat.archivedCount > 0 ? ` / アーカイブ${stat.archivedCount}` : '';
    const safeName = escapeHtml(stat.projectName);
    const disabledAttr = stat.projectName === '未分類' ? 'disabled' : '';
    return `
      <div class="project-picker-item ${isActive ? 'active' : ''}">
        <button class="project-picker-main" data-project-picker-select="${safeName}" title="この分類で絞り込む">
          <span class="project-picker-badge" style="background:${colors.bg};color:${colors.text};border-color:${colors.border};">${safeName}</span>
          <span class="project-picker-count">通常${stat.activeCount}${archivedText}</span>
        </button>
        <span class="project-picker-sub">${Number(stat.totalClicks || 0)} clicks</span>
        <span class="project-picker-actions">
          <button class="project-picker-action-btn" data-project-picker-merge-src="${safeName}" ${disabledAttr}>統合</button>
          <button class="project-picker-action-btn danger" data-project-picker-delete="${safeName}" ${disabledAttr}>削除</button>
        </span>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-project-picker-select]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.getAttribute('data-project-picker-select') || 'ALL';
      renderFilters();
      renderList();
      closeProjectPickerModal();
    });
  });
  list.querySelectorAll('[data-project-picker-merge-src]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const source = btn.getAttribute('data-project-picker-merge-src') || '';
      const srcInput = document.getElementById('project-picker-source');
      const targetInput = document.getElementById('project-picker-target');
      if (srcInput) srcInput.value = source;
      if (targetInput) targetInput.focus();
    });
  });
  list.querySelectorAll('[data-project-picker-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteProjectFromPicker(btn.getAttribute('data-project-picker-delete') || '');
    });
  });
}


async function deleteProjectFromPicker(projectName) {
  const name = String(projectName || '').trim();
  if (!name) return;
  if (name === '未分類') {
    alert('「未分類」は削除できません。');
    return;
  }
  const related = (items || []).filter(item => (item.projectName || '未分類') === name);
  if (!confirm(`分類「${name}」を削除しますか？
中のリンク ${related.length}件は「未分類」に移動します。`)) return;

  items.forEach(item => {
    if ((item.projectName || '未分類') === name) item.projectName = '未分類';
  });
  projects = projects.filter(p => p !== name);
  delete projectColors[name];
  if (!projects.includes('未分類')) projects.push('未分類');
  if (currentFilter === name) currentFilter = 'ALL';

  await saveData();
  renderFilters();
  renderList();
  renderProjectPickerList();
}

async function mergeProjectsFromPicker() {
  const source = document.getElementById('project-picker-source')?.value.trim() || '';
  const target = document.getElementById('project-picker-target')?.value.trim() || '';
  if (!source) {
    alert('統合元の分類を入力してください。');
    return;
  }
  if (!target) {
    alert('統合先の分類を入力してください。');
    return;
  }
  if (source === '未分類') {
    alert('「未分類」は統合元にできません。');
    return;
  }
  if (source === target) {
    alert('統合元と統合先が同じです。');
    return;
  }
  if (!projects.includes(source)) {
    alert(`分類「${source}」が見つかりません。`);
    return;
  }
  const sourceCount = (items || []).filter(item => (item.projectName || '未分類') === source).length;
  if (!confirm(`分類「${source}」を「${target}」へ統合しますか？
対象リンク：${sourceCount}件
※統合元の分類名は削除されます。`)) return;

  items.forEach(item => {
    if ((item.projectName || '未分類') === source) item.projectName = target;
  });
  projects = projects.filter(p => p !== source);
  if (!projects.includes(target)) projects.push(target);
  if (projectColors[source] && !projectColors[target]) projectColors[target] = projectColors[source];
  delete projectColors[source];
  if (currentFilter === source) currentFilter = target;

  await saveData();
  const srcInput = document.getElementById('project-picker-source');
  const targetInput = document.getElementById('project-picker-target');
  if (srcInput) srcInput.value = '';
  if (targetInput) targetInput.value = '';
  renderFilters();
  renderList();
  renderProjectPickerList();
}

async function deleteProjectFromPickerInput() {
  const source = document.getElementById('project-picker-source')?.value.trim() || '';
  await deleteProjectFromPicker(source);
  const srcInput = document.getElementById('project-picker-source');
  if (srcInput) srcInput.value = '';
}

// アイテム追加
async function addItem(title, url, projectName, note = '', favType = 'none') {
  if (!title || !url) return;
  const project = projectName || '未分類';

  let expiry = null;
  if (favType === 'temp') {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    expiry = d.toISOString();
  }

  const newItem = {
    id: Math.random().toString(36).substr(2, 9),
    title,
    url,
    projectName: project,
    note: note, 
    addedAt: new Date().toISOString(),
    lastClickedAt: null,
    clickCount: 0,
    archived: false,
    isFavorite: (favType !== 'none'),
    favoriteType: favType,
    favoriteExpiry: expiry
  };

  items.unshift(newItem); 

  if (!projects.includes(project)) {
    projects.push(project);
  }

  await saveData();
  renderFilters();
  renderList();
  
  document.getElementById('input-title').value = '';
  document.getElementById('input-url').value = '';
  document.getElementById('input-project').value = '';
  document.getElementById('input-note').value = ''; 
  document.querySelector('input[name="fav-type"][value="none"]').checked = true;
  document.getElementById('manual-form').classList.remove('open');
}

async function handleAddCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    document.getElementById('manual-form').classList.add('open');
    document.getElementById('input-title').value = tab.title;
    document.getElementById('input-url').value = tab.url;
    
    // URLから自動アシスト
    const autoProject = getAutoProjectName(tab.url);
    document.getElementById('input-project').value = autoProject ? autoProject : ''; 
    
    document.getElementById('input-note').value = ''; 
    document.querySelector('input[name="fav-type"][value="none"]').checked = true;
    document.getElementById('input-project').focus();
  }
}

async function handleArchive(id) {
  const index = items.findIndex(i => i.id === id);
  if (index > -1) {
    items[index].archived = true;
    await saveData();
    renderFilters();
    renderList();
  }
}

async function handleRestore(id) {
  const index = items.findIndex(i => i.id === id);
  if (index > -1) {
    items[index].archived = false;
    items[index].lastClickedAt = new Date().toISOString(); 
    await saveData();
    renderFilters();
    renderList();
  }
}

async function handleDelete(id, force = false) {
  const msg = force ? 'このリンクを完全に削除しますか？\n（復元できません）' : 'このリンクを削除（完了）しますか？';
  if (confirm(msg)) {
    items = items.filter(i => i.id !== id);
    await saveData();
    renderFilters();
    renderList();
  }
}

function openEditModal(item) {
  editingItemId = item.id;
  document.getElementById('edit-title').value = item.title;
  document.getElementById('edit-url').value = item.url;
  document.getElementById('edit-project').value = categoryInputValueSidepanel(item.projectName);
  document.getElementById('edit-note').value = item.note || ''; 
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editingItemId = null;
}

async function saveEdit() {
  if (!editingItemId) return;
  
  const newTitle = document.getElementById('edit-title').value;
  const newUrl = document.getElementById('edit-url').value;
  const newProject = document.getElementById('edit-project').value || '未分類';
  const newNote = document.getElementById('edit-note').value; 
  
  const index = items.findIndex(i => i.id === editingItemId);
  if (index > -1) {
    items[index].title = newTitle;
    items[index].url = newUrl;
    items[index].projectName = newProject;
    items[index].note = newNote; 
    
    if (!projects.includes(newProject)) {
      projects.push(newProject);
    }
    
    await saveData();
    renderFilters();
    renderList();
    closeEditModal();
  }
}

// JSONデータのエクスポート
function exportData() {
  const backup = {
    schemaVersion: 'quick-links-backup-v2',
    exportedAt: new Date().toISOString(),
    quickLinks: {
      items: Array.isArray(items) ? items : [],
      projects: Array.isArray(projects) ? projects : ['未分類'],
      projectColors: projectColors || {},
      currentSortMode,
      showArchived,
      floatingSearchEnabled
    },
    promptMemos: {
      items: Array.isArray(promptMemos) ? promptMemos : [],
      categories: normalizePromptCategoriesSidepanel(promptCategories)
    }
  };

  const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  const date = new Date().toISOString().slice(0, 10);
  downloadAnchorNode.setAttribute("download", `quick_links_prompt_memos_backup_${date}.json`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function normalizeImportedQuickLinkItems(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData?.quickLinks?.items)) return rawData.quickLinks.items;
  if (Array.isArray(rawData?.items)) return rawData.items;
  return [];
}

function normalizeImportedPromptMemoItems(rawData) {
  if (Array.isArray(rawData?.promptMemos?.items)) return rawData.promptMemos.items;
  if (Array.isArray(rawData?.promptMemos)) return rawData.promptMemos;
  return [];
}

function normalizeImportedPromptCategories(rawData) {
  if (Array.isArray(rawData?.promptMemos?.categories)) return rawData.promptMemos.categories;
  if (Array.isArray(rawData?.promptCategories)) return rawData.promptCategories;
  return [];
}

// JSONデータのインポート処理
async function handleImportData() {
  const jsonText = document.getElementById('import-json-text').value.trim();
  if (!jsonText) return;

  try {
    const rawData = JSON.parse(jsonText);
    const importedLinks = normalizeImportedQuickLinkItems(rawData);
    const importedPrompts = normalizeImportedPromptMemoItems(rawData);
    const importedPromptCategories = normalizeImportedPromptCategories(rawData);

    if (!Array.isArray(rawData) && importedLinks.length === 0 && importedPrompts.length === 0 && importedPromptCategories.length === 0) {
      alert('エラー：取り込めるQuick Linksまたはプロンプトメモが見つかりません。');
      return;
    }

    let addCount = 0;
    let promptAddCount = 0;
    const now = new Date().toISOString();

    importedLinks.forEach(d => {
      if (!d.title || !d.url) return;
      const project = d.projectName || '未分類';
      const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        title: d.title,
        url: d.url,
        projectName: project,
        note: d.note || '',
        addedAt: d.addedAt || now,
        lastClickedAt: d.lastClickedAt || null,
        clickCount: Number(d.clickCount || 0),
        archived: !!d.archived,
        isFavorite: !!d.isFavorite,
        favoriteType: d.favoriteType || (d.isFavorite ? 'normal' : 'none'),
        favoriteExpiry: d.favoriteExpiry || null
      };
      items.push(newItem);
      addCount++;
      if (!projects.includes(project)) projects.push(project);
    });

    importedPrompts.forEach(d => {
      const title = String(d.title || '').trim();
      const body = String(d.body || '');
      if (!title && !body.trim()) return;
      const categoryName = String(d.categoryName || d.projectName || '未分類').trim() || '未分類';
      promptMemos.push({
        id: 'prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        title: title || '無題のプロンプト',
        categoryName,
        body,
        createdAt: d.createdAt || now,
        updatedAt: d.updatedAt || now,
        copyCount: Number(d.copyCount || 0),
        lastCopiedAt: d.lastCopiedAt || null
      });
      promptAddCount++;
      promptCategories = addPromptCategorySidepanel(categoryName);
    });

    if (importedPromptCategories.length > 0) {
      promptCategories = normalizePromptCategoriesSidepanel([...promptCategories, ...importedPromptCategories]);
    }

    await saveData();
    await chrome.storage.local.set({ promptMemos, promptCategories });
    renderFilters();
    renderList();
    renderPromptMemos();
    alert(`Quick Links ${addCount}件 / プロンプトメモ ${promptAddCount}件をインポートしました。`);
    document.getElementById('import-modal').classList.remove('open');
    document.getElementById('import-json-text').value = '';
  } catch (e) {
    alert('JSONパースエラー：正しいJSON形式か確認してください。\n' + e.message);
  }
}

// ドラッグ&ドロップ関連
function handleDragStart(e) {
  draggedItemId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target.dataset.id === draggedItemId) return;
  const rect = target.getBoundingClientRect();
  const offset = e.clientY - rect.top;
  if (offset < rect.height / 2) {
    target.classList.add('drop-target-top');
    target.classList.remove('drop-target-bottom');
  } else {
    target.classList.add('drop-target-bottom');
    target.classList.remove('drop-target-top');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drop-target-top', 'drop-target-bottom');
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.drop-target-top, .drop-target-bottom').forEach(el => {
    el.classList.remove('drop-target-top', 'drop-target-bottom');
  });
  draggedItemId = null;
}

async function handleDrop(e) {
  e.stopPropagation();
  const target = e.currentTarget;
  const isTop = target.classList.contains('drop-target-top');
  target.classList.remove('drop-target-top', 'drop-target-bottom');
  const targetId = target.dataset.id;
  if (draggedItemId && draggedItemId !== targetId) {
    const fromIndex = items.findIndex(i => i.id === draggedItemId);
    if (fromIndex > -1) {
      const [item] = items.splice(fromIndex, 1);
      let toIndex = items.findIndex(i => i.id === targetId);
      const insertIndex = isTop ? toIndex : toIndex + 1;
      items.splice(insertIndex, 0, item);
      await saveData();
      renderList();
    }
  }
  return false;
}

function updateSortButton() {
  const icon = document.getElementById('sort-icon');
  const label = document.getElementById('sort-label');
  switch(currentSortMode) {
    case 'PROJECT':
      icon.textContent = '📂';
      label.textContent = '分類順';
      break;
    case 'CLICKS':
      icon.textContent = '🔥';
      label.textContent = '回数順';
      break;
    case 'DATE':
    default:
      icon.textContent = '🕒';
      label.textContent = '新着順';
      break;
  }
}

function setupEventListeners() {
  const btnFilterToggle = document.getElementById('btn-filter-toggle');
  if (btnFilterToggle) {
    btnFilterToggle.addEventListener('click', openProjectPickerModal);
  }

  const projectPickerSearch = document.getElementById('project-picker-search');
  if (projectPickerSearch) {
    projectPickerSearch.addEventListener('input', (e) => {
      projectPickerQuery = e.target.value || '';
      renderProjectPickerList();
    });
    projectPickerSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeProjectPickerModal();
    });
  }
  document.getElementById('btn-close-project-picker')?.addEventListener('click', closeProjectPickerModal);
  document.getElementById('btn-cancel-project-picker')?.addEventListener('click', closeProjectPickerModal);
  document.getElementById('btn-project-picker-merge')?.addEventListener('click', mergeProjectsFromPicker);
  document.getElementById('btn-project-picker-delete')?.addEventListener('click', deleteProjectFromPickerInput);
  document.getElementById('project-picker-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'project-picker-modal') closeProjectPickerModal();
  });

  document.getElementById('btn-add-current').addEventListener('click', handleAddCurrentPage);
  document.getElementById('btn-toggle-manual').addEventListener('click', () => {
    document.getElementById('manual-form').classList.toggle('open');
  });

  // URL入力時の自動振り分けアシスト機能
  document.getElementById('input-url').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const autoProject = getAutoProjectName(url);
    if (autoProject) {
      const projectInput = document.getElementById('input-project');
      if (!projectInput.value || projectInput.value === '未分類') {
        projectInput.value = autoProject;
      }
    }
  });

  document.getElementById('btn-submit-manual').addEventListener('click', () => {
    const title = document.getElementById('input-title').value;
    let url = document.getElementById('input-url').value.trim();
    const project = document.getElementById('input-project').value;
    const note = document.getElementById('input-note').value; 

    const favTypeRadios = document.getElementsByName('fav-type');
    let favType = 'none';
    for (const radio of favTypeRadios) {
      if (radio.checked) {
        favType = radio.value;
        break;
      }
    }

    if (url && !/^https?:\/\//i.test(url)) {
        if (/^[a-zA-Z0-9-]+$/.test(url)) {
            url = `https://line.worksmobile.com/message/send?version=26&channelId=${url}`;
        }
    }
    
    // --- 重複チェック ---
    const isDuplicate = items.some(item => item.url === url);
    if (isDuplicate) {
        if (!confirm('このURLは既に登録されています。\n重複して追加してもよろしいですか？')) {
            return; 
        }
    }

    addItem(title, url, project, note, favType);
  });

  document.getElementById('btn-close-modal').addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel-edit').addEventListener('click', closeEditModal);
  document.getElementById('btn-save-edit').addEventListener('click', saveEdit);

  document.getElementById('btn-close-project-modal').addEventListener('click', closeProjectEditModal);
  document.getElementById('btn-cancel-project-edit').addEventListener('click', closeProjectEditModal);
  document.getElementById('btn-save-project-edit').addEventListener('click', saveProjectEdit);
  
  document.getElementById('btn-delete-project').addEventListener('click', () => {
    if (editingProjectName) deleteProject(editingProjectName);
  });

  const btnOpenManage = document.getElementById('btn-open-manage');
  if(btnOpenManage) btnOpenManage.addEventListener('click', openManageModal);
  
  document.getElementById('btn-close-manage').addEventListener('click', () => {
    document.getElementById('project-manage-modal').classList.remove('open');
  });
  document.getElementById('btn-merge-projects').addEventListener('click', handleMerge);

  document.getElementById('btn-sort-toggle').addEventListener('click', async () => {
    if (currentSortMode === 'DATE') currentSortMode = 'PROJECT';
    else if (currentSortMode === 'PROJECT') currentSortMode = 'CLICKS';
    else currentSortMode = 'DATE';
    updateSortButton();
    await saveData();
    renderList();
  });

  document.getElementById('btn-export-json').addEventListener('click', exportData);
  document.getElementById('btn-import-open').addEventListener('click', () => {
    document.getElementById('import-modal').classList.add('open');
  });
  document.getElementById('btn-close-import').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('open');
  });
  document.getElementById('btn-cancel-import').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('open');
  });
  document.getElementById('btn-run-import').addEventListener('click', handleImportData);

  let searchTimeout = null;
  document.getElementById('input-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    
    // クリアボタンの表示切替は即座に行う
    const inputValue = e.target.value.trim();
    document.getElementById('btn-search-clear').style.display = inputValue ? 'block' : 'none';
    
    // 200ms後に検索クエリの更新と画面の再描画を行う
    searchTimeout = setTimeout(() => {
      searchQuery = inputValue;
      renderFilters();
      renderList();
    }, 200);
  });

  document.getElementById('btn-search-clear').addEventListener('click', () => {
    clearTimeout(searchTimeout); // 実行待ちの検索処理をキャンセル
    searchQuery = '';
    const input = document.getElementById('input-search');
    input.value = '';
    input.focus();
    document.getElementById('btn-search-clear').style.display = 'none';
    renderFilters(); // タブの件数を初期状態に戻す
    renderList();
  });

  const checkArchived = document.getElementById('check-show-archived');
  if (checkArchived) {
    checkArchived.addEventListener('change', async (e) => {
      showArchived = e.target.checked;
      await saveData();
      renderFilters();
      renderList();
    });
  }

  const floatingSearchToggle = document.getElementById('check-floating-search-enabled');
  if (floatingSearchToggle) {
    floatingSearchToggle.addEventListener('change', async (e) => {
      floatingSearchEnabled = e.target.checked;
      await saveData();
    });
  }
}

function startSidePanelHeartbeat() {
  stopSidePanelHeartbeat(false);
  pushSidePanelHeartbeat();
  sidePanelHeartbeatTimer = window.setInterval(pushSidePanelHeartbeat, SIDE_PANEL_HEARTBEAT_INTERVAL_MS);
}

function stopSidePanelHeartbeat(clearStorage = true) {
  if (sidePanelHeartbeatTimer) {
    window.clearInterval(sidePanelHeartbeatTimer);
    sidePanelHeartbeatTimer = null;
  }
  if (clearStorage) {
    chrome.storage.local.set({ sidePanelHeartbeat: 0 }).catch(error => {
      console.warn('Failed to clear sidePanelHeartbeat', error);
    });
  }
}

function syncSidePanelHeartbeatVisibility() {
  if (document.visibilityState === 'visible') {
    if (!sidePanelHeartbeatTimer) startSidePanelHeartbeat();
  } else {
    stopSidePanelHeartbeat();
  }
}

function pushSidePanelHeartbeat() {
  chrome.storage.local.set({ sidePanelHeartbeat: Date.now() }).catch(error => {
    console.warn('Failed to update sidePanelHeartbeat', error);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// --- 検索用の文字正規化関数 ---
function normalizeString(str) {
  if (!str) return '';
  let s = str.toLowerCase();
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(m) {
    return String.fromCharCode(m.charCodeAt(0) - 0xFEE0);
  });
  const kanaMap = {
    'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
    'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
    'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
    'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
    'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
    'ｳﾞ': 'ヴ', 'ﾜﾞ': 'ヷ', 'ｦﾞ': 'ヺ',
    'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
    'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
    'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
    'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
    'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
    'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
    'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
    'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
    'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
    'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
    'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
    'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
    '｡': '。', '､': '、', 'ｰ': 'ー', '｢': '「', '｣': '」', '･': '・'
  };
  const reg = new RegExp('(' + Object.keys(kanaMap).join('|') + ')', 'g');
  s = s.replace(reg, function(match) {
    return kanaMap[match];
  });
  s = s.replace(/ﾞ/g, '゛').replace(/ﾟ/g, '゜');
  s = s.replace(/[\u30A1-\u30F6]/g, function(match) {
    return String.fromCharCode(match.charCodeAt(0) - 0x0060);
  });
  return s;
}

// --- プロンプトメモ機能 ---
let promptMemos = [];
let promptCategories = ['未分類'];
let promptSearchQuery = '';
let promptCategoryFilter = 'ALL';
let promptSortMode = 'POPULAR';
let editingPromptMemoId = null;
let promptCopyFeedbackId = null;
let promptCopyFeedbackTimer = null;

function setupPromptMemoFeature() {
  const btnLinks = document.getElementById('mode-links');
  const btnPrompts = document.getElementById('mode-prompts');
  const search = document.getElementById('prompt-search');
  const addBtn = document.getElementById('prompt-add-open');
  const modal = document.getElementById('prompt-modal');
  const titleInput = document.getElementById('prompt-title-edit');
  const categoryInput = document.getElementById('prompt-category-edit');
  const bodyInput = document.getElementById('prompt-body-edit');
  const sortSelect = document.getElementById('prompt-sort-mode');

  if (!btnLinks || !btnPrompts || !search || !addBtn || !modal || !titleInput || !categoryInput || !bodyInput) return;

  chrome.storage.local.get(['promptMemos', 'promptCategories', 'promptSortMode'], (result) => {
    promptMemos = Array.isArray(result.promptMemos) ? result.promptMemos : [];
    promptCategories = normalizePromptCategoriesSidepanel(result.promptCategories);
    promptSortMode = normalizePromptSortModeSidepanel(result.promptSortMode);
    if (sortSelect) sortSelect.value = promptSortMode;
    renderPromptMemos();
  });

  btnLinks.addEventListener('click', () => setSidepanelMode('links'));
  btnPrompts.addEventListener('click', () => setSidepanelMode('prompts'));

  search.addEventListener('input', (e) => {
    promptSearchQuery = e.target.value || '';
    renderPromptMemos();
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', async (e) => {
      promptSortMode = normalizePromptSortModeSidepanel(e.target.value);
      renderPromptMemos();
      await chrome.storage.local.set({ promptSortMode });
    });
  }

  addBtn.addEventListener('click', () => openPromptMemoModal());
  document.getElementById('btn-close-prompt-modal')?.addEventListener('click', closePromptMemoModal);
  document.getElementById('btn-cancel-prompt-edit')?.addEventListener('click', closePromptMemoModal);
  document.getElementById('btn-save-prompt-edit')?.addEventListener('click', savePromptMemoFromModal);
  bodyInput.addEventListener('input', updatePromptCharCount);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePromptMemoModal();
  });
  [titleInput, categoryInput, bodyInput].forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePromptMemoModal();
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        savePromptMemoFromModal();
      }
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let changed = false;
    if (changes.promptMemos) {
      promptMemos = Array.isArray(changes.promptMemos.newValue) ? changes.promptMemos.newValue : [];
      changed = true;
    }
    if (changes.promptCategories) {
      promptCategories = normalizePromptCategoriesSidepanel(changes.promptCategories.newValue);
      changed = true;
    }
    if (changes.promptSortMode) {
      promptSortMode = normalizePromptSortModeSidepanel(changes.promptSortMode.newValue);
      const sortSelect = document.getElementById('prompt-sort-mode');
      if (sortSelect) sortSelect.value = promptSortMode;
      changed = true;
    }
    if (changed) renderPromptMemos();
  });
}

function setSidepanelMode(mode) {
  const body = document.body;
  const btnLinks = document.getElementById('mode-links');
  const btnPrompts = document.getElementById('mode-prompts');
  if (mode === 'prompts') {
    body.classList.remove('mode-links');
    body.classList.add('mode-prompts');
    btnLinks?.classList.remove('active');
    btnPrompts?.classList.add('active');
    document.getElementById('prompt-search')?.focus();
  } else {
    body.classList.remove('mode-prompts');
    body.classList.add('mode-links');
    btnPrompts?.classList.remove('active');
    btnLinks?.classList.add('active');
  }
}


function getPromptMemoCategorySidepanel(memo) {
  return String(memo?.categoryName || memo?.projectName || '未分類').trim() || '未分類';
}

function categoryInputValueSidepanel(name) {
  const value = String(name || '').trim();
  return value && value !== '未分類' ? value : '';
}

function normalizePromptCategoriesSidepanel(value) {
  const base = Array.isArray(value) ? value : [];
  const merged = ['未分類', ...base, ...((promptMemos || []).map(m => getPromptMemoCategorySidepanel(m)))];
  return Array.from(new Set(merged.map(v => String(v || '').trim()).filter(Boolean)));
}

function getPromptCategoriesSidepanel() {
  return normalizePromptCategoriesSidepanel(promptCategories);
}

function addPromptCategorySidepanel(name) {
  const categoryName = String(name || '').trim() || '未分類';
  return normalizePromptCategoriesSidepanel([...promptCategories, categoryName]);
}

const PROMPT_CATEGORY_PALETTE_SIDEPANEL = [
  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', cardBg: '#f8fbff', cardBorder: '#bfdbfe' },
  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', cardBg: '#fff7f7', cardBorder: '#fecaca' },
  { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', cardBg: '#f8fff9', cardBorder: '#bbf7d0' },
  { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', cardBg: '#fbfaff', cardBorder: '#ddd6fe' },
  { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', cardBg: '#f6feff', cardBorder: '#a5f3fc' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', cardBg: '#fffaf5', cardBorder: '#fed7aa' },
  { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', cardBg: '#fff8fb', cardBorder: '#fbcfe8' },
  { bg: '#fefce8', text: '#854d0e', border: '#fde68a', cardBg: '#fffdf2', cardBorder: '#fde68a' }
];

function hashPromptCategoryNameSidepanel(name) {
  const str = String(name || '未分類');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getPromptCategoryColorSidepanel(name) {
  const categoryName = String(name || '未分類').trim() || '未分類';
  if (categoryName === '未分類') {
    return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb', cardBg: '#ffffff', cardBorder: '#e5e7eb' };
  }
  return PROMPT_CATEGORY_PALETTE_SIDEPANEL[hashPromptCategoryNameSidepanel(categoryName) % PROMPT_CATEGORY_PALETTE_SIDEPANEL.length];
}

function promptCategoryButtonStyleSidepanel(categoryName, active) {
  const colors = getPromptCategoryColorSidepanel(categoryName);
  if (active) {
    return `background:${colors.text};color:white;border-color:${colors.text};box-shadow:0 2px 7px rgba(15,23,42,0.12);`;
  }
  return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
}

function promptCategoryBadgeStyleSidepanel(categoryName) {
  const colors = getPromptCategoryColorSidepanel(categoryName);
  return `background:${colors.bg};color:${colors.text};border-color:${colors.border};`;
}

function promptCategoryCardStyleSidepanel(categoryName) {
  const colors = getPromptCategoryColorSidepanel(categoryName);
  return `background:${colors.cardBg};border-color:${colors.cardBorder};`;
}

function renderPromptCategoryFiltersSidepanel() {
  const filterEl = document.getElementById('prompt-category-filter');
  if (!filterEl) return;
  const categories = getPromptCategoriesSidepanel();
  const total = (promptMemos || []).length;
  const buttons = [`<button class="prompt-category-btn ${promptCategoryFilter === 'ALL' ? 'active' : ''}" style="${promptCategoryButtonStyleSidepanel('すべて', promptCategoryFilter === 'ALL')}" data-prompt-category="ALL">すべて (${total})</button>`];
  categories.forEach(category => {
    const count = (promptMemos || []).filter(memo => getPromptMemoCategorySidepanel(memo) === category).length;
    buttons.push(`<button class="prompt-category-btn ${promptCategoryFilter === category ? 'active' : ''}" style="${promptCategoryButtonStyleSidepanel(category, promptCategoryFilter === category)}" data-prompt-category="${escapeHtml(category)}">${escapeHtml(category)} (${count})</button>`);
  });
  filterEl.innerHTML = buttons.join('');
  filterEl.querySelectorAll('[data-prompt-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      promptCategoryFilter = btn.getAttribute('data-prompt-category') || 'ALL';
      renderPromptMemos();
    });
  });
}

function updatePromptCategoryDatalistSidepanel() {
  const datalist = document.getElementById('prompt-category-list');
  if (!datalist) return;
  datalist.innerHTML = getPromptCategoriesSidepanel().map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
}

function normalizePromptSortModeSidepanel(value) {
  return value === 'ADDED' ? 'ADDED' : 'POPULAR';
}

function getPromptMemoAddedTimeSidepanel(memo) {
  const raw = memo?.createdAt || memo?.addedAt || memo?.updatedAt || '';
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getPromptMemoUpdatedTimeSidepanel(memo) {
  const raw = memo?.updatedAt || memo?.createdAt || memo?.addedAt || '';
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getFilteredPromptMemosForSidepanel() {
  const q = normalizeString(promptSearchQuery || '');
  let list = Array.isArray(promptMemos) ? [...promptMemos] : [];
  if (promptCategoryFilter !== 'ALL') {
    list = list.filter(memo => getPromptMemoCategorySidepanel(memo) === promptCategoryFilter);
  }
  if (q) {
    list = list.filter(memo =>
      normalizeString(memo.title || '').includes(q) ||
      normalizeString(memo.body || '').includes(q) ||
      normalizeString(getPromptMemoCategorySidepanel(memo)).includes(q)
    );
  }
  return list.sort((a, b) => {
    if (promptSortMode === 'ADDED') {
      const addedDiff = getPromptMemoAddedTimeSidepanel(b) - getPromptMemoAddedTimeSidepanel(a);
      if (addedDiff !== 0) return addedDiff;
      return String(b.id || '').localeCompare(String(a.id || ''));
    }
    const useDiff = Number(b.copyCount || 0) - Number(a.copyCount || 0);
    if (useDiff !== 0) return useDiff;
    const updatedDiff = getPromptMemoUpdatedTimeSidepanel(b) - getPromptMemoUpdatedTimeSidepanel(a);
    if (updatedDiff !== 0) return updatedDiff;
    return getPromptMemoAddedTimeSidepanel(b) - getPromptMemoAddedTimeSidepanel(a);
  });
}

function renderPromptMemos() {
  const listEl = document.getElementById('prompt-list');
  const countEl = document.getElementById('prompt-count');
  if (!listEl || !countEl) return;
  renderPromptCategoryFiltersSidepanel();
  const list = getFilteredPromptMemosForSidepanel();
  countEl.textContent = `${list.length}件 / 全${promptMemos.length}件`;
  if (list.length === 0) {
    listEl.innerHTML = `<div class="prompt-empty">${promptSearchQuery ? '一致するプロンプトがありません' : 'プロンプトメモがありません'}</div>`;
    return;
  }
  listEl.innerHTML = list.map(memo => {
    const body = String(memo.body || '');
    const preview = body.length > 260 ? body.slice(0, 260) + '…' : body;
    const categoryName = getPromptMemoCategorySidepanel(memo);
    const copied = promptCopyFeedbackId === memo.id;
    return `
      <div class="prompt-card${copied ? ' copied' : ''}" style="${promptCategoryCardStyleSidepanel(categoryName)}">
        <div class="prompt-badge" style="${promptCategoryBadgeStyleSidepanel(categoryName)}">${escapeHtml(categoryName)}</div>
        <div class="prompt-card-title">${escapeHtml(memo.title || '無題のプロンプト')}</div>
        <div class="prompt-card-body">${escapeHtml(preview || '本文なし')}</div>
        <div class="prompt-card-meta">
          <span>${body.length.toLocaleString()}文字</span>
          <span>コピー ${Number(memo.copyCount || 0).toLocaleString()}回</span>
        </div>
        <div class="prompt-card-actions">
          <button class="prompt-mini-btn primary${copied ? ' copied' : ''}" data-prompt-copy="${escapeHtml(memo.id)}">${copied ? 'コピー済み' : 'コピー'}</button>
          <button class="prompt-mini-btn" data-prompt-edit="${escapeHtml(memo.id)}">編集</button>
          <button class="prompt-mini-btn danger" data-prompt-delete="${escapeHtml(memo.id)}">削除</button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-prompt-copy]').forEach(btn => {
    btn.addEventListener('click', () => copyPromptMemoSidepanel(btn.getAttribute('data-prompt-copy')));
  });
  listEl.querySelectorAll('[data-prompt-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const memo = promptMemos.find(m => m.id === btn.getAttribute('data-prompt-edit'));
      if (memo) openPromptMemoModal(memo);
    });
  });
  listEl.querySelectorAll('[data-prompt-delete]').forEach(btn => {
    btn.addEventListener('click', () => deletePromptMemoSidepanel(btn.getAttribute('data-prompt-delete')));
  });
}

function openPromptMemoModal(memo = null) {
  editingPromptMemoId = memo?.id || null;
  document.getElementById('prompt-title-edit').value = memo?.title || '';
  document.getElementById('prompt-category-edit').value = categoryInputValueSidepanel(memo ? getPromptMemoCategorySidepanel(memo) : (promptCategoryFilter !== 'ALL' ? promptCategoryFilter : '未分類'));
  updatePromptCategoryDatalistSidepanel();
  document.getElementById('prompt-body-edit').value = memo?.body || '';
  updatePromptCharCount();
  document.getElementById('prompt-modal').classList.add('open');
  setTimeout(() => document.getElementById('prompt-title-edit')?.focus(), 0);
}

function closePromptMemoModal() {
  editingPromptMemoId = null;
  document.getElementById('prompt-modal').classList.remove('open');
}

function updatePromptCharCount() {
  const body = document.getElementById('prompt-body-edit')?.value || '';
  const count = document.getElementById('prompt-char-count');
  if (count) count.textContent = `${body.length.toLocaleString()}文字`;
}

async function savePromptMemoFromModal() {
  const title = document.getElementById('prompt-title-edit')?.value.trim() || '';
  const categoryName = document.getElementById('prompt-category-edit')?.value.trim() || '未分類';
  const body = document.getElementById('prompt-body-edit')?.value || '';
  if (!title && !body.trim()) {
    alert('タイトルか本文を入力してください。');
    return;
  }
  const now = new Date().toISOString();
  let next = Array.isArray(promptMemos) ? [...promptMemos] : [];
  if (editingPromptMemoId) {
    next = next.map(memo => memo.id === editingPromptMemoId ? {
      ...memo,
      title: title || '無題のプロンプト',
      categoryName,
      body,
      updatedAt: now
    } : memo);
  } else {
    next.unshift({
      id: 'prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title: title || '無題のプロンプト',
      categoryName,
      body,
      createdAt: now,
      updatedAt: now,
      copyCount: 0
    });
  }
  const nextPromptCategories = addPromptCategorySidepanel(categoryName);
  promptMemos = next;
  promptCategories = nextPromptCategories;
  await chrome.storage.local.set({ promptMemos: next, promptCategories: nextPromptCategories });
  closePromptMemoModal();
  renderPromptMemos();
}

function showPromptCopyFeedbackSidepanel(id) {
  promptCopyFeedbackId = id;
  if (promptCopyFeedbackTimer) clearTimeout(promptCopyFeedbackTimer);
  renderPromptMemos();
  promptCopyFeedbackTimer = setTimeout(() => {
    if (promptCopyFeedbackId === id) {
      promptCopyFeedbackId = null;
      renderPromptMemos();
    }
  }, 1300);
}

async function copyPromptMemoSidepanel(id) {
  const memo = promptMemos.find(m => m.id === id);
  if (!memo) return;
  const text = memo.body || '';
  if (!text) {
    alert('コピーする本文がありません。');
    return;
  }

  // 押した瞬間にコピー回数と見た目を先に更新する。
  const now = new Date().toISOString();
  const next = promptMemos.map(m => m.id === id ? {
    ...m,
    copyCount: Number(m.copyCount || 0) + 1,
    lastCopiedAt: now,
    updatedAt: m.updatedAt || now
  } : m);
  promptMemos = next;
  showPromptCopyFeedbackSidepanel(id);
  chrome.storage.local.set({ promptMemos: next }).catch(console.error);

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

async function deletePromptMemoSidepanel(id) {
  const memo = promptMemos.find(m => m.id === id);
  if (!memo) return;
  if (!confirm(`プロンプトメモ「${memo.title || '無題'}」を削除しますか？`)) return;
  const next = promptMemos.filter(m => m.id !== id);
  promptMemos = next;
  await chrome.storage.local.set({ promptMemos: next });
  renderPromptMemos();
}
