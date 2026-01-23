
export interface SubtitleBlock {
  id: number;
  startTime: string;
  endTime: string;
  sourceText: string;
  translatedText: string;
  originalDraft?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export enum ProcessMode {
  TRANSLATE = 'TRANSLATE',
  VERIFY = 'VERIFY'
}

export interface ProcessingProgress {
  current: number;
  total: number;
}
