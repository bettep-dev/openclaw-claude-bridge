#!/usr/bin/env node
"use strict";

const { execSync } = require("child_process");
const chalk = require("chalk");

const DEPS = [
  {
    name: "openclaw",
    check: "openclaw",
    install: "npm i -g openclaw",
    url: "https://openclaw.ai",
    autoInstall: false,
  },
  {
    name: "claude",
    check: "claude",
    install: "npm i -g @anthropic-ai/claude-code",
    url: "https://github.com/anthropics/claude-code",
    autoInstall: false,
  },
  {
    name: "tmux",
    check: "tmux",
    macOS: "brew install tmux",
    linux: "sudo apt install -y tmux",
    autoInstall: true,
  },
];

function whichBin(name) {
  if (!/^[a-z0-9_-]+$/i.test(name)) return null;
  try {
    return execSync(`command -v ${name}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function detectPackageManager() {
  const platform = process.platform;
  if (platform === "darwin") {
    return whichBin("brew") ? "brew" : null;
  }
  if (whichBin("apt")) return "apt";
  if (whichBin("yum")) return "yum";
  return null;
}

function checkAll() {
  const results = [];
  let allFound = true;

  for (const dep of DEPS) {
    const path = whichBin(dep.check);
    results.push({ ...dep, path, found: !!path });
    if (!path) allFound = false;
  }

  return { results, allFound };
}

function printStatus(results) {
  for (const dep of results) {
    if (dep.found) {
      console.log(
        `    ${chalk.green("\u2713")} ${dep.name.padEnd(10)} ${chalk.dim(dep.path)}`,
      );
    } else {
      const cmd = getInstallCmd(dep);
      console.log(
        `    ${chalk.red("\u2717")} ${dep.name.padEnd(10)} ${chalk.red("not found")}`,
      );
      if (cmd) console.log(`      ${chalk.dim("Install:")} ${chalk.cyan(cmd)}`);
    }
  }
}

/**
 * Get the install command for a dependency on the current platform.
 */
function getInstallCmd(dep) {
  if (dep.install) return dep.install;

  const platform = process.platform;
  if (platform === "darwin") return dep.macOS;

  if (dep.name === "tmux") {
    const pm = detectPackageManager();
    if (pm === "apt") return "sudo apt install -y tmux";
    if (pm === "yum") return "sudo yum install -y tmux";
    return null;
  }

  return dep.linux;
}

/**
 * Attempt to install a single dependency.
 * Returns the binary path on success, null on failure.
 */
function installDep(dep) {
  const cmd = getInstallCmd(dep);
  if (!cmd) return null;

  try {
    execSync(cmd, { stdio: "inherit", timeout: 120000 });
    return whichBin(dep.check);
  } catch {
    return null;
  }
}

module.exports = {
  DEPS,
  checkAll,
  printStatus,
  whichBin,
  getInstallCmd,
  installDep,
};
