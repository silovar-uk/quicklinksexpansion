(async () => {
  try {
    const response = await fetch(chrome.runtime.getURL('sidepanel.html'));
    if (!response.ok) throw new Error(`sidepanel.html: ${response.status}`);
    const source = await response.text();
    const injected = source.replace(
      /<\/body>\s*<\/html>\s*$/i,
      '  <script src="log-relay-panel.js"></script>\n</body>\n</html>'
    );
    document.open();
    document.write(injected);
    document.close();
  } catch (error) {
    console.error('[Log Relay] サイドパネルの読み込みに失敗しました。', error);
    document.body.textContent = 'Quick Linksの読み込みに失敗しました。拡張機能を再読み込みしてください。';
  }
})();
