import { CONFIG } from "./config";

let cachedAnswer: string | null = null;
let cachedExplanation: string | null = null;
let typingIndex: number = 0;
let rightAltPressed: boolean = false;
let leftAltPressed: boolean = false;

class OverlayController {
  private static el: HTMLDivElement | null = null;

  static update(showLong: boolean = false) {
    if (window !== window.top) return;

    if (!this.el) {
      this.el = document.createElement("div");
      Object.assign(this.el.style, CONFIG.UI.OVERLAY);
      this.el.style.opacity = CONFIG.UI.OVERLAY.hiddenOpacity;
      // Give explanation view more text wrapping support
      this.el.style.maxWidth = "80vw";
      this.el.style.whiteSpace = "pre-wrap";
      if (document.body) document.body.appendChild(this.el);
    }
    if (this.el) {
      this.el.innerText = (showLong ? cachedExplanation : cachedAnswer) || "";
    }
  }

  static toggleVisibility(show: boolean, showLong: boolean = false) {
    if (window !== window.top) {
      window.parent.postMessage({ stealthToggle: true, show, showLong }, "*");
      return;
    }

    if (!this.el) return;
    this.update(showLong);

    const targetOpacity = show
      ? CONFIG.UI.OVERLAY.visibleOpacity
      : CONFIG.UI.OVERLAY.hiddenOpacity;
    if (show && this.el.style.opacity !== targetOpacity) {
      console.log(
        `[Stealth Ext] OVERLAY VISIBLE: opacity set to ${targetOpacity}!`,
      );
    }
    this.el.style.opacity = targetOpacity;
  }
}

function pollForAnswer() {
  if (cachedAnswer) return;
  chrome.runtime.sendMessage({ action: "getAnswer" }, (response) => {
    if (chrome.runtime.lastError) {
      // Background might be idle
    }

    if (response && response.answer) {
      console.log("[Stealth Ext/IFrame] Answer pulled from background!");
      cachedAnswer = response.answer;
      cachedExplanation = response.explanation;
      OverlayController.update(leftAltPressed);
    } else {
      setTimeout(pollForAnswer, CONFIG.TIMING.POLL_INTERVAL_MS);
    }
  });
}

function extractAndFetch() {
  const questionEl = document.querySelector(CONFIG.DOM.QUESTION_CONTAINER);
  if (!questionEl) {
    pollForAnswer();
    return;
  }

  const questionText = (questionEl as HTMLElement).innerText.trim();
  if (!questionText) return;

  let fullPrompt = questionText;
  const answersEls = document.querySelectorAll(
    CONFIG.DOM.MULTIPLE_CHOICE_ANSWER,
  );

  if (answersEls.length > 0) {
    fullPrompt += "\n\nAvailable Answers:\n";
    answersEls.forEach((el) => {
      fullPrompt += `- ${(el as HTMLElement).innerText.trim()}\n`;
    });
  }

  console.log("[Stealth Ext] Found question content:", fullPrompt);

  chrome.runtime.sendMessage(
    { action: "fetchAnswer", questionText: fullPrompt },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Stealth Ext] Failed to reach background script:",
          chrome.runtime.lastError,
        );
        setTimeout(pollForAnswer, CONFIG.TIMING.POLL_INTERVAL_MS);
        return;
      }

      if (response && response.answer) {
        console.log(
          "[Stealth Ext] Answer cached remotely via background script!",
        );
        cachedAnswer = response.answer;
        cachedExplanation = response.explanation;
        OverlayController.update(leftAltPressed);
      } else {
        pollForAnswer();
      }
    },
  );

  setTimeout(pollForAnswer, CONFIG.TIMING.INITIAL_POLL_DELAY_MS);
}

function insertCharacter(char: string) {
  const activeElement = document.activeElement as
    | HTMLElement
    | HTMLInputElement
    | HTMLTextAreaElement;
  if (!activeElement) return;

  if (
    "value" in activeElement &&
    (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
  ) {
    const el = activeElement as HTMLInputElement | HTMLTextAreaElement;
    if (
      document.execCommand &&
      document.execCommand("insertText", false, char)
    ) {
      // Executed seamlessly
    } else {
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = el.value;
      el.value = val.substring(0, start) + char + val.substring(end);
      el.selectionStart = el.selectionEnd = start + 1;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (
    activeElement.isContentEditable ||
    activeElement.tagName === "BODY" ||
    activeElement.tagName === "IFRAME"
  ) {
    if (activeElement.tagName === "IFRAME") {
      const iframe = activeElement as HTMLIFrameElement;
      if (iframe.contentDocument) {
        iframe.contentDocument.execCommand("insertText", false, char);
      }
    } else {
      document.execCommand("insertText", false, char);
    }
  }
}

function initKeyListeners() {
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.code === "AltLeft") leftAltPressed = true;
      if (e.code === CONFIG.KEYS.STEALTH_TYPING) {
        rightAltPressed = true;
        e.preventDefault();
      }

      const showOverlay = e.ctrlKey && e.shiftKey;
      OverlayController.toggleVisibility(showOverlay, leftAltPressed);
    },
    { capture: true, passive: false },
  );

  window.addEventListener(
    "keyup",
    (e: KeyboardEvent) => {
      if (e.code === "AltLeft") leftAltPressed = false;
      if (e.code === CONFIG.KEYS.STEALTH_TYPING) {
        rightAltPressed = false;
        e.preventDefault();
      }

      const showOverlay = e.ctrlKey && e.shiftKey;
      OverlayController.toggleVisibility(showOverlay, leftAltPressed);
    },
    { capture: true, passive: false },
  );

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (rightAltPressed) {
        if (e.key.length === 1) {
          e.preventDefault();
          e.stopPropagation();

          if (!cachedAnswer) {
            console.log("[Stealth Ext] Typing silenced (waiting for API...)");
            return;
          }

          if (typingIndex < cachedAnswer.length) {
            const charToType = cachedAnswer[typingIndex];
            console.log(
              `[Stealth Ext] Injecting: ${charToType} at index ${typingIndex}`,
            );
            insertCharacter(charToType);
            typingIndex++;
          } else {
            console.log("[Stealth Ext] Reached end of fetched answer.");
          }
        } else if (e.key === "Backspace") {
          typingIndex = Math.max(0, typingIndex - 1);
        }
      } else {
        if (e.key === "Backspace") {
          typingIndex = Math.max(0, typingIndex - 1);
        }
      }
    },
    { capture: true, passive: false },
  );
}

// Initialization
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", extractAndFetch);
} else {
  extractAndFetch();
}
initKeyListeners();

if (window === window.top) {
  window.addEventListener("message", (event) => {
    if (event.data && event.data.stealthToggle) {
      OverlayController.toggleVisibility(event.data.show, event.data.showLong);
    }
  });
}
