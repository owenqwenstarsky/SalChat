import type { ChatRequest } from './types';
import { OpenAiChatAdapter } from './openaiChat';
import { attachmentParts, dataUrl, messageText, systemPrompt } from './shared';

export class LlamaCppAdapter extends OpenAiChatAdapter {
  protected override serializeMessages(request: ChatRequest): unknown[] {
    const prompt = systemPrompt(request);
    const history = request.messages.map((message) => {
      const text = messageText(message);
      const files = attachmentParts(message, request.attachments);
      if (!files.length) return { role: message.role, content: text };
      const content: unknown[] = text ? [{ type: 'text', text }] : [];
      for (const file of files) {
        if (file.mimeType.startsWith('image/')) content.push({ type: 'image_url', image_url: { url: dataUrl(file) } });
        else if (file.mimeType.startsWith('audio/')) content.push({ type: 'input_audio', input_audio: { data: file.base64 } });
        else if (file.mimeType.startsWith('video/')) content.push({ type: 'input_video', input_video: { data: file.base64 } });
      }
      return { role: message.role, content };
    });
    return prompt && request.model.capabilities.systemMessages.value ? [{ role: 'system', content: prompt }, ...history] : history;
  }
}
