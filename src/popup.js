/**
 * Popup script.
 *
 * Queries the content script for GitLab data, manages UI states,
 * and sends watchers to the Tauri app via Chrome Native Messaging.
 */

const States = {
  LOADING: "state-loading",
  DETECTED: "state-detected",
  NO_REF: "state-no-ref",
  NOT_GITLAB: "state-not-gitlab",
  NO_CONFIG: "state-no-config",
};

/** Show one state, hide all others. */
function showState(stateId) {
  for (const id of Object.values(States)) {
    document.getElementById(id).classList.toggle("hidden", id !== stateId);
  }
}

/** Send an add-watcher message to the Cignaler native messaging host via background worker. */
async function sendToApp(name, project, ref, ciServer) {
  const response = await chrome.runtime.sendMessage({
    type: "SEND_NATIVE_MESSAGE",
    payload: {
      action: "add-watcher",
      name,
      project,
      ref,
      ci_server: ciServer,
    },
  });

  if (!response.success) {
    throw new Error(response.error);
  }
  return response.data;
}

/** Show a status message near a button. */
function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-message ${type}`;
  el.classList.remove("hidden");
}

/** Generate a default watcher name from project and ref. */
function defaultWatcherName(projectPath, ref) {
  const projectName = projectPath ? projectPath.split("/").pop() : "";
  return ref ? `${projectName} ${ref}` : projectName;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Load settings first
  const settings = await chrome.storage.sync.get(["ciServerName"]);
  const ciServerName = settings.ciServerName || "";

  if (!ciServerName) {
    showState(States.NO_CONFIG);
    document.getElementById("btn-open-options").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  // Query the active tab's content script
  let response;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showState(States.NOT_GITLAB);
      return;
    }

    response = await chrome.tabs.sendMessage(tab.id, { type: "GET_GITLAB_DATA" });
  } catch {
    // Content script not injected (non-matching page)
    showState(States.NOT_GITLAB);
    return;
  }

  if (!response || !response.isGitLab) {
    showState(States.NOT_GITLAB);
    return;
  }

  const { projectPath, ref } = response;

  if (!projectPath) {
    showState(States.NOT_GITLAB);
    return;
  }

  if (ref) {
    // Detected state — project and ref found
    showState(States.DETECTED);
    document.getElementById("project-path").textContent = projectPath;
    document.getElementById("ref-name").textContent = ref;
    document.getElementById("ci-server-name").textContent = ciServerName;
    document.getElementById("watcher-name").value = defaultWatcherName(projectPath, ref);

    document.getElementById("btn-add-watcher").addEventListener("click", async () => {
      const name = document.getElementById("watcher-name").value.trim();
      if (!name) {
        showStatus("status-message", "Please enter a watcher name.", "error");
        return;
      }
      try {
        const response = await sendToApp(name, projectPath, ref, ciServerName);
        if (response?.success) {
          showStatus("status-message", "Watcher added!", "success");
        } else {
          showStatus("status-message", response?.error || "Unknown error from Cignaler app.", "error");
        }
      } catch (err) {
        if (err.message?.includes("native messaging host not found")) {
          showStatus("status-message", "Cignaler app not found. Make sure the native messaging host is installed.", "error");
        } else {
          showStatus("status-message", `Error: ${err.message}`, "error");
        }
      }
    });
  } else {
    // No ref state — project found but ref missing
    showState(States.NO_REF);
    document.getElementById("no-ref-project-path").textContent = projectPath;
    document.getElementById("no-ref-ci-server-name").textContent = ciServerName;
    document.getElementById("no-ref-watcher-name").value = defaultWatcherName(projectPath, null);

    document.getElementById("btn-add-watcher-manual").addEventListener("click", async () => {
      const manualRef = document.getElementById("manual-ref").value.trim();
      const name = document.getElementById("no-ref-watcher-name").value.trim();
      if (!manualRef) {
        showStatus("no-ref-status-message", "Please enter a branch or tag.", "error");
        return;
      }
      if (!name) {
        showStatus("no-ref-status-message", "Please enter a watcher name.", "error");
        return;
      }
      try {
        const response = await sendToApp(name, projectPath, manualRef, ciServerName);
        if (response?.success) {
          showStatus("no-ref-status-message", "Watcher added!", "success");
        } else {
          showStatus("no-ref-status-message", response?.error || "Unknown error from Cignaler app.", "error");
        }
      } catch (err) {
        if (err.message?.includes("native messaging host not found")) {
          showStatus("no-ref-status-message", "Cignaler app not found. Make sure the native messaging host is installed.", "error");
        } else {
          showStatus("no-ref-status-message", `Error: ${err.message}`, "error");
        }
      }
    });
  }
});
