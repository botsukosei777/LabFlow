import React from 'react';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { commands, type ICommand, type TextAreaTextApi } from '@uiw/react-md-editor';
import { Superscript, Subscript, Grid2X2 } from 'lucide-react';
export { ImageCropModal, type ImageCropModalProps } from '../components/notebook/ImageCropModal';
export { ImageGridModal, type ImageGridModalProps } from '../components/notebook/ImageGridModal';

export const mdRemarkPlugins = [remarkGfm, remarkMath];
export const mdRehypePlugins: any[] = [[rehypeKatex, { throwOnError: false, strict: false }]];

/**
 * Uploads an image file or blob to the notebook image upload endpoint.
 */
export async function uploadImageFile(file: File | Blob, customName?: string): Promise<{ url: string; filename: string }> {
  const formData = new FormData();
  const name = customName || (file instanceof File ? file.name : 'image.png');
  formData.append('image', file, name);

  const token = localStorage.getItem('labflow-auth-token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/notebook/upload-image', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(err.message || 'Upload failed');
  }

  return res.json();
}

/**
 * Helper to insert text into a textarea at the cursor position with full React compatibility
 * and undo/redo history support.
 */
export function insertTextAtCursor(textarea: HTMLTextAreaElement, text: string) {
  textarea.focus();
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;

  let inserted = false;
  if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
    inserted = document.execCommand('insertText', false, text);
  }

  if (!inserted) {
    const value = textarea.value;
    const nextValue = value.substring(0, start) + text + value.substring(end);
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, nextValue);
    } else {
      textarea.value = nextValue;
    }
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Intercepts image paste (e.g. screenshots from Win+Shift+S or copied images)
 * and uploads them to the server before inserting Markdown image tag.
 */
export async function handleMarkdownPaste(e: React.ClipboardEvent<HTMLElement>) {
  const items = Array.from(e.clipboardData?.items || []);
  const imageItems = items.filter(item => item.type.startsWith('image/'));
  if (imageItems.length === 0) return;

  e.preventDefault();
  const target = e.currentTarget;
  const textarea = (target.tagName === 'TEXTAREA' ? target : target.querySelector('textarea')) as HTMLTextAreaElement | null;
  if (!textarea) return;

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;

    try {
      const data = await uploadImageFile(file);
      const altText = file.name && file.name !== 'image.png' ? file.name.replace(/\.[^/.]+$/, '') : 'image';
      insertTextAtCursor(textarea, `\n![${altText}](${data.url})\n`);
    } catch (err: any) {
      console.error('Failed to paste image:', err);
    }
  }
}

/**
 * Intercepts image paste and hands off the file to a crop modal handler.
 */
export function handleMarkdownPasteWithCrop(
  e: React.ClipboardEvent<HTMLElement>,
  onSelectFile: (file: File, targetTextarea: HTMLTextAreaElement) => void
) {
  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(item => item.type.startsWith('image/'));
  if (!imageItem) return;

  e.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;

  const target = e.currentTarget;
  const textarea = (target.tagName === 'TEXTAREA' ? target : target.querySelector('textarea')) as HTMLTextAreaElement | null;
  if (!textarea) return;

  onSelectFile(file, textarea);
}

/**
 * Intercepts image drag-and-drop from PC file explorer and uploads them.
 */
export async function handleMarkdownDrop(e: React.DragEvent<HTMLElement>) {
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.currentTarget;
  const textarea = (target.tagName === 'TEXTAREA' ? target : target.querySelector('textarea')) as HTMLTextAreaElement | null;
  if (!textarea) return;

  for (const file of files) {
    try {
      const data = await uploadImageFile(file);
      const altText = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'image';
      insertTextAtCursor(textarea, `\n![${altText}](${data.url})\n`);
    } catch (err: any) {
      console.error('Failed to drop image:', err);
    }
  }
}

/**
 * Intercepts image drag-and-drop and hands off the file to a crop modal handler.
 */
export function handleMarkdownDropWithCrop(
  e: React.DragEvent<HTMLElement>,
  onSelectFile: (file: File, targetTextarea: HTMLTextAreaElement) => void
) {
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.currentTarget;
  const textarea = (target.tagName === 'TEXTAREA' ? target : target.querySelector('textarea')) as HTMLTextAreaElement | null;
  if (!textarea) return;

  onSelectFile(files[0], textarea);
}

/**
 * Allows drop events by preventing default dragover when files are dragged.
 */
export function handleMarkdownDragOver(e: React.DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
  }
}

export const createImageUploadCommand = (
  title: string = '画像を挿入 (PCから選択)',
  onSelectFile?: (file: File, api: TextAreaTextApi) => void
): ICommand => ({
  name: 'image',
  keyCommand: 'image',
  buttonProps: {
    'aria-label': title,
    title,
  },
  icon: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
      <circle cx="9" cy="9" r="2"/>
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>
  ),
  execute: (_state, api) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      if (files.length === 0) return;

      const file = files[0];
      if (onSelectFile) {
        onSelectFile(file, api);
        return;
      }

      try {
        const data = await uploadImageFile(file);
        const altText = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'image';
        api.replaceSelection(`\n![${altText}](${data.url})\n`);
      } catch (err: any) {
        console.error('Image upload failed:', err);
        alert(err.message || '画像のアップロードに失敗しました');
      }
    };

    input.click();
  },
});

export const createMathInlineCommand = (title: string = '数式 (インライン): $...$'): ICommand => ({
  name: 'math-inline',
  keyCommand: 'math-inline',
  buttonProps: {
    'aria-label': title,
    title,
  },
  icon: (
    <span style={{ fontSize: '11px', fontWeight: 'bold', fontFamily: 'serif', padding: '0 2px' }}>
      $f_x$
    </span>
  ),
  execute: (state, api) => {
    const selected = state.selectedText;
    if (selected) {
      api.replaceSelection(`$${selected}$`);
    } else {
      api.replaceSelection('$E = mc^2$');
    }
  },
});

export const createMathBlockCommand = (title: string = '数式ブロック: $$...$$'): ICommand => ({
  name: 'math-block',
  keyCommand: 'math-block',
  buttonProps: {
    'aria-label': title,
    title,
  },
  icon: (
    <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'serif', padding: '0 2px' }}>
      ∑
    </span>
  ),
  execute: (state, api) => {
    const selected = state.selectedText;
    if (selected) {
      api.replaceSelection(`\n$$\n${selected}\n$$\n`);
    } else {
      api.replaceSelection('\n$$\nC_1 V_1 = C_2 V_2\n$$\n');
    }
  },
});

export const createSuperscriptCommand = (title: string = '上付き文字: <sup>...</sup>'): ICommand => ({
  name: 'superscript',
  keyCommand: 'superscript',
  buttonProps: {
    'aria-label': title,
    title,
  },
  icon: (
    <Superscript style={{ width: 14, height: 14 }} strokeWidth={2.2} />
  ),
  execute: (state, api) => {
    const selected = state.selectedText;
    if (selected) {
      api.replaceSelection(`<sup>${selected}</sup>`);
    } else {
      api.replaceSelection('<sup>2</sup>');
    }
  },
});

export const createSubscriptCommand = (title: string = '下付き文字: <sub>...</sub>'): ICommand => ({
  name: 'subscript',
  keyCommand: 'subscript',
  buttonProps: {
    'aria-label': title,
  },
  icon: (
    <Subscript style={{ width: 14, height: 14 }} strokeWidth={2.2} />
  ),
  execute: (state, api) => {
    const selected = state.selectedText;
    if (selected) {
      api.replaceSelection(`<sub>${selected}</sub>`);
    } else {
      api.replaceSelection('<sub>2</sub>');
    }
  },
});

export const createCitationCommand = (
  title: string = '引用番号の挿入: [@lit:ID]',
  onOpenCitationPicker?: (api: TextAreaTextApi) => void
): ICommand => ({
  name: 'citation',
  keyCommand: 'citation',
  buttonProps: {
    'aria-label': title,
    title,
  },
  icon: (
    <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'sans-serif', padding: '0 2px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
      <span>cite</span>
    </span>
  ),
  execute: (_state, api) => {
    if (onOpenCitationPicker) {
      onOpenCitationPicker(api);
    } else {
      api.replaceSelection('[@lit:1]');
    }
  },
});

export const createMilestoneCommand = (
  title: string = 'マイルストーンリンクの挿入',
  onOpenMilestonePicker?: (api: TextAreaTextApi) => void
): ICommand => ({
  name: 'milestone',
  keyCommand: 'milestone',
  buttonProps: {
    'aria-label': title,
    title,
  },
  icon: (
    <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'sans-serif', padding: '0 2px', display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#c084fc' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
      <span>ms</span>
    </span>
  ),
  execute: (_state, api) => {
    if (onOpenMilestonePicker) {
      onOpenMilestonePicker(api);
    } else {
      api.replaceSelection('[🎯 マイルストーン](/milestones)');
    }
  },
});

export const createImageGridCommand = (
  title: string = '画像グリッド配置 (2行2列など)',
  onOpenImageGridModal?: (api: TextAreaTextApi) => void
): ICommand => ({
  name: 'imageGrid',
  keyCommand: 'imageGrid',
  buttonProps: {
    'aria-label': title,
    title,
  },
  icon: (
    <Grid2X2 style={{ width: 14, height: 14 }} strokeWidth={2.2} />
  ),
  execute: (_state, api) => {
    if (onOpenImageGridModal) {
      onOpenImageGridModal(api);
    } else {
      api.replaceSelection(`
| (A) ラベルA | (B) ラベルB |
| :---: | :---: |
| ![画像A](https://via.placeholder.com/300) | ![画像B](https://via.placeholder.com/300) |
| **(C) ラベルC** | **(D) ラベルD** |
| ![画像C](https://via.placeholder.com/300) | ![画像D](https://via.placeholder.com/300) |
`);
    }
  },
});

export const getCustomMdCommands = (
  inlineTitle?: string,
  blockTitle?: string,
  imageTitle?: string,
  onSelectImageFile?: (file: File, api: TextAreaTextApi) => void,
  supTitle?: string,
  subTitle?: string,
  citationTitle?: string,
  onOpenCitationPicker?: (api: TextAreaTextApi) => void,
  milestoneTitle?: string,
  onOpenMilestonePicker?: (api: TextAreaTextApi) => void,
  imageGridTitle?: string,
  onOpenImageGridModal?: (api: TextAreaTextApi) => void
): ICommand[] => {
  const supCmd = createSuperscriptCommand(supTitle);
  const subCmd = createSubscriptCommand(subTitle);
  const mathInlineCmd = createMathInlineCommand(inlineTitle);
  const mathBlockCmd = createMathBlockCommand(blockTitle);
  const citationCmd = createCitationCommand(citationTitle, onOpenCitationPicker);
  const milestoneCmd = createMilestoneCommand(milestoneTitle, onOpenMilestonePicker);
  const imageGridCmd = createImageGridCommand(imageGridTitle, onOpenImageGridModal);

  const rawCommands = commands.getCommands();
  const result: ICommand[] = [];

  for (const cmd of rawCommands) {
    if (cmd.name === 'image') {
      result.push(createImageUploadCommand(imageTitle, onSelectImageFile));
      result.push(imageGridCmd);
    } else {
      result.push(cmd);
    }
    // Place superscript and subscript directly next to strikethrough (in the text formatting group: bold, italic, strikethrough, sup, sub)
    if (cmd.name === 'strikethrough') {
      result.push(supCmd);
      result.push(subCmd);
    }
  }

  // Add math commands, citation command, and milestone command at the end after dividers
  result.push(commands.divider, mathInlineCmd, mathBlockCmd, commands.divider, citationCmd, milestoneCmd);

  return result;
};

export const mdPreviewOptions = {
  remarkPlugins: mdRemarkPlugins,
  rehypePlugins: mdRehypePlugins,
};
