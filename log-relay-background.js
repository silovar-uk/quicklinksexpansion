(() => {
  const COMMAND = 'quick-links-add-log';
  const MESSAGE = 'logRelayOpenCapture';

  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== COMMAND) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGE });
    } catch (error) {
      console.info('[Log Relay] このページでは入力UIを開けません。', error);
    }
  });
})();
