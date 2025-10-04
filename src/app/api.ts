import OpenAI from "openai";
import axios from "axios";

export const verifyOpenAIKey = async (key: string) => {
  try {
    const openai = new OpenAI({ apiKey: key });
    const response = await openai.models.list();
    const filteredModels = response.data.filter(model => 
      model.id.includes('gpt') || model.id.includes('text-davinci')
    );
    return filteredModels.map(model => ({
      id: model.id,
      name: model.id.replace(/-[0-9]+$/, ''),  // Clean up version numbers
      provider: "openai" as const
    }));
  } catch (error) {
    console.error('OpenAI API Error:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error("Invalid OpenAI API key");
      }
      throw new Error(error.response?.data?.error?.message || "Error connecting to OpenAI");
    }
    throw new Error("Failed to verify OpenAI API key");
  }
};

export const verifyDeepSeekKey = async (key: string) => {
  try {
    // DeepSeek API endpoint
    const response = await axios.post("https://api.deepseek.com/v1/chat/completions", {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "List available models" }],
      temperature: 0
    }, {
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      }
    });
    
    // DeepSeek available models
    const models = [
      { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek" as const },
      { id: "deepseek-coder", name: "DeepSeek Coder", provider: "deepseek" as const }
    ];
    
    // If we got a successful response, return the models
    return models;
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error("Invalid DeepSeek API key");
      } else if (error.response?.status === 404) {
        throw new Error("DeepSeek API endpoint not found. Please check your API key.");
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error("Could not connect to DeepSeek API. Please check your internet connection.");
      }
      throw new Error(error.response?.data?.error?.message || "Error connecting to DeepSeek API");
    }
    throw new Error("Failed to verify DeepSeek API key");
  }
};

export const verifyOpenWebUIKey = async (key: string) => {
  try {
    // Default OpenWebUI endpoint (can be configured)
    const response = await axios.get("http://localhost:3001/v1/models", {
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      timeout: 5000 // 5 second timeout
    });
    
    // Map the response to our model format
    const models = response.data.data || [];
    return models.map((model: any) => ({
      id: model.id || model.model_id,
      name: model.name || model.id || model.model_id,
      provider: "openwebui" as const
    }));
  } catch (error) {
    console.error('OpenWebUI API Error:', error);
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error("Could not connect to OpenWebUI server. Make sure it's running on port 3001");
      }
      if (error.response?.status === 401) {
        throw new Error("Invalid OpenWebUI API key");
      }
      throw new Error(error.response?.data?.error?.message || "Error connecting to OpenWebUI");
    }
    throw new Error("Failed to verify OpenWebUI API key");
  }
};
