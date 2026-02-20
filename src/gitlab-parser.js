/**
 * GitLab URL parser and DOM extractor.
 *
 * Extracts project path and ref (branch/tag) from GitLab pages.
 * Key insight: `/-/` separates the project path from action segments.
 */

// eslint-disable-next-line no-unused-vars
const GitLabParser = (() => {
  /**
   * Page types we can detect from the URL structure.
   */
  const PAGE_TYPES = {
    TREE: "tree",
    BLOB: "blob",
    COMMITS: "commits",
    PIPELINES: "pipelines",
    PIPELINE_DETAIL: "pipeline_detail",
    TAGS: "tags",
    TAG_DETAIL: "tag_detail",
    MERGE_REQUEST: "merge_request",
    PROJECT_ROOT: "project_root",
    UNKNOWN: "unknown",
  };

  /**
   * Parse a GitLab URL into its components.
   * @param {string} urlString - Full URL of the page
   * @returns {{ projectPath: string|null, ref: string|null, pageType: string }}
   */
  function parseURL(urlString) {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      return { projectPath: null, ref: null, pageType: PAGE_TYPES.UNKNOWN };
    }

    const path = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    const separatorIndex = path.indexOf("/-/");

    if (separatorIndex === -1) {
      // No /-/ separator — could be a project root page like /group/project
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 2) {
        return {
          projectPath: path,
          ref: null,
          pageType: PAGE_TYPES.PROJECT_ROOT,
        };
      }
      return { projectPath: null, ref: null, pageType: PAGE_TYPES.UNKNOWN };
    }

    const projectPath = path.substring(0, separatorIndex);
    const actionPath = path.substring(separatorIndex + 3); // skip "/-/"
    const actionSegments = actionPath.split("/");
    const action = actionSegments[0];

    switch (action) {
      case "tree": {
        // /:project/-/tree/:ref[/:path]
        const refAndPath = actionSegments.slice(1).join("/");
        return {
          projectPath,
          ref: refAndPath || null, // Will be refined by DOM extraction
          pageType: PAGE_TYPES.TREE,
        };
      }

      case "blob": {
        // /:project/-/blob/:ref/:path
        const refAndPath = actionSegments.slice(1).join("/");
        return {
          projectPath,
          ref: refAndPath || null, // Will be refined by DOM extraction
          pageType: PAGE_TYPES.BLOB,
        };
      }

      case "commits": {
        // /:project/-/commits/:ref
        const ref = actionSegments.slice(1).join("/");
        return {
          projectPath,
          ref: ref || null,
          pageType: PAGE_TYPES.COMMITS,
        };
      }

      case "pipelines": {
        if (actionSegments.length > 1 && /^\d+$/.test(actionSegments[1])) {
          // /:project/-/pipelines/:id — pipeline detail
          return {
            projectPath,
            ref: null, // Must extract from DOM
            pageType: PAGE_TYPES.PIPELINE_DETAIL,
          };
        }
        // /:project/-/pipelines?ref=:ref — pipeline list
        const refParam = url.searchParams.get("ref");
        return {
          projectPath,
          ref: refParam || null,
          pageType: PAGE_TYPES.PIPELINES,
        };
      }

      case "tags": {
        // /:project/-/tags/:tag
        const tag = actionSegments.slice(1).join("/");
        return {
          projectPath,
          ref: tag || null,
          pageType: tag ? PAGE_TYPES.TAG_DETAIL : PAGE_TYPES.TAGS,
        };
      }

      case "merge_requests": {
        // /:project/-/merge_requests/:id
        return {
          projectPath,
          ref: null, // Must extract from DOM
          pageType: PAGE_TYPES.MERGE_REQUEST,
        };
      }

      default:
        return {
          projectPath,
          ref: null,
          pageType: PAGE_TYPES.UNKNOWN,
        };
    }
  }

  /**
   * Extract the ref from the DOM.
   * Used when the URL is ambiguous (slashes in branch names) or
   * when the ref isn't in the URL at all (pipeline detail, MR pages).
   *
   * @param {string} pageType - One of PAGE_TYPES
   * @returns {string|null}
   */
  function extractRefFromDOM(pageType) {
    switch (pageType) {
      case PAGE_TYPES.TREE:
      case PAGE_TYPES.BLOB:
        return extractRefFromBranchSelector();

      case PAGE_TYPES.PIPELINE_DETAIL:
        return extractRefFromPipelinePage();

      case PAGE_TYPES.MERGE_REQUEST:
        return extractRefFromMergeRequest();

      default:
        return null;
    }
  }

  /**
   * Extract ref from the branch/tag selector dropdown.
   * Works for tree and blob pages where the ref is displayed in a dropdown.
   */
  function extractRefFromBranchSelector() {
    // Try data-ref attribute on the branch selector
    const refEl = document.querySelector("[data-ref]");
    if (refEl) {
      const ref = refEl.getAttribute("data-ref");
      if (ref) return ref;
    }

    // Try the dropdown button text (newer GitLab versions)
    const dropdownBtn = document.querySelector(
      '[data-testid="branches-select"] button, .ref-selector .gl-button-text'
    );
    if (dropdownBtn) {
      const text = dropdownBtn.textContent?.trim();
      if (text) return text;
    }

    // Try the breadcrumb-style ref display
    const refBadge = document.querySelector(".breadcrumb .ref-name, .js-project-refs-dropdown");
    if (refBadge) {
      const text = refBadge.textContent?.trim();
      if (text) return text;
    }

    return null;
  }

  /**
   * Extract ref from a pipeline detail page.
   * The ref is shown as a badge or link on the pipeline page.
   */
  function extractRefFromPipelinePage() {
    // .ref-name badge on pipeline detail
    const refBadge = document.querySelector(
      '.ref-name, [data-testid="pipeline-ref-link"], .js-pipeline-ref'
    );
    if (refBadge) {
      const text = refBadge.textContent?.trim();
      if (text) return text;
    }

    // Pipeline header sometimes has a link to the branch
    const refLink = document.querySelector(
      'a[href*="/-/tree/"].ref-name, a[href*="/-/commits/"]'
    );
    if (refLink) {
      const text = refLink.textContent?.trim();
      if (text) return text;
    }

    return null;
  }

  /**
   * Extract source branch from a merge request page.
   */
  function extractRefFromMergeRequest() {
    // Strategy 1: Server-rendered checkout modal div (always present on MR pages)
    const checkoutModal = document.querySelector("#js-check-out-modal[data-source-branch]");
    if (checkoutModal) {
      const branch = checkoutModal.getAttribute("data-source-branch");
      if (branch) return branch;
    }

    // Strategy 2: Copy branch name button (actual class is js-source-branch-copy)
    const copyBtn = document.querySelector(".js-source-branch-copy[data-clipboard-text]");
    if (copyBtn) {
      const branch = copyBtn.getAttribute("data-clipboard-text");
      if (branch) return branch;
    }

    // Strategy 3: Server-rendered discussions div with JSON noteable data
    const discussionsEl = document.querySelector("#js-vue-mr-discussions[data-noteable-data]");
    if (discussionsEl) {
      try {
        const data = JSON.parse(discussionsEl.getAttribute("data-noteable-data"));
        if (data.source_branch) return data.source_branch;
      } catch {
        // JSON parse failed, continue to fallbacks
      }
    }

    // Fallback: Legacy selectors for self-hosted GitLab instances
    const sourceBranch = document.querySelector(
      '[data-testid="source-branch-name"], .mr-source-branch .ref-name'
    );
    if (sourceBranch) {
      const text = sourceBranch.textContent?.trim();
      if (text) return text;
    }

    return null;
  }

  /**
   * Detect if the current page is a GitLab instance.
   * @returns {boolean}
   */
  function isGitLabPage() {
    // Check meta tag
    const metaGenerator = document.querySelector('meta[name="description"][content*="GitLab"]');
    if (metaGenerator) return true;

    // Check for GitLab navbar
    if (document.querySelector(".navbar-gitlab, [data-testid='super-sidebar']")) return true;

    // Check for GitLab-specific meta content
    const metaContent = document.querySelector('meta[content="GitLab"]');
    if (metaContent) return true;

    // Check for GitLab favicon
    const favicon = document.querySelector('link[rel="icon"][href*="gitlab"]');
    if (favicon) return true;

    return false;
  }

  /**
   * Full extraction: parse URL, then refine with DOM if needed.
   * @param {string} urlString
   * @returns {{ projectPath: string|null, ref: string|null, pageType: string }}
   */
  function extract(urlString) {
    const result = parseURL(urlString);

    // For pages where DOM extraction is more reliable, try DOM first
    const domRef = extractRefFromDOM(result.pageType);
    if (domRef) {
      result.ref = domRef;
    }

    return result;
  }

  return {
    PAGE_TYPES,
    parseURL,
    extractRefFromDOM,
    isGitLabPage,
    extract,
  };
})();
