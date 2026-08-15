'use dom';

import type { CSSProperties, ReactNode } from 'react';
import { SourceSans3_400Regular } from '@expo-google-fonts/source-sans-3/400Regular';
import { SourceSans3_400Regular_Italic } from '@expo-google-fonts/source-sans-3/400Regular_Italic';
import { SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3/600SemiBold';
import { SourceSans3_700Bold } from '@expo-google-fonts/source-sans-3/700Bold';
import { SourceSans3_700Bold_Italic } from '@expo-google-fonts/source-sans-3/700Bold_Italic';
import './MathRichText.css';
import type { Inline } from '@/markdown';
import { renderMathToHtml } from '@/markdown/math';

export interface MathTextAppearance {
  color: string;
  accent: string;
  codeBackground: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: 400 | 600 | 700;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'line-through';
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;
}

export type MathTextContent =
  | { type: 'inlines'; nodes: Inline[] }
  | { type: 'display'; value: string; raw: string };

export default function MathRichText({
  content,
  appearance,
  onOpenLink,
}: {
  content: MathTextContent;
  appearance: MathTextAppearance;
  onOpenLink: (href: string) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}) {
  const style: CSSProperties = {
    color: appearance.color,
    fontSize: appearance.fontSize,
    lineHeight: `${appearance.lineHeight}px`,
    fontWeight: appearance.fontWeight,
    fontStyle: appearance.fontStyle,
    textDecoration: appearance.textDecoration,
    textAlign: appearance.textAlign,
    letterSpacing: appearance.letterSpacing,
  };

  const fontFaces = <style>{SOURCE_SANS_FONT_FACES}</style>;

  if (content.type === 'display') {
    return (
      <>
        {fontFaces}
        <div className="math-rich-text math-rich-text__display" style={style}>
          <Math value={content.value} raw={content.raw} displayMode />
        </div>
      </>
    );
  }

  return (
    <>
      {fontFaces}
      <div className="math-rich-text" style={style}>
        {content.nodes.map((node, index) => (
          <InlineNode
            key={index}
            node={node}
            accent={appearance.accent}
            codeBackground={appearance.codeBackground}
            onOpenLink={onOpenLink}
          />
        ))}
      </div>
    </>
  );
}

const SOURCE_SANS_FONT_FACES = [
  fontFace(SourceSans3_400Regular, 400, 'normal'),
  fontFace(SourceSans3_400Regular_Italic, 400, 'italic'),
  fontFace(SourceSans3_600SemiBold, 600, 'normal'),
  fontFace(SourceSans3_700Bold, 700, 'normal'),
  fontFace(SourceSans3_700Bold_Italic, 700, 'italic'),
].join('\n');

function fontFace(asset: string | number, weight: 400 | 600 | 700, style: 'normal' | 'italic') {
  return `@font-face{font-family:'Sal Source Sans 3';src:url(${JSON.stringify(String(asset))}) format('truetype');font-weight:${weight};font-style:${style};font-display:swap;}`;
}

function InlineNode({
  node,
  accent,
  codeBackground,
  onOpenLink,
}: {
  node: Inline;
  accent: string;
  codeBackground: string;
  onOpenLink: (href: string) => Promise<void>;
}): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'code':
      return (
        <code className="math-rich-text__code" style={{ backgroundColor: codeBackground }}>
          {node.value}
        </code>
      );
    case 'math':
      return <Math value={node.value} raw={node.raw} />;
    case 'strong':
      return (
        <strong>
          {renderChildren(node.children, accent, codeBackground, onOpenLink)}
        </strong>
      );
    case 'em':
      return <em>{renderChildren(node.children, accent, codeBackground, onOpenLink)}</em>;
    case 'strike':
      return <s>{renderChildren(node.children, accent, codeBackground, onOpenLink)}</s>;
    case 'link':
      return (
        <button
          className="math-rich-text__link"
          type="button"
          style={{ color: accent }}
          onClick={() => void onOpenLink(node.href)}
        >
          {renderChildren(node.children, accent, codeBackground, onOpenLink)}
        </button>
      );
  }
}

function renderChildren(
  nodes: Inline[],
  accent: string,
  codeBackground: string,
  onOpenLink: (href: string) => Promise<void>,
) {
  return nodes.map((node, index) => (
    <InlineNode
      key={index}
      node={node}
      accent={accent}
      codeBackground={codeBackground}
      onOpenLink={onOpenLink}
    />
  ));
}

function Math({ value, raw, displayMode = false }: { value: string; raw: string; displayMode?: boolean }) {
  const html = renderMathToHtml(value, displayMode);
  if (html) {
    return <span aria-label={raw} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span className="math-rich-text__fallback">{raw}</span>;
}
