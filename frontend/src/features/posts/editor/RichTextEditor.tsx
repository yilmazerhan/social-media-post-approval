import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';

/**
 * A deliberately small rich-text editor: bold, italic, underline, two kinds of list, and links.
 *
 * <p>Nothing more, on purpose. A corporate post is not a word-processing document, and every tag the
 * editor can produce has to survive the server's allow-list sanitiser anyway — so offering headings,
 * tables or colours would only create formatting that silently disappears on save.
 *
 * <p>Paste is forced to plain text. Pasting from a word processor is the single most common way that
 * hostile markup and unreviewable styling enter a content system.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your content…',
  disabled = false,
  ariaLabel = 'Post content',
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  ariaLabel?: string | undefined;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);

  // The DOM owns the caret, so the editor is only re-seeded when the value changes underneath it
  // (loading a post, restoring a version) rather than on every keystroke.
  useEffect(() => {
    const element = editorRef.current;
    if (element && element.innerHTML !== value) {
      element.innerHTML = value;
    }
  }, [value]);

  const refreshActiveFormats = useCallback(() => {
    const formats: string[] = [];
    (
      [
        ['bold', 'bold'],
        ['italic', 'italic'],
        ['underline', 'underline'],
        ['insertUnorderedList', 'ul'],
        ['insertOrderedList', 'ol'],
      ] as const
    ).forEach(([command, name]) => {
      try {
        if (document.queryCommandState(command)) formats.push(name);
      } catch {
        // queryCommandState throws in some browsers when the selection is outside the editor.
      }
    });
    setActiveFormats(formats);
  }, []);

  const exec = (command: string, argument?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    refreshActiveFormats();
    emit();
  };

  const emit = () => {
    const element = editorRef.current;
    if (element) onChange(element.innerHTML);
  };

  const addLink = () => {
    const url = window.prompt('Link address (https://…)');
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
      window.alert('Only https:// and mailto: links are allowed.');
      return;
    }
    exec('createLink', url);
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ p: 0.75, flexWrap: 'wrap' }}
        role="toolbar"
        aria-label="Formatting"
      >
        <ToggleButtonGroup size="small" value={activeFormats} sx={{ flexWrap: 'wrap' }}>
          <ToggleButton value="bold" onClick={() => exec('bold')} disabled={disabled} aria-label="Bold">
            <FormatBoldIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="italic" onClick={() => exec('italic')} disabled={disabled} aria-label="Italic">
            <FormatItalicIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton
            value="underline"
            onClick={() => exec('underline')}
            disabled={disabled}
            aria-label="Underline"
          >
            <FormatUnderlinedIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton
            value="ul"
            onClick={() => exec('insertUnorderedList')}
            disabled={disabled}
            aria-label="Bulleted list"
          >
            <FormatListBulletedIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton
            value="ol"
            onClick={() => exec('insertOrderedList')}
            disabled={disabled}
            aria-label="Numbered list"
          >
            <FormatListNumberedIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Add link">
          <span>
            <ToggleButton
              value="link"
              size="small"
              onClick={addLink}
              disabled={disabled}
              aria-label="Add link"
            >
              <LinkIcon fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
        <Tooltip title="Remove link">
          <span>
            <ToggleButton
              value="unlink"
              size="small"
              onClick={() => exec('unlink')}
              disabled={disabled}
              aria-label="Remove link"
            >
              <LinkOffIcon fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
      </Stack>
      <Divider />
      <Box
        ref={editorRef}
        component="div"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyUp={refreshActiveFormats}
        onMouseUp={refreshActiveFormats}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        sx={{
          minHeight: 280,
          p: 2,
          outline: 'none',
          fontSize: 16,
          lineHeight: 1.7,
          bgcolor: disabled ? 'action.disabledBackground' : 'background.paper',
          '& p': { margin: '0 0 0.9em' },
          '& ul, & ol': { paddingLeft: '1.4em', margin: '0 0 0.9em' },
          '& a': { color: 'primary.main' },
          '&:empty::before': {
            content: 'attr(data-placeholder)',
            color: 'text.disabled',
          },
        }}
      />
    </Box>
  );
}
