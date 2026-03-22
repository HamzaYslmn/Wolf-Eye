# MARK: Standalone fix
if __name__ == '__main__':
  import sys; from pathlib import Path
  sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio
from collections import deque
from ai import log, client, MODEL, NUM_CTX
from ai.tools import TOOLS
from ai.agents import AGENTS

MAX_STEPS = 10

INSTRUCTION = """
  You are Wolf-Eye, a military drone command AI. Be concise — 2-3 sentences max. Understand English and Turkish.

  [QUERY] tools (data gathering, LLM continues reasoning):
    query_data(table, name?) — DB lookup
    scan_area(radius_m?) — nearby entities with tag/color

  [ACTION] tools (performs an action, LLM continues reasoning):
    dispatch_drone(lat, lon) — send closest drone
    send_comms(tag, message, recipient?) — transmit message as WOLF-EYE

  [GET/FINAL] tools (result goes directly to user):
    get_camera_feed(name) — raw camera image
    aim_at_target(query, target?) — YOLO lock-on + servo

  [AGENT/FINAL] (AI analysis, result goes directly to user):
    analyze_camera(query) — vision threat assessment
    analyze_sitrep(message) — comms intel analysis

  Routing:
  - "What does drone see?" / "ne görüyorsun?" → analyze_camera
  - "Lock onto" / "kilitlen" / "nişan al" → aim_at_target (target: person, car, truck, bus)
  - "Send message" / "mesaj gönder" → send_comms
  - "Enemies nearby?" / "yakında düşman var mı?" → scan_area → filter by tag
  - [memory] tags = previous conversations
"""

# MARK: Brain
class Brain:
  def __init__(self, instruction: str = INSTRUCTION, history: bool = True):
    self.instruction = instruction
    self._fns = {**TOOLS, **AGENTS}
    self._history: deque[tuple[str, str]] | None = deque(maxlen=3) if history else None

  # MARK: Build messages from history
  def _build(self, message: str) -> list:
    msgs = []
    if self.instruction:
      msgs.append({'role': 'system', 'content': self.instruction})
    if self._history:
      for q, a in self._history:
        msgs.append({'role': 'user', 'content': f'[memory] {q}'})
        msgs.append({'role': 'assistant', 'content': f'[memory] {a}'})
    msgs.append({'role': 'user', 'content': message})
    return msgs

  # MARK: Execute a single tool call
  async def _exec(self, tc) -> tuple[str, bool]:
    fn = self._fns.get(tc.function.name)
    if not fn:
      return f'Unknown: {tc.function.name}', False
    try:
      result = fn(**tc.function.arguments)
      if asyncio.iscoroutine(result):
        result = await result
      if not isinstance(result, str):
        result = str(result)
    except BaseException as e:
      log.error('%s failed: %s', tc.function.name, e)
      return f'Error: {e}', False
    return result, getattr(fn, 'final', False)

  # MARK: Auto tool-call loop
  async def run(self, message: str) -> str:
    msgs = self._build(message)
    for step in range(MAX_STEPS):
      try:
        resp = await client.chat(
          model=MODEL,
          messages=msgs,
          tools=list(self._fns.values()),
          think='medium',
          options={'num_ctx': NUM_CTX},
        )
      except BaseException as e:
        log.error('LLM error: %s', e)
        return f'Error: {e}'

      msgs.append(resp.message)

      if not resp.message.tool_calls:
        reply = resp.message.content or ''
        if self._history is not None:
          self._history.append((message, reply))
        return reply

      for tc in resp.message.tool_calls:
        log.info('[%d/%d] %s(%s)', step + 1, MAX_STEPS, tc.function.name, tc.function.arguments)
        result, final = await self._exec(tc)
        if final:
          if self._history is not None:
            self._history.append((message, result))
          return result
        msgs.append({'role': 'tool', 'content': result, 'tool_name': tc.function.name})

    return f'Reached max {MAX_STEPS} steps.'


# MARK: CLI — interactive REPL + --test batch mode
if __name__ == '__main__':
  import sys
  import asyncio

  DIM, BOLD, CYAN, GREEN, YELLOW, RESET = '\033[2m', '\033[1m', '\033[36m', '\033[32m', '\033[33m', '\033[0m'

  TEST_TASKS = [
    'analyze visual threat from drone 1 camera',
    'what do you see in security cam 1',
    'send closest drone to track [40.500, 29.900]',
    'are there any enemies within 200 meters?',
    'is there a friendly resupply point within 500 meters?',
    'check comms, any active threats?',
    'lock onto the target on drone1',
    'what is my previous request, memorize it',
  ]

  def banner(m: Brain):
    print(f'\n{BOLD}  Wolf-Eye AI{RESET}')
    print(f'{DIM}  Model: {MODEL} · Memory: {m._history.maxlen} turns{RESET}')
    print(f'{DIM}  Tools: {", ".join(TOOLS)} · Agents: {", ".join(AGENTS)}{RESET}')
    print(f'{DIM}  /help /clear /test /history /tools /quit{RESET}\n')

  async def run_batch(m: Brain):
    for msg in TEST_TASKS:
      print(f'\n{YELLOW}{"="*60}{RESET}\n{BOLD}>> {msg}{RESET}\n{YELLOW}{"="*60}{RESET}')
      print(await m.run(msg))

  async def run_interactive(m: Brain):
    banner(m)
    while True:
      try:
        msg = input(f'{GREEN}>> {RESET}').strip()
      except (EOFError, KeyboardInterrupt):
        print(f'\n{DIM}Bye.{RESET}'); break
      if not msg:
        continue

      cmd = msg.lower()
      if cmd in ('/quit', '/q', 'q'):
        print(f'{DIM}Bye.{RESET}'); break
      if cmd in ('/clear', '/cls'):
        print('\033c', end=''); banner(m); continue
      if cmd == '/help':
        print(f'{DIM}/help /clear /test /history /tools /quit{RESET}'); continue
      if cmd == '/test':
        await run_batch(m); continue
      if cmd == '/history':
        for q, a in m._history:
          print(f'  {CYAN}user{RESET}: {q[:120]}\n  {GREEN}ai{RESET}: {a[:120].replace(chr(10), " ")}')
        if not m._history: print(f'{DIM}(empty){RESET}')
        continue
      if cmd == '/tools':
        print(f'{DIM}Tools:{RESET} {", ".join(TOOLS)}\n{DIM}Agents:{RESET} {", ".join(AGENTS)}'); continue

      print(await m.run(msg))

  asyncio.run(run_interactive(Brain(instruction=INSTRUCTION, history=True)) if '--test' not in sys.argv else run_batch(Brain(instruction=INSTRUCTION, history=True)))
