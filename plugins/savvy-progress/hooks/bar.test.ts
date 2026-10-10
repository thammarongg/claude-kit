import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const STEP = 'mcp__savvy-progress__step'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

// The flow's own colours, as the band above the prompt draws them.
const RUNNING = '#8f8cf4'
const FINISHED = '#5fbf8f'

// One worker of the given type, known to the panel.
const worker = async ($: Engine, on: On, subagentType: string) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }) as never)
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Do the work', subagentType, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
}

// The filled part of the worker's bar on the desktop: the second rounded rect of its row,
// drawn over the track (the crab's pixels are square).
const barFill = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
  const row = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).find(source => source.includes('Do the work')) ?? ''
  return [...row.matchAll(/<rect[^>]*rx="2"[^>]*\/>/g)][1]?.[0] ?? ''
}

// A tier has its own colour for its name; the bar is the flow's, whatever the tier.
for (const type of ['general-purpose', 'savvy-flow:savvy-careful'] as const) {
  test(`bar: a ${type} worker reporting steps fills in the flow's running colour`, async ($, on) => {
    await worker($, on, type)
    await $.tool.call({ tool: STEP, agentId: 'a1', done: 1, total: 4 } as never)
    expect(await barFill($)).toContain(`fill="${RUNNING}"`)
  })

  test(`bar: a finished ${type} worker is full in the flow's finished colour`, async ($, on) => {
    await worker($, on, type)
    await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a1', reason: 'answer', answer: 'ok', usage: null })
    expect(await barFill($)).toContain(`fill="${FINISHED}"`)
  })
}

// Without reported steps the bar shows context fill, not progress: it stays grey.
test('bar: a worker that reports no steps keeps the grey context fill', async ($, on) => {
  await worker($, on, 'general-purpose')
  const fill = await barFill($)
  expect(fill).toContain('class="m"')
  expect(fill).not.toContain('fill=')
})
