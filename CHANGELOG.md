# Change Log

## 0.1.0

- Initial release.
- Cross-IDE chat blocking (VS Code, Cursor, Windsurf, ...) via a prioritized,
  registry-filtered list of close commands.
- Retry-with-backoff to beat the startup race condition.
- Optional re-close on window focus (OFF by default — startup-only blocking, so
  a manually-opened chat is never closed when you switch away and back).
- Stop-on-close: cancels remaining startup retries once the chat tab is observed
  closing (where the chat is an editor tab, e.g. Cursor), avoiding redundant/late
  closes and not fighting a chat you re-open right after launch.
- Abort-on-activity: cancels remaining startup retries when you start working
  (editing a file / opening a terminal).
- Timestamped logging (wall-clock + ms since activation) with the reason each
  close fired.
- Settings: `enable`, `retryDelaysMs`, `abortOnUserActivity`, `closeOnWindowFocus`,
  `extraCloseCommands`, `logTabEvents` (diagnostic, off by default).
- Commands: toggle, close-now.
