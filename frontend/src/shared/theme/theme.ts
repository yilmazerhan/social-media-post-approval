import { createTheme } from '@mui/material/styles';

/**
 * One theme for the whole application. Components never hard-code a colour or a spacing value —
 * they read from here, so a brand change is one file and dark mode comes for free.
 */
export const theme = createTheme({
  colorSchemes: { light: true, dark: true },
  cssVariables: { colorSchemeSelector: 'class' },
  typography: {
    fontFamily: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'].join(','),
    button: { textTransform: 'none' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    // An approval decision must never be a single mis-click, so destructive actions stay explicit.
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});
