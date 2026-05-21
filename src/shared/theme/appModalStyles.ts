/** Палитра модалок как у section-card / surface-card (--sc-*). */

export const appModalOverlayProps = {
  backgroundOpacity: 0.72,
  blur: 4,
} as const

export const appModalStyles = {
  content: {
    background: 'linear-gradient(165deg, rgba(28, 28, 31, 0.98) 0%, rgba(18, 18, 20, 0.99) 100%)',
    border: '1px solid var(--sc-border)',
    boxShadow: 'var(--sc-shadow-md)',
    overflow: 'visible' as const,
  },
  header: {
    background: 'transparent',
    borderBottom: '1px solid var(--sc-border)',
    paddingBottom: 12,
  },
  title: {
    fontWeight: 700,
    color: '#e8ecf4',
    fontSize: '1.05rem',
  },
  body: {
    paddingTop: 14,
  },
  close: {
    color: 'var(--mantine-color-dimmed)',
  },
} as const

/** @deprecated Используйте appModalStyles */
export const authModalGlowModalStyles = appModalStyles
