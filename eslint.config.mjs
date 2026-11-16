import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

// Next's own flat presets: core web vitals (react, react-hooks, next) and
// typescript-eslint. Same rule set the Driver App uses.
const eslintConfig = [
  { ignores: ['.next/', 'node_modules/', 'next-env.d.ts', 'dist/', 'supabase/functions/', 'coverage/'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Plain apostrophes and quotes in copy are fine (same choice as the Driver App).
      'react/no-unescaped-entities': 'off',
      // React Compiler checks. Real refactor backlog (about 40 places): report them
      // without blocking CI until each screen is fixed.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]

export default eslintConfig
