#!/usr/bin/env node
"use strict";

const { Command } = require("commander");
const util = require("util");
const { exec } = require("child_process");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const pkg = require("../package.json");

const execAsync = util.promisify(exec);

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startSpinner(text) {
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(
      `\r\x1b[K    ${chalk.cyan(SPINNER_FRAMES[i % SPINNER_FRAMES.length])} ${text}`,
    );
    i++;
  }, 80);
  return {
    stop(result) {
      clearInterval(id);
      process.stdout.write(`\r\x1b[K    ${chalk.green("\u2713")} ${result}\n`);
    },
    fail(result) {
      clearInterval(id);
      process.stdout.write(`\r\x1b[K    ${chalk.red("\u2717")} ${result}\n`);
    },
  };
}

const program = new Command();

program
  .name("openclaw-claude-bridge")
  .description(
    "Bridge OpenClaw messaging channels to Claude CLI via tmux persistent sessions",
  )
  .version(pkg.version);

// --- onboard ---
program
  .command("onboard")
  .description(
    "Set up the bridge (auto-detects most settings, just press Enter)",
  )
  .action(async () => {
    try {
      const { onboard } = require("./onboard");
      await onboard();
    } catch (e) {
      console.error(chalk.red(`\n  Setup failed: ${e.message}`));
      process.exit(1);
    }
  });

// --- check ---
program
  .command("check")
  .description("Check if all dependencies are installed")
  .action(() => {
    const { checkAll, printStatus } = require("./deps");
    const { detectOS, getWorkspace } = require("./platform");

    console.log();
    console.log(`  ${chalk.bold("openclaw-claude-bridge")} dependency check`);
    console.log(`  ${"─".repeat(35)}`);
    console.log();

    console.log(`  ${chalk.bold("Dependencies:")}`);
    const { results, allFound } = checkAll();
    printStatus(results);
    console.log();

    console.log(`  ${chalk.bold("Environment:")}`);
    console.log(`    OS:        ${detectOS()} (${process.platform})`);
    console.log(`    Workspace: ${getWorkspace()}`);
    console.log();

    if (allFound) {
      console.log(`  ${chalk.green("\u2705")} All dependencies found.`);
    } else {
      console.log(
        `  ${chalk.red("\u274c")} Missing dependencies. See above for install commands.`,
      );
    }
    console.log();

    process.exit(allFound ? 0 : 1);
  });

// --- uninstall ---
program
  .command("uninstall")
  .description(
    "Remove daemon, scripts, plugin, legacy hooks, skills, and CLAUDE.md",
  )
  .action(async () => {
    const {
      removeDaemon,
      getScriptsDir,
      getWorkspace,
      getHomeDir,
    } = require("./platform");
    const { BRIDGE_COMMANDS, SCRIPT_VARS } = require("./onboard");

    console.log();
    console.log(
      `  ${chalk.bold.red("openclaw-claude-bridge")} ${chalk.dim("uninstall")}`,
    );
    console.log(`  ${"─".repeat(40)}`);
    console.log();
    await sleep(300);

    // Daemon
    const sp1 = startSpinner("Stopping daemon...");
    await sleep(400);
    const daemonRemoved = removeDaemon();
    sp1.stop(
      daemonRemoved
        ? "Daemon stopped and removed"
        : chalk.dim("No daemon found"),
    );

    await sleep(200);

    // Scripts
    const sp2 = startSpinner("Removing scripts...");
    await sleep(400);
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
    sp2.stop(
      scriptsRemoved > 0
        ? `Scripts removed from ${scriptsDir}`
        : chalk.dim("No scripts found"),
    );

    await sleep(200);

    // Plugin
    const sp3 = startSpinner("Removing plugin...");
    await sleep(400);
    const homeDir = getHomeDir();
    const pluginDir = path.join(
      homeDir,
      ".openclaw",
      "plugins",
      "claude-bridge",
    );
    const pluginExisted = fs.existsSync(pluginDir);
    if (pluginExisted) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
    sp3.stop(
      pluginExisted
        ? "Plugin removed (claude-bridge)"
        : chalk.dim("No plugin found"),
    );

    await sleep(200);

    // Legacy hook
    const workspace = getWorkspace();
    const hookDir = path.join(workspace, "hooks", "claude-bridge");
    if (fs.existsSync(hookDir)) {
      fs.rmSync(hookDir, { recursive: true, force: true });
    }

    // Legacy Skills
    const skillsDir = path.join(workspace, "skills");
    const skillNames = BRIDGE_COMMANDS.map((c) => c.command);
    let skillsToRemove = [];
    for (const skill of skillNames) {
      const skillFile = path.join(skillsDir, skill, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        skillsToRemove.push(skill);
      }
    }

    if (skillsToRemove.length > 0) {
      const sp4 = startSpinner("Cleaning legacy skills...");
      await sleep(400);
      let skillsRemoved = 0;
      for (const skill of skillsToRemove) {
        const skillFile = path.join(skillsDir, skill, "SKILL.md");
        const skillDir = path.join(skillsDir, skill);
        fs.unlinkSync(skillFile);
        try {
          fs.rmdirSync(skillDir);
        } catch {}
        skillsRemoved++;
      }
      sp4.stop(`Legacy skills removed (${skillsToRemove.join(", ")})`);
      await sleep(200);
    }

    // CLAUDE.md
    const sp5 = startSpinner("Removing CLAUDE.md...");
    await sleep(400);
    const claudeMd = path.join(workspace, "CLAUDE.md");
    const claudeMdExisted = fs.existsSync(claudeMd);
    if (claudeMdExisted) {
      fs.unlinkSync(claudeMd);
    }
    sp5.stop(
      claudeMdExisted ? "CLAUDE.md removed" : chalk.dim("No CLAUDE.md found"),
    );

    await sleep(200);

    // openclaw.json cleanup
    const sp6 = startSpinner("Cleaning openclaw.json...");
    await sleep(400);
    const openclawConfigPath = path.join(homeDir, ".openclaw", "openclaw.json");
    let configCleaned = false;
    let commandsCleaned = false;

    if (fs.existsSync(openclawConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(openclawConfigPath, "utf8"));
        let configChanged = false;

        if (config.plugins?.entries?.["claude-bridge"]) {
          delete config.plugins.entries["claude-bridge"];
          configChanged = true;
        }
        if (config.plugins?.installs?.["claude-bridge"]) {
          delete config.plugins.installs["claude-bridge"];
          configChanged = true;
        }
        if (Array.isArray(config.plugins?.load?.paths)) {
          const before = config.plugins.load.paths.length;
          config.plugins.load.paths = config.plugins.load.paths.filter(
            (p) => p !== pluginDir,
          );
          if (config.plugins.load.paths.length < before) configChanged = true;
        }
        if (Array.isArray(config.plugins?.allow)) {
          const before = config.plugins.allow.length;
          config.plugins.allow = config.plugins.allow.filter(
            (id) => id !== "claude-bridge",
          );
          if (config.plugins.allow.length < before) configChanged = true;
        }
        if (config.plugins?.["claude-bridge"]) {
          delete config.plugins["claude-bridge"];
          configChanged = true;
        }
        configCleaned = configChanged;

        let commandsRemoved = 0;
        if (config.channels) {
          for (const ch of Object.values(config.channels)) {
            if (Array.isArray(ch.customCommands)) {
              const before = ch.customCommands.length;
              ch.customCommands = ch.customCommands.filter(
                (c) => !skillNames.includes(c.command),
              );
              commandsRemoved += before - ch.customCommands.length;
            }
          }
        }
        commandsCleaned = commandsRemoved > 0;
        if (commandsCleaned) configChanged = true;

        if (configChanged) {
          fs.writeFileSync(
            openclawConfigPath,
            `${JSON.stringify(config, null, 2)}\n`,
          );
        }
      } catch {}
    }

    const configParts = [];
    if (configCleaned) configParts.push("plugin config");
    if (commandsCleaned) configParts.push("channel commands");
    sp6.stop(
      configParts.length > 0
        ? `Cleaned openclaw.json (${configParts.join(", ")})`
        : chalk.dim("No config changes needed"),
    );

    await sleep(200);

    // Restart gateway
    const sp7 = startSpinner("Restarting OpenClaw Gateway...");
    await sleep(300);
    let restarted = false;
    try {
      await execAsync("openclaw gateway restart", { timeout: 15000 });
      restarted = true;
    } catch {}

    if (restarted) {
      sp7.stop("Gateway restarted (plugin unloaded)");
    } else {
      sp7.fail(
        chalk.dim("Could not restart gateway (restart manually if needed)"),
      );
    }

    console.log();
    await sleep(300);
    console.log(`  ${chalk.green("\u2705")} Uninstall complete.`);
    console.log();
  });

(async () => {
  await program.parseAsync(process.argv);
})();
