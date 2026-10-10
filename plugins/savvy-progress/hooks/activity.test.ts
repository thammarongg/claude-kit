import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const STEP = 'mcp__savvy-progress__step'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

type ToolUse = { name: string; input: unknown }

// One worker whose model requests ask for the tool calls queued in `asks`, a request each.
const worker = async ($: Engine, on: On, asks: ToolUse[][]) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: asks.shift() ?? [], stopReason: 'tool_use', usage: null } as never
  })
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Look around', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
}

const request = async ($: Engine) => {
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) void _
}

// The worker's row in the terminal panel: the line that ends in its context and cost.
const rowText = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  return (await ui.find({ type: 'Text', text: /ctx \d+%/ }))?.text ?? ''
}

// A tool's name and the one argument that tells its calls apart, never the whole input.
const LABELS: readonly (readonly [use: ToolUse, shown: string])[] = [
  [{ name: 'Read', input: { file_path: '/Users/someone/project/src/register.tsx' } }, 'Read register.tsx'],
  [{ name: 'Edit', input: { file_path: '/repo/README.md', old_string: 'a', new_string: 'b' } }, 'Edit README.md'],
  [{ name: 'Bash', input: { command: 'npm test -- --watch=false', description: 'Run the unit tests' } }, 'Bash Run the unit tests'],
  // Without a description only the program is named: a command's arguments can hold secrets.
  [{ name: 'Bash', input: { command: 'API_TOKEN=abc123 curl -H "Authorization: Bearer sk-secret" https://example.com/api' } }, 'Bash curl'],
  [{ name: 'Grep', input: { pattern: 'costOf\\(', path: '/repo/plugins' } }, 'Grep costOf\\('],
  [{ name: 'Agent', input: { description: 'Find the callers', prompt: 'a long brief' } }, 'Agent Find the callers'],
  [{ name: 'WebFetch', input: { url: 'https://docs.example.com/a/b?token=abc', prompt: 'x' } }, 'WebFetch docs.example.com'],
  [{ name: 'WebFetch', input: { url: 'https://user:hunter2@internal.example.com:8443/x' } }, 'WebFetch internal.example.com'],
  [{ name: 'mcp__plugin_playwright_playwright__browser_click', input: { ref: 'e12' } }, 'browser_click'],
  [{ name: 'TodoWrite', input: { todos: [] } }, 'TodoWrite'],
  [{ name: 'Read', input: null }, 'Read'],
]

for (const [use, shown] of LABELS) {
  test(`activity: ${use.name} is shown as "${shown}"`, async ($, on) => {
    await worker($, on, [[use]])
    await request($)
    expect(await rowText($)).toContain(`${shown} · ctx`)
  })
}

test('activity: calls asked for together show the first and how many more', async ($, on) => {
  await worker($, on, [[{ name: 'Read', input: { file_path: '/repo/a.ts' } }, { name: 'Read', input: { file_path: '/repo/b.ts' } }, { name: 'Grep', input: { pattern: 'x' } }]])
  await request($)
  expect(await rowText($)).toContain('Read a.ts +2 · ctx')
})

test('activity: a long label is cut short', async ($, on) => {
  await worker($, on, [[{ name: 'Agent', input: { description: 'x'.repeat(500) } }]])
  await request($)
  const text = await rowText($)
  expect(text).toContain('…')
  expect(text.length).toBeLessThan(200)
})

test('activity: a request that asks for no tool keeps the last one', async ($, on) => {
  await worker($, on, [[{ name: 'Read', input: { file_path: '/repo/a.ts' } }], []])
  await request($)
  await request($)
  expect(await rowText($)).toContain('Read a.ts · ctx')
})

// On a finished row it reads as the last thing the worker did.
test('activity: a finished worker keeps its last one', async ($, on) => {
  await worker($, on, [[{ name: 'Read', input: { file_path: '/repo/a.ts' } }]])
  await request($)
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a1', reason: 'answer', answer: 'ok', usage: null })
  expect(await rowText($)).toContain('Read a.ts · ctx')
})

test('activity: steps the worker reports itself come first', async ($, on) => {
  await worker($, on, [[{ name: 'Read', input: { file_path: '/repo/a.ts' } }]])
  await request($)
  await $.tool.call({ tool: STEP, agentId: 'a1', done: 1, total: 3, note: 'Reading' } as never)
  const text = await rowText($)
  expect(text).toContain('1/3 Reading · ctx')
  expect(text).not.toContain('Read a.ts')
})

test('activity: a worker that has asked for nothing shows nothing there', async ($, on) => {
  await worker($, on, [])
  expect(await rowText($)).toMatch(/^\s+\S+ ctx 0%/)
})

test('activity: the desktop row carries it too', async ($, on) => {
  await worker($, on, [[{ name: 'Read', input: { file_path: '/repo/src/<odd> & name.ts' } }]])
  await request($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
  const rows = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  // Escaped, as every other text in the drawing is.
  expect(rows).toContain('Read &lt;odd&gt; &amp; name.ts')
})
