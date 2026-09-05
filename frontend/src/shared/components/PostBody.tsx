import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

/**
 * The one place in the application that renders stored HTML.
 *
 * <p>Post bodies are sanitised server-side with an allow-list policy before they are stored
 * (ARCHITECTURE.md 13.3), which is what makes this safe. Keeping the render in a single component
 * means there is exactly one line to audit — and the lint rule that forbids
 * `dangerouslySetInnerHTML` everywhere else keeps it that way.
 */
export function PostBody({ html, sx }: { html: string; sx?: SxProps<Theme> | undefined }) {
  return (
    <Box
      sx={[
        {
          '& p': { margin: '0 0 0.9em' },
          '& ul, & ol': { paddingLeft: '1.4em' },
          '& a': { color: 'primary.main' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      // eslint-disable-next-line no-restricted-syntax -- the single audited render of sanitised HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
