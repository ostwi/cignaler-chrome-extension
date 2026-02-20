/**
 * Background service worker.
 *
 * Handles native messaging to the Cignaler app and programmatic
 * content script injection for custom GitLab hostnames.
 */

// Handle messages from popup for native messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SEND_NATIVE_MESSAGE") {
    chrome.runtime.sendNativeMessage("com.cignaler.app", message.payload)
      .then((response) => sendResponse({ success: true, data: response }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

// When the user clicks the extension icon on a page that doesn't match
// the static content_scripts patterns, try injecting the content script
// dynamically (requires activeTab permission which is granted on click).
chrome.action.onClicked.addListener(async (tab) => {
  // This only fires when there's no default_popup. Since we have a popup,
  // this won't fire — but keep it here for future use if the popup is removed.
  if (tab.id) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/gitlab-parser.js", "src/content.js"],
      });
    } catch {
      // Injection may fail on chrome:// or non-http pages
    }
  }
});

// Listen for custom host changes and register content scripts dynamically
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.customHosts) {
    await updateDynamicContentScripts(changes.customHosts.newValue || []);
  }
});

// On startup, register dynamic content scripts for saved custom hosts
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.sync.get(["customHosts"]);
  if (settings.customHosts?.length) {
    await updateDynamicContentScripts(settings.customHosts);
  }
});

/**
 * Register dynamic content scripts for custom GitLab hostnames.
 * This allows the extension to work on self-hosted GitLab instances.
 */
async function updateDynamicContentScripts(hosts) {
  // Remove existing dynamic scripts
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["cignaler-custom-hosts"] });
  } catch {
    // No scripts registered yet — that's fine
  }

  if (!hosts || hosts.length === 0) return;

  const matches = hosts.map((h) => `*://${h}/*`);

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: "cignaler-custom-hosts",
        matches,
        js: ["src/gitlab-parser.js", "src/content.js"],
        runAt: "document_idle",
      },
    ]);
  } catch (err) {
    console.error("Failed to register dynamic content scripts:", err);
  }
}
