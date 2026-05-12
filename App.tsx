
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import FileUploader from './components/FileUploader';
import { SubtitleBlock, ProcessMode, ProcessingProgress } from './types';
import { parseSRT, generateSRT } from './utils/subtitleParser';
import { processSubtitlesBatch } from './services/geminiService';

class RateLimiter {
  private timestamps: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  async acquire(onWait?: (waitTimeMs: number) => void): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.limit) {
      const oldest = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldest);
      if (onWait) onWait(waitTime);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire(onWait);
    }

    this.timestamps.push(Date.now());
  }
}

const App: React.FC = () => {
  const [blocks, setBlocks] = useState<SubtitleBlock[]>([]);
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-pro-preview');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const MODELS = [
    { id: 'gemini-3.1-pro-preview', name: '1. Gemini 3.1 Pro (翻译质量最佳，最强语境与黑话理解)' },
    { id: 'gemini-3-flash-preview', name: '2. Gemini 3 Flash (质量与速度完美平衡)' },
    { id: 'gemini-flash-latest', name: '3. Gemini Flash (最新稳定版，性价比高)' },
    { id: 'gemini-2.5-flash', name: '4. Gemini 2.5 Flash (经典稳定版)' },
    { id: 'gemini-3.1-flash-lite-preview', name: '5. Gemini 3.1 Flash Lite (极速，适合简单直译)' }
  ];

  const handleSourceUpload = (content: string) => {
    const parsed = parseSRT(content) as SubtitleBlock[];
    setBlocks(parsed);
    setSourceLoaded(true);
  };

  const handleDraftUpload = (content: string) => {
    const parsedDraft = parseSRT(content);
    setBlocks(prev => {
      return prev.map(block => {
        const draft = parsedDraft.find(d => d.id === block.id);
        return {
          ...block,
          originalDraft: draft?.sourceText || '',
          translatedText: draft?.sourceText || ''
        };
      });
    });
    setDraftLoaded(true);
  };

  const runProcessing = async () => {
    if (blocks.length === 0 || isProcessing) return;
    
    setIsProcessing(true);
    setProgress({ current: 0, total: blocks.length });

    const mode: ProcessMode = draftLoaded ? ProcessMode.VERIFY : ProcessMode.TRANSLATE;
    const batchSize = 100; // Increased back to 100 as requested

    try {
      const batches: SubtitleBlock[][] = [];
      for (let i = 0; i < blocks.length; i += batchSize) {
        batches.push(blocks.slice(i, i + batchSize));
      }

      let completedCount = 0;
      let currentIndex = 0;

      // Rate limiting configuration based on selected model
      const getModelConfig = (modelId: string) => {
        if (modelId.includes('pro')) {
          return { concurrency: 2, rpm: 15 }; // Pro tier limit
        } else if (modelId.includes('lite')) {
          return { concurrency: 5, rpm: 60 }; // Lite tier limit
        } else {
          return { concurrency: 3, rpm: 60 }; // Flash tier limit (e.g., 60 RPM)
        }
      };

      const modelConfig = getModelConfig(selectedModel);
      const rateLimiter = new RateLimiter(modelConfig.rpm, 60000);

      const processNext = async (): Promise<void> => {
        if (currentIndex >= batches.length) return;
        
        const batchIndex = currentIndex++;
        const batch = batches[batchIndex];
        const startIndex = batchIndex * batchSize;
        
        // Wait for rate limiter
        await rateLimiter.acquire((waitTime) => {
          // Update status for visual feedback
          setBlocks(prev => prev.map((b, idx) => {
            if (idx >= startIndex && idx < startIndex + batch.length) {
              return { 
                ...b, 
                status: 'processing',
                translatedText: `等待 API 限制 (${Math.ceil(waitTime/1000)}s)...`
              };
            }
            return b;
          }));
        });

        // Update status to processing after wait
        setBlocks(prev => prev.map((b, idx) => 
          (idx >= startIndex && idx < startIndex + batch.length) ? { ...b, status: 'processing', translatedText: '正在深思熟虑...' } : b
        ));

        try {
          const results = await processSubtitlesBatch(batch, mode, selectedModel);
          
          setBlocks(prev => {
            const next = [...prev];
            results.forEach(res => {
              const targetIndex = next.findIndex(b => b.id === res.id);
              if (targetIndex !== -1) {
                next[targetIndex] = {
                  ...next[targetIndex],
                  translatedText: res.text,
                  status: 'completed'
                };
              }
            });
            return next;
          });

          completedCount += batch.length;
          setProgress(prev => ({ ...prev, current: Math.min(completedCount, blocks.length) }));
        } catch (error) {
          console.error(`Batch ${batchIndex} failed`, error);
          setBlocks(prev => prev.map((b, idx) => 
            (idx >= startIndex && idx < startIndex + batch.length) ? { ...b, status: 'error', translatedText: '处理失败，请重试' } : b
          ));
        } finally {
          await processNext();
        }
      };

      // Start workers based on concurrency
      const workers = [];
      for (let i = 0; i < modelConfig.concurrency && i < batches.length; i++) {
        workers.push(processNext());
      }

      await Promise.all(workers);

    } catch (error) {
      console.error("Batch processing failed", error);
      alert("处理过程中出现错误，请检查网络或 API Key");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextChange = (id: number, text: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, translatedText: text } : b));
  };

  const downloadSRT = () => {
    const content = generateSRT(blocks);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translated_${new Date().getTime()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredBlocks = blocks.filter(b => 
    b.sourceText.toLowerCase().includes(searchQuery.toLowerCase()) || 
    b.translatedText.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-8">
        
        {!sourceLoaded ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-700">
            <div className="text-center max-w-2xl">
              <h2 className="text-4xl font-extrabold mb-4">开启地道翻译之旅</h2>
              <p className="text-slate-400 text-lg">
                上传您的英文字幕文件，我们将通过 AI 引擎为您提供极其自然、充满生活气息的中文口语翻译。
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
              <FileUploader 
                label="上传源语言字幕" 
                description="必选，通常为 .srt 格式的英文字幕" 
                onFileSelect={handleSourceUpload}
              />
              <div className="opacity-50 cursor-not-allowed border-2 border-dashed border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                <p className="font-medium text-slate-500 italic">请先上传源字幕</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-[calc(100vh-10rem)]">
            {/* Control Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-t-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                <div className="relative flex-1 max-w-md">
                  <input 
                    type="text" 
                    placeholder="搜索字幕内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <svg className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {!draftLoaded && (
                  <button 
                    onClick={() => document.getElementById('draft-upload')?.click()}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap"
                  >
                    + 上传现有翻译进行校对
                    <input id="draft-upload" type="file" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if(file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => handleDraftUpload(ev.target?.result as string);
                        reader.readAsText(file);
                      }
                    }} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {isProcessing && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-indigo-500/10 rounded-lg">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-medium text-indigo-400">
                      正在处理: {progress.current} / {progress.total}
                    </span>
                  </div>
                )}
                <button 
                  onClick={runProcessing}
                  disabled={isProcessing}
                  className={`px-6 py-2 rounded-lg font-semibold transition-all shadow-lg ${
                    isProcessing 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 active:scale-95'
                  }`}
                >
                  {draftLoaded ? '开始口语化校对' : '开始智能翻译'}
                </button>
                <button 
                  onClick={downloadSRT}
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-semibold transition-all"
                >
                  导出结果
                </button>
              </div>
            </div>

            {/* List Header */}
            <div className="bg-slate-800/50 border-x border-slate-800 text-xs font-bold text-slate-500 grid grid-cols-12 px-6 py-3 uppercase tracking-wider">
              <div className="col-span-1">ID / 时间</div>
              <div className="col-span-5 px-4">原始文本</div>
              <div className="col-span-6 px-4">{draftLoaded ? '口语化翻译 (可编辑)' : '目标翻译 (可编辑)'}</div>
            </div>

            {/* Subtitle List */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-b-xl overflow-y-auto custom-scrollbar"
            >
              {filteredBlocks.map((block) => (
                <div 
                  key={block.id} 
                  className={`grid grid-cols-12 px-6 py-4 border-b border-slate-800/50 transition-colors hover:bg-slate-800/20 ${
                    block.status === 'processing' ? 'bg-indigo-500/5 ring-1 ring-inset ring-indigo-500/20' : ''
                  }`}
                >
                  <div className="col-span-1 text-xs space-y-1">
                    <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">#{block.id}</span>
                    <div className="text-slate-500 font-mono mt-1">
                      {block.startTime.split(',')[0]}
                    </div>
                  </div>
                  
                  <div className="col-span-5 px-4">
                    <p className="text-slate-300 leading-relaxed text-sm">{block.sourceText}</p>
                    {block.originalDraft && (
                      <div className="mt-2 pt-2 border-t border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">原始草稿:</span>
                        <p className="text-slate-500 text-xs mt-1 italic">{block.originalDraft}</p>
                      </div>
                    )}
                  </div>

                  <div className="col-span-6 px-4">
                    <div className="relative">
                      <textarea 
                        value={block.translatedText}
                        onChange={(e) => handleTextChange(block.id, e.target.value)}
                        placeholder={block.status === 'processing' ? '正在深思熟虑...' : '等待处理...'}
                        className={`w-full bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[80px] transition-all ${
                          block.status === 'completed' ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      />
                      {block.status === 'completed' && (
                        <div className="absolute top-2 right-2">
                          <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredBlocks.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-slate-500">
                  <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>没有找到相关字幕</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-slate-600 text-xs">
        &copy; 2024 口语化字幕大师 - 使用 Gemini API 提供支持
      </footer>
    </div>
  );
};

export default App;
