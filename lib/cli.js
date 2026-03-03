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
  .description('Remove daemon, scripts, skills, and CLAUDE.md')
  .action(() => {
    const { removeDaemon, getScriptsDir, getWorkspace } = require('./platform');

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

    // Skills
    const workspace = getWorkspace();
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

    // Channel commands from openclaw.json
    const { getHomeDir } = require('./platform');
    const openclawConfigPath = path.join(getHomeDir(), '.openclaw', 'openclaw.json');
    const bridgeCommands = skillNames;

    if (fs.existsSync(openclawConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));
        let removed = 0;

        // Remove from all channels
        if (config.channels) {
          for (const ch of Object.values(config.channels)) {
            if (Array.isArray(ch.customCommands)) {
              const before = ch.customCommands.length;
              ch.customCommands = ch.customCommands.filter(
                c => !bridgeCommands.includes(c.command)
              );
              removed += before - ch.customCommands.length;
            }
          }
        }

        if (removed > 0) {
          fs.writeFileSync(openclawConfigPath, JSON.stringify(config, null, 2) + '\n');
          console.log(`    ${chalk.green('\u2713')} Channel commands removed from openclaw.json`);
        } else {
          console.log(`    ${chalk.dim('-')} No channel commands found`);
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
