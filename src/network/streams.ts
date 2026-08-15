export interface SseEvent {
  event: string | null;
  data: string;
  id: string | null;
}

export class SseParser {
  private buffer = '';

  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const events: SseEvent[] = [];
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const parsed = parseSseBlock(block);
      if (parsed) events.push(parsed);
      boundary = this.buffer.indexOf('\n\n');
    }
    return events;
  }

  finish(): SseEvent[] {
    const tail = this.buffer.trim();
    this.buffer = '';
    const parsed = tail ? parseSseBlock(tail) : null;
    return parsed ? [parsed] : [];
  }
}

function parseSseBlock(block: string): SseEvent | null {
  let event: string | null = null;
  let id: string | null = null;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const split = line.indexOf(':');
    const field = split < 0 ? line : line.slice(0, split);
    const value = split < 0 ? '' : line.slice(split + 1).replace(/^ /, '');
    if (field === 'data') data.push(value);
    if (field === 'event') event = value;
    if (field === 'id') id = value;
  }
  return data.length ? { event, id, data: data.join('\n') } : null;
}

export class NdjsonParser<T = unknown> {
  private buffer = '';

  push(chunk: string): T[] {
    this.buffer += chunk.replace(/^\uFEFF/, '');
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
  }

  finish(): T[] {
    const tail = this.buffer.trim();
    this.buffer = '';
    return tail ? [JSON.parse(tail) as T] : [];
  }
}
