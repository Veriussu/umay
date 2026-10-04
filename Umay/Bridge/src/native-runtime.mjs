import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  SESSION_X11,
  desktopControlAvailability,
  detectSessionType,
} from "./session-detect.mjs";

const MAX_OUTPUT_CHARS = 12000;
const MAX_FILE_READ_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 30000;

export function nativeCapabilityReport(
  currentPlatform = platform(),
  commandAvailable = hasCommand,
  sessionType = detectSessionType()
) {
  const clipboard = clipboardAdapter(currentPlatform, commandAvailable);
  const screen = screenCaptureAdapter(currentPlatform, commandAvailable, "__probe__.png", sessionType);
  const mouse = mouseAdapter(currentPlatform, commandAvailable, 0, 0, sessionType);
  const keyboard = keyboardAdapter(currentPlatform, commandAvailable, "", sessionType);

  // Oturum tespiti basarisizsa fare/klavye KESINLIKLE "calisiyor"
  // bildirilmez.
  //
  // OLCUM (2026-10-04): konsolda (DISPLAY ve WAYLAND_DISPLAY yok)
  // calisan Bridge `available: true` bildiriyordu. Sonuc: Umay
  // fareyi oynatmak ister, Bridge "oldu" der, hicbiri olmaz. Bu,
  // donanim tarafindaki sessiz basarisizlik; en kotu hâli.
  const desktopControl =
    currentPlatform === "linux" ? desktopControlAvailability(sessionType, commandAvailable) : null;
  const desktopBlocked = Boolean(desktopControl && !desktopControl.available);

  return {
    platform: normalizePlatform(currentPlatform),
    // Oturum tipi backend'e bildirilir: "bu cihazda fare var mi"
    // sorusu "hangi arac kurulu" degil, "oturum ne" sorusudur.
    session: {
      type: sessionType,
      ...(desktopControl
        ? {
            display_server: desktopControl.family,
            reason: desktopControl.reason ?? null,
            detail: desktopControl.detail ?? null,
          }
        : {}),
    },
    realtime: true,
    command_queue: true,
    actions: {
      terminal_run: { available: true, mode: "argv", shell: false },
      process_start: { available: true, mode: "detached", shell: false },
      file_read: { available: true, max_bytes: MAX_FILE_READ_BYTES },
      file_write: { available: true },
      clipboard_write: clipboard
        ? { available: true, adapter: clipboard.name }
        : { available: false, reason: "clipboard_adapter_not_available" },
      mouse_click: desktopBlocked
        ? {
            available: false,
            reason: desktopControl.reason,
            detail: desktopControl.detail,
          }
        : mouse
          ? { available: true, adapter: mouse.name }
          : { available: false, reason: "mouse_input_adapter_not_available" },
      keyboard_type: desktopBlocked
        ? {
            available: false,
            reason: desktopControl.reason,
            detail: desktopControl.detail,
          }
        : keyboard
          ? { available: true, adapter: keyboard.name }
          : { available: false, reason: "keyboard_input_adapter_not_available" },
      screen_observe: screen
        ? { available: true, adapter: screen.name, mime_type: "image/png" }
        : { available: false, reason: "screen_capture_adapter_not_available" }
    }
  };
}

export async function handleNativeCommand({ command }) {
  if (command.command_type !== "computer.native_action") {
    return null;
  }
  const action = command.payload?.action || {};
  if (action.kind === "terminal_run") return runTerminalAction(command);
  if (action.kind === "process_start") return startProcessAction(command);
  if (action.kind === "file_read") return readFileAction(command);
  if (action.kind === "file_write") return writeFileAction(command);
  if (action.kind === "clipboard_write") return clipboardWriteAction(command);
  if (action.kind === "screen_observe") return screenObserveAction(command);
  if (action.kind === "mouse_click") return mouseClickAction(command);
  if (action.kind === "keyboard_type") return keyboardTypeAction(command);
  throw new Error(`Native action is not implemented by this Bridge yet: ${action.kind}`);
}

async function runTerminalAction(command) {
  const action = command.payload?.action || {};
  const argv = command.payload?.decision?.normalized?.command || action.command;
  assertSafeArgv(argv, "terminal_run");

  const startedAt = new Date().toISOString();
  const result = await execFileCapture(argv, Number(action.timeout_ms || DEFAULT_TIMEOUT_MS));
  return {
    kind: "terminal_run",
    command: argv,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ...result
  };
}

async function startProcessAction(command) {
  const action = command.payload?.action || {};
  const argv = command.payload?.decision?.normalized?.command || action.command;
  assertSafeArgv(argv, "process_start");
  const child = spawn(argv[0], argv.slice(1), {
    detached: true,
    stdio: "ignore",
    shell: false
  });
  child.unref();
  return {
    kind: "process_start",
    command: argv,
    pid: child.pid,
    started_at: new Date().toISOString()
  };
}

async function readFileAction(command) {
  const path = command.payload?.decision?.normalized?.path || command.payload?.action?.file_path;
  if (!path) throw new Error("file_read requires normalized path.");
  const data = await readFile(path);
  const truncated = data.length > MAX_FILE_READ_BYTES;
  const content = truncated ? data.subarray(0, MAX_FILE_READ_BYTES) : data;
  return {
    kind: "file_read",
    path,
    byte_size: data.length,
    truncated,
    content_utf8: content.toString("utf8")
  };
}

async function writeFileAction(command) {
  const path = command.payload?.decision?.normalized?.path || command.payload?.action?.file_path;
  const hex = command.payload?.action?.content_hex || "";
  if (!path) throw new Error("file_write requires normalized path.");
  const content = Buffer.from(hex, "hex");
  await writeFile(path, content);
  return {
    kind: "file_write",
    path,
    byte_size: content.length,
    written_at: new Date().toISOString()
  };
}

async function clipboardWriteAction(command) {
  const action = command.payload?.action || {};
  if (typeof action.text !== "string") {
    throw new Error("clipboard_write requires text.");
  }
  const adapter = clipboardAdapter(platform(), hasCommand);
  if (!adapter) {
    throw new Error("clipboard_adapter_not_available");
  }
  await spawnWithInput(adapter.argv, action.text, "clipboard_write");
  return {
    kind: "clipboard_write",
    adapter: adapter.name,
    text_length: action.text.length,
    written_at: new Date().toISOString()
  };
}

async function screenObserveAction() {
  const outputPath = join(tmpdir(), `umay-screen-${randomUUID()}.png`);
  const adapter = screenCaptureAdapter(platform(), hasCommand, outputPath);
  if (!adapter) {
    throw new Error("screen_capture_adapter_not_available");
  }
  await spawnCollect(adapter.argv, "screen_observe");
  try {
    const image = await readFile(outputPath);
    return {
      kind: "screen_observe",
      adapter: adapter.name,
      mime_type: "image/png",
      byte_size: image.length,
      image_base64: image.toString("base64"),
      captured_at: new Date().toISOString()
    };
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

async function mouseClickAction(command) {
  const action = command.payload?.action || {};
  const normalized = command.payload?.decision?.normalized || {};
  const x = Number(normalized.x ?? action.x);
  const y = Number(normalized.y ?? action.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("mouse_click requires x/y coordinates.");
  }
  const adapter = mouseAdapter(platform(), hasCommand, Math.trunc(x), Math.trunc(y));
  if (!adapter) {
    throw new Error("mouse_input_adapter_not_available");
  }
  await spawnCollect(adapter.argv, "mouse_click");
  return {
    kind: "mouse_click",
    adapter: adapter.name,
    x: Math.trunc(x),
    y: Math.trunc(y),
    clicked_at: new Date().toISOString()
  };
}

async function keyboardTypeAction(command) {
  const action = command.payload?.action || {};
  if (typeof action.text !== "string") {
    throw new Error("keyboard_type requires text.");
  }
  const adapter = keyboardAdapter(platform(), hasCommand, action.text);
  if (!adapter) {
    throw new Error("keyboard_input_adapter_not_available");
  }
  await spawnCollect(adapter.argv, "keyboard_type");
  return {
    kind: "keyboard_type",
    adapter: adapter.name,
    text_length: action.text.length,
    typed_at: new Date().toISOString()
  };
}

function assertSafeArgv(argv, actionName) {
  if (!Array.isArray(argv) || argv.length === 0 || typeof argv[0] !== "string") {
    throw new Error(`${actionName} requires command argv.`);
  }
  if (argv.some((part) => typeof part !== "string" || hasShellOperator(part))) {
    throw new Error(`${actionName} argv contains unsafe shell operator.`);
  }
}

function hasShellOperator(value) {
  return [";", "&&", "||", "`", "$("].some((token) => value.includes(token));
}

function trimOutput(value) {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n[trimmed]`;
}

function normalizePlatform(value) {
  if (value === "darwin") return "macos";
  if (value === "win32") return "windows";
  return value;
}

function clipboardAdapter(currentPlatform, commandAvailable = hasCommand) {
  if (currentPlatform === "darwin" && commandAvailable("pbcopy")) {
    return { name: "pbcopy", argv: ["pbcopy"] };
  }
  if (currentPlatform === "win32") {
    const exe = commandAvailable("powershell.exe")
      ? "powershell.exe"
      : commandAvailable("powershell")
        ? "powershell"
        : null;
    if (exe) {
      return {
        name: "powershell-set-clipboard",
        argv: [exe, "-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"]
      };
    }
  }
  if (currentPlatform === "linux") {
    if (commandAvailable("wl-copy")) return { name: "wl-copy", argv: ["wl-copy"] };
    if (commandAvailable("xclip")) return { name: "xclip", argv: ["xclip", "-selection", "clipboard"] };
    if (commandAvailable("xsel")) return { name: "xsel", argv: ["xsel", "--clipboard", "--input"] };
  }
  return null;
}

function screenCaptureAdapter(currentPlatform, commandAvailable = hasCommand, outputPath, sessionType = detectSessionType()) {
  if (currentPlatform === "darwin" && commandAvailable("screencapture")) {
    return { name: "screencapture", argv: ["screencapture", "-x", "-t", "png", outputPath] };
  }
  if (currentPlatform === "win32") {
    const exe = commandAvailable("powershell.exe")
      ? "powershell.exe"
      : commandAvailable("powershell")
        ? "powershell"
        : null;
    if (exe) {
      return {
        name: "powershell-bitmap",
        argv: [
          exe,
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          windowsScreenshotScript(outputPath)
        ]
      };
    }
  }
  if (currentPlatform === "linux") {
    // Oturum tipine gore siralama - bkz. `keyboardAdapter`.
    //
    // `grim` YALNIZCA wlroots (Sway) uzerinde calisir; GNOME'da
    // calismaz. GNOME'da `gnome-screenshot` önce gelir.
    if (sessionType === SESSION_X11) {
      if (commandAvailable("scrot")) return { name: "scrot", argv: ["scrot", outputPath] };
      if (commandAvailable("import")) return { name: "imagemagick-import", argv: ["import", "-window", "root", outputPath] };
      if (commandAvailable("gnome-screenshot")) return { name: "gnome-screenshot", argv: ["gnome-screenshot", "-f", outputPath] };
      return null;
    }
    if (commandAvailable("gnome-screenshot")) return { name: "gnome-screenshot", argv: ["gnome-screenshot", "-f", outputPath] };
    if (commandAvailable("grim")) return { name: "grim", argv: ["grim", outputPath] };
    if (commandAvailable("spectacle")) return { name: "spectacle", argv: ["spectacle", "-b", "-n", "-o", outputPath] };
    if (commandAvailable("scrot")) return { name: "scrot", argv: ["scrot", outputPath] };
    if (commandAvailable("import")) return { name: "imagemagick-import", argv: ["import", "-window", "root", outputPath] };
  }
  return null;
}

function mouseAdapter(currentPlatform, commandAvailable = hasCommand, x = 0, y = 0, sessionType = detectSessionType()) {
  if (currentPlatform === "darwin" && commandAvailable("cliclick")) {
    return { name: "cliclick", argv: ["cliclick", `c:${x},${y}`] };
  }
  if (currentPlatform === "win32") {
    const exe = commandAvailable("powershell.exe")
      ? "powershell.exe"
      : commandAvailable("powershell")
        ? "powershell"
        : null;
    if (exe) {
      return {
        name: "powershell-user32-mouse",
        argv: [exe, "-NoProfile", "-NonInteractive", "-Command", windowsMouseClickScript(x, y)]
      };
    }
  }
  if (currentPlatform === "linux") {
    // Oturum tipine gore siralama - bkz. `keyboardAdapter`.
    //
    // OLCUM (2026-10-04): bu kosulsuz `xdotool` deniyordu. Wayland
    // oturumunda (KDE Neon, Fedora 34+) `xdotool` sessizce basarisiz
    // olur ve Bridge yine `available: true` bildirirdi.
    if (sessionType === SESSION_X11) {
      if (commandAvailable("xdotool")) {
        return { name: "xdotool", argv: ["xdotool", "mousemove", String(x), String(y), "click", "1"] };
      }
      return null;
    }
    if (commandAvailable("wtype") || commandAvailable("dotool") || commandAvailable("ydotool")) {
      // Bu araclar yalnizca uygulama odakli (yinput) girdi verir;
      // portal izni gerekir. Argv yok: calistirma yolu ayri ele
      // alinir, uretim aninda belirlenir.
      return { name: "wayland-input", argv: [], needsPortal: true };
    }
    if (commandAvailable("xdotool")) {
      return { name: "xdotool", argv: ["xdotool", "mousemove", String(x), String(y), "click", "1"] };
    }
    return null;
  }
  return null;
}

function keyboardAdapter(currentPlatform, commandAvailable = hasCommand, text = "", sessionType = detectSessionType()) {
  if (currentPlatform === "darwin" && commandAvailable("osascript")) {
    return {
      name: "osascript-system-events",
      argv: ["osascript", "-e", `tell application "System Events" to keystroke ${appleScriptString(text)}`]
    };
  }
  if (currentPlatform === "win32") {
    const exe = commandAvailable("powershell.exe")
      ? "powershell.exe"
      : commandAvailable("powershell")
        ? "powershell"
        : null;
    if (exe) {
      return {
        name: "powershell-sendkeys",
        argv: [exe, "-NoProfile", "-NonInteractive", "-Command", windowsSendKeysScript(text)]
      };
    }
  }
  if (currentPlatform === "linux") {
    // SIRALAMA OTURUM TİPİNE BAĞLI (Faz 1, 2026-10-04)
    //
    // Ölçüm: bu fonksiyon Wayland'ta `xdotool`'u ÖNCE deniyordu.
    // `xdotool` X11'e bağlıdır; Wayland oturumunda (KDE Neon,
    // Fedora 34+) sessizce başarısız olur ve Bridge yine
    // `available: true` bildirirdi. Artık `wtype` önce geliyor.
    if (sessionType === SESSION_X11) {
      if (commandAvailable("xdotool")) {
        return { name: "xdotool", argv: ["xdotool", "type", "--clearmodifiers", "--", text] };
      }
      if (commandAvailable("wtype")) return { name: "wtype", argv: ["wtype", text] };
      return null;
    }
    // Wayland veya BİLİNMİYEN: Wayland aracı tercih edilir.
    if (commandAvailable("wtype")) return { name: "wtype", argv: ["wtype", text] };
    if (commandAvailable("xdotool")) {
      return { name: "xdotool", argv: ["xdotool", "type", "--clearmodifiers", "--", text] };
    }
    return null;
  }
  return null;
}

function windowsMouseClickScript(x, y) {
  const px = Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
  const py = Number.isFinite(Number(y)) ? Math.trunc(Number(y)) : 0;
  return [
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class U { [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y); [DllImport(\"user32.dll\")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra); }';",
    `[U]::SetCursorPos(${px},${py});`,
    "[U]::mouse_event(0x0002,0,0,0,0);",
    "[U]::mouse_event(0x0004,0,0,0,0);"
  ].join("");
}

function windowsSendKeysScript(text) {
  return [
    "Add-Type -AssemblyName System.Windows.Forms;",
    `[System.Windows.Forms.SendKeys]::SendWait(${powershellSingleQuoted(text)})`
  ].join("");
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function powershellSingleQuoted(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function windowsScreenshotScript(outputPath) {
  const escaped = outputPath.replace(/'/g, "''");
  return [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "Add-Type -AssemblyName System.Drawing;",
    "$bounds=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;",
    "$bmp=New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height;",
    "$graphics=[System.Drawing.Graphics]::FromImage($bmp);",
    "$graphics.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size);",
    `$bmp.Save('${escaped}',[System.Drawing.Imaging.ImageFormat]::Png);`,
    "$graphics.Dispose();",
    "$bmp.Dispose();"
  ].join("");
}

function hasCommand(name) {
  const paths = String(process.env.PATH || "").split(delimiter).filter(Boolean);
  const extensions = platform() === "win32"
    ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const base of paths) {
    for (const ext of extensions) {
      const candidate = join(base, platform() === "win32" && !name.toLowerCase().endsWith(ext.toLowerCase()) ? `${name}${ext}` : name);
      try {
        accessSync(candidate, constants.X_OK);
        return true;
      } catch {
        // continue probing PATH
      }
    }
  }
  return false;
}

function spawnWithInput(argv, input, actionName) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      shell: false,
      stdio: ["pipe", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${actionName} failed exit=${code}${stderr ? `: ${stderr}` : ""}`));
    });
    child.stdin.end(input, "utf8");
  });
}

function spawnCollect(argv, actionName) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${actionName} failed exit=${code}${stderr ? `: ${stderr}` : ""}`));
    });
  });
}

function execFileCapture(argv, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, Math.max(1000, timeoutMs));

    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        exit_code: null,
        timed_out: timedOut,
        stdout,
        stderr: trimOutput(`${stderr}${stderr ? "\n" : ""}${error.message}`)
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        exit_code: code,
        signal,
        timed_out: timedOut,
        stdout,
        stderr
      });
    });
  });
}
