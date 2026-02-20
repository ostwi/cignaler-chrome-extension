/**
 * Options page script.
 *
 * Manages CI server name and custom GitLab hostname settings.
 * Stored in chrome.storage.sync for cross-device sync.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const ciServerInput = document.getElementById("ci-server-name");
  const customHostsInput = document.getElementById("custom-hosts");
  const saveBtn = document.getElementById("btn-save");
  const saveStatus = document.getElementById("save-status");

  // Load saved settings
  const settings = await chrome.storage.sync.get(["ciServerName", "customHosts"]);
  ciServerInput.value = settings.ciServerName || "";
  customHostsInput.value = (settings.customHosts || []).join("\n");

  saveBtn.addEventListener("click", async () => {
    const ciServerName = ciServerInput.value.trim();
    const customHostsRaw = customHostsInput.value.trim();
    const customHosts = customHostsRaw
      ? customHostsRaw
          .split("\n")
          .map((h) => h.trim())
          .filter(Boolean)
      : [];

    try {
      await chrome.storage.sync.set({ ciServerName, customHosts });

      // Request host permissions for custom hosts
      if (customHosts.length > 0) {
        const origins = customHosts.map((h) => `*://${h}/*`);
        try {
          await chrome.permissions.request({ origins });
        } catch {
          // User may deny — that's fine, we still save the hostnames
        }
      }

      saveStatus.textContent = "Settings saved.";
      saveStatus.className = "save-status success";
      saveStatus.classList.remove("hidden");
      setTimeout(() => saveStatus.classList.add("hidden"), 3000);
    } catch (err) {
      saveStatus.textContent = "Failed to save: " + err.message;
      saveStatus.className = "save-status error";
      saveStatus.classList.remove("hidden");
    }
  });
});
