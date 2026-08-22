(async () => {
  try {
    const response = await fetch(chrome.runtime.getURL('sidepanel.html'));
    if (!response.ok) throw new Error(`sidepanel.html: ${response.status}`);
    const source = await response.text();

    // Keep the mature sidepanel.html as the source of truth, but avoid regex-based HTML rewriting.
    // After the core page has loaded, attach the shared design layer and focused feature modules explicitly.
    document.open();
    document.write(source);
    document.close();

    // document.write() may leave the rewritten page in a loading state while sidepanel.js is still
    // executing. Wait until the base UI and its DOMContentLoaded handlers are complete before
    // feature modules patch or extend the page.
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('qpl-design-tokens.css');
    document.head.appendChild(link);

    const loadScript = src => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`${src} の読み込みに失敗しました。`));
      document.body.appendChild(script);
    });

    await loadScript('reds-x-search-core.js');
    await loadScript('reds-x-search-polish.js');
    await loadScript('shortcut-registry.js');
    await loadScript('log-relay-core.js');
    await loadScript('log-relay-panel.js');
    await loadScript('log-relay-polish.js');
    await loadScript('log-relay-toggle-panel.js');
  } catch (error) {
    console.error('[Quick Links] サイドパネルの読み込みに失敗しました。', error);
    document.body.textContent = 'Quick Linksの読み込みに失敗しました。拡張機能を再読み込みしてください。';
  }
})();
