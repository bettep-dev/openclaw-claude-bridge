#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const chalk = require('chalk');
const { checkAll, printStatus, whichBin, getInstallCmd, installDep } = require('./deps');
const { detectOS, getHomeDir, getWorkspace, getScriptsDir, installDaemon } = require('./platform');

const CORE_CHANNELS = [
  'telegram', 'discord', 'slack', 'whatsapp', 'signal', 'irc',
];
const PLUGIN_CHANNELS = [
  'matrix', 'line', 'mattermost', 'teams',
];

const SESSION_NAME = 'claude-daemon';
const CHANNELS_URL = 'http://127.0.0.1:18789/channels';

// Commands to register in openclaw.json customCommands
const BRIDGE_COMMANDS = [
  { command: 'cc',  description: 'Send instruction to existing Claude session' },
  { command: 'ccn', description: 'Create new Claude session and send instruction' },
  { command: 'ccu', description: 'Query Claude usage/cost info' },
];

// Variable names used in each script (for patching existing scripts)
const SCRIPT_VARS = {
  'claude-session.sh': {
    TMUX: 'TMUX_BIN',
    CLAUDE: 'CLAUDE_BIN',
    WORKSPACE: 'WORKSPACE',
    SESSION: 'SESSION_NAME',
  },
  'claude-send.sh': {
    TMUX: 'TMUX_BIN',
    CHANNEL: 'CHANNEL',
    TARGET: 'TARGET_ID',
    SESSION: 'SESSION_NAME',
  },
  'claude-new-session.sh': {
    TMUX: 'TMUX_BIN',
    CLAUDE: 'CLAUDE_BIN',
    WORKSPACE: 'WORKSPACE',
    CHANNEL: 'CHANNEL',
    TARGET: 'TARGET_ID',
    SESSION: 'SESSION_NAME',
  },
  'claude-usage.sh': {
    TMUX: 'TMUX_BIN',
    CLAUDE: 'CLAUDE_BIN',
    CHANNEL: 'CHANNEL',
    TARGET: 'TARGET_ID',
  },
};

// --- Utility functions ---

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ask(rl, question, defaultVal) {
  return new Promise((resolve) => {
    const suffix = defaultVal ? chalk.dim(` [${defaultVal}]`) : '';
    rl.question(`    ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

/**
 * Interactive list selector with arrow keys.
 * items: [{ label, tag?, separator? }]
 * defaultIndex: initially highlighted index
 * Returns the selected item's label.
 *
 * Falls back to simple numbered list if stdin is not a TTY (piped input).
 */
function selectList(items, defaultIndex = 0) {
  const { stdin, stdout } = process;

  // Fallback for non-TTY (piped input, CI, etc.)
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      const selectable = items.filter(i => !i.separator);
      for (let i = 0; i < selectable.length; i++) {
        const marker = i === defaultIndex ? chalk.cyan.bold('>') : ' ';
        const tag = selectable[i].tag ? chalk.dim(` ${selectable[i].tag}`) : '';
        console.log(`    ${marker} ${i + 1}. ${selectable[i].label}${tag}`);
      }
      console.log();
      const chosen = selectable[defaultIndex];
      console.log(`    ${chalk.green('\u2713')} Selected: ${chalk.bold(chosen.label)}`);
      resolve(chosen.label);
    });
  }

  return new Promise((resolve) => {
    let cursor = defaultIndex;
    const wasRaw = stdin.isRaw;

    function render(first) {
      // Move cursor up to overwrite previous render (except on first draw)
      if (!first) {
        stdout.write(`\x1b[${items.length + 1}A`); // +1 for hint line
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Separator line
        if (item.separator) {
          stdout.write(`\r\x1b[K    ${chalk.dim('\u2500'.repeat(36))}\n`);
          continue;
        }

        const isActive = i === cursor;
        const pointer = isActive ? chalk.cyan.bold('\u276f') : ' ';
        const label = isActive ? chalk.cyan.bold(item.label) : chalk.white(item.label);
        const tag = item.tag
          ? (isActive ? chalk.cyan.dim(` ${item.tag}`) : chalk.dim(` ${item.tag}`))
          : '';

        stdout.write(`\r\x1b[K    ${pointer} ${label}${tag}\n`);
      }

      // Hint line
      stdout.write(`\r\x1b[K    ${chalk.dim('\u2191\u2193 navigate   enter select')}\n`);
    }

    // Find selectable indices (skip separators)
    const selectableIndices = items
      .map((item, i) => item.separator ? -1 : i)
      .filter(i => i >= 0);

    function moveCursor(direction) {
      const currentPos = selectableIndices.indexOf(cursor);
      if (currentPos < 0) return;

      let nextPos = currentPos + direction;
      if (nextPos < 0) nextPos = selectableIndices.length - 1;
      if (nextPos >= selectableIndices.length) nextPos = 0;
      cursor = selectableIndices[nextPos];
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    render(true);

    function onKey(key) {
      // Ctrl+C
      if (key === '\x03') {
        stdin.setRawMode(wasRaw || false);
        stdin.removeListener('data', onKey);
        stdin.pause();
        process.exit(0);
      }

      // Arrow up / k
      if (key === '\x1b[A' || key === 'k') {
        moveCursor(-1);
        render(false);
        return;
      }

      // Arrow down / j
      if (key === '\x1b[B' || key === 'j') {
        moveCursor(1);
        render(false);
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        stdin.setRawMode(wasRaw || false);
        stdin.removeListener('data', onKey);
        stdin.pause();

        // Overwrite the hint line with the selection result
        stdout.write(`\x1b[1A\r\x1b[K    ${chalk.green('\u2713')} Selected: ${chalk.bold(items[cursor].label)}\n`);

        resolve(items[cursor].label);
        return;
      }
    }

    stdin.on('data', onKey);
  });
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function startSpinner(text) {
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r    ${chalk.cyan(SPINNER_FRAMES[i % SPINNER_FRAMES.length])} ${text}`);
    i++;
  }, 80);
  return {
    stop(result) {
      clearInterval(id);
      process.stdout.write(`\r    ${chalk.green('\u2713')} ${result}\n`);
    },
    fail(result) {
      clearInterval(id);
      process.stdout.write(`\r    ${chalk.red('\u2717')} ${result}\n`);
    },
  };
}

function formatInstallMsg(label, dir, created, patched) {
  const parts = [];
  if (created > 0) parts.push(`${created} created`);
  if (patched > 0) parts.push(`${patched} updated`);
  return `${label.padEnd(11)} ${chalk.dim('->')} ${dir} ${chalk.dim(`(${parts.join(', ')})`)}`;
}

function substituteTemplate(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function getScriptVersion(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^# bridge-version:\s*(\d+)/m);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

function getTemplateVersion(srcRel) {
  const srcPath = path.join(__dirname, '..', 'templates', srcRel);
  return getScriptVersion(srcPath);
}

function copyTemplate(srcRel, destPath, vars) {
  const srcPath = path.join(__dirname, '..', 'templates', srcRel);
  let content = fs.readFileSync(srcPath, 'utf8');
  content = substituteTemplate(content, vars);
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(destPath, content);
}

function patchScriptVars(filePath, varMapping, vars) {
  let content = fs.readFileSync(filePath, 'utf8');
  let patched = 0;

  for (const [scriptVar, varsKey] of Object.entries(varMapping)) {
    const newValue = vars[varsKey];
    if (!newValue) continue;

    const regex = new RegExp(`^(${scriptVar}=).*$`, 'gm');
    const updated = content.replace(regex, `$1"${newValue}"`);
    if (updated !== content) {
      content = updated;
      patched++;
    }
  }

  if (patched > 0) fs.writeFileSync(filePath, content);
  return patched;
}

function patchSkillPath(filePath, scriptsDir) {
  let content = fs.readFileSync(filePath, 'utf8');
  const regex = /(\/[^\s]*\/)(claude-[\w-]+\.sh)/g;
  const updated = content.replace(regex, `${scriptsDir}/$2`);

  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    return true;
  }
  return false;
}

function getDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function openBrowser(url) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// --- Main onboard flow ---

async function onboard() {
  const pkg = require('../package.json');
  console.log();
  console.log(`  ${chalk.bold.cyan('openclaw-claude-bridge')} ${chalk.dim(`v${pkg.version}`)}`);
  console.log(`  ${'─'.repeat(40)}`);
  console.log();
  await sleep(300);

  // ========== Step 1: Check dependencies ==========
  console.log(`  ${chalk.bold('[1/4]')} ${chalk.bold('Checking dependencies...')}`);
  console.log();
  await sleep(200);

  const { results } = checkAll();
  const missing = [];

  for (const dep of results) {
    await sleep(250);
    if (dep.found) {
      console.log(`    ${chalk.green('\u2713')} ${chalk.bold(dep.name.padEnd(10))} ${chalk.dim(dep.path)}`);
      continue;
    }

    // openclaw, claude: must be pre-installed by user
    if (!dep.autoInstall) {
      const cmd = getInstallCmd(dep);
      console.log(`    ${chalk.red('\u2717')} ${chalk.bold(dep.name.padEnd(10))} ${chalk.red('not found')}`);
      console.log(`      ${chalk.dim('Install:')} ${chalk.cyan(cmd)}`);
      if (dep.url) {
        console.log(`      ${chalk.dim('Docs:')}    ${chalk.underline(dep.url)}`);
      }
      missing.push(dep);
      continue;
    }

    // tmux: auto-install
    const cmd = getInstallCmd(dep);
    console.log(`    ${chalk.red('\u2717')} ${chalk.bold(dep.name.padEnd(10))} ${chalk.red('not found')}`);

    if (cmd) {
      console.log(`    ${chalk.cyan('\u2192')} Installing: ${chalk.bold(cmd)}`);
      console.log();
      const binPath = installDep(dep);
      console.log();

      if (binPath) {
        dep.path = binPath;
        dep.found = true;
        console.log(`    ${chalk.green('\u2713')} ${chalk.bold(dep.name.padEnd(10))} ${chalk.dim(binPath)}`);
      } else {
        console.log(`    ${chalk.red('\u2717')} ${chalk.bold(dep.name.padEnd(10))} ${chalk.red('installation failed')}`);
        missing.push(dep);
      }
    } else {
      console.log(`      ${chalk.yellow('!')} No package manager found. Install tmux manually.`);
      missing.push(dep);
    }
  }

  console.log();

  if (missing.length > 0) {
    const hasPrereqs = missing.some(d => !d.autoInstall);
    if (hasPrereqs) {
      console.log(chalk.red('  OpenClaw and Claude CLI must be installed before running this tool.'));
      console.log(chalk.red('  Install them first, then run this command again.'));
    } else {
      console.log(chalk.red('  Some dependencies could not be installed. Fix them and try again.'));
    }
    process.exit(1);
  }

  await sleep(400);

  // ========== Step 2: Detect environment ==========
  console.log(`  ${chalk.bold('[2/4]')} ${chalk.bold('Detecting environment...')}`);
  console.log();

  const homeDir = getHomeDir();
  const workspace = getWorkspace();
  const osName = detectOS();
  const tmuxBin = results.find(r => r.name === 'tmux').path;
  const claudeBin = results.find(r => r.name === 'claude').path;

  const envItems = [
    ['OS', `${osName} (${process.platform})`],
    ['Workspace', workspace],
    ['Home', homeDir],
  ];

  for (const [label, value] of envItems) {
    await sleep(200);
    console.log(`    ${chalk.green('\u2713')} ${chalk.bold(label.padEnd(13))} ${chalk.dim(value)}`);
  }

  console.log();
  await sleep(400);

  // ========== Step 3: Channel setup ==========
  console.log(`  ${chalk.bold('[3/4]')} ${chalk.bold('Channel setup')}`);
  console.log();
  await sleep(200);

  console.log(`    ${chalk.bold('Select a channel:')}`);
  console.log();

  // Build selectable list
  const channelItems = [
    ...CORE_CHANNELS.map(c => ({ label: c })),
    { separator: true },
    ...PLUGIN_CHANNELS.map(c => ({ label: c, tag: 'plugin' })),
  ];
  const defaultChannelIdx = 0; // telegram

  const channel = await selectList(channelItems, defaultChannelIdx);
  console.log();

  // --- Channel target ID: explain and open browser ---
  console.log(`    ${chalk.yellow('?')} ${chalk.bold('Channel Target ID')}`);
  console.log();
  console.log(`      The target ID identifies ${chalk.bold('who receives')} Claude's responses.`);
  console.log(`      For example:`);
  console.log(`        ${chalk.dim('\u2022')} Telegram  ${chalk.dim('->')} your chat ID ${chalk.dim('(e.g. 123456789)')}`);
  console.log(`        ${chalk.dim('\u2022')} Discord   ${chalk.dim('->')} channel ID ${chalk.dim('(e.g. 123456789012345678)')}`);
  console.log(`        ${chalk.dim('\u2022')} Slack     ${chalk.dim('->')} channel name ${chalk.dim('(e.g. #general)')}`);
  console.log();
  console.log(`      ${chalk.cyan.bold('Opening your OpenClaw channels page to check...')}`);

  const opened = openBrowser(CHANNELS_URL);
  if (opened) {
    console.log(`      ${chalk.green('\u2713')} Browser opened: ${chalk.underline(CHANNELS_URL)}`);
    console.log(`      ${chalk.dim('Find your channel and copy the target ID from the dashboard.')}`);
  } else {
    console.log(`      ${chalk.yellow('!')} Could not open browser automatically.`);
    console.log(`      ${chalk.dim('Open this URL manually:')} ${chalk.underline(CHANNELS_URL)}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log();
  const targetId = await ask(rl, 'Paste your target ID');

  if (!targetId) {
    console.log(chalk.red('\n  Target ID is required.'));
    rl.close();
    process.exit(1);
  }

  rl.close();
  console.log();
  await sleep(300);

  // ========== Step 4: Install ==========
  console.log(`  ${chalk.bold('[4/4]')} ${chalk.bold('Installing...')}`);
  console.log();

  const scriptsDir = getScriptsDir();
  const skillsDir = path.join(workspace, 'skills');

  const vars = {
    CHANNEL: channel,
    TARGET_ID: targetId,
    WORKSPACE: workspace,
    TMUX_BIN: tmuxBin,
    CLAUDE_BIN: claudeBin,
    HOME_DIR: homeDir,
    SESSION_NAME: SESSION_NAME,
    SCRIPTS_DIR: scriptsDir,
  };

  // --- 4a. Scripts ---
  const spinner1 = startSpinner('Installing scripts...');
  await sleep(400);

  const scriptFiles = Object.keys(SCRIPT_VARS);
  let scriptsCreated = 0;
  let scriptsPatched = 0;

  for (const file of scriptFiles) {
    const dest = path.join(scriptsDir, file);
    const tplRel = path.join('scripts', file);

    if (fs.existsSync(dest)) {
      const installedVer = getScriptVersion(dest);
      const templateVer = getTemplateVersion(tplRel);

      if (installedVer < templateVer) {
        // Structure changed — replace with new template
        copyTemplate(tplRel, dest, vars);
        fs.chmodSync(dest, 0o755);
        scriptsCreated++;
      } else {
        // Same version — patch variables only
        const varMapping = SCRIPT_VARS[file];
        if (varMapping) {
          patchScriptVars(dest, varMapping, vars);
          scriptsPatched++;
        }
      }
    } else {
      copyTemplate(tplRel, dest, vars);
      fs.chmodSync(dest, 0o755);
      scriptsCreated++;
    }
  }

  spinner1.stop(formatInstallMsg('Scripts', scriptsDir, scriptsCreated, scriptsPatched));

  await sleep(300);

  // --- 4b. Skills ---
  const spinner2 = startSpinner('Installing skills...');
  await sleep(400);

  const skillNames = ['cc', 'ccn', 'ccu'];
  let skillsCreated = 0;
  let skillsPatched = 0;

  for (const skill of skillNames) {
    const dest = path.join(skillsDir, skill, 'SKILL.md');

    if (fs.existsSync(dest)) {
      patchSkillPath(dest, scriptsDir);
      skillsPatched++;
    } else {
      copyTemplate(path.join('skills', skill, 'SKILL.md'), dest, vars);
      skillsCreated++;
    }
  }

  spinner2.stop(formatInstallMsg('Skills', skillsDir, skillsCreated, skillsPatched));

  await sleep(300);

  // --- 4c. CLAUDE.md ---
  const spinner3 = startSpinner('Installing CLAUDE.md...');
  await sleep(400);

  const claudeMdDest = path.join(workspace, 'CLAUDE.md');

  if (fs.existsSync(claudeMdDest)) {
    const dateStr = getDateStr();
    let backupPath = path.join(workspace, `CLAUDE.${dateStr}.md`);
    let suffix = 1;
    while (fs.existsSync(backupPath)) {
      backupPath = path.join(workspace, `CLAUDE.${dateStr}-${suffix}.md`);
      suffix++;
    }
    fs.renameSync(claudeMdDest, backupPath);
    spinner3.stop(`CLAUDE.md   ${chalk.dim('->')} existing backed up as ${chalk.yellow(path.basename(backupPath))}`);

    await sleep(200);
    const spinner3b = startSpinner('Writing new CLAUDE.md...');
    await sleep(300);
    copyTemplate(path.join('workspace', 'CLAUDE.md'), claudeMdDest, vars);
    spinner3b.stop(`CLAUDE.md   ${chalk.dim('->')} ${claudeMdDest}`);
  } else {
    copyTemplate(path.join('workspace', 'CLAUDE.md'), claudeMdDest, vars);
    spinner3.stop(`CLAUDE.md   ${chalk.dim('->')} ${claudeMdDest}`);
  }

  await sleep(300);

  // --- 4d. Register channel commands in openclaw.json ---
  const spinner3c = startSpinner('Registering channel commands...');
  await sleep(400);

  const openclawConfigPath = path.join(getHomeDir(), '.openclaw', 'openclaw.json');
  let commandsRegistered = false;

  if (fs.existsSync(openclawConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));

      // Ensure channels.{channel}.customCommands exists
      if (!config.channels) config.channels = {};
      if (!config.channels[channel]) config.channels[channel] = {};
      if (!Array.isArray(config.channels[channel].customCommands)) {
        config.channels[channel].customCommands = [];
      }

      const cmds = config.channels[channel].customCommands;

      // Upsert each bridge command
      for (const bc of BRIDGE_COMMANDS) {
        const idx = cmds.findIndex(c => c.command === bc.command);
        if (idx >= 0) {
          cmds[idx].description = bc.description;
        } else {
          cmds.push({ command: bc.command, description: bc.description });
        }
      }

      fs.writeFileSync(openclawConfigPath, JSON.stringify(config, null, 2) + '\n');
      commandsRegistered = true;
    } catch {}
  }

  if (commandsRegistered) {
    spinner3c.stop(`Commands    ${chalk.dim('->')} openclaw.json ${chalk.dim('(cc, ccn, ccu registered)')}`);
  } else {
    spinner3c.fail(`Commands    ${chalk.dim('->')} openclaw.json not found or unreadable`);
  }

  await sleep(300);

  // --- 4e. Daemon ---

  const spinner4 = startSpinner('Registering daemon...');
  await sleep(500);

  const sessionScript = path.join(scriptsDir, 'claude-session.sh');
  const daemonOk = installDaemon(sessionScript);
  if (daemonOk) {
    const daemonType = process.platform === 'darwin' ? 'LaunchAgent' : 'systemd';
    spinner4.stop(`Daemon      ${chalk.dim('->')} ${daemonType} registered ${chalk.dim('(30s interval)')}`);
  } else {
    spinner4.fail(`Daemon      ${chalk.dim('->')} manual setup required`);
  }

  await sleep(300);

  // --- 4f. Restart OpenClaw Gateway ---
  const spinner5 = startSpinner('Restarting OpenClaw Gateway...');
  await sleep(300);

  let restarted = false;
  try {
    execSync('openclaw gateway restart', { stdio: 'ignore', timeout: 15000 });
    restarted = true;
  } catch {}

  if (restarted) {
    spinner5.stop(`Gateway     ${chalk.dim('->')} restarted ${chalk.dim('(skills loaded)')}`);
  } else {
    spinner5.fail(`Gateway     ${chalk.dim('->')} could not restart automatically`);
  }

  // ========== Done ==========
  console.log();
  await sleep(300);
  console.log(`  ${chalk.green.bold('\u2705 Setup complete!')}`);
  console.log();

  if (!restarted) {
    console.log(`  ${chalk.bold.yellow('Action required:')}`);
    console.log(`    Restart OpenClaw to load the new skills:`);
    console.log(`    ${chalk.cyan('/restart')}                from your ${chalk.bold(channel)}`);
    console.log(`    ${chalk.cyan('openclaw gateway restart')}  from terminal`);
    console.log();
  }

  console.log(`  ${chalk.bold('Quick test:')}`);
  console.log(`    Send ${chalk.cyan.bold(`/cc "hello"`)} from your ${chalk.bold(channel)}`);
  console.log();
  console.log(`  ${chalk.bold('Commands:')}`);
  console.log(`    ${chalk.cyan('/cc "message"')}   Send to existing session`);
  console.log(`    ${chalk.cyan('/ccn "message"')}  Create new session and send`);
  console.log(`    ${chalk.cyan('/ccu')}            Check usage`);
  console.log();
  console.log(`  ${chalk.yellow.bold('\u26a0  Arguments after /cc and /ccn MUST be wrapped in double quotes.')}`);
  console.log();
}

module.exports = { onboard, BRIDGE_COMMANDS, SCRIPT_VARS, substituteTemplate };
