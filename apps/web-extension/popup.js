(() => {
  "use strict";

  const api = globalThis.browser ?? globalThis.chrome ?? null;
  const MESSAGE = Object.freeze({
    launch: "iga_v4_launch",
    close: "iga_v4_close",
    status: "iga_v4_status"
  });

  const statusCard = document.getElementById("status-card");
  const statusTitle = document.getElementById("status-title");
  const statusCopy = document.getElementById("status-copy");
  const launchButton = document.getElementById("launch");
  const closeButton = document.getElementById("close");
  const openInstagramButton = document.getElementById("open-instagram");

  let activeTab = null;

  function setStatus(tone, title, copy) {
    statusCard.className = `status-card ${tone ?? ""}`.trim();
    statusTitle.textContent = title;
    statusCopy.textContent = copy;
  }

  function isInstagramUrl(url) {
    try {
      const hostname = new URL(url).hostname;
      return /(^|\.)instagram\.com$/i.test(hostname);
    } catch {
      return false;
    }
  }

  function promisifyChrome(fn, context, ...args) {
    try {
      const result = fn.call(context, ...args);
      if (result?.then) return result;
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      try {
        fn.call(context, ...args, value => {
          const lastError = globalThis.chrome?.runtime?.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve(value);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function queryActiveTab() {
    if (!api?.tabs?.query) throw new Error("This browser does not expose the WebExtension tabs API.");
    const tabs = await promisifyChrome(api.tabs.query, api.tabs, { active: true, currentWindow: true });
    return Array.isArray(tabs) ? tabs[0] ?? null : null;
  }

  async function sendMessage(type) {
    if (!activeTab?.id || !api?.tabs?.sendMessage) throw new Error("No active Instagram tab is available.");
    return promisifyChrome(api.tabs.sendMessage, api.tabs, activeTab.id, { type });
  }

  async function createInstagramTab() {
    if (!api?.tabs?.create) {
      location.href = "https://www.instagram.com/";
      return;
    }
    await promisifyChrome(api.tabs.create, api.tabs, { url: "https://www.instagram.com/" });
    globalThis.close?.();
  }

  function reflectStatus(response) {
    if (!response?.ok) {
      setStatus("error", "Could not reach the auditor", response?.error || "Refresh the Instagram tab and try again.");
      launchButton.disabled = false;
      closeButton.hidden = true;
      return;
    }

    if (response.open) {
      setStatus("ready", "Auditor is open", "Return to Instagram to continue your audit.");
      launchButton.disabled = false;
      launchButton.querySelector("span").textContent = "Reopen Engagement Auditor";
      closeButton.hidden = false;
    } else {
      setStatus("ready", "Instagram is ready", "Tap below to open the V4 auditor on this tab.");
      launchButton.disabled = false;
      launchButton.querySelector("span").textContent = "Run Engagement Audit";
      closeButton.hidden = true;
    }
  }

  async function initialize() {
    if (!api) {
      setStatus("error", "Extension API unavailable", "This build must run as a Safari, Chrome, or Edge web extension.");
      return;
    }

    try {
      activeTab = await queryActiveTab();
      if (!activeTab || !isInstagramUrl(activeTab.url ?? "")) {
        setStatus("warn", "Open Instagram first", "Open instagram.com in this browser, log in, then tap the extension again.");
        launchButton.disabled = true;
        openInstagramButton.hidden = false;
        closeButton.hidden = true;
        return;
      }

      openInstagramButton.hidden = true;
      try {
        reflectStatus(await sendMessage(MESSAGE.status));
      } catch {
        setStatus("warn", "Refresh Instagram once", "The extension was enabled after this tab loaded. Refresh the Instagram page, then try again.");
        launchButton.disabled = false;
      }
    } catch (error) {
      setStatus("error", "Could not inspect this tab", error?.message ?? String(error));
    }
  }

  launchButton.addEventListener("click", async () => {
    launchButton.disabled = true;
    setStatus("", "Opening auditor…", "The interface will appear over Instagram.");
    try {
      reflectStatus(await sendMessage(MESSAGE.launch));
      globalThis.setTimeout(() => globalThis.close?.(), 350);
    } catch (error) {
      setStatus("error", "Could not open the auditor", `${error?.message ?? error}. Refresh Instagram and try again.`);
      launchButton.disabled = false;
    }
  });

  closeButton.addEventListener("click", async () => {
    closeButton.disabled = true;
    try {
      reflectStatus(await sendMessage(MESSAGE.close));
    } catch (error) {
      setStatus("error", "Could not close the auditor", error?.message ?? String(error));
    } finally {
      closeButton.disabled = false;
    }
  });

  openInstagramButton.addEventListener("click", () => {
    createInstagramTab().catch(error => setStatus("error", "Could not open Instagram", error?.message ?? String(error)));
  });

  initialize();
})();
