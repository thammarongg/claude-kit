import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

// Three workers: one still running, one that answered, one whose turn ended in an error.
const crew = async ($: Engine, on: On) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${++n}` }))
  on('turn.complete', () => ({ text: '' }) as never)
  for (const [i, description] of ['Still going', 'All good', 'Went wrong'].entries()) {
    await $.agent.spawn({ tool_use_id: `t${i}`, prompt: 'p', description, subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  }
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a2', reason: 'answer', answer: 'ok', usage: null })
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a3', reason: 'error', answer: '', usage: null })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`layout ${surface}: a failed worker has a group of its own, in the error colour`, async ($, on) => {
    await crew($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'savvy-agents', props: pane })
    const head = await ui.find({ type: 'Text', text: /^Error · 1$/ })
    expect(head?.props.color).toBe('error')
    // The finished group counts what finished well, and no longer the failure.
    expect((await ui.find({ key: 'done' }))?.props.label).toBe('▾ Finished · 1')
    expect(await ui.find({ type: 'Text', text: /^Running · 1$/ })).toBeDefined()
  })

  // What can be pressed is drawn as a button, not as a word among the text.
  test(`layout ${surface}: the panel's controls are drawn as buttons`, async ($, on) => {
    await crew($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'savvy-agents', props: pane })
    for (const key of ['compact', 'done']) {
      const button = await ui.find({ key })
      expect(button?.type).toBe('Button')
      expect(button?.props.plain).toBeUndefined()
      expect(button?.props.variant).toBe('secondary')
    }
    // Folding the panel keeps the control, now saying what it will do.
    await ui.press({ key: 'compact' })
    expect((await ui.find({ key: 'compact' }))?.props.label).toBe('Expand')
  })
}

test('layout: the summary card counts the crew and marks the failed', async ($, on) => {
  await crew($, on)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
  const drawings = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source))
  const card = drawings.find(source => source.includes('>Agents<')) ?? ''
  expect(card).toContain('>3</text>')
  expect(card).toContain('>1 ✕</text>')
  // One card for the figures, not a tile each.
  expect(card.match(/class="tile"/g)).toHaveLength(1)
  // The failed worker's row: the word and the bar in the error colour.
  const row = drawings.find(source => source.includes('Went wrong')) ?? ''
  expect(row).toContain('<tspan class="er">  ·  error</tspan>')
  expect(row).toMatch(/<rect class="er"[^>]*rx="2"\/>/)
})

test('layout: with no failure the card has no failed mark', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Still going', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
  const card = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).find(source => source.includes('>Agents<')) ?? ''
  expect(card).toContain('>1</text>')
  expect(card).not.toContain('✕')
  expect(await ui.find({ type: 'Text', text: /^Error/ })).toBeUndefined()
})
