import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

// The two savings tiers of savvy-flow: what they run on, and the colour of their name.
const SAVINGS = [
  ['sonnet', 'Sonnet · medium', '#D4537E'],
  ['haiku', 'Haiku · medium', '#8DB33A'],
] as const

for (const [tier, runsOn, colour] of SAVINGS) {
  test(`tiers: a task planned for ${tier} keeps its tier`, async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.tool.call({ tool: PROGRESS, title: 'Ship the thing', phase: 'delegate', tasks: [{ title: 'Count the lines', tier }] } as never)

    const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
    const row = (await desktop.findAll({ type: 'Svg' })).map(el => String(el.props.source)).find(source => source.includes('Count the lines')) ?? ''
    // Its name in its own colour, what it runs on beside it, and its own crab.
    expect(row).toContain(`<tspan fill="${colour}">${tier}</tspan>`)
    expect(row).toContain(runsOn)
    expect(row).toContain(`class="c-${tier}"`)

    const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
    expect(await terminal.find({ type: 'Text', text: new RegExp(`${tier} · ${runsOn}`) })).toBeDefined()
  })

  // Shipped in the savvy-flow plugin, the agent is named with the plugin's prefix.
  test(`tiers: a savvy-flow:savvy-${tier} worker is shown as ${tier}`, async ($, on) => {
    mock.clock(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('agent.spawn', () => ({ model: `claude-${tier}-5-5`, agentId: 'a1' }))
    await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Count the lines', subagentType: `savvy-flow:savvy-${tier}`, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)

    const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
    const row = (await desktop.findAll({ type: 'Svg' })).map(el => String(el.props.source)).find(source => source.includes('Count the lines')) ?? ''
    expect(row).toContain(`<tspan fill="${colour}">${tier}</tspan>`)
    expect(row).toContain(`class="c-${tier} run"`)
  })
}
