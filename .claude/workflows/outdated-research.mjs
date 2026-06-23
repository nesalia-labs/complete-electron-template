export const meta = {
  name: 'outdated-packages-research',
  description: 'Research changelogs for 7 outdated major packages',
  phases: [
    { title: 'Research electron' },
    { title: 'Research @types/node' },
    { title: 'Research jsdom' },
    { title: 'Research vite' },
    { title: 'Research vitest' },
    { title: 'Research @vitejs/plugin-react' },
    { title: 'Research @electron-toolkit/utils' }
  ]
}

const PACKAGES = [
  {
    name: 'electron',
    from: '35.7.5',
    to: '42.4.1',
    majors: ['36.0.0', '37.0.0', '38.0.0', '39.0.0', '40.0.0', '41.0.0', '42.0.0']
  },
  {
    name: '@types/node',
    from: '22.19.19',
    to: '26.0.0',
    majors: ['23.0.0', '24.0.0', '25.0.0', '26.0.0']
  },
  {
    name: 'jsdom',
    from: '27.4.0',
    to: '29.1.1',
    majors: ['28.0.0', '29.0.0']
  },
  {
    name: 'vite',
    from: '7.3.3',
    to: '8.0.16',
    majors: ['8.0.0']
  },
  {
    name: 'vitest',
    from: '3.2.4',
    to: '4.1.9',
    majors: ['4.0.0']
  },
  {
    name: '@vitejs/plugin-react',
    from: '5.2.0',
    to: '6.0.2',
    majors: ['6.0.0']
  },
  {
    name: '@electron-toolkit/utils',
    from: '3.0.0',
    to: '4.0.0',
    majors: ['4.0.0']
  }
]

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    package: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    versions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          version: { type: 'string' },
          releaseDate: { type: 'string' },
          breakingChanges: { type: 'array', items: { type: 'string' } },
          newFeatures: { type: 'array', items: { type: 'string' } },
          deprecations: { type: 'array', items: { type: 'string' } },
          migrationTips: { type: 'array', items: { type: 'string' } },
          sourceUrl: { type: 'string' }
        },
        required: ['version', 'sourceUrl']
      }
    }
  },
  required: ['package', 'from', 'to', 'versions']
}

const research = await parallel(PACKAGES.map(p => () => {
  phase(`Research ${p.name}`)
  return agent(
    `Research the major-version changelogs for the npm package "${p.name}".

Current version installed in this repo: ${p.from}
Target (latest) version: ${p.to}
Major versions to research: ${p.majors.join(', ')}

For EACH major version listed above, use fresh search and fresh fetch to find:
- Release date (approximate is fine)
- Breaking changes (API changes, removed features, renamed exports, behavior changes)
- New features (highlight the most important ones, 3-7 per version)
- Deprecations (features marked deprecated, scheduled removal)
- Migration tips (how to upgrade from the previous major version)
- Source URL (cite the official release notes / changelog page)

Common sources to try:
- GitHub releases: https://github.com/<owner>/<repo>/releases/tag/v<version>
- GitHub releases list: https://github.com/<owner>/<repo>/releases
- Official blog: search for "${p.name} blog" or "${p.name} release notes"
- Migration guides: search for "${p.name} migration v<version>"

For @types/node: there's no official changelog. Use DefinitelyTyped GitHub releases or the nodejs/node repo.

Return structured data per the schema. Be thorough — the downstream agents will use this data to write 200-400 line documentation files.`,
    {
      label: `research-${p.name}`,
      schema: RESEARCH_SCHEMA,
      agentType: 'Explore'
    }
  )
}))

return { research }