---
name: run-porphyrion
description: Build, run, start, stop, smoke-test, or screenshot Porphyrion (C API-client server sam-porter + web UI on :8099). Use when asked to run the app, test the proxy/stress/save endpoints, drive the web UI, or confirm a frontend/backend change works.
---

# Run Porphyrion

Porphyrion = C server `sam-porter` (libcurl proxy, port 8099, hardcoded) serving a single-page UI from `web/`.
Agent path: build + run natively in **WSL Ubuntu** under tmux, smoke the backend with `curl`, drive the UI with
`.claude/skills/run-porphyrion/driver.mjs` (Playwright, headless Edge). Paths below are relative to repo root.
Verified on Windows 11 + WSL2 Ubuntu 22.04 (host has no gcc; docker/podman daemons were down, so not used).

## Prerequisites (once)

```bash
wsl -d Ubuntu -u root -- bash -lc 'apt-get update -qq && apt-get install -y libcurl4-openssl-dev gcc-12 tmux'
npm i --prefix .claude/skills/run-porphyrion --no-save --no-audit --no-fund playwright-core
```

## Build

```bash
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/nikmy/Projects/Porphyrion && make -j CC=gcc-12 OBJ_DIR=/tmp/porph-obj'
```

Produces `./sam-porter` (~40 KB, gitignored). Takes ~1 s.

## Run (agent path)

Start (server resolves `web/`, `resources/`, `data/` relative to cwd — must start from repo root):

```bash
wsl -d Ubuntu -- bash -lc 'pkill -x sam-porter; cd /mnt/c/Users/nikmy/Projects/Porphyrion && tmux new-session -d -s porph ./sam-porter; sleep 1; pgrep -a sam-porter'
```

`localhost:8099` is reachable from both Windows and WSL.

Backend smoke (all verified):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8099/          # 200, serves web/index.html
curl -s localhost:8099/requests.json                                     # [] when data/requests.json absent
curl -si -X POST localhost:8099/proxy \
  -H "X-Proxy-URL: $(printf https://httpbin.org/get | base64)" -H "X-Proxy-Method: GET"
curl -s -X POST localhost:8099/stress/start -d '{"vus":4,"reqs":200,"wait_ms":0,"timeout_ms":5000,"steps":[{"method":"GET","url":"http://localhost:8099/requests.json"}]}'
curl -s localhost:8099/stress/status     # {"running":0,"completed":800,"ok":800,...,"rps":...}
```

UI driver — loads page, picks method, fills URL, clicks Send, waits for `#resp`, prints badge/timing/body, screenshots:

```bash
node .claude/skills/run-porphyrion/driver.mjs https://httpbin.org/get GET --out "$TEMP/porph.png"
node .claude/skills/run-porphyrion/driver.mjs https://httpbin.org/get GET --dark --out "$TEMP/porph-dark.png"
```

Args: `[targetUrl] [METHOD] [--dark] [--out file.png] [--base http://localhost:8099]`. `PW_CHANNEL=chrome` to use
Chrome instead of Edge. Extend the script for other flows (selectors: `#method #url #sendBtn #saveBtn #resp #badge
#timing #respSize #darkToggle #corsToggle`). Then read the PNG to actually look at it.

Unit check for the assertion engine (no server needed):

```bash
node tests/assert_test.js
```

Stop:

```bash
wsl -d Ubuntu -- bash -lc 'pkill -x sam-porter'
```

## Run (human path)

`./deploy.sh` builds the scratch image with podman/docker and runs it on :8099 with `data/` and `web/` bind-mounted.
Not verified here (no running container engine).

## Gotchas

- **`/proxy` always returns outer HTTP 200.** Upstream status is in `X-Proxy-Status`; upstream headers are base64 in
  `X-Resp-Headers`. Proxy inputs are headers: `X-Proxy-URL`, `X-Proxy-CT`, `X-Proxy-Headers` (base64, `\n`-joined) and
  `X-Proxy-Method` (plain). Body = raw request body.
- **Frontend/backend protocol drift is the bug to watch.** At `54dca4e`, `app.js` posted `/proxy` as form-urlencoded,
  so UI Send showed `{"error": "Missing proxy URL"}`. That's fixed by `proxyFetch()`. If the driver prints that error
  again, the contract has drifted. `54dca4e`'s CSS also renders the History/Environment panels inline at the top of
  the page in light mode (still unfixed).
- **OAuth / assertions E2E** needs a token server. A Python stdlib mock on :9000 run inside WSL works: Edge on Windows
  reaches it via localhost forwarding, and sam-porter in WSL reaches it directly. Playwright `page.fill` refuses the
  hidden `#oaRefresh`/`#oaExpires` inputs, so set them with `page.evaluate`.
- **`pkill -f <script>` inside `wsl -- bash -lc "..."` kills its own shell** if the pattern appears in the command
  line. Kill in one `wsl` call and start in another.
- **`reqs` in `/stress/start` is per VU** — 4 VUs × 200 = 800 completed.
- **`/save` overwrites `data/requests.json`** (user's real saved requests). Back it up before poking it.
- **Makefile needs gcc ≥ 12** (`-ftrivial-auto-var-init=zero`); Ubuntu 22.04 default gcc 11 fails.
- **`npm i` without `--prefix`** in the skill dir silently installs into the nearest ancestor `node_modules`
  (here `C:\Users\nikmy\Projects\node_modules`). Repo `.gitignore` has `*.json`, so no `package.json` is committed.
- **QUERY method** is passed through verbatim by libcurl; httpbin answers 405 (in `X-Proxy-Status`), that's upstream.
- Startup log line is block-buffered under tmux/tee — no output isn't a hang; check `pgrep` / curl.
- `localhost` URLs get rewritten only when `/run/.containerenv` exists (podman); natively they hit WSL localhost.

## Troubleshooting

- `cc: error: unrecognized command-line option '-ftrivial-auto-var-init=zero'` → `CC=gcc-12`.
- `apt-get install` 404 on `libcurl4-openssl-dev` → run `apt-get update` first.
- Stale server from an earlier run still answering → `pkill -x sam-porter` (a `tmux kill-session` in a separate
  `wsl` call didn't kill it).
- `wsl ... wslpath "$(cygpath -w …)"` mangles backslashes from Git Bash → just use `/mnt/c/...` paths.
