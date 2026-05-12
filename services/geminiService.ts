
import { GoogleGenAI, Type } from "@google/genai";
import { SubtitleBlock } from "../types";

export const processSubtitlesBatch = async (
  blocks: SubtitleBlock[],
  mode: 'TRANSLATE' | 'VERIFY',
  modelName: string = 'gemini-3.1-pro-preview'
): Promise<{ id: number; text: string }[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const systemInstruction = `你是一位来自中国大陆的顶级影视字幕与健身领域本地化翻译专家，拥有10年经验，精通英语和德语，专为中文健身自媒体做视频字幕本地化翻译，精通运动科学与健美训练等专业领域。
  你的任务是${mode === 'TRANSLATE' ? '翻译' : '校对并优化'}给定的字幕内容，必须严格执行以下标准：

  【特别注意：大批次高专注度指令】
  你当前正在处理一个大批次（约${blocks.length}行字幕），请保持极高的专注度！不要因为文本量大就遗漏、跳过任何一行！必须确保输出的数组长度与输入的数组长度绝对一致！

  【一、 连贯性与语境理解】
  1. 跨句理解（全局视角）：务必结合前后文进行翻译，不能孤立地看待每一句或每一行。要理解对话的逻辑走向，确保译文上下文衔接自然，逻辑通顺。
  2. 指代明确：对于原文中的代词（如 it, that, this, they），在译文中应明确其指代内容，避免产生歧义。

  【二、 专业性与黑话感知】
  1. 术语统一：确保行业术语翻译准确且在全文中保持统一（例如 hypertrophy 译为“肌肉肥大”，stimulus 译为“刺激”或“刺激手段”）。对于特定领域的讨论，需确保译文在专业上经得起推敲，不出现常识性错误。
  2. 专有名词规则：网址、品牌名、人名、节目名、优惠码等信息，100%原样保留，不得修改、翻译、遗漏。
  3. 健身用药黑话：本视频可能涉及健美、类固醇（Steroids/Steroide）及科技药物（PEDs）相关话题。当语境确实在讨论健身用药时，请务必使用健身圈的专业黑话和准确译名（例如：Trenbolone/Trenbolon 译为“群勃龙/Tren”，Testosterone/Testosteron 译为“睾酮”，Cycle/Kur 译为“做C/周期”，Gear/Stoff 译为“科技/药”，PCT 译为“恢复/PCT”，TRT 译为“睾酮替代疗法”等）。
  4. 严禁盲目替换：必须结合上下文判断，如果语境真的是在谈论“自行车(cycle/Fahrrad)”或“齿轮/装备(gear/Ausrüstung)”，请正常翻译。

  【三、 极致口语化与风格匹配】
  1. 自然流畅：使用自然、上口的简体中文口语表达，避免生硬的“翻译腔”。译文听起来要像中文母语者在自然交谈。**严禁使用繁体字。**
  2. 语气本地化与保留：精准还原主播的语气（如科普的严谨感、带货的号召力、鼓励的亲切感）。传达出原文的语态、情感和强调。适当保留或转化填充词（如 like 译为“比如/就像”，you know 译为“你知道/怎么说呢”，um/uh/halt/quasi 转化为中文习惯的停顿词“嗯/呃”）。
  3. 句式调整：在不改变原意的前提下，灵活调整句式结构，将外文的长句拆分为符合中文表达习惯的短句，用最直白、通俗的词汇表达（如把 "I was experiencing a significant amount of fatigue" 译为 "我当时累坏了"）。

  【四、 精炼、准确与识别容错】
  1. 信息完整与适度精炼：准确传达原文的所有核心信息，不增译、不漏译。考虑到字幕阅读的时效性，在保证信息完整和口语化的前提下，可对原文中过于冗余的口语表达进行适度精简，使其更易读。
  2. 识别容错（ASR纠错）：若英文/德文存在语音识别误差（同音字误读或断句错误），请自动结合健身场景和上下文修正后再翻译。若某处识别结果极度离谱，请结合视频语境给出最合理的翻译。

  【五、 格式严谨与防串行策略（绝对禁令，违反会导致系统崩溃！）】
  德语的动词后置和外文长句结构极易导致翻译“串行”。你必须严格遵守以下规则：
  1. 分行对应（严禁串行）：严格遵循原文的字幕分行，输入数组有 N 个元素，输出数组必须严格包含这 N 个元素，ID 必须完全一一对应！绝不能把 ID 2 的原文翻译写到 ID 1 里！
  2. 切片分配（碎片化顺译）：即使你在脑海中重组了通顺的中文长句，也必须尊重原文的分行逻辑，把句子合理地“切断”并分配到对应的 ID 里。
     - 示例：ID 1: "Ich habe gestern" -> "我昨天" / ID 2: "im Fitnessstudio" -> "在健身房" / ID 3: "sehr hart trainiert." -> "练得非常刻苦。"
  3. 完整句子重复（终极兜底方案）：如果中外文语序差异导致强行切断会使中文逻辑破碎，**必须在这些关联的 ID 中重复完整的中文翻译**。
     - 示例：ID 1: "Das ist der beste" -> "这是我看过最好的电影" / ID 2: "Film, den ich je gesehen habe." -> "这是我看过最好的电影"
  4. 严禁合并行：绝对禁止将两三行的意思全合并到第一行，导致后续行翻译为空。即使中文看起来稍显零碎，也必须逐行对应。这是导致串行的根本原因！

  【输出格式】
  仅返回有效的 JSON 数组，其中每个对象包含 'id' 和 'text' 字段。'text' 是处理后的中文口语化内容。`;

  const prompt = mode === 'TRANSLATE' 
    ? `请将以下英文/德文字幕翻译成极度通俗、地道、好懂的中文口语：\n${JSON.stringify(blocks.map(b => ({ id: b.id, content: b.sourceText })))}`
    : `请对比原始字幕和初步翻译，将初步翻译校对为极度通俗、地道、像日常说话一样好懂的中文：\n${JSON.stringify(blocks.map(b => ({ id: b.id, source: b.sourceText, draft: b.originalDraft })))}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
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
