import OpenAI from "openai";
import axios from "axios";

export const verifyOpenAIKey = async (key: string) => {
  try {
    const openai = new OpenAI({ apiKey: key });
    const models = await openai.models.list();
    return models.data.map(model => ({
      id: model.id,
      name: model.id,
      provider: "openai" as const
    }));
  } catch (error) {
    throw new Error("Invalid OpenAI API key");
  }
};

export const verifyDeepSeekKey = async (key: string) => {
  try {
    const response = await axios.get("https://api.deepseek.com/v1/models", {
      headers: { "Authorization": `Bearer ${key}` }
    });
    return response.data.data.map((model: any) => ({
      id: model.id,
      name: model.id,
      provider: "deepseek" as const
    }));
  } catch (error) {
    throw new Error("Invalid DeepSeek API key");
  }
};

export const verifyOpenWebUIKey = async (key: string) => {
  try {
    const response = await axios.get("http://localhost:5000/v1/models", {
      headers: { "Authorization": `Bearer ${key}` }
    });
    return response.data.data.map((model: any) => ({
      id: model.id,
      name: model.id,
      provider: "openwebui" as const
    }));
  } catch (error) {
    throw new Error("Invalid Open WebUI API key");
  }
};
