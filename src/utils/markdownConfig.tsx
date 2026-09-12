import React from 'react';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { commands, type ICommand } from '@uiw/react-md-editor';

export const mdRemarkPlugins = [remarkGfm, remarkMath];
export const mdRehypePlugins: any[] = [[rehypeKatex, { throwOnError: false, strict: false }]];

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

export const getCustomMdCommands = (
  inlineTitle?: string,
  blockTitle?: string
): ICommand[] => [
  ...commands.getCommands(),
  commands.divider,
  createMathInlineCommand(inlineTitle),
  createMathBlockCommand(blockTitle),
];

export const mdPreviewOptions = {
  remarkPlugins: mdRemarkPlugins,
  rehypePlugins: mdRehypePlugins,
};
