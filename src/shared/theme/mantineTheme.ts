import { createTheme } from '@mantine/core'

export const appTheme = createTheme({
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: '700',
  },
  primaryColor: 'blue',
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Modal: {
      defaultProps: {
        radius: 'md',
        centered: true,
        removeScrollProps: { removeScrollBar: false },
      },
    },
    Card: {
      defaultProps: {
        radius: 'md',
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    NumberInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
    },
    Paper: {
      defaultProps: {
        radius: 'md',
      },
    },
    Alert: {
      defaultProps: {
        radius: 'md',
      },
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Accordion: {
      styles: {
        control: {
          borderRadius: 10,
        },
        item: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
        },
      },
    },
    Table: {
      styles: {
        table: {
          borderRadius: 10,
          overflow: 'hidden',
        },
      },
    },
  },
})
