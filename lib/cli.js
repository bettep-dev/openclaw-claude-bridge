#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const program = new Command();

program
  .name('openclaw-claude-bridge')
  .description('Bridge OpenClaw messaging channels to Claude CLI via tmux persistent sessions')
  .version(pkg.version);

// --- onboard ---
program
  .command('onboard')
  .description('Set up the bridge (auto-detects most settings, just press Enter)')
  .action(async () => {
    const { onboard } = require('./onboard');
    await onboard();
  });

// --- check ---
program
  .command('check')
  .description('Check if all dependencies are installed')
  .action(() => {
    const { checkAll, printStatus } = require('./deps');
    const { detectOS, getWorkspace } = require('./platform');

    console.log();
    console.log(`  ${chalk.bold('openclaw-claude-bridge')} dependency check`);
    console.log(`  ${'─'.repeat(35)}`);
    console.log();

    console.log(`  ${chalk.bold('Dependencies:')}`);
    const { results, allFound } = checkAll();
    printStatus(results);
    console.log();

    console.log(`  ${chalk.bold('Environment:')}`);
    console.log(`    OS:        ${detectOS()} (${process.platform})`);
    console.log(`    Workspace: ${getWorkspace()}`);
    console.log();

    if (allFound) {
      console.log(`  ${chalk.green('\u2705')} All dependencies found.`);
    } else {
      console.log(`  ${chalk.red('\u274c')} Missing dependencies. See above for install commands.`);
    }
    console.log();

    process.exit(allFound ? 0 : 1);
  });

// --- uninstall ---
program
  .command('uninstall')
  .description('Remove daemon, scripts, plugin, legacy hooks, skills, and CLAUDE.md')
  .action(() => {
    const { removeDaemon, getScriptsDir, getWorkspace, getHomeDir } = require('./platform');

    console.log();
    console.log(`  Removing openclaw-claude-bridge...`);

    // Daemon
    const daemonRemoved = removeDaemon();
    if (daemonRemoved) {
      console.log(`    ${chalk.green('\u2713')} Daemon stopped and removed`);
    } else {
      console.log(`    ${chalk.dim('-')} No daemon found`);
    }

    // Scripts
    const { BRIDGE_COMMANDS, SCRIPT_VARS } = require('./onboard');
    const scriptsDir = getScriptsDir();
    const scriptFiles = Object.keys(SCRIPT_VARS);
    let scriptsRemoved = 0;
    for (const file of scriptFiles) {
      const fp = path.join(scriptsDir, file);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        scriptsRemoved++;
      }
    }
    if (scriptsRemoved > 0) {
      console.log(`    ${chalk.green('\u2713')} Scripts removed from ${scriptsDir}`);
    } else {
      console.log(`    ${chalk.dim('-')} No scripts found`);
    }

    // Plugin
    const homeDir = getHomeDir();
    const pluginDir = path.join(homeDir, '.openclaw', 'plugins', 'claude-bridge');
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
      console.log(`    ${chalk.green('\u2713')} Plugin removed (claude-bridge)`);
    } else {
      console.log(`    ${chalk.dim('-')} No plugin found`);
    }

    // Legacy hook
    const workspace = getWorkspace();
    const hookDir = path.join(workspace, 'hooks', 'claude-bridge');
    if (fs.existsSync(hookDir)) {
      fs.rmSync(hookDir, { recursive: true, force: true });
      console.log(`    ${chalk.green('\u2713')} Legacy hook removed (claude-bridge)`);
    } else {
      console.log(`    ${chalk.dim('-')} No legacy hook found`);
    }

    // Skills
    const skillsDir = path.join(workspace, 'skills');
    const skillNames = BRIDGE_COMMANDS.map(c => c.command);
    let skillsRemoved = 0;
    for (const skill of skillNames) {
      const skillFile = path.join(skillsDir, skill, 'SKILL.md');
      const skillDir = path.join(skillsDir, skill);
      if (fs.existsSync(skillFile)) {
        fs.unlinkSync(skillFile);
        // Remove directory if empty
        try { fs.rmdirSync(skillDir); } catch {}
        skillsRemoved++;
      }
    }
    if (skillsRemoved > 0) {
      console.log(`    ${chalk.green('\u2713')} Skills removed (${skillNames.join(', ')})`);
    } else {
      console.log(`    ${chalk.dim('-')} No skills found`);
    }

    // CLAUDE.md
    const claudeMd = path.join(workspace, 'CLAUDE.md');
    if (fs.existsSync(claudeMd)) {
      fs.unlinkSync(claudeMd);
      console.log(`    ${chalk.green('\u2713')} CLAUDE.md removed`);
    } else {
      console.log(`    ${chalk.dim('-')} No CLAUDE.md found`);
    }

    // openclaw.json cleanup (plugin config + legacy channel commands)
    const openclawConfigPath = path.join(homeDir, '.openclaw', 'openclaw.json');

    if (fs.existsSync(openclawConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));
        let configChanged = false;

        // Remove plugin config (entries, load path, install record)
        if (config.plugins?.entries?.['claude-bridge']) {
          delete config.plugins.entries['claude-bridge'];
          configChanged = true;
        }
        if (config.plugins?.installs?.['claude-bridge']) {
          delete config.plugins.installs['claude-bridge'];
          configChanged = true;
        }
        if (Array.isArray(config.plugins?.load?.paths)) {
          const before = config.plugins.load.paths.length;
          config.plugins.load.paths = config.plugins.load.paths.filter(p => p !== pluginDir);
          if (config.plugins.load.paths.length < before) configChanged = true;
        }
        // Remove from allow list
        if (Array.isArray(config.plugins?.allow)) {
          const before = config.plugins.allow.length;
          config.plugins.allow = config.plugins.allow.filter(id => id !== 'claude-bridge');
          if (config.plugins.allow.length < before) configChanged = true;
        }
        // Also remove legacy top-level key if present
        if (config.plugins?.['claude-bridge']) {
          delete config.plugins['claude-bridge'];
          configChanged = true;
        }
        if (configChanged) {
          console.log(`    ${chalk.green('\u2713')} Plugin config removed from openclaw.json`);
        }

        // Remove legacy channel commands
        let commandsRemoved = 0;
        if (config.channels) {
          for (const ch of Object.values(config.channels)) {
            if (Array.isArray(ch.customCommands)) {
              const before = ch.customCommands.length;
              ch.customCommands = ch.customCommands.filter(
                c => !skillNames.includes(c.command)
              );
              commandsRemoved += before - ch.customCommands.length;
            }
          }
        }

        if (commandsRemoved > 0) {
          configChanged = true;
          console.log(`    ${chalk.green('\u2713')} Channel commands removed from openclaw.json`);
        } else {
          console.log(`    ${chalk.dim('-')} No channel commands found`);
        }

        if (configChanged) {
          fs.writeFileSync(openclawConfigPath, JSON.stringify(config, null, 2) + '\n');
        }
      } catch {
        console.log(`    ${chalk.dim('-')} Could not update openclaw.json`);
      }
    }

    console.log();
    console.log(`  ${chalk.green('\u2705')} Uninstall complete.`);
    console.log();
  });

program.parse();
