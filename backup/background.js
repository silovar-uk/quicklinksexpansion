// background.js

// --- 初期データ定義 (L_のデータをq_形式に変換) ---
const INITIAL_PROJECTS = ["クラブ発信", "自分", "キュレーション", "広報・PR", "メルマガ", "社員", "プロモ", "PRJ", "クリエイティブ", "未分類"];

const INITIAL_COLORS = {
  "クラブ発信": { bg: "#fef2f2", text: "#991b1b", border: "#E03E3E" }, // 追加: クラブ発信用カラー(赤系)
  "自分": { bg: "#eef6fd", text: "#1d4ed8", border: "#4A90E2" },       // Blue
  "キュレーション": { bg: "#fff7ed", text: "#9a3412", border: "#F5A623" }, // Orange
  "広報・PR": { bg: "#fef2f2", text: "#991b1b", border: "#E03E3E" },    // Red
  "メルマガ": { bg: "#f3e8ff", text: "#6b21a8", border: "#9013FE" },    // Purple
  "社員": { bg: "#f0fdf4", text: "#166534", border: "#417505" },       // Green
  "プロモ": { bg: "#ccfbf1", text: "#115e59", border: "#009688" },     // Teal
  "PRJ": { bg: "#fdf4ff", text: "#86198f", border: "#BD10E0" },        // Pink/Magenta
  "クリエイティブ": { bg: "#fce7f3", text: "#9d174d", border: "#FF4081" } // Pink
};

const INITIAL_ITEMS = [
    // --- 自分 ---
    { title: "自分宛", url: "https://line.worksmobile.com/message/send?version=26&emailList=y.taira@urawa-reds.co.jp", projectName: "自分" },
    { title: "反省", url: "https://talk.worksmobile.com/join?version=26&channelId=9c81e9f9-d029-6cc8-d5e3-a60d4949f547", projectName: "自分" },
    { title: "私用", url: "https://line.worksmobile.com/message/send?version=26&channelId=09442415-b12b-d09e-e8cf-744c82cec3c0", projectName: "自分" },
    { title: "思考整理用", url: "https://line.worksmobile.com/message/send?version=26&channelId=0362479e-dcd1-c2e0-e0ad-fbfeb874af99", projectName: "自分" },
    { title: "スプレッドシート", url: "https://line.worksmobile.com/message/send?version=26&channelId=b7285b57-b7c5-be51-4d28-1e3c00e70702", projectName: "自分" },
    // --- キュレーション ---
    { title: "危機管理", url: "https://line.worksmobile.com/message/send?version=26&channelId=478a5447-2485-c8ed-8392-5f30300c345b", projectName: "キュレーション" },
    { title: "クラブ広報", url: "https://line.worksmobile.com/message/send?version=26&channelId=eea8fa8d-6bcd-b93b-5a67-bbdf3805a52f", projectName: "キュレーション" },
    { title: "数値関連", url: "https://line.worksmobile.com/message/send?version=26&channelId=409fcc36-e486-6f33-c50d-eecd69ee1c16", projectName: "キュレーション" },
    { title: "チーム広報", url: "https://line.worksmobile.com/message/send?version=26&channelId=61744d98-0d3d-ed47-f66e-8eae52461556", projectName: "キュレーション" },
    { title: "PR・広告", url: "https://line.worksmobile.com/message/send?version=26&channelId=c7836dba-ca42-d29b-e51a-083ad00022e4", projectName: "キュレーション" },
    { title: "その他エンタメ", url: "https://line.worksmobile.com/message/send?version=26&channelId=f7db8d65-c2b7-65c2-6cb7-de38535e2a21", projectName: "キュレーション" },
    { title: "反応", url: "https://line.worksmobile.com/message/send?version=26&channelId=016f6e34-7a86-c391-5a7a-602751438c01", projectName: "キュレーション" },
    { title: "クリエイティブ", url: "https://line.worksmobile.com/message/send?version=26&channelId=d6ada304-8c09-8e3a-6a4c-1197fa016c4f", projectName: "キュレーション" },
    { title: "WEB", url: "https://line.worksmobile.com/message/send?version=26&channelId=3b545f57-99f1-22b1-5e76-bfbd95c0c070", projectName: "キュレーション" },
    // --- 広報・PR ---
    { title: "企画", url: "https://line.worksmobile.com/message/send?version=26&channelId=d01be66e-681e-75a8-00f4-39c504d8c67a", projectName: "広報・PR" },
    { title: "PR発信", url: "https://line.worksmobile.com/message/send?version=26&channelId=92314380", projectName: "広報・PR" },
    { title: "PR@発信", url: "https://line.worksmobile.com/message/send?version=26&channelId=9c271147-68d0-3cca-55a8-7eb45da9abff", projectName: "広報・PR" },
    { title: "サイトMTG", url: "https://line.worksmobile.com/message/send?version=26&channelId=161999837", projectName: "広報・PR" },
    { title: "プラチナマップ", url: "https://line.worksmobile.com/message/send?version=26&channelId=3d08cac2-990f-e730-ee10-2a14d712fcc1", projectName: "広報・PR" },
    { title: "YouTube小部屋", url: "https://line.worksmobile.com/message/send?version=26&channelId=1101fec6-f651-11e5-f066-59029e59f308", projectName: "広報・PR" },
    { title: "危機管理", url: "https://line.worksmobile.com/message/send?version=26&channelId=c91027a4-47b9-a524-c8b1-c6182f853285", projectName: "広報・PR" },
    // --- メルマガ ---
    { title: "発信記録", url: "https://line.worksmobile.com/message/send?version=26&channelId=100134478", projectName: "メルマガ" },
    { title: "メルマガ作成", url: "https://line.worksmobile.com/message/send?version=26&channelId=137659521", projectName: "メルマガ" },
    // --- 社員 ---
    { title: "庶務", url: "https://line.worksmobile.com/message/send?version=26&channelId=160723476", projectName: "社員" },
    { title: "取材調整", url: "https://line.worksmobile.com/message/send?version=26&channelId=149ba308-df3d-f8d4-f688-62500f4a5c5c", projectName: "社員" },
    { title: "試合運用関連", url: "https://line.worksmobile.com/message/send?version=26&channelId=144748651", projectName: "社員" },
    // --- プロモ ---
    { title: "プチMTG", url: "https://line.worksmobile.com/message/send?version=26&channelId=413c6043-2f9f-d71e-3b16-fbf9c375fd80", projectName: "プロモ" },
    { title: "プロモMTG", url: "https://line.worksmobile.com/message/send?version=26&channelId=8e31208f-f2ef-230b-3804-85dfa35c0463", projectName: "プロモ" },
    { title: "FE⇔PR", url: "https://line.worksmobile.com/message/send?version=26&channelId=142871731", projectName: "プロモ" },
    // --- PRJ ---
    { title: "決起集会", url: "https://line.worksmobile.com/message/send?version=26&channelId=e2afd2b0-48f5-05ac-0ec2-22873550f7e7", projectName: "PRJ" },
    // --- クリエイティブ ---
    { title: "ISM", url: "https://line.worksmobile.com/message/send?version=26&channelId=8b1676c9-a0a9-4035-8d26-014b5b593743", projectName: "クリエイティブ" },
    { title: "コア", url: "https://line.worksmobile.com/message/send?version=26&channelId=9d3da7f9-53f0-71b4-c6fa-223f5f75ddfe", projectName: "クリエイティブ" },
    { title: "creative@", url: "https://line.worksmobile.com/message/send?version=26&channelId=aeee5569-17d0-6281-70b5-2597a619efa0", projectName: "クリエイティブ" },
    { title: "開幕", url: "https://line.worksmobile.com/message/send?version=26&channelId=aa48cc5f-b262-7c3b-54b4-e10b84c61b99", projectName: "クリエイティブ" }
];

// インストール時に初期データを保存
chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.contextMenus.create({
    id: "add-to-quick-links",
    title: "Quick Linksに追加",
    contexts: ["page", "link"]
  });

  // 既存データを確認
  const data = await chrome.storage.local.get(['items', 'projects', 'projectColors', 'floatingSearchEnabled', 'sidePanelHeartbeat', 'promptMemos']);
  
  // データが空なら初期データを注入
  if (!data.items || data.items.length === 0) {
    const formattedItems = INITIAL_ITEMS.map((item, index) => ({
      id: "init-" + index + "-" + Math.random().toString(36).substr(2, 5),
      title: item.title,
      url: item.url,
      projectName: item.projectName,
      note: "",
      addedAt: new Date().toISOString(),
      clickCount: 0,
      archived: false,
      isFavorite: false,
      favoriteType: 'none', // none, normal, temp 追加
      favoriteExpiry: null  // 期限用 追加
    }));

    await chrome.storage.local.set({
      items: formattedItems,
      projects: INITIAL_PROJECTS,
      projectColors: INITIAL_COLORS,
      floatingSearchEnabled: true,
      sidePanelHeartbeat: 0,
      promptMemos: []
    });
    console.log("Initial L_ data injected.");
  } else {
    const defaults = {};
    if (typeof data.floatingSearchEnabled === 'undefined') defaults.floatingSearchEnabled = true;
    if (typeof data.sidePanelHeartbeat === 'undefined') defaults.sidePanelHeartbeat = 0;
    if (!Array.isArray(data.promptMemos)) defaults.promptMemos = [];
    if (Object.keys(defaults).length > 0) {
      await chrome.storage.local.set(defaults);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.set({ sidePanelHeartbeat: 0 });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'quickLinksOpenTab' && message.url) {
    (async () => {
      try {
        const createOptions = {
          url: message.url,
          active: message.active !== false
        };

        if (sender.tab && typeof sender.tab.windowId === 'number') {
          createOptions.windowId = sender.tab.windowId;
          if (typeof sender.tab.index === 'number') {
            const indexOffset = typeof message.indexOffset === 'number' ? message.indexOffset : 1;
            createOptions.index = sender.tab.index + indexOffset;
          }
        } else {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTab && typeof activeTab.windowId === 'number') {
            createOptions.windowId = activeTab.windowId;
            if (typeof activeTab.index === 'number') {
              const indexOffset = typeof message.indexOffset === 'number' ? message.indexOffset : 1;
              createOptions.index = activeTab.index + indexOffset;
            }
          }
        }

        await chrome.tabs.create(createOptions);
        sendResponse({ ok: true });
      } catch (error) {
        console.warn('Failed to open tab', error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  if (message && message.type === 'quickLinksOpenSidePanel') {
    (async () => {
      try {
        let windowId = sender.tab && sender.tab.windowId;
        if (typeof windowId !== 'number') {
          const lastFocused = await chrome.windows.getLastFocused();
          windowId = lastFocused && lastFocused.id;
        }

        if (typeof windowId === 'number') {
          await chrome.sidePanel.open({ windowId });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'No window available' });
        }
      } catch (error) {
        console.warn('Failed to open side panel', error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  return false;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "add-to-quick-links") {
    const targetUrl = info.linkUrl || info.pageUrl;
    const targetTitle = info.linkUrl ? (info.selectionText || targetUrl) : tab.title;

    // --- 自動振り分けの判定 ---
    let autoProjectName = "未分類";
    if (targetUrl) {
      if (targetUrl.includes('www.urawa-reds.co.jp')) {
        autoProjectName = "クラブ発信";
      } else if (targetUrl.includes('mail.worksmobile.com/')) {
        autoProjectName = "メールアーカイブ";
      } else if (targetUrl.includes('docs.google.com/spreadsheets')) {
        autoProjectName = "スプレッドシート";
      } else if (targetUrl.includes('board.worksmobile.com')) {
        autoProjectName = "掲示板";
      } else if (targetUrl.includes('drive.worksmobile.com')) {
        autoProjectName = "LWドライブ";
      } else if (!/^https?:\/\//i.test(targetUrl) && /^[a-zA-Z0-9-]+$/.test(targetUrl)) {
        autoProjectName = "LINEWORKS";
      }
    }

    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      title: targetTitle,
      url: targetUrl,
      projectName: autoProjectName, 
      addedAt: new Date().toISOString(),
      note: "",
      clickCount: 0,
      archived: false,
      isFavorite: false,
      favoriteType: 'none',
      favoriteExpiry: null
    };

    const data = await chrome.storage.local.get(['items', 'projects']);
    const currentItems = data.items || [];
    const currentProjects = data.projects || [];

    // --- 重複チェック ---
    const isDuplicate = currentItems.some(item => item.url === targetUrl);
    if (isDuplicate) {
      // 登録済みの場合はデスクトップ通知を出して追加処理を中断
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Quick Links",
        message: "このリンクは既に登録されています。"
      });
      return; 
    }

    const newItems = [newItem, ...currentItems];
    
    let newProjects = currentProjects;
    if (!currentProjects.includes(autoProjectName)) {
      newProjects = [...currentProjects, autoProjectName];
      await chrome.storage.local.set({ projects: newProjects });
    }
    
    await chrome.storage.local.set({ items: newItems });
  }
});