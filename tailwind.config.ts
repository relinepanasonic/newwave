import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Replaces Tailwind's neutral gray with a soft purple-grey tint, so
        // every existing bg-gray-*/text-gray-*/border-gray-* class across the
        // app (page backgrounds, cards, table headers, muted text, dividers)
        // picks up the tint automatically instead of looking stark white/grey.
        gray: {
          50:  '#faf9fc',
          100: '#f3f1f8',
          200: '#e6e2f0',
          300: '#d3cee1',
          400: '#a49dbb',
          500: '#7d7796',
          600: '#5c5674',
          700: '#443f59',
          800: '#2d293c',
          900: '#1c1926',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
