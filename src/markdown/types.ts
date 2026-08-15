export type Inline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'math'; value: string; raw: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'strike'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type TableAlign = 'left' | 'center' | 'right' | null;

export type ListMarker =
  | { type: 'bullet' }
  | { type: 'ordered'; number: number }
  | { type: 'task'; checked: boolean };

export interface ListItem {
  marker: ListMarker;
  inlines: Inline[];
  children: ListItem[];
}

export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inlines: Inline[] }
  | { type: 'list'; items: ListItem[] }
  | { type: 'code'; language: string; text: string; closed: boolean }
  | { type: 'math'; value: string; raw: string }
  | { type: 'quote'; inlines: Inline[] }
  | { type: 'table'; align: TableAlign[]; header: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' };
