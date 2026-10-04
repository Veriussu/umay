import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handleNativeCommand, nativeCapabilityReport } from "../src/native-runtime.mjs";

test("native runtime executes terminal_run without shell", async () => {
  const result = await handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: {
        action: {
          kind: "terminal_run",
          command: [process.execPath, "--version"]
        }
      }
    }
  });

  assert.equal(result.kind, "terminal_run");
  assert.equal(result.exit_code, 0);
  assert.equal(result.command[0], process.execPath);
  assert.match(result.stdout, /^v\d+\./);
});

test("native runtime rejects unsupported action and shell operators", async () => {
  await assert.rejects(
    () => handleNativeCommand({
      command: {
        command_type: "computer.native_action",
        payload: { action: { kind: "touch_tap", x: 1, y: 1 } }
      }
    }),
    /not implemented/
  );

  await assert.rejects(
    () => handleNativeCommand({
      command: {
        command_type: "computer.native_action",
        payload: {
          action: {
            kind: "terminal_run",
            command: [process.execPath, "-e", "console.log(1); process.exit(0)"]
          }
        }
      }
    }),
    /unsafe shell operator/
  );
});

test("native runtime reads and writes scoped files using normalized decision paths", async () => {
  const dir = mkdtempSync(join(tmpdir(), "umay-native-files-"));
  const target = join(dir, "note.txt");

  const writeResult = await handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: {
        decision: { normalized: { path: target } },
        action: {
          kind: "file_write",
          file_path: "/ignored/by/bridge/policy",
          content_hex: Buffer.from("merhaba", "utf8").toString("hex")
        }
      }
    }
  });
  assert.equal(writeResult.kind, "file_write");
  assert.equal(readFileSync(target, "utf8"), "merhaba");

  writeFileSync(target, "okundu");
  const readResult = await handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: {
        decision: { normalized: { path: target } },
        action: { kind: "file_read", file_path: "/ignored/by/bridge/policy" }
      }
    }
  });
  assert.equal(readResult.kind, "file_read");
  assert.equal(readResult.content_utf8, "okundu");
  assert.equal(readResult.truncated, false);
});

test("native runtime starts detached process and reports cross-platform capabilities", async () => {
  const result = await handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: {
        decision: { normalized: { command: [process.execPath, "--version"] } },
        action: {
          kind: "process_start",
          command: ["ignored"]
        }
      }
    }
  });
  assert.equal(result.kind, "process_start");
  assert.equal(typeof result.pid, "number");

  assert.equal(nativeCapabilityReport("darwin").platform, "macos");
  assert.equal(nativeCapabilityReport("win32").platform, "windows");
  assert.equal(nativeCapabilityReport("linux").actions.file_read.available, true);
  assert.equal(nativeCapabilityReport("linux").actions.mouse_click.available, false);
});

test("native capability report detects clipboard adapters per platform", () => {
  const only = (...names) => (name) => names.includes(name);

  assert.equal(nativeCapabilityReport("darwin", only("pbcopy")).actions.clipboard_write.adapter, "pbcopy");
  assert.equal(
    nativeCapabilityReport("win32", only("powershell.exe")).actions.clipboard_write.adapter,
    "powershell-set-clipboard"
  );
  assert.equal(nativeCapabilityReport("linux", only("wl-copy")).actions.clipboard_write.adapter, "wl-copy");
  assert.equal(nativeCapabilityReport("linux", only("xclip")).actions.clipboard_write.adapter, "xclip");
  assert.equal(nativeCapabilityReport("linux", only()).actions.clipboard_write.available, false);
  assert.equal(
    nativeCapabilityReport("linux", only()).actions.clipboard_write.reason,
    "clipboard_adapter_not_available"
  );
});

test("native capability report detects screen capture adapters per platform", () => {
  const only = (...names) => (name) => names.includes(name);

  assert.equal(nativeCapabilityReport("darwin", only("screencapture")).actions.screen_observe.adapter, "screencapture");
  assert.equal(nativeCapabilityReport("win32", only("powershell.exe")).actions.screen_observe.adapter, "powershell-bitmap");
  assert.equal(nativeCapabilityReport("linux", only("grim")).actions.screen_observe.adapter, "grim");
  assert.equal(nativeCapabilityReport("linux", only("gnome-screenshot")).actions.screen_observe.adapter, "gnome-screenshot");
  assert.equal(nativeCapabilityReport("linux", only("scrot")).actions.screen_observe.adapter, "scrot");
  assert.equal(nativeCapabilityReport("linux", only()).actions.screen_observe.available, false);
  assert.equal(
    nativeCapabilityReport("linux", only()).actions.screen_observe.reason,
    "screen_capture_adapter_not_available"
  );
});

test("native capability report detects mouse and keyboard adapters per platform", () => {
  const only = (...names) => (name) => names.includes(name);

  assert.equal(nativeCapabilityReport("darwin", only("cliclick", "osascript")).actions.mouse_click.adapter, "cliclick");
  assert.equal(
    nativeCapabilityReport("darwin", only("cliclick", "osascript")).actions.keyboard_type.adapter,
    "osascript-system-events"
  );
  assert.equal(nativeCapabilityReport("win32", only("powershell.exe")).actions.mouse_click.adapter, "powershell-user32-mouse");
  assert.equal(nativeCapabilityReport("win32", only("powershell.exe")).actions.keyboard_type.adapter, "powershell-sendkeys");

  // Linux artık OTURUM TİPİNE BAĞLI (Faz 1, 2026-10-04).
  //
  // Ölçüm: bu satırlar eskiden oturum tipi belirtmeden çağrılıyordu
  // ve koşulsuz `xdotool` seçiliyordu. Wayland oturumunda (KDE Neon,
  // Fedora 34+) `xdotool` sessizce başarısız olur ve Bridge yine
  // `available: true` bildirirdi. Test artık oturumu AÇIKÇA verir.
  assert.equal(nativeCapabilityReport("linux", only("xdotool"), "x11").actions.mouse_click.adapter, "xdotool");
  assert.equal(nativeCapabilityReport("linux", only("xdotool"), "x11").actions.keyboard_type.adapter, "xdotool");
  assert.equal(nativeCapabilityReport("linux", only("wtype"), "x11").actions.keyboard_type.adapter, "wtype");

  // Wayland oturumunda wtype önce gelir; xdotool YEDEK olur.
  assert.equal(nativeCapabilityReport("linux", only("wtype", "xdotool"), "wayland").actions.keyboard_type.adapter, "wtype");
  assert.equal(
    nativeCapabilityReport("linux", only("wtype", "xdotool"), "wayland").actions.mouse_click.adapter,
    "wayland-input"
  );

  // Oturum bilinmiyorsa fare/klavye KESİNLİKLE "çalışıyor" bildirilmez.
  const konsol = nativeCapabilityReport("linux", only(), "unknown");
  assert.equal(konsol.actions.mouse_click.available, false);
  assert.equal(konsol.actions.mouse_click.reason, "session_type_unknown");
  assert.equal(konsol.actions.keyboard_type.available, false);

  // X11'de araç yoksa sebep bildirilir.
  //
  // Not: fare için `mouse_input_adapter_not_available` gelir (klavye
  // ve fare AYRI ayrı değerlendirilir); oturum bilinmiyorsa ikisi
  // de `session_type_unknown` alır.
  assert.equal(
    nativeCapabilityReport("linux", only(), "x11").actions.mouse_click.available,
    false
  );
  assert.equal(
    nativeCapabilityReport("linux", only(), "x11").actions.keyboard_type.available,
    false
  );

  // X11'de yalnız `wtype` kuruluysa klavye çalışır; fare çalışmaz.
  //
  // Ölçüm (2026-10-04): ilk sürümde X11 aday listesinde `wtype`
  // YOKTU ve kontrol "hiç araç yok" deyip kapatılıyordu — oysa
  // klavye kontrolü mümkündü.
  const x11Wtype = nativeCapabilityReport("linux", only("wtype"), "x11");
  assert.equal(x11Wtype.actions.keyboard_type.available, true);
  assert.equal(x11Wtype.actions.keyboard_type.adapter, "wtype");
  assert.equal(x11Wtype.actions.mouse_click.available, false);
});

test("oturum tipi yetenek raporunda backend'e bildirilir", () => {
  // Backend "bu cihazda fare var mı" sorusunu yanıtlayabilmelidir.
  const rapor = nativeCapabilityReport("linux", () => true, "wayland");
  assert.equal(rapor.session.type, "wayland");
  assert.equal(rapor.session.display_server, "wayland");
});

test("native runtime returns a clear clipboard error when no adapter is available", async () => {
  const capability = nativeCapabilityReport();
  if (capability.actions.clipboard_write.available) {
    return;
  }
  await assert.rejects(
    () => handleNativeCommand({
      command: {
        command_type: "computer.native_action",
        payload: {
          action: {
            kind: "clipboard_write",
            text: "umay"
          }
        }
      }
    }),
    /clipboard_adapter_not_available/
  );
});

test("native runtime returns a clear screen observe error when no adapter is available", async () => {
  const capability = nativeCapabilityReport();
  if (capability.actions.screen_observe.available) {
    return;
  }
  await assert.rejects(
    () => handleNativeCommand({
      command: {
        command_type: "computer.native_action",
        payload: {
          action: {
            kind: "screen_observe"
          }
        }
      }
    }),
    /screen_capture_adapter_not_available/
  );
});

test("native runtime returns clear input errors when adapters are unavailable", async () => {
  const capability = nativeCapabilityReport();
  if (!capability.actions.mouse_click.available) {
    await assert.rejects(
      () => handleNativeCommand({
        command: {
          command_type: "computer.native_action",
          payload: {
            decision: { normalized: { x: 10, y: 20 } },
            action: { kind: "mouse_click", x: 10, y: 20 }
          }
        }
      }),
      /mouse_input_adapter_not_available/
    );
  }
  if (!capability.actions.keyboard_type.available) {
    await assert.rejects(
      () => handleNativeCommand({
        command: {
          command_type: "computer.native_action",
          payload: {
            action: { kind: "keyboard_type", text: "umay" }
          }
        }
      }),
      /keyboard_input_adapter_not_available/
    );
  }
});
