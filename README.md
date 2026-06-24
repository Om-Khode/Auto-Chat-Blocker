# Auto Chat Blocker

Stop the AI chat panel from auto-opening every time you launch your editor.

Works across **VS Code, Cursor, Windsurf**, and other VS Code-based IDEs — it
detects which close command your IDE actually exposes and uses it, so a single
extension covers all of them.

## Why this exists

VS Code-based AI editors force the chat / composer panel open on launch (and
again when you switch folders). There's no built-in toggle, the popular
`settings.json` workaround (`terminal.integrated.commandsToSkipShell`) breaks
after updates, and existing extensions fire a single command once at startup —
which misses the panel because it usually opens *after* the extension activates.

This extension fixes that with three things:

1. **A universal close command** — `workbench.action.closeAuxiliaryBar` exists in
   every fork; the AI chat lives in the auxiliary (secondary side) bar.
2. **Retry with backoff** — closes on a schedule (`0, 400, 900, 1800, 3000 ms`)
   to beat the race condition where the chat opens a moment after launch.
3. **A short burst, not constant fighting** — it only acts during the first
   ~1.2 s after launch (the IDE auto-opens chat near-instantly), then stops. So
   a chat you open yourself afterward stays open. Opening a new folder reloads
   the extension host, which re-runs the startup burst.

It only ever fires commands that *exist in your IDE* (checked via the command
registry), so there are no errors and no accidental re-opening from toggle
commands.

## How it works (and what it can't do)

This extension calls the editor's **close-chat command** directly through the
API. It does **not** touch your keybindings — VS Code extensions cannot read,
remove, or override a user's keybindings, and they don't need to: a custom
keybinding only changes *which key* opens the chat, not the command that opens
it. The chat opens, this extension closes it, regardless of your key setup.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `autoChatBlocker.enable` | `true` | Master on/off switch. |
| `autoChatBlocker.retryDelaysMs` | `[0, 350, 800, 1200]` | Retry schedule (ms from startup) for closing the chat. Kept short so it catches the IDE's near-instant auto-open but finishes before you could open chat yourself. |
| `autoChatBlocker.abortOnUserActivity` | `true` | Cancel remaining startup closes once you start working (typing in a file / opening a terminal), so a chat you opened during the load gap is left alone. |
| `autoChatBlocker.closeOnWindowFocus` | `false` | Also close every time the window regains focus. Off by default — it would close a chat you opened manually then switched away from. Folder/workspace switches already re-trigger the startup close. |
| `autoChatBlocker.extraCloseCommands` | `[]` | Extra command IDs to try first, if your IDE/version uses a different close command. |

## Commands

- **Auto Chat Blocker: Toggle** — enable/disable the blocker.
- **Auto Chat Blocker: Close Chat Now** — manually run the close logic (handy for
  finding the right command on a new IDE).

## Finding the right close command on a new IDE

If the chat isn't closing on your editor:

1. Open the Output panel → **Auto Chat Blocker** channel to see which commands
   were tried.
2. Open the Command Palette and search for "close" / "chat" / "composer" to find
   your IDE's close command.
3. Add it to `autoChatBlocker.extraCloseCommands` — the first one that exists is
   used. Please also open an issue so it can be added to the built-in list.

## Caveats

- `workbench.action.closeAuxiliaryBar` closes whatever is in the auxiliary bar.
  On a fresh launch that's the chat, but if you've docked something else there,
  it will close that too.
- Toggle-style commands (e.g. Copilot's) are only used as a last resort, since
  calling a toggle when the panel is already closed would re-open it.

## Develop

```bash
npm install
npm run watch      # background TypeScript compile
# press F5 in VS Code to launch an Extension Development Host
```

## Package & publish

```bash
npm install -g @vscode/vsce
vsce package                 # produces auto-chat-blocker-x.y.z.vsix
# install the .vsix in any IDE to test, or:
vsce publish                 # needs a publisher + Azure DevOps PAT
```

Set `publisher` in `package.json` to your Marketplace publisher ID before
publishing. Create one at https://marketplace.visualstudio.com/manage.

## License

MIT
