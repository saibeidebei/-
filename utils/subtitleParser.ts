
import { SubtitleBlock } from '../types';

export const parseSRT = (content: string): Partial<SubtitleBlock>[] => {
  const blocks: Partial<SubtitleBlock>[] = [];
  const rawBlocks = content.trim().split(/\n\s*\n/);

  rawBlocks.forEach((rawBlock) => {
    const lines = rawBlock.split('\n');
    if (lines.length >= 3) {
      const idStr = lines[0].trim();
      const timeLine = lines[1].trim();
      const text = lines.slice(2).join('\n').trim();

      const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      
      if (timeMatch) {
        blocks.push({
          id: parseInt(idStr),
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          sourceText: text,
          translatedText: '',
          status: 'pending'
        });
      }
    }
  });

  return blocks;
};

export const generateSRT = (blocks: SubtitleBlock[]): string => {
  return blocks
    .map((block) => {
      return `${block.id}\n${block.startTime} --> ${block.endTime}\n${block.translatedText || block.sourceText}\n`;
    })
    .join('\n');
};
