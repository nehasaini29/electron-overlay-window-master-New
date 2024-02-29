"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverlayController = exports.OVERLAY_WINDOW_OPTS = void 0;
const node_events_1 = require("node:events");
const node_path_1 = require("node:path");
const throttle_debounce_1 = require("throttle-debounce");
const electron_1 = require("electron");
const electron_2 = require("electron");
const lib = require("node-gyp-build")((0, node_path_1.join)(__dirname, ".."));
var EventType;
(function (EventType) {
  EventType[(EventType["EVENT_ATTACH"] = 1)] = "EVENT_ATTACH";
  EventType[(EventType["EVENT_FOCUS"] = 2)] = "EVENT_FOCUS";
  EventType[(EventType["EVENT_BLUR"] = 3)] = "EVENT_BLUR";
  EventType[(EventType["EVENT_DETACH"] = 4)] = "EVENT_DETACH";
  EventType[(EventType["EVENT_FULLSCREEN"] = 5)] = "EVENT_FULLSCREEN";
  EventType[(EventType["EVENT_MOVERESIZE"] = 6)] = "EVENT_MOVERESIZE";
})(EventType || (EventType = {}));
const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
exports.OVERLAY_WINDOW_OPTS = {
  fullscreenable: true,
  skipTaskbar: !isLinux,
  frame: false,
  show: false,
  transparent: true,
  // let Chromium to accept any size changes from OS
  resizable: true,
  // disable shadow for Mac OS
  hasShadow: !isMac,
  // float above all windows on Mac OS
  alwaysOnTop: isMac,
};
class OverlayControllerGlobal {
  constructor() {
    this.isInitialized = false;
    // Exposed so that apps can get the current bounds of the target
    // NOTE: stores screen physical rect on Windows
    this.targetBounds = { x: 0, y: 0, width: 0, height: 0 };
    this.targetHasFocus = false;
    // The height of a title bar on a standard window. Only measured on Mac
    this.macTitleBarHeight = 0;
    this.attachOptions = {};
    this.events = new node_events_1.EventEmitter();
    this.events.on("attach", (e) => {
      console.log("attach ===>", e);
      // this.targetHasFocus = true;
      // if (this.electronWindow) {
      //   this.electronWindow.setIgnoreMouseEvents(true);
      //   this.electronWindow.showInactive();
      //   this.electronWindow.setAlwaysOnTop(true, "screen-saver");
      // }
      // if (e.isFullscreen !== undefined) {
      //   this.handleFullscreen(e.isFullscreen);
      // }
      // this.targetBounds = e;
      // this.updateOverlayBounds();
    });
    this.events.on("fullscreen", (e) => {
      this.handleFullscreen(e.isFullscreen);
    });
    this.events.on("detach", () => {
      console.log("detach");
      var _a;
      this.targetHasFocus = false;
      (_a = this.electronWindow) === null || _a === void 0 ? void 0 : _a.hide();
    });
    const dispatchMoveresize = (0, throttle_debounce_1.throttle)(
      34 /* 30fps */,
      this.updateOverlayBounds.bind(this)
    );
    this.events.on("moveresize", (e) => {
      this.targetBounds = e;
      dispatchMoveresize();
    });
    this.events.on("blur", () => {
      console.log("blur");
      // this.targetHasFocus = false;
      // if (
      //   this.electronWindow &&
      //   (isMac ||
      //     (this.focusNext !== "overlay" && !this.electronWindow.isFocused()))
      // ) {
      //   this.electronWindow.hide();
      // }
    });
    this.events.on("focus", () => {
      console.log("focus");
      // this.focusNext = undefined;
      // this.targetHasFocus = true;
      // if (this.electronWindow) {
      //   this.electronWindow.setIgnoreMouseEvents(true);
      //   if (!this.electronWindow.isVisible()) {
      //     this.electronWindow.showInactive();
      //     this.electronWindow.setAlwaysOnTop(true, "screen-saver");
      //   }
      // }
    });
  }
  async handleFullscreen(isFullscreen) {
    if (!this.electronWindow) return;
    if (isMac) {
      // On Mac, only a single app can be fullscreen, so we can't go
      // fullscreen. We get around it by making it display on all workspaces,
      // based on code from:
      // https://github.com/electron/electron/issues/10078#issuecomment-754105005
      this.electronWindow.setVisibleOnAllWorkspaces(isFullscreen, {
        visibleOnFullScreen: true,
      });
      if (isFullscreen) {
        const display = electron_1.screen.getPrimaryDisplay();
        this.electronWindow.setBounds(display.bounds);
      } else {
        // Set it back to `lastBounds` as set before fullscreen
        this.updateOverlayBounds();
      }
    } else {
      this.electronWindow.setFullScreen(isFullscreen);
    }
  }
  updateOverlayBounds() {
    let lastBounds = this.adjustBoundsForMacTitleBar(this.targetBounds);
    if (lastBounds.width === 0 || lastBounds.height === 0) return;
    if (!this.electronWindow) return;
    if (process.platform === "win32") {
      lastBounds = electron_1.screen.screenToDipRect(
        this.electronWindow,
        this.targetBounds
      );
    }
    this.electronWindow.setBounds(lastBounds);
    // if moved to screen with different DPI, 2nd call to setBounds will correctly resize window
    // dipRect must be recalculated as well
    if (process.platform === "win32") {
      lastBounds = electron_1.screen.screenToDipRect(
        this.electronWindow,
        this.targetBounds
      );
      this.electronWindow.setBounds(lastBounds);
    }
  }
  handler(e) {
    console.log("handler", e);
    switch (e.type) {
      case EventType.EVENT_ATTACH:
        this.events.emit("attach", e);
        break;
      case EventType.EVENT_FOCUS:
        this.events.emit("focus", e);
        break;
      case EventType.EVENT_BLUR:
        this.events.emit("blur", e);
        break;
      case EventType.EVENT_DETACH:
        this.events.emit("detach", e);
        break;
      case EventType.EVENT_FULLSCREEN:
        this.events.emit("fullscreen", e);
        break;
      case EventType.EVENT_MOVERESIZE:
        this.events.emit("moveresize", e);
        break;
    }
  }
  /**
   * Create a dummy window to calculate the title bar height on Mac. We use
   * the title bar height to adjust the size of the overlay to not overlap
   * the title bar. This helps Mac match the behaviour on Windows/Linux.
   */
  calculateMacTitleBarHeight() {
    const testWindow = new electron_2.BrowserWindow({
      width: 400,
      height: 300,
      webPreferences: {
        nodeIntegration: true,
      },
      show: false,
    });
    const fullHeight = testWindow.getSize()[1];
    const contentHeight = testWindow.getContentSize()[1];
    this.macTitleBarHeight = fullHeight - contentHeight;
    testWindow.close();
  }
  /** If we're on a Mac, adjust the bounds to not overlap the title bar */
  adjustBoundsForMacTitleBar(bounds) {
    if (!isMac || !this.attachOptions.hasTitleBarOnMac) {
      return bounds;
    }
    const newBounds = {
      ...bounds,
      y: bounds.y + this.macTitleBarHeight,
      height: bounds.height - this.macTitleBarHeight,
    };
    return newBounds;
  }
  activateOverlay() {
    console.log("activateOverlay");
    if (!this.electronWindow) {
      throw new Error("You are using the library in tracking mode");
    }
    this.focusNext = "overlay";
    this.electronWindow.setIgnoreMouseEvents(false);
    this.electronWindow.focus();

    // this.focusNext = undefined;
    // this.targetHasFocus = true;
    // if (this.electronWindow) {
    //   this.electronWindow.setIgnoreMouseEvents(true);
    //   if (!this.electronWindow.isVisible()) {
    //     this.electronWindow.showInactive();
    //     this.electronWindow.setAlwaysOnTop(true, "screen-saver");
    //   }
    // }
  }
  focusTarget() {
    console.log("focusTarget");
    var _a;
    this.focusNext = "target";
    (_a = this.electronWindow) === null || _a === void 0
      ? void 0
      : _a.setIgnoreMouseEvents(true);
    lib.focusTarget();
    this.attachWindow();
    this.startDraw();
  }
  attachByTitle(electronWindow, targetWindowTitle, options = {}) {
    var _a, _b, _c;
    // if (this.isInitialized) {
    //   throw new Error("Library can be initialized only once.");
    // } else {
    //   this.isInitialized = true;
    // }
    this.electronWindow = electronWindow;
    (_a = this.electronWindow) === null || _a === void 0
      ? void 0
      : _a.on("blur", () => {
          console.log("electronWindow blur");
          if (!this.targetHasFocus && this.focusNext !== "target") {
            console.log("electronWindow blur if enter");
            this.electronWindow.hide();
          }
        });
    (_b = this.electronWindow) === null || _b === void 0
      ? void 0
      : _b.on("focus", () => {
          console.log("electronWindow focus");
          this.focusNext = undefined;
        });
    this.attachOptions = options;
    if (isMac) {
      this.calculateMacTitleBarHeight();
    }
    lib.start(
      (_c = this.electronWindow) === null || _c === void 0
        ? void 0
        : _c.getNativeWindowHandle(),
      targetWindowTitle,
      this.handler.bind(this)
    );
  }
  // buffer suitable for use in `nativeImage.createFromBitmap`
  screenshot() {
    if (process.platform !== "win32") {
      throw new Error("Not implemented on your platform.");
    }
    return lib.screenshot();
  }

  startDraw() {
    this.focusNext = undefined;
    this.targetHasFocus = true;
    console.log("startdraw", this.electronWindow);
    console.log(
      "this.electronWindow.isVisible()",
      this.electronWindow.isVisible()
    );
    if (this.electronWindow) {
      this.electronWindow.setIgnoreMouseEvents(true);
      // if (!this.electronWindow.isVisible()) {
      //   this.electronWindow.showInactive();
      //   this.electronWindow.setAlwaysOnTop(true, "screen-saver");
      // }
    }
  }

  endDraw() {
    this.targetHasFocus = false;
    console.log("endDraw", this.electronWindow);
    if (
      this.electronWindow &&
      (isMac ||
        (this.focusNext !== "overlay" && !this.electronWindow.isFocused()))
    ) {
      this.electronWindow.hide();
    }
  }

  attachWindow() {
    console.log("attachWindow", this.electronWindow);
    this.targetHasFocus = true;
    if (this.electronWindow) {
      this.electronWindow.setIgnoreMouseEvents(true);
      this.electronWindow.showInactive();
      this.electronWindow.setAlwaysOnTop(true, "screen-saver");
    }
    // if (e.isFullscreen !== undefined) {
    //   this.handleFullscreen(e.isFullscreen);
    // }
    // this.targetBounds = e;
    this.updateOverlayBounds();
  }
}
exports.OverlayController = new OverlayControllerGlobal();
//# sourceMappingURL=index.js.map
