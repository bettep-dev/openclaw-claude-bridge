#!/usr/bin/env node
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

function detectOS() {
  const p = process.platform;
  if (p === 'darwin') return 'macOS';
  if (p === 'linux') return 'Linux';
  return p;
}

function getHomeDir() {
  return os.homedir();
}

function getWorkspace() {
  return path.join(getHomeDir(), '.openclaw', 'workspace');
}

function getScriptsDir() {
  return path.join(getHomeDir(), '.openclaw', 'scripts');
}

// --- Daemon install/remove ---

const PLIST_NAME = 'ai.openclaw.claude-session.plist';
const SYSTEMD_NAME = 'openclaw-claude.service';

function getPlistPath() {
  return path.join(getHomeDir(), 'Library', 'LaunchAgents', PLIST_NAME);
}

function getSystemdPath() {
  return path.join(getHomeDir(), '.config', 'systemd', 'user', SYSTEMD_NAME);
}

function installDaemon(scriptPath) {
  const platform = process.platform;

  if (platform === 'darwin') {
    return installLaunchAgent(scriptPath);
  } else if (platform === 'linux') {
    return installSystemdUnit(scriptPath);
  } else {
    console.log(chalk.yellow(`    ! Daemon auto-install not supported on ${platform}.`));
    console.log(chalk.yellow(`      Run ${scriptPath} manually or via cron.`));
    return false;
  }
}

function installLaunchAgent(scriptPath) {
  const plistPath = getPlistPath();
  const dir = path.dirname(plistPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Read template and substitute
  const tplPath = path.join(__dirname, '..', 'templates', 'daemon', 'macos.plist');
  let content = fs.readFileSync(tplPath, 'utf8');
  content = content.replace(/\{\{SCRIPT_PATH\}\}/g, scriptPath);

  fs.writeFileSync(plistPath, content);

  // Unload if already loaded, then load
  try {
    execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: 'ignore' });
  } catch {}
  try {
    execSync(`launchctl load "${plistPath}"`);
    return true;
  } catch (e) {
    console.log(chalk.red(`    Failed to load LaunchAgent: ${e.message}`));
    return false;
  }
}

function installSystemdUnit(scriptPath) {
  const unitPath = getSystemdPath();
  const dir = path.dirname(unitPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tplPath = path.join(__dirname, '..', 'templates', 'daemon', 'linux.service');
  let content = fs.readFileSync(tplPath, 'utf8');
  content = content.replace(/\{\{SCRIPT_PATH\}\}/g, scriptPath);

  fs.writeFileSync(unitPath, content);

  try {
    execSync('systemctl --user daemon-reload');
    execSync(`systemctl --user enable --now ${SYSTEMD_NAME}`);
    return true;
  } catch (e) {
    console.log(chalk.red(`    Failed to enable systemd unit: ${e.message}`));
    return false;
  }
}

function removeDaemon() {
  const platform = process.platform;

  if (platform === 'darwin') {
    const plistPath = getPlistPath();
    if (fs.existsSync(plistPath)) {
      try { execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: 'ignore' }); } catch {}
      fs.unlinkSync(plistPath);
      return true;
    }
  } else if (platform === 'linux') {
    const unitPath = getSystemdPath();
    if (fs.existsSync(unitPath)) {
      try { execSync(`systemctl --user disable --now ${SYSTEMD_NAME}`, { stdio: 'ignore' }); } catch {}
      fs.unlinkSync(unitPath);
      try { execSync('systemctl --user daemon-reload'); } catch {}
      return true;
    }
  }
  return false;
}

module.exports = {
  detectOS,
  getHomeDir,
  getWorkspace,
  getScriptsDir,
  installDaemon,
  removeDaemon,
};
