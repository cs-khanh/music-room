import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#080A0F',
        foreground: '#F7F8FA',
        panel: '#121620',
        muted: '#8B93A7',
        accent: '#35C7A4',
        danger: '#FF5F6D'
      }
    }
  },
  plugins: []
};

export default config;
