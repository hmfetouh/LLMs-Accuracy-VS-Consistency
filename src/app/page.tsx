"use client";

import { useState, useEffect, Fragment, useRef } from "react";
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

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
  apiModelId?: string; // The actual model ID to send to the API
  reasoningEffort?: string; // For GPT-5 models: "low", "medium", "high"
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
    bg="blue.50" 
    p={4}
    py="45px"
    borderRadius="md" 
    borderWidth="1px" 
    borderColor="blue.200" 
    height="160px"
  >
    <VStack spacing={4} align="stretch" justify="center" height="full">
      <Box>
        <Text fontSize="sm" color="blue.600" mb={0.5}>File Status</Text>
        <Text fontSize="md" color="blue.900" fontWeight="medium">
          No file selected
        </Text>
      </Box>
      
      <Box>
        <Text fontSize="sm" color="blue.600" mb={0.5}>Question Count</Text>
        <Text fontSize="xl" color="blue.700" fontWeight="bold">
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

interface TrialResult {
  answer: string;
  correct: boolean;
  tokens: number;
  time: number; // in milliseconds
  aborted?: boolean; // Flag to indicate if this trial was aborted
}

interface QuestionResult {
  questionId: string;
  question: string;
  class?: string; // question classification (class, category, group, step) - optional for backward compatibility
  length: number; // character count
  correctAnswer: string;
  modelResults: Record<string, {
    trial1: TrialResult;
    trial2?: TrialResult;
    trial3?: TrialResult;
    isInconsistent?: boolean; // if answers differ across trials
    additionalTrials?: TrialResult[]; // for inconsistent questions (7 more trials)
    correctPercentage?: number; // percentage correct out of 10 trials
  }>;
}

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [systemPrompt, setSystemPrompt] = useState("Output only uppercase letter answers in numbered order, one per line, exactly in the format \"1. A\". No extra text, explanations, symbols, or blank lines allowed. Maintain original question order.");
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [trialResults, setTrialResults] = useState<QuestionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [shouldStopEvaluation, setShouldStopEvaluation] = useState(false);
  const [shouldPauseEvaluation, setShouldPauseEvaluation] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [evaluationState, setEvaluationState] = useState<{
    parsedQuestions: Array<{id: string, question: string, answer: string, class?: string}>;
    trialResultsArray: QuestionResult[];
    currentModelIndex: number;
    currentPhase: 'trial1' | 'trial2' | 'trial3' | 'inconsistent';
    currentQuestionIndex: number;
    currentTrialNumber: number;
    inconsistentQuestions: Array<{index: number, modelId: string}>;
  } | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [activeResultTab, setActiveResultTab] = useState<"results" | "summary" | "logs">("results");
  const [activeSummaryView, setActiveSummaryView] = useState<"table" | "charts">("table");
  const [activeChartType, setActiveChartType] = useState<"bar" | "line" | "comparison">("bar");
  const [activeClassView, setActiveClassView] = useState<"table" | "charts">("table");
  const [activeClassChartType, setActiveClassChartType] = useState<"by-class" | "by-class-and-trial">("by-class");
  const [apiLogs, setApiLogs] = useState<Array<{
    timestamp: number;
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
  
  // State to track if class column exists in the loaded CSV
  const [hasClassColumn, setHasClassColumn] = useState<boolean>(false);
  
  // Refs to track pause/stop flags (for immediate access in async loops)
  const shouldPauseRef = useRef(false);
  const shouldStopRef = useRef(false);
  
  // Load stored configs from localStorage after component mounts
  useEffect(() => {
    const saved = localStorage.getItem('storedApiConfigs');
    if (saved) {
      try {
        const parsedConfigs = JSON.parse(saved);
        setStoredApiConfigs(parsedConfigs);
      } catch (error) {
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
        }
        
        setAvailableModels(uniqueModels);
      } catch (error) {
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

  // Reset pause/resume state when selected models change
  const prevSelectedModelsRef = useRef<Model[]>([]);
  useEffect(() => {
    // Only check for changes after initial load (prevent triggering on component mount)
    if (prevSelectedModelsRef.current.length > 0) {
      // Check if models have actually changed
      const currentModelIds = selectedModels.map(m => m.id).sort().join(',');
      const prevModelIds = prevSelectedModelsRef.current.map(m => m.id).sort().join(',');
      
      if (currentModelIds !== prevModelIds) {
        // Models have changed, reset pause state if evaluation is paused
        if (isPaused || evaluationState) {
          setIsPaused(false);
          setShouldPauseEvaluation(false);
          shouldPauseRef.current = false;
          setEvaluationState(null);
          setTrialResults([]); // Clear previous results
          setResults([]);
          setApiLogs([]);
          
          toast({
            title: "Models Changed",
            description: "Previous evaluation state has been cleared. You can start a fresh evaluation.",
            status: "info",
            duration: 3000,
          });
        }
      }
    }
    
    // Update the ref to current models
    prevSelectedModelsRef.current = [...selectedModels];
  }, [selectedModels, isPaused, evaluationState]);

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
    }
    
    return {
      invalidModels,
      providersWithIssues
    };
  };

  // Trial-based evaluation function
  const stopEvaluation = () => {
    // If already paused, stop immediately without showing "Stopping..."
    if (isPaused) {
      // Immediately stop evaluation
      setIsEvaluating(false);
      setIsProcessing(false);
      setIsPaused(false);
      setShouldPauseEvaluation(false);
      shouldPauseRef.current = false;
      shouldStopRef.current = false;
      setEvaluationState(null);
      
      toast({
        title: "Evaluation Stopped",
        description: "Paused evaluation has been stopped.",
        status: "warning",
        duration: 3000,
      });
    } else {
      // For active evaluations, set stopping flag
      setShouldStopEvaluation(true);
      shouldStopRef.current = true;
      
      // Abort any ongoing API requests
      if (abortController) {
        abortController.abort();
      }
      
      // Immediately stop evaluation
      setIsEvaluating(false);
      setIsProcessing(false);
      setIsPaused(false);
      setShouldPauseEvaluation(false);
      shouldPauseRef.current = false;
      setEvaluationState(null);
      
      toast({
        title: "Evaluation Stopped",
        description: "Evaluation has been stopped immediately.",
        status: "warning",
        duration: 3000,
      });
    }
  };

  const pauseEvaluation = () => {
    setShouldPauseEvaluation(true);
    shouldPauseRef.current = true;
    
    // No toast here - button shows "Pausing..." and we'll show toast when pause completes
  };

  const resumeEvaluation = () => {
    if (!evaluationState) {
      toast({
        title: "Cannot Resume",
        description: "No paused evaluation found.",
        status: "error",
        duration: 3000,
      });
      return;
    }

    setIsPaused(false);
    setShouldPauseEvaluation(false);
    shouldPauseRef.current = false;
    setIsEvaluating(true);
    setIsProcessing(true);
    
    // Continue evaluation from saved state
    runEvaluationLoop(evaluationState);
    
    toast({
      title: "Resuming Evaluation",
      description: "Evaluation is resuming from where it was paused.",
      status: "success",
      duration: 3000,
    });
  };

  // Main evaluation loop that can be paused and resumed
  const runEvaluationLoop = async (state: {
    parsedQuestions: Array<{id: string, question: string, answer: string, class?: string}>;
    trialResultsArray: QuestionResult[];
    currentModelIndex: number;
    currentPhase: 'trial1' | 'trial2' | 'trial3' | 'inconsistent';
    currentQuestionIndex: number;
    currentTrialNumber: number;
    inconsistentQuestions: Array<{index: number, modelId: string}>;
  }) => {
    const controller = abortController || new AbortController();
    if (!abortController) {
      setAbortController(controller);
    }

    let wasStopped = false;
    let { parsedQuestions, trialResultsArray, currentModelIndex, currentPhase, currentQuestionIndex, currentTrialNumber, inconsistentQuestions } = state;

    try {
      // Phase 1: Run 3 trials for each model
      for (let modelIdx = currentModelIndex; modelIdx < selectedModels.length; modelIdx++) {
        const model = selectedModels[modelIdx];

        // Check if user stopped evaluation
        if (shouldStopRef.current) {
          wasStopped = true;
          break;
        }

        // Check if user paused evaluation
        if (shouldPauseRef.current) {
          setIsPaused(true);
          setIsEvaluating(false);
          setIsProcessing(false);
          setShouldPauseEvaluation(false); // Reset pause flag
          shouldPauseRef.current = false;
          setEvaluationState({
            parsedQuestions,
            trialResultsArray,
            currentModelIndex: modelIdx,
            currentPhase,
            currentQuestionIndex,
            currentTrialNumber,
            inconsistentQuestions
          });
          toast({
            title: "Evaluation Paused",
            description: "You can resume from where you left off.",
            status: "info",
            duration: 3000,
          });
          return;
        }

        // Trial 1: Individual questions (1 per request)
        if (currentPhase === 'trial1') {
          for (let i = (modelIdx === currentModelIndex ? currentQuestionIndex : 0); i < parsedQuestions.length; i++) {
            // Check for stop
            if (shouldStopRef.current) {
              wasStopped = true;
              break;
            }

            // Check for pause
            if (shouldPauseRef.current) {
              setIsPaused(true);
              setIsEvaluating(false);
              setIsProcessing(false);
              setShouldPauseEvaluation(false); // Reset pause flag so button shows "Pause" again
              shouldPauseRef.current = false;
              setEvaluationState({
                parsedQuestions,
                trialResultsArray,
                currentModelIndex: modelIdx,
                currentPhase: 'trial1',
                currentQuestionIndex: i,
                currentTrialNumber,
                inconsistentQuestions
              });
              toast({
                title: "Evaluation Paused",
                description: "You can resume from where you left off.",
                status: "info",
                duration: 3000,
              });
              return;
            }

            const q = parsedQuestions[i];
            
            try {
              const trialResult = await runSingleQuestionTrial(model, q.question, q.answer, systemPrompt, q.id, controller.signal);

              if (!trialResultsArray[i].modelResults[model.id]) {
                trialResultsArray[i].modelResults[model.id] = { trial1: trialResult };
              } else {
                trialResultsArray[i].modelResults[model.id].trial1 = trialResult;
              }

              setProgress(prev => ({ ...prev, current: prev.current + 1 }));
              setTrialResults([...trialResultsArray]);
            } catch (error) {
              // Handle error by pausing
              setIsPaused(true);
              setIsEvaluating(false);
              setIsProcessing(false);
              setShouldPauseEvaluation(false);
              shouldPauseRef.current = false;
              setEvaluationState({
                parsedQuestions,
                trialResultsArray,
                currentModelIndex: modelIdx,
                currentPhase: 'trial1',
                currentQuestionIndex: i, // Retry this question
                currentTrialNumber,
                inconsistentQuestions
              });
              
              toast({
                title: "API Error - Evaluation Paused",
                description: `Error encountered: ${error instanceof Error ? error.message : 'Unknown error'}. Click Resume to retry.`,
                status: "error",
                duration: 10000,
                isClosable: true,
              });
              return;
            }
          }

          // Check for stop before moving to next phase
          if (shouldStopRef.current) {
            wasStopped = true;
            break;
          }

          // Check for pause before moving to next phase
          if (shouldPauseRef.current) {
            setIsPaused(true);
            setIsEvaluating(false);
            setIsProcessing(false);
            setShouldPauseEvaluation(false); // Reset pause flag
            shouldPauseRef.current = false;
            setEvaluationState({
              parsedQuestions,
              trialResultsArray,
              currentModelIndex: modelIdx,
              currentPhase: 'trial2',
              currentQuestionIndex: 0,
              currentTrialNumber,
              inconsistentQuestions
            });
            toast({
              title: "Evaluation Paused",
              description: "You can resume from where you left off.",
              status: "info",
              duration: 3000,
            });
            return;
          }

          currentPhase = 'trial2';
          currentQuestionIndex = 0;
        }

        // Trial 2: Batch questions (up to 10 per request)
        if (currentPhase === 'trial2') {
          try {
            const trial2Results = await runBatchedTrial(model, parsedQuestions, systemPrompt, 2, controller.signal);
            trial2Results.forEach((result, index) => {
              if (trialResultsArray[index].modelResults[model.id]) {
                trialResultsArray[index].modelResults[model.id].trial2 = result;
              }
              setProgress(prev => ({ ...prev, current: prev.current + 1 }));
            });
            setTrialResults([...trialResultsArray]);
          } catch (error) {
            // Handle error by pausing
            setIsPaused(true);
            setIsEvaluating(false);
            setIsProcessing(false);
            setShouldPauseEvaluation(false);
            shouldPauseRef.current = false;
            setEvaluationState({
              parsedQuestions,
              trialResultsArray,
              currentModelIndex: modelIdx,
              currentPhase: 'trial2',
              currentQuestionIndex: 0,
              currentTrialNumber,
              inconsistentQuestions
            });
            
            toast({
              title: "API Error - Evaluation Paused",
              description: `Error encountered: ${error instanceof Error ? error.message : 'Unknown error'}. Click Resume to retry.`,
              status: "error",
              duration: 10000,
              isClosable: true,
            });
            return;
          }

          // Check for stop
          if (shouldStopRef.current) {
            wasStopped = true;
            break;
          }

          // Check for pause
          if (shouldPauseRef.current) {
            setIsPaused(true);
            setIsEvaluating(false);
            setIsProcessing(false);
            setShouldPauseEvaluation(false); // Reset pause flag
            shouldPauseRef.current = false;
            setEvaluationState({
              parsedQuestions,
              trialResultsArray,
              currentModelIndex: modelIdx,
              currentPhase: 'trial3',
              currentQuestionIndex: 0,
              currentTrialNumber,
              inconsistentQuestions
            });
            toast({
              title: "Evaluation Paused",
              description: "You can resume from where you left off.",
              status: "info",
              duration: 3000,
            });
            return;
          }

          currentPhase = 'trial3';
          currentQuestionIndex = 0;
        }

        // Trial 3: Batch questions (up to 10 per request)
        if (currentPhase === 'trial3') {
          try {
            const trial3Results = await runBatchedTrial(model, parsedQuestions, systemPrompt, 3, controller.signal);
            trial3Results.forEach((result, index) => {
              if (trialResultsArray[index].modelResults[model.id]) {
                trialResultsArray[index].modelResults[model.id].trial3 = result;
              }
              setProgress(prev => ({ ...prev, current: prev.current + 1 }));
            });
            setTrialResults([...trialResultsArray]);
          } catch (error) {
            // Handle error by pausing
            setIsPaused(true);
            setIsEvaluating(false);
            setIsProcessing(false);
            setShouldPauseEvaluation(false);
            shouldPauseRef.current = false;
            setEvaluationState({
              parsedQuestions,
              trialResultsArray,
              currentModelIndex: modelIdx,
              currentPhase: 'trial3',
              currentQuestionIndex: 0,
              currentTrialNumber,
              inconsistentQuestions
            });
            
            toast({
              title: "API Error - Evaluation Paused",
              description: `Error encountered: ${error instanceof Error ? error.message : 'Unknown error'}. Click Resume to retry.`,
              status: "error",
              duration: 10000,
              isClosable: true,
            });
            return;
          }
        }

        // Reset phase for next model
        if (modelIdx < selectedModels.length - 1) {
          currentPhase = 'trial1';
          currentQuestionIndex = 0;
        }
      }

      // Check if user stopped evaluation before Phase 2
      if (shouldStopRef.current) {
        wasStopped = true;
        setIsEvaluating(false);
        setIsProcessing(false);
        setShouldStopEvaluation(false);
        shouldStopRef.current = false;
        setIsPaused(false);
        setEvaluationState(null);
        setAbortController(null);
        toast({
          title: "Evaluation Stopped",
          description: "Evaluation was stopped. Partial results are available.",
          status: "info",
          duration: 3000,
        });
        return;
      }

      // Phase 2: Check for inconsistencies and run additional trials
      inconsistentQuestions = [];
      
      trialResultsArray.forEach((qResult, index) => {
        Object.entries(qResult.modelResults).forEach(([modelId, modelResult]) => {
          const answers = [
            modelResult.trial1?.answer,
            modelResult.trial2?.answer,
            modelResult.trial3?.answer
          ].filter(Boolean);
          
          const uniqueAnswers = new Set(answers);
          if (uniqueAnswers.size > 1) {
            modelResult.isInconsistent = true;
            inconsistentQuestions.push({ index, modelId });
          }
        });
      });

      // Phase 3: Run 7 additional trials for inconsistent questions (BATCHED)
      if (inconsistentQuestions.length > 0) {
        // Group inconsistent questions by model for batching
        const inconsistentByModel = new Map<string, Array<{index: number, question: {id: string, question: string, answer: string}}>>();
        
        for (const {index, modelId} of inconsistentQuestions) {
          if (!inconsistentByModel.has(modelId)) {
            inconsistentByModel.set(modelId, []);
          }
          inconsistentByModel.get(modelId)!.push({
            index,
            question: parsedQuestions[index]
          });
        }
        
        // Update progress to account for 7 batched trials per model (not per question)
        const totalAdditionalTrials = Array.from(inconsistentByModel.values())
          .reduce((sum, questions) => sum + (Math.ceil(questions.length / 10) * 7), 0);
        setProgress(prev => ({ ...prev, total: prev.total + totalAdditionalTrials }));
        
        // Run 7 additional trials for each model's inconsistent questions
        for (const [modelId, modelInconsistentQuestions] of Array.from(inconsistentByModel.entries())) {
          const model = selectedModels.find(m => m.id === modelId);
          if (!model) continue;
          
          // Run trials 4-10 (7 trials)
          for (let trialNum = 4; trialNum <= 10; trialNum++) {
            // Check for stop
            if (shouldStopRef.current) {
              wasStopped = true;
              break;
            }

            // Check for pause
            if (shouldPauseRef.current) {
              setIsPaused(true);
              setIsEvaluating(false);
              setIsProcessing(false);
              setShouldPauseEvaluation(false); // Reset pause flag
              shouldPauseRef.current = false;
              setEvaluationState({
                parsedQuestions,
                trialResultsArray,
                currentModelIndex: selectedModels.length, // Past regular trials
                currentPhase: 'inconsistent',
                currentQuestionIndex: 0,
                currentTrialNumber: trialNum,
                inconsistentQuestions
              });
              toast({
                title: "Evaluation Paused",
                description: "You can resume from where you left off.",
                status: "info",
                duration: 3000,
              });
              return;
            }

            try {
              const trialResults = await runBatchedTrial(
                model,
                modelInconsistentQuestions.map((q: {index: number, question: {id: string, question: string, answer: string}}) => q.question),
                systemPrompt,
                trialNum,
                controller.signal
              );
              
              // Distribute results back to the corresponding questions
              trialResults.forEach((result, idx) => {
                const questionIndex = modelInconsistentQuestions[idx].index;
                
                if (!trialResultsArray[questionIndex].modelResults[modelId].additionalTrials) {
                  trialResultsArray[questionIndex].modelResults[modelId].additionalTrials = [];
                }
                trialResultsArray[questionIndex].modelResults[modelId].additionalTrials!.push(result);
              });
              
              setProgress(prev => ({ ...prev, current: prev.current + 1 }));
              setTrialResults([...trialResultsArray]);
            } catch (error) {
              // Handle error by pausing
              setIsPaused(true);
              setIsEvaluating(false);
              setIsProcessing(false);
              setShouldPauseEvaluation(false);
              shouldPauseRef.current = false;
              setEvaluationState({
                parsedQuestions,
                trialResultsArray,
                currentModelIndex: selectedModels.length,
                currentPhase: 'inconsistent',
                currentQuestionIndex: 0,
                currentTrialNumber: trialNum,
                inconsistentQuestions
              });
              
              toast({
                title: "API Error - Evaluation Paused",
                description: `Error encountered: ${error instanceof Error ? error.message : 'Unknown error'}. Click Resume to retry.`,
                status: "error",
                duration: 10000,
                isClosable: true,
              });
              return;
            }
          }
          
          if (shouldStopRef.current) {
            wasStopped = true;
            break;
          }

          // Calculate percentage correct out of 10 trials for each inconsistent question
          for (const {index} of modelInconsistentQuestions) {
            const modelResult = trialResultsArray[index].modelResults[modelId];
            const allTrials = [
              modelResult.trial1,
              modelResult.trial2,
              modelResult.trial3,
              ...(modelResult.additionalTrials || [])
            ].filter(Boolean) as TrialResult[];
            
            // Filter out aborted trials from the calculation
            const nonAbortedTrials = allTrials.filter(t => !t.aborted);
            
            // Only calculate percentage if we have non-aborted trials
            if (nonAbortedTrials.length > 0) {
              const correctCount = nonAbortedTrials.filter(t => t.correct).length;
              modelResult.correctPercentage = (correctCount / nonAbortedTrials.length) * 100;
            }
          }
        }
        
        setTrialResults([...trialResultsArray]);
      }

      setTrialResults(trialResultsArray);
      
      // Scroll to results section
      setTimeout(() => {
        document.getElementById('evaluation')?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
      
      // Only show completion message if evaluation wasn't stopped
      if (!wasStopped && !controller.signal.aborted) {
        toast({
          title: "Trial evaluation completed",
          description: `Processed ${parsedQuestions.length} questions with ${selectedModels.length} models. Found ${inconsistentQuestions.length} inconsistent responses.`,
          status: "success",
          duration: 5000,
        });
      }
      
      // Reset evaluation state
      setIsEvaluating(false);
      setIsProcessing(false);
      setShouldStopEvaluation(false);
      setShouldPauseEvaluation(false);
      shouldStopRef.current = false;
      shouldPauseRef.current = false;
      setIsPaused(false);
      setEvaluationState(null);
      setAbortController(null);
    } catch (error) {
      setIsEvaluating(false);
      setIsProcessing(false);
      setShouldStopEvaluation(false);
      setShouldPauseEvaluation(false);
      shouldStopRef.current = false;
      shouldPauseRef.current = false;
      setIsPaused(false);
      setEvaluationState(null);
      setAbortController(null);
      
      toast({
        title: "Evaluation failed",
        description: "There was an error during evaluation processing. Please check the console for details.",
        status: "error",
        duration: 5000,
      });
    }
  };

  const exportToExcel = () => {
    if (trialResults.length === 0) {
      toast({
        title: "No Data to Export",
        description: "Please run an evaluation first before exporting.",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      // Create CSV content
      let csv = '';
      
      // Header row
      const headerRow = ['#'];
      if (hasClassColumn) {
        headerRow.push('Class');
      }
      headerRow.push('Question', 'Len (Char)', 'Correct');
      
      selectedModels.forEach(model => {
        headerRow.push(
          `${model.name} - Tokens`,
          `${model.name} - TTFT (ms)`,
          `${model.name} - T1`,
          `${model.name} - T2`,
          `${model.name} - T3`,
          `${model.name} - % of 10`
        );
      });
      csv += headerRow.map(h => `"${h}"`).join(',') + '\n';
      
      // Data rows
      trialResults.forEach((result, index) => {
        const row: (string | number)[] = [index + 1];
        
        if (hasClassColumn) {
          row.push(result.class || '-');
        }
        
        row.push(
          `"${result.question.replace(/"/g, '""')}"`,
          result.length,
          result.correctAnswer
        );
        
        selectedModels.forEach(model => {
          const modelResult = result.modelResults[model.id];
          if (modelResult) {
            row.push(
              modelResult.trial1?.tokens || '-',
              modelResult.trial1?.time || '-',
              modelResult.trial1?.answer || '-',
              modelResult.trial2?.answer || '-',
              modelResult.trial3?.answer || '-',
              modelResult.correctPercentage !== undefined ? `${Math.round(modelResult.correctPercentage)}%` : '-'
            );
          } else {
            row.push('-', '-', '-', '-', '-', '-');
          }
        });
        
        csv += row.join(',') + '\n';
      });
      
      // Create blob and download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `evaluation_results_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Export Successful",
        description: "Results exported to CSV file",
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "There was an error exporting the results",
        status: "error",
        duration: 3000,
      });
    }
  };

  const exportLogs = () => {
    if (apiLogs.length === 0) {
      toast({
        title: "No Logs to Export",
        description: "Please run an evaluation first to generate API logs.",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      // Create CSV content for logs
      let csv = 'Timestamp,Provider,Model,Question ID,Question,Duration (ms),Temperature,Prompt Tokens,Completion Tokens,Total Tokens,Answer,Correct,Error\n';
      
      apiLogs.forEach(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        const provider = log.provider || '';
        const model = log.model || '';
        const questionId = log.questionId || '';
        const question = (log.question || '').replace(/"/g, '""'); // Escape quotes
        const duration = log.duration || 0;
        const temperature = log.temperature !== undefined ? log.temperature : '';
        const promptTokens = log.promptTokens || 0;
        const completionTokens = log.completionTokens || 0;
        const totalTokens = log.totalTokens || 0;
        const answer = log.response?.answer || '';
        const correct = log.response?.correct ? 'Yes' : 'No';
        const error = log.error ? log.error.replace(/"/g, '""') : '';
        
        csv += `"${timestamp}","${provider}","${model}","${questionId}","${question}",${duration},${temperature},${promptTokens},${completionTokens},${totalTokens},"${answer}","${correct}","${error}"\n`;
      });

      // Create blob and download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `api_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Logs Exported Successfully",
        description: `${apiLogs.length} API log${apiLogs.length !== 1 ? 's' : ''} exported to CSV`,
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "There was an error exporting the logs",
        status: "error",
        duration: 3000,
      });
    }
  };

  const exportSummaryData = () => {
    if (trialResults.length === 0) {
      toast({
        title: "No Summary Data to Export",
        description: "Please run an evaluation first to generate summary data.",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      // Create CSV content for summary
      let csv = 'Model,Trial 1 Accuracy,Trial 2 Accuracy,Trial 3 Accuracy,Average Accuracy,Total Questions\n';
      
      selectedModels.forEach(model => {
        let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0;
        let total = 0;

        trialResults.forEach(qResult => {
          const modelResult = qResult.modelResults[model.id];
          if (modelResult) {
            total++;
            if (modelResult.trial1?.correct) trial1Correct++;
            if (modelResult.trial2?.correct) trial2Correct++;
            if (modelResult.trial3?.correct) trial3Correct++;
          }
        });

        const trial1Acc = total > 0 ? ((trial1Correct / total) * 100).toFixed(2) : '0.00';
        const trial2Acc = total > 0 ? ((trial2Correct / total) * 100).toFixed(2) : '0.00';
        const trial3Acc = total > 0 ? ((trial3Correct / total) * 100).toFixed(2) : '0.00';
        const avgAcc = ((parseFloat(trial1Acc) + parseFloat(trial2Acc) + parseFloat(trial3Acc)) / 3).toFixed(2);

        csv += `"${model.name}",${trial1Acc}%,${trial2Acc}%,${trial3Acc}%,${avgAcc}%,${total}\n`;
      });

      // Add class-based breakdown if available
      if (hasClassColumn) {
        const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort();
        
        if (classes.length > 0) {
          csv += '\n\nModel,Class,Trial 1 Accuracy,Trial 2 Accuracy,Trial 3 Accuracy,Average Accuracy,Questions\n';
          
          selectedModels.forEach(model => {
            classes.forEach(className => {
              let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0;
              let total = 0;

              trialResults.forEach(qResult => {
                if (qResult.class === className) {
                  const modelResult = qResult.modelResults[model.id];
                  if (modelResult) {
                    total++;
                    if (modelResult.trial1?.correct) trial1Correct++;
                    if (modelResult.trial2?.correct) trial2Correct++;
                    if (modelResult.trial3?.correct) trial3Correct++;
                  }
                }
              });

              if (total > 0) {
                const trial1Acc = ((trial1Correct / total) * 100).toFixed(2);
                const trial2Acc = ((trial2Correct / total) * 100).toFixed(2);
                const trial3Acc = ((trial3Correct / total) * 100).toFixed(2);
                const avgAcc = ((parseFloat(trial1Acc) + parseFloat(trial2Acc) + parseFloat(trial3Acc)) / 3).toFixed(2);

                csv += `"${model.name}","${className}",${trial1Acc}%,${trial2Acc}%,${trial3Acc}%,${avgAcc}%,${total}\n`;
              }
            });
          });
        }
      }

      // Create blob and download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `summary_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Summary Exported Successfully",
        description: `Summary data for ${selectedModels.length} model${selectedModels.length !== 1 ? 's' : ''} exported to CSV`,
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "An error occurred while exporting the summary data.",
        status: "error",
        duration: 5000,
      });
    }
  };

  const exportTableData = () => {
    if (trialResults.length === 0) {
      toast({
        title: "No Data to Export",
        description: "Please run an evaluation first.",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      let csv = '';
      
      // Export Overall Accuracy Table
      if (hasClassColumn) {
        const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort();
        
        // Header with class columns
        const header = ['Model'];
        classes.forEach(cls => {
          header.push(`${cls} - T1`, `${cls} - T2`, `${cls} - T3`, `${cls} - Avg`);
        });
        header.push('Overall Avg');
        csv += header.map(h => `"${h}"`).join(',') + '\n';
        
        // Data rows
        selectedModels.forEach(model => {
          const row = [model.name];
          
          let overallTotal = 0;
          classes.forEach(className => {
            let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0, total = 0;
            
            trialResults.forEach(qResult => {
              if (qResult.class === className) {
                const modelResult = qResult.modelResults[model.id];
                if (modelResult) {
                  total++;
                  if (modelResult.trial1?.correct) trial1Correct++;
                  if (modelResult.trial2?.correct) trial2Correct++;
                  if (modelResult.trial3?.correct) trial3Correct++;
                }
              }
            });
            
            if (total > 0) {
              const t1 = ((trial1Correct / total) * 100).toFixed(1);
              const t2 = ((trial2Correct / total) * 100).toFixed(1);
              const t3 = ((trial3Correct / total) * 100).toFixed(1);
              const avg = ((parseFloat(t1) + parseFloat(t2) + parseFloat(t3)) / 3).toFixed(1);
              row.push(`${t1}%`, `${t2}%`, `${t3}%`, `${avg}%`);
              overallTotal += parseFloat(avg);
            } else {
              row.push('-', '-', '-', '-');
            }
          });
          
          const overallAvg = (overallTotal / classes.length).toFixed(1);
          row.push(`${overallAvg}%`);
          csv += row.map(r => `"${r}"`).join(',') + '\n';
        });
      } else {
        // Simple table without classes
        csv += 'Model,Trial 1,Trial 2,Trial 3,Average\n';
        
        selectedModels.forEach(model => {
          let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0, total = 0;
          
          trialResults.forEach(qResult => {
            const modelResult = qResult.modelResults[model.id];
            if (modelResult) {
              total++;
              if (modelResult.trial1?.correct) trial1Correct++;
              if (modelResult.trial2?.correct) trial2Correct++;
              if (modelResult.trial3?.correct) trial3Correct++;
            }
          });
          
          const t1 = total > 0 ? ((trial1Correct / total) * 100).toFixed(1) : '0.0';
          const t2 = total > 0 ? ((trial2Correct / total) * 100).toFixed(1) : '0.0';
          const t3 = total > 0 ? ((trial3Correct / total) * 100).toFixed(1) : '0.0';
          const avg = ((parseFloat(t1) + parseFloat(t2) + parseFloat(t3)) / 3).toFixed(1);
          
          csv += `"${model.name}",${t1}%,${t2}%,${t3}%,${avg}%\n`;
        });
      }
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `accuracy_table_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Table Exported Successfully",
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "An error occurred while exporting the table.",
        status: "error",
        duration: 5000,
      });
    }
  };

  const exportChartAsImage = (format: 'png' | 'svg' = 'png') => {
    try {
      const chartElement = document.getElementById('chart-container');
      if (!chartElement) {
        toast({
          title: "Export Failed",
          description: "Chart not found.",
          status: "error",
          duration: 3000,
        });
        return;
      }

      // For Chart.js charts, find the canvas element
      const canvasElement = chartElement.querySelector('canvas');
      if (canvasElement) {
        if (format === 'png') {
          // Export as PNG
          canvasElement.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.setAttribute('href', url);
              link.setAttribute('download', `chart_${activeChartType}_${new Date().toISOString().slice(0, 10)}.png`);
              link.click();
              URL.revokeObjectURL(url);
              
              toast({
                title: "Chart Exported as PNG",
                status: "success",
                duration: 3000,
              });
            } else {
              toast({
                title: "Export Failed",
                description: "Could not create PNG from chart.",
                status: "error",
                duration: 3000,
              });
            }
          });
        } else if (format === 'svg') {
          // Export as SVG
          // Get canvas dimensions and data
          const width = canvasElement.width;
          const height = canvasElement.height;
          const dataURL = canvasElement.toDataURL('image/png');
          
          // Create SVG with embedded image
          const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image width="${width}" height="${height}" xlink:href="${dataURL}"/>
</svg>`;
          
          const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', `chart_${activeChartType}_${new Date().toISOString().slice(0, 10)}.svg`);
          link.click();
          URL.revokeObjectURL(url);
          
          toast({
            title: "Chart Exported as SVG",
            status: "success",
            duration: 3000,
          });
        }
      } else {
        toast({
          title: "Export Failed",
          description: "Chart canvas not found. Please ensure a chart is displayed.",
          status: "warning",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "An error occurred while exporting the chart.",
        status: "error",
        duration: 5000,
      });
    }
  };

  const startEvaluation = async () => {
    // Reset stop flag
    setShouldStopEvaluation(false);
    
    // Validation checks
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
    

    try {
      // Read the CSV file
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Create AbortController for this evaluation
          const controller = new AbortController();
          setAbortController(controller);
          
          // Set both global and local loading states INSIDE the callback
          setIsProcessing(true);
          setIsEvaluating(true);
          setShouldPauseEvaluation(false);
          shouldPauseRef.current = false;
          shouldStopRef.current = false;
          
          // Force a small delay to ensure state updates
          setTimeout(() => {
          }, 100);
          setProgress({ current: 0, total: questionCount * 3 * selectedModels.length }); // 3 trials per question per model
          setResults([]);
          setTrialResults([]);
          setApiLogs([]);
          setHasClassColumn(false); // Reset class column state
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
        
        
        // Find the indices of required columns - more flexible matching
        let classIndex = headerParts.findIndex(h => 
          h === 'class' || 
          h === 'category' || 
          h === 'catogory' || // handle typo
          h === 'group' || 
          h === 'step'
        );
        
        // Set state to track if class column exists
        setHasClassColumn(classIndex !== -1);
        
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
          } else if (idIndex === -1 && headerParts[1]?.toLowerCase() === 'id') {
            // If ID column wasn't detected but it's the second column
            idIndex = 1;
          }
          
          if (questionIndex === -1 && headerParts[2]?.toLowerCase() === 'question') {
            // If Question column wasn't detected but it's the third column
            questionIndex = 2;
          }
          
          if (answerIndex === -1 && headerParts[4]?.toLowerCase().includes('correct')) {
            // If Correct Answer column wasn't detected but it's the fifth column
            answerIndex = 4;
          }
        }
        
        // Validate that we found all required columns
        const missingColumns = [];
        if (idIndex === -1) missingColumns.push("ID");
        if (questionIndex === -1) missingColumns.push("Question");
        if (answerIndex === -1) missingColumns.push("Correct");
        
        if (missingColumns.length > 0) {
          const missingColumnsStr = missingColumns.join(", ");
          
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
        
        
        const questions = lines.slice(1); // Skip header row
        
        // Parse all questions into array
        const parsedQuestions: Array<{id: string, question: string, answer: string, class?: string}> = [];
        
        for (let i = 0; i < questions.length; i++) {
          try {
            const parts: string[] = [];
            let current = '';
            let inQuotes = false;
            
            for (let j = 0; j < questions[i].length; j++) {
              const char = questions[i][j];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                parts.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            parts.push(current.trim());
            
            const maxIndex = Math.max(classIndex === -1 ? -1 : classIndex, idIndex, questionIndex, answerIndex);
            if (parts.length > maxIndex) {
              const questionData: any = {
                id: parts[idIndex].trim(),
                question: parts[questionIndex].trim(),
                answer: parts[answerIndex].trim().toUpperCase()
              };
              
              // Add class if column exists
              if (classIndex !== -1 && parts[classIndex]) {
                questionData.class = parts[classIndex].trim();
              }
              
              parsedQuestions.push(questionData);
            }
          } catch (error) {
          }
        }
        
        
        // Initialize trial results array
        const trialResultsArray: QuestionResult[] = parsedQuestions.map(q => ({
          questionId: q.id,
          question: q.question,
          class: q.class, // Include class if available
          length: q.question.length,
          correctAnswer: q.answer,
          modelResults: {}
        }));

        // Set trial results immediately to show the table before first API call
        setTrialResults([...trialResultsArray]);

        // Start the evaluation loop with initial state
        await runEvaluationLoop({
          parsedQuestions,
          trialResultsArray,
          currentModelIndex: 0,
          currentPhase: 'trial1',
          currentQuestionIndex: 0,
          currentTrialNumber: 0,
          inconsistentQuestions: []
        });
        
        } catch (callbackError) {
          setIsEvaluating(false);
          setIsProcessing(false);
          setShouldStopEvaluation(false);
          setShouldPauseEvaluation(false);
          shouldStopRef.current = false;
          shouldPauseRef.current = false;
          setIsPaused(false);
          setEvaluationState(null);
          setAbortController(null);
          toast({
            title: "Evaluation failed",
            description: "There was an error during evaluation processing. Please check the console for details.",
            status: "error",
            duration: 5000,
          });
        }
      };
      
      reader.readAsText(selectedFile);
    } catch (error) {
      setIsEvaluating(false);
      setIsProcessing(false);
      setShouldStopEvaluation(false);
      setShouldPauseEvaluation(false);
      shouldStopRef.current = false;
      shouldPauseRef.current = false;
      setIsPaused(false);
      setEvaluationState(null);
      setAbortController(null);
      toast({
        title: "Evaluation failed",
        description: "There was an error during evaluation. Please check the console for details.",
        status: "error",
        duration: 5000,
      });
    }
  };

  // Helper function to parse CSV line
  const parseCSVLine = (line: string): string[] => {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    return parts;
  };

  // Helper function to determine the correct API endpoint based on model type
  const getApiEndpoint = (baseUrl: string, modelId: string, provider: string): string => {
    // For OpenAI, all models including reasoning models use the same endpoint
    // The o1 series models use /chat/completions but with parameter restrictions
    
    // Use standard chat completions endpoint for all models
    return `${baseUrl}/chat/completions`;
  };

  // Helper function to run a single question trial
  const runSingleQuestionTrial = async (
    model: Model,
    question: string,
    correctAnswer: string,
    prompt: string,
    questionId?: string,
    abortSignal?: AbortSignal
  ): Promise<TrialResult> => {
    const startTime = Date.now();
    
    try {
      // Get API config from stored configs
      const storedConfig = storedApiConfigs.find(config => config.provider === model.provider);
      if (!storedConfig || !storedConfig.key) {
        const errorMsg = `No API configuration for ${model.provider}. Please add API key first.`;
        throw new Error(errorMsg);
      }

      const modelId = model.apiModelId || model.id;
      
      // Check if it's an OpenAI reasoning model (o1 series)
      const isO1Model = /^(o1|o3)(-mini|-preview)?(-\d{4}-\d{2}-\d{2})?$/i.test(modelId);
      
      // Build request body - o1 models have different requirements
      const requestBody: any = {
        model: modelId // Use the original API model ID
      };
      
      if (isO1Model) {
        // o1 models don't support system messages - combine system prompt with user message
        requestBody.messages = [
          { role: "user", content: `${prompt}\n\n${question}` }
        ];
        // o1 models don't support temperature, max_tokens, stop, etc.
      } else {
        // Standard models support system messages and parameters
        requestBody.messages = [
          { role: "system", content: prompt },
          { role: "user", content: question }
        ];
        requestBody.temperature = temperature;
      }
      
      // Add reasoning_effort parameter for GPT-5 and O-series models if specified
      if (model.reasoningEffort && model.provider === 'openai') {
        requestBody.reasoning_effort = model.reasoningEffort;
      }
      
      // max_tokens: 1200,
      //stop: ["\n\n"],

      // Get the correct endpoint based on model type
      const endpoint = getApiEndpoint(storedConfig.baseUrl || "https://api.openai.com/v1", modelId, model.provider);

      const response = await fetch('/api/chat', {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: endpoint,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${storedConfig.key}`
          },
          requestBody: requestBody
        }),
        signal: abortSignal || AbortSignal.timeout(600000), // 10 minutes for slow reasoning models
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = `API request failed: ${response.statusText} - ${JSON.stringify(errorData)}`;
        
        // Log to API logs
        setApiLogs(prev => [...prev, {
          timestamp: Date.now(),
          provider: model.provider,
          model: model.name,
          request: requestBody,
          error: errorMsg,
          duration: Date.now() - startTime,
          question: question,
          questionId: questionId,
          correctAnswer: correctAnswer,
          temperature: temperature,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          showFullRequest: false,
        }]);
        
        throw new Error(errorMsg);
      }

      const data = await response.json();
      
      // Handle different response formats (content vs reasoning_content)
      let rawAnswer = data.choices[0].message.content || "";
      
      // For single questions, strip out any numbering (e.g., "1. A" -> "A")
      let cleanedAnswer = rawAnswer.trim();
      // Remove patterns like "1.", "1)", "1-", etc. at the start
      cleanedAnswer = cleanedAnswer.replace(/^\s*\d+[.)\-:]\s*/g, '');
      const answer = cleanedAnswer.trim().toUpperCase();
      const duration = Date.now() - startTime;

      // Check if the answer is empty after cleaning - log but don't auto-pause
      if (!answer || answer.length === 0) {
        // Log empty response to API logs but return "ERROR" instead of throwing
        setApiLogs(prev => [...prev, {
          timestamp: Date.now(),
          provider: model.provider,
          model: model.name,
          request: requestBody,
          error: `Empty response: No valid answer found in model response. Raw response: "${rawAnswer}"`,
          duration: duration,
          question: question,
          questionId: questionId,
          correctAnswer: correctAnswer,
          temperature: temperature,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          showFullRequest: false,
        }]);
        
        return {
          answer: "ERROR",
          correct: false,
          tokens: 0,
          time: duration
        };
      }
      
      const tokens = data.usage?.total_tokens || estimateTokenCount(prompt + question + answer);
      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;


      // Log to API logs
      setApiLogs(prev => [...prev, {
        timestamp: Date.now(),
        provider: model.provider,
        model: model.name,
        request: requestBody,
        response: {
          answer: answer,
          correct: answer === correctAnswer.toUpperCase(),
          rawResponse: data,
        },
        duration: duration,
        question: question,
        questionId: questionId,
        correctAnswer: correctAnswer,
        temperature: temperature,
        promptTokens: promptTokens,
        completionTokens: completionTokens,
        totalTokens: tokens,
        showFullRequest: false,
      }]);

      return {
        answer,
        correct: answer === correctAnswer.toUpperCase(),
        tokens,
        time: duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle abort signal specifically
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          answer: "",  // Empty instead of "ABORTED"
          correct: false,
          tokens: 0,
          time: 0,
          aborted: true  // Flag to indicate this was aborted
        };
      }
      
      // Log the API error before rethrowing for auto-pause
      const errorMessage = error instanceof Error ? error.message : String(error);
      setApiLogs(prev => [...prev, {
        timestamp: Date.now(),
        provider: model.provider,
        model: model.name,
        request: { question, temperature },
        response: `API Error: ${errorMessage}`,
        error: errorMessage,
        duration: duration,
        question: question,
        questionId: questionId,
        correctAnswer: correctAnswer,
        temperature: temperature,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        showFullRequest: false,
      }]);
      
      // For all other errors (API failures, network issues, etc.), rethrow to trigger auto-pause
      throw error;
    }
  };

  // Helper function to run batched trial
  const runBatchedTrial = async (
    model: Model,
    questions: Array<{id: string, question: string, answer: string}>,
    prompt: string,
    trialNumber: number,
    abortSignal?: AbortSignal
  ): Promise<TrialResult[]> => {
    const results: TrialResult[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < questions.length; i += batchSize) {
      // Check if user stopped evaluation before each batch
      if (shouldStopEvaluation) {
        break;
      }
      
      const batch = questions.slice(i, Math.min(i + batchSize, questions.length));
      const startTime = Date.now();
      
      try {
        // Get API config from stored configs
        const storedConfig = storedApiConfigs.find(config => config.provider === model.provider);
        if (!storedConfig || !storedConfig.key) {
          const errorMsg = `No API configuration for ${model.provider}. Please add API key first.`;
          throw new Error(errorMsg);
        }

        // Create a combined prompt with all questions
        const combinedQuestion = batch.map((q, idx) => 
          `Question ${idx + 1}: ${q.question}`
        ).join('\n\n');

        const modelId = model.apiModelId || model.id;
        
        // Check if it's an OpenAI reasoning model (o1 series)
        const isO1Model = /^(o1|o3)(-mini|-preview)?(-\d{4}-\d{2}-\d{2})?$/i.test(modelId);
        
        // Build request body - o1 models have different requirements
        const requestBody: any = {
          model: modelId // Use the original API model ID
        };
        
        if (isO1Model) {
          // o1 models don't support system messages - combine system prompt with user message
          requestBody.messages = [
            { role: "user", content: `${prompt}\n\n${combinedQuestion}` }
          ];
          // o1 models don't support temperature, max_tokens, stop, etc.
        } else {
          // Standard models support system messages and parameters
          requestBody.messages = [
            { role: "system", content: prompt },
            { role: "user", content: combinedQuestion }
          ];
          
          // DeepSeek models support temperature but may have different defaults
          // Only add temperature for non-DeepSeek models to be safe
          if (model.provider !== 'deepseek') {
            requestBody.temperature = temperature;
          }
        }
        
        // Add reasoning_effort parameter for GPT-5 and O-series models if specified
        if (model.reasoningEffort && model.provider === 'openai') {
          requestBody.reasoning_effort = model.reasoningEffort;
        }

        console.log(`[Request Body] ${JSON.stringify(requestBody).substring(0, 500)}...`);
        
        //max_tokens: 500, // Increased to allow for more verbose responses
        //stop: ["\n\n"],

        // Get the correct endpoint based on model type
        const endpoint = getApiEndpoint(storedConfig.baseUrl || "https://api.openai.com/v1", modelId, model.provider);

        console.log(`[API Call] Provider: ${model.provider}, Endpoint: ${endpoint}, Model: ${modelId}`);

        let response;
        try {
          // Use Next.js API route to avoid CORS issues
          response = await fetch('/api/chat', {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              endpoint: endpoint,
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${storedConfig.key}`
              },
              requestBody: requestBody
            }),
            signal: abortSignal || AbortSignal.timeout(600000), // 10 minutes for slow reasoning models
          });
        } catch (fetchError) {
          const fetchErrorMsg = `Fetch error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
          console.error(`[API Error] ${fetchErrorMsg}`, fetchError);
          
          // Log to API logs
          setApiLogs(prev => [...prev, {
            timestamp: Date.now(),
            provider: model.provider,
            model: model.name,
            request: requestBody,
            error: fetchErrorMsg,
            duration: Date.now() - startTime,
            question: `Batch of ${batch.length} questions`,
            questionId: batch.map(q => q.id).join(', '),
            temperature: temperature,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            showFullRequest: false,
          }]);
          
          throw new Error(fetchErrorMsg);
        }

        console.log(`[API Response] Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = `API request failed: ${response.statusText} - ${JSON.stringify(errorData)}`;
          
          // Log to API logs
          setApiLogs(prev => [...prev, {
            timestamp: Date.now(),
            provider: model.provider,
            model: model.name,
            request: requestBody,
            error: errorMsg,
            duration: Date.now() - startTime,
            question: `Batch of ${batch.length} questions`,
            questionId: batch.map(q => q.id).join(', '),
            temperature: temperature,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            showFullRequest: false,
          }]);
          
          throw new Error(errorMsg);
        }

        const data = await response.json();
        
        // Handle different response formats (content vs reasoning_content)
        const responseText = (data.choices[0].message.content || "").trim();
        const duration = Date.now() - startTime;
        const totalTokens = data.usage?.total_tokens || estimateTokenCount(prompt + combinedQuestion + responseText);
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        
        
        // Parse the response to extract individual answers
        const answers = parseAndResponseText(responseText, batch.length);
        
        
        // Log to API logs
        setApiLogs(prev => [...prev, {
          timestamp: Date.now(),
          provider: model.provider,
          model: model.name,
          request: requestBody,
          response: {
            answers: answers,
            rawResponse: data,
          },
          duration: duration,
          question: `Batch of ${batch.length} questions`,
          questionId: batch.map(q => q.id).join(', '),
          temperature: temperature,
          promptTokens: promptTokens,
          completionTokens: completionTokens,
          totalTokens: totalTokens,
          showFullRequest: false,
        }]);
        
        // Check for parsing failures - if too many answers are "ERROR", treat as API failure
        const errorCount = answers.filter(answer => answer === "ERROR").length;
        const errorRate = errorCount / batch.length;
        
        // If more than 50% of answers failed to parse, treat as API error and trigger auto-pause
        if (errorRate > 0.5) {
          throw new Error(`Response parsing failed: ${errorCount}/${batch.length} answers could not be parsed from model response. Raw response: "${responseText}"`);
        }
        
        // Create results for each question in the batch
        batch.forEach((q, idx) => {
          results.push({
            answer: answers[idx] || "ERROR",
            correct: (answers[idx] || "").toUpperCase() === q.answer.toUpperCase(),
            tokens: Math.floor(totalTokens / batch.length), // Distribute tokens evenly
            time: Math.floor(duration / batch.length) // Distribute time evenly
          });
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Handle abort signal specifically
        if (error instanceof Error && error.name === 'AbortError') {
          batch.forEach(() => {
            results.push({
              answer: "",  // Empty instead of "ABORTED"
              correct: false,
              tokens: 0,
              time: 0,
              aborted: true  // Flag to indicate this was aborted
            });
          });
        } else {
          // Log the API error for the batch before rethrowing for auto-pause
          const errorMessage = error instanceof Error ? error.message : String(error);
          const batchQuestions = batch.map(q => q.question).join('; ');
          setApiLogs(prev => [...prev, {
            timestamp: Date.now(),
            provider: model.provider,
            model: model.name,
            request: { batchQuestions, temperature },
            response: `API Error: ${errorMessage}`,
            error: errorMessage,
            duration: duration,
            question: `Batch of ${batch.length} questions: ${batchQuestions}`,
            questionId: batch.map(q => q.id).join(','),
            correctAnswer: batch.map(q => q.answer).join(','),
            temperature: temperature,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            showFullRequest: false,
          }]);
          
          // For all other errors (API failures, network issues, etc.), rethrow to trigger auto-pause
          throw error;
        }
      }
    }
    
    return results;
  };

  // Helper function to parse batched responses
  const parseAndResponseText = (text: string, expectedCount: number): string[] => {
    const answers: string[] = [];
    
    
    // Try to match numbered patterns (most common format)
    // This matches the number and captures whatever letter follows (even if invalid)
    const numberedPattern = /(?:^|\n)\s*(\d+)\.\s*(?:\()?([A-Za-z])(?:\))?/gim;
    const numberedMatches = Array.from(text.matchAll(numberedPattern));
    
    if (numberedMatches.length >= expectedCount) {
      
      // Take the first N matches and validate each answer
      numberedMatches.slice(0, expectedCount).forEach((match, idx) => {
        const letter = match[2].toUpperCase();
        
        // Always add the letter, even if invalid
        answers.push(letter);
        
        // Check if it's a valid answer (A-D) and log accordingly
        if (/^[A-D]$/.test(letter)) {
        } else {
        }
      });
      
      if (answers.length === expectedCount) {
        return answers;
      }
    }
    
    // If numbered pattern didn't work, try to extract just letters from lines starting with numbers
    const lines = text.split('\n');
    for (const line of lines) {
      if (answers.length >= expectedCount) break;
      
      // Match lines that start with a number followed by anything with a letter
      const lineMatch = line.match(/^\s*\d+[.):]\s*(?:\()?([A-D])\)?/i);
      if (lineMatch) {
        answers.push(lineMatch[1].toUpperCase());
      }
    }
    
    if (answers.length >= expectedCount) {
      return answers.slice(0, expectedCount);
    }
    
    // Try other patterns
    const patterns = [
      { regex: /(?:^|\n)\s*\d+\)\s*([A-D])\b/gim, name: "Number paren Letter (1) A)" },
      { regex: /Question\s+\d+:\s*([A-D])\b/gim, name: "Question N: Letter" },
      { regex: /Answer\s+\d+:\s*([A-D])\b/gim, name: "Answer N: Letter" },
      { regex: /\d+\.\s*Answer:\s*([A-D])\b/gim, name: "N. Answer: Letter" },
      { regex: /\d+\)\s*Answer:\s*([A-D])\b/gim, name: "N) Answer: Letter" },
    ];
    
    for (const {regex, name} of patterns) {
      const matches = text.match(regex);
      
      if (matches && matches.length >= expectedCount) {
        
        matches.slice(0, expectedCount).forEach(match => {
          const letter = match.match(/([A-D])/i)?.[1];
          if (letter) {
            answers.push(letter.toUpperCase());
          }
        });
        
        if (answers.length === expectedCount) {
          return answers;
        }
        // Reset if not enough
        answers.length = 0;
      }
    }
    
    // Last resort: try to find any A-D letters in the text
    const letters = text.match(/\b([A-D])\b/gi);
    
    if (letters && letters.length >= expectedCount) {
      const result = letters.slice(0, expectedCount).map(l => l.toUpperCase());
      return result;
    }
    
    // Ultra fallback: Look for letters without word boundaries (more permissive)
    const looseLetters = text.match(/([A-D])/gi);
    
    if (looseLetters && looseLetters.length >= expectedCount) {
      const result = looseLetters.slice(0, expectedCount).map(l => l.toUpperCase());
      return result;
    }
    
    // If we can't parse, return ERROR for all
    return Array(expectedCount).fill("ERROR");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset pause/resume state when new file is loaded
    if (isPaused || evaluationState) {
      setIsPaused(false);
      setShouldPauseEvaluation(false);
      shouldPauseRef.current = false;
      setEvaluationState(null);
      setTrialResults([]); // Clear previous results
      setResults([]);
      setApiLogs([]);
      
      toast({
        title: "New File Loaded",
        description: "Previous evaluation state has been cleared. You can start a fresh evaluation.",
        status: "info",
        duration: 3000,
      });
    }

    setSelectedFile(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      // Handle both Windows (\r\n) and Unix (\n) line endings
      const lines = content.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim().length > 0);
      
      // Verify the file has the required headers in any position
      if (lines.length > 0) {
        
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
            hasId = true;
            hasQuestion = true;
            hasCorrectAnswer = true;
          }
        }
        
        const missingColumns = [];
        if (!hasId) missingColumns.push("ID");
        if (!hasQuestion) missingColumns.push("Question");
        if (!hasCorrectAnswer) missingColumns.push("Correct");
        
        if (missingColumns.length > 0) {
          const missingColumnsStr = missingColumns.join(", ");
          toast({
            title: "Missing required columns",
            description: `CSV is missing: ${missingColumnsStr}. Required columns: ID, Question, and Correct. Optional: Class/Category/Group/Step.`,
            status: "warning",
            duration: 5000,
          });
        } else {
          // Check if class column exists for informational message
          const hasClass = headerParts.some(h => 
            h === 'class' || h === 'category' || h === 'catogory' || h === 'group' || h === 'step'
          );
          
          // Update state to track class column availability
          setHasClassColumn(hasClass);
          
          toast({
            title: "CSV file loaded",
            description: `Successfully loaded CSV with ${lines.length - 1} questions${hasClass ? ' (with classification)' : ''}`,
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
          const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout for model fetching
          
          try {
            const modelsEndpoint = `${baseUrl}/models`;
            console.log(`[Models Fetch] Provider: ${provider}, Endpoint: ${modelsEndpoint}`);
            
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                endpoint: modelsEndpoint,
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json'
                }
              }),
              signal: controller.signal
            });
          
          if (!response.ok) {
            // Handle specific error codes with more detailed information
            if (response.status === 401) {
              const errorMessage = `Authentication failed (401) for ${provider}: Invalid or expired API key`;
              console.error(`[Models Fetch Error] ${errorMessage}`);
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
                console.error(`[Models Fetch Error] Status ${response.status}: ${errorData}`);
              } catch {
              }
            }
            
            // For non-401 errors, throw to trigger catch block with fallback
            throw new Error(`API returned status ${response.status}`);
          }
          
          const data = await response.json();
          const providerModels: Model[] = [];
          
          // Handle different response formats from different providers
          const modelsList = data.data || data.models || data || [];
          const modelsArray = Array.isArray(modelsList) ? modelsList : [];
          
          if (modelsArray.length === 0 && provider === 'deepseek') {
            throw new Error('No models returned from DeepSeek API');
          }
          
          modelsArray.forEach((model: any) => {
            // Check if model.id already contains the provider name to avoid duplication
            const modelAlreadyHasProvider = model.id.toLowerCase().includes(provider.toLowerCase());
            const baseId = modelAlreadyHasProvider ? `provider-${provider}-${model.id}` : `${provider}-${model.id}`;
            
            // Check if this is a GPT-5 model that supports reasoning_effort
            // Matches: gpt-5, gpt-5-2025-08-07, etc.
            const isGPT5BaseModel = /^gpt-5(-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            
            // Matches: gpt-5-mini, gpt-5-nano, gpt-5-mini-2025-08-07, gpt-5-nano-2025-08-07, etc.
            const isGPT5MiniOrNano = /^gpt-5-(mini|nano)(-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            
            // Check if this is an O-series model that supports reasoning_effort (excluding o1-mini)
            // Matches: o1, o3, o3-mini, o4-mini, o1-2024-12-17, o3-2024-12-17, o3-mini-2024-12-17, etc.
            const isOSeriesWithReasoning = /^(o1|o3|o3-mini|o4-mini)(-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            
            if (provider === 'openai') {
              if (isGPT5BaseModel) {
                // GPT-5 base model has minimal/low/medium/high options
                const reasoningEfforts = [
                  { effort: 'minimal', suffix: ' (Minimal reasoning)' },
                  { effort: 'low', suffix: ' (Low reasoning)' },
                  { effort: 'medium', suffix: ' (Medium reasoning - Default)' },
                  { effort: 'high', suffix: ' (High reasoning)' }
                ];
                
                reasoningEfforts.forEach(({ effort, suffix }) => {
                  providerModels.push({
                    id: `${baseId}-${effort}`,
                    name: `${model.id}${suffix}`,
                    provider: provider,
                    apiModelId: model.id,
                    reasoningEffort: effort
                  });
                });
              } else if (isGPT5MiniOrNano) {
                // GPT-5-mini and GPT-5-nano have minimal/low/medium/high options
                const reasoningEfforts = [
                  { effort: 'minimal', suffix: ' (Minimal reasoning)' },
                  { effort: 'low', suffix: ' (Low reasoning)' },
                  { effort: 'medium', suffix: ' (Medium reasoning - Default)' },
                  { effort: 'high', suffix: ' (High reasoning)' }
                ];
                
                reasoningEfforts.forEach(({ effort, suffix }) => {
                  providerModels.push({
                    id: `${baseId}-${effort}`,
                    name: `${model.id}${suffix}`,
                    provider: provider,
                    apiModelId: model.id,
                    reasoningEffort: effort
                  });
                });
              } else if (isOSeriesWithReasoning) {
                // O-series models (o1, o3, o3-mini, o4-mini) have low/medium/high options
                const reasoningEfforts = [
                  { effort: 'low', suffix: ' (Low reasoning)' },
                  { effort: 'medium', suffix: ' (Medium reasoning - Default)' },
                  { effort: 'high', suffix: ' (High reasoning)' }
                ];
                
                reasoningEfforts.forEach(({ effort, suffix }) => {
                  providerModels.push({
                    id: `${baseId}-${effort}`,
                    name: `${model.id}${suffix}`,
                    provider: provider,
                    apiModelId: model.id,
                    reasoningEffort: effort
                  });
                });
              } else {
                // Regular model without reasoning effort variants
                providerModels.push({
                  id: baseId,
                  name: model.id,
                  provider: provider,
                  apiModelId: model.id,
                });
              }
            } else {
              // Non-OpenAI providers - regular models
              providerModels.push({
                id: baseId,
                name: model.id,
                provider: provider,
                apiModelId: model.id,
              });
            }
          });
          
          newModels = [...newModels, ...providerModels];
          totalModelCount += providerModels.length;
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error) {
          
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
          
          // If DeepSeek fails to fetch models, add default models
          if (provider === 'deepseek') {
            console.log('DeepSeek API fetch failed, using default models');
            const deepseekModels = [
              { id: 'deepseek-chat', name: 'DeepSeek Chat' },
              { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
            ];
            
            deepseekModels.forEach(model => {
              newModels.push({
                id: `deepseek-${model.id}`,
                name: model.name,
                provider: 'deepseek',
                apiModelId: model.id,
              });
            });
            
            totalModelCount += deepseekModels.length;
            
            toast({
              title: `Using Default DeepSeek Models`,
              description: `Could not fetch models from API. Using default DeepSeek models instead.`,
              status: "info",
              duration: 3000,
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
      }
      
      toast({
        title: `Models loaded`,
        description: `${totalModelCount} models available from ${configsToVerify.length} API configuration(s)`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
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

  // Debug logging on every render

  return (
    <Flex h="100vh">
      {/* Global loading indicator */}
      {isProcessing && (
        <Box 
          position="fixed" 
          top="0" 
          left="0" 
          right="0" 
          bg="blue.500" 
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
        bg="blue.50"
        p={6}
        borderRight="1px"
        borderColor="blue.100"
        position="fixed"
        h="100vh"
        left={0}
        top={0}
        zIndex={1000}
      >
        <VStack spacing={6} align="stretch">
          <Box mb={5}>
            <Heading size="md" color="blue.700" mb={1}>LLM Evaluation</Heading>
            <Text fontSize="sm" color="blue.600">Accuracy vs Consistency</Text>
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
                  <Box p={1} bg="blue.100" borderRadius="md">
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
                _hover={{ bg: "blue.100" }}
                color="blue.700"
                fontSize="sm"
                fontWeight="medium"
              >
                {item.title}
              </Button>
            ))}
          </VStack>
          
          {/* API Configuration Section */}
          <Box mt="auto" pt={7} borderTop="1px" borderColor="blue.100" className="api-config-section">
            <VStack spacing={2} align="stretch">
              <Text fontSize="s" fontWeight="600" color="blue.700" mb={1}>Load API Models</Text>

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
                colorScheme="blue"
                onClick={addApiConfig}
                isLoading={isLoading}
                mb={3}
              >
                Load API Models
              </Button>

              <Box mt={2}>
                <HStack justify="space-between" align="center">
                  <Text fontSize="xs" fontWeight="bold" color="blue.700" mb={2}>
                    Saved Configurations
                  </Text>
                  <HStack spacing={1}>
                    {storedApiConfigs.length > 0 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="blue"
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
                    <Text fontSize="xs" color="blue.500" fontWeight="medium">
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
                        <Text fontWeight="medium" color="blue.600" ml={1}>OpenAI</Text>
                        <Text mx={1}>•</Text>
                        <Text fontWeight="medium" color="blue.600">DeepSeek</Text>
                        <Text mx={1}>•</Text>
                        <Text fontWeight="medium" color="blue.600">OpenWebUI</Text>
                      </HStack>
                    </VStack>
                  </Box>
                ) : (
                  <VStack spacing={1.5} align="stretch">
                    {storedApiConfigs.map((config) => (
                      <Box
                        key={config.id}
                        bg="blue.50"
                        borderRadius="md"
                        fontSize="xs"
                        py={1.5}
                        px={2}
                        position="relative"
                        pr={7}
                        borderWidth="1px"
                        fontWeight={"medium"}
                        borderColor="blue.200"
                        _hover={{
                          borderColor: "blue.300",
                          bg: "blue.75"
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
                            <Text fontWeight="bold" color="blue.700">
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
                            color="blue.600"
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
                            color="blue.600"
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
          borderColor="blue.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="blue.100" borderRadius="md">
              <Text fontSize="sm" color="blue.600">🤖</Text>
            </Box>
            <Heading size="sm">Add Large Language Models (LLMs)</Heading>
          </HStack>

          <Box>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <HStack spacing={4} align="center">
                  <FormLabel fontWeight="medium" fontSize="sm" mb={0} minW="fit-content">
                    Select Models from Available API Configurations
                  </FormLabel>
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
                </HStack>
              </FormControl>

              {selectedModels.length > 0 && (
                <Box>
                  <Text fontWeight="medium" fontSize="sm" mb={1.5}>Selected Models:</Text>
                  <Flex wrap="wrap" gap={2}>
                    {selectedModels.map((model, index) => {
                      // Check if this model has a valid API key
                      const hasValidKey = getActiveApiKeyForProvider(model.provider as Provider) !== null;
                      return (
                        <Box
                          key={model.id}
                          bg={hasValidKey ? "blue.50" : "yellow.50"}
                          border="1px"
                          borderColor={hasValidKey ? "blue.200" : "yellow.300"}
                          borderRadius="md"
                          px={3}
                          py={1.5}
                        >
                          <HStack spacing={2} align="center">
                            <Text fontSize="xs" color={hasValidKey ? "blue.700" : "yellow.700"}>
                              <Text as="span" color={hasValidKey ? "blue.500" : "yellow.600"} mr={1}>{index + 1}.</Text>
                              <Text as="span" color={hasValidKey ? "blue.500" : "yellow.600"}>{model.provider}/</Text>
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
                                colorScheme={hasValidKey ? "blue" : "yellow"}
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
          borderColor="blue.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={8} align="flex-start">
            {/* Left Column */}
            <VStack spacing={4} align="stretch" flex="1">
              <HStack spacing={2}>
                <Box p={1.5} bg="blue.100" borderRadius="md">
                  <Text fontSize="sm" color="blue.600">📝</Text>
                </Box>
                <Heading size="sm">MCQ Database</Heading>
              </HStack>

              <Box>
                <Text fontSize="md" color="gray.700" fontWeight="medium" mb={1}>
                  Question Database File
                </Text>
                <Text fontSize="sm" color="gray.500">
                  Upload a CSV file with columns: ID, Question, and Correct (in any order)
                </Text>
              </Box>

              <Button
                leftIcon={<AttachmentIcon />}
                colorScheme="blue"
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
                <Box bg="blue.50" p={4} borderRadius="md" borderWidth="1px" borderColor="blue.200">
                  <VStack align="stretch" spacing={2}>
                    <Box>
                      <Text fontSize="sm" color="blue.600" mb={0.5}>Current File</Text>
                      <Text fontSize="md" color="blue.900" fontWeight="medium">
                        {selectedFile.name}
                      </Text>
                    </Box>
                    
                    <Box>
                      <Text fontSize="sm" color="blue.600" mb={0.5}>Question Count</Text>
                      <Text fontSize="xl" color="blue.700" fontWeight="bold" display="inline">
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
          borderColor="blue.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="blue.100" borderRadius="md">
              <Text fontSize="sm" color="blue.600">⚙️</Text>
            </Box>
            <Heading size="sm">LLMs Configuration</Heading>
          </HStack>

          <VStack spacing={4} align="stretch">
            <HStack spacing={8} align="flex-start">
              <VStack spacing={4} align="stretch" flex="2">
                <FormControl>
                  <FormLabel fontSize="sm">Temperature: {temperature}</FormLabel>
                  <Slider
                    value={temperature}
                    onChange={setTemperature}
                    min={0}
                    max={2}
                    step={0.1}
                    colorScheme="blue"
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

                <Box mt={2}>
                  <HStack spacing={3}>
                    <Button
                      colorScheme="blue"
                      maxW="250px"
                      isDisabled={(isEvaluating && !(isPaused && evaluationState)) || selectedModels.length === 0 || (!selectedFile && !(isPaused && evaluationState))}
                      size="md"
                      leftIcon={<TriangleUpIcon transform="rotate(90deg)" boxSize={3} />}
                      onClick={isPaused && evaluationState ? resumeEvaluation : startEvaluation}
                      isLoading={isEvaluating && !shouldStopEvaluation && !isPaused}
                      loadingText="Running..."
                    >
                      {isPaused && evaluationState ? "Resume" : "Start Evaluation"}
                    </Button>
                    <Button
                      variant="outline"
                      colorScheme="orange"
                      size="md"
                      onClick={() => {
                        pauseEvaluation();
                      }}
                      isDisabled={!isEvaluating || isPaused || shouldPauseEvaluation}
                      minW="100px"
                      _hover={{ bg: isEvaluating && !isPaused ? "orange.50" : undefined }}
                    >
                      {shouldPauseEvaluation ? "Pausing..." : isPaused ? "Paused" : "Pause"}
                    </Button>
                    <Button
                      variant="ghost"
                      colorScheme="red"
                      size="md"
                      onClick={() => {
                        stopEvaluation();
                      }}
                      isDisabled={!isEvaluating && !isPaused}
                      opacity={(!isEvaluating && !isPaused) ? 0.3 : shouldStopEvaluation ? 0.6 : 1}
                      minW="100px"
                      _hover={{ bg: (isEvaluating || isPaused) ? "red.50" : undefined }}
                    >
                      {shouldStopEvaluation ? "Stopping..." : "Stop"}
                    </Button>
                  </HStack>
                </Box>
              </VStack>

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
            </HStack>

            <Box mt={4}>
              {isEvaluating && (
                <Box w="100%" maxW="300px" mt={3}>
                  <Text fontSize="sm" color="blue.600" mb={1}>
                    Progress: {Math.round((progress.current / progress.total) * 100)}%
                  </Text>
                  <Box w="full" h="2px" bg="blue.100" borderRadius="full" overflow="hidden">
                    <Box
                      w={`${(progress.current / progress.total) * 100}%`}
                      h="full"
                      bg="blue.500"
                      transition="width 0.3s ease-in-out"
                    />
                  </Box>
                </Box>
              )}
            </Box>
          </VStack>
        </Box>

        <Box 
          id="evaluation"
          p={6} 
          borderRadius="lg" 
          bg="white" 
          boxShadow="lg" 
          border="1px" 
          borderColor="blue.100"
          scroll-margin-top="2rem"
          mb={9}
        >
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="blue.100" borderRadius="md">
              <Text fontSize="sm" color="blue.600">📊</Text>
            </Box>
            <Heading size="sm">Evaluation Results</Heading>
          </HStack>

          {results.length === 0 && trialResults.length === 0 ? (
            <Box 
              bg="blue.50" 
              p={8} 
              borderRadius="md" 
              borderWidth="1px" 
              borderColor="blue.200"
              textAlign="center"
            >
              <VStack spacing={4}>
                <Box
                  w="48px"
                  h="48px"
                  bg="blue.100"
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
                  <Text fontSize="lg" fontWeight="medium" color="blue.700">
                    No evaluation results yet
                  </Text>
                  <Text fontSize="sm" color="blue.600">
                    Results will appear here once you start the evaluation
                  </Text>
                </VStack>
              </VStack>
            </Box>
          ) : (
            <Box>
              {/* Tab Navigation with Export Button */}
              <HStack spacing={2} mb={6} overflowX="auto" pb={2} justifyContent="space-between">
                <HStack spacing={2}>
                  {[
                    { id: 'results', label: 'Results' },
                    { id: 'summary', label: 'Summary and Charts' },
                    { id: 'logs', label: 'API Logs' }
                  ].map(tab => (
                    <Button
                      key={tab.id}
                      size="sm"
                      variant={activeResultTab === tab.id ? "solid" : "outline"}
                      colorScheme="blue"
                      borderRadius="full"
                      px={6}
                      onClick={() => setActiveResultTab(tab.id as "results" | "summary" | "logs")}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </HStack>
              </HStack>
              
              {/* Results Tab Content */}
              {activeResultTab === "results" && (
                <>
                  <HStack justify="flex-end" mb={3}>
                    <Button
                      size="xs"
                      colorScheme="blue"
                      variant="outline"
                      onClick={exportToExcel}
                      isDisabled={trialResults.length === 0}
                    >
                      Export to CSV
                    </Button>
                  </HStack>
                <Box overflowX="auto" maxW="100%" sx={{ 
                  '&::-webkit-scrollbar': {
                    height: '8px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: '#f1f1f1',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: '#888',
                    borderRadius: '4px',
                  },
                  '&::-webkit-scrollbar-thumb:hover': {
                    background: '#555',
                  },
                }}>
                  {trialResults.length > 0 ? (
                    <Table variant="simple" size="sm" width="max-content" minW="100%">
                      <Thead>
                        <Tr>
                          <Th rowSpan={2} borderRight="1px" borderColor="gray.200" fontSize="10px" minW="30px" maxW="40px">#</Th>
                          {hasClassColumn && (
                            <Th rowSpan={2} borderRight="1px" borderColor="gray.200" fontSize="10px" minW="60px" maxW="80px">Class</Th>
                          )}
                          <Th rowSpan={2} borderRight="1px" borderColor="gray.200" fontSize="10px" minW="150px" maxW="250px">Question</Th>
                          <Th rowSpan={2} borderRight="1px" borderColor="gray.200" fontSize="10px" minW="40px" maxW="50px">Len<br/>(Char)</Th>
                          <Th rowSpan={2} borderRight="2px" borderColor="gray.300" fontSize="10px" minW="40px" maxW="50px">Correct</Th>
                          {selectedModels.map((model) => (
                            <Th key={model.id} colSpan={6} textAlign="center" borderRight="2px" borderColor="gray.400" bg="blue.50" fontSize="xs">
                              {model.name}
                            </Th>
                          ))}
                        </Tr>
                        <Tr>
                          {selectedModels.map((model) => (
                            <Fragment key={`${model.id}-headers`}>
                              <Th fontSize="10px" borderRight="1px" borderColor="gray.100" minW="35px" maxW="45px">Tokens</Th>
                              <Th fontSize="10px" borderRight="1px" borderColor="gray.100" minW="35px" maxW="45px">TTFT<br/>(ms)</Th>
                              <Th fontSize="10px" borderRight="1px" borderColor="gray.100" bg="green.50" minW="25px" maxW="35px">T1</Th>
                              <Th fontSize="10px" borderRight="1px" borderColor="gray.100" bg="blue.50" minW="25px" maxW="35px">T2</Th>
                              <Th fontSize="10px" borderRight="1px" borderColor="gray.100" bg="blue.50" minW="25px" maxW="35px">T3</Th>
                              <Th fontSize="10px" borderRight="2px" borderColor="gray.400" bg="orange.50" minW="35px" maxW="45px">%<br/>of 10</Th>
                            </Fragment>
                          ))}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {trialResults.map((result, index) => (
                          <Tr key={`result-${index}`} _hover={{ bg: "gray.50" }}>
                            <Td borderRight="1px" borderColor="gray.200" fontWeight="medium" fontSize="xs">{index + 1}</Td>
                            {hasClassColumn && (
                              <Td borderRight="1px" borderColor="gray.200" fontSize="xs" maxW="80px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                                {result.class || '-'}
                              </Td>
                            )}
                            <Td borderRight="1px" borderColor="gray.200" maxW="200px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="xs">
                              {result.question}
                            </Td>
                            <Td borderRight="1px" borderColor="gray.200" fontSize="xs">{result.length}</Td>
                            <Td borderRight="2px" borderColor="gray.300" fontSize="xs" fontWeight="bold">{result.correctAnswer}</Td>
                            {selectedModels.map((model) => {
                              const modelResult = result.modelResults[model.id];
                              if (!modelResult) {
                                return (
                                  <Fragment key={`${model.id}-cells-empty`}>
                                    <Td borderRight="1px" borderColor="gray.100" fontSize="xs">-</Td>
                                    <Td borderRight="1px" borderColor="gray.100" fontSize="xs">-</Td>
                                    <Td borderRight="1px" borderColor="gray.100" fontSize="xs" bg="green.50">-</Td>
                                    <Td borderRight="1px" borderColor="gray.100" fontSize="xs" bg="blue.50">-</Td>
                                    <Td borderRight="1px" borderColor="gray.100" fontSize="xs" bg="blue.50">-</Td>
                                    <Td borderRight="2px" borderColor="gray.400" fontSize="xs" bg="orange.50">-</Td>
                                  </Fragment>
                                );
                              }
                              
                              return (
                                <Fragment key={`${model.id}-cells`}>
                                  <Td borderRight="1px" borderColor="gray.100" fontSize="xs">
                                    {modelResult.trial1?.tokens || '-'}
                                  </Td>
                                  <Td borderRight="1px" borderColor="gray.100" fontSize="xs">
                                    {modelResult.trial1?.time || '-'}
                                  </Td>
                                  <Td 
                                    borderRight="1px" 
                                    borderColor="gray.100" 
                                    fontSize="xs" 
                                    fontWeight="bold"
                                    bg={modelResult.trial1?.aborted || !modelResult.trial1?.answer ? "white" : modelResult.trial1?.correct ? "green.100" : "red.100"}
                                    maxW="60px"
                                    overflow="hidden"
                                    textOverflow="ellipsis"
                                    whiteSpace="nowrap"
                                    title={modelResult.trial1?.answer || '-'}
                                  >
                                    {modelResult.trial1?.answer || '-'}
                                  </Td>
                                  <Td 
                                    borderRight="1px" 
                                    borderColor="gray.100" 
                                    fontSize="xs" 
                                    fontWeight="bold"
                                    bg={modelResult.trial2?.aborted || !modelResult.trial2?.answer ? "white" : modelResult.trial2?.correct ? "green.100" : "red.100"}
                                    maxW="60px"
                                    overflow="hidden"
                                    textOverflow="ellipsis"
                                    whiteSpace="nowrap"
                                    title={modelResult.trial2?.answer || '-'}
                                  >
                                    {modelResult.trial2?.answer || '-'}
                                  </Td>
                                  <Td 
                                    borderRight="1px" 
                                    borderColor="gray.100" 
                                    fontSize="xs" 
                                    fontWeight="bold"
                                    bg={modelResult.trial3?.aborted || !modelResult.trial3?.answer ? "white" : modelResult.trial3?.correct ? "green.100" : "red.100"}
                                    maxW="60px"
                                    overflow="hidden"
                                    textOverflow="ellipsis"
                                    whiteSpace="nowrap"
                                    title={modelResult.trial3?.answer || '-'}
                                  >
                                    {modelResult.trial3?.answer || '-'}
                                  </Td>
                                  <Td 
                                    borderRight="2px" 
                                    borderColor="gray.400" 
                                    fontSize="xs"
                                    fontWeight="bold"
                                    bg={modelResult.isInconsistent ? "orange.100" : "white"}
                                  >
                                    {modelResult.correctPercentage !== undefined 
                                      ? `${Math.round(modelResult.correctPercentage)}%`
                                      : '-'
                                    }
                                  </Td>
                                </Fragment>
                              );
                            })}
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  ) : results.length > 0 ? (
                    // Fallback to old results format if using old evaluation
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
                        {results.map((result, index) => (
                          <Tr key={`summary-${index}`}>
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
                  ) : (
                    <Box p={8} textAlign="center">
                      <Text color="gray.500">No results yet. Start an evaluation to see results.</Text>
                    </Box>
                  )}
                </Box>
                </>
              )}
              
              {/* Summary and Charts Tab Content */}
              {activeResultTab === "summary" && (
                <Box>
                  {/* Title and View Tabs */}
                  <VStack spacing={4} align="stretch">
                    {/* Title */}
                    <Text fontSize="lg" fontWeight="bold">Overall Accuracy</Text>
                    
                    {/* View Selector Tabs with Chart Type Selector and Export */}
                    <HStack spacing={2} wrap="wrap" justify="space-between">
                      <HStack spacing={2}>
                        <Button
                          size="xs"
                          variant={activeSummaryView === "table" ? "solid" : "outline"}
                          colorScheme="blue"
                          onClick={() => setActiveSummaryView("table")}
                        >
                          Table
                        </Button>
                        
                        {/* Chart Type Selector buttons appear directly after Table */}
                        {([
                          { id: 'bar' as const, label: 'Accuracy Per Trial' },
                          { id: 'comparison' as const, label: 'Overall Accuracy' }
                        ]).map(chartType => (
                          <Button
                            key={chartType.id}
                            size="xs"
                            variant={activeSummaryView === "charts" && activeChartType === chartType.id ? "solid" : "outline"}
                            colorScheme="blue"
                            onClick={() => {
                              setActiveSummaryView("charts");
                              setActiveChartType(chartType.id);
                            }}
                          >
                            {chartType.label}
                          </Button>
                        ))}
                      </HStack>
                      
                      {/* Export Button */}
                      {activeSummaryView === "table" ? (
                        <Button
                          size="xs"
                          colorScheme="blue"
                          variant="outline"
                          onClick={exportTableData}
                          isDisabled={trialResults.length === 0}
                        >
                          Export Table
                        </Button>
                      ) : (
                        <Menu>
                          <MenuButton
                            as={Button}
                            size="xs"
                            colorScheme="blue"
                            variant="outline"
                            rightIcon={<ChevronDownIcon />}
                            isDisabled={trialResults.length === 0}
                          >
                            Export Chart
                          </MenuButton>
                          <MenuList minW="auto" fontSize="sm">
                            <MenuItem onClick={() => exportChartAsImage('png')} fontSize="sm">
                              Export as PNG
                            </MenuItem>
                            <MenuItem onClick={() => exportChartAsImage('svg')} fontSize="sm">
                              Export as SVG
                            </MenuItem>
                          </MenuList>
                        </Menu>
                      )}
                    </HStack>

                    {/* Combined Table and Charts View */}
                    {activeSummaryView === "table" && (
                      <VStack spacing={4} align="stretch" w="full">
                          {/* Overall Accuracy Table */}
                          {!hasClassColumn ? (
                            <Box borderWidth="1px" borderRadius="md" p={3} bg="white">
                            <Box overflowX="auto">
                              <Table size="sm" variant="simple">
                                <Thead>
                                  <Tr>
                                    <Th>Model</Th>
                                    <Th isNumeric>Trial 1</Th>
                                    <Th isNumeric>Trial 2</Th>
                                    <Th isNumeric>Trial 3</Th>
                                    <Th isNumeric>Average</Th>
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {selectedModels.map(model => {
                                    let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0;
                                    let total = 0;

                                    trialResults.forEach(qResult => {
                                      const modelResult = qResult.modelResults[model.id];
                                      if (modelResult) {
                                        total++;
                                        if (modelResult.trial1?.correct) trial1Correct++;
                                        if (modelResult.trial2?.correct) trial2Correct++;
                                        if (modelResult.trial3?.correct) trial3Correct++;
                                      }
                                    });

                                    const trial1Acc = total > 0 ? (trial1Correct / total) * 100 : 0;
                                    const trial2Acc = total > 0 ? (trial2Correct / total) * 100 : 0;
                                    const trial3Acc = total > 0 ? (trial3Correct / total) * 100 : 0;
                                    const avgAcc = (trial1Acc + trial2Acc + trial3Acc) / 3;

                                    return (
                                      <Tr key={model.id}>
                                        <Td fontWeight="medium">{model.name}</Td>
                                        <Td isNumeric>
                                          <Text color={trial1Acc >= 70 ? "green.600" : trial1Acc >= 50 ? "orange.600" : "red.600"}>
                                            {trial1Acc.toFixed(1)}%
                                          </Text>
                                        </Td>
                                        <Td isNumeric>
                                          <Text color={trial2Acc >= 70 ? "green.600" : trial2Acc >= 50 ? "orange.600" : "red.600"}>
                                            {trial2Acc.toFixed(1)}%
                                          </Text>
                                        </Td>
                                        <Td isNumeric>
                                          <Text color={trial3Acc >= 70 ? "green.600" : trial3Acc >= 50 ? "orange.600" : "red.600"}>
                                            {trial3Acc.toFixed(1)}%
                                          </Text>
                                        </Td>
                                        <Td isNumeric fontWeight="bold">
                                          <Text color={avgAcc >= 70 ? "green.600" : avgAcc >= 50 ? "orange.600" : "red.600"}>
                                            {avgAcc.toFixed(1)}%
                                          </Text>
                                        </Td>
                                      </Tr>
                                    );
                                  })}
                                </Tbody>
                              </Table>
                            </Box>
                          </Box>
                        ) : (
                          /* Overall Accuracy Table (same as non-class version) */
                          <Box borderWidth="1px" borderRadius="md" p={3} bg="white">
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple">
                              <Thead>
                                <Tr>
                                  <Th>Model</Th>
                                  <Th isNumeric>Trial 1</Th>
                                  <Th isNumeric>Trial 2</Th>
                                  <Th isNumeric>Trial 3</Th>
                                  <Th isNumeric>Average</Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {selectedModels.map(model => {
                                  let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0;
                                  let total = 0;

                                  trialResults.forEach(qResult => {
                                    const modelResult = qResult.modelResults[model.id];
                                    if (modelResult) {
                                      total++;
                                      if (modelResult.trial1?.correct) trial1Correct++;
                                      if (modelResult.trial2?.correct) trial2Correct++;
                                      if (modelResult.trial3?.correct) trial3Correct++;
                                    }
                                  });

                                  const trial1Acc = total > 0 ? (trial1Correct / total) * 100 : 0;
                                  const trial2Acc = total > 0 ? (trial2Correct / total) * 100 : 0;
                                  const trial3Acc = total > 0 ? (trial3Correct / total) * 100 : 0;
                                  const avgAcc = (trial1Acc + trial2Acc + trial3Acc) / 3;

                                  return (
                                    <Tr key={model.id}>
                                      <Td fontWeight="medium">{model.name}</Td>
                                      <Td isNumeric>
                                        <Text color={trial1Acc >= 70 ? "green.600" : trial1Acc >= 50 ? "orange.600" : "red.600"}>
                                          {trial1Acc.toFixed(1)}%
                                        </Text>
                                      </Td>
                                      <Td isNumeric>
                                        <Text color={trial2Acc >= 70 ? "green.600" : trial2Acc >= 50 ? "orange.600" : "red.600"}>
                                          {trial2Acc.toFixed(1)}%
                                        </Text>
                                      </Td>
                                      <Td isNumeric>
                                        <Text color={trial3Acc >= 70 ? "green.600" : trial3Acc >= 50 ? "orange.600" : "red.600"}>
                                          {trial3Acc.toFixed(1)}%
                                        </Text>
                                      </Td>
                                      <Td isNumeric fontWeight="bold">
                                        <Text color={avgAcc >= 70 ? "green.600" : avgAcc >= 50 ? "orange.600" : "red.600"}>
                                          {avgAcc.toFixed(1)}%
                                        </Text>
                                      </Td>
                                    </Tr>
                                  );
                                })}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                        )}
                        </VStack>
                    )}

                    {/* Charts View */}
                    {activeSummaryView === "charts" && (
                      <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                        <VStack spacing={4} align="stretch">
                          <Box id="chart-container">
                            {/* Vertical Bar Chart - All Models */}
                            {activeChartType === 'bar' && (
                              <Box>
                                <Box h="480px" position="relative" bg="white" p={4}>
                                  <Bar
                                    data={{
                                      labels: selectedModels.map(model => 
                                        model.name.length > 25 ? model.name.substring(0, 22) + '...' : model.name
                                      ),
                                      datasets: [
                                        {
                                          label: 'Trial 1',
                                          data: selectedModels.map(model => {
                                            let trial1Correct = 0, total = 0;
                                            trialResults.forEach(qResult => {
                                              const modelResult = qResult.modelResults[model.id];
                                              if (modelResult) {
                                                total++;
                                                if (modelResult.trial1?.correct) trial1Correct++;
                                              }
                                            });
                                            return total > 0 ? (trial1Correct / total) * 100 : 0;
                                          }),
                                          backgroundColor: '#3b82f6',
                                          borderColor: '#1e40af',
                                          borderWidth: 1,
                                        },
                                        {
                                          label: 'Trial 2',
                                          data: selectedModels.map(model => {
                                            let trial2Correct = 0, total = 0;
                                            trialResults.forEach(qResult => {
                                              const modelResult = qResult.modelResults[model.id];
                                              if (modelResult) {
                                                total++;
                                                if (modelResult.trial2?.correct) trial2Correct++;
                                              }
                                            });
                                            return total > 0 ? (trial2Correct / total) * 100 : 0;
                                          }),
                                          backgroundColor: '#10b981',
                                          borderColor: '#059669',
                                          borderWidth: 1,
                                        },
                                        {
                                          label: 'Trial 3',
                                          data: selectedModels.map(model => {
                                            let trial3Correct = 0, total = 0;
                                            trialResults.forEach(qResult => {
                                              const modelResult = qResult.modelResults[model.id];
                                              if (modelResult) {
                                                total++;
                                                if (modelResult.trial3?.correct) trial3Correct++;
                                              }
                                            });
                                            return total > 0 ? (trial3Correct / total) * 100 : 0;
                                          }),
                                          backgroundColor: '#f59e0b',
                                          borderColor: '#d97706',
                                          borderWidth: 1,
                                        },
                                      ],
                                    }}
                                    options={{
                                      responsive: true,
                                      maintainAspectRatio: false,
                                      plugins: {
                                        legend: {
                                          position: 'bottom' as const,
                                          labels: {
                                            font: {
                                              size: 12,
                                              weight: 600,
                                            },
                                            padding: 15,
                                          },
                                        },
                                        title: {
                                          display: true,
                                          text: 'Accuracy Per Trial',
                                          font: {
                                            size: 16,
                                            weight: 'bold',
                                          },
                                          padding: {
                                            bottom: 20,
                                          },
                                        },
                                        tooltip: {
                                          callbacks: {
                                            label: function(context) {
                                              return `${context.dataset.label}: ${context.parsed.y?.toFixed(1) ?? 0}%`;
                                            }
                                          }
                                        }
                                      },
                                      scales: {
                                        y: {
                                          beginAtZero: true,
                                          max: 100,
                                          ticks: {
                                            callback: function(value) {
                                              return value + '%';
                                            },
                                            font: {
                                              size: 12,
                                            },
                                          },
                                          grid: {
                                            color: '#ddd',
                                          },
                                        },
                                        x: {
                                          ticks: {
                                            font: {
                                              size: 11,
                                              weight: 600,
                                            },
                                          },
                                          grid: {
                                            display: false,
                                          },
                                        },
                                      },
                                    }}
                                  />
                                </Box>
                              </Box>
                            )}

                            {/* Model Comparison Chart - Vertical Bars for Overall Accuracy */}
                            {activeChartType === 'comparison' && (
                              <Box>
                                <Box h="480px" position="relative" bg="white" p={4}>
                                  <Bar
                                    data={{
                                      labels: selectedModels.map(model => 
                                        model.name.length > 20 ? model.name.substring(0, 17) + '...' : model.name
                                      ),
                                      datasets: [
                                        {
                                          label: 'Overall Accuracy',
                                          data: selectedModels.map(model => {
                                            let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0, total = 0;
                                            trialResults.forEach(qResult => {
                                              const modelResult = qResult.modelResults[model.id];
                                              if (modelResult) {
                                                total++;
                                                if (modelResult.trial1?.correct) trial1Correct++;
                                                if (modelResult.trial2?.correct) trial2Correct++;
                                                if (modelResult.trial3?.correct) trial3Correct++;
                                              }
                                            });
                                            return total > 0 ? ((trial1Correct + trial2Correct + trial3Correct) / (total * 3)) * 100 : 0;
                                          }),
                                          backgroundColor: selectedModels.map((model, idx) => {
                                            // Generate gradient colors from blue to purple
                                            const colors = [
                                              '#3b82f6', // Blue
                                              '#6366f1', // Indigo
                                              '#8b5cf6', // Purple
                                              '#a855f7', // Purple
                                              '#d946ef', // Fuchsia
                                              '#ec4899', // Pink
                                              '#f43f5e', // Rose
                                              '#ef4444', // Red
                                              '#f97316', // Orange
                                              '#f59e0b', // Amber
                                              '#eab308', // Yellow
                                              '#84cc16', // Lime
                                              '#22c55e', // Green
                                              '#10b981', // Emerald
                                              '#14b8a6', // Teal
                                              '#06b6d4', // Cyan
                                            ];
                                            return colors[idx % colors.length];
                                          }),
                                          borderColor: selectedModels.map((model, idx) => {
                                            // Generate gradient border colors (darker versions)
                                            const colors = [
                                              '#2563eb', // Blue
                                              '#4f46e5', // Indigo
                                              '#7c3aed', // Purple
                                              '#9333ea', // Purple
                                              '#c026d3', // Fuchsia
                                              '#db2777', // Pink
                                              '#e11d48', // Rose
                                              '#dc2626', // Red
                                              '#ea580c', // Orange
                                              '#d97706', // Amber
                                              '#ca8a04', // Yellow
                                              '#65a30d', // Lime
                                              '#16a34a', // Green
                                              '#059669', // Emerald
                                              '#0d9488', // Teal
                                              '#0891b2', // Cyan
                                            ];
                                            return colors[idx % colors.length];
                                          }),
                                          borderWidth: 2,
                                          borderRadius: 3,
                                        },
                                      ],
                                    }}
                                    options={{
                                      responsive: true,
                                      maintainAspectRatio: false,
                                      plugins: {
                                        legend: {
                                          display: false,
                                        },
                                        title: {
                                          display: true,
                                          text: 'Overall Accuracy',
                                          font: {
                                            size: 16,
                                            weight: 'bold',
                                          },
                                          padding: {
                                            bottom: 20,
                                          },
                                        },
                                        tooltip: {
                                          callbacks: {
                                            label: function(context) {
                                              const value = context.parsed.y ?? 0;
                                              return `Accuracy: ${value.toFixed(1)}%`;
                                            }
                                          }
                                        }
                                      },
                                      scales: {
                                        y: {
                                          beginAtZero: true,
                                          max: 100,
                                          title: {
                                            display: true,
                                            text: 'Overall Accuracy (%)',
                                            font: {
                                              size: 13,
                                              weight: 'bold',
                                            },
                                          },
                                          ticks: {
                                            callback: function(value) {
                                              return value + '%';
                                            },
                                            font: {
                                              size: 12,
                                            },
                                          },
                                          grid: {
                                            color: '#ddd',
                                          },
                                        },
                                        x: {
                                          ticks: {
                                            font: {
                                              size: 11,
                                              weight: 600,
                                            },
                                            maxRotation: 15,
                                            minRotation: 15,
                                          },
                                          grid: {
                                            display: false,
                                          },
                                        },
                                      },
                                    }}
                                  />
                                </Box>
                              </Box>
                            )}
                          </Box>
                        </VStack>
                      </Box>
                    )}
                  </VStack>
                </Box>
              )}
              
              {/* Accuracy Per Question Class Section */}
              {activeResultTab === "summary" && hasClassColumn && (
                <Box mt={6}>
                  <VStack spacing={4} align="stretch">
                    {/* Title */}
                    <Text fontSize="lg" fontWeight="bold">Accuracy Per Question Class</Text>
                    
                    {/* View Selector Tabs with Chart Type Selector and Export */}
                    <HStack spacing={2} wrap="wrap" justify="space-between">
                      <HStack spacing={2}>
                        <Button
                          size="xs"
                          variant={activeClassView === "table" ? "solid" : "outline"}
                          colorScheme="blue"
                          onClick={() => setActiveClassView("table")}
                        >
                          Table
                        </Button>
                        
                        {/* Chart Type Selector buttons appear directly after Table */}
                        {([
                          { id: 'by-class' as const, label: 'Accuracy Per Model by Class' },
                          { id: 'by-class-and-trial' as const, label: 'Average Accuracy by Class and Model' }
                        ]).map(chartType => (
                          <Button
                            key={chartType.id}
                            size="xs"
                            variant={activeClassView === "charts" && activeClassChartType === chartType.id ? "solid" : "outline"}
                            colorScheme="blue"
                            onClick={() => {
                              setActiveClassView("charts");
                              setActiveClassChartType(chartType.id);
                            }}
                          >
                            {chartType.label}
                          </Button>
                        ))}
                      </HStack>
                      
                      {/* Export Button */}
                      {activeClassView === "table" ? (
                        <Button
                          size="xs"
                          colorScheme="blue"
                          variant="outline"
                          onClick={exportTableData}
                          isDisabled={trialResults.length === 0}
                        >
                          Export Table
                        </Button>
                      ) : (
                        <Menu>
                          <MenuButton
                            as={Button}
                            size="xs"
                            colorScheme="blue"
                            variant="outline"
                            rightIcon={<ChevronDownIcon />}
                            isDisabled={trialResults.length === 0}
                          >
                            Export Chart
                          </MenuButton>
                          <MenuList minW="auto" fontSize="sm">
                            <MenuItem onClick={() => exportChartAsImage('png')} fontSize="sm">
                              Export as PNG
                            </MenuItem>
                            <MenuItem onClick={() => exportChartAsImage('svg')} fontSize="sm">
                              Export as SVG
                            </MenuItem>
                          </MenuList>
                        </Menu>
                      )}
                    </HStack>

                    {/* Table View */}
                    {activeClassView === "table" && (
                      <VStack spacing={4} align="stretch" w="full">
                        {(() => {
                          const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort();
                          
                          return (
                            <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                              <Box overflowX="auto">
                                <Table size="sm" variant="simple">
                                  <Thead>
                                    <Tr>
                                      <Th rowSpan={2} borderBottom="2px" whiteSpace="nowrap">Model</Th>
                                      {classes.map(cls => (
                                        <Th key={cls} colSpan={4} textAlign="center" borderBottom="1px" whiteSpace="nowrap">
                                          {cls}
                                        </Th>
                                      ))}
                                      <Th rowSpan={2} textAlign="center" borderLeft="2px" borderBottom="2px" bg="blue.50" whiteSpace="nowrap">
                                        Avg
                                      </Th>
                                    </Tr>
                                    <Tr>
                                      {classes.map(cls => (
                                        <Fragment key={`${cls}-headers`}>
                                          <Th fontSize="xs" textAlign="center" borderBottom="2px" whiteSpace="nowrap" width="1%">T1</Th>
                                          <Th fontSize="xs" textAlign="center" borderBottom="2px" whiteSpace="nowrap" width="1%">T2</Th>
                                          <Th fontSize="xs" textAlign="center" borderBottom="2px" whiteSpace="nowrap" width="1%">T3</Th>
                                          <Th fontSize="xs" textAlign="center" borderBottom="2px" borderRight="2px" whiteSpace="nowrap" width="1%">Avg</Th>
                                        </Fragment>
                                      ))}
                                    </Tr>
                                  </Thead>
                                  <Tbody>
                                    {selectedModels.map(model => {
                                      return (
                                        <Tr key={model.id}>
                                          <Td fontWeight="medium" borderRight="1px" whiteSpace="nowrap">{model.name}</Td>
                                          {classes.map(className => {
                                            let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0, total = 0;
                                            
                                            trialResults.forEach(qResult => {
                                              if (qResult.class === className) {
                                                const modelResult = qResult.modelResults[model.id];
                                                if (modelResult) {
                                                  total++;
                                                  if (modelResult.trial1?.correct) trial1Correct++;
                                                  if (modelResult.trial2?.correct) trial2Correct++;
                                                  if (modelResult.trial3?.correct) trial3Correct++;
                                                }
                                              }
                                            });
                                            
                                            const t1 = total > 0 ? (trial1Correct / total) * 100 : 0;
                                            const t2 = total > 0 ? (trial2Correct / total) * 100 : 0;
                                            const t3 = total > 0 ? (trial3Correct / total) * 100 : 0;
                                            const avg = (t1 + t2 + t3) / 3;
                                            
                                            return (
                                              <Fragment key={`${model.id}-${className}`}>
                                                <Td fontSize="xs" textAlign="center" whiteSpace="nowrap" width="1%">
                                                  <Text color={t1 >= 70 ? "green.600" : t1 >= 50 ? "orange.600" : "red.600"}>
                                                    {total > 0 ? t1.toFixed(1) : '-'}
                                                  </Text>
                                                </Td>
                                                <Td fontSize="xs" textAlign="center" whiteSpace="nowrap" width="1%">
                                                  <Text color={t2 >= 70 ? "green.600" : t2 >= 50 ? "orange.600" : "red.600"}>
                                                    {total > 0 ? t2.toFixed(1) : '-'}
                                                  </Text>
                                                </Td>
                                                <Td fontSize="xs" textAlign="center" whiteSpace="nowrap" width="1%">
                                                  <Text color={t3 >= 70 ? "green.600" : t3 >= 50 ? "orange.600" : "red.600"}>
                                                    {total > 0 ? t3.toFixed(1) : '-'}
                                                  </Text>
                                                </Td>
                                                <Td fontSize="xs" textAlign="center" fontWeight="bold" borderRight="2px" whiteSpace="nowrap" width="1%">
                                                  <Text color={avg >= 70 ? "green.600" : avg >= 50 ? "orange.600" : "red.600"}>
                                                    {total > 0 ? avg.toFixed(1) : '-'}
                                                  </Text>
                                                </Td>
                                              </Fragment>
                                            );
                                          })}
                                          
                                          {/* Avg column for this model */}
                                          {(() => {
                                            let totalT1 = 0, totalT2 = 0, totalT3 = 0, grandTotal = 0;
                                            
                                            trialResults.forEach(qResult => {
                                              const modelResult = qResult.modelResults[model.id];
                                              if (modelResult) {
                                                grandTotal++;
                                                if (modelResult.trial1?.correct) totalT1++;
                                                if (modelResult.trial2?.correct) totalT2++;
                                                if (modelResult.trial3?.correct) totalT3++;
                                              }
                                            });
                                            
                                            const t1Pct = grandTotal > 0 ? (totalT1 / grandTotal) * 100 : 0;
                                            const t2Pct = grandTotal > 0 ? (totalT2 / grandTotal) * 100 : 0;
                                            const t3Pct = grandTotal > 0 ? (totalT3 / grandTotal) * 100 : 0;
                                            const avgPct = (t1Pct + t2Pct + t3Pct) / 3;
                                            
                                            return (
                                              <Td textAlign="center" borderLeft="2px" borderRight="2px" bg="blue.50" fontWeight="bold" whiteSpace="nowrap">
                                                <Text color={avgPct >= 70 ? "green.600" : avgPct >= 50 ? "orange.600" : "red.600"}>
                                                  {grandTotal > 0 ? avgPct.toFixed(1) : '-'}
                                                </Text>
                                              </Td>
                                            );
                                          })()}
                                        </Tr>
                                      );
                                    })}
                                  </Tbody>
                                </Table>
                              </Box>
                            </Box>
                          );
                        })()}
                      </VStack>
                    )}

                    {/* Charts View */}
                    {activeClassView === "charts" && (
                      <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                        <VStack spacing={4} align="stretch">
                          <Box id="chart-container">
                            {/* Accuracy Per Model by Class Chart */}
                            {activeClassChartType === 'by-class' && (() => {
                              const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort();
                              
                              // Generate gradient colors for classes
                              const classColors = [
                                { bg: '#3b82f6', border: '#2563eb' }, // Blue
                                { bg: '#10b981', border: '#059669' }, // Emerald
                                { bg: '#f59e0b', border: '#d97706' }, // Amber
                                { bg: '#8b5cf6', border: '#7c3aed' }, // Purple
                                { bg: '#ec4899', border: '#db2777' }, // Pink
                                { bg: '#06b6d4', border: '#0891b2' }, // Cyan
                                { bg: '#ef4444', border: '#dc2626' }, // Red
                                { bg: '#84cc16', border: '#65a30d' }, // Lime
                              ];
                              
                              // Create dataset for each class
                              const datasets = classes.map((cls, idx) => {
                                const data = selectedModels.map(model => {
                                  let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0, total = 0;
                                  
                                  trialResults.forEach(qResult => {
                                    if (qResult.class === cls) {
                                      const modelResult = qResult.modelResults[model.id];
                                      if (modelResult) {
                                        total++;
                                        if (modelResult.trial1?.correct) trial1Correct++;
                                        if (modelResult.trial2?.correct) trial2Correct++;
                                        if (modelResult.trial3?.correct) trial3Correct++;
                                      }
                                    }
                                  });
                                  
                                  // Average accuracy across all three trials for this model and class
                                  return total > 0 ? ((trial1Correct + trial2Correct + trial3Correct) / (total * 3)) * 100 : 0;
                                });
                                
                                const color = classColors[idx % classColors.length];
                                return {
                                  label: cls,
                                  data: data,
                                  backgroundColor: color.bg,
                                  borderColor: color.border,
                                  borderWidth: 1,
                                };
                              });
                              
                              return (
                                <Box h="480px" position="relative" bg="white" p={4}>
                                  <Bar
                                    data={{
                                      labels: selectedModels.map(model => 
                                        model.name.length > 25 ? model.name.substring(0, 22) + '...' : model.name
                                      ),
                                      datasets: datasets,
                                    }}
                                    options={{
                                      responsive: true,
                                      maintainAspectRatio: false,
                                      plugins: {
                                        title: {
                                          display: true,
                                          text: 'Accuracy Per Model by Class',
                                          font: {
                                            size: 16,
                                            weight: 'bold',
                                          },
                                        },
                                        legend: {
                                          position: 'bottom',
                                        },
                                        tooltip: {
                                          callbacks: {
                                            label: function(context) {
                                              const value = context.parsed.y;
                                              if (value === null) return '';
                                              return context.dataset.label + ': ' + value.toFixed(1) + '%';
                                            },
                                          },
                                        },
                                      },
                                      scales: {
                                        y: {
                                          beginAtZero: true,
                                          max: 100,
                                          title: {
                                            display: true,
                                            text: 'Average Accuracy (%)',
                                            font: {
                                              size: 14,
                                              weight: 'bold',
                                            },
                                          },
                                          ticks: {
                                            callback: function(value) {
                                              return value + '%';
                                            },
                                            font: {
                                              size: 12,
                                            },
                                          },
                                          grid: {
                                            color: '#ddd',
                                          },
                                        },
                                        x: {
                                          title: {
                                            display: true,
                                            text: 'Model',
                                            font: {
                                              size: 14,
                                              weight: 'bold',
                                            },
                                          },
                                          ticks: {
                                            font: {
                                              size: 11,
                                              weight: 600,
                                            },
                                          },
                                          grid: {
                                            display: false,
                                          },
                                        },
                                      },
                                    }}
                                  />
                                </Box>
                              );
                            })()}

                            {/* Accuracy Per Trial and Class Chart */}
                            {activeClassChartType === 'by-class-and-trial' && (() => {
                              const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort();
                              
                              // Create dataset for each model
                              const datasets = selectedModels.map((model, idx) => {
                                const data = classes.map(cls => {
                                  let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0, total = 0;
                                  
                                  trialResults.forEach(qResult => {
                                    if (qResult.class === cls) {
                                      const modelResult = qResult.modelResults[model.id];
                                      if (modelResult) {
                                        total++;
                                        if (modelResult.trial1?.correct) trial1Correct++;
                                        if (modelResult.trial2?.correct) trial2Correct++;
                                        if (modelResult.trial3?.correct) trial3Correct++;
                                      }
                                    }
                                  });
                                  
                                  const avg = total > 0 ? ((trial1Correct + trial2Correct + trial3Correct) / (total * 3)) * 100 : 0;
                                  return avg;
                                });
                                
                                // Generate unique color for each model
                                const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
                                const color = colors[idx % colors.length];
                                
                                return {
                                  label: model.name.length > 25 ? model.name.substring(0, 22) + '...' : model.name,
                                  data: data,
                                  backgroundColor: color,
                                  borderColor: color,
                                  borderWidth: 1,
                                };
                              });
                              
                              return (
                                <Box h="480px" position="relative" bg="white" p={4}>
                                  <Bar
                                    data={{
                                      labels: classes,
                                      datasets: datasets,
                                    }}
                                    options={{
                                      responsive: true,
                                      maintainAspectRatio: false,
                                      plugins: {
                                        title: {
                                          display: true,
                                          text: 'Average Accuracy by Class and Model',
                                          font: {
                                            size: 16,
                                            weight: 'bold',
                                          },
                                        },
                                        legend: {
                                          position: 'bottom',
                                        },
                                        tooltip: {
                                          callbacks: {
                                            label: function(context) {
                                              const value = context.parsed.y;
                                              if (value === null) return '';
                                              return context.dataset.label + ': ' + value.toFixed(1) + '%';
                                            },
                                          },
                                        },
                                      },
                                      scales: {
                                        y: {
                                          beginAtZero: true,
                                          max: 100,
                                          title: {
                                            display: true,
                                            text: 'Average Accuracy (%)',
                                            font: {
                                              size: 14,
                                              weight: 'bold',
                                            },
                                          },
                                          ticks: {
                                            callback: function(value) {
                                              return value + '%';
                                            },
                                            font: {
                                              size: 12,
                                            },
                                          },
                                          grid: {
                                            color: '#ddd',
                                          },
                                        },
                                        x: {
                                          title: {
                                            display: true,
                                            text: 'Question Class',
                                            font: {
                                              size: 14,
                                              weight: 'bold',
                                            },
                                          },
                                          ticks: {
                                            font: {
                                              size: 11,
                                              weight: 600,
                                            },
                                          },
                                          grid: {
                                            display: false,
                                          },
                                        },
                                      },
                                    }}
                                  />
                                </Box>
                              );
                            })()}
                          </Box>
                        </VStack>
                      </Box>
                    )}
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
                    
                    <HStack spacing={2}>
                      <Button 
                        size="xs" 
                        colorScheme="blue" 
                        variant="outline"
                        onClick={exportLogs}
                        isDisabled={apiLogs.length === 0}
                      >
                        Export Logs
                      </Button>
                      <Button 
                        size="xs" 
                        colorScheme="blue" 
                        variant="outline"
                        onClick={() => setApiLogs([])}
                        isDisabled={apiLogs.length === 0}
                      >
                        Clear Logs
                      </Button>
                    </HStack>
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
                                  <Text fontSize="xs" color="blue.600">
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
                                  color="blue.500"
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
                                maxH="400px"
                                overflowY="auto"
                                width="100%"
                                border="1px"
                                borderColor="gray.200"
                              >
                                <Text fontWeight="medium" mb={1}>System Prompt:</Text>
                                <Text mb={2}>{log.request.messages?.[0]?.content || 'N/A'}</Text>
                                <Text fontWeight="medium" mb={1}>API Request:</Text>
                                <Text fontFamily="mono" fontSize="10px" mb={2}>
                                  {JSON.stringify(log.request, null, 2)}
                                </Text>
                                {log.response && !log.error && (
                                  <>
                                    <Text fontWeight="medium" mb={1} color="green.600">API Response:</Text>
                                    <Text fontFamily="mono" fontSize="10px">
                                      {JSON.stringify(log.response, null, 2)}
                                    </Text>
                                  </>
                                )}
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
                                      color="blue.500" 
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