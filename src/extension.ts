import * as vscode from 'vscode';

/**
 * Candidate commands that close the AI chat / auxiliary bar, in priority order.
 *
 * The FIRST entry is a standard VS Code command present in every fork
 * (VS Code, Cursor, Windsurf, Trae, ...). The rest are IDE-specific fallbacks.
 *
 * IMPORTANT: prefer explicit "close" commands over "toggle" commands. A toggle
 * called when the panel is already closed would RE-OPEN it. We mark toggles so
 * they are only used as a last resort.
 */
interface CloseCommand {
  id: string;
  /** A toggle flips visibility; only safe to fire if nothing else worked. */
  toggle?: boolean;
}

const BUILTIN_CLOSE_COMMANDS: CloseCommand[] = [
  { id: 'workbench.action.closeAuxiliaryBar' },              // universal (all forks)
  { id: 'composer.closeComposerTab' },                       // Cursor chat tab
  { id: 'aichat.close' },                                    // Cursor (older)
  { id: 'workbench.panel.chat.view.copilot.toggleVisibility', toggle: true }, // Copilot (last resort)
];

const log = vscode.window.createOutputChannel('Auto Chat Blocker');

/** Set in activate(); used to report ms elapsed since the extension started. */
let activatedAt = 0;

/** "[16:02:03.091 | +812ms]" — wall-clock time plus time since activation. */
function stamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const elapsed = activatedAt ? Date.now() - activatedAt : 0;
  return `[${hh}:${mm}:${ss}.${ms} | +${elapsed}ms]`;
}

function config() {
  return vscode.workspace.getConfiguration('autoChatBlocker');
}

/**
 * PROTOTYPE / DIAGNOSTIC ONLY.
 * Describe a tab's input so we can learn how the chat/agent tab surfaces in the
 * tabGroups API across IDEs (type, viewType, uri). Not used by the close logic.
 */
function describeTabInput(input: unknown): string {
  if (input === undefined || input === null) {
    return 'input=none (likely a panel/view, not an editor tab)';
  }
  if (typeof input !== 'object') {
    return `input=${String(input)}`;
  }
  const anyInput = input as Record<string, unknown>;
  const parts: string[] = [`inputType=${anyInput.constructor?.name ?? 'unknown'}`];
  const viewType = anyInput.viewType;
  if (typeof viewType === 'string') {
    parts.push(`viewType=${viewType}`);
  }
  const uri = anyInput.uri as { toString?: () => string } | undefined;
  if (uri?.toString) {
    parts.push(`uri=${uri.toString()}`);
  }
  return parts.join(' ');
}

/**
 * Heuristic: does this tab look like an AI chat/agent tab (e.g. Cursor's
 * "New Agent" / "New Chat" composer)? Those surface as tabs with NO editor
 * input (no uri/viewType) and a chat-ish label. Requiring a null input avoids
 * matching a real file that happens to be named "chat.ts" (which has a
 * TabInputText input). Used only to detect when the chat tab has closed.
 */
function looksLikeChatTab(tab: vscode.Tab): boolean {
  if (tab.input !== undefined && tab.input !== null) {
    return false;
  }
  return /\b(agent|chat|composer)\b/i.test(tab.label);
}

function logTabSnapshot(prefix: string): void {
  const groups = vscode.window.tabGroups.all;
  log.appendLine(`${stamp()} ${prefix}: ${groups.length} tab group(s).`);
  for (const group of groups) {
    for (const tab of group.tabs) {
      log.appendLine(
        `${stamp()}   • label="${tab.label}" active=${tab.isActive} ${describeTabInput(tab.input)}`
      );
    }
  }
}

function isEnabled(): boolean {
  return config().get<boolean>('enable', true);
}

/**
 * Build the ordered list of close commands: any user-provided extras first
 * (highest priority), then the built-ins.
 */
function getCloseCommands(): CloseCommand[] {
  const extras = config().get<string[]>('extraCloseCommands', []);
  return [...extras.map((id) => ({ id })), ...BUILTIN_CLOSE_COMMANDS];
}

/**
 * Close the chat panel using the first command that actually exists in the
 * current IDE. Filtering by getCommands() avoids errors on commands that don't
 * exist in this fork, and avoids firing a toggle that would re-open the panel.
 */
async function blockChat(reason: string): Promise<void> {
  if (!isEnabled()) {
    return;
  }

  const available = new Set(await vscode.commands.getCommands(true));

  for (const cmd of getCloseCommands()) {
    if (!available.has(cmd.id)) {
      continue;
    }
    try {
      await vscode.commands.executeCommand(cmd.id);
      log.appendLine(`${stamp()} ${reason}: closed chat via "${cmd.id}".`);
      return;
    } catch (err) {
      log.appendLine(`${stamp()} ${reason}: command "${cmd.id}" failed: ${String(err)}. Trying next.`);
    }
  }

  log.appendLine(
    `${stamp()} ${reason}: no matching close command found for ${vscode.env.appName}. ` +
      `Add one via the "autoChatBlocker.extraCloseCommands" setting.`
  );
}

export function activate(context: vscode.ExtensionContext): void {
  activatedAt = Date.now();
  // process.uptime() = seconds since the extension-host process started, a
  // stable reference near launch. Compare this across activation events to see
  // whether "*" actually activates the extension earlier than onStartupFinished.
  const uptimeMs = Math.round(process.uptime() * 1000);
  log.appendLine(
    `${stamp()} Auto Chat Blocker active on ${vscode.env.appName} (${vscode.version}). ` +
      `Activated ${uptimeMs}ms after extension host start.`
  );

  // 0. PROTOTYPE diagnostic: observe how the chat/agent tab appears in the
  //    tabGroups API. Logs the tab layout at activation, then every tab
  //    open/close/change for the whole session so you can also open the agent
  //    tab manually and watch what shows up. Toggle with `logTabEvents`.
  if (config().get<boolean>('logTabEvents', true)) {
    logTabSnapshot('Tabs at activation');
    context.subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs((e) => {
        for (const tab of e.opened) {
          log.appendLine(`${stamp()} TAB opened: label="${tab.label}" ${describeTabInput(tab.input)}`);
        }
        for (const tab of e.closed) {
          log.appendLine(`${stamp()} TAB closed: label="${tab.label}" ${describeTabInput(tab.input)}`);
        }
        for (const tab of e.changed) {
          log.appendLine(
            `${stamp()} TAB changed: label="${tab.label}" active=${tab.isActive} ${describeTabInput(tab.input)}`
          );
        }
      })
    );
  }

  // 1. Beat the race condition: the chat frequently opens a moment AFTER
  //    onStartupFinished fires. Retry on a short backoff schedule.
  //
  //    Edge case: the extension can activate seconds after the IDE is already
  //    usable. If you open the chat yourself in that gap, the burst would close
  //    it. We can't see events from before activation, but we CAN tell you're
  //    actively present: if you start doing real work (typing in a file,
  //    opening a terminal), we cancel the remaining startup closes and assume
  //    any visible chat is yours.
  if (isEnabled()) {
    const delays = config().get<number[]>('retryDelaysMs', [0, 350, 800, 1200]);
    const abortOnActivity = config().get<boolean>('abortOnUserActivity', true);
    log.appendLine(`${stamp()} Scheduling startup close attempts at: ${delays.join(', ')} ms.`);

    const timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;
    const stopBurst = (why: string) => {
      if (stopped) {
        return;
      }
      stopped = true;
      for (const t of timers) {
        clearTimeout(t);
      }
      log.appendLine(`${stamp()} Stopping remaining startup closes: ${why}.`);
    };

    for (const ms of delays) {
      const handle = setTimeout(() => {
        if (stopped) {
          return;
        }
        void blockChat(`startup retry (scheduled +${ms}ms)`);
      }, ms);
      timers.push(handle);
      // Best-effort cleanup if the extension deactivates mid-schedule.
      context.subscriptions.push({ dispose: () => clearTimeout(handle) });
    }

    // Stop-on-close: once a chat-like tab disappears, our job is done. This
    // removes redundant/late retries and, crucially, means a chat you re-open
    // right after launch won't be re-closed by a stray scheduled retry. Only
    // effective where the chat is an editor tab (e.g. Cursor); on VS Code the
    // chat is an auxiliary-bar view, so this simply never fires and the burst
    // runs as before.
    const onTabClose = vscode.window.tabGroups.onDidChangeTabs((e) => {
      if (e.closed.some(looksLikeChatTab)) {
        stopBurst('chat tab closed');
      }
    });
    context.subscriptions.push(onTabClose);

    const disposeActivity: vscode.Disposable[] = [onTabClose];
    if (abortOnActivity) {
      // Real edits to a file/untitled doc are a clean "user is working" signal —
      // startup editor *restoration* opens docs but doesn't change their text,
      // so this won't misfire during load.
      const onEdit = vscode.workspace.onDidChangeTextDocument((e) => {
        const scheme = e.document.uri.scheme;
        if (e.contentChanges.length > 0 && (scheme === 'file' || scheme === 'untitled')) {
          stopBurst('user activity: editing a file');
        }
      });
      const onTerminal = vscode.window.onDidOpenTerminal(() =>
        stopBurst('user activity: opened a terminal')
      );
      context.subscriptions.push(onEdit, onTerminal);
      disposeActivity.push(onEdit, onTerminal);
    }

    // Stop listening once the burst window has passed — no point watching after.
    const maxDelay = delays.length ? Math.max(...delays) : 0;
    const cleanup = setTimeout(() => {
      for (const d of disposeActivity) {
        d.dispose();
      }
    }, maxDelay + 500);
    context.subscriptions.push({ dispose: () => clearTimeout(cleanup) });
  }

  // 2. Optional, OFF by default: re-close when the window regains focus.
  //    Disabled by default because it cannot distinguish a chat you opened
  //    manually from one the IDE auto-opened, so it would close yours when you
  //    alt-tab back. Opening a new folder/workspace reloads the extension host
  //    and re-runs the startup close above, so this is rarely needed.
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused && config().get<boolean>('closeOnWindowFocus', false)) {
        void blockChat('window focus');
      }
    })
  );

  // 3. Toggle command — enable/disable the blocker.
  context.subscriptions.push(
    vscode.commands.registerCommand('autoChatBlocker.toggle', async () => {
      const next = !isEnabled();
      await config().update('enable', next, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Auto Chat Blocker is now ${next ? 'enabled' : 'disabled'} (${vscode.env.appName}).`
      );
    })
  );

  // 4. Manual "close now" command — useful for testing the close commands.
  context.subscriptions.push(
    vscode.commands.registerCommand('autoChatBlocker.closeNow', () => blockChat('manual closeNow'))
  );

  context.subscriptions.push(log);
}

export function deactivate(): void {
  // Nothing to clean up beyond the disposables registered above.
}
