// Generates app/assets/css/md3-tokens.css from the design's MD3 color system.
// Pure-CSS token sets keyed by .light/.dark (color-mode class) + [data-seed].
// Emits both hex and "-rgb" variants (for rgb(var(--x-rgb) / a) state layers).
import { writeFileSync } from 'node:fs'

const NEUTRALS = {
  light: {
    background: '#FDF7FF', 'on-background': '#1C1B1E',
    surface: '#FDF7FF', 'on-surface': '#1C1B1E',
    'surface-dim': '#DED8E0', 'surface-bright': '#FDF7FF',
    'surface-variant': '#E7E0EB', 'on-surface-variant': '#49454E',
    'surface-container-lowest': '#FFFFFF',
    'surface-container-low': '#F7F1FA',
    'surface-container': '#F2EBF4',
    'surface-container-high': '#ECE5EF',
    'surface-container-highest': '#E6DFE9',
    outline: '#7A757F', 'outline-variant': '#CBC4CF',
    'inverse-surface': '#312F33', 'inverse-on-surface': '#F4EFF4',
    scrim: '#000000', shadow: '#000000',
  },
  dark: {
    background: '#141316', 'on-background': '#E6E1E6',
    surface: '#141316', 'on-surface': '#E6E1E6',
    'surface-dim': '#141316', 'surface-bright': '#3A383C',
    'surface-variant': '#49454E', 'on-surface-variant': '#CBC4CF',
    'surface-container-lowest': '#0E0D11',
    'surface-container-low': '#1C1B1E',
    'surface-container': '#201F23',
    'surface-container-high': '#2B292D',
    'surface-container-highest': '#363438',
    outline: '#948F99', 'outline-variant': '#49454E',
    'inverse-surface': '#E6E1E6', 'inverse-on-surface': '#312F33',
    scrim: '#000000', shadow: '#000000',
  },
}

const ACCENTS = {
  purple: {
    light: {
      primary: '#6750A4', 'on-primary': '#FFFFFF',
      'primary-container': '#EADDFF', 'on-primary-container': '#22005D',
      secondary: '#625B71', 'on-secondary': '#FFFFFF',
      'secondary-container': '#E8DEF8', 'on-secondary-container': '#1E192B',
      tertiary: '#7E5260', 'on-tertiary': '#FFFFFF',
      'tertiary-container': '#FFD8E4', 'on-tertiary-container': '#31101D',
      'inverse-primary': '#D0BCFF',
    },
    dark: {
      primary: '#D0BCFF', 'on-primary': '#381E72',
      'primary-container': '#4F378A', 'on-primary-container': '#EADDFF',
      secondary: '#CBC2DB', 'on-secondary': '#332D41',
      'secondary-container': '#4A4458', 'on-secondary-container': '#E8DEF8',
      tertiary: '#EFB8C8', 'on-tertiary': '#4A2532',
      'tertiary-container': '#633B48', 'on-tertiary-container': '#FFD8E4',
      'inverse-primary': '#6750A4',
    },
  },
  blue: {
    light: {
      primary: '#415F91', 'on-primary': '#FFFFFF',
      'primary-container': '#D6E3FF', 'on-primary-container': '#001B3E',
      secondary: '#565F71', 'on-secondary': '#FFFFFF',
      'secondary-container': '#DAE2F9', 'on-secondary-container': '#131C2B',
      tertiary: '#6F5575', 'on-tertiary': '#FFFFFF',
      'tertiary-container': '#F8D8FE', 'on-tertiary-container': '#28132F',
      'inverse-primary': '#AAC7FF',
    },
    dark: {
      primary: '#AAC7FF', 'on-primary': '#0A305F',
      'primary-container': '#284777', 'on-primary-container': '#D6E3FF',
      secondary: '#BEC6DC', 'on-secondary': '#283141',
      'secondary-container': '#3E4759', 'on-secondary-container': '#DAE2F9',
      tertiary: '#DCBCE1', 'on-tertiary': '#3E2845',
      'tertiary-container': '#573E5C', 'on-tertiary-container': '#F8D8FE',
      'inverse-primary': '#415F91',
    },
  },
  teal: {
    light: {
      primary: '#006A6B', 'on-primary': '#FFFFFF',
      'primary-container': '#9CF1F0', 'on-primary-container': '#002020',
      secondary: '#4A6363', 'on-secondary': '#FFFFFF',
      'secondary-container': '#CCE8E7', 'on-secondary-container': '#051F1F',
      tertiary: '#4B607C', 'on-tertiary': '#FFFFFF',
      'tertiary-container': '#D3E4FF', 'on-tertiary-container': '#04253F',
      'inverse-primary': '#80D4D5',
    },
    dark: {
      primary: '#80D4D5', 'on-primary': '#003738',
      'primary-container': '#004F50', 'on-primary-container': '#9CF1F0',
      secondary: '#B0CCCB', 'on-secondary': '#1B3534',
      'secondary-container': '#324B4B', 'on-secondary-container': '#CCE8E7',
      tertiary: '#B3C8E8', 'on-tertiary': '#1C314B',
      'tertiary-container': '#334863', 'on-tertiary-container': '#D3E4FF',
      'inverse-primary': '#006A6B',
    },
  },
  green: {
    light: {
      primary: '#3F6837', 'on-primary': '#FFFFFF',
      'primary-container': '#C0EFB3', 'on-primary-container': '#012200',
      secondary: '#54624D', 'on-secondary': '#FFFFFF',
      'secondary-container': '#D7E8CC', 'on-secondary-container': '#121F0E',
      tertiary: '#386666', 'on-tertiary': '#FFFFFF',
      'tertiary-container': '#BBEBEB', 'on-tertiary-container': '#002020',
      'inverse-primary': '#A5D395',
    },
    dark: {
      primary: '#A5D395', 'on-primary': '#11380B',
      'primary-container': '#28511E', 'on-primary-container': '#C0EFB3',
      secondary: '#BBCBB0', 'on-secondary': '#263420',
      'secondary-container': '#3C4B36', 'on-secondary-container': '#D7E8CC',
      tertiary: '#A0CFCF', 'on-tertiary': '#003738',
      'tertiary-container': '#1F4E4E', 'on-tertiary-container': '#BBEBEB',
      'inverse-primary': '#3F6837',
    },
  },
}

const ERROR = {
  light: {
    error: '#BA1A1A', 'on-error': '#FFFFFF',
    'error-container': '#FFDAD6', 'on-error-container': '#410002',
    success: '#1E6C33', 'on-success': '#FFFFFF',
    'success-container': '#A6F4B6', 'on-success-container': '#00210A',
    warning: '#8A5300', 'on-warning': '#FFFFFF',
    'warning-container': '#FFDDB3', 'on-warning-container': '#2C1700',
  },
  dark: {
    error: '#FFB4AB', 'on-error': '#690005',
    'error-container': '#93000A', 'on-error-container': '#FFDAD6',
    success: '#8BD89A', 'on-success': '#00390F',
    'success-container': '#00531C', 'on-success-container': '#A6F4B6',
    warning: '#F7BB70', 'on-warning': '#492900',
    'warning-container': '#6A3D00', 'on-warning-container': '#FFDDB3',
  },
}

function toRgb(hex) {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`
}

function emit(tokens, indent = '  ') {
  return Object.entries(tokens)
    .map(([k, v]) => `${indent}--md-sys-color-${k}: ${v};\n${indent}--md-sys-color-${k}-rgb: ${toRgb(v)};`)
    .join('\n')
}

let css = `/* AUTO-GENERATED by scripts/gen-md3-tokens.mjs — do not edit by hand.
   Material Design 3 color tokens for AutoPeer. Selected by the color-mode
   class (.light / .dark) plus the [data-seed] attribute on <html>. */\n\n`

// Neutrals + error per mode (seed-independent)
for (const mode of ['light', 'dark']) {
  css += `.${mode} {\n${emit({ ...NEUTRALS[mode], ...ERROR[mode] })}\n}\n\n`
}

// Accents per seed per mode. Purple is also the no-attribute default.
for (const mode of ['light', 'dark']) {
  css += `.${mode},\n.${mode}[data-seed="purple"] {\n${emit(ACCENTS.purple[mode])}\n}\n\n`
  for (const seed of ['blue', 'teal', 'green']) {
    css += `.${mode}[data-seed="${seed}"] {\n${emit(ACCENTS[seed][mode])}\n}\n\n`
  }
}

writeFileSync(new URL('../app/assets/css/md3-tokens.css', import.meta.url), css)
console.log('wrote app/assets/css/md3-tokens.css (' + css.length + ' bytes)')
