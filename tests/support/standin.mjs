// A stand-in for Claude Code, for the inbox's end-to-end test and the design shoots: no model, no
// network beyond the office's own hook server. It says over the hooks what state it's in, by a word
// in its prompt, and does real git work so Review and Merge have something to show:
//   [ask]   asks a question (Needs you), waits for the answer typed into its terminal, then writes
//           the answer to a file, commits it and finishes (To review)
//   [done]  writes a file named after the task, commits it and finishes (To review)
//   else    stays at work, printing test lines
// After finishing it waits for more: each line typed in (a send-back note) is another commit and
// another finish. Everything it prints and writes says [demo].
import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT = String.raw`#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
commit() {
  slug=$(printf '%s' "$1" | tr -cs 'A-Za-z0-9' '-' | cut -c1-40 | sed 's/^-*//;s/-*$//')
  [ -n "$slug" ] || slug=work
  post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"'"$slug"'.md"}}'
  printf '# %s\n\n[demo] written by a stand-in agent: %s\n' "$slug" "$1" > "$slug.md"
  git add -A >/dev/null 2>&1
  git -c user.name=demo-agent -c user.email=demo@example.invalid commit -q -m "[demo] $1" >/dev/null 2>&1
  sleep 1
  post Stop '{}'
  echo "[demo] done: committed $slug.md"
}
post SessionStart '{"source":"startup"}'
sleep 1
task=$(echo "$last" | sed 's/\[[a-z]*\] //')
post UserPromptSubmit "{\"prompt\":\"$task\"}"
echo "> $last"
echo "[demo] stand-in agent: no real model runs here"
case "$last" in
  *"[ask]"*)
    post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}'
    echo "[demo] Question: update the snapshot or fix the selector?"
    read answer
    # A paste comes wrapped in bracketed-paste markers: keep the words only.
    answer=$(printf '%s' "$answer" | tr -d '\033' | sed 's/\[20[01]~//g')
    post UserPromptSubmit "{\"prompt\":\"answered\"}"
    commit "$task: $answer"
    ;;
  *"[done]"*)
    post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
    sleep 2
    commit "$task"
    ;;
  *)
    post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
    i=0
    while [ $i -lt 240 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 5; done
    exit 0
    ;;
esac
while read more; do
  more=$(printf '%s' "$more" | tr -d '\033' | sed 's/\[20[01]~//g')
  [ -n "$more" ] || continue
  post UserPromptSubmit "{\"prompt\":\"more\"}"
  commit "$more"
done
`;

/** Writes the stand-in as `claude` in `binDir` and returns its path. */
export function writeStandIn(binDir) {
  const file = path.join(binDir, 'claude');
  writeFileSync(file, SCRIPT);
  chmodSync(file, 0o755);
  return file;
}
