# Repository Guidelines

## Project Structure & Module Organization
- `index.js`: Bot entry point; loads slash commands and initializes services.
- `COMMANDS/`: Slash command modules (`data` + `execute`). Example: `COMMANDS/blackjack.js`.
- `GAMES/`: Game logic per feature (e.g., `blackjack.js`, `crash.js`).
- `UTILS/`: Shared utilities (database, RNG, logging, panels, sessions).
- `assets/`: Images used by games (UNO, blackjack, slots, etc.).
- `logs/`: Runtime logs (`combined.log`, `error.log`).
- `previousBotCode/`: Reference implementations (Python); do not import.
- `.env` / `.env.example`: Environment variables; never commit secrets.

## Build, Test, and Development Commands
- `npm run dev`: Start with nodemon for live reload.
- `npm start`: Start the bot with Node.
- `npm run setup`: Interactive setup/validation of local config.
- `npm run lint` / `npm run lint:fix`: Lint project and auto‑fix issues.
- Note: `npm test` points to `test.js` (not present). See Testing Guidelines.

## Coding Style & Naming Conventions
- JavaScript (Node 18+), CommonJS `require` imports.
- Indentation: 4 spaces; use semicolons and single quotes.
- Filenames: lowercase with hyphens where needed (e.g., `updateLotteryPanel.js`).
- Commands export `data` (SlashCommandBuilder) and `execute` handler.
- Run `npm run lint` before pushing; keep diffs minimal and focused.

## Testing Guidelines
- No formal test framework configured. Add lightweight tests under `Documentation & Tests/Tests/` or a new `tests/` folder.
- Prefer module‑level tests for `UTILS/` and pure game logic in `GAMES/`.
- For now, create small Node scripts (e.g., `node GAMES/blackjack.test.js`) and add them to `npm test` when introduced.

## Commit & Pull Request Guidelines
- Commits: Use clear, scoped messages. Recommended Conventional Commits (e.g., `feat(commands): add lottery status modal`).
- PRs: Include summary, linked issues, screenshots/log output if UI/embeds change, test plan or manual steps, and notes on env/config changes.
- Keep PRs small and cohesive; describe any migrations or command registration impacts.

## Security & Configuration Tips
- Required env: `DISCORD_TOKEN`, `CLIENT_ID`, `ENVIRONMENT`, Firebase creds (`FIREBASE_*`).
- Use `.env.example` as a template; never commit `.env` or service keys.
- Logs can contain identifiers; avoid logging secrets. Rotate keys if exposed.

