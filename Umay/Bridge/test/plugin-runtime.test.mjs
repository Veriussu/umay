import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  handlePluginCommand,
  installPlugin,
  maskSecrets,
  probeDependencies,
  runtimeAvailabilityReport,
  stopPlugin,
  tailPluginLog,
  verifyPluginSignature
} from "../src/plugin-runtime.mjs";

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "umay-bridge-test-"));
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

test("installPlugin verifies checksum and preserves plugin data", async () => {
  const root = tempRoot();
  try {
    const pkg = join(root, "plugin.bin");
    writeFileSync(pkg, "hello plugin");
    const result = await installPlugin({
      appDir: root,
      installationId: "inst-1",
      manifest: { download_url: pathToFileURL(pkg).toString() },
      checksum: `sha256:${sha256("hello plugin")}`
    });
    assert.equal(readFileSync(join(result.installed_path, "install.json"), "utf8").includes("plugin.bin"), true);
    assert.equal(result.data_dir.endsWith(join("plugin-data", "inst-1")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installPlugin rolls staging back on checksum mismatch", async () => {
  const root = tempRoot();
  try {
    const pkg = join(root, "plugin.bin");
    writeFileSync(pkg, "bad hash");
    await assert.rejects(
      () => installPlugin({
        appDir: root,
        installationId: "inst-2",
        manifest: { download_url: pathToFileURL(pkg).toString() },
        checksum: `sha256:${sha256("other")}`
      }),
      /Checksum mismatch/
    );
    assert.throws(() => readFileSync(join(root, "plugins", "inst-2", "install.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installPlugin rolls staging back on failed download", async () => {
  const root = tempRoot();
  try {
    const missing = join(root, "missing-plugin.bin");
    await assert.rejects(
      () => installPlugin({
        appDir: root,
        installationId: "inst-download-fail",
        manifest: { download_url: pathToFileURL(missing).toString() }
      }),
      /ENOENT/
    );
    assert.throws(() => readFileSync(join(root, "plugins", "inst-download-fail", "install.json")));
    const staging = join(root, "staging");
    const leftovers = existsSync(staging)
      ? readdirSync(staging).filter((name) => name.startsWith("inst-download-fail-"))
      : [];
    assert.deepEqual(leftovers, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("maskSecrets redacts token-like log content", () => {
  const masked = maskSecrets("api_key=secret-value Authorization Bearer abc.def token: raw");
  assert.equal(masked.includes("secret-value"), false);
  assert.equal(masked.includes("abc.def"), false);
});

test("handlePluginCommand can start and stop a managed process", async () => {
  const root = tempRoot();
  try {
    await installPlugin({ appDir: root, installationId: "inst-3", manifest: {} });
    const command = {
      command_type: "plugin.start",
      payload: {
        operation_type: "start",
        installation_id: "inst-3",
        manifest: {
          start: {
            command: process.execPath,
            args: ["-e", "setTimeout(() => {}, 30000)"]
          }
        }
      }
    };
    const started = await handlePluginCommand({ appDir: root, command });
    assert.equal(started.runtime_status, "RUNNING");
    assert.equal(typeof started.pid, "number");
    const stopped = stopPlugin({ appDir: root, installationId: "inst-3" });
    assert.equal(stopped.runtime_status, "STOPPED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bridge-resolved install writes launcher and start requires runtime command", async () => {
  const root = tempRoot();
  try {
    const installed = await installPlugin({
      appDir: root,
      installationId: "inst-runtime-missing",
      manifest: {
        download: {
          type: "bridge-resolved",
          package: "definitely-missing-umay-runtime"
        }
      }
    });
    assert.equal(existsSync(join(installed.installed_path, "launcher.mjs")), true);
    assert.equal(existsSync(join(installed.installed_path, "runtime-resolved.json")), true);
    await assert.rejects(
      () => handlePluginCommand({
        appDir: root,
        command: {
          command_type: "plugin.start",
          payload: {
            operation_type: "start",
            installation_id: "inst-runtime-missing",
            manifest: {
              download: {
                type: "bridge-resolved",
                package: "definitely-missing-umay-runtime"
              }
            }
          }
        }
      }),
      /runtime_not_installed/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bridge-resolved runtime can start through generated launcher when command exists", async () => {
  const root = tempRoot();
  try {
    await installPlugin({
      appDir: root,
      installationId: "inst-runtime-node",
      manifest: {
        download: {
          type: "bridge-resolved",
          package: "node-runtime-test",
          command: process.execPath,
          args: ["-e", "setTimeout(() => {}, 30000)"]
        }
      }
    });
    const started = await handlePluginCommand({
      appDir: root,
      command: {
        command_type: "plugin.start",
        payload: {
          operation_type: "start",
          installation_id: "inst-runtime-node",
          manifest: {
            download: {
              type: "bridge-resolved",
              package: "node-runtime-test",
              command: process.execPath,
              args: ["-e", "setTimeout(() => {}, 30000)"]
            }
          }
        }
      }
    });
    assert.equal(started.runtime_status, "RUNNING");
    assert.equal(typeof started.pid, "number");
    const stopped = stopPlugin({ appDir: root, installationId: "inst-runtime-node" });
    assert.equal(stopped.runtime_status, "STOPPED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifyPluginSignature accepts ed25519 checksum signatures", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const checksum = `sha256:${sha256("signed payload")}`;
  const signature = `ed25519:${sign(null, Buffer.from(checksum, "utf8"), privateKey).toString("base64")}`;
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  assert.equal(verifyPluginSignature({ checksum, signature, publicKey: publicKeyPem }), true);
  assert.throws(
    () => verifyPluginSignature({ checksum: `sha256:${sha256("changed")}`, signature, publicKey: publicKeyPem }),
    /signature verification failed/i
  );
});

test("probeDependencies reports missing commands", () => {
  assert.equal(probeDependencies({ dependencies: { commands: [process.platform === "win32" ? "where" : "sh"] } }), true);
  assert.throws(
    () => probeDependencies({ dependencies: { commands: ["umay-definitely-missing-command"] } }),
    /Missing plugin dependencies/
  );
});

test("runtimeAvailabilityReport marks available and missing bridge-resolved runtimes", () => {
  const report = runtimeAvailabilityReport([
    { package: "node-runtime-test", command: process.execPath },
    "umay-definitely-missing-runtime"
  ]);
  assert.equal(report[0].package, "node-runtime-test");
  assert.equal(report[0].command, process.execPath);
  assert.equal(report[0].available, true);
  assert.equal(report[0].reason, null);
  assert.equal(report[1].available, false);
  assert.match(report[1].reason, /runtime_not_installed/);
});

test("tailPluginLog redacts stored process output", () => {
  const root = tempRoot();
  try {
    const logDir = join(root, "logs");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, "inst-log.log"), "token=very-secret\nsafe line");
    const tail = tailPluginLog({ appDir: root, installationId: "inst-log" });
    assert.equal(tail.includes("very-secret"), false);
    assert.equal(tail.includes("safe line"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
