
import { GoogleGenAI, Type } from "@google/genai";
import { SubtitleBlock } from "../types";

export const processSubtitlesBatch = async (
  blocks: SubtitleBlock[],
  mode: 'TRANSLATE' | 'VERIFY'
): Promise<{ id: number; text: string }[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const systemInstruction = `你是一位专业的影视字幕翻译与本地化专家。
  你的任务是${mode === 'TRANSLATE' ? '翻译' : '校对并优化'}给定的字幕内容。
  
  核心要求：
  1. 极其口语化：必须符合中文母语者的日常交流习惯。避免机械翻译，使用更自然、更有生命力的表达。
  2. 简练：字幕每行不宜过长，保持节奏。
  3. 上下文衔接：根据提供的多个字幕块，保持语气的一致性。
  4. 语气匹配：如果是对话，请根据内容判断是正式还是非正式语气。
  
  输出格式：
  你必须返回一个JSON数组，其中每个对象包含 'id' 和 'text' 字段。'text' 是处理后的中文口语化内容。`;

  const prompt = mode === 'TRANSLATE' 
    ? `请将以下英文字幕翻译成地道的中文口语：\n${JSON.stringify(blocks.map(b => ({ id: b.id, content: b.sourceText })))}`
    : `请对比原始字幕和初步翻译，将初步翻译校对为更地道、口语化的中文：\n${JSON.stringify(blocks.map(b => ({ id: b.id, source: b.sourceText, draft: b.originalDraft })))}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              text: { type: Type.STRING }
            },
            required: ["id", "text"]
          }
        }
      }
    });

    const result = JSON.parse(response.text || "[]");
    return result;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
