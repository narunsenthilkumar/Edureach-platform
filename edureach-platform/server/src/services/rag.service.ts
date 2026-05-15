import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// --- MongoDB Native Client (for LangChain vector operations) ---
// ---- __dirname for ESM ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- MongoDB native client ----
let mongoClient: MongoClient | null = null;

const getMongoClient = async (): Promise<MongoClient> => {
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI || "");
    await mongoClient.connect();
  }
  return mongoClient;
};

// ---- Google GenAI Embeddings ----
// gemini-embedding-001 → default 3072 dimensions (FREE, same API key as Gemini chat)
const getEmbeddings = () => {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not set in .env!");
  }
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-embedding-001",
  });
};

// ---- Vector Store ----
const getVectorStore = async () => {
  const client = await getMongoClient();
  const collection = client.db("edureach_db").collection("knowledge_docs");

  return new MongoDBAtlasVectorSearch(getEmbeddings(), {
    collection: collection as any,
    indexName: "edureach_vector_index",
    textKey: "text",
    embeddingKey: "embedding",
  });
};

// --- Initialize Knowledge Base ---
// A) INDEXING — runs ONCE at server startup
// ============================================
export const initializeKnowledgeBase = async (): Promise<void> => {
  const client = await getMongoClient();
  const collection = client.db("edureach_db").collection("knowledge_docs");

  // Check if docs exist WITH valid (non-empty) embeddings
  const docWithEmbedding = await collection.findOne({
    embedding: { $exists: true, $not: { $size: 0 } },
  });

  if (docWithEmbedding) {
    const count = await collection.countDocuments();
    console.log(` Knowledge base ready (${count} chunks with embeddings)`);
    return;
  }

  // If docs exist but embeddings are empty → delete and re-index
  const existingCount = await collection.countDocuments();
  if (existingCount > 0) {
    console.log(` Found ${existingCount} chunks with EMPTY embeddings — deleting & re-indexing...`);
    await collection.deleteMany({});
  }

  console.log(" Indexing knowledge base...");

  // Verify API key FIRST with a test embedding
  const embeddings = getEmbeddings();
  try {
    const testResult = await embeddings.embedQuery("test");
    console.log(` API key OK — embedding dimensions: ${testResult.length}`);
  } catch (error: any) {
    console.error(" Embedding test failed!");
    console.error("   Error:", error.message || error);
    console.error("   Get key from: https://aistudio.google.com/apikey");
    throw error;
  }

  // LOAD
  const filePath = path.join(__dirname, "../../knowledge-base/edureach-knowledge.txt");
  const loader = new TextLoader(filePath);
  const docs = await loader.load();
  if (docs.length === 0) {
    throw new Error("No documents found in knowledge base file");
  }
  const totalCharacters = docs.reduce((sum, doc) => sum + doc.pageContent.length, 0);
  console.log(`    Loaded ${totalCharacters} characters`);

  // SPLIT
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const allSplits = await splitter.splitDocuments(docs);
  console.log(`    Split into ${allSplits.length} chunks`);

  // EMBED + STORE
  const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
    collection: collection as any,
    indexName: "edureach_vector_index",
    textKey: "text",
    embeddingKey: "embedding",
  });

  await vectorStore.addDocuments(allSplits);

  // VERIFY
  const verifyDoc = await collection.findOne({
    embedding: { $exists: true, $not: { $size: 0 } },
  });

  if (verifyDoc && Array.isArray(verifyDoc.embedding) && verifyDoc.embedding.length > 0) {
    console.log(`    ${allSplits.length} chunks stored (${verifyDoc.embedding.length}D embeddings)`);
    console.log(`     IMPORTANT: Create Atlas Vector Search index with numDimensions: ${verifyDoc.embedding.length}`);
  } else {
    await collection.deleteMany({});
    throw new Error(" Embeddings are empty! Google API returned no vectors.");
  }
};

// --- Get RAG Response ---
export const getRAGResponse = async (question: string): Promise<string> => {
  try {
    console.log("\n🔍 [RAG] Question:", question);
    const vectorStore = await getVectorStore();
    
    // Try vector search first
    let docs = await vectorStore.similaritySearch(question, 3);
    console.log(`📚 [RAG] Vector search returned ${docs.length} documents`);

    // Fallback: if vector search fails, do manual collection query
    if (docs.length === 0) {
      console.log("⚠️  [RAG] Vector search failed, trying direct collection query...");
      const client = await getMongoClient();
      const collection = client.db("edureach_db").collection("knowledge_docs");
      const allDocs = await collection.find({}).limit(10).toArray();
      console.log(`📚 [RAG] Direct query returned ${allDocs.length} documents`);
      
      if (allDocs.length > 0) {
        docs = allDocs.map((doc: any) => ({
          pageContent: doc.text || doc.pageContent || String(doc),
          metadata: { source: doc.metadata?.source || "knowledge_base" },
        }));
      }
    }

    if (!docs || docs.length === 0) {
      console.log("⚠️  [RAG] No documents found, returning fallback");
      return "I don't have that information right now. Click Talk to Us to speak with a counselor.";
    }

    if (docs.length > 0) {
      docs.slice(0, 3).forEach((doc, i) => {
        console.log(`  Doc ${i + 1}: ${doc.pageContent.substring(0, 100)}...`);
      });
    }

    const sources = docs
      .slice(0, 3)
      .map((doc, index) => `Source ${index + 1}:
${doc.pageContent}`)
      .join("\n\n");

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0.2,
    });

    const systemPrompt =
      "You are EduReach Bot, a helpful AI counselor for EduReach College, Hyderabad. " +
      "Use only the information from the provided sources when answering. " +
      "Be concise and friendly. " +
      "If the sources do not contain the requested information, say: 'I don't have that information right now. Click Talk to Us to speak with a counselor.'";

    const response = await model.invoke([
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content:
          `Here are the retrieved knowledge base excerpts:\n\n${sources}\n\nQuestion: ${question}`,
      },
    ]);

    console.log("📝 [RAG] Model response type:", typeof response);
    console.log("📝 [RAG] Model response:", JSON.stringify(response).substring(0, 200));

    if (typeof response === "string") {
      console.log("✅ [RAG] Returning string response");
      return response;
    }

    if (response?.content && typeof response.content === "string") {
      console.log("✅ [RAG] Returning .content property");
      return response.content;
    }

    if (response?.text && typeof response.text === "string") {
      console.log("✅ [RAG] Returning .text property");
      return response.text;
    }

    console.log("⚠️  [RAG] Response was neither string nor had .content/.text, stringifying");
    console.log("📝 [RAG] Response object keys:", Object.keys(response));
    return typeof response === "string" ? response : JSON.stringify(response);
  } catch (error) {
    console.error("🔴 [RAG] Response Error:", error);
    return "I'm having trouble right now. Please try again or click 'Talk to Us'.";
  }
};

