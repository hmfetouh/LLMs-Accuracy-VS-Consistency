"use client";

import { useState, useEffect } from "react";

// Simple function to estimate token count (approximately 4 characters per token)
const estimateTokenCount = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};
import { AttachmentIcon, ChevronDownIcon, RepeatIcon, TriangleUpIcon } from "@chakra-ui/icons";
import {
  Box,
  Container,
  VStack,
  Heading,
  Input,
  Select,
  Textarea,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
  FormControl,
  FormLabel,
  Text,
  HStack,
  Flex,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Switch,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from "@chakra-ui/react";

type Provider = "openai" | "deepseek" | "openwebui";

interface Model {
  id: string;
  name: string;
  provider: Provider;
}

interface StoredApiConfig {
  id: string;
  provider: Provider;
  key: string;
  maskedKey: string;
  baseUrl?: string;
}

const NoFileSelected = () => (
  <Box 
    bg="purple.50" 
    p={4}
    py="45px"
    borderRadius="md" 
    borderWidth="1px" 
    borderColor="purple.200" 
    height="160px"
  >
    <VStack spacing={4} align="stretch" justify="center" height="full">
      <Box>
        <Text fontSize="sm" color="purple.600" mb={0.5}>File Status</Text>
        <Text fontSize="md" color="purple.900" fontWeight="medium">
          No file selected
        </Text>
      </Box>
      
      <Box>
        <Text fontSize="sm" color="purple.600" mb={0.5}>Question Count</Text>
        <Text fontSize="xl" color="purple.700" fontWeight="bold">
          -
        </Text>
        <Text fontSize="xs" color="gray.500" mt={0.5}>
          Upload a CSV file to see details
        </Text>
      </Box>
    </VStack>
  </Box>
);

// Helper function to deduplicate models by ID
const deduplicateModelsById = (models: Model[]): Model[] => {
  const uniqueModels: Model[] = [];
  const seenIds = new Set<string>();
  
  for (const model of models) {
    if (!seenIds.has(model.id)) {
      seenIds.add(model.id);
      uniqueModels.push(model);
    }
  }
  
  return uniqueModels;
};

interface EvaluationResult {
  questionId: string;
  modelResults: Record<string, boolean>;
}

interface ApiConfig {
  key: string;
  baseUrl?: string;
}

interface StoredApiConfig {
  id: string;
  provider: Provider;
  key: string;
  maskedKey: string;
  baseUrl?: string;
}

export default function Home() {
  const [selectedModels, setSelectedModels] = useState<Model[]>([]);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [temperature, setTemperature] = useState(1.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoClearHistory, setAutoClearHistory] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [systemPrompt, setSystemPrompt] = useState("Answer the following multiple choice question by providing only the letter of the correct answer (e.g A, B, C, or D).");
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [modelSearch, setModelSearch] = useState("");
  const [activeResultTab, setActiveResultTab] = useState<"results" | "summary" | "charts" | "logs">("results");
  const [apiLogs, setApiLogs] = useState<Array<{
    timestamp: string;
    model: string;
    provider: string;
    request: any;
    response?: any;
    error?: any;
    duration: number;
    question?: string;
    questionId?: string;
    correctAnswer?: string;
    expanded?: boolean;
    temperature?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    showFullRequest?: boolean;
  }>>([]);
  const [currentProvider, setCurrentProvider] = useState<"openai" | "deepseek" | "openwebui">("openai");
  const [apiConfigs, setApiConfigs] = useState<Record<string, ApiConfig>>({
    openai: { key: "", baseUrl: "https://api.openai.com/v1" },
    deepseek: { key: "", baseUrl: "https://api.deepseek.com/v1" },
    openwebui: { key: "", baseUrl: "http://localhost:3001/v1" },
  });
  
  // State for storing API configurations
  const [storedApiConfigs, setStoredApiConfigs] = useState<StoredApiConfig[]>([]);
  
  // Load stored configs from localStorage after component mounts
  useEffect(() => {
    const saved = localStorage.getItem('storedApiConfigs');
    if (saved) {
      try {
        const parsedConfigs = JSON.parse(saved);
        setStoredApiConfigs(parsedConfigs);
      } catch (error) {
        console.error("Error loading stored API configs:", error);
      }
    }
    
    // Load saved models from localStorage if available
    const savedModels = localStorage.getItem('availableModels');
    if (savedModels) {
      try {
        const parsedModels = JSON.parse(savedModels);
        
        // Ensure model IDs are unique before setting state
        const uniqueModels = deduplicateModelsById(parsedModels);
        
        // Update localStorage if we had to deduplicate
        if (uniqueModels.length !== parsedModels.length) {
          localStorage.setItem('availableModels', JSON.stringify(uniqueModels));
          console.log(`Removed ${parsedModels.length - uniqueModels.length} duplicate models`);
        }
        
        setAvailableModels(uniqueModels);
      } catch (error) {
        console.error("Error loading saved models:", error);
      }
    }
  }, []);
  
  // Load models from all stored configurations when storedApiConfigs changes
  useEffect(() => {
    if (storedApiConfigs.length > 0) {
      // Only run once after initial config loading, not on every config change
      // to prevent excessive API calls
      const hasLoadedModels = localStorage.getItem('hasLoadedModels') === 'true';
      if (!hasLoadedModels) {
        console.log("Auto-loading models from stored configurations...");
        verifyApiKey();
        localStorage.setItem('hasLoadedModels', 'true');
      }
    }
    
    // Reset the hasLoadedModels flag when the component unmounts
    // so models will be reloaded on page refresh
    return () => {
      localStorage.removeItem('hasLoadedModels');
    };
  }, [storedApiConfigs.length > 0 ? 'loaded' : 'empty']);
  const toast = useToast();

  const getApiKey = () => apiConfigs[currentProvider].key;
  const getBaseUrl = () => apiConfigs[currentProvider].baseUrl || "";
  const getDefaultBaseUrl = (provider?: Provider) => {
    const providerToUse = provider || currentProvider;
    switch (providerToUse) {
      case "openai":
        return "https://api.openai.com/v1";
      case "deepseek":
        return "https://api.deepseek.com/v1";
      case "openwebui":
        return "http://localhost:3001/v1";
      default:
        return "https://api.openai.com/v1"; // Default fallback
    }
  };

  const updateApiKey = (key: string) => {
    setApiConfigs(prev => ({
      ...prev,
      [currentProvider]: { ...prev[currentProvider], key }
    }));
  };

  const updateBaseUrl = (baseUrl: string) => {
    setApiConfigs(prev => ({
      ...prev,
      [currentProvider]: { ...prev[currentProvider], baseUrl }
    }));
  };
  
  // Add API configuration, replace existing from same provider, and load models
  const addApiConfig = async () => {
    const key = getApiKey();
    if (!key) {
      toast({
        title: "API Key Required",
        description: "Please enter an API key",
        status: "error",
        duration: 3000,
      });
      return;
    }
    
    const baseUrl = getBaseUrl() || getDefaultBaseUrl();
    // Generate a stable ID using timestamp + random digits
    const id = Date.now().toString() + '-' + (Math.floor(Math.random() * 1000)).toString().padStart(3, '0');
    const maskedKey = key.substring(0, 6) + "..." + key.substring(key.length - 6);
    
    const newConfig: StoredApiConfig = {
      id,
      provider: currentProvider,
      key,
      maskedKey,
      baseUrl
    };
    
    // Remove any existing config with the same provider
    const filteredConfigs = storedApiConfigs.filter(config => config.provider !== currentProvider);
    const updatedConfigs = [...filteredConfigs, newConfig];
    setStoredApiConfigs(updatedConfigs);
    
    // Save to localStorage
    localStorage.setItem('storedApiConfigs', JSON.stringify(updatedConfigs));
    
    try {
      // Automatically verify the API key and load models
      await verifyApiKey(id);
      
      toast({
        title: "API Configuration Saved",
        description: `${currentProvider} API models loaded`,
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error loading models after adding API config:", error);
      toast({
        title: "API Configuration Saved",
        description: "Configuration saved but couldn't load models. Try again.",
        status: "warning",
        duration: 3000,
      });
    }
  };
  
  // Remove an API configuration and its models
  const removeApiConfig = (id: string) => {
    const configToRemove = storedApiConfigs.find(config => config.id === id);
    if (!configToRemove) return;
    
    // Remove configuration
    const updatedConfigs = storedApiConfigs.filter(config => config.id !== id);
    setStoredApiConfigs(updatedConfigs);
    localStorage.setItem('storedApiConfigs', JSON.stringify(updatedConfigs));
    
    // Remove models from this provider
    setAvailableModels(prev => {
      const updatedModels = prev.filter(model => model.provider !== configToRemove.provider);
      // Update localStorage
      localStorage.setItem('availableModels', JSON.stringify(updatedModels));
      return updatedModels;
    });
    
    // Remove any selected models from this provider
    setSelectedModels(prev => prev.filter(model => model.provider !== configToRemove.provider));
    
    toast({
      title: "API Configuration Removed",
      description: `${configToRemove.provider === 'openai' ? 'OpenAI' : 
                     configToRemove.provider === 'deepseek' ? 'DeepSeek' : 
                     configToRemove.provider === 'openwebui' ? 'Open WebUI' : 
                     configToRemove.provider} configuration and models removed`,
      status: "info",
      duration: 3000,
    });
  };

  // Helper function to get the active API key for a specific provider
  const getActiveApiKeyForProvider = (provider: Provider): string | null => {
    // First check if there's a stored config for this provider
    const storedConfig = storedApiConfigs.find(config => config.provider === provider);
    
    if (storedConfig && storedConfig.key) {
      return storedConfig.key;
    }
    
    // Fall back to the current form values
    const currentConfig = apiConfigs[provider];
    return (currentConfig && currentConfig.key) ? currentConfig.key : null;
  };
  
  // Helper function to format model IDs correctly for API requests
  const formatModelIdForAPI = (modelId: string, provider: Provider): string => {
    // If modelId starts with provider name or provider-specific prefix, remove it
    const prefixes = [
      `${provider}-`,
      `provider-${provider}-`,
      'openai-',
      'deepseek-',
      'openwebui-'
    ];
    
    let formattedId = modelId;
    for (const prefix of prefixes) {
      if (formattedId.startsWith(prefix)) {
        formattedId = formattedId.slice(prefix.length);
        break;
      }
    }
    
    // Handle specific provider formatting requirements
    if (provider === 'openai') {
      // OpenAI doesn't want the openai- prefix
      if (formattedId.includes('gpt-4') || formattedId.includes('gpt-3.5')) {
        return formattedId; // Standard GPT model names should be kept as is
      }
    } 
    else if (provider === 'deepseek') {
      // DeepSeek model handling
      if (formattedId === 'deepseek-chat') {
        return 'deepseek-chat'; // Standard model name
      } else if (formattedId === 'chat') {
        return 'deepseek-chat'; // Common shorthand
      } else if (formattedId === 'coder' || formattedId === 'deepseek-coder') {
        return 'deepseek-coder'; // Ensure correct coder model name
      } else if (formattedId.includes('coder')) {
        return 'deepseek-coder'; // Likely meant the coder model
      } else if (formattedId.includes('chat') || formattedId === 'llm' || formattedId === 'deepseek') {
        return 'deepseek-chat'; // Likely meant the chat model
      }
    }
    
    return formattedId;
  };
  
  // Helper function to check if API configurations are valid
  const validateApiConfigurations = () => {
    const invalidModels = [];
    const providersWithIssues = new Set<string>();
    
    for (const model of selectedModels) {
      // Get active API key for this model's provider
      const activeKey = getActiveApiKeyForProvider(model.provider as Provider);
      
      // If no active key found
      if (!activeKey || activeKey.trim().length === 0) {
        invalidModels.push({
          name: model.name,
          provider: model.provider
        });
        providersWithIssues.add(model.provider);
      }
    }
    
    // Check for specific issues with Deepseek
    if (providersWithIssues.has('deepseek')) {
      console.log("Deepseek API issue detected. Available configs:", storedApiConfigs);
    }
    
    return {
      invalidModels,
      providersWithIssues
    };
  };

  const startEvaluation = async () => {
    // Check that we have both a file and at least one model selected
    if (!selectedFile) {
      toast({
        title: "File Required",
        description: "Please select a CSV file with questions to evaluate.",
        status: "warning",
        duration: 3000,
      });
      return;
    }
    
    if (selectedModels.length === 0) {
      toast({
        title: "Models Required",
        description: "Please select at least one model for evaluation.",
        status: "warning", 
        duration: 3000,
      });
      return;
    }
    
    // Check that all selected models have valid API configurations
    const { invalidModels, providersWithIssues } = validateApiConfigurations();
    if (invalidModels.length > 0) {
      const modelsList = invalidModels.map(m => `${m.provider}/${m.name}`).join(', ');
      
      // Create provider-specific instructions
      const providerInstructions = Array.from(providersWithIssues).map(provider => {
        if (provider === 'openai') {
          return "OpenAI: Add your API key in the sidebar";
        } else if (provider === 'deepseek') {
          return "DeepSeek: Get an API key from deepseek.com and add it in the sidebar";
        } else if (provider === 'openwebui') {
          return "OpenWebUI: Ensure your local API is running and configured";
        } else {
          return `${provider}: Add your API key in the sidebar`;
        }
      }).join('\n• ');
      
      toast({
        title: "API Configuration Missing",
        description: `The following models are missing API keys: ${modelsList}.\n\nTo fix this:\n• ${providerInstructions}`,
        status: "error",
        duration: 8000,
        isClosable: true,
      });
      return;
    }
    
    console.log(`Starting evaluation with ${selectedModels.length} models and file: ${selectedFile.name}`);

    // Set both global and local loading states
    setIsProcessing(true);
    setIsEvaluating(true);
    setProgress({ current: 0, total: questionCount });
    setResults([]);

    try {
      // Read the CSV file
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        // Handle both Windows (\r\n) and Unix (\n) line endings
        const lines = content.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim());
        
        if (lines.length <= 1) {
          toast({
            title: "Invalid CSV file",
            description: "The CSV file appears to be empty or only contains headers.",
            status: "error",
            duration: 3000,
          });
          setIsEvaluating(false);
          setIsProcessing(false);
          return;
        }
        
        // Log the raw lines for debugging
        console.log("CSV Headers:", lines[0]);
        console.log("First data line:", lines[1]);
        
        // First parse the header row to determine column indices
        const headerLine = lines[0];
        
        // Parse header columns with the same CSV parser
        let headerParts: string[] = [];
        let currentHeader = '';
        let inQuotes = false;
        
        // More robust CSV parser for headers
        for (let j = 0; j < headerLine.length; j++) {
          const char = headerLine[j];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            headerParts.push(currentHeader.trim().toLowerCase());
            currentHeader = '';
          } else {
            currentHeader += char;
          }
        }
        // Add the last header part
        headerParts.push(currentHeader.trim().toLowerCase());
        
        console.log("Parsed headers:", headerParts);
        
        // Find the indices of required columns - more flexible matching
        let idIndex = headerParts.findIndex(h => h.includes('id'));
        let questionIndex = headerParts.findIndex(h => h.includes('question'));
        let answerIndex = headerParts.findIndex(h => 
          h.includes('correct answer') || 
          h.includes('correct_answer') || 
          h.includes('correctanswer') ||
          (h.includes('correct') && h.includes('answer'))
        );
        
        // Special case for the sample CSV format: From, ID, Question, Len (Char), Correct Answer
        if (headerParts.length >= 5) {
          const fromIndex = headerParts.findIndex(h => h === 'from');
          const lenIndex = headerParts.findIndex(h => h.includes('len'));
          
          if (fromIndex === 0 && idIndex === 1 && questionIndex === 2 && lenIndex === 3 && answerIndex === 4) {
            console.log("Detected standard CSV format: From, ID, Question, Len (Char), Correct Answer");
          } else if (idIndex === -1 && headerParts[1]?.toLowerCase() === 'id') {
            // If ID column wasn't detected but it's the second column
            idIndex = 1;
            console.log("Fixed ID column detection (position 1)");
          }
          
          if (questionIndex === -1 && headerParts[2]?.toLowerCase() === 'question') {
            // If Question column wasn't detected but it's the third column
            questionIndex = 2;
            console.log("Fixed Question column detection (position 2)");
          }
          
          if (answerIndex === -1 && headerParts[4]?.toLowerCase().includes('correct')) {
            // If Correct Answer column wasn't detected but it's the fifth column
            answerIndex = 4;
            console.log("Fixed Correct Answer column detection (position 4)");
          }
        }
        
        // Validate that we found all required columns
        const missingColumns = [];
        if (idIndex === -1) missingColumns.push("ID");
        if (questionIndex === -1) missingColumns.push("Question");
        if (answerIndex === -1) missingColumns.push("Correct Answer");
        
        if (missingColumns.length > 0) {
          const missingColumnsStr = missingColumns.join(", ");
          console.error(`Missing columns: ${missingColumnsStr}`);
          
          toast({
            title: "Invalid CSV format",
            description: `Could not identify required column(s): ${missingColumnsStr}. Please check your CSV format.`,
            status: "error",
            duration: 5000,
          });
          setIsEvaluating(false);
          setIsProcessing(false);
          return;
        }
        
        console.log(`Found columns - ID: ${idIndex}, Question: ${questionIndex}, Answer: ${answerIndex}`);
        
        const questions = lines.slice(1); // Skip header row
        console.log(`Processing ${questions.length} questions from CSV file`);
        
        const evaluationResults: EvaluationResult[] = [];
        
        // Process each question
        for (let i = 0; i < questions.length; i++) {
          // Parse each line with the CSV parser
          let parts: string[] = [];
          const line = questions[i];
          let currentPart = '';
          inQuotes = false;
          
          try {
            console.log(`Parsing line ${i+1}: ${line.substring(0, 50)}...`);
            
            for (let j = 0; j < line.length; j++) {
              const char = line[j];
              
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                parts.push(currentPart.trim());
                currentPart = '';
              } else {
                currentPart += char;
              }
            }
            
            // Don't forget the last part
            parts.push(currentPart.trim());
            
            console.log(`Parsed ${parts.length} fields from line ${i+1}`);
            
            // Check if we have enough parts for all columns
            const maxIndex = Math.max(idIndex, questionIndex, answerIndex);
            if (parts.length <= maxIndex) {
              console.warn(`Line ${i+2} has only ${parts.length} fields, but we need at least ${maxIndex + 1} fields`);
              console.warn(`Skipping invalid question at line ${i+2}: ${questions[i].substring(0, 50)}...`);
              continue;
            }
          } catch (error) {
            console.error(`Error parsing line ${i+1}:`, error);
            console.error(`Line content: ${questions[i].substring(0, 100)}...`);
            continue;
          }
          
          // Extract the required fields from the identified positions
          const id = parts[idIndex];
          const question = parts[questionIndex]; 
          const correctAnswer = parts[answerIndex];
          
          console.log(`Processing question ${i+1}/${questions.length}: ID=${id}, Answer=${correctAnswer}`);
          console.log(`Processing question ${i+1}/${questions.length}: ID=${id}`);
          
          const modelResults: Record<string, boolean> = {};
          
          // Query each model
          for (const model of selectedModels) {
            // Variables for API logging
            let apiStartTime = 0;
            let apiRequestBody: {
              model: string;
              messages: Array<{role: string, content: string}>;
              temperature: number;
            } | null = null;
            
            try {
              // Get the active API key for this model's provider
              const apiKey = getActiveApiKeyForProvider(model.provider as Provider);
              if (!apiKey) {
                throw new Error(`No API key available for ${model.provider}`);
              }
              
              // Get the appropriate base URL
              const storedConfig = storedApiConfigs.find(config => config.provider === model.provider);
              const baseUrl = storedConfig?.baseUrl || apiConfigs[model.provider].baseUrl || getDefaultBaseUrl(model.provider as Provider);
              
              // Format the model ID correctly for the API request
              const formattedModelId = formatModelIdForAPI(model.name, model.provider as Provider);
              
              // Log API call details for debugging (except the full API key)
              console.log(`Making API call for model: ${model.name}, provider: ${model.provider}, baseUrl: ${baseUrl}`);
              console.log(`Using model ID for API call: ${formattedModelId}`);
              console.log(`Using API key starting with: ${apiKey.substring(0, 5)}...`);
              
              // Create AbortController for fetch timeout
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
              
              // Prepare request for logging
              apiRequestBody = {
                model: formattedModelId,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: question }
                ],
                temperature: temperature
              };
              
              apiStartTime = Date.now();
              
              try {
                const response = await fetch(`${baseUrl}/chat/completions`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                  signal: controller.signal,
                  body: JSON.stringify(apiRequestBody)
                });

              if (!response.ok) {
                // For any errors, try to get response body for more details
                const errorText = await response.text().catch(() => "No error details available");
                let errorData = null;
                try {
                  errorData = JSON.parse(errorText);
                } catch (e) {
                  // Not JSON, use as-is
                }
                
                // Handle specific error types
                if (response.status === 401) {
                  console.error(`Authentication error for model ${model.name} from ${model.provider}: API key may be invalid or expired`);
                  toast({
                    title: "Authentication Error",
                    description: `Failed to authenticate with ${model.provider} API. Please check your API key.`,
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                  });
                  throw new Error(`Authentication error (HTTP 401) for ${model.provider} API. Please check your API key.`);
                } else if (response.status === 404 || 
                          (errorData?.error?.code === "model_not_found") || 
                          (errorData?.error?.code === "invalid_request_error") ||
                          (errorData?.error?.message && (
                            errorData.error.message.includes("Model Not Exist") ||
                            errorData.error.message.includes("model") && errorData.error.message.includes("exist") ||
                            errorData.error.message.includes("model") && errorData.error.message.includes("found")
                          ))) {
                  // Model not found errors
                  console.error(`Model not found: ${formattedModelId} for provider ${model.provider}`);
                  
                  // Provider-specific suggestions
                  let suggestion = "";
                  if (model.provider === "openai") {
                    suggestion = "Try using gpt-3.5-turbo or gpt-4";
                  } else if (model.provider === "deepseek") {
                    suggestion = "Try using deepseek-chat or deepseek-coder";
                  } else {
                    suggestion = `Check available models for ${model.provider}`;
                  }
                  
                  toast({
                    title: "Model Not Found",
                    description: `The model "${formattedModelId}" does not exist or you don't have access to it. ${suggestion}`,
                    status: "error",
                    duration: 7000,
                    isClosable: true,
                  });
                  
                  throw new Error(`Model not found: ${formattedModelId}. ${errorText}`);
                } else {
                  // For other errors
                  console.error(`API error with ${model.provider}:`, errorText);
                  throw new Error(`HTTP error! status: ${response.status}, Details: ${errorText}`);
                }
              }
              
              const data = await response.json();
              const answer = data.choices[0].message.content.trim().toUpperCase();
              modelResults[model.id] = answer === correctAnswer.toUpperCase();
              
              // Extract token usage information if available
              const promptTokens = data.usage?.prompt_tokens || estimateTokenCount(systemPrompt + question);
              const completionTokens = data.usage?.completion_tokens || estimateTokenCount(data.choices[0].message.content);
              const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);
              
              // Log successful API call
              const duration = Date.now() - apiStartTime;
              setApiLogs(prev => [...prev, {
                timestamp: new Date().toISOString(),
                model: model.name,
                provider: model.provider,
                question: question, // Store the full question
                questionId: id, // Store the question ID
                correctAnswer: correctAnswer, // Store the correct answer
                expanded: false, // Initialize as collapsed
                temperature: apiRequestBody?.temperature || temperature, // Store the temperature setting
                showFullRequest: false, // Initialize as not showing full request
                promptTokens,
                completionTokens,
                totalTokens,
                request: {
                  ...apiRequestBody,
                  messages: [
                    { role: "system", content: systemPrompt.length > 50 ? systemPrompt.substring(0, 50) + '...' : systemPrompt },
                    { role: "user", content: question.length > 50 ? question.substring(0, 50) + '...' : question }
                  ]
                },
                response: {
                  answer: answer,
                  correct: answer === correctAnswer.toUpperCase(),
                  content: data.choices[0].message.content,
                },
                duration
              }]);

              if (autoClearHistory) {
                // Clear context for next question
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              } finally {
                clearTimeout(timeoutId);
              }
            } catch (error) {
              console.error(`Error with model ${model.name}:`, error);
              modelResults[model.id] = false;
              
              // Log error in API logs
              const duration = Date.now() - apiStartTime;
              // Estimate token counts for errors
              const promptTokens = estimateTokenCount(systemPrompt + question);
              const completionTokens = 0; // No completion on error
              const totalTokens = promptTokens;
              
              setApiLogs(prev => [...prev, {
                timestamp: new Date().toISOString(),
                model: model.name,
                provider: model.provider,
                question: question, // Store the full question
                questionId: id, // Store the question ID
                correctAnswer: correctAnswer, // Store the correct answer
                expanded: false, // Initialize as collapsed
                temperature: apiRequestBody?.temperature || temperature, // Store the temperature setting
                showFullRequest: false, // Initialize as not showing full request
                promptTokens,
                completionTokens,
                totalTokens,
                request: {
                  ...apiRequestBody,
                  messages: [
                    { role: "system", content: systemPrompt.length > 50 ? systemPrompt.substring(0, 50) + '...' : systemPrompt },
                    { role: "user", content: question.length > 50 ? question.substring(0, 50) + '...' : question }
                  ]
                },
                error: error instanceof Error ? error.message : 'Unknown error',
                duration
              }]);
              
              // Display appropriate error message based on error type
              if (error instanceof Error) {
                if (error.name === 'AbortError') {
                  toast({
                    title: `Model Timeout`,
                    description: `${model.name} from ${model.provider} timed out after 60 seconds.`,
                    status: "warning",
                    duration: 5000,
                    isClosable: true,
                  });
                } else if (!error.message.includes("Authentication") && !error.message.includes("not found")) {
                  // Only show general errors if not already handled elsewhere
                  toast({
                    title: `Model Error`,
                    description: `Error with ${model.name}: ${error.message.substring(0, 100)}${error.message.length > 100 ? '...' : ''}`,
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                  });
                }
              }
            }
          }
          
          evaluationResults.push({
            questionId: id,
            modelResults
          });

          setProgress(prev => ({ ...prev, current: i + 1 }));
          setResults([...evaluationResults]);
        }

        // Scroll to results section - use setTimeout to avoid hydration issues
        setTimeout(() => {
          document.getElementById('evaluation')?.scrollIntoView({ behavior: 'smooth' });
        }, 0);
        
        const actualQuestionsProcessed = evaluationResults.length;
        const actualModelsUsed = selectedModels.length;
        
        toast({
          title: "Evaluation completed",
          description: `Processed ${actualQuestionsProcessed} questions with ${actualModelsUsed} models`,
          status: "success",
          duration: 5000,
        });
      };
      
      reader.readAsText(selectedFile);
    } catch (error) {
      console.error('Evaluation error:', error);
      toast({
        title: "Evaluation failed",
        description: "There was an error during evaluation. Please check the console for details.",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsEvaluating(false);
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      // Handle both Windows (\r\n) and Unix (\n) line endings
      const lines = content.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim().length > 0);
      
      // Verify the file has the required headers in any position
      if (lines.length > 0) {
        console.log("Uploaded CSV file header:", lines[0]);
        
        // Parse headers the same way as in startEvaluation
        const headerLine = lines[0];
        let headerParts: string[] = [];
        let currentHeader = '';
        let inQuotes = false;
        
        for (let j = 0; j < headerLine.length; j++) {
          const char = headerLine[j];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            headerParts.push(currentHeader.trim().toLowerCase());
            currentHeader = '';
          } else {
            currentHeader += char;
          }
        }
        headerParts.push(currentHeader.trim().toLowerCase());
        
        console.log("Parsed headers during upload:", headerParts);
        
        let hasId = headerParts.some(h => h.includes('id'));
        let hasQuestion = headerParts.some(h => h.includes('question'));
        let hasCorrectAnswer = headerParts.some(h => 
          h.includes('correct answer') || 
          h.includes('correct_answer') || 
          h.includes('correctanswer') ||
          (h.includes('correct') && h.includes('answer'))
        );
        
        // Special case for the sample CSV format: From, ID, Question, Len (Char), Correct Answer
        if (headerParts.length >= 5) {
          const isFromIdQuestionLenAnswer = 
            headerParts[0]?.toLowerCase() === 'from' && 
            headerParts[1]?.toLowerCase() === 'id' && 
            headerParts[2]?.toLowerCase() === 'question' && 
            headerParts[3]?.toLowerCase().includes('len') && 
            headerParts[4]?.toLowerCase().includes('correct');
          
          if (isFromIdQuestionLenAnswer) {
            console.log("Detected standard CSV format in file upload");
            hasId = true;
            hasQuestion = true;
            hasCorrectAnswer = true;
          }
        }
        
        const missingColumns = [];
        if (!hasId) missingColumns.push("ID");
        if (!hasQuestion) missingColumns.push("Question");
        if (!hasCorrectAnswer) missingColumns.push("Correct Answer");
        
        if (missingColumns.length > 0) {
          const missingColumnsStr = missingColumns.join(", ");
          toast({
            title: "Missing required columns",
            description: `CSV is missing: ${missingColumnsStr}. Required columns: ID, Question, and Correct Answer.`,
            status: "warning",
            duration: 5000,
          });
        } else {
          toast({
            title: "CSV file loaded",
            description: `Successfully loaded CSV with ${lines.length - 1} questions`,
            status: "success",
            duration: 3000,
          });
        }
      }
      
      const lineCount = lines.length - 1; // Subtract header row
      setQuestionCount(lineCount);
    };
    
    reader.readAsText(file);
  };

  const verifyApiKey = async (configId?: string) => {
    setIsLoading(true);
    
    try {
      let newModels: Model[] = [];
      let totalModelCount = 0;
      let configsToVerify: StoredApiConfig[] = [];
      
      // Determine which configs to verify
      if (configId) {
        // Verify just one specific config
        const config = storedApiConfigs.find(config => config.id === configId);
        if (!config) {
          // The config might have been removed, so let's use the current provider settings instead
          console.warn(`API Configuration with ID ${configId} not found. Using current provider settings.`);
          
          // If we have configs for the current provider, use those
          const currentProviderConfigs = storedApiConfigs.filter(c => c.provider === currentProvider);
          if (currentProviderConfigs.length > 0) {
            configsToVerify = [currentProviderConfigs[0]];
          } else {
            // Otherwise fall back to the current form values
            const apiKey = getApiKey();
            if (!apiKey) {
              throw new Error("Please enter an API key");
            }
            // Create a temporary config for verification
            configsToVerify = [{
              id: 'temp-' + Date.now(),
              provider: currentProvider,
              key: apiKey,
              maskedKey: apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 6),
              baseUrl: getBaseUrl()
            }];
          }
        } else {
          configsToVerify = [config];
        }
      } else if (storedApiConfigs.length > 0) {
        // Verify all stored configs
        configsToVerify = storedApiConfigs;
      } else {
        // Fallback to current provider settings if no stored configs
        const apiKey = getApiKey();
        if (!apiKey) {
          throw new Error("Please enter an API key");
        }
        // Create a temporary config for verification
        configsToVerify = [{
          id: 'temp',
          provider: currentProvider,
          key: apiKey,
          maskedKey: apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 6),
          baseUrl: getBaseUrl()
        }];
      }
      
      // Process each config to fetch models
      for (const config of configsToVerify) {
        const apiKey = config.key;
        const baseUrl = config.baseUrl || getDefaultBaseUrl(config.provider as Provider);
        const provider = config.provider as Provider;
        
        try {
          // Create AbortController for fetch timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
          
          try {
            const response = await fetch(`${baseUrl}/models`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
              signal: controller.signal
            });
          
          if (!response.ok) {
            // Handle specific error codes with more detailed information
            if (response.status === 401) {
              const errorMessage = `Authentication failed (401) for ${provider}: Invalid or expired API key`;
              console.error(errorMessage);
              toast({
                title: `${provider} Authentication Error`,
                description: `Invalid or expired API key. Please update your ${provider} API key.`,
                status: "error",
                duration: 5000,
                isClosable: true,
              });
            } else {
              // Attempt to get more detailed error information
              try {
                const errorData = await response.text();
                console.error(`Failed to fetch models for ${provider} (${response.status}):`, errorData);
              } catch {
                console.error(`Failed to fetch models for ${provider}: ${response.status}`);
              }
            }
            continue; // Skip this provider but continue with others
          }
          
          const data = await response.json();
          const providerModels = data.data.map((model: any) => {
            // Check if model.id already contains the provider name to avoid duplication
            const modelAlreadyHasProvider = model.id.toLowerCase().includes(provider.toLowerCase());
            
            return {
              // Create a unique ID that avoids duplication
              id: modelAlreadyHasProvider ? `provider-${provider}-${model.id}` : `${provider}-${model.id}`,
              name: model.id,
              provider: provider,
            };
          });
          
          newModels = [...newModels, ...providerModels];
          totalModelCount += providerModels.length;
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error) {
          console.error(`Error fetching models for ${provider}:`, error);
          
          // Specifically handle timeout errors
          if (error instanceof Error && error.name === 'AbortError') {
            toast({
              title: `Connection Timeout`,
              description: `Connection to ${provider} API timed out. Please check your network or try again later.`,
              status: "error",
              duration: 5000,
              isClosable: true,
            });
          }
          
          // Continue with other providers
        }
      }
      
      // If checking a specific config, only update models from that provider
      // Otherwise, replace all models with new ones
      setAvailableModels(prevModels => {
        let updatedModels;
        
        if (configId) {
          // If verifying a specific config, only update models from its provider
          const config = storedApiConfigs.find(c => c.id === configId);
          if (config) {
            // Remove existing models from this provider
            const filteredModels = prevModels.filter(m => m.provider !== config.provider);
            // Add new models from this provider
            updatedModels = [...filteredModels, ...newModels];
          } else {
            // If config not found, just add the new models
            // Make sure we're not adding duplicates
            const existingIds = new Set(prevModels.map(m => m.id));
            const uniqueNewModels = newModels.filter(model => !existingIds.has(model.id));
            updatedModels = [...prevModels, ...uniqueNewModels];
          }
        } else if (storedApiConfigs.length > 0 && configsToVerify.length === storedApiConfigs.length) {
          // If verifying all configs, replace all models
          updatedModels = newModels;
        } else {
          // For other cases, merge with existing models
          const verifiedProviders = new Set(configsToVerify.map(c => c.provider));
          const filteredModels = prevModels.filter(m => !verifiedProviders.has(m.provider));
          
          // Make sure we're not adding duplicates
          const existingIds = new Set(filteredModels.map(m => m.id));
          const uniqueNewModels = newModels.filter(model => !existingIds.has(model.id));
          
          updatedModels = [...filteredModels, ...uniqueNewModels];
        }
        
        // Final safety check - ensure all IDs are unique
        const deduplicatedModels = deduplicateModelsById(updatedModels);
        
        // Save models to localStorage for persistence
        localStorage.setItem('availableModels', JSON.stringify(deduplicatedModels));
        return deduplicatedModels;
      });
      
      if (newModels.length === 0) {
        // Just warn instead of throwing an error
        console.warn("No models could be loaded from any API configurations");
      }
      
      toast({
        title: `Models loaded`,
        description: `${totalModelCount} models available from ${configsToVerify.length} API configuration(s)`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error(`Error loading models:`, error);
      toast({
        title: `Error loading models`,
        description: error instanceof Error ? error.message : "Please check your API configurations",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const menuItems = [
    { id: "models", title: "1. Add Models", icon: "🤖" },
    { id: "database", title: "2. MCQ Database", icon: "📝" },
    { id: "config", title: "3. Configuration", icon: "⚙️" },
    { id: "evaluation", title: "4. Evaluation", icon: "📊" }
  ];

  return (
    <Flex h="100vh">
      {/* Global loading indicator */}
      {isProcessing && (
        <Box 
          position="fixed" 
          top="0" 
          left="0" 
          right="0" 
          bg="purple.500" 
          color="white" 
          py={2} 
          px={6}
          zIndex="1000"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Box as="span" mr={3} display="inline-block" position="relative" width="16px" height="16px">
            <Box
              position="absolute"
              top="0"
              left="0"
              width="16px"
              height="16px"
              borderRadius="full"
              border="2px solid"
              borderColor="white"
              borderTopColor="transparent"
              animation="spin 1s linear infinite"
              sx={{
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' },
                }
              }}
            />
          </Box>
          <Text fontWeight="medium">Processing request... This may take a few moments</Text>
        </Box>
      )}

      {/* Sidebar */}
      <Box
        w="280px"
        bg="purple.50"
        p={6}
        borderRight="1px"
        borderColor="purple.100"
        position="fixed"
        h="100vh"
        left={0}
        top={0}
      >
        <VStack spacing={6} align="stretch">
          <Box mb={5}>
            <Heading size="md" color="purple.700" mb={1}>LLM Evaluation</Heading>
            <Text fontSize="sm" color="purple.600">Accuracy vs Consistency</Text>
          </Box>

          <VStack spacing={2} align="stretch">
            {menuItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                justifyContent="flex-start"
                py={3}
                pl={4}
                leftIcon={
                  <Box p={1} bg="purple.100" borderRadius="md">
                    <Text fontSize="sm">{item.icon}</Text>
                  </Box>
                }
                onClick={() => {
                  // Use useEffect for DOM operations after hydration is complete
                  setTimeout(() => {
                    const element = document.getElementById(item.id);
                    element?.scrollIntoView({ behavior: "smooth" });
                  }, 0);
                }}
                _hover={{ bg: "purple.100" }}
                color="purple.700"
                fontSize="sm"
                fontWeight="medium"
              >
                {item.title}
              </Button>
            ))}
          </VStack>
          
          {/* API Configuration Section */}
          <Box mt="auto" pt={7} borderTop="1px" borderColor="purple.100" className="api-config-section">
            <VStack spacing={2} align="stretch">
              <Text fontSize="s" fontWeight="600" color="purple.700" mb={1}>Load API Models</Text>

              <FormControl size="sm">
                <FormLabel fontSize="xs" mb={0.5} fontWeight="600">Provider</FormLabel>
                <Select
                  size="xs"
                  value={currentProvider}
                  onChange={(e) => setCurrentProvider(e.target.value as Provider)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openwebui">OpenWebUI</option>
                </Select>
              </FormControl>

              <FormControl size="sm">
                <FormLabel fontSize="xs" mb={0.5} fontWeight="600">API Key</FormLabel>
                <Input
                  size="xs"
                  type="password"
                  value={getApiKey()}
                  onChange={(e) => updateApiKey(e.target.value)}
                  placeholder="Enter API key"
                />
              </FormControl>

              <FormControl size="sm" mb={3}>
                <FormLabel fontSize="xs" mb={0.5} fontWeight="600">Base URL (Optional)</FormLabel>
                <Input
                  size="xs"
                  value={getBaseUrl()}
                  onChange={(e) => updateBaseUrl(e.target.value)}
                  placeholder={getDefaultBaseUrl()}
                />
              </FormControl>

              <Button
                size="xs"
                colorScheme="purple"
                onClick={addApiConfig}
                isLoading={isLoading}
                mb={3}
              >
                Load API Models
              </Button>

              <Box mt={2}>
                <HStack justify="space-between" align="center">
                  <Text fontSize="xs" fontWeight="bold" color="purple.700" mb={2}>
                    Saved Configurations
                  </Text>
                  <HStack spacing={1}>
                    {storedApiConfigs.length > 0 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="purple"
                        onClick={() => verifyApiKey()}
                        title="Refresh API models"
                        isLoading={isLoading}
                        p={1}
                        minW="auto"
                        h="auto"
                      >
                        🔄
                      </Button>
                    )}
                    <Text fontSize="xs" color="purple.500" fontWeight="medium">
                      {storedApiConfigs.length} {storedApiConfigs.length === 1 ? 'config' : 'configs'}
                    </Text>
                  </HStack>
                </HStack>
                
                {storedApiConfigs.length === 0 ? (
                  <Box 
                    bg="yellow.50" 
                    p={3} 
                    borderRadius="md" 
                    textAlign="center"
                    borderWidth="1px"
                    borderStyle="dashed"
                    borderColor="yellow.200"
                  >
                    <VStack spacing={1}>
                      <Text fontSize="xs" color="yellow.700" fontWeight="medium">
                        No API configurations saved yet
                      </Text>
                      <Text fontSize="10px" color="gray.600">
                        Enter your API key above and click "Load API Models"
                      </Text>
                      <HStack spacing={0} fontSize="10px" color="gray.500">
                        <Text>Supported providers:</Text>
                        <Text fontWeight="medium" color="purple.600" ml={1}>OpenAI</Text>
                        <Text mx={1}>•</Text>
                        <Text fontWeight="medium" color="purple.600">DeepSeek</Text>
                        <Text mx={1}>•</Text>
                        <Text fontWeight="medium" color="purple.600">OpenWebUI</Text>
                      </HStack>
                      <VStack spacing={0} mt={1} px={1}>
                        <Text fontSize="10px" color="orange.600" fontWeight="medium">
                          Common Model Names:
                        </Text>
                        <Text fontSize="9px" color="gray.600">
                          OpenAI: gpt-3.5-turbo, gpt-4
                        </Text>
                        <Text fontSize="9px" color="gray.600">
                          DeepSeek: deepseek-chat, deepseek-coder
                        </Text>
                      </VStack>
                    </VStack>
                  </Box>
                ) : (
                  <VStack spacing={1.5} align="stretch">
                    {storedApiConfigs.map((config) => (
                      <Box
                        key={config.id}
                        bg="purple.50"
                        borderRadius="md"
                        fontSize="xs"
                        py={1.5}
                        px={2}
                        position="relative"
                        pr={7}
                        borderWidth="1px"
                        fontWeight={"medium"}
                        borderColor="purple.200"
                        _hover={{
                          borderColor: "purple.300",
                          bg: "purple.75"
                        }}
                      >
                        <HStack spacing={2} align="flex-start">
                          <Box 
                            w="8px" 
                            h="8px" 
                            borderRadius="full" 
                            bg={availableModels.some(m => m.provider === config.provider) ? "green.400" : "yellow.400"}
                            mt="6px"
                          />
                          <VStack spacing={0.5} align="flex-start">
                            <Text fontWeight="bold" color="purple.700">
                              {config.provider === 'openai' ? 'OpenAI' : 
                               config.provider === 'deepseek' ? 'DeepSeek' : 
                               config.provider === 'openwebui' ? 'Open WebUI' : 
                               config.provider}
                              <Text as="span" ml={1} fontSize="10px" color="gray.500">
                                ({availableModels.filter(m => m.provider === config.provider).length || 0} models)
                              </Text>
                            </Text>
                            <HStack>
                              <Text color="gray.600" fontSize="10px" noOfLines={1} isTruncated>
                                {config.maskedKey}
                              </Text>
                              <Text as="span" fontSize="10px" color="gray.500">
                                {config.baseUrl && config.baseUrl !== getDefaultBaseUrl(config.provider as Provider) ? '(custom URL)' : ''}
                              </Text>
                            </HStack>
                          </VStack>
                        </HStack>
                        <HStack 
                          spacing={1} 
                          position="absolute"
                          right={1}
                          top="8px"
                        >
                          <Button 
                            size="xs" 
                            variant="unstyled"
                            color="purple.600"
                            fontSize="10px"
                            onClick={() => verifyApiKey(config.id)}
                            title="Refresh models"
                            width="20px"
                            height="20px"
                            minWidth="0"
                            p={0}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            _hover={{ color: "green.500" }}
                          >
                            🔄
                          </Button>
                          <Button 
                            size="xs" 
                            variant="unstyled"
                            color="purple.600"
                            fontSize="10px"
                            onClick={() => removeApiConfig(config.id)}
                            title="Remove configuration"
                            width="20px"
                            height="20px"
                            minWidth="0"
                            p={0}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            _hover={{ color: "red.500" }}
                          >
                            ✕
                          </Button>
                        </HStack>
                      </Box>
                    ))}
                  </VStack>
                )}
              </Box>
            </VStack>
          </Box>
        </VStack>
      </Box>

      {/* Main Content */}
      <Box ml="280px" flex={1} py={8}>
        <Box maxW="1200px" mx="auto" px={8}>
          <VStack spacing={6} align="stretch">

        <Box 
          id="models"
          p={6} 
          borderRadius="lg" 
          bg="white" 
          boxShadow="lg" 
          border="1px" 
          borderColor="purple.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="purple.100" borderRadius="md">
              <Text fontSize="sm" color="purple.600">🤖</Text>
            </Box>
            <Heading size="sm">Add Large Language Models (LLMs)</Heading>
          </HStack>

          <Box>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel fontSize="sm">Select Models from Available API Configurations</FormLabel>
                <Box width="100%">
                  <Menu matchWidth>
                    <MenuButton
                      as={Button}
                      rightIcon={<ChevronDownIcon />}
                      width="full"
                      bg="gray.50"
                      size="sm"
                      textAlign="left"
                      fontWeight="normal"
                    >
                      Select model
                    </MenuButton>
                    <MenuList bg="gray.50" p={0} mt={-2}>
                      {availableModels.filter(model => !selectedModels.some(m => m.id === model.id)).length > 8 && (
                        <Box 
                          borderBottom="1px" 
                          borderColor="gray.200"
                          position="sticky"
                          top={0}
                          bg="gray.50"
                          zIndex={1}
                        >
                          <Input
                            placeholder="Search models..."
                            size="sm"
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            bg="white"
                            border="none"
                            borderRadius="0"
                            _focus={{
                              boxShadow: "none",
                              bg: "white"
                            }}
                          />
                        </Box>
                      )}
                      <Box maxH="250px" overflowY="auto">
                        {availableModels.length === 0 ? (
                          <Box p={3} textAlign="center" fontSize="sm" color="gray.500">
                            No models available. Please load API models from the sidebar.
                          </Box>
                        ) : (
                          availableModels
                            .filter(model => 
                              !selectedModels.some(m => m.id === model.id) &&
                              (model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                               model.id.toLowerCase().includes(modelSearch.toLowerCase()))
                            )
                            .map(model => (
                              <MenuItem
                                key={model.id}
                                onClick={() => {
                                  setSelectedModels(prev => {
                                    // Check if the model is already selected (by ID)
                                    if (prev.some(m => m.id === model.id)) {
                                      return prev; // Don't add duplicates
                                    }
                                    return [...prev, model];
                                  });
                                  setModelSearch("");
                                }}
                                py={2}
                                bg="gray.50"
                                _hover={{ bg: "gray.100" }}
                              >
                                {model.name}
                              </MenuItem>
                            ))
                        )}
                      </Box>
                    </MenuList>
                  </Menu>
                </Box>
              </FormControl>

              {selectedModels.length > 0 && (
                <Box mt={3}>
                  <Text fontWeight="medium" fontSize="sm" mb={1.5}>Selected Models:</Text>
                  <Flex wrap="wrap" gap={2}>
                    {selectedModels.map((model, index) => {
                      // Check if this model has a valid API key
                      const hasValidKey = getActiveApiKeyForProvider(model.provider as Provider) !== null;
                      return (
                        <Box
                          key={model.id}
                          bg={hasValidKey ? "purple.50" : "yellow.50"}
                          border="1px"
                          borderColor={hasValidKey ? "purple.200" : "yellow.300"}
                          borderRadius="md"
                          px={3}
                          py={1.5}
                        >
                          <HStack spacing={2} align="center">
                            <Text fontSize="xs" color={hasValidKey ? "purple.700" : "yellow.700"}>
                              <Text as="span" color={hasValidKey ? "purple.500" : "yellow.600"} mr={1}>{index + 1}.</Text>
                              <Text as="span" color={hasValidKey ? "purple.500" : "yellow.600"}>{model.provider}/</Text>
                              {model.name}
                              {!hasValidKey && (
                                <Text as="span" color="red.500" ml={1} fontWeight="bold">
                                  (Missing API Key)
                                </Text>
                              )}
                            </Text>
                            <HStack spacing={1}>
                              {!hasValidKey && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  colorScheme="yellow"
                                  title={`Add ${model.provider} API key`}
                                  onClick={() => {
                                    // Set the current provider to this model's provider
                                    setCurrentProvider(model.provider as Provider);
                                    // Scroll to the API key section
                                    setTimeout(() => {
                                      document.querySelector('.api-config-section')?.scrollIntoView({ behavior: 'smooth' });
                                    }, 0);
                                  }}
                                  p={1}
                                  height="auto"
                                  minW="auto"
                                  _hover={{ bg: "yellow.100" }}
                                >
                                  🔑
                                </Button>
                              )}
                              <Button
                                size="xs"
                                variant="ghost"
                                colorScheme={hasValidKey ? "purple" : "yellow"}
                                onClick={() => setSelectedModels(prev => prev.filter(m => m.id !== model.id))}
                                p={1}
                                height="auto"
                                minW="auto"
                                _hover={{ opacity: 0.8 }}
                              >
                                ✕
                              </Button>
                            </HStack>
                          </HStack>
                        </Box>
                      );
                    })}
                  </Flex>
                </Box>
              )}
            </VStack>
          </Box>
        </Box>

        <Box 
          id="database"
          p={6} 
          borderRadius="lg" 
          bg="white" 
          boxShadow="lg" 
          border="1px" 
          borderColor="purple.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={8} align="flex-start">
            {/* Left Column */}
            <VStack spacing={4} align="stretch" flex="1">
              <HStack spacing={2}>
                <Box p={1.5} bg="purple.100" borderRadius="md">
                  <Text fontSize="sm" color="purple.600">📝</Text>
                </Box>
                <Heading size="sm">MCQ Database</Heading>
              </HStack>

              <Box>
                <Text fontSize="md" color="gray.700" fontWeight="medium" mb={1}>
                  Question Database File
                </Text>
                <Text fontSize="sm" color="gray.500">
                  Upload a CSV file with columns: ID, Question, and Correct Answer (in any order)
                </Text>
              </Box>

              <Button
                leftIcon={<AttachmentIcon />}
                colorScheme="purple"
                variant="solid"
                onClick={() => {
                  setTimeout(() => {
                    document.getElementById('file-upload')?.click();
                  }, 0);
                }}
                width="full"
                size="sm"
              >
                Upload CSV File
              </Button>

              <Input
                id="file-upload"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                display="none"
              />
            </VStack>

            {/* Right Column */}
            <VStack spacing={3} align="stretch" flex="1" mt={1}>
              {selectedFile ? (
                <Box bg="purple.50" p={4} borderRadius="md" borderWidth="1px" borderColor="purple.200">
                  <VStack align="stretch" spacing={2}>
                    <Box>
                      <Text fontSize="sm" color="purple.600" mb={0.5}>Current File</Text>
                      <Text fontSize="md" color="purple.900" fontWeight="medium">
                        {selectedFile.name}
                      </Text>
                    </Box>
                    
                    <Box>
                      <Text fontSize="sm" color="purple.600" mb={0.5}>Question Count</Text>
                      <Text fontSize="xl" color="purple.700" fontWeight="bold" display="inline">
                        {questionCount > 0 ? `${questionCount.toLocaleString()} ` : '...'}
                        <Text as="span" fontSize="xs" color="gray.500">
                          {questionCount > 0 ? 'questions loaded' : 'Processing file...'}
                        </Text>
                      </Text>
                    </Box>
                  </VStack>
                </Box>
              ) : (
                <Box bg="gray.50" p={6} borderRadius="lg" textAlign="center" padding={45}>
                  <Text fontSize="md" color="gray.500">
                    No file selected
                  </Text>
                  <Text fontSize="sm" color="gray.400" mt={1}>
                    Upload a CSV file to see details
                  </Text>
                </Box>
              )}
            </VStack>
          </HStack>
        </Box>

        <Box 
          id="config"
          p={6} 
          borderRadius="lg" 
          bg="white" 
          boxShadow="lg" 
          border="1px" 
          borderColor="purple.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="purple.100" borderRadius="md">
              <Text fontSize="sm" color="purple.600">⚙️</Text>
            </Box>
            <Heading size="sm">LLMs Configuration</Heading>
          </HStack>

          <VStack spacing={4} align="stretch">
            <HStack spacing={8} align="flex-start">
              <FormControl flex="3">
                <FormLabel fontSize="sm">System Prompt</FormLabel>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Enter system prompt for the AI model"
                  rows={5}
                  bg="gray.50"
                  size="sm"
                />
              </FormControl>

              <VStack spacing={6} align="stretch" flex="2">
                <FormControl>
                  <FormLabel fontSize="sm">Temperature: {temperature}</FormLabel>
                  <Slider
                    value={temperature}
                    onChange={setTemperature}
                    min={0}
                    max={2}
                    step={0.1}
                    colorScheme="purple"
                    size="sm"
                  >
                    <SliderTrack>
                      <SliderFilledTrack />
                    </SliderTrack>
                    <SliderThumb />
                  </Slider>
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Lower values make the output more focused and deterministic
                  </Text>
                </FormControl>

                <FormControl>
                  <HStack justify="space-between" align="center" spacing={4}>
                    <Box flex="1">
                      <FormLabel fontSize="sm" mb={0} cursor="pointer">
                        Auto Clear History
                      </FormLabel>
                      <Text fontSize="xs" color="gray.500">
                        Clear temporary history between questions
                      </Text>
                    </Box>
                    <Switch
                      isChecked={autoClearHistory}
                      onChange={() => setAutoClearHistory(!autoClearHistory)}
                      colorScheme="purple"
                      size="md"
                    />
                  </HStack>
                </FormControl>
              </VStack>
            </HStack>

            <VStack spacing={4} align="flex-start">
              <Button
                colorScheme="purple"
                width="200px"
                isDisabled={selectedModels.length === 0 || !selectedFile || isEvaluating}
                size="md"
                leftIcon={<TriangleUpIcon transform="rotate(90deg)" boxSize={3} />}
                onClick={startEvaluation}
                isLoading={isEvaluating}
                loadingText={`Processing ${progress.current}/${progress.total}`}
              >
                Start Evaluation
              </Button>
              {isEvaluating && (
                <Box w="200px">
                  <Text fontSize="sm" color="purple.600" mb={1}>
                    Progress: {Math.round((progress.current / progress.total) * 100)}%
                  </Text>
                  <Box w="full" h="2px" bg="purple.100" borderRadius="full" overflow="hidden">
                    <Box
                      w={`${(progress.current / progress.total) * 100}%`}
                      h="full"
                      bg="purple.500"
                      transition="width 0.3s ease-in-out"
                    />
                  </Box>
                </Box>
              )}
            </VStack>
          </VStack>
        </Box>

        <Box 
          id="evaluation"
          p={6} 
          borderRadius="lg" 
          bg="white" 
          boxShadow="lg" 
          border="1px" 
          borderColor="purple.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="purple.100" borderRadius="md">
              <Text fontSize="sm" color="purple.600">📊</Text>
            </Box>
            <Heading size="sm">Evaluation Results</Heading>
          </HStack>

          {results.length === 0 ? (
            <Box 
              bg="purple.50" 
              p={8} 
              borderRadius="md" 
              borderWidth="1px" 
              borderColor="purple.200"
              textAlign="center"
            >
              <VStack spacing={4}>
                <Box
                  w="48px"
                  h="48px"
                  bg="purple.100"
                  borderRadius="full"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  mx="auto"
                  mb={2}
                >
                  <Text fontSize="24px">📈</Text>
                </Box>
                <VStack spacing={1}>
                  <Text fontSize="lg" fontWeight="medium" color="purple.700">
                    No evaluation results yet
                  </Text>
                  <Text fontSize="sm" color="purple.600">
                    Results will appear here once you start the evaluation
                  </Text>
                </VStack>
              </VStack>
            </Box>
          ) : (
            <Box>
              {/* Tab Navigation */}
              <HStack spacing={2} mb={6} overflowX="auto" pb={2}>
                {[
                  { id: 'results', label: 'Results' },
                  { id: 'summary', label: 'Summary' },
                  { id: 'charts', label: 'Charts' },
                  { id: 'logs', label: 'API Logs' }
                ].map(tab => (
                  <Button
                    key={tab.id}
                    size="sm"
                    variant={activeResultTab === tab.id ? "solid" : "outline"}
                    colorScheme="purple"
                    borderRadius="full"
                    px={6}
                    onClick={() => setActiveResultTab(tab.id as "results" | "summary" | "charts" | "logs")}
                  >
                    {tab.label}
                  </Button>
                ))}
              </HStack>
              
              {/* Results Tab Content */}
              {activeResultTab === "results" && (
                <Box>
                  <Table variant="simple">
                    <Thead>
                      <Tr>
                        <Th>Question</Th>
                        {selectedModels.map((model) => (
                          <Th key={model.id}>{model.name}</Th>
                        ))}
                      </Tr>
                    </Thead>
                    <Tbody>
                      {results.map((result) => (
                        <Tr key={result.questionId}>
                          <Td>{result.questionId}</Td>
                          {selectedModels.map((model) => (
                            <Td key={model.id}>
                              {result.modelResults[model.id] ? "✅" : "❌"}
                            </Td>
                          ))}
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
              
              {/* Summary Tab Content */}
              {activeResultTab === "summary" && (
                <Box>
                  <VStack spacing={4} align="start">
                    {selectedModels.map(model => {
                      // Calculate accuracy for this model
                      const correctAnswers = results.filter(r => r.modelResults[model.id]).length;
                      const totalQuestions = results.length;
                      const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
                      
                      return (
                        <Box key={model.id} p={4} borderWidth="1px" borderRadius="md" w="full" bg="white">
                          <HStack justify="space-between">
                            <VStack align="start" spacing={1}>
                              <Text fontWeight="medium" fontSize="md">{model.name}</Text>
                              <Text fontSize="xs" color="gray.500">{model.provider}</Text>
                            </VStack>
                            <Box>
                              <Text fontSize="xl" fontWeight="bold" color={accuracy > 70 ? "green.500" : accuracy > 50 ? "orange.500" : "red.500"}>
                                {accuracy}%
                              </Text>
                              <Text fontSize="xs" textAlign="right">{correctAnswers} of {totalQuestions}</Text>
                            </Box>
                          </HStack>
                          <Box mt={3} w="full" h="4px" bg="gray.100" borderRadius="full">
                            <Box 
                              h="full" 
                              bg={accuracy > 70 ? "green.500" : accuracy > 50 ? "orange.500" : "red.500"}
                              borderRadius="full"
                              w={`${accuracy}%`}
                            />
                          </Box>
                        </Box>
                      );
                    })}
                  </VStack>
                </Box>
              )}
              
              {/* Charts Tab Content */}
              {activeResultTab === "charts" && (
                <Box p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
                  <VStack spacing={2}>
                    <Text fontSize="md" fontWeight="medium">Charts Coming Soon</Text>
                    <Text fontSize="sm" color="gray.500">Visual representation of model performance</Text>
                  </VStack>
                </Box>
              )}
              
              {/* API Logs Tab Content */}
              {activeResultTab === "logs" && (
                <Box>
                  <HStack justify="space-between" mb={3} align="center">
                    <Text fontSize="sm" color="gray.600">
                      Showing {apiLogs.length} API call{apiLogs.length !== 1 ? 's' : ''}
                    </Text>
                    
                    <Button 
                      size="xs" 
                      colorScheme="purple" 
                      variant="outline"
                      onClick={() => setApiLogs([])}
                      isDisabled={apiLogs.length === 0}
                    >
                      Clear Logs
                    </Button>
                  </HStack>
                  
                  <Box maxH="500px" overflowY="auto" borderWidth="1px" borderRadius="md">
                    {apiLogs.length === 0 ? (
                      <Box p={4} textAlign="center">
                        <Text color="gray.500">No API logs available</Text>
                      </Box>
                    ) : (
                      apiLogs.map((log, index) => (
                        <Box 
                          key={index} 
                          p={3} 
                          borderBottomWidth={index < apiLogs.length - 1 ? "1px" : "0"}
                          bg={log.error ? "red.50" : log.response?.correct ? "green.50" : "orange.50"}
                        >
                          {/* Header with model, response and correct answer on same line */}
                          <VStack spacing={1} align="stretch" mb={1}>
                            <HStack justify="space-between">
                              <HStack spacing={1}>
                                <Text fontSize="xs" fontWeight="medium">
                                  {log.model}:
                                </Text>
                                {log.error ? (
                                  <Text fontSize="xs" color="red.600">Error</Text>
                                ) : log.response ? (
                                  <Text fontSize="xs">
                                    {log.response.answer} {log.response.correct ? "✓" : "✗"}
                                  </Text>
                                ) : null}
                                {log.correctAnswer && (
                                  <Text fontSize="xs" color="purple.600">
                                    (Correct: {log.correctAnswer})
                                  </Text>
                                )}
                              </HStack>
                              <HStack spacing={2} fontSize="xs">
                                {log.promptTokens !== undefined && (
                                  <Text color="gray.600">
                                    Tokens: {log.promptTokens}/{log.completionTokens} ({log.totalTokens})
                                  </Text>
                                )}
                                <Text color="gray.600">
                                  Temp: {log.temperature !== undefined ? log.temperature.toFixed(1) : "1.0"}
                                </Text>
                                <Text 
                                  as="span" 
                                  color="purple.500"
                                  cursor="pointer"
                                  fontWeight="bold"
                                  fontSize="10px"
                                  onClick={() => {
                                    setApiLogs(prev => prev.map((l, i) => 
                                      i === index ? { ...l, showFullRequest: !l.showFullRequest } : l
                                    ));
                                  }}
                                >
                                  {log.showFullRequest ? "Hide Request" : "Show Full Request"}
                                </Text>
                                <Text color="gray.500">
                                  {new Date(log.timestamp).toLocaleTimeString()} • {log.duration}ms
                                </Text>
                              </HStack>
                            </HStack>
                            
                            {log.showFullRequest && log.request && (
                              <Box 
                                mt={1} 
                                p={2} 
                                bg="gray.50" 
                                borderRadius="sm" 
                                fontSize="xs"
                                whiteSpace="pre-wrap"
                                maxH="200px"
                                overflowY="auto"
                                width="100%"
                                border="1px"
                                borderColor="gray.200"
                              >
                                <Text fontWeight="medium" mb={1}>System Prompt:</Text>
                                <Text mb={2}>{log.request.messages?.[0]?.content || 'N/A'}</Text>
                                <Text fontWeight="medium" mb={1}>API Request:</Text>
                                <Text fontFamily="mono" fontSize="10px">
                                  {JSON.stringify(log.request, null, 2)}
                                </Text>
                              </Box>
                            )}
                          </VStack>
                          
                          {/* Question ID and preview */}
                          <Box 
                            bg="white" 
                            p={2} 
                            borderRadius="sm" 
                            mb={1} 
                            cursor={log.question && log.question.length > 100 ? "pointer" : "default"}
                            onClick={() => {
                              if (log.question && log.question.length > 100) {
                                setApiLogs(prev => prev.map((l, i) => 
                                  i === index ? { ...l, expanded: !l.expanded } : l
                                ));
                              }
                            }}
                          >
                            <HStack justify="space-between" align="start">
                              <VStack align="start" spacing={1} width="100%">
                                <HStack width="100%" justify="space-between">
                                  <Text fontSize="xs" fontWeight="medium" color="gray.600">
                                    Question ID: {log.questionId || 'N/A'}
                                  </Text>
                                  {log.question && log.question.length > 100 && (
                                    <Text 
                                      as="span" 
                                      color="purple.500" 
                                      fontSize="10px"
                                      cursor="pointer"
                                    >
                                      {log.expanded ? "collapse" : "expand"}
                                    </Text>
                                  )}
                                </HStack>
                                
                                <Text fontSize="xs" width="100%">
                                  {log.question 
                                    ? (log.expanded || log.question.length <= 100
                                        ? log.question
                                        : `${log.question.substring(0, 100)}...`) 
                                    : 'No question data'
                                  }
                                </Text>
                              </VStack>
                            </HStack>
                          </Box>
                        </Box>
                      ))
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
          </VStack>
        </Box>
      </Box>
    </Flex>
  );
}