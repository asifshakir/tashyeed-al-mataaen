// review-shia-translations.js
// ================================================
// Reviews and corrects English translations in an XML file
// using LangChain.js with chat memory for Shia scholarly context.
//
// Requirements:
//   npm install dotenv @xmldom/xmldom xpath langchain openai
//   Create .env with CHATGPT_API_KEY and CHATGPT_MODEL

import fs from "fs";
import { config } from "dotenv";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import xpath from "xpath";
import { ChatOpenAI } from "@langchain/openai";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";

config(); // load .env

const [,, inFile, outFile = "corrected.xml"] = process.argv;
const apiKey = process.env.CHATGPT_API_KEY;
const model  = process.env.CHATGPT_MODEL || "gpt-4";

if (!inFile || !apiKey) {
  console.error("Usage: node review-shia-translations.js input.xml [output.xml]");
  process.exit(1);
}

const raw = fs.readFileSync(inFile, "utf8").replace(/^\uFEFF/, "");
const doc = new DOMParser().parseFromString(raw, "text/xml");
const select = xpath.useNamespaces({});
const chapters = select("//chapter", doc);

const llm = new ChatOpenAI({
  openAIApiKey: apiKey,
  modelName: model,
  temperature: 0,
  callbacks: [
    {
      handleLLMStart: async (_llm, prompts) => {
        console.log("🔍 Prompt tokens sent:", prompts.map(p => p.length).reduce((a,b)=>a+b,0));
      },
      handleLLMEnd: async (output) => {
        console.log("📊 Token usage:", output.llmOutput?.tokenUsage ?? "N/A");
      },
      handleLLMError: async (err) => {
        console.error("❌ LLM Error:", err);
      },
    },
  ],
});

const systemPrompt = `You are an expert Shia researcher and translator.
Review the XML and return corrected English translations ONLY.
Preserve all structure and tags; do NOT change Arabic or Persian.
Return the same XML format with <p lang='en'>…</p>.`;

const prompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(systemPrompt),
  new MessagesPlaceholder("history"),
  HumanMessagePromptTemplate.fromTemplate("{input}"),
]);

const memory = new BufferMemory({ returnMessages: true, memoryKey: "history" });
const chain  = new ConversationChain({ llm, memory, prompt });

async function processChapters() {
  for (const chapter of chapters) {
    const titleNode = select("title", chapter)[0];
    const title     = titleNode?.textContent.trim() || "Untitled";
    const paras     = Array.from(chapter.getElementsByTagName("para")).slice(0, 10);
    const xmlChunk  = `<chapter title='${title}'>\n` +
                      paras.map(p => p.toString()).join("\n") +
                      "\n</chapter>";

    console.log(`Reviewing chapter: ${title}`);
    try {
      const { response } = await chain.call({ input: xmlChunk });
      console.log(`Corrected XML for '${title}':\n${response}`);
    } catch (err) {
      console.error(`Failed to process '${title}':`, err);
    }
  }

  const updatedXML = new XMLSerializer().serializeToString(doc);
  fs.writeFileSync(outFile, updatedXML, "utf8");
  console.log(`✅ Saved corrected XML → ${outFile}`);
}

processChapters();
