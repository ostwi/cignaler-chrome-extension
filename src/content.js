/**
 * Content script injected on GitLab pages.
 *
 * Detects GitLab, extracts project/ref data, and responds to
 * messages from the popup. Uses MutationObserver to handle
 * GitLab's SPA navigation.
 */

(() => {
  let cachedData = null;
  let lastUrl = location.href;

  /**
   * Re-extract data from the current page.
   */
  function refreshData() {
    if (!GitLabParser.isGitLabPage()) {
      cachedData = null;
      return;
    }
    cachedData = GitLabParser.extract(location.href);
  }

  // Initial extraction (with a slight delay to let DOM settle)
  setTimeout(refreshData, 300);

  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_GITLAB_DATA") {
      // Always re-extract on request for freshest data
      refreshData();

      if (!cachedData) {
        sendResponse({ isGitLab: false });
      } else {
        sendResponse({
          isGitLab: true,
          projectPath: cachedData.projectPath,
          ref: cachedData.ref,
          pageType: cachedData.pageType,
          host: location.hostname,
        });
      }
    }
    // Return true to indicate async response (even though we respond synchronously)
    return true;
  });

  // Watch for SPA navigation (URL changes without full page reload)
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Delay to let new page content render
      setTimeout(refreshData, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
