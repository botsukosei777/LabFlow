import { LiteratureItem } from '../types';

export type CitationStyleId =
  | 'nature'
  | 'cell'
  | 'science'
  | 'pnas'
  | 'nar'
  | 'embo'
  | 'jbc'
  | 'elife'
  | 'plos'
  | 'cell_reports';

export interface CitationStyleDef {
  id: CitationStyleId;
  name: string;
  journal: string;
  category: 'numbered' | 'author_date';
  description: string;
  descriptionJa: string;
}

export const CITATION_STYLES: CitationStyleDef[] = [
  {
    id: 'nature',
    name: 'Nature',
    journal: 'Nature Portfolio',
    category: 'numbered',
    description: 'Numbered superscript, abbreviated journal, year at end',
    descriptionJa: '番号・上付き (Nature標準 / 雑誌名斜体・巻数太字・末尾年)'
  },
  {
    id: 'cell',
    name: 'Cell',
    journal: 'Cell Press',
    category: 'author_date',
    description: 'Author-date in text, full author list, (year) after authors',
    descriptionJa: '著者-出版年 (Cell標準 / 全著者記載・著者直後に年・雑誌名斜体)'
  },
  {
    id: 'science',
    name: 'Science',
    journal: 'AAAS',
    category: 'numbered',
    description: 'Italic number in parentheses, Initials Surname, year at end',
    descriptionJa: '括弧番号 (Science標準 / イニシャル氏名・雑誌名斜体・末尾年)'
  },
  {
    id: 'pnas',
    name: 'PNAS',
    journal: 'Proc. Natl. Acad. Sci. USA',
    category: 'numbered',
    description: 'Numbered parentheses, Surname Initials, vol:pages',
    descriptionJa: '括弧番号 (PNAS標準 / 姓・イニシャル・年・巻:頁)'
  },
  {
    id: 'nar',
    name: 'Nucleic Acids Research',
    journal: 'Oxford Academic (NAR)',
    category: 'numbered',
    description: 'Numbered brackets, Surname, Initials (year), vol, pages',
    descriptionJa: '角括弧番号 (NAR標準 / [1]・姓,イニシャル (年)・巻数太字)'
  },
  {
    id: 'embo',
    name: 'The EMBO Journal',
    journal: 'EMBO Press',
    category: 'author_date',
    description: 'Author-date without comma (Smith et al, 2024), EMBO J',
    descriptionJa: '著者-年 (EMBO J標準 / コンマなし (Smith et al, 2024))'
  },
  {
    id: 'jbc',
    name: 'Journal of Biological Chemistry',
    journal: 'JBC / ASBMB',
    category: 'numbered',
    description: 'Numbered parentheses, Author, A. B. (year), J. Biol. Chem.',
    descriptionJa: '括弧番号 (JBC標準 / (1)・著者名 (年)・巻数太字)'
  },
  {
    id: 'elife',
    name: 'eLife',
    journal: 'eLife Sciences',
    category: 'author_date',
    description: 'Author-date in text, Author AB. year. Title. eLife vol:pages',
    descriptionJa: '著者-年 (eLife標準 / 著者. 年. 論文名. eLife 巻:ページ)'
  },
  {
    id: 'plos',
    name: 'PLOS (PLOS ONE / Biology)',
    journal: 'Public Library of Science',
    category: 'numbered',
    description: 'Numbered brackets [1], Vancouver variant, Author AB (year)',
    descriptionJa: '角括弧番号 (PLOS標準 / [1]・バンクーバー形式変形・DOI付)'
  },
  {
    id: 'cell_reports',
    name: 'Cell Reports',
    journal: 'Cell Press',
    category: 'author_date',
    description: 'Author-date in text, Author, A.B. (year). Title. Cell Rep.',
    descriptionJa: '著者-年 (Cell Reports / 著者名 (年)・Cell Rep. *巻*, ページ)'
  }
];

export interface ParsedAuthor {
  raw: string;
  lastName: string;
  initials: string;
}

/**
 * Parses raw author strings (e.g. "Smith, J. A., Watson, J. D. and Crick, F. H.")
 * into structured author objects.
 */
export function parseAuthors(authorsStr?: string): ParsedAuthor[] {
  if (!authorsStr || !authorsStr.trim()) return [];

  // Split by "and", "&", or comma/semicolon
  const normalized = authorsStr
    .replace(/\s+and\s+/gi, ', ')
    .replace(/\s*&\s*/g, ', ')
    .replace(/;/g, ',');

  const rawTokens = normalized
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const parsed: ParsedAuthor[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i]!;

    // Check if format is "LastName, Initials" where next token is initials
    if (
      i + 1 < rawTokens.length &&
      /^[A-Z](\.[A-Z]?)*\.?$/i.test(rawTokens[i + 1]!.replace(/\s/g, ''))
    ) {
      const lastName = token;
      const initials = rawTokens[i + 1]!.replace(/\s/g, '');
      parsed.push({
        raw: `${lastName}, ${initials}`,
        lastName,
        initials
      });
      i++;
      continue;
    }

    // Split by whitespace
    const parts = token.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      parsed.push({
        raw: token,
        lastName: token,
        initials: ''
      });
    } else {
      // Last token is likely surname if previous are initials, or vice versa
      const firstPart = parts[0]!;
      const lastPart = parts[parts.length - 1]!;

      if (/^[A-Z](\.[A-Z]?)*\.?$/i.test(firstPart)) {
        // Initials first: "J.A. Smith"
        const initials = parts.slice(0, -1).join('');
        const lastName = lastPart;
        parsed.push({ raw: token, lastName, initials });
      } else {
        // "John Smith" or "Smith JA"
        if (/^[A-Z]+$/i.test(lastPart) && lastPart.length <= 3) {
          // "Smith JA"
          parsed.push({
            raw: token,
            lastName: parts.slice(0, -1).join(' '),
            initials: lastPart.split('').join('.') + '.'
          });
        } else {
          // "John Smith"
          const initials = parts
            .slice(0, -1)
            .map(p => p[0]?.toUpperCase() + '.')
            .join('');
          parsed.push({
            raw: token,
            lastName: lastPart,
            initials
          });
        }
      }
    }
  }

  return parsed.length > 0 ? parsed : [{ raw: authorsStr, lastName: authorsStr, initials: '' }];
}

/**
 * Returns formatted author citation label for in-text citations.
 * e.g. "Smith et al." or "Smith & Watson" or "Smith"
 */
export function getAuthorDateLabel(authorsStr?: string, year?: number | string | null): string {
  const parsed = parseAuthors(authorsStr);
  const yr = year ? String(year) : 'n.d.';

  if (parsed.length === 0) return `Unknown, ${yr}`;
  if (parsed.length === 1) return `${parsed[0]!.lastName}, ${yr}`;
  if (parsed.length === 2) return `${parsed[0]!.lastName} and ${parsed[1]!.lastName}, ${yr}`;
  return `${parsed[0]!.lastName} et al., ${yr}`;
}

/**
 * Formats a single bibliography item according to the specified journal style.
 */
export function formatBibliographyItem(
  seqNumber: number,
  lit: LiteratureItem,
  styleId: CitationStyleId
): { html: string; markdown: string } {
  const authors = parseAuthors(lit.authors);
  const title = (lit.title || 'Untitled').trim().replace(/\.$/, '');
  const journal = (lit.journal || '').trim();
  const year = lit.year ? String(lit.year) : '';
  const volume = lit.volume ? String(lit.volume).trim() : '';
  const pages = lit.pages ? String(lit.pages).trim() : '';
  const doi = lit.doi ? lit.doi.trim().replace(/^https?:\/\/doi\.org\//i, '') : '';
  const doiLink = doi ? `https://doi.org/${doi}` : '';

  let md = '';
  let html = '';

  switch (styleId) {
    case 'nature': {
      // 1. Author, A. B. et al. Title of paper. *Journal* **vol**, pages (year).
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 5) {
        authorStr = authors
          .map(a => `${a.lastName}, ${a.initials || ''}`.trim().replace(/,\s*$/, ''))
          .join(', ');
      } else {
        authorStr = `${authors[0]!.lastName}, ${authors[0]!.initials || ''}`.trim().replace(/,\s*$/, '') + ' et al.';
      }

      md = `${seqNumber}. ${authorStr} ${title}.`;
      if (journal) md += ` *${journal}*`;
      if (volume) md += ` **${volume}**,`;
      if (pages) md += ` ${pages}`;
      if (year) md += ` (${year}).`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>` : '') +
        (volume ? ` <strong>${escapeHtml(volume)}</strong>,` : '') +
        (pages ? ` ${escapeHtml(pages)}` : '') +
        (year ? ` (${escapeHtml(year)}).` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'cell': {
      // Author, A.B., Author, C.D., and Author, E.F. (year). Title of paper. Cell *vol*, pages.
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 10) {
        const list = authors.map(a => `${a.lastName}, ${a.initials || ''}`.trim().replace(/,\s*$/, ''));
        if (list.length === 1) authorStr = list[0]!;
        else if (list.length === 2) authorStr = `${list[0]} and ${list[1]}`;
        else authorStr = `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
      } else {
        authorStr = `${authors[0]!.lastName}, ${authors[0]!.initials || ''}`.trim() + ' et al.';
      }

      md = `${seqNumber}. ${authorStr} (${year || 'n.d.'}). ${title}.`;
      if (journal) md += ` ${journal}`;
      if (volume) md += ` *${volume}*,`;
      if (pages) md += ` ${pages}.`;
      if (doiLink) md += ` [DOI: ${doi}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} (${escapeHtml(year || 'n.d.')}). ${escapeHtml(title)}.` +
        (journal ? ` ${escapeHtml(journal)}` : '') +
        (volume ? ` <em>${escapeHtml(volume)}</em>,` : '') +
        (pages ? ` ${escapeHtml(pages)}.` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">https://doi.org/${escapeHtml(doi)}</a>` : '');
      break;
    }

    case 'science': {
      // 1. A. B. Author, C. D. Author, Title of paper. *Science* **vol**, pages (year).
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 5) {
        authorStr = authors
          .map(a => `${a.initials ? a.initials + ' ' : ''}${a.lastName}`.trim())
          .join(', ');
      } else {
        authorStr = `${authors[0]!.initials ? authors[0]!.initials + ' ' : ''}${authors[0]!.lastName}, et al.`;
      }

      md = `${seqNumber}. ${authorStr}, ${title}.`;
      if (journal) md += ` *${journal}*`;
      if (volume) md += ` **${volume}**,`;
      if (pages) md += ` ${pages}`;
      if (year) md += ` (${year}).`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)}, ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>` : '') +
        (volume ? ` <strong>${escapeHtml(volume)}</strong>,` : '') +
        (pages ? ` ${escapeHtml(pages)}` : '') +
        (year ? ` (${escapeHtml(year)}).` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'pnas': {
      // 1. Author AB, Author CD (year) Title of paper. *Proc. Natl. Acad. Sci. U.S.A.* vol:pages.
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 5) {
        authorStr = authors
          .map(a => `${a.lastName} ${a.initials.replace(/\./g, '')}`.trim())
          .join(', ');
      } else {
        authorStr = `${authors[0]!.lastName} ${authors[0]!.initials.replace(/\./g, '')} et al.`;
      }

      md = `${seqNumber}. ${authorStr} (${year || 'n.d.'}) ${title}.`;
      if (journal) md += ` *${journal}*`;
      if (volume && pages) md += ` ${volume}:${pages}.`;
      else if (volume) md += ` ${volume}.`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} (${escapeHtml(year || 'n.d.')}) ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>` : '') +
        (volume && pages ? ` ${escapeHtml(volume)}:${escapeHtml(pages)}.` : volume ? ` ${escapeHtml(volume)}.` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'nar': {
      // 1. Author, A.B., Author, C.D. and Author, E.F. (year) Title of paper. *Nucleic Acids Res.*, **vol**, pages.
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 10) {
        const list = authors.map(a => `${a.lastName},${a.initials}`.trim());
        if (list.length === 1) authorStr = list[0]!;
        else if (list.length === 2) authorStr = `${list[0]} and ${list[1]}`;
        else authorStr = `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
      } else {
        authorStr = `${authors[0]!.lastName},${authors[0]!.initials} et al.`;
      }

      md = `${seqNumber}. ${authorStr} (${year || 'n.d.'}) ${title}.`;
      if (journal) md += ` *${journal}*,`;
      if (volume) md += ` **${volume}**,`;
      if (pages) md += ` ${pages}.`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} (${escapeHtml(year || 'n.d.')}) ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>,` : '') +
        (volume ? ` <strong>${escapeHtml(volume)}</strong>,` : '') +
        (pages ? ` ${escapeHtml(pages)}.` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'embo': {
      // Author AB, Author CD (year) Title of paper. *EMBO J* **vol**: pages
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 5) {
        authorStr = authors
          .map(a => `${a.lastName} ${a.initials.replace(/\./g, '')}`.trim())
          .join(', ');
      } else {
        authorStr = `${authors[0]!.lastName} ${authors[0]!.initials.replace(/\./g, '')} et al`;
      }

      md = `${seqNumber}. ${authorStr} (${year || 'n.d.'}) ${title}.`;
      if (journal) md += ` *${journal}*`;
      if (volume && pages) md += ` **${volume}**: ${pages}`;
      else if (volume) md += ` **${volume}**`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} (${escapeHtml(year || 'n.d.')}) ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>` : '') +
        (volume && pages ? ` <strong>${escapeHtml(volume)}</strong>: ${escapeHtml(pages)}` : volume ? ` <strong>${escapeHtml(volume)}</strong>` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'jbc': {
      // 1. Author, A. B., and Author, C. D. (year) Title of paper. *J. Biol. Chem.* **vol**, pages
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 10) {
        const list = authors.map(a => `${a.lastName}, ${a.initials}`.trim().replace(/,\s*$/, ''));
        if (list.length === 1) authorStr = list[0]!;
        else if (list.length === 2) authorStr = `${list[0]}, and ${list[1]}`;
        else authorStr = `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
      } else {
        authorStr = `${authors[0]!.lastName}, ${authors[0]!.initials}, et al.`;
      }

      md = `${seqNumber}. ${authorStr} (${year || 'n.d.'}) ${title}.`;
      if (journal) md += ` *${journal}*`;
      if (volume) md += ` **${volume}**,`;
      if (pages) md += ` ${pages}`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} (${escapeHtml(year || 'n.d.')}) ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>` : '') +
        (volume ? ` <strong>${escapeHtml(volume)}</strong>,` : '') +
        (pages ? ` ${escapeHtml(pages)}` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'elife': {
      // Author AB, Author CD. year. Title of paper. *eLife* **vol**:pages. DOI: https://doi.org/...
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 5) {
        authorStr = authors
          .map(a => `${a.lastName} ${a.initials.replace(/\./g, '')}`.trim())
          .join(', ');
      } else {
        authorStr = `${authors[0]!.lastName} ${authors[0]!.initials.replace(/\./g, '')} et al.`;
      }

      md = `${seqNumber}. ${authorStr}. ${year || 'n.d.'}. ${title}.`;
      if (journal) md += ` *${journal}*`;
      if (volume && pages) md += ` **${volume}**: ${pages}.`;
      else if (volume) md += ` **${volume}**.`;
      if (doiLink) md += ` DOI: [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)}. ${escapeHtml(year || 'n.d.')}. ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>` : '') +
        (volume && pages ? ` <strong>${escapeHtml(volume)}</strong>: ${escapeHtml(pages)}.` : volume ? ` <strong>${escapeHtml(volume)}</strong>.` : '') +
        (doiLink ? ` DOI: <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'plos': {
      // 1. Author AB, Author CD (year) Title of paper. PLOS ONE vol: pages. https://doi.org/...
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 6) {
        authorStr = authors
          .map(a => `${a.lastName} ${a.initials.replace(/\./g, '')}`.trim())
          .join(', ');
      } else {
        authorStr = authors.slice(0, 6)
          .map(a => `${a.lastName} ${a.initials.replace(/\./g, '')}`.trim())
          .join(', ') + ', et al.';
      }

      md = `${seqNumber}. ${authorStr} (${year || 'n.d.'}) ${title}.`;
      if (journal) md += ` ${journal}`;
      if (volume && pages) md += ` ${volume}: ${pages}.`;
      else if (volume) md += ` ${volume}.`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} (${escapeHtml(year || 'n.d.')}) ${escapeHtml(title)}.` +
        (journal ? ` ${escapeHtml(journal)}` : '') +
        (volume && pages ? ` ${escapeHtml(volume)}: ${escapeHtml(pages)}.` : volume ? ` ${escapeHtml(volume)}.` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }

    case 'cell_reports':
    default: {
      // Author, A.B., and Author, C.D. (year). Title of paper. Cell Rep. *vol*, pages.
      let authorStr = '';
      if (authors.length === 0) authorStr = 'Unknown';
      else if (authors.length <= 10) {
        const list = authors.map(a => `${a.lastName}, ${a.initials}`.trim().replace(/,\s*$/, ''));
        if (list.length === 1) authorStr = list[0]!;
        else if (list.length === 2) authorStr = `${list[0]} and ${list[1]}`;
        else authorStr = `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
      } else {
        authorStr = `${authors[0]!.lastName}, ${authors[0]!.initials} et al.`;
      }

      md = `${seqNumber}. ${authorStr} (${year || 'n.d.'}). ${title}.`;
      if (journal) md += ` *${journal}*`;
      if (volume) md += ` **${volume}**,`;
      if (pages) md += ` ${pages}.`;
      if (doiLink) md += ` [${doiLink}](${doiLink})`;

      html = `${seqNumber}. ${escapeHtml(authorStr)} (${escapeHtml(year || 'n.d.')}). ${escapeHtml(title)}.` +
        (journal ? ` <em>${escapeHtml(journal)}</em>` : '') +
        (volume ? ` <strong>${escapeHtml(volume)}</strong>,` : '') +
        (pages ? ` ${escapeHtml(pages)}.` : '') +
        (doiLink ? ` <a href="${doiLink}" target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">${doiLink}</a>` : '');
      break;
    }
  }

  return { markdown: md, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface ProcessedCitationResult {
  /** Text with citations replaced for preview/reading */
  processedText: string;
  /** In-order list of cited items */
  citedItems: Array<{
    seqNumber: number;
    litId: number;
    lit?: LiteratureItem;
  }>;
  /** Generated bibliography markdown string */
  bibliographyMarkdown: string;
  /** Generated bibliography HTML string */
  bibliographyHtml: string;
}

/**
 * Scans markdown text for citation markers like `[@lit:12]`, `[@12]`, or `{{cite:12}}`,
 * assigns sequential 1-based reference numbers in order of appearance (so inserting or removing
 * citations automatically shifts all subsequent numbers!), formats in-text citations according
 * to style, and produces the complete bibliography.
 */
export function processCitations(
  text: string,
  literatureMap: Map<number, LiteratureItem>,
  styleId: CitationStyleId = 'nature'
): ProcessedCitationResult {
  if (!text) {
    return {
      processedText: '',
      citedItems: [],
      bibliographyMarkdown: '',
      bibliographyHtml: ''
    };
  }

  const styleDef = CITATION_STYLES.find(s => s.id === styleId) || CITATION_STYLES[0]!;

  // Regex to match citation tags:
  // [@lit:123], [@123], {{cite:123}}
  // Also supports comma-separated: [@lit:12, @lit:14] or [@12, 14]
  const tagRegex = /\[@(?:lit:)?(\d+(?:\s*,\s*(?:@lit:)?\d+)*)\]|\{\{cite:(\d+)\}\}/gi;

  // 1. Scan text from top to bottom and collect IDs in order of first appearance
  const idToSeqMap = new Map<number, number>();
  const orderedIds: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const rawGroup = match[1] || match[2] || '';
    const ids = rawGroup
      .split(',')
      .map(part => {
        const numMatch = part.match(/\d+/);
        return numMatch ? parseInt(numMatch[0]!, 10) : null;
      })
      .filter((n): n is number => n !== null);

    for (const id of ids) {
      if (!idToSeqMap.has(id)) {
        const newSeq = orderedIds.length + 1;
        idToSeqMap.set(id, newSeq);
        orderedIds.push(id);
      }
    }
  }

  // 2. Build cited items list
  const citedItems = orderedIds.map(id => ({
    seqNumber: idToSeqMap.get(id)!,
    litId: id,
    lit: literatureMap.get(id)
  }));

  // If author-date, sort bibliography alphabetically by first author
  let bibItems = [...citedItems];
  if (styleDef.category === 'author_date') {
    bibItems.sort((a, b) => {
      const authorA = (a.lit?.authors || '').toLowerCase();
      const authorB = (b.lit?.authors || '').toLowerCase();
      if (authorA !== authorB) return authorA.localeCompare(authorB);
      return (Number(a.lit?.year) || 0) - (Number(b.lit?.year) || 0);
    });
  }

  // 3. Generate Bibliography markdown & html
  const bibMdLines: string[] = [];
  const bibHtmlLines: string[] = [];

  bibItems.forEach((item, idx) => {
    const displayNum = styleDef.category === 'author_date' ? idx + 1 : item.seqNumber;
    if (item.lit) {
      const formatted = formatBibliographyItem(displayNum, item.lit, styleId);
      bibMdLines.push(formatted.markdown);
      bibHtmlLines.push(`<div class="citation-bib-item" id="ref-${item.litId}">${formatted.html}</div>`);
    } else {
      const missing = `${displayNum}. [Literature #${item.litId} (Not Found)]`;
      bibMdLines.push(missing);
      bibHtmlLines.push(`<div class="citation-bib-item italic text-gray-500" id="ref-${item.litId}">${missing}</div>`);
    }
  });

  const bibliographyMarkdown = bibMdLines.join('\n\n');
  const bibliographyHtml = bibHtmlLines.join('\n');

  // 4. Replace in-text citation tags with formatted representations
  const processedText = text.replace(tagRegex, (_full, group1, group2) => {
    const rawGroup = group1 || group2 || '';
    const ids = rawGroup
      .split(',')
      .map((part: string) => {
        const numMatch = part.match(/\d+/);
        return numMatch ? parseInt(numMatch[0]!, 10) : null;
      })
      .filter((n: number | null): n is number => n !== null);

    if (ids.length === 0) return _full;

    if (styleDef.category === 'author_date') {
      // e.g. (Smith et al., 2024; Watson et al., 2023)
      const labels = ids.map((id: number) => {
        const item = literatureMap.get(id);
        if (item) {
          return getAuthorDateLabel(item.authors, item.year);
        }
        return `[#${id}]`;
      });

      if (styleId === 'embo') {
        // EMBO uses no comma before year in-text: (Smith et al 2024)
        const emboLabels = labels.map((l: string) => l.replace(/, (\d{4}|n\.d\.)/g, ' $1'));
        return `(${emboLabels.join('; ')})`;
      }

      return `(${labels.join('; ')})`;
    } else {
      // Numbered styles
      const nums = ids.map((id: number) => idToSeqMap.get(id) || id);

      if (styleId === 'nature') {
        // Nature: Superscript numbers: <sup>1</sup> or <sup>1,2</sup>
        return `<sup>[${nums.join(',')}]</sup>`;
      } else if (styleId === 'science' || styleId === 'pnas' || styleId === 'jbc') {
        // Parentheses (1) or (1, 2)
        return `(${nums.join(', ')})`;
      } else {
        // NAR, PLOS: [1] or [1,2]
        return `[${nums.join(',')}]`;
      }
    }
  });

  return {
    processedText,
    citedItems,
    bibliographyMarkdown,
    bibliographyHtml
  };
}
