import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { MEDIA_HEARTBEAT_INTERVAL_MS } from "@/shared/constants";
import type { MessageRequest } from "@/shared/types";

const MEDIA_SELECTOR = "audio,video";
const REPORT_DEBOUNCE_MS = 150;

type PiPDocument = Document & {
  pictureInPictureElement?: Element | null;
  pictureInPictureEnabled?: boolean;
};
type MediaReportMessage = Extract<MessageRequest, { type: "REPORT_MEDIA_STATE" }>;

function hasPictureInPictureElement(): boolean {
  if ((document as PiPDocument).pictureInPictureElement) {
    return true;
  }

  try {
    return Boolean(document.querySelector("video:picture-in-picture"));
  } catch {
    return false;
  }
}

function isPictureInPictureSupported(): boolean {
  const selectorSupported =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("selector(:picture-in-picture)");

  return (
    "pictureInPictureElement" in document ||
    "pictureInPictureEnabled" in document ||
    "requestPictureInPicture" in HTMLVideoElement.prototype ||
    selectorSupported
  );
}

function isPlayingMedia(element: Element): boolean {
  if (!(element instanceof HTMLMediaElement)) {
    return false;
  }

  return !element.paused && !element.ended && element.readyState > HTMLMediaElement.HAVE_METADATA;
}

function getPlayingMediaElements(): HTMLMediaElement[] {
  return [...document.querySelectorAll(MEDIA_SELECTOR)].filter(
    (element): element is HTMLMediaElement =>
      element instanceof HTMLMediaElement && isPlayingMedia(element)
  );
}

function buildReport(): MediaReportMessage {
  const playingElements = getPlayingMediaElements();
  const playingAudio = playingElements.some((element) => element instanceof HTMLAudioElement);
  const playingVideo = playingElements.some((element) => element instanceof HTMLVideoElement);

  return {
    type: "REPORT_MEDIA_STATE",
    url: location.href,
    playing: playingElements.length > 0,
    playingAudio,
    playingVideo,
    pictureInPicture: hasPictureInPictureElement(),
    pictureInPictureSupported: isPictureInPictureSupported(),
    reportedAt: Date.now()
  };
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    let debounceId: number | null = null;
    let heartbeatId: number | null = null;

    function setHeartbeat(active: boolean): void {
      if (active && heartbeatId === null) {
        heartbeatId = window.setInterval(sendReport, MEDIA_HEARTBEAT_INTERVAL_MS);
        return;
      }

      if (!active && heartbeatId !== null) {
        window.clearInterval(heartbeatId);
        heartbeatId = null;
      }
    }

    function sendReport(): void {
      const report = buildReport();
      setHeartbeat(report.playing || report.pictureInPicture);
      browser.runtime.sendMessage(report).catch(() => {
        // The background may be unavailable during reloads; the next media event will report again.
      });
    }

    function scheduleReport(): void {
      if (debounceId !== null) {
        window.clearTimeout(debounceId);
      }

      debounceId = window.setTimeout(() => {
        debounceId = null;
        sendReport();
      }, REPORT_DEBOUNCE_MS);
    }

    function addMediaListeners(element: Element): void {
      if (!(element instanceof HTMLMediaElement)) {
        return;
      }

      for (const eventName of [
        "play",
        "playing",
        "pause",
        "ended",
        "emptied",
        "stalled",
        "suspend",
        "volumechange",
        "ratechange",
        "enterpictureinpicture",
        "leavepictureinpicture"
      ]) {
        element.addEventListener(eventName, scheduleReport, { passive: true });
      }
    }

    document.querySelectorAll(MEDIA_SELECTOR).forEach(addMediaListeners);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches(MEDIA_SELECTOR)) {
            addMediaListeners(node);
          }

          node.querySelectorAll(MEDIA_SELECTOR).forEach(addMediaListeners);
        }
      }

      scheduleReport();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    document.addEventListener("visibilitychange", scheduleReport, { passive: true });
    window.addEventListener("pagehide", () => {
      setHeartbeat(false);
      browser.runtime
        .sendMessage({
          type: "REPORT_MEDIA_STATE",
          url: location.href,
          playing: false,
          playingAudio: false,
          playingVideo: false,
          pictureInPicture: false,
          pictureInPictureSupported: isPictureInPictureSupported(),
          reportedAt: Date.now()
        } satisfies MessageRequest)
        .catch(() => undefined);
    });

    scheduleReport();
  }
});
