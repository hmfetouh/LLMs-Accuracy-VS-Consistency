"use client";

import { useState, useEffect, Fragment, useRef } from "react";
import { Bar, Bubble, Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
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
  PointElement,
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
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Badge,
  Divider,
} from "@chakra-ui/react";

type Provider = "openai" | "deepseek" | "claude" | "ollama" | "openwebui";

interface Model {
  id: string;
  name: string;
  provider: Provider;
  apiModelId?: string; // The actual model ID to send to the API
  reasoningEffort?: string; // For GPT-5 models: "low", "medium", "high"
  thinkingEnabled?: boolean; // For Claude models that support thinking; false = thinking off
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

// Extracts the answer-option letters (e.g. A-D, or A-F) present in a question's text,
// so the review panel can offer exactly the choices the question actually has.
const getAnswerLetters = (questionText: string): string[] => {
  const matches = (questionText.match(/\([A-Z]\)/g) || []).map(m => m[1]);
  const uniqueLetters = Array.from(new Set(matches)).sort();
  return uniqueLetters.length >= 2 ? uniqueLetters : ['A', 'B', 'C', 'D'];
};

interface TrialResult {
  answer: string;
  correct: boolean;
  tokens: number;
  time: number; // in milliseconds
  aborted?: boolean;
  refused?: boolean;      // model refused to answer (stop_reason=refusal) — skip in future trials
  needsReview?: boolean;  // response didn't follow format — awaiting manual answer selection
  rawResponse?: string;   // stored so the review modal can display it
  wasReviewed?: boolean;  // answer was manually corrected via the review panel
  originalAnswer?: string; // model's raw parsed answer before review correction
}

interface BatchReviewQuestion {
  questionIndex: number;
  question: string;
  correctAnswer: string;
  parsedAnswer: string; // model's parsed answer; '?' if it needs review
  needsReview: boolean;
  addIdx: number;       // index inside additionalTrials[]
}

interface ReviewItem {
  id: string;
  modelId: string;
  modelName: string;
  questionIndex: number;
  question: string;
  rawResponse: string;
  correctAnswer: string;
  trialKey: string; // 'trial1' | 'trial2' | 'trial3' | 'additional_N' | 'batch'
  trialNumber?: number;         // for batch items only
  batchQuestions?: BatchReviewQuestion[]; // present only for extended-trial batch items
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
  const [systemPrompt, setSystemPrompt] = useState("Answer with only the single correct option letter (A, B, C, or D). For multiple questions, use a numbered list:\n1. A\n2. B\nNo explanation or extra text.");
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewModalIndex, setReviewModalIndex] = useState(0);
  // batchAnswers[itemId][questionIndex] = selected letter — tracks in-progress batch selections
  const [batchAnswers, setBatchAnswers] = useState<Record<string, Record<number, string>>>({});
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
    currentPhase: 'trial1' | 'trial2' | 'trial3' | 'waiting_review' | 'inconsistent';
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
  const [activeConsistencyView, setActiveConsistencyView] = useState<"table" | "charts">("table");
  const [activeConsistencyScoreView, setActiveConsistencyScoreView] = useState<"table" | "charts">("table");
  const [activeVariableView, setActiveVariableView] = useState<"table" | "charts" | "charts2">("table");
  const [activeCRPerClassView, setActiveCRPerClassView] = useState<"table" | "charts">("table");
  const [activeCSPerClassView, setActiveCSPerClassView] = useState<"table" | "charts">("table");
  const [activeVCRPerClassView, setActiveVCRPerClassView] = useState<"table" | "charts">("table");
  const [activePerformanceView, setActivePerformanceView] = useState<"table" | "overview" | "per-model">("table");
  const [activeAccVsTimeView, setActiveAccVsTimeView] = useState<"table" | "charts">("table");
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
  const [currentProvider, setCurrentProvider] = useState<Provider>("openai");
  const [apiConfigs, setApiConfigs] = useState<Record<string, ApiConfig>>({
    openai: { key: "", baseUrl: "https://api.openai.com/v1" },
    deepseek: { key: "", baseUrl: "https://api.deepseek.com/v1" },
    claude: { key: "", baseUrl: "https://api.anthropic.com/v1" },
    ollama: { key: "", baseUrl: "http://localhost:11434/v1" },
    openwebui: { key: "", baseUrl: "http://localhost:8000/api" },
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
      case "claude":
        return "https://api.anthropic.com/v1";
      case "ollama":
        return "http://localhost:11434/v1";
      case "openwebui":
        return "http://localhost:8000/api";
      default:
        return "https://api.openai.com/v1";
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
    if (!key && currentProvider !== 'ollama') {
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
    const maskedKey = key ? key.substring(0, 6) + "..." + key.substring(key.length - 6) : '(no key)';
    
    const newConfig: StoredApiConfig = {
      id,
      provider: currentProvider,
      key: key || '',
      maskedKey,
      baseUrl
    };

    // Verify first — only save if models are successfully loaded
    const modelsLoaded = await verifyApiKey(id, newConfig);

    if (modelsLoaded > 0) {
      const filteredConfigs = storedApiConfigs.filter(config => config.provider !== currentProvider);
      const updatedConfigs = [...filteredConfigs, newConfig];
      setStoredApiConfigs(updatedConfigs);
      localStorage.setItem('storedApiConfigs', JSON.stringify(updatedConfigs));

      toast({
        title: "API Configuration Saved",
        description: `${modelsLoaded} models loaded from ${currentProvider}`,
        status: "success",
        duration: 3000,
      });
    }
    // If 0 models loaded, the error toast was already shown by verifyApiKey — don't save
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
                     configToRemove.provider === 'claude' ? 'Claude' :
                     configToRemove.provider === 'ollama' ? 'Ollama' :
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
      'claude-',
      'ollama-',
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
      // Ollama doesn't require an API key
      if (model.provider === 'ollama') continue;

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

  const resolveReview = (item: ReviewItem, chosenAnswer: string) => {
    const upper = chosenAnswer.toUpperCase();
    setTrialResults(prev => prev.map((qResult, qi) => {
      if (qi !== item.questionIndex) return qResult;
      const modelResult = qResult.modelResults[item.modelId];
      if (!modelResult) return qResult;
      const patch = (t: TrialResult | undefined): TrialResult | undefined =>
        t ? { ...t, originalAnswer: t.answer, answer: upper, correct: upper === item.correctAnswer.toUpperCase(), needsReview: false, rawResponse: undefined, wasReviewed: true } : t;
      if (item.trialKey === 'trial1') return { ...qResult, modelResults: { ...qResult.modelResults, [item.modelId]: { ...modelResult, trial1: patch(modelResult.trial1)! } } };
      if (item.trialKey === 'trial2') return { ...qResult, modelResults: { ...qResult.modelResults, [item.modelId]: { ...modelResult, trial2: patch(modelResult.trial2) } } };
      if (item.trialKey === 'trial3') return { ...qResult, modelResults: { ...qResult.modelResults, [item.modelId]: { ...modelResult, trial3: patch(modelResult.trial3) } } };
      if (item.trialKey.startsWith('additional_')) {
        const addIdx = parseInt(item.trialKey.replace('additional_', ''));
        const additionalTrials = [...(modelResult.additionalTrials || [])];
        additionalTrials[addIdx] = patch(additionalTrials[addIdx])!;
        const updatedModelResult = { ...modelResult, additionalTrials };
        // Recalculate correctPercentage now that this trial has a real answer
        const allTrials = [updatedModelResult.trial1, updatedModelResult.trial2, updatedModelResult.trial3, ...additionalTrials].filter(Boolean) as TrialResult[];
        if (allTrials.length > 0) {
          updatedModelResult.correctPercentage = (allTrials.filter(t => !t.aborted && t.correct).length / allTrials.length) * 100;
        }
        return { ...qResult, modelResults: { ...qResult.modelResults, [item.modelId]: updatedModelResult } };
      }
      return qResult;
    }));
    setReviewQueue(prev => {
      const next = prev.filter(r => r.id !== item.id);
      setReviewModalIndex(i => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  };

  const resolveBatchReview = (item: ReviewItem, answers: Record<number, string>) => {
    if (!item.batchQuestions) return;
    const patchTrial = (t: TrialResult | undefined, upper: string, correctAnswer: string): TrialResult | undefined =>
      t ? { ...t, originalAnswer: t.answer, answer: upper, correct: upper === correctAnswer.toUpperCase(), needsReview: false, rawResponse: undefined, wasReviewed: true } : t;

    setTrialResults(prev => prev.map((qResult, qi) => {
      const batchQ = item.batchQuestions!.find(bq => bq.questionIndex === qi);
      if (!batchQ) return qResult;
      const upper = (answers[qi] ?? (!batchQ.needsReview ? batchQ.parsedAnswer : '')).toUpperCase();
      if (!upper) return qResult;
      const isOverride = !batchQ.needsReview && answers[qi] !== undefined && answers[qi] !== batchQ.parsedAnswer;
      if (!batchQ.needsReview && !isOverride) return qResult;
      const modelResult = qResult.modelResults[item.modelId];
      if (!modelResult) return qResult;

      let updatedModelResult = { ...modelResult };
      if (item.trialKey === 'trial2') {
        updatedModelResult.trial2 = patchTrial(modelResult.trial2, upper, batchQ.correctAnswer);
      } else if (item.trialKey === 'trial3') {
        updatedModelResult.trial3 = patchTrial(modelResult.trial3, upper, batchQ.correctAnswer);
      } else {
        const additionalTrials = [...(modelResult.additionalTrials || [])];
        additionalTrials[batchQ.addIdx] = patchTrial(additionalTrials[batchQ.addIdx], upper, batchQ.correctAnswer)!;
        updatedModelResult = { ...modelResult, additionalTrials };
        const allTrials = [updatedModelResult.trial1, updatedModelResult.trial2, updatedModelResult.trial3, ...additionalTrials].filter(Boolean) as TrialResult[];
        if (allTrials.length > 0) {
          updatedModelResult.correctPercentage = (allTrials.filter(t => !t.aborted && t.correct).length / allTrials.length) * 100;
        }
      }
      return { ...qResult, modelResults: { ...qResult.modelResults, [item.modelId]: updatedModelResult } };
    }));
    setBatchAnswers(prev => { const next = { ...prev }; delete next[item.id]; return next; });
    setReviewQueue(prev => {
      const next = prev.filter(r => r.id !== item.id);
      setReviewModalIndex(i => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  };

  const skipReview = (item: ReviewItem) => {
    setReviewQueue(prev => {
      const next = prev.filter(r => r.id !== item.id);
      setReviewModalIndex(i => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
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
      setReviewQueue([]);
      setBatchAnswers({});
      
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

    // Always sync trialResultsArray from React state so any reviews resolved while
    // paused (answers, correct flags, correctPercentage) are visible to the loop.
    const stateToResume = {
      ...evaluationState,
      trialResultsArray: trialResults.map(qr => ({ ...qr, modelResults: { ...qr.modelResults } })),
    };

    // Continue evaluation from saved state
    runEvaluationLoop(stateToResume);
    
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
    currentPhase: 'trial1' | 'trial2' | 'trial3' | 'waiting_review' | 'inconsistent';
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

              if (trialResult.needsReview) {
                setReviewQueue(prev => [...prev, {
                  id: `${model.id}-${q.id}-trial1`,
                  modelId: model.id, modelName: model.name,
                  questionIndex: i, question: q.question,
                  rawResponse: trialResult.rawResponse!, correctAnswer: q.answer,
                  trialKey: 'trial1',
                }]);
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

        // Trial 2: Batch questions (up to 10 per request), skipping per-model refused questions
        if (currentPhase === 'trial2') {
          try {
            // Collect questions refused by this model in trial1 — exclude them from the batch
            const refusedIndices2 = new Set<number>();
            trialResultsArray.forEach((qr, idx) => {
              if (qr.modelResults[model.id]?.trial1?.refused) refusedIndices2.add(idx);
            });
            const nonRefusedIdx2 = parsedQuestions.map((_, i) => i).filter(i => !refusedIndices2.has(i));
            const nonRefusedQ2 = nonRefusedIdx2.map(i => parsedQuestions[i]);

            let partial2: TrialResult[] = [];
            if (nonRefusedQ2.length > 0) {
              partial2 = await runBatchedTrial(model, nonRefusedQ2, systemPrompt, 2, controller.signal);
            }
            // Merge: refused slots get an instant ERROR, others get the batch result
            let j2 = 0;
            const trial2Results = parsedQuestions.map((_, i) =>
              refusedIndices2.has(i)
                ? { answer: "ERROR", correct: false, tokens: 0, time: 0, refused: true } as TrialResult
                : partial2[j2++]
            );

            trial2Results.forEach((result, index) => {
              if (trialResultsArray[index].modelResults[model.id]) {
                trialResultsArray[index].modelResults[model.id].trial2 = result;
              }
              setProgress(prev => ({ ...prev, current: prev.current + 1 }));
            });
            // One batch review item per chunk of 10 questions
            const batchSize2 = 10;
            for (let bStart = 0; bStart < parsedQuestions.length; bStart += batchSize2) {
              const bEnd = Math.min(bStart + batchSize2, parsedQuestions.length);
              const chunk = trial2Results.slice(bStart, bEnd);
              if (chunk.some(r => r.needsReview)) {
                const rawResponse = chunk.find(r => r.rawResponse)?.rawResponse || '';
                setReviewQueue(prev => [...prev, {
                  id: `${model.id}-trial2-batch${bStart}`,
                  modelId: model.id, modelName: model.name,
                  questionIndex: bStart, question: '', rawResponse, correctAnswer: '',
                  trialKey: 'trial2', trialNumber: 2,
                  batchQuestions: chunk.map((result, bIdx) => ({
                    questionIndex: bStart + bIdx,
                    question: parsedQuestions[bStart + bIdx].question,
                    correctAnswer: parsedQuestions[bStart + bIdx].answer,
                    parsedAnswer: result.answer,
                    needsReview: result.needsReview || false,
                    addIdx: -1,
                  })),
                }]);
              }
            }
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

        // Trial 3: Batch questions (up to 10 per request), skipping per-model refused questions
        if (currentPhase === 'trial3') {
          try {
            const refusedIndices3 = new Set<number>();
            trialResultsArray.forEach((qr, idx) => {
              const mr = qr.modelResults[model.id];
              if (mr?.trial1?.refused || mr?.trial2?.refused) refusedIndices3.add(idx);
            });
            const nonRefusedIdx3 = parsedQuestions.map((_, i) => i).filter(i => !refusedIndices3.has(i));
            const nonRefusedQ3 = nonRefusedIdx3.map(i => parsedQuestions[i]);

            let partial3: TrialResult[] = [];
            if (nonRefusedQ3.length > 0) {
              partial3 = await runBatchedTrial(model, nonRefusedQ3, systemPrompt, 3, controller.signal);
            }
            let j3 = 0;
            const trial3Results = parsedQuestions.map((_, i) =>
              refusedIndices3.has(i)
                ? { answer: "ERROR", correct: false, tokens: 0, time: 0, refused: true } as TrialResult
                : partial3[j3++]
            );

            trial3Results.forEach((result, index) => {
              if (trialResultsArray[index].modelResults[model.id]) {
                trialResultsArray[index].modelResults[model.id].trial3 = result;
              }
              setProgress(prev => ({ ...prev, current: prev.current + 1 }));
            });
            // One batch review item per chunk of 10 questions
            const batchSize3 = 10;
            for (let bStart = 0; bStart < parsedQuestions.length; bStart += batchSize3) {
              const bEnd = Math.min(bStart + batchSize3, parsedQuestions.length);
              const chunk = trial3Results.slice(bStart, bEnd);
              if (chunk.some(r => r.needsReview)) {
                const rawResponse = chunk.find(r => r.rawResponse)?.rawResponse || '';
                setReviewQueue(prev => [...prev, {
                  id: `${model.id}-trial3-batch${bStart}`,
                  modelId: model.id, modelName: model.name,
                  questionIndex: bStart, question: '', rawResponse, correctAnswer: '',
                  trialKey: 'trial3', trialNumber: 3,
                  batchQuestions: chunk.map((result, bIdx) => ({
                    questionIndex: bStart + bIdx,
                    question: parsedQuestions[bStart + bIdx].question,
                    correctAnswer: parsedQuestions[bStart + bIdx].answer,
                    parsedAnswer: result.answer,
                    needsReview: result.needsReview || false,
                    addIdx: -1,
                  })),
                }]);
              }
            }
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

        // After trial3: if any of this model's trial1/2/3 answers are still pending review,
        // pause and wait — inconsistency detection needs the resolved answers.
        if (currentPhase === 'trial3') {
          const hasPendingReviews = trialResultsArray.some(qResult => {
            const mr = qResult.modelResults[model.id];
            if (!mr) return false;
            return [mr.trial1, mr.trial2, mr.trial3].some(t => t?.needsReview);
          });
          if (hasPendingReviews) {
            setIsPaused(true);
            setIsEvaluating(false);
            setIsProcessing(false);
            setEvaluationState({
              parsedQuestions,
              trialResultsArray,
              currentModelIndex: modelIdx,
              currentPhase: 'waiting_review',
              currentQuestionIndex: 0,
              currentTrialNumber,
              inconsistentQuestions,
            });
            toast({
              title: "Review Required Before Continuing",
              description: "Resolve all pending answers in the Review panel, then click Resume to run extended trials.",
              status: "warning",
              duration: 8000,
              isClosable: true,
            });
            return;
          }
        }

        // After trial3: detect inconsistencies for THIS model and run extended trials.
        // Runs on a fresh pass (currentPhase === 'trial3'), after review resolution
        // (currentPhase === 'waiting_review'), or when resuming mid-extended-trials
        // for this specific model (currentPhase === 'inconsistent' && modelIdx === currentModelIndex).
        if (currentPhase === 'trial3' || currentPhase === 'waiting_review' || (currentPhase === 'inconsistent' && modelIdx === currentModelIndex)) {
          const isResumingInconsistent = currentPhase === 'inconsistent';
          const modelInconsistentQuestions: Array<{index: number, question: {id: string, question: string, answer: string}}> = [];

          if (isResumingInconsistent) {
            // Resuming mid-extended-trials: restore the already-detected questions from state
            inconsistentQuestions
              .filter(iq => iq.modelId === model.id)
              .forEach(iq => modelInconsistentQuestions.push({ index: iq.index, question: parsedQuestions[iq.index] }));
          } else {
            // Fresh detection: scan only this model's results
            const getValidAnswer = (trial?: TrialResult): string => {
              if (!trial || trial.aborted || !trial.answer || trial.answer === 'ERROR') return '';
              const match = trial.answer.match(/^([A-Za-z])/);
              return match ? match[1].toUpperCase() : '';
            };
            trialResultsArray.forEach((qResult, index) => {
              const modelResult = qResult.modelResults[model.id];
              if (!modelResult?.trial1 || !modelResult?.trial2 || !modelResult?.trial3) return;
              const answers = [
                getValidAnswer(modelResult.trial1),
                getValidAnswer(modelResult.trial2),
                getValidAnswer(modelResult.trial3),
              ].filter(Boolean);
              if (new Set(answers).size > 1) {
                modelResult.isInconsistent = true;
                modelInconsistentQuestions.push({ index, question: parsedQuestions[index] });
                inconsistentQuestions.push({ index, modelId: model.id });
              }
            });

            if (modelInconsistentQuestions.length > 0) {
              // Update progress total to account for 7 more batched rounds
              const additionalBatches = Math.ceil(modelInconsistentQuestions.length / 10) * 7;
              setProgress(prev => ({ ...prev, total: prev.total + additionalBatches }));
            }
          }

          if (modelInconsistentQuestions.length > 0) {
            const startTrial = isResumingInconsistent ? currentTrialNumber : 4;

            for (let trialNum = startTrial; trialNum <= 10; trialNum++) {
              if (shouldStopRef.current) { wasStopped = true; break; }

              if (shouldPauseRef.current) {
                setIsPaused(true);
                setIsEvaluating(false);
                setIsProcessing(false);
                setShouldPauseEvaluation(false);
                shouldPauseRef.current = false;
                setEvaluationState({
                  parsedQuestions,
                  trialResultsArray,
                  currentModelIndex: modelIdx,
                  currentPhase: 'inconsistent',
                  currentQuestionIndex: 0,
                  currentTrialNumber: trialNum,
                  inconsistentQuestions: modelInconsistentQuestions.map(q => ({ index: q.index, modelId: model.id }))
                });
                toast({ title: "Evaluation Paused", description: "You can resume from where you left off.", status: "info", duration: 3000 });
                return;
              }

              try {
                const trialResults = await runBatchedTrial(
                  model,
                  modelInconsistentQuestions.map(q => q.question),
                  systemPrompt,
                  trialNum,
                  controller.signal
                );
                // Track addIdx per question before pushing, then push all results
                const batchAddIdxMap: number[] = [];
                trialResults.forEach((result, idx) => {
                  const questionIndex = modelInconsistentQuestions[idx].index;
                  if (!trialResultsArray[questionIndex].modelResults[model.id].additionalTrials) {
                    trialResultsArray[questionIndex].modelResults[model.id].additionalTrials = [];
                  }
                  batchAddIdxMap.push(trialResultsArray[questionIndex].modelResults[model.id].additionalTrials!.length);
                  trialResultsArray[questionIndex].modelResults[model.id].additionalTrials!.push(result);
                });
                // If any question needs review, add ONE batch review item with all questions
                if (trialResults.some(r => r.needsReview)) {
                  const rawResponse = trialResults.find(r => r.rawResponse)?.rawResponse || '';
                  setReviewQueue(prev => [...prev, {
                    id: `${model.id}-trial${trialNum}-batch-${Date.now()}`,
                    modelId: model.id, modelName: model.name,
                    questionIndex: modelInconsistentQuestions[0].index,
                    question: '', rawResponse, correctAnswer: '',
                    trialKey: 'batch', trialNumber: trialNum,
                    batchQuestions: modelInconsistentQuestions.map((q, idx) => ({
                      questionIndex: q.index,
                      question: q.question.question,
                      correctAnswer: q.question.answer,
                      parsedAnswer: trialResults[idx].answer,
                      needsReview: trialResults[idx].needsReview || false,
                      addIdx: batchAddIdxMap[idx],
                    })),
                  }]);
                }
                setProgress(prev => ({ ...prev, current: prev.current + 1 }));
                setTrialResults([...trialResultsArray]);
              } catch (error) {
                setIsPaused(true);
                setIsEvaluating(false);
                setIsProcessing(false);
                setShouldPauseEvaluation(false);
                shouldPauseRef.current = false;
                setEvaluationState({
                  parsedQuestions,
                  trialResultsArray,
                  currentModelIndex: modelIdx,
                  currentPhase: 'inconsistent',
                  currentQuestionIndex: 0,
                  currentTrialNumber: trialNum,
                  inconsistentQuestions: modelInconsistentQuestions.map(q => ({ index: q.index, modelId: model.id }))
                });
                toast({
                  title: "API Error - Evaluation Paused",
                  description: `Error encountered: ${error instanceof Error ? error.message : 'Unknown error'}. Click Resume to retry.`,
                  status: "error", duration: 10000, isClosable: true,
                });
                return;
              }
            }

            if (!shouldStopRef.current) {
              // Calculate correctPercentage across all 10 trials for this model's variable questions
              for (const { index } of modelInconsistentQuestions) {
                const modelResult = trialResultsArray[index].modelResults[model.id];
                const allTrials = [
                  modelResult.trial1,
                  modelResult.trial2,
                  modelResult.trial3,
                  ...(modelResult.additionalTrials || [])
                ].filter(Boolean) as TrialResult[];
                if (allTrials.length > 0) {
                  const correctCount = allTrials.filter(t => !t.aborted && t.correct).length;
                  modelResult.correctPercentage = (correctCount / allTrials.length) * 100;
                }
              }
              setTrialResults([...trialResultsArray]);

              // Pause if any extended trial answers are still pending review.
              // On resume, trialResultsArray is re-synced from React state so resolved
              // answers and the recalculated correctPercentage are picked up.
              const hasPendingExtendedReviews = modelInconsistentQuestions.some(({ index }) =>
                (trialResultsArray[index].modelResults[model.id].additionalTrials || []).some(t => t?.needsReview)
              );
              if (hasPendingExtendedReviews) {
                setIsPaused(true);
                setIsEvaluating(false);
                setIsProcessing(false);
                setEvaluationState({
                  parsedQuestions,
                  trialResultsArray,
                  currentModelIndex: modelIdx + 1,
                  currentPhase: 'trial1',
                  currentQuestionIndex: 0,
                  currentTrialNumber: 4,
                  inconsistentQuestions,
                });
                toast({
                  title: "Review Required Before Continuing",
                  description: "Resolve all pending answers in the Review panel, then click Resume.",
                  status: "warning",
                  duration: 8000,
                  isClosable: true,
                });
                return;
              }
            }
          }
        }

        // Reset phase for next model
        if (modelIdx < selectedModels.length - 1) {
          currentPhase = 'trial1';
          currentQuestionIndex = 0;
        }
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
      if (wasStopped || controller.signal.aborted) {
        setReviewQueue([]);
        setBatchAnswers({});
      }
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
          `${model.name} - T1 Corrected`,
          `${model.name} - T2`,
          `${model.name} - T2 Corrected`,
          `${model.name} - T3`,
          `${model.name} - T3 Corrected`,
          `${model.name} - T4`,
          `${model.name} - T4 Corrected`,
          `${model.name} - T5`,
          `${model.name} - T5 Corrected`,
          `${model.name} - T6`,
          `${model.name} - T6 Corrected`,
          `${model.name} - T7`,
          `${model.name} - T7 Corrected`,
          `${model.name} - T8`,
          `${model.name} - T8 Corrected`,
          `${model.name} - T9`,
          `${model.name} - T9 Corrected`,
          `${model.name} - T10`,
          `${model.name} - T10 Corrected`,
          `${model.name} - % of 10 (raw)`,
          `${model.name} - % of 10 (corrected)`
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
          // orig: what the model returned before any review; corr: the manually chosen answer (or '-')
          const orig = (t?: TrialResult) => (t ? (t.wasReviewed ? (t.originalAnswer ?? '?') : t.answer) : '-') || '-';
          const corr = (t?: TrialResult) => (t?.wasReviewed ? t.answer : '-') || '-';
          if (modelResult) {
            const additional = modelResult.additionalTrials || [];
            row.push(
              modelResult.trial1?.tokens || '-',
              modelResult.trial1?.time || '-',
              orig(modelResult.trial1), corr(modelResult.trial1),
              orig(modelResult.trial2), corr(modelResult.trial2),
              orig(modelResult.trial3), corr(modelResult.trial3),
              orig(additional[0]), corr(additional[0]),
              orig(additional[1]), corr(additional[1]),
              orig(additional[2]), corr(additional[2]),
              orig(additional[3]), corr(additional[3]),
              orig(additional[4]), corr(additional[4]),
              orig(additional[5]), corr(additional[5]),
              orig(additional[6]), corr(additional[6]),
              (() => {
                const allTrials = [modelResult.trial1, modelResult.trial2, modelResult.trial3, ...additional].filter(Boolean) as TrialResult[];
                if (allTrials.length === 0) return '-';
                // reviewed answers were '?' pre-review → count as wrong
                const rawCorrect = allTrials.filter(t => !t.aborted && !t.wasReviewed && t.correct).length;
                return `${Math.round((rawCorrect / allTrials.length) * 100)}%`;
              })(),
              modelResult.correctPercentage !== undefined ? `${Math.round(modelResult.correctPercentage)}%` : '-'
            );
          } else {
            row.push('-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-');
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

  const exportChartById = (containerId: string, format: 'png' | 'svg', label: string) => {
    try {
      const chartElement = document.getElementById(containerId);
      if (!chartElement) {
        toast({ title: "Export Failed", description: "Chart not found.", status: "error", duration: 3000 });
        return;
      }
      const canvasElement = chartElement.querySelector('canvas');
      if (!canvasElement) {
        toast({ title: "Export Failed", description: "Chart canvas not found.", status: "warning", duration: 3000 });
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      if (format === 'png') {
        canvasElement.toBlob((blob) => {
          if (!blob) { toast({ title: "Export Failed", description: "Could not create PNG.", status: "error", duration: 3000 }); return; }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', `${label}_${date}.png`);
          link.click();
          URL.revokeObjectURL(url);
          toast({ title: "Chart Exported as PNG", status: "success", duration: 3000 });
        });
      } else {
        const w = canvasElement.width, h = canvasElement.height;
        const dataURL = canvasElement.toDataURL('image/png');
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <image width="${w}" height="${h}" xlink:href="${dataURL}"/>\n</svg>`;
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${label}_${date}.svg`);
        link.click();
        URL.revokeObjectURL(url);
        toast({ title: "Chart Exported as SVG", status: "success", duration: 3000 });
      }
    } catch {
      toast({ title: "Export Failed", description: "An error occurred while exporting.", status: "error", duration: 5000 });
    }
  };

  const exportConsistencyTable = () => {
    if (trialResults.length === 0) {
      toast({ title: "No Data to Export", description: "Please run an evaluation first.", status: "warning", duration: 3000 });
      return;
    }
    try {
      let csv = 'Model,Always Correct (%),Always Correct (n),Variable (%),Variable (n),Always Incorrect (%),Always Incorrect (n),Total\n';
      selectedModels.forEach(model => {
        let ac = 0, variable = 0, ai = 0, total = 0;
        trialResults.forEach(qResult => {
          const mr = qResult.modelResults[model.id];
          if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
          if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
          total++;
          const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
          if (c1 && c2 && c3) ac++;
          else if (!c1 && !c2 && !c3) ai++;
          else variable++;
        });
        const f = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '0.0%';
        csv += `"${model.name}",${f(ac)},${ac},${f(variable)},${variable},${f(ai)},${ai},${total}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `consistency_reliability_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch {
      toast({ title: "Export Failed", description: "An error occurred while exporting.", status: "error", duration: 5000 });
    }
  };

  const exportVariableTable = () => {
    if (trialResults.length === 0) {
      toast({ title: "No Data to Export", description: "Please run an evaluation first.", status: "warning", duration: 3000 });
      return;
    }
    try {
      let csv = 'Model,Variable Questions,Avg Correct Rate (%),Interpretation\n';
      selectedModels.forEach(model => {
        const correctRates: number[] = [];
        trialResults.forEach(qResult => {
          const mr = qResult.modelResults[model.id];
          if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
          if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
          const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
          if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) return;
          let correct = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0);
          let total = 3;
          if (mr.additionalTrials) {
            mr.additionalTrials.forEach(at => { total++; if (!at.aborted && at.correct) correct++; });
          }
          correctRates.push(total > 0 ? (correct / total) * 100 : 0);
        });
        const avg = correctRates.length > 0 ? correctRates.reduce((a, b) => a + b, 0) / correctRates.length : null;
        const interp = avg === null ? '—'
          : avg >= 70 ? 'Near-correct (rare slip)'
          : avg >= 40 ? 'Genuinely uncertain'
          : 'Near-incorrect (rare correct guess)';
        csv += `"${model.name}",${correctRates.length},${avg !== null ? avg.toFixed(1) + '%' : '—'},"${interp}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `variable_correct_rate_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch {
      toast({ title: "Export Failed", description: "An error occurred while exporting.", status: "error", duration: 5000 });
    }
  };

  const exportConsistencyScoreTable = () => {
    if (trialResults.length === 0) {
      toast({ title: "No Data to Export", description: "Please run an evaluation first.", status: "warning", duration: 3000 });
      return;
    }
    try {
      let csv = 'Model,Consistency Score (%),Always Correct (%),Always Correct (n),Always Incorrect (%),Always Incorrect (n),Variable (%),Total\n';
      selectedModels.forEach(model => {
        let ac = 0, variable = 0, ai = 0, total = 0;
        trialResults.forEach(qResult => {
          const mr = qResult.modelResults[model.id];
          if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
          if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
          total++;
          const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
          if (c1 && c2 && c3) ac++;
          else if (!c1 && !c2 && !c3) ai++;
          else variable++;
        });
        const f = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '0.0%';
        const score = total > 0 ? (((ac + ai) / total) * 100).toFixed(1) + '%' : '0.0%';
        csv += `"${model.name}",${score},${f(ac)},${ac},${f(ai)},${ai},${f(variable)},${total}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `consistency_score_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch {
      toast({ title: "Export Failed", description: "An error occurred while exporting.", status: "error", duration: 5000 });
    }
  };

  const exportCRPerClassTable = () => {
    if (trialResults.length === 0) { toast({ title: "No Data to Export", status: "warning", duration: 3000 }); return; }
    try {
      const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort() as string[];
      const header = ['Model', ...classes.flatMap(c => [`${c} - AC%`, `${c} - Var%`, `${c} - AI%`])];
      let csv = header.map(h => `"${h}"`).join(',') + '\n';
      selectedModels.forEach(model => {
        const row = [model.name, ...classes.flatMap(cls => {
          let ac = 0, variable = 0, ai = 0, total = 0;
          trialResults.filter(r => r.class === cls).forEach(qResult => {
            const mr = qResult.modelResults[model.id];
            if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
            if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
            total++;
            const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
            if (c1 && c2 && c3) ac++; else if (!c1 && !c2 && !c3) ai++; else variable++;
          });
          const f = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '—';
          return [f(ac), f(variable), f(ai)];
        })];
        csv += row.map(v => `"${v}"`).join(',') + '\n';
      });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
      link.setAttribute('download', `consistency_reliability_per_class_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch { toast({ title: "Export Failed", status: "error", duration: 5000 }); }
  };

  const exportCSPerClassTable = () => {
    if (trialResults.length === 0) { toast({ title: "No Data to Export", status: "warning", duration: 3000 }); return; }
    try {
      const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort() as string[];
      const header = ['Model', ...classes.map(c => `${c} - Score%`), ...classes.map(c => `${c} - Same Answer (n)`)];
      let csv = header.map(h => `"${h}"`).join(',') + '\n';
      selectedModels.forEach(model => {
        const classScores = classes.map(cls => {
          let ac = 0, ai = 0, total = 0;
          trialResults.filter(r => r.class === cls).forEach(qResult => {
            const mr = qResult.modelResults[model.id];
            if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
            if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
            total++;
            const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
            if (c1 && c2 && c3) ac++; else if (!c1 && !c2 && !c3) ai++;
          });
          const score = total > 0 ? (((ac + ai) / total) * 100).toFixed(1) + '%' : '—';
          return { score, sameN: total > 0 ? `${ac + ai}/${total}` : '—' };
        });
        const row = [model.name, ...classScores.map(d => d.score), ...classScores.map(d => d.sameN)];
        csv += row.map(v => `"${v}"`).join(',') + '\n';
      });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
      link.setAttribute('download', `consistency_score_per_class_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch { toast({ title: "Export Failed", status: "error", duration: 5000 }); }
  };

  const exportVCRPerClassTable = () => {
    if (trialResults.length === 0) { toast({ title: "No Data to Export", status: "warning", duration: 3000 }); return; }
    try {
      const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort() as string[];
      const header = ['Model', ...classes.map(c => `${c} - Avg Correct Rate (Variable Qs)`)];
      let csv = header.map(h => `"${h}"`).join(',') + '\n';
      selectedModels.forEach(model => {
        const classAvgs = classes.map(cls => {
          const rates: number[] = [];
          trialResults.filter(r => r.class === cls).forEach(qResult => {
            const mr = qResult.modelResults[model.id];
            if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
            if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
            const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
            if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) return;
            let correct = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0), total = 3;
            if (mr.additionalTrials) mr.additionalTrials.forEach(at => { total++; if (!at.aborted && at.correct) correct++; });
            rates.push(total > 0 ? (correct / total) * 100 : 0);
          });
          return rates.length > 0 ? (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1) + '%' : '—';
        });
        csv += [`"${model.name}"`, ...classAvgs.map(v => `"${v}"`)].join(',') + '\n';
      });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
      link.setAttribute('download', `variable_correct_rate_per_class_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch { toast({ title: "Export Failed", status: "error", duration: 5000 }); }
  };

  const exportAccVsTimeTable = () => {
    if (trialResults.length === 0) { toast({ title: "No Data to Export", status: "warning", duration: 3000 }); return; }
    try {
      const header = ['Model', 'Overall Accuracy (%)', 'Avg Response Time (ms)', 'Questions Evaluated'];
      let csv = header.map(h => `"${h}"`).join(',') + '\n';
      selectedModels.forEach(model => {
        let t1c = 0, t2c = 0, t3c = 0, total = 0, totalTime = 0, timeCount = 0;
        trialResults.forEach(qResult => {
          const mr = qResult.modelResults[model.id];
          if (!mr) return;
          total++;
          if (mr.trial1?.correct) t1c++;
          if (mr.trial2?.correct) t2c++;
          if (mr.trial3?.correct) t3c++;
          if (mr.trial1 && !mr.trial1.aborted) { totalTime += mr.trial1.time; timeCount++; }
        });
        const acc = total > 0 ? ((t1c + t2c + t3c) / (total * 3)) * 100 : 0;
        const avgTime = timeCount > 0 ? totalTime / timeCount : 0;
        csv += [`"${model.name}"`, `"${acc.toFixed(1)}"`, `"${avgTime.toFixed(0)}"`, `"${total}"`].join(',') + '\n';
      });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
      link.setAttribute('download', `accuracy_vs_response_time_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch { toast({ title: "Export Failed", status: "error", duration: 5000 }); }
  };

  const exportPerformanceTable = () => {
    if (trialResults.length === 0) { toast({ title: "No Data to Export", status: "warning", duration: 3000 }); return; }
    try {
      const header = ['Model', 'Avg Prompt Length (tokens)', 'Avg Response Time (ms)', 'Questions Evaluated'];
      let csv = header.map(h => `"${h}"`).join(',') + '\n';
      selectedModels.forEach(model => {
        let totalTokens = 0, totalTime = 0, count = 0;
        trialResults.forEach(qResult => {
          const mr = qResult.modelResults[model.id];
          if (!mr?.trial1 || mr.trial1.aborted) return;
          const qTokens = estimateTokenCount(qResult.question);
          totalTokens += qTokens;
          totalTime += mr.trial1.time;
          count++;
        });
        const avgTokens = count > 0 ? (totalTokens / count).toFixed(1) : '—';
        const avgTime = count > 0 ? (totalTime / count).toFixed(0) : '—';
        csv += [`"${model.name}"`, `"${avgTokens}"`, `"${avgTime}"`, `"${count}"`].join(',') + '\n';
      });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
      link.setAttribute('download', `performance_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "Table Exported Successfully", status: "success", duration: 3000 });
    } catch { toast({ title: "Export Failed", status: "error", duration: 5000 }); }
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
        } else if (provider === 'claude') {
          return "Claude: Get an API key from console.anthropic.com and add it in the sidebar";
        } else if (provider === 'ollama') {
          return "Ollama: Ensure Ollama is running locally and the base URL is correct";
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
    const base = baseUrl.replace(/\/+$/, ''); // strip trailing slashes to avoid double-slash paths
    if (provider === 'claude') {
      return `${base}/messages`;
    }
    return `${base}/chat/completions`;
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
      if (!storedConfig || (!storedConfig.key && model.provider !== 'ollama')) {
        const errorMsg = `No API configuration for ${model.provider}. Please add API key first.`;
        throw new Error(errorMsg);
      }

      const modelId = model.apiModelId || model.id;
      const isClaude = model.provider === 'claude';

      // Check if it's an OpenAI reasoning model (o1 series)
      const isO1Model = /^(o1|o3)(-mini|-preview)?(-\d{4}-\d{2}-\d{2})?$/i.test(modelId);

      // Build request body
      const requestBody: any = {
        model: modelId
      };

      if (isClaude) {
        // Adaptive thinking: supported on opus-4-*, sonnet-4-6, 3-7-sonnet.
        // Haiku 4.5 / Sonnet 4.5 do not support it — omit the thinking param for those.
        // output_config.effort applies independently of thinking and affects response thoroughness.
        const apiModelId = (model.apiModelId || modelId).toLowerCase();
        const supportsAdaptiveThinking = /^claude-(opus-4|sonnet-4-6|sonnet-5|fable-5|mythos-5|3-7-sonnet)/.test(apiModelId);
        const thinkingOn = supportsAdaptiveThinking && model.thinkingEnabled !== false;
        const effortLevel = model.reasoningEffort || null;
        requestBody.max_tokens = thinkingOn ? 65536 : 4096;
        requestBody.system = prompt;
        requestBody.messages = [{ role: "user", content: question }];
        if (thinkingOn) {
          requestBody.thinking = { type: "adaptive" };
        }
        if (supportsAdaptiveThinking && effortLevel) {
          requestBody.output_config = { effort: effortLevel };
        }
      } else if (isO1Model) {
        requestBody.messages = [
          { role: "user", content: `${prompt}\n\n${question}` }
        ];
      } else {
        requestBody.messages = [
          { role: "system", content: prompt },
          { role: "user", content: question }
        ];
        requestBody.temperature = temperature;
        if (model.reasoningEffort && model.provider === 'openai') {
          requestBody.reasoning_effort = model.reasoningEffort;
        }
      }

      const endpoint = getApiEndpoint(storedConfig.baseUrl || "https://api.openai.com/v1", modelId, model.provider);
      const apiHeaders = isClaude
        ? { "Content-Type": "application/json", "x-api-key": storedConfig.key, "anthropic-version": "2023-06-01" }
        : { "Content-Type": "application/json", "Authorization": `Bearer ${storedConfig.key}` };

      const response = await fetch('/api/chat', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: endpoint,
          headers: apiHeaders,
          requestBody: requestBody
        }),
        signal: abortSignal || AbortSignal.timeout(600000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = `API request failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)} [endpoint: ${endpoint}]`;
        
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

      let rawAnswer: string;
      const isRefusal = isClaude && data.stop_reason === "refusal";
      if (isClaude) {
        // Claude returns { content: [{type: "text", text: "..."}, ...] }
        const textBlock = Array.isArray(data.content) ? data.content.find((c: any) => c.type === 'text') : null;
        if (!textBlock && data.stop_reason) {
          console.warn(`[Claude] No text block. stop_reason=${data.stop_reason} content=${JSON.stringify(data.content)}`);
        }
        rawAnswer = textBlock ? textBlock.text : "";
      } else {
        rawAnswer = data.choices[0].message.content || "";
      }

      // Strip reasoning/thinking blocks emitted by models like DeepSeek R1
      // (<think>...</think>) before parsing — the actual answer follows after them.
      let cleanedAnswer = rawAnswer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      // For single questions, strip leading numbering then common punctuation wrappers.
      // e.g. "1. B" → "B", "(B)" → "B", "B." → "B", "B)" → "B"
      cleanedAnswer = cleanedAnswer.replace(/^\s*\d+[.)\-:]\s*/g, '');
      cleanedAnswer = cleanedAnswer.replace(/^[\s(]*([A-Za-z])[\s.)]*$/i, '$1');
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
          error: `${isRefusal ? 'Refusal' : 'Empty response'}: stop_reason=${data.stop_reason ?? 'unknown'}, content=${JSON.stringify(data.content)}, raw="${rawAnswer}"`,
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
          time: duration,
          ...(isRefusal && { refused: true }),
        };
      }

      // Claude uses input_tokens/output_tokens, OpenAI uses prompt_tokens/completion_tokens
      const promptTokens = data.usage?.input_tokens || data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.output_tokens || data.usage?.completion_tokens || 0;
      const tokens = data.usage?.total_tokens || promptTokens + completionTokens || estimateTokenCount(prompt + question + answer);


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

      // Flag for manual review when the answer isn't a clean single letter A-E
      const needsReview = rawAnswer.length > 0 && !/^[A-Za-z]$/.test(answer);
      return {
        answer: needsReview ? '?' : answer,
        correct: needsReview ? false : answer === correctAnswer.toUpperCase(),
        tokens,
        time: duration,
        needsReview,
        rawResponse: needsReview ? rawAnswer : undefined,
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
        if (!storedConfig || (!storedConfig.key && model.provider !== 'ollama')) {
          const errorMsg = `No API configuration for ${model.provider}. Please add API key first.`;
          throw new Error(errorMsg);
        }

        // Create a combined prompt with all questions
        const combinedQuestion = batch.map((q, idx) => 
          `Question ${idx + 1}: ${q.question}`
        ).join('\n\n');

        const modelId = model.apiModelId || model.id;
        const isClaude = model.provider === 'claude';

        // Check if it's an OpenAI reasoning model (o1 series)
        const isO1Model = /^(o1|o3)(-mini|-preview)?(-\d{4}-\d{2}-\d{2})?$/i.test(modelId);

        // Build request body
        const requestBody: any = {
          model: modelId
        };

        if (isClaude) {
          const apiModelId = (model.apiModelId || modelId).toLowerCase();
          const supportsAdaptiveThinking = /^claude-(opus-4|sonnet-4-6|sonnet-5|fable-5|mythos-5|3-7-sonnet)/.test(apiModelId);
          const thinkingOn = supportsAdaptiveThinking && model.thinkingEnabled !== false;
          const effortLevel = model.reasoningEffort || null;
          // Fable 5 / Mythos 5 hard cap is 128000 output tokens
          const maxThinkingTokens = /^claude-(fable-5|mythos-5)/.test(apiModelId) ? 128000 : 131072;
          requestBody.max_tokens = thinkingOn ? maxThinkingTokens : 4096;
          requestBody.system = prompt;
          requestBody.messages = [{ role: "user", content: combinedQuestion }];
          if (thinkingOn) {
            requestBody.thinking = { type: "adaptive" };
          }
          if (supportsAdaptiveThinking && effortLevel) {
            requestBody.output_config = { effort: effortLevel };
          }
        } else if (isO1Model) {
          requestBody.messages = [
            { role: "user", content: `${prompt}\n\n${combinedQuestion}` }
          ];
        } else {
          requestBody.messages = [
            { role: "system", content: prompt },
            { role: "user", content: combinedQuestion }
          ];
          requestBody.temperature = temperature;
          if (model.reasoningEffort && model.provider === 'openai') {
            requestBody.reasoning_effort = model.reasoningEffort;
          }
        }

        console.log(`[Request Body] ${JSON.stringify(requestBody).substring(0, 500)}...`);

        const endpoint = getApiEndpoint(storedConfig.baseUrl || "https://api.openai.com/v1", modelId, model.provider);
        const apiHeaders = isClaude
          ? { "Content-Type": "application/json", "x-api-key": storedConfig.key, "anthropic-version": "2023-06-01" }
          : { "Content-Type": "application/json", "Authorization": `Bearer ${storedConfig.key}` };

        console.log(`[API Call] Provider: ${model.provider}, Endpoint: ${endpoint}, Model: ${modelId}`);

        let response;
        try {
          response = await fetch('/api/chat', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: endpoint,
              headers: apiHeaders,
              requestBody: requestBody
            }),
            signal: abortSignal || AbortSignal.timeout(600000),
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

        const batchRefused = isClaude && data.stop_reason === "refusal";
        let rawText: string;
        if (isClaude) {
          const textBlock = Array.isArray(data.content) ? data.content.find((c: any) => c.type === 'text') : null;
          rawText = textBlock ? textBlock.text : "";
        } else {
          rawText = data.choices[0].message.content || "";
        }
        // Strip reasoning/thinking blocks from models like DeepSeek R1 before parsing
        const responseText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const duration = Date.now() - startTime;
        const promptTokens = data.usage?.input_tokens || data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.output_tokens || data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens || estimateTokenCount(prompt + combinedQuestion + responseText);

        // If the whole batch was refused, mark every question as refused and move on — don't throw
        if (batchRefused) {
          setApiLogs(prev => [...prev, {
            timestamp: Date.now(),
            provider: model.provider,
            model: model.name,
            request: requestBody,
            error: `Batch refused (stop_reason=refusal) for ${batch.length} questions`,
            duration: duration,
            question: `Batch of ${batch.length} questions`,
            questionId: batch.map(q => q.id).join(', '),
            temperature: temperature,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            showFullRequest: false,
          }]);
          batch.forEach(q => {
            results.push({ answer: "ERROR", correct: false, tokens: 0, time: Math.floor(duration / batch.length), refused: true });
          });
          continue;
        }

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

        // Only pause for genuine technical errors (network, rate-limit, etc.).
        // Empty responses that are not refusals are transient — pause and retry.
        const isTechnicalError = responseText.trim().length === 0 ||
          /\b(error|exception|timeout|unauthorized|forbidden|rate.?limit|internal server|bad gateway|service unavailable)\b/i.test(responseText);

        if (errorRate > 0.5 && isTechnicalError) {
          const found = batch.length - errorCount;
          const detail = found === 0
            ? `no answers could be extracted`
            : `model returned only ${found}/${batch.length} answers (incomplete response)`;
          throw new Error(`Response parsing failed: ${detail}. Raw response: "${responseText}"`);
        }
        
        // Create results for each question in the batch
        batch.forEach((q, idx) => {
          const raw = answers[idx] || "ERROR";
          // Strip punctuation wrappers before checking (e.g. "(B)" → "B", "B." → "B")
          const parsedAnswer = raw.replace(/^[\s(]*([A-Za-z])[\s.)]*$/i, '$1').toUpperCase() || raw;
          const needsReview = responseText.length > 0 && !/^[A-Za-z]$/.test(parsedAnswer);
          results.push({
            answer: needsReview ? '?' : parsedAnswer,
            correct: needsReview ? false : parsedAnswer.toUpperCase() === q.answer.toUpperCase(),
            tokens: Math.floor(totalTokens / batch.length),
            time: Math.floor(duration / batch.length),
            needsReview,
            rawResponse: needsReview ? responseText : undefined,
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

    // Primary: matches numbered answers both in multi-line AND single-line responses.
    // Captures any alphanumeric token after the number so that numeric answers like
    // "80" are preserved (they will later be marked wrong via getValidAnswer).
    // Works for: "1. A\n2. B", "1. A 2. 80 3. A", "1) A 2) B", etc.
    const numberedPattern = /(?:^|[\s,;])(\d+)[.)]\s*\(?([A-Za-z][A-Za-z0-9]*|[0-9]+)\)?/gm;
    const allMatches = Array.from(text.matchAll(numberedPattern));

    if (allMatches.length >= expectedCount) {
      // Sort by question number in case the model reordered them
      const sorted = allMatches
        .map(m => ({ num: parseInt(m[1]), val: m[2].toUpperCase() }))
        .sort((a, b) => a.num - b.num)
        .slice(0, expectedCount);
      if (sorted.length === expectedCount) {
        return sorted.map(s => s.val);
      }
    }

    // Fallback: try line-by-line for multi-line responses
    const lines = text.split('\n');
    for (const line of lines) {
      if (answers.length >= expectedCount) break;
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
    
    // Word-boundary letter search — safe: \b prevents matching letters inside words.
    // Finds "A" in "(A)" but NOT "B" in "BMI".
    const letters = text.match(/\b([A-D])\b/gi);

    if (letters && letters.length >= expectedCount) {
      return letters.slice(0, expectedCount).map(l => l.toUpperCase());
    }
    // Keep word-boundary results as partial if they beat what we have
    if (letters && letters.length > answers.length) {
      answers.length = 0;
      letters.forEach(l => answers.push(l.toUpperCase()));
    }

    // Ultra fallback: no word boundaries — only use when enough to fill all slots;
    // never update partial answers (would pick up false positives like "B" in "BMI")
    const looseLetters = text.match(/([A-D])/gi);

    if (looseLetters && looseLetters.length >= expectedCount) {
      return looseLetters.slice(0, expectedCount).map(l => l.toUpperCase());
    }

    // Pad whatever was found with ERROR for missing answers
    while (answers.length < expectedCount) answers.push("ERROR");
    return answers.slice(0, expectedCount);
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

  const verifyApiKey = async (configId?: string, configOverride?: StoredApiConfig): Promise<number> => {
    setIsLoading(true);

    try {
      let newModels: Model[] = [];
      let totalModelCount = 0;
      let configsToVerify: StoredApiConfig[] = [];

      // Determine which configs to verify
      if (configId) {
        // Use the override if provided (avoids stale React state when called immediately
        // after setStoredApiConfigs, before the state update has been committed).
        const config = configOverride || storedApiConfigs.find(config => config.id === configId);
        if (!config) {
          const currentProviderConfigs = storedApiConfigs.filter(c => c.provider === currentProvider);
          if (currentProviderConfigs.length > 0) {
            configsToVerify = [currentProviderConfigs[0]];
          } else {
            const apiKey = getApiKey();
            if (!apiKey && currentProvider !== 'ollama') {
              throw new Error("Please enter an API key");
            }
            configsToVerify = [{
              id: 'temp-' + Date.now(),
              provider: currentProvider,
              key: apiKey || '',
              maskedKey: apiKey ? apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 6) : '(no key)',
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
        if (!apiKey && currentProvider !== 'ollama') {
          throw new Error("Please enter an API key");
        }
        // Create a temporary config for verification
        configsToVerify = [{
          id: 'temp',
          provider: currentProvider,
          key: apiKey || '',
          maskedKey: apiKey ? apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 6) : '(no key)',
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
                headers: provider === 'claude'
                  ? {
                      'x-api-key': apiKey,
                      'anthropic-version': '2023-06-01',
                      'Content-Type': 'application/json'
                    }
                  : {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json'
                    }
              }),
              signal: controller.signal
            });
          
          if (!response.ok) {
            let cleanError = "";
            try {
              const errBody = await response.json();
              cleanError = String(errBody?.error || "").substring(0, 200);
            } catch { /* ignore */ }
            const providerLabel = provider === 'openai' ? 'OpenAI' : provider === 'deepseek' ? 'DeepSeek' : provider === 'claude' ? 'Claude' : provider === 'ollama' ? 'Ollama' : 'OpenWebUI';

            console.warn(`[Models Fetch] Status ${response.status} from ${providerLabel} (${modelsEndpoint})`);

            if (response.status === 401 || response.status === 403) {
              toast({
                title: `${providerLabel} Authentication Error`,
                description: cleanError || `Invalid or expired API key. Please update your ${providerLabel} API key.`,
                status: "error",
                duration: 6000,
                isClosable: true,
              });
            } else if (response.status === 404) {
              toast({
                title: `${providerLabel} API Not Found (404)`,
                description: `Could not reach ${modelsEndpoint}. Make sure the server is running and the Base URL is correct.`,
                status: "error",
                duration: 6000,
                isClosable: true,
              });
            } else {
              toast({
                title: `${providerLabel} API Error (${response.status})`,
                description: cleanError || `Failed to fetch models. Check the Base URL and API key.`,
                status: "error",
                duration: 5000,
                isClosable: true,
              });
            }

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
            
            // Check for specific GPT-5.6 model (most specific first)
            // Matches: gpt-5.6, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, and dated variants
            const isGPT56 = /^gpt-5\.6(?:-(sol|terra|luna))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            const isGPT56Pro = /^gpt-5\.6-pro(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);

            // Check for specific GPT-5.5 model
            const isGPT55 = /^gpt-5\.5(?:-pro)?(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            const isGPT55Pro = /^gpt-5\.5-pro(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);

            // Check for specific GPT-5.4 model
            const isGPT54 = /^gpt-5\.4(?:-pro)?(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            const isGPT54Pro = /^gpt-5\.4-pro(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            
            // Check for base GPT-5 (not 5.4 or 5.5)
            const isGPT5Base = /^gpt-5(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            
            // Matches: gpt-5-mini, gpt-5-nano, and all dated versions
            const isGPT5MiniOrNano = /^gpt-5-(mini|nano)(?:-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            
            // Check if this is an O-series model that supports reasoning_effort (excluding o1-mini)
            // Matches: o1, o3, o3-mini, o4-mini, o1-2024-12-17, o3-2024-12-17, o3-mini-2024-12-17, etc.
            const isOSeriesWithReasoning = /^(o1|o3|o3-mini|o4-mini)(-\d{4}-\d{2}-\d{2})?$/i.test(model.id);
            
            if (provider === 'openai') {
              if (isGPT56Pro) {
                // GPT-5.6 Pro: medium, high, xhigh, max (always-on reasoning, higher tiers only)
                const reasoningEfforts = [
                  { effort: 'medium', suffix: ' (Medium reasoning - Default)' },
                  { effort: 'high', suffix: ' (High reasoning)' },
                  { effort: 'xhigh', suffix: ' (XHigh reasoning)' },
                  { effort: 'max', suffix: ' (Max reasoning)' }
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
              } else if (isGPT56) {
                // GPT-5.6 (sol/terra/luna/bare): none, low, medium (default), high, xhigh, max
                const reasoningEfforts = [
                  { effort: 'none', suffix: ' (No reasoning)' },
                  { effort: 'low', suffix: ' (Low reasoning)' },
                  { effort: 'medium', suffix: ' (Medium reasoning - Default)' },
                  { effort: 'high', suffix: ' (High reasoning)' },
                  { effort: 'xhigh', suffix: ' (XHigh reasoning)' },
                  { effort: 'max', suffix: ' (Max reasoning)' }
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
              } else if (isGPT55) {
                // GPT-5.5: none, low, medium (default), high, xhigh
                const reasoningEfforts = [
                  { effort: 'none', suffix: ' (No reasoning)' },
                  { effort: 'low', suffix: ' (Low reasoning)' },
                  { effort: 'medium', suffix: ' (Medium reasoning - Default)' },
                  { effort: 'high', suffix: ' (High reasoning)' },
                  { effort: 'xhigh', suffix: ' (XHigh reasoning)' }
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
              } else if (isGPT54Pro) {
                // GPT-5.4 Pro: medium, high, xhigh
                const reasoningEfforts = [
                  { effort: 'medium', suffix: ' (Medium reasoning - Default)' },
                  { effort: 'high', suffix: ' (High reasoning)' },
                  { effort: 'xhigh', suffix: ' (XHigh reasoning)' }
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
              } else if (isGPT54) {
                // GPT-5.4: none (default), low, medium, high, xhigh
                const reasoningEfforts = [
                  { effort: 'none', suffix: ' (No reasoning - Default)' },
                  { effort: 'low', suffix: ' (Low reasoning)' },
                  { effort: 'medium', suffix: ' (Medium reasoning)' },
                  { effort: 'high', suffix: ' (High reasoning)' },
                  { effort: 'xhigh', suffix: ' (XHigh reasoning)' }
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
              } else if (isGPT5Base) {
                // GPT-5 base model: minimal, low, medium (default), high
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
            } else if (provider === 'claude') {
              // fable-5 / mythos-5: thinking is always on, cannot be disabled.
              // opus-4-*, sonnet-4-6, sonnet-5, 3-7-sonnet: thinking optional.
              // sonnet-4-5 and haiku-4-5 do NOT support thinking.
              const isAlwaysThinking = /^claude-(fable-5|mythos-5)/i.test(model.id);
              const isClaudeWithThinking = isAlwaysThinking || /^claude-(3-7-sonnet|opus-4|sonnet-4-6|sonnet-5)/i.test(model.id);
              if (isClaudeWithThinking) {
                const isHighTier = /^claude-(opus-4|fable-5|mythos-5)/i.test(model.id);
                const effortLevels: { effort: string }[] = [
                  { effort: 'low' },
                  { effort: 'medium' },
                  { effort: 'high' },
                  ...(isHighTier ? [{ effort: 'xhigh' }, { effort: 'max' }] : []),
                ];

                // No thinking variants — not available for always-thinking models (fable-5, mythos-5)
                if (!isAlwaysThinking) {
                  providerModels.push({
                    id: `${baseId}-no-thinking`,
                    name: `${model.id} (No thinking)`,
                    provider,
                    apiModelId: model.id,
                    thinkingEnabled: false,
                  });
                  effortLevels.forEach(({ effort }) => {
                    providerModels.push({
                      id: `${baseId}-no-thinking-${effort}`,
                      name: `${model.id} (No thinking · ${effort.charAt(0).toUpperCase() + effort.slice(1)} effort)`,
                      provider,
                      apiModelId: model.id,
                      thinkingEnabled: false,
                      reasoningEffort: effort,
                    });
                  });
                }

                // Thinking variants
                providerModels.push({
                  id: baseId,
                  name: `${model.id} (Auto thinking)`,
                  provider,
                  apiModelId: model.id,
                  thinkingEnabled: true,
                });
                effortLevels.forEach(({ effort }) => {
                  const label = effort.charAt(0).toUpperCase() + effort.slice(1);
                  providerModels.push({
                    id: `${baseId}-thinking-${effort}`,
                    name: `${model.id} (${label} thinking)`,
                    provider,
                    apiModelId: model.id,
                    thinkingEnabled: true,
                    reasoningEffort: effort,
                  });
                });
              } else {
                providerModels.push({
                  id: baseId,
                  name: model.id,
                  provider,
                  apiModelId: model.id,
                });
              }
            } else {
              // Other providers (deepseek, ollama, openwebui) - regular models
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

          // If the endpoint returned 200 but no models, the key may be wrong or the server has no models
          if (providerModels.length === 0) {
            const providerLabels: Record<string, string> = { openai: 'OpenAI', deepseek: 'DeepSeek', claude: 'Claude', ollama: 'Ollama', openwebui: 'Open WebUI' };
            const providerLabel = providerLabels[provider as string] ?? provider;
            toast({
              title: `No models returned from ${providerLabel}`,
              description: `The API responded but returned 0 models. Check your API key and base URL.`,
              status: "warning",
              duration: 5000,
              isClosable: true,
            });
          }

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
          
          // If DeepSeek fails for a non-auth reason, fall back to default models.
          // Auth failures (401/403) mean the key is wrong — don't pretend it worked.
          const isAuthError = error instanceof Error && /status (401|403)/.test(error.message);
          if (provider === 'deepseek' && !isAuthError) {
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
      // Only update the model list if we actually loaded models (or this is a full refresh).
      // When verifying a single config that returned 0 models, keep existing models intact.
      const isSingleConfig = !!configId;
      if (!isSingleConfig || newModels.length > 0) {
        setAvailableModels(prevModels => {
          let updatedModels;

          if (configId) {
            const config = configOverride || storedApiConfigs.find(c => c.id === configId);
            if (config) {
              const filteredModels = prevModels.filter(m => m.provider !== config.provider);
              updatedModels = [...filteredModels, ...newModels];
            } else {
              const existingIds = new Set(prevModels.map(m => m.id));
              const uniqueNewModels = newModels.filter(model => !existingIds.has(model.id));
              updatedModels = [...prevModels, ...uniqueNewModels];
            }
          } else if (storedApiConfigs.length > 0 && configsToVerify.length === storedApiConfigs.length) {
            updatedModels = newModels;
          } else {
            const verifiedProviders = new Set(configsToVerify.map(c => c.provider));
            const filteredModels = prevModels.filter(m => !verifiedProviders.has(m.provider));
            const existingIds = new Set(filteredModels.map(m => m.id));
            const uniqueNewModels = newModels.filter(model => !existingIds.has(model.id));
            updatedModels = [...filteredModels, ...uniqueNewModels];
          }

          const deduplicatedModels = deduplicateModelsById(updatedModels);
          localStorage.setItem('availableModels', JSON.stringify(deduplicatedModels));
          return deduplicatedModels;
        });
      }

      // Only show the success toast when not called from addApiConfig (which shows its own)
      if (!configOverride) {
        toast({
          title: `Models loaded`,
          description: `${totalModelCount} models available from ${configsToVerify.length} API configuration(s)`,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }

      return totalModelCount;
    } catch (error) {
      toast({
        title: `Error loading models`,
        description: error instanceof Error ? error.message : "Please check your API configurations",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return 0;
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
    <>
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
        overflowY="auto"
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
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="ollama">Ollama</option>
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
                      <HStack spacing={0} fontSize="10px" color="gray.500" flexWrap="wrap">
                        <Text>Supported providers:</Text>
                        <Text fontWeight="medium" color="blue.600" ml={1}>OpenAI</Text>
                        <Text mx={1}>•</Text>
                        <Text fontWeight="medium" color="blue.600">DeepSeek</Text>
                        <Text mx={1}>•</Text>
                        <Text fontWeight="medium" color="blue.600">Claude</Text>
                        <Text mx={1}>•</Text>
                        <Text fontWeight="medium" color="blue.600">Ollama</Text>
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
                               config.provider === 'claude' ? 'Claude' :
                               config.provider === 'ollama' ? 'Ollama' :
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
                        isDisabled={isEvaluating && !isPaused}
                        title={isEvaluating && !isPaused ? "Pause the evaluation to add models" : undefined}
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
                          (() => {
                            const providerLabel = (p: string) =>
                              p === 'openai' ? 'OpenAI' : p === 'deepseek' ? 'DeepSeek' : p === 'claude' ? 'Claude' : p === 'ollama' ? 'Ollama' : 'OpenWebUI';
                            // Find names that appear from more than one provider
                            const nameCounts: Record<string, Set<string>> = {};
                            availableModels.forEach(m => {
                              if (!nameCounts[m.name]) nameCounts[m.name] = new Set();
                              nameCounts[m.name].add(m.provider);
                            });
                            return availableModels
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
                                      if (prev.some(m => m.id === model.id)) return prev;
                                      return [...prev, model];
                                    });
                                    setModelSearch("");
                                  }}
                                  py={2}
                                  bg="gray.50"
                                  _hover={{ bg: "gray.100" }}
                                >
                                  {model.name}
                                  {(nameCounts[model.name]?.size ?? 0) > 1 && (
                                    <Text as="span" fontSize="xs" color="gray.500" ml={1}>
                                      ({providerLabel(model.provider)})
                                    </Text>
                                  )}
                                </MenuItem>
                              ));
                          })()
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
                      // Ollama doesn't require a key — treat it as always valid
                      const hasValidKey = model.provider === 'ollama' || getActiveApiKeyForProvider(model.provider as Provider) !== null;
                      // Lock models that have already started or are in progress — removing them would
                      // shift indices and corrupt the currentModelIndex on resume
                      const currentModelIdx = evaluationState?.currentModelIndex ?? -1;
                      const isModelLocked = (isEvaluating && !isPaused) ||
                        ((isEvaluating || isPaused) && evaluationState !== null && index <= currentModelIdx);
                      const lockReason = !isEvaluating && !isPaused ? undefined
                        : index < currentModelIdx ? "Already evaluated"
                        : index === currentModelIdx ? "Currently in progress"
                        : (isEvaluating && !isPaused) ? "Pause to remove" : undefined;
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
                                isDisabled={isModelLocked}
                                title={lockReason}
                                p={1}
                                height="auto"
                                minW="auto"
                                _hover={{ opacity: isModelLocked ? undefined : 0.8 }}
                              >
                                ✕
                              </Button>
                            </HStack>
                          </HStack>
                        </Box>
                      );
                    })}
                  </Flex>
                  {isPaused && evaluationState && (
                    <Text fontSize="xs" color="blue.500" mt={2}>
                      New models added now will be evaluated after the current one finishes. Models already started cannot be removed.
                    </Text>
                  )}
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
          p={4}
          borderRadius="lg"
          bg="white"
          boxShadow="lg"
          border="1px"
          borderColor="blue.100"
          scroll-margin-top="2rem"
        >
          <HStack spacing={2} mb={3}>
            <Box p={1.5} bg="blue.100" borderRadius="md">
              <Text fontSize="sm" color="blue.600">⚙️</Text>
            </Box>
            <Heading size="sm">LLMs Configuration</Heading>
          </HStack>

          <HStack spacing={6} align="flex-start">
            {/* Left: temperature + buttons */}
            <VStack spacing={6} align="stretch" flex="2">
              <FormControl>
                <HStack justify="space-between" mb={1}>
                  <FormLabel fontSize="sm" mb={0}>Temperature</FormLabel>
                  <Text fontSize="sm" fontWeight="semibold" color="blue.600">{temperature}</Text>
                </HStack>
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
                {selectedModels.some(m =>
                  m.provider === 'claude' ||
                  /^(o1|o3)(-mini|-preview)?(-\d{4}-\d{2}-\d{2})?$/i.test(m.apiModelId || m.id)
                ) && (
                  <Text fontSize="xs" color="orange.500" mt={1}>
                    Ignored by{' '}
                    {selectedModels
                      .filter(m =>
                        m.provider === 'claude' ||
                        /^(o1|o3)(-mini|-preview)?(-\d{4}-\d{2}-\d{2})?$/i.test(m.apiModelId || m.id)
                      )
                      .map(m => m.name)
                      .join(', ')}
                  </Text>
                )}
              </FormControl>

              <HStack spacing={3}>
                <Button
                  colorScheme="blue"
                  flex="1"
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
                  minW="90px"
                  onClick={pauseEvaluation}
                  isDisabled={!isEvaluating || isPaused || shouldPauseEvaluation}
                  _hover={{ bg: isEvaluating && !isPaused ? "orange.50" : undefined }}
                >
                  {shouldPauseEvaluation ? "Pausing…" : isPaused ? "Paused" : "Pause"}
                </Button>
                <Button
                  variant="ghost"
                  colorScheme="red"
                  size="md"
                  minW="70px"
                  onClick={stopEvaluation}
                  isDisabled={!isEvaluating && !isPaused}
                  opacity={(!isEvaluating && !isPaused) ? 0.3 : shouldStopEvaluation ? 0.6 : 1}
                  _hover={{ bg: (isEvaluating || isPaused) ? "red.50" : undefined }}
                >
                  {shouldStopEvaluation ? "Stopping…" : "Stop"}
                </Button>
              </HStack>

              {reviewQueue.length > 0 && (
                <Button
                  size="md"
                  colorScheme="orange"
                  variant="solid"
                  onClick={() => { setReviewModalIndex(0); setReviewModalOpen(true); }}
                >
                  Review Answers
                  <Badge ml={2} colorScheme="red" borderRadius="full" fontSize="xs">{reviewQueue.length}</Badge>
                </Button>
              )}

              {isEvaluating && (
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="xs" color="blue.600">Progress</Text>
                    <Text fontSize="xs" color="blue.600">{Math.round((progress.current / progress.total) * 100)}%</Text>
                  </HStack>
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
            </VStack>

            {/* Right: unified system prompt */}
            <FormControl flex="3">
              <FormLabel fontSize="sm">System Prompt</FormLabel>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter system prompt (used for both single and batched trials)"
                rows={5}
                bg="gray.50"
                size="sm"
              />
              <Text fontSize="xs" color="gray.500" mt={1}>
                If the model doesn't follow the format, answers are flagged for manual review.
              </Text>
            </FormControl>
          </HStack>
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
                                  {([modelResult.trial1, modelResult.trial2, modelResult.trial3] as const).map((trial, ti) => (
                                    <Td
                                      key={ti}
                                      borderRight="1px"
                                      borderColor="gray.100"
                                      fontSize="xs"
                                      fontWeight="bold"
                                      bg={trial?.aborted || !trial?.answer ? "white" : trial.correct ? "green.100" : "red.100"}
                                      maxW="60px"
                                      overflow="hidden"
                                      textOverflow="ellipsis"
                                      whiteSpace="nowrap"
                                      title={trial?.answer || '-'}
                                    >
                                      {!trial?.answer || trial.aborted ? '-' : trial.correct ? trial.answer : trial.answer === 'ERROR' ? 'ERROR' : trial.answer === 'WRONG' ? 'Wrong' : trial.answer}
                                    </Td>
                                  ))}
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
                    <Text fontSize="lg" fontWeight="bold" mb={-4}>Overall Accuracy</Text>
                    <Text fontSize="sm" color="gray.600">
                      For each model, accuracy is measured as the percentage of questions answered correctly across 3 independent trials — showing not just whether a model knows the answer, but how reliably it performs from one attempt to the next.
                    </Text>

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
                    {/* Overall Accuracy: dynamic summary */}
                    {trialResults.length > 0 && (() => {
                      const modelAccs = selectedModels.map(model => {
                        let t1c = 0, t2c = 0, t3c = 0, total = 0;
                        trialResults.forEach(qResult => {
                          const mr = qResult.modelResults[model.id];
                          if (!mr) return;
                          total++;
                          if (mr.trial1?.correct) t1c++;
                          if (mr.trial2?.correct) t2c++;
                          if (mr.trial3?.correct) t3c++;
                        });
                        const avg = total > 0 ? ((t1c + t2c + t3c) / (total * 3)) * 100 : 0;
                        return { model, avg, total };
                      }).filter(d => d.total > 0);
                      if (modelAccs.length === 0) return null;
                      const sorted = [...modelAccs].sort((a, b) => b.avg - a.avg);
                      const best = sorted[0];
                      const worst = sorted[sorted.length - 1];
                      const spread = best.avg - worst.avg;
                      const above70 = sorted.filter(d => d.avg >= 70).length;
                      const above50 = sorted.filter(d => d.avg >= 50).length;
                      let summary = `${best.model.name} led with ${best.avg.toFixed(1)}% average accuracy across all 3 trials`;
                      if (sorted.length > 1) {
                        summary += `, while ${worst.model.name} scored the lowest at ${worst.avg.toFixed(1)}% — a spread of ${spread.toFixed(1)} pp`;
                      }
                      summary += `. ${above70} of ${sorted.length} model${sorted.length !== 1 ? 's' : ''} scored above 70%`;
                      if (above70 !== above50) summary += `, ${above50} above 50%`;
                      summary += '.';
                      return (
                        <Box bg="teal.50" borderRadius="md" p={3} borderWidth="1px" borderColor="teal.100">
                          <Text fontSize="xs" fontWeight="semibold" color="teal.700" mb={1}>Key Insights</Text>
                          <Text fontSize="xs" color="gray.700">{summary}</Text>
                        </Box>
                      );
                    })()}
                  </VStack>
                </Box>
              )}

              {/* Accuracy Per Question Class Section */}
              {activeResultTab === "summary" && hasClassColumn && (
                <Box mt={6}>
                  <VStack spacing={4} align="stretch">
                    {/* Title */}
                    <Text fontSize="lg" fontWeight="bold" mb={-4}>Accuracy Per Question Class</Text>
                    <Text fontSize="sm" color="gray.600">
                      Breaks down accuracy by question category, showing how each model performs across different topic areas or difficulty levels — revealing whether a model's strengths and weaknesses are uniform or specific to certain classes.
                    </Text>

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
                    {/* Accuracy Per Class: dynamic summary */}
                    {trialResults.length > 0 && (() => {
                      const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort() as string[];
                      if (classes.length === 0) return null;
                      // avg accuracy per class across all models and trials
                      const classAvgs = classes.map(cls => {
                        let correct = 0, total = 0;
                        selectedModels.forEach(model => {
                          trialResults.filter(r => r.class === cls).forEach(qResult => {
                            const mr = qResult.modelResults[model.id];
                            if (!mr) return;
                            if (mr.trial1 && !mr.trial1.aborted) { total++; if (mr.trial1.correct) correct++; }
                            if (mr.trial2 && !mr.trial2.aborted) { total++; if (mr.trial2.correct) correct++; }
                            if (mr.trial3 && !mr.trial3.aborted) { total++; if (mr.trial3.correct) correct++; }
                          });
                        });
                        return { cls, avg: total > 0 ? (correct / total) * 100 : 0, total };
                      }).filter(d => d.total > 0);
                      if (classAvgs.length === 0) return null;
                      const sorted = [...classAvgs].sort((a, b) => b.avg - a.avg);
                      const hardest = sorted[sorted.length - 1];
                      const easiest = sorted[0];
                      const spread = easiest.avg - hardest.avg;
                      // Per-model best and worst class
                      const modelBest = selectedModels.map(model => {
                        const perCls = classes.map(cls => {
                          let correct = 0, total = 0;
                          trialResults.filter(r => r.class === cls).forEach(qResult => {
                            const mr = qResult.modelResults[model.id];
                            if (!mr) return;
                            if (mr.trial1 && !mr.trial1.aborted) { total++; if (mr.trial1.correct) correct++; }
                            if (mr.trial2 && !mr.trial2.aborted) { total++; if (mr.trial2.correct) correct++; }
                            if (mr.trial3 && !mr.trial3.aborted) { total++; if (mr.trial3.correct) correct++; }
                          });
                          return { cls, avg: total > 0 ? (correct / total) * 100 : null };
                        }).filter(d => d.avg !== null) as { cls: string; avg: number }[];
                        if (perCls.length === 0) return null;
                        perCls.sort((a, b) => b.avg - a.avg);
                        return { model: model.name, best: perCls[0], worst: perCls[perCls.length - 1] };
                      }).filter(Boolean) as { model: string; best: { cls: string; avg: number }; worst: { cls: string; avg: number } }[];
                      let summary = `"${easiest.cls}" was the strongest class (avg ${easiest.avg.toFixed(1)}% correct across all models and trials)`;
                      if (sorted.length > 1) {
                        summary += `, while "${hardest.cls}" was the most challenging at ${hardest.avg.toFixed(1)}%`;
                        if (spread > 10) summary += ` — a ${spread.toFixed(1)} pp gap`;
                      }
                      summary += '.';
                      if (modelBest.length > 1) {
                        const topModelInEasiest = [...modelBest].sort((a, b) => (b.best.cls === easiest.cls ? b.best.avg : 0) - (a.best.cls === easiest.cls ? a.best.avg : 0))[0];
                        const gaps = modelBest.filter(m => m.best.avg - m.worst.avg > 0);
                        if (gaps.length > 0) {
                          const widestGap = gaps.sort((a, b) => (b.best.avg - b.worst.avg) - (a.best.avg - a.worst.avg))[0];
                          summary += ` ${widestGap.model} showed the largest class gap (${widestGap.best.cls}: ${widestGap.best.avg.toFixed(1)}% vs ${widestGap.worst.cls}: ${widestGap.worst.avg.toFixed(1)}%).`;
                        }
                      }
                      return (
                        <Box bg="teal.50" borderRadius="md" p={3} borderWidth="1px" borderColor="teal.100">
                          <Text fontSize="xs" fontWeight="semibold" color="teal.700" mb={1}>Key Insights</Text>
                          <Text fontSize="xs" color="gray.700">{summary}</Text>
                        </Box>
                      );
                    })()}
                  </VStack>
                </Box>
              )}

              {/* Consistency and Reliability Section */}
              {activeResultTab === "summary" && trialResults.length > 0 && (
                <Box mt={8}>
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="lg" fontWeight="bold" mb={-4}>Consistency and Reliability</Text>
                    <Text fontSize="sm" color="gray.600">
                      For each model, questions are classified by their correctness pattern across all 3 trials: Always Correct (right every time), Always Incorrect (wrong every time with the same answer), and Variable (mixed results). This reveals how much of a model's error profile comes from genuine inconsistency versus systematic wrong answers.
                    </Text>

                    <HStack spacing={2} wrap="wrap" justify="space-between">
                      <HStack spacing={2}>
                        <Button
                          size="xs"
                          variant={activeConsistencyView === "table" ? "solid" : "outline"}
                          colorScheme="blue"
                          onClick={() => setActiveConsistencyView("table")}
                        >
                          Table
                        </Button>
                        <Button
                          size="xs"
                          variant={activeConsistencyView === "charts" ? "solid" : "outline"}
                          colorScheme="blue"
                          onClick={() => setActiveConsistencyView("charts")}
                        >
                          Chart
                        </Button>
                      </HStack>
                      {activeConsistencyView === "table" ? (
                        <Button
                          size="xs"
                          colorScheme="blue"
                          variant="outline"
                          onClick={exportConsistencyTable}
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
                            <MenuItem onClick={() => exportChartById('consistency-chart-container', 'png', 'consistency_reliability')} fontSize="sm">
                              Export as PNG
                            </MenuItem>
                            <MenuItem onClick={() => exportChartById('consistency-chart-container', 'svg', 'consistency_reliability')} fontSize="sm">
                              Export as SVG
                            </MenuItem>
                          </MenuList>
                        </Menu>
                      )}
                    </HStack>

                    {activeConsistencyView === "table" && (() => {
                      return (
                        <Box borderWidth="1px" borderRadius="md" p={3} bg="white">
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple">
                              <Thead>
                                <Tr>
                                  <Th>Model</Th>
                                  <Th isNumeric color="green.600">Always Correct</Th>
                                  <Th isNumeric color="orange.500">Variable</Th>
                                  <Th isNumeric color="red.500">Always Incorrect</Th>
                                  <Th isNumeric>Total</Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {selectedModels.map(model => {
                                  let alwaysCorrect = 0, alwaysIncorrect = 0, variable = 0, total = 0;
                                  trialResults.forEach(qResult => {
                                    const mr = qResult.modelResults[model.id];
                                    if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                                    if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                                    total++;
                                    const c1 = mr.trial1.correct;
                                    const c2 = mr.trial2.correct;
                                    const c3 = mr.trial3.correct;
                                    if (c1 && c2 && c3) alwaysCorrect++;
                                    else if (!c1 && !c2 && !c3) alwaysIncorrect++;
                                    else variable++;
                                  });
                                  const acPct = total > 0 ? (alwaysCorrect / total) * 100 : 0;
                                  const vPct  = total > 0 ? (variable / total) * 100 : 0;
                                  const aiPct = total > 0 ? (alwaysIncorrect / total) * 100 : 0;
                                  return (
                                    <Tr key={model.id}>
                                      <Td fontWeight="medium" fontSize="xs">{model.name}</Td>
                                      <Td isNumeric>
                                        <Text color="green.600" fontWeight="bold" fontSize="xs">{acPct.toFixed(1)}%</Text>
                                        <Text fontSize="xs" color="gray.500">({alwaysCorrect}/{total})</Text>
                                      </Td>
                                      <Td isNumeric>
                                        <Text color="orange.500" fontWeight="bold" fontSize="xs">{vPct.toFixed(1)}%</Text>
                                        <Text fontSize="xs" color="gray.500">({variable}/{total})</Text>
                                      </Td>
                                      <Td isNumeric>
                                        <Text color="red.500" fontWeight="bold" fontSize="xs">{aiPct.toFixed(1)}%</Text>
                                        <Text fontSize="xs" color="gray.500">({alwaysIncorrect}/{total})</Text>
                                      </Td>
                                      <Td isNumeric fontSize="xs" color="gray.600">{total}</Td>
                                    </Tr>
                                  );
                                })}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                      );
                    })()}

                    {activeConsistencyView === "charts" && (() => {
                      const consistencyData = selectedModels.map(model => {
                        let alwaysCorrect = 0, alwaysIncorrect = 0, variable = 0, total = 0;
                        trialResults.forEach(qResult => {
                          const mr = qResult.modelResults[model.id];
                          if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                          if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                          total++;
                          const c1 = mr.trial1.correct;
                          const c2 = mr.trial2.correct;
                          const c3 = mr.trial3.correct;
                          if (c1 && c2 && c3) alwaysCorrect++;
                          else if (!c1 && !c2 && !c3) alwaysIncorrect++;
                          else variable++;
                        });
                        return { alwaysCorrect, variable, alwaysIncorrect, total };
                      });

                      return (
                        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                          <Box id="consistency-chart-container" h="480px" position="relative">
                            <Bar
                              data={{
                                labels: selectedModels.map(m =>
                                  m.name.length > 25 ? m.name.substring(0, 22) + '...' : m.name
                                ),
                                datasets: [
                                  {
                                    label: 'Always Correct',
                                    data: consistencyData.map(d =>
                                      d.total > 0 ? (d.alwaysCorrect / d.total) * 100 : 0
                                    ),
                                    backgroundColor: '#22c55e',
                                    borderColor: '#16a34a',
                                    borderWidth: 1,
                                  },
                                  {
                                    label: 'Variable',
                                    data: consistencyData.map(d =>
                                      d.total > 0 ? (d.variable / d.total) * 100 : 0
                                    ),
                                    backgroundColor: '#f59e0b',
                                    borderColor: '#d97706',
                                    borderWidth: 1,
                                  },
                                  {
                                    label: 'Always Wrong',
                                    data: consistencyData.map(d =>
                                      d.total > 0 ? (d.alwaysIncorrect / d.total) * 100 : 0
                                    ),
                                    backgroundColor: '#ef4444',
                                    borderColor: '#dc2626',
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
                                      font: { size: 12, weight: 600 },
                                      padding: 15,
                                    },
                                  },
                                  title: {
                                    display: true,
                                    text: 'Consistency and Reliability',
                                    font: { size: 16, weight: 'bold' },
                                    padding: { bottom: 20 },
                                  },
                                  tooltip: {
                                    callbacks: {
                                      label: function(context) {
                                        const idx = context.dataIndex;
                                        const d = consistencyData[idx];
                                        const count = context.datasetIndex === 0 ? d.alwaysCorrect
                                          : context.datasetIndex === 1 ? d.variable
                                          : d.alwaysIncorrect;
                                        return `${context.dataset.label}: ${(context.parsed.y ?? 0).toFixed(1)}% (${count}/${d.total})`;
                                      }
                                    }
                                  }
                                },
                                scales: {
                                  x: {
                                    stacked: true,
                                    ticks: { font: { size: 11, weight: 600 } },
                                    grid: { display: false },
                                  },
                                  y: {
                                    stacked: true,
                                    beginAtZero: true,
                                    max: 100,
                                    ticks: {
                                      callback: function(value) { return value + '%'; },
                                      font: { size: 12 },
                                    },
                                    grid: { color: '#ddd' },
                                  },
                                },
                              }}
                            />
                          </Box>
                        </Box>
                      );
                    })()}

                    {/* Consistency and Reliability: dynamic summary */}
                    {(() => {
                      const stats = selectedModels.map(model => {
                        let ac = 0, variable = 0, ai = 0, total = 0;
                        trialResults.forEach(qResult => {
                          const mr = qResult.modelResults[model.id];
                          if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                          if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                          total++;
                          const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
                          if (c1 && c2 && c3) ac++;
                          else if (!c1 && !c2 && !c3) ai++;
                          else variable++;
                        });
                        return { model, ac, variable, ai, total,
                          acPct: total > 0 ? (ac / total) * 100 : 0,
                          varPct: total > 0 ? (variable / total) * 100 : 0,
                          aiPct: total > 0 ? (ai / total) * 100 : 0,
                        };
                      }).filter(d => d.total > 0);
                      if (stats.length === 0) return null;
                      const mostConsistent = [...stats].sort((a, b) => b.acPct - a.acPct)[0];
                      const mostVariable   = [...stats].sort((a, b) => b.varPct - a.varPct)[0];
                      const totalErrors    = stats.reduce((s, d) => s + d.variable + d.ai, 0);
                      const varErrors      = stats.reduce((s, d) => s + d.variable, 0);
                      const varShare = totalErrors > 0 ? (varErrors / totalErrors) * 100 : 0;
                      let summary = `${mostConsistent.model.name} was the most consistent model, answering ${mostConsistent.acPct.toFixed(1)}% of questions correctly in all 3 trials`;
                      if (stats.length > 1) {
                        summary += `. ${mostVariable.model.name} had the highest variability at ${mostVariable.varPct.toFixed(1)}% variable questions`;
                      }
                      summary += `. Across all models, ${varShare.toFixed(0)}% of incorrect responses stem from inconsistency (variable) rather than systematic wrong answers (always incorrect).`;
                      return (
                        <Box bg="orange.50" borderRadius="md" p={3} borderWidth="1px" borderColor="orange.100">
                          <Text fontSize="xs" fontWeight="semibold" color="orange.700" mb={1}>Key Insights</Text>
                          <Text fontSize="xs" color="gray.700">{summary}</Text>
                        </Box>
                      );
                    })()}
                  </VStack>
                </Box>
              )}

              {/* Consistency and Reliability Per Class Section */}
              {activeResultTab === "summary" && trialResults.length > 0 && hasClassColumn && (() => {
                const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort() as string[];
                if (classes.length === 0) return null;
                const MODEL_COLORS = [
                  { bg: '#3b82f6', border: '#2563eb' }, { bg: '#ef4444', border: '#dc2626' },
                  { bg: '#22c55e', border: '#16a34a' }, { bg: '#f59e0b', border: '#d97706' },
                  { bg: '#8b5cf6', border: '#7c3aed' }, { bg: '#06b6d4', border: '#0891b2' },
                  { bg: '#f97316', border: '#ea580c' }, { bg: '#ec4899', border: '#db2777' },
                  { bg: '#14b8a6', border: '#0d9488' }, { bg: '#6366f1', border: '#4f46e5' },
                ];
                const classModelData = classes.map(cls => {
                  const models = selectedModels.map(model => {
                    let ac = 0, variable = 0, ai = 0, total = 0;
                    trialResults.filter(r => r.class === cls).forEach(qResult => {
                      const mr = qResult.modelResults[model.id];
                      if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                      if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                      total++;
                      const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
                      if (c1 && c2 && c3) ac++; else if (!c1 && !c2 && !c3) ai++; else variable++;
                    });
                    return { ac, ai, variable, total,
                      acPct:  total > 0 ? (ac / total) * 100 : 0,
                      aiPct:  total > 0 ? (ai / total) * 100 : 0,
                      varPct: total > 0 ? (variable / total) * 100 : 0,
                    };
                  });
                  return { cls, models };
                });
                return (
                  <Box mt={8}>
                    <VStack spacing={4} align="stretch">
                      <Text fontSize="lg" fontWeight="bold" mb={-4}>Consistency and Reliability per Class</Text>
                      <Text fontSize="sm" color="gray.600">
                        Breaks down Always Correct, Variable, and Always Incorrect responses by question class — showing whether inconsistency is concentrated in specific topic areas or spread evenly.
                      </Text>
                      <HStack spacing={2} wrap="wrap" justify="space-between">
                        <HStack spacing={2}>
                          <Button size="xs" variant={activeCRPerClassView === "table" ? "solid" : "outline"} colorScheme="blue" onClick={() => setActiveCRPerClassView("table")}>Table</Button>
                          <Button size="xs" variant={activeCRPerClassView === "charts" ? "solid" : "outline"} colorScheme="blue" onClick={() => setActiveCRPerClassView("charts")}>Chart</Button>
                        </HStack>
                        {activeCRPerClassView === "table" ? (
                          <Button size="xs" colorScheme="blue" variant="outline" onClick={exportCRPerClassTable} isDisabled={trialResults.length === 0}>Export Table</Button>
                        ) : (
                          <Menu>
                            <MenuButton as={Button} size="xs" colorScheme="blue" variant="outline" rightIcon={<ChevronDownIcon />} isDisabled={trialResults.length === 0}>Export Chart</MenuButton>
                            <MenuList minW="auto" fontSize="sm">
                              <MenuItem onClick={() => exportChartById('cr-per-class-chart', 'png', 'consistency_reliability_per_class')} fontSize="sm">Export as PNG</MenuItem>
                              <MenuItem onClick={() => exportChartById('cr-per-class-chart', 'svg', 'consistency_reliability_per_class')} fontSize="sm">Export as SVG</MenuItem>
                            </MenuList>
                          </Menu>
                        )}
                      </HStack>
                      {activeCRPerClassView === "table" && (
                        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple" sx={{ '& tbody tr:last-child td': { borderBottom: 'none' } }}>
                              <Thead>
                                <Tr>
                                  <Th rowSpan={2} borderBottom="2px" whiteSpace="nowrap">Model</Th>
                                  {classes.map(cls => (
                                    <Th key={cls} colSpan={3} textAlign="center" borderBottom="1px" whiteSpace="nowrap">{cls}</Th>
                                  ))}
                                </Tr>
                                <Tr>
                                  {classes.map(cls => (
                                    <Fragment key={`${cls}-h`}>
                                      <Th fontSize="xs" textAlign="center" borderBottom="2px" whiteSpace="nowrap" width="1%">Correct</Th>
                                      <Th fontSize="xs" textAlign="center" borderBottom="2px" whiteSpace="nowrap" width="1%">Variable</Th>
                                      <Th fontSize="xs" textAlign="center" borderBottom="2px" borderRight="2px" sx={{ borderRightColor: 'black' }} whiteSpace="nowrap" width="1%">Incorrect</Th>
                                    </Fragment>
                                  ))}
                                </Tr>
                              </Thead>
                              <Tbody>
                                {selectedModels.map((model, mi) => (
                                  <Tr key={model.id}>
                                    <Td fontWeight="medium" borderRight="1px" sx={{ borderRightColor: 'black' }} whiteSpace="nowrap">{model.name}</Td>
                                    {classModelData.map(({ cls, models: mds }) => {
                                      const d = mds[mi];
                                      return (
                                        <Fragment key={`${model.id}-${cls}`}>
                                          <Td fontSize="xs" textAlign="center" whiteSpace="nowrap" width="1%">
                                            {d.total > 0 ? (<><Text color="green.600" fontWeight="bold">{d.acPct.toFixed(1)}%</Text><Text fontSize="xs" color="gray.500">({d.ac}/{d.total})</Text></>) : <Text color="gray.400">—</Text>}
                                          </Td>
                                          <Td fontSize="xs" textAlign="center" whiteSpace="nowrap" width="1%">
                                            {d.total > 0 ? (<><Text color="orange.500" fontWeight="bold">{d.varPct.toFixed(1)}%</Text><Text fontSize="xs" color="gray.500">({d.variable}/{d.total})</Text></>) : <Text color="gray.400">—</Text>}
                                          </Td>
                                          <Td fontSize="xs" textAlign="center" borderRight="2px" sx={{ borderRightColor: 'black' }} whiteSpace="nowrap" width="1%">
                                            {d.total > 0 ? (<><Text color="red.500" fontWeight="bold">{d.aiPct.toFixed(1)}%</Text><Text fontSize="xs" color="gray.500">({d.ai}/{d.total})</Text></>) : <Text color="gray.400">—</Text>}
                                          </Td>
                                        </Fragment>
                                      );
                                    })}
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                      )}
                      {activeCRPerClassView === "charts" && (() => {
                        // One bar per model × class, labelled "ModelName - ClassName"
                        const labels: string[] = [];
                        const acData: number[] = [], varData: number[] = [], aiData: number[] = [];
                        selectedModels.forEach(model => {
                          const modelName = model.name.length > 20 ? model.name.substring(0, 18) + '…' : model.name;
                          classModelData.forEach(({ cls, models: mds }, ci) => {
                            const d = mds[selectedModels.indexOf(model)];
                            labels.push(`${modelName} – ${cls}`);
                            acData.push(d.total > 0 ? d.acPct : 0);
                            varData.push(d.total > 0 ? d.varPct : 0);
                            aiData.push(d.total > 0 ? d.aiPct : 0);
                          });
                        });
                        return (
                          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                            <Box id="cr-per-class-chart" h="480px" position="relative">
                              <Bar
                                data={{
                                  labels,
                                  datasets: [
                                    { label: 'Correct',   data: acData,  backgroundColor: '#22c55e', borderColor: '#16a34a', borderWidth: 1 },
                                    { label: 'Variable',  data: varData, backgroundColor: '#f59e0b', borderColor: '#d97706', borderWidth: 1 },
                                    { label: 'Incorrect', data: aiData,  backgroundColor: '#ef4444', borderColor: '#dc2626', borderWidth: 1 },
                                  ],
                                }}
                                options={{
                                  responsive: true, maintainAspectRatio: false,
                                  plugins: {
                                    legend: { position: 'bottom' as const, labels: { font: { size: 12, weight: 600 }, padding: 15 } },
                                    title: { display: true, text: 'Consistency per Class', font: { size: 16, weight: 'bold' }, padding: { bottom: 20 } },
                                    tooltip: { callbacks: { label: function(ctx) {
                                      return `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)}%`;
                                    }}},
                                  },
                                  scales: {
                                    x: { stacked: true, ticks: { font: { size: 10 } }, grid: { display: false } },
                                    y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%', font: { size: 12 } }, grid: { color: '#ddd' } },
                                  },
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })()}

                    {/* C&R per Class: Key Insights */}
                    {(() => {
                      const classAvgs = classModelData.map(({ cls, models: mds }) => {
                        const valid = mds.filter(d => d.total > 0);
                        if (valid.length === 0) return null;
                        return {
                          cls,
                          avgVar: valid.reduce((s, d) => s + d.varPct, 0) / valid.length,
                          avgAc:  valid.reduce((s, d) => s + d.acPct,  0) / valid.length,
                        };
                      }).filter(Boolean) as { cls: string; avgVar: number; avgAc: number }[];
                      if (classAvgs.length === 0) return null;
                      const byVar   = [...classAvgs].sort((a, b) => b.avgVar - a.avgVar);
                      const highest = byVar[0];
                      const lowest  = byVar[byVar.length - 1];
                      const gap     = highest.avgVar - lowest.avgVar;
                      // Per-model per-class worst/best combo
                      type MCR = { model: string; cls: string; varPct: number };
                      const combos: MCR[] = [];
                      classModelData.forEach(({ cls, models: mds }) => {
                        selectedModels.forEach((model, mi) => {
                          const d = mds[mi];
                          if (d.total > 0) combos.push({ model: model.name, cls, varPct: d.varPct });
                        });
                      });
                      combos.sort((a, b) => b.varPct - a.varPct);
                      const mostVarCombo  = combos[0];
                      const leastVarCombo = combos[combos.length - 1];
                      let text = `"${highest.cls}" had the highest variability (avg ${highest.avgVar.toFixed(1)}% variable across models)`;
                      if (byVar.length > 1) {
                        text += `, while "${lowest.cls}" was the most consistent (avg ${lowest.avgVar.toFixed(1)}% variable)`;
                        if (gap > 10) text += ` — a ${gap.toFixed(1)} pp spread`;
                      }
                      text += '.';
                      if (combos.length > 1)
                        text += ` ${mostVarCombo.model} was most variable in "${mostVarCombo.cls}" (${mostVarCombo.varPct.toFixed(1)}%), while ${leastVarCombo.model} was most consistent in "${leastVarCombo.cls}" (${leastVarCombo.varPct.toFixed(1)}%).`;
                      return (
                        <Box bg="orange.50" borderRadius="md" p={3} borderWidth="1px" borderColor="orange.100">
                          <Text fontSize="xs" fontWeight="semibold" color="orange.700" mb={1}>Key Insights</Text>
                          <Text fontSize="xs" color="gray.700">{text}</Text>
                        </Box>
                      );
                    })()}
                  </VStack>
                </Box>
                );
              })()}

              {/* Consistency Score Section */}
              {activeResultTab === "summary" && trialResults.length > 0 && (() => {
                const scoreData = selectedModels.map(model => {
                  let ac = 0, variable = 0, ai = 0, total = 0;
                  trialResults.forEach(qResult => {
                    const mr = qResult.modelResults[model.id];
                    if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                    if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                    total++;
                    const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
                    if (c1 && c2 && c3) ac++;
                    else if (!c1 && !c2 && !c3) ai++;
                    else variable++;
                  });
                  const acPct      = total > 0 ? (ac / total) * 100 : 0;
                  const aiPct      = total > 0 ? (ai / total) * 100 : 0;
                  const varPct     = total > 0 ? (variable / total) * 100 : 0;
                  const scorePct   = acPct + aiPct;
                  return { model, ac, ai, variable, total, acPct, aiPct, varPct, scorePct };
                }).filter(d => d.total > 0);

                if (scoreData.length === 0) return null;

                const sorted     = [...scoreData].sort((a, b) => b.scorePct - a.scorePct);
                const best       = sorted[0];
                const worst      = sorted[sorted.length - 1];
                const spread     = best.scorePct - worst.scorePct;
                let insightText  = `${best.model.name} has the highest consistency score at ${best.scorePct.toFixed(1)}%`;
                if (best.aiPct > 0)
                  insightText += ` (of which ${best.aiPct.toFixed(1)}% are systematic wrong answers)`;
                if (scoreData.length > 1) {
                  insightText += `. ${worst.model.name} is the least consistent at ${worst.scorePct.toFixed(1)}%`;
                  if (spread > 5) insightText += ` — a gap of ${spread.toFixed(1)} pp`;
                }
                insightText += '.';

                return (
                  <Box mt={8}>
                    <VStack spacing={4} align="stretch">
                      <Text fontSize="lg" fontWeight="bold" mb={-4}>Consistency Score</Text>
                      <Text fontSize="sm" color="gray.600">
                        The proportion of questions for which a model's answer did not vary across the 3 trials — calculated as Always Correct + Always Incorrect. A high score means the model commits to the same answer repeatedly, regardless of whether that answer is right or wrong.
                      </Text>

                      <HStack spacing={2} wrap="wrap" justify="space-between">
                        <HStack spacing={2}>
                          <Button
                            size="xs"
                            variant={activeConsistencyScoreView === "table" ? "solid" : "outline"}
                            colorScheme="blue"
                            onClick={() => setActiveConsistencyScoreView("table")}
                          >
                            Table
                          </Button>
                          <Button
                            size="xs"
                            variant={activeConsistencyScoreView === "charts" ? "solid" : "outline"}
                            colorScheme="blue"
                            onClick={() => setActiveConsistencyScoreView("charts")}
                          >
                            Chart
                          </Button>
                        </HStack>
                        {activeConsistencyScoreView === "table" ? (
                          <Button
                            size="xs"
                            colorScheme="blue"
                            variant="outline"
                            onClick={exportConsistencyScoreTable}
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
                              <MenuItem onClick={() => exportChartById('consistency-score-chart-container', 'png', 'consistency_score')} fontSize="sm">
                                Export as PNG
                              </MenuItem>
                              <MenuItem onClick={() => exportChartById('consistency-score-chart-container', 'svg', 'consistency_score')} fontSize="sm">
                                Export as SVG
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        )}
                      </HStack>

                      {activeConsistencyScoreView === "table" && (
                        <Box borderWidth="1px" borderRadius="md" p={3} bg="white">
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple">
                              <Thead>
                                <Tr>
                                  <Th>Model</Th>
                                  <Th isNumeric>Consistency Score</Th>
                                  <Th isNumeric color="blue.600">Same Answer</Th>
                                  <Th isNumeric color="orange.500">Variable</Th>
                                  <Th isNumeric>Total</Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {scoreData.map(({ model, ac, ai, variable, total, varPct, scorePct }) => (
                                  <Tr key={model.id}>
                                    <Td fontWeight="medium" fontSize="xs">{model.name}</Td>
                                    <Td isNumeric>
                                      <Text
                                        fontWeight="bold"
                                        fontSize="xs"
                                        color={scorePct >= 70 ? "blue.600" : scorePct >= 50 ? "blue.400" : "gray.500"}
                                      >
                                        {scorePct.toFixed(1)}%
                                      </Text>
                                    </Td>
                                    <Td isNumeric>
                                      <Text color="blue.600" fontWeight="bold" fontSize="xs">{scorePct.toFixed(1)}%</Text>
                                      <Text fontSize="xs" color="gray.500">({ac + ai}/{total})</Text>
                                    </Td>
                                    <Td isNumeric>
                                      <Text color="orange.500" fontWeight="bold" fontSize="xs">{varPct.toFixed(1)}%</Text>
                                      <Text fontSize="xs" color="gray.500">({variable}/{total})</Text>
                                    </Td>
                                    <Td isNumeric fontSize="xs" color="gray.600">{total}</Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                      )}

                      {activeConsistencyScoreView === "charts" && (
                        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                          <Box id="consistency-score-chart-container" h="480px" position="relative">
                            <Bar
                              data={{
                                labels: scoreData.map(d =>
                                  d.model.name.length > 25 ? d.model.name.substring(0, 22) + '...' : d.model.name
                                ),
                                datasets: [
                                  {
                                    label: 'Same Answer',
                                    data: scoreData.map(d => d.scorePct),
                                    backgroundColor: '#3b82f6',
                                    borderColor: '#2563eb',
                                    borderWidth: 1,
                                  },
                                  {
                                    label: 'Variable',
                                    data: scoreData.map(d => d.varPct),
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
                                    labels: { font: { size: 12, weight: 600 }, padding: 15 },
                                  },
                                  title: {
                                    display: true,
                                    text: 'Consistency Score by Model',
                                    font: { size: 16, weight: 'bold' },
                                    padding: { bottom: 20 },
                                  },
                                  tooltip: {
                                    callbacks: {
                                      label: function(context) {
                                        const d = scoreData[context.dataIndex];
                                        const pct = (context.parsed.y ?? 0).toFixed(1);
                                        const count = context.datasetIndex === 0 ? d.ac + d.ai : d.variable;
                                        return `${context.dataset.label}: ${pct}% (${count}/${d.total})`;
                                      },
                                    },
                                  },
                                },
                                scales: {
                                  x: {
                                    stacked: true,
                                    ticks: { font: { size: 11, weight: 600 } },
                                    grid: { display: false },
                                  },
                                  y: {
                                    stacked: true,
                                    beginAtZero: true,
                                    max: 100,
                                    ticks: {
                                      callback: function(value) { return value + '%'; },
                                      font: { size: 12 },
                                    },
                                    grid: { color: '#ddd' },
                                  },
                                },
                              }}
                            />
                          </Box>
                        </Box>
                      )}

                      <Box bg="blue.50" borderRadius="md" p={3} borderWidth="1px" borderColor="blue.100">
                        <Text fontSize="xs" fontWeight="semibold" color="blue.700" mb={1}>Key Insights</Text>
                        <Text fontSize="xs" color="gray.700">{insightText}</Text>
                      </Box>
                    </VStack>
                  </Box>
                );
              })()}

              {/* Consistency Score Per Class Section */}
              {activeResultTab === "summary" && trialResults.length > 0 && hasClassColumn && (() => {
                const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort() as string[];
                if (classes.length === 0) return null;
                const MODEL_COLORS = [
                  { bg: '#3b82f6', border: '#2563eb' }, { bg: '#ef4444', border: '#dc2626' },
                  { bg: '#22c55e', border: '#16a34a' }, { bg: '#f59e0b', border: '#d97706' },
                  { bg: '#8b5cf6', border: '#7c3aed' }, { bg: '#06b6d4', border: '#0891b2' },
                  { bg: '#f97316', border: '#ea580c' }, { bg: '#ec4899', border: '#db2777' },
                  { bg: '#14b8a6', border: '#0d9488' }, { bg: '#6366f1', border: '#4f46e5' },
                ];
                const classModelData = classes.map(cls => {
                  const models = selectedModels.map(model => {
                    let ac = 0, ai = 0, variable = 0, total = 0;
                    trialResults.filter(r => r.class === cls).forEach(qResult => {
                      const mr = qResult.modelResults[model.id];
                      if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                      if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                      total++;
                      const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
                      if (c1 && c2 && c3) ac++; else if (!c1 && !c2 && !c3) ai++; else variable++;
                    });
                    const scorePct  = total > 0 ? ((ac + ai) / total) * 100 : 0;
                    const varPct    = total > 0 ? (variable / total) * 100 : 0;
                    return { ac, ai, variable, total, scorePct, varPct };
                  });
                  return { cls, models };
                });
                return (
                  <Box mt={8}>
                    <VStack spacing={4} align="stretch">
                      <Text fontSize="lg" fontWeight="bold" mb={-4}>Consistency Score per Class</Text>
                      <Text fontSize="sm" color="gray.600">
                        Shows the proportion of questions answered with the same answer in all 3 trials (Always Correct + Always Incorrect) broken down by question class — highlighting which categories trigger the most answer variation.
                      </Text>
                      <HStack spacing={2} wrap="wrap" justify="space-between">
                        <HStack spacing={2}>
                          <Button size="xs" variant={activeCSPerClassView === "table" ? "solid" : "outline"} colorScheme="blue" onClick={() => setActiveCSPerClassView("table")}>Table</Button>
                          <Button size="xs" variant={activeCSPerClassView === "charts" ? "solid" : "outline"} colorScheme="blue" onClick={() => setActiveCSPerClassView("charts")}>Chart</Button>
                        </HStack>
                        {activeCSPerClassView === "table" ? (
                          <Button size="xs" colorScheme="blue" variant="outline" onClick={exportCSPerClassTable} isDisabled={trialResults.length === 0}>Export Table</Button>
                        ) : (
                          <Menu>
                            <MenuButton as={Button} size="xs" colorScheme="blue" variant="outline" rightIcon={<ChevronDownIcon />} isDisabled={trialResults.length === 0}>Export Chart</MenuButton>
                            <MenuList minW="auto" fontSize="sm">
                              <MenuItem onClick={() => exportChartById('cs-per-class-chart', 'png', 'consistency_score_per_class')} fontSize="sm">Export as PNG</MenuItem>
                              <MenuItem onClick={() => exportChartById('cs-per-class-chart', 'svg', 'consistency_score_per_class')} fontSize="sm">Export as SVG</MenuItem>
                            </MenuList>
                          </Menu>
                        )}
                      </HStack>
                      {activeCSPerClassView === "table" && (
                        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple" sx={{ '& tbody tr:last-child td': { borderBottom: 'none' } }}>
                              <Thead>
                                <Tr>
                                  <Th rowSpan={2} borderBottom="2px" whiteSpace="nowrap" width="1%">Model</Th>
                                  {classes.map(cls => (
                                    <Th key={cls} colSpan={2} textAlign="center" borderBottom="1px" whiteSpace="nowrap">{cls}</Th>
                                  ))}
                                </Tr>
                                <Tr>
                                  {classes.map(cls => (
                                    <Fragment key={`${cls}-h`}>
                                      <Th fontSize="xs" textAlign="center" borderBottom="2px" whiteSpace="nowrap" width="1%">Score%</Th>
                                      <Th fontSize="xs" textAlign="center" borderBottom="2px" borderRight="2px" whiteSpace="nowrap" width="1%">Variable%</Th>
                                    </Fragment>
                                  ))}
                                </Tr>
                              </Thead>
                              <Tbody>
                                {selectedModels.map((model, mi) => (
                                  <Tr key={model.id}>
                                    <Td fontWeight="medium" borderRight="1px" whiteSpace="nowrap" width="1%">{model.name}</Td>
                                    {classModelData.map(({ cls, models: mds }) => {
                                      const d = mds[mi];
                                      return (
                                        <Fragment key={`${model.id}-${cls}`}>
                                          <Td fontSize="xs" textAlign="center" whiteSpace="nowrap" width="1%">
                                            {d.total > 0 ? (<>
                                              <Text color={d.scorePct >= 70 ? "blue.600" : d.scorePct >= 50 ? "blue.400" : "gray.500"} fontWeight="bold">{d.scorePct.toFixed(1)}%</Text>
                                              <Text fontSize="xs" color="gray.500">({d.ac + d.ai}/{d.total})</Text>
                                            </>) : <Text color="gray.400">—</Text>}
                                          </Td>
                                          <Td fontSize="xs" textAlign="center" borderRight="2px" whiteSpace="nowrap" width="1%">
                                            {d.total > 0 ? (<>
                                              <Text color="orange.500" fontWeight="bold">{d.varPct.toFixed(1)}%</Text>
                                              <Text fontSize="xs" color="gray.500">({d.variable}/{d.total})</Text>
                                            </>) : <Text color="gray.400">—</Text>}
                                          </Td>
                                        </Fragment>
                                      );
                                    })}
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                      )}
                      {activeCSPerClassView === "charts" && (() => {
                        // One stacked bar per model × class, matching Consistency Score chart style
                        const labels: string[] = [];
                        const sameData: number[] = [], varData: number[] = [];
                        selectedModels.forEach(model => {
                          const modelName = model.name.length > 20 ? model.name.substring(0, 18) + '…' : model.name;
                          classModelData.forEach(({ cls, models: mds }) => {
                            const d = mds[selectedModels.indexOf(model)];
                            labels.push(`${modelName} – ${cls}`);
                            sameData.push(d.total > 0 ? d.scorePct : 0);
                            varData.push(d.total > 0 ? d.varPct : 0);
                          });
                        });
                        return (
                          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                            <Box id="cs-per-class-chart" h="480px" position="relative">
                              <Bar
                                data={{
                                  labels,
                                  datasets: [
                                    { label: 'Same Answer', data: sameData, backgroundColor: '#3b82f6', borderColor: '#2563eb', borderWidth: 1 },
                                    { label: 'Variable',    data: varData,  backgroundColor: '#f59e0b', borderColor: '#d97706', borderWidth: 1 },
                                  ],
                                }}
                                options={{
                                  responsive: true, maintainAspectRatio: false,
                                  plugins: {
                                    legend: { position: 'bottom' as const, labels: { font: { size: 12, weight: 600 }, padding: 15 } },
                                    title: { display: true, text: 'Consistency Score per Class', font: { size: 16, weight: 'bold' }, padding: { bottom: 20 } },
                                    tooltip: { callbacks: { label: function(ctx) {
                                      return `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)}%`;
                                    }}},
                                  },
                                  scales: {
                                    x: { stacked: true, ticks: { font: { size: 10 } }, grid: { display: false } },
                                    y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%', font: { size: 12 } }, grid: { color: '#ddd' } },
                                  },
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })()}

                      {/* Consistency Score per Class: Key Insights */}
                      {(() => {
                        const classAvgs = classModelData.map(({ cls, models: mds }) => {
                          const valid = mds.filter(d => d.total > 0);
                          if (valid.length === 0) return null;
                          return { cls, avgScore: valid.reduce((s, d) => s + d.scorePct, 0) / valid.length };
                        }).filter(Boolean) as { cls: string; avgScore: number }[];
                        if (classAvgs.length === 0) return null;
                        const sorted  = [...classAvgs].sort((a, b) => b.avgScore - a.avgScore);
                        const highest = sorted[0];
                        const lowest  = sorted[sorted.length - 1];
                        // Per-model per-class best/worst combo
                        type MCS = { model: string; cls: string; score: number };
                        const combos: MCS[] = [];
                        classModelData.forEach(({ cls, models: mds }) => {
                          selectedModels.forEach((model, mi) => {
                            const d = mds[mi];
                            if (d.total > 0) combos.push({ model: model.name, cls, score: d.scorePct });
                          });
                        });
                        combos.sort((a, b) => b.score - a.score);
                        const bestCombo  = combos[0];
                        const worstCombo = combos[combos.length - 1];
                        let text = `"${highest.cls}" had the highest consistency score (avg ${highest.avgScore.toFixed(1)}% same answer across models)`;
                        if (sorted.length > 1)
                          text += `, while "${lowest.cls}" had the lowest (avg ${lowest.avgScore.toFixed(1)}%) — the class triggering the most answer variation`;
                        text += '.';
                        if (combos.length > 1)
                          text += ` ${bestCombo.model} was most consistent in "${bestCombo.cls}" (${bestCombo.score.toFixed(1)}%), while ${worstCombo.model} was least consistent in "${worstCombo.cls}" (${worstCombo.score.toFixed(1)}%).`;
                        return (
                          <Box bg="blue.50" borderRadius="md" p={3} borderWidth="1px" borderColor="blue.100">
                            <Text fontSize="xs" fontWeight="semibold" color="blue.700" mb={1}>Key Insights</Text>
                            <Text fontSize="xs" color="gray.700">{text}</Text>
                          </Box>
                        );
                      })()}
                    </VStack>
                  </Box>
                );
              })()}

              {/* Variable Correct Rate Section */}
              {activeResultTab === "summary" && trialResults.length > 0 && (() => {
                const HIST_COLORS = [
                  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
                  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
                ];
                const HIST_COLORS_BG = [
                  '#3b82f680', '#ef444480', '#22c55e80', '#f59e0b80', '#8b5cf680',
                  '#06b6d480', '#f9731680', '#ec489980', '#14b8a680', '#6366f180',
                ];
                const binLabels = [
                  '0–10%','10–20%','20–30%','30–40%','40–50%',
                  '50–60%','60–70%','70–80%','80–90%','90–100%',
                ];

                const modelVariableData = selectedModels.map((model, mi) => {
                  const correctRates: number[] = [];
                  trialResults.forEach(qResult => {
                    const mr = qResult.modelResults[model.id];
                    if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                    if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                    const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
                    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) return;
                    let correct = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0);
                    let total = 3;
                    if (mr.additionalTrials) {
                      mr.additionalTrials.forEach(at => { total++; if (!at.aborted && at.correct) correct++; });
                    }
                    correctRates.push(total > 0 ? (correct / total) * 100 : 0);
                  });
                  const avg = correctRates.length > 0
                    ? correctRates.reduce((a, b) => a + b, 0) / correctRates.length
                    : null;
                  const bins = Array(10).fill(0);
                  correctRates.forEach(r => { bins[Math.min(9, Math.floor(r / 10))]++; });
                  return {
                    model, correctRates, avg, bins,
                    color: HIST_COLORS[mi % HIST_COLORS.length],
                    colorBg: HIST_COLORS_BG[mi % HIST_COLORS_BG.length],
                  };
                });

                const hasAny = modelVariableData.some(d => d.correctRates.length > 0);
                if (!hasAny) return null;

                return (
                  <Box mt={8}>
                    <VStack spacing={4} align="stretch">
                      <Text fontSize="lg" fontWeight="bold" mb={-4}>Variable Correct Rate</Text>
                      <Text fontSize="sm" color="gray.600">
                        For each model's variable questions (correct in some trials, wrong in others),
                        this shows how often the model was correct across all trials — revealing whether
                        "variable" means nearly always right, nearly always wrong, or genuinely uncertain.
                      </Text>

                      <HStack spacing={2} wrap="wrap" justify="space-between">
                        <HStack spacing={2}>
                          <Button
                            size="xs"
                            variant={activeVariableView === "table" ? "solid" : "outline"}
                            colorScheme="blue"
                            onClick={() => setActiveVariableView("table")}
                          >
                            Table
                          </Button>
                          <Button
                            size="xs"
                            variant={activeVariableView === "charts" ? "solid" : "outline"}
                            colorScheme="blue"
                            onClick={() => setActiveVariableView("charts")}
                          >
                            Count Distribution
                          </Button>
                          <Button
                            size="xs"
                            variant={activeVariableView === "charts2" ? "solid" : "outline"}
                            colorScheme="blue"
                            onClick={() => setActiveVariableView("charts2")}
                          >
                            % Distribution
                          </Button>
                        </HStack>
                        {activeVariableView === "table" ? (
                          <Button
                            size="xs"
                            colorScheme="blue"
                            variant="outline"
                            onClick={exportVariableTable}
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
                              <MenuItem onClick={() => exportChartById('variable-chart-container', 'png', 'variable_correct_rate')} fontSize="sm">
                                Export as PNG
                              </MenuItem>
                              <MenuItem onClick={() => exportChartById('variable-chart-container', 'svg', 'variable_correct_rate')} fontSize="sm">
                                Export as SVG
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        )}
                      </HStack>

                      {activeVariableView === "table" && (
                        <Box borderWidth="1px" borderRadius="md" p={3} bg="white">
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple">
                              <Thead>
                                <Tr>
                                  <Th>Model</Th>
                                  <Th isNumeric>Variable Questions</Th>
                                  <Th isNumeric>Avg Correct Rate</Th>
                                  <Th>Interpretation</Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {modelVariableData.map(({ model, correctRates, avg }) => (
                                  <Tr key={model.id}>
                                    <Td fontWeight="medium" fontSize="xs">{model.name}</Td>
                                    <Td isNumeric fontSize="xs">{correctRates.length}</Td>
                                    <Td isNumeric>
                                      {avg !== null ? (
                                        <Text
                                          fontWeight="bold"
                                          fontSize="xs"
                                          color={avg >= 70 ? "green.600" : avg >= 40 ? "orange.500" : "red.500"}
                                        >
                                          {avg.toFixed(1)}%
                                        </Text>
                                      ) : (
                                        <Text fontSize="xs" color="gray.400">—</Text>
                                      )}
                                    </Td>
                                    <Td fontSize="xs" color="gray.600">
                                      {avg !== null
                                        ? avg >= 70 ? "Near-correct (rare slip)"
                                          : avg >= 40 ? "Genuinely uncertain"
                                          : "Near-incorrect (rare correct guess)"
                                        : "—"}
                                    </Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                      )}

                      {activeVariableView === "charts" && (
                        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                          <Box mb={2} px={1}>
                            <Text fontSize="xs" color="gray.500">
                              Shows the raw count of variable questions in each correct-rate bucket. Useful when models have similar numbers of variable questions.
                            </Text>
                          </Box>
                          <Box id="variable-chart-container" h="480px" position="relative">
                            <Bar
                              data={{
                                labels: binLabels,
                                datasets: modelVariableData
                                  .filter(d => d.correctRates.length > 0)
                                  .map(({ model, bins, color, colorBg }) => ({
                                    label: model.name.length > 25 ? model.name.substring(0, 22) + '...' : model.name,
                                    data: bins,
                                    backgroundColor: colorBg,
                                    borderColor: color,
                                    borderWidth: 1.5,
                                  })),
                              }}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                  legend: {
                                    position: 'bottom' as const,
                                    labels: {
                                      font: { size: 12, weight: 600 },
                                      padding: 15,
                                    },
                                  },
                                  title: {
                                    display: true,
                                    text: 'Variable Questions: Correct Rate Distribution',
                                    font: { size: 16, weight: 'bold' },
                                    padding: { bottom: 20 },
                                  },
                                  tooltip: {
                                    callbacks: {
                                      label: function(context) {
                                        const count = Number(context.parsed.y ?? 0);
                                        const d = modelVariableData.find(x =>
                                          (x.model.name.length > 25 ? x.model.name.substring(0, 22) + '...' : x.model.name) === context.dataset.label
                                        );
                                        const total = d?.correctRates.length ?? 0;
                                        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                                        return `${context.dataset.label}: ${count} question${count !== 1 ? 's' : ''} (${pct}% of variable)`;
                                      },
                                    },
                                  },
                                },
                                scales: {
                                  x: {
                                    ticks: { font: { size: 11 } },
                                    grid: { display: false },
                                    title: {
                                      display: true,
                                      text: 'Correct Rate Across All Trials',
                                      font: { size: 12 },
                                    },
                                  },
                                  y: {
                                    beginAtZero: true,
                                    ticks: {
                                      stepSize: 1,
                                      callback: function(value) {
                                        return Number.isInteger(Number(value)) ? value : '';
                                      },
                                    },
                                    grid: { color: '#ddd' },
                                    title: {
                                      display: true,
                                      text: 'Number of Questions',
                                      font: { size: 12 },
                                    },
                                  },
                                },
                              }}
                            />
                          </Box>
                        </Box>
                      )}

                      {activeVariableView === "charts2" && (() => {
                        // Bubble chart: X = bin center (correct rate), Y = model row, R ∝ % of variable questions
                        const activeModels = modelVariableData.filter(d => d.correctRates.length > 0);
                        const binCenters = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
                        const maxR = 28; // max bubble radius in px
                        const datasets = activeModels.map(({ model, bins, correctRates, color }, mi) => ({
                          label: model.name.length > 25 ? model.name.substring(0, 22) + '...' : model.name,
                          data: binCenters.map((cx, bi) => {
                            const pct = correctRates.length > 0 ? (bins[bi] / correctRates.length) * 100 : 0;
                            return { x: cx, y: mi, r: pct > 0 ? Math.max(3, Math.sqrt(pct) * (maxR / 10)) : 0 };
                          }).filter(d => d.r > 0),
                          backgroundColor: color + '99',
                          borderColor: color,
                          borderWidth: 1.5,
                        }));
                        const modelLabels = activeModels.map(d =>
                          d.model.name.length > 22 ? d.model.name.substring(0, 20) + '…' : d.model.name
                        );
                        return (
                          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                            <Box mb={2} px={1}>
                              <Text fontSize="xs" color="gray.500">
                                Each bubble represents a correct-rate bucket for one model. Bubble size reflects the percentage of that model's variable questions in that bucket — making models with different variable counts directly comparable.
                              </Text>
                            </Box>
                            <Box id="variable-chart-container" h="480px" position="relative">
                              <Bubble
                                data={{ datasets }}
                                options={{
                                  responsive: true,
                                  maintainAspectRatio: false,
                                  plugins: {
                                    legend: {
                                      position: 'bottom' as const,
                                      labels: { font: { size: 12, weight: 600 }, padding: 15 },
                                    },
                                    title: {
                                      display: true,
                                      text: 'Variable Questions: Correct Rate Distribution (Bubble)',
                                      font: { size: 16, weight: 'bold' },
                                      padding: { bottom: 16 },
                                    },
                                    tooltip: {
                                      callbacks: {
                                        label: function(context) {
                                          const d = context.raw as { x: number; y: number; r: number };
                                          const modelD = activeModels[d.y];
                                          const binIdx = binCenters.indexOf(d.x);
                                          const count = binIdx >= 0 ? modelD.bins[binIdx] : 0;
                                          const total = modelD.correctRates.length;
                                          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
                                          return `${context.dataset.label} | ${d.x - 5}–${d.x + 5}%: ${count} q (${pct}%)`;
                                        },
                                      },
                                    },
                                  },
                                  scales: {
                                    x: {
                                      min: 0,
                                      max: 100,
                                      ticks: {
                                        stepSize: 10,
                                        callback: function(value) { return value + '%'; },
                                        font: { size: 11 },
                                      },
                                      grid: { color: '#eee' },
                                      title: { display: true, text: 'Correct Rate Across All Trials', font: { size: 12 } },
                                    },
                                    y: {
                                      min: -0.5,
                                      max: activeModels.length - 0.5,
                                      ticks: {
                                        stepSize: 1,
                                        callback: function(value) {
                                          const i = Number(value);
                                          return modelLabels[i] ?? '';
                                        },
                                        font: { size: 11 },
                                      },
                                      grid: { color: '#eee' },
                                    },
                                  },
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })()}

                      {/* Variable Correct Rate: dynamic summary */}
                      {(() => {
                        const ranked = [...modelVariableData]
                          .filter(d => d.avg !== null && d.correctRates.length > 0)
                          .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
                        if (ranked.length === 0) return null;
                        const topModel = ranked[0];
                        const bottomModel = ranked[ranked.length - 1];
                        const nearCorrect  = ranked.filter(d => (d.avg ?? 0) >= 70);
                        const uncertain    = ranked.filter(d => (d.avg ?? 0) >= 40 && (d.avg ?? 0) < 70);
                        const nearIncorrect = ranked.filter(d => (d.avg ?? 0) < 40);
                        const parts: string[] = [];
                        if (nearCorrect.length > 0)
                          parts.push(`${nearCorrect.map(d => d.model.name).join(', ')} ${nearCorrect.length === 1 ? 'shows' : 'show'} near-correct variability (avg ≥ 70%) — mostly right with rare slips`);
                        if (uncertain.length > 0)
                          parts.push(`${uncertain.map(d => d.model.name).join(', ')} ${uncertain.length === 1 ? 'falls' : 'fall'} in the genuinely uncertain range (40–70%)`);
                        if (nearIncorrect.length > 0)
                          parts.push(`${nearIncorrect.map(d => d.model.name).join(', ')} ${nearIncorrect.length === 1 ? 'clusters' : 'cluster'} near-incorrect (avg < 40%) — mostly wrong with rare lucky guesses`);
                        const spread = ranked.length > 1
                          ? ` The gap between ${topModel.model.name} (${(topModel.avg ?? 0).toFixed(1)}%) and ${bottomModel.model.name} (${(bottomModel.avg ?? 0).toFixed(1)}%) is ${((topModel.avg ?? 0) - (bottomModel.avg ?? 0)).toFixed(1)} pp.`
                          : '';
                        return (
                          <Box bg="purple.50" borderRadius="md" p={3} borderWidth="1px" borderColor="purple.100">
                            <Text fontSize="xs" fontWeight="semibold" color="purple.700" mb={1}>Key Insights</Text>
                            <Text fontSize="xs" color="gray.700">{parts.join('; ')}.{spread}</Text>
                          </Box>
                        );
                      })()}
                    </VStack>
                  </Box>
                );
              })()}

              {/* Variable Correct Rate Per Class Section */}
              {activeResultTab === "summary" && trialResults.length > 0 && hasClassColumn && (() => {
                const classes = Array.from(new Set(trialResults.map(r => r.class).filter(Boolean))).sort() as string[];
                if (classes.length === 0) return null;
                const MODEL_COLORS = [
                  { bg: '#3b82f6', border: '#2563eb' }, { bg: '#ef4444', border: '#dc2626' },
                  { bg: '#22c55e', border: '#16a34a' }, { bg: '#f59e0b', border: '#d97706' },
                  { bg: '#8b5cf6', border: '#7c3aed' }, { bg: '#06b6d4', border: '#0891b2' },
                  { bg: '#f97316', border: '#ea580c' }, { bg: '#ec4899', border: '#db2777' },
                  { bg: '#14b8a6', border: '#0d9488' }, { bg: '#6366f1', border: '#4f46e5' },
                ];
                const classModelData = classes.map(cls => {
                  const models = selectedModels.map(model => {
                    const rates: number[] = [];
                    trialResults.filter(r => r.class === cls).forEach(qResult => {
                      const mr = qResult.modelResults[model.id];
                      if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                      if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                      const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
                      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) return;
                      let correct = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0), total = 3;
                      if (mr.additionalTrials) mr.additionalTrials.forEach(at => { total++; if (!at.aborted && at.correct) correct++; });
                      rates.push(total > 0 ? (correct / total) * 100 : 0);
                    });
                    const avg = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
                    return { avg, count: rates.length };
                  });
                  return { cls, models };
                });
                const hasAny = classModelData.some(c => c.models.some(m => m.avg !== null));
                if (!hasAny) return null;
                return (
                  <Box mt={8}>
                    <VStack spacing={4} align="stretch">
                      <Text fontSize="lg" fontWeight="bold" mb={-4}>Variable Correct Rate per Class</Text>
                      <Text fontSize="sm" color="gray.600">
                        For variable questions only, shows the average correct rate across all trials broken down by question class — revealing which categories drive genuine uncertainty versus near-stable wrong answers.
                      </Text>
                      <HStack spacing={2} wrap="wrap" justify="space-between">
                        <HStack spacing={2}>
                          <Button size="xs" variant={activeVCRPerClassView === "table" ? "solid" : "outline"} colorScheme="blue" onClick={() => setActiveVCRPerClassView("table")}>Table</Button>
                          <Button size="xs" variant={activeVCRPerClassView === "charts" ? "solid" : "outline"} colorScheme="blue" onClick={() => setActiveVCRPerClassView("charts")}>Chart</Button>
                        </HStack>
                        {activeVCRPerClassView === "table" ? (
                          <Button size="xs" colorScheme="blue" variant="outline" onClick={exportVCRPerClassTable} isDisabled={trialResults.length === 0}>Export Table</Button>
                        ) : (
                          <Menu>
                            <MenuButton as={Button} size="xs" colorScheme="blue" variant="outline" rightIcon={<ChevronDownIcon />} isDisabled={trialResults.length === 0}>Export Chart</MenuButton>
                            <MenuList minW="auto" fontSize="sm">
                              <MenuItem onClick={() => exportChartById('vcr-per-class-chart', 'png', 'variable_correct_rate_per_class')} fontSize="sm">Export as PNG</MenuItem>
                              <MenuItem onClick={() => exportChartById('vcr-per-class-chart', 'svg', 'variable_correct_rate_per_class')} fontSize="sm">Export as SVG</MenuItem>
                            </MenuList>
                          </Menu>
                        )}
                      </HStack>
                      {activeVCRPerClassView === "table" && (
                        <Box borderWidth="1px" borderRadius="md" p={3} bg="white">
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple">
                              <Thead>
                                <Tr>
                                  <Th borderBottom="2px" whiteSpace="nowrap">Model</Th>
                                  {classes.map(cls => (
                                    <Th key={cls} isNumeric borderBottom="2px" whiteSpace="nowrap">{cls}</Th>
                                  ))}
                                </Tr>
                              </Thead>
                              <Tbody>
                                {selectedModels.map((model, mi) => (
                                  <Tr key={model.id}>
                                    <Td fontWeight="medium" borderRight="1px" whiteSpace="nowrap" fontSize="xs">{model.name}</Td>
                                    {classModelData.map(({ cls, models: mds }) => {
                                      const d = mds[mi];
                                      return (
                                        <Td key={`${model.id}-${cls}`} isNumeric>
                                          {d.avg !== null ? (
                                            <>
                                              <Text fontWeight="bold" fontSize="xs" color={d.avg >= 70 ? "green.600" : d.avg >= 40 ? "orange.500" : "red.500"}>{d.avg.toFixed(1)}%</Text>
                                              <Text fontSize="xs" color="gray.500">({d.count} q)</Text>
                                            </>
                                          ) : <Text fontSize="xs" color="gray.400">—</Text>}
                                        </Td>
                                      );
                                    })}
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        </Box>
                      )}
                      {activeVCRPerClassView === "charts" && (() => {
                        const binLabels = ['0–10%','10–20%','20–30%','30–40%','40–50%','50–60%','60–70%','70–80%','80–90%','90–100%'];
                        const HIST_COLORS    = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1'];
                        const HIST_COLORS_BG = ['#3b82f680','#ef444480','#22c55e80','#f59e0b80','#8b5cf680','#06b6d480','#f9731680','#ec489980','#14b8a680','#6366f180'];

                        let colorIdx = 0;
                        const datasets: { label: string; data: number[]; backgroundColor: string; borderColor: string; borderWidth: number }[] = [];

                        selectedModels.forEach(model => {
                          const modelName = model.name.length > 20 ? model.name.substring(0, 18) + '…' : model.name;
                          classModelData.forEach(({ cls }) => {
                            const rates: number[] = [];
                            trialResults.filter(r => r.class === cls).forEach(qResult => {
                              const mr = qResult.modelResults[model.id];
                              if (!mr?.trial1 || !mr?.trial2 || !mr?.trial3) return;
                              if (mr.trial1.aborted || mr.trial2.aborted || mr.trial3.aborted) return;
                              const c1 = mr.trial1.correct, c2 = mr.trial2.correct, c3 = mr.trial3.correct;
                              if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) return;
                              let correct = (c1?1:0)+(c2?1:0)+(c3?1:0), total = 3;
                              if (mr.additionalTrials) mr.additionalTrials.forEach(at => { total++; if (!at.aborted && at.correct) correct++; });
                              rates.push(total > 0 ? (correct/total)*100 : 0);
                            });
                            if (rates.length === 0) return;
                            const bins = Array(10).fill(0);
                            rates.forEach(r => { bins[Math.min(9, Math.floor(r/10))]++; });
                            datasets.push({
                              label: `${modelName} – ${cls}`,
                              data: bins,
                              backgroundColor: HIST_COLORS_BG[colorIdx % HIST_COLORS_BG.length],
                              borderColor: HIST_COLORS[colorIdx % HIST_COLORS.length],
                              borderWidth: 1.5,
                            });
                            colorIdx++;
                          });
                        });

                        if (datasets.length === 0) return null;
                        return (
                          <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
                            <Box id="vcr-per-class-chart" h="480px" position="relative">
                              <Bar
                                data={{ labels: binLabels, datasets }}
                                options={{
                                  responsive: true, maintainAspectRatio: false,
                                  plugins: {
                                    legend: { position: 'bottom' as const, labels: { font: { size: 12, weight: 600 }, padding: 15 } },
                                    title: { display: true, text: 'Variable Questions: Correct Rate Distribution per Class', font: { size: 16, weight: 'bold' }, padding: { bottom: 20 } },
                                    tooltip: { callbacks: { label: function(ctx) {
                                      const count = Number(ctx.parsed.y ?? 0);
                                      const total = datasets[ctx.datasetIndex]?.data.reduce((a, b) => a + b, 0) ?? 0;
                                      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                                      return `${ctx.dataset.label}: ${count} question${count !== 1 ? 's' : ''} (${pct}% of variable)`;
                                    }}},
                                  },
                                  scales: {
                                    x: {
                                      ticks: { font: { size: 11 } },
                                      grid: { display: false },
                                      title: { display: true, text: 'Correct Rate Across All Trials', font: { size: 12 } },
                                    },
                                    y: {
                                      beginAtZero: true,
                                      ticks: { stepSize: 1, callback: function(v) { return Number.isInteger(Number(v)) ? v : ''; } },
                                      grid: { color: '#ddd' },
                                      title: { display: true, text: 'Number of Questions', font: { size: 12 } },
                                    },
                                  },
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })()}

                      {/* VCR per Class: Key Insights */}
                      {(() => {
                        const classAvgs = classModelData.map(({ cls, models: mds }) => {
                          const valid = mds.filter(d => d.avg !== null) as { avg: number; count: number }[];
                          if (valid.length === 0) return null;
                          return { cls, avgRate: valid.reduce((s, d) => s + (d.avg as number), 0) / valid.length };
                        }).filter(Boolean) as { cls: string; avgRate: number }[];
                        if (classAvgs.length === 0) return null;
                        const sorted  = [...classAvgs].sort((a, b) => b.avgRate - a.avgRate);
                        const highest = sorted[0];
                        const lowest  = sorted[sorted.length - 1];
                        const interp  = (v: number) => v >= 70 ? 'near-correct uncertainty' : v >= 40 ? 'genuine guess-level uncertainty' : 'near-incorrect behavior';
                        // Per-model per-class best/worst combo
                        type MVCR = { model: string; cls: string; rate: number };
                        const combos: MVCR[] = [];
                        classModelData.forEach(({ cls, models: mds }) => {
                          selectedModels.forEach((model, mi) => {
                            const d = mds[mi];
                            if (d.avg !== null) combos.push({ model: model.name, cls, rate: d.avg as number });
                          });
                        });
                        combos.sort((a, b) => b.rate - a.rate);
                        const bestCombo  = combos[0];
                        const worstCombo = combos[combos.length - 1];
                        let text = `Variable questions in "${highest.cls}" averaged ${highest.avgRate.toFixed(1)}% correct across models (${interp(highest.avgRate)})`;
                        if (sorted.length > 1)
                          text += `. "${lowest.cls}" averaged ${lowest.avgRate.toFixed(1)}% (${interp(lowest.avgRate)})`;
                        text += '.';
                        if (combos.length > 1)
                          text += ` ${bestCombo.model}'s variable questions in "${bestCombo.cls}" averaged ${bestCombo.rate.toFixed(1)}%, while ${worstCombo.model}'s in "${worstCombo.cls}" averaged ${worstCombo.rate.toFixed(1)}%.`;
                        return (
                          <Box bg="purple.50" borderRadius="md" p={3} borderWidth="1px" borderColor="purple.100">
                            <Text fontSize="xs" fontWeight="semibold" color="purple.700" mb={1}>Key Insights</Text>
                            <Text fontSize="xs" color="gray.700">{text}</Text>
                          </Box>
                        );
                      })()}
                    </VStack>
                  </Box>
                );
              })()}

              {/* Accuracy vs Response Time Section */}
              {activeResultTab === "summary" && trialResults.length > 0 && (() => {
                const PERF_COLORS = ['#3182CE','#38A169','#DD6B20','#805AD5','#D53F8C','#319795','#744210','#1A365D','#276749','#702459'];
                const PERF_COLORS_BG = ['rgba(49,130,206,0.75)','rgba(56,161,105,0.75)','rgba(221,107,32,0.75)','rgba(128,90,213,0.75)','rgba(213,63,140,0.75)','rgba(49,151,149,0.75)','rgba(116,66,16,0.75)','rgba(26,54,93,0.75)','rgba(39,103,73,0.75)','rgba(112,36,89,0.75)'];

                type AccTimeRow = { model: string; acc: number; avgTimeMs: number; total: number };
                const rows: AccTimeRow[] = selectedModels.map(model => {
                  let t1c = 0, t2c = 0, t3c = 0, total = 0, totalTime = 0, timeCount = 0;
                  trialResults.forEach(qResult => {
                    const mr = qResult.modelResults[model.id];
                    if (!mr) return;
                    total++;
                    if (mr.trial1?.correct) t1c++;
                    if (mr.trial2?.correct) t2c++;
                    if (mr.trial3?.correct) t3c++;
                    if (mr.trial1 && !mr.trial1.aborted) { totalTime += mr.trial1.time; timeCount++; }
                  });
                  return {
                    model: model.name,
                    acc: total > 0 ? ((t1c + t2c + t3c) / (total * 3)) * 100 : 0,
                    avgTimeMs: timeCount > 0 ? totalTime / timeCount : 0,
                    total,
                  };
                }).filter(r => r.total > 0);

                const scatterData = {
                  datasets: rows.map((r, i) => ({
                    label: r.model,
                    data: [{ x: parseFloat(r.acc.toFixed(2)), y: Math.round(r.avgTimeMs) }],
                    backgroundColor: PERF_COLORS_BG[i % PERF_COLORS_BG.length],
                    borderColor: PERF_COLORS[i % PERF_COLORS.length],
                    pointRadius: 10,
                    pointHoverRadius: 13,
                    pointStyle: 'circle' as const,
                    borderWidth: 2,
                  }))
                };
                const scatterOptions: ChartOptions<'scatter'> = {
                  responsive: true,
                  plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle' } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const r = rows[ctx.datasetIndex];
                          return ` ${r.model}: ${Number(ctx.parsed.x ?? 0).toFixed(1)}% accuracy, ${ctx.parsed.y} ms`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: { title: { display: true, text: 'Overall Accuracy (%)' }, min: 0, max: 100 },
                    y: { title: { display: true, text: 'Avg Response Time (ms)' }, beginAtZero: true }
                  }
                };

                // Key Insights
                const sortedByAcc = [...rows].sort((a, b) => b.acc - a.acc);
                const sortedByTime = [...rows].sort((a, b) => b.avgTimeMs - a.avgTimeMs);
                const mostAccurate = sortedByAcc[0];
                const leastAccurate = sortedByAcc[sortedByAcc.length - 1];
                const slowest = sortedByTime[0];
                const fastest = sortedByTime[sortedByTime.length - 1];
                const insightText = rows.length > 1
                  ? `${mostAccurate.model} achieved the highest accuracy (${mostAccurate.acc.toFixed(1)}%) with an avg response time of ${mostAccurate.avgTimeMs.toFixed(0)} ms. ${slowest.model} had the longest avg response time (${slowest.avgTimeMs.toFixed(0)} ms) with ${slowest.acc.toFixed(1)}% accuracy, while ${fastest.model} was fastest (${fastest.avgTimeMs.toFixed(0)} ms) at ${fastest.acc.toFixed(1)}% accuracy.`
                  : rows.length === 1
                    ? `${rows[0].model}: ${rows[0].acc.toFixed(1)}% accuracy, avg response time ${rows[0].avgTimeMs.toFixed(0)} ms.`
                    : '';

                return (
                  <Box mt={8}>
                    <Text fontSize="lg" fontWeight="bold" mb={2}>Accuracy vs. Response Time</Text>
                    <VStack align="stretch" spacing={4}>
                      <Text fontSize="sm" color="gray.600">
                        Plots each model's overall accuracy against its average response time, making it easy to spot trade-offs between speed and correctness — a fast model that scores low or a slow model that barely edges out a quicker one.
                      </Text>

                      <HStack spacing={2} wrap="wrap" justify="space-between">
                        <HStack spacing={2}>
                          <Button size="xs" variant={activeAccVsTimeView === "table" ? "solid" : "outline"} colorScheme="cyan" onClick={() => setActiveAccVsTimeView("table")}>Table</Button>
                          <Button size="xs" variant={activeAccVsTimeView === "charts" ? "solid" : "outline"} colorScheme="cyan" onClick={() => setActiveAccVsTimeView("charts")}>Chart</Button>
                        </HStack>
                        {activeAccVsTimeView === "table" ? (
                          <Button size="xs" colorScheme="cyan" variant="outline" onClick={exportAccVsTimeTable} isDisabled={trialResults.length === 0}>Export Table</Button>
                        ) : (
                          <Menu>
                            <MenuButton as={Button} size="xs" colorScheme="cyan" variant="outline" rightIcon={<ChevronDownIcon />}>Export Chart</MenuButton>
                            <MenuList>
                              <MenuItem onClick={() => exportChartById('acc-vs-time-chart', 'png', 'accuracy_vs_response_time')} fontSize="sm">Export as PNG</MenuItem>
                              <MenuItem onClick={() => exportChartById('acc-vs-time-chart', 'svg', 'accuracy_vs_response_time')} fontSize="sm">Export as SVG</MenuItem>
                            </MenuList>
                          </Menu>
                        )}
                      </HStack>

                      {activeAccVsTimeView === "table" && (
                        <Box overflowX="auto">
                          <Table size="sm" variant="simple" sx={{ '& tbody tr:last-child td': { borderBottom: 'none' } }}>
                            <Thead>
                              <Tr>
                                <Th borderBottom="2px" whiteSpace="nowrap">Model</Th>
                                <Th borderBottom="2px" textAlign="center" whiteSpace="nowrap">Overall Accuracy (%)</Th>
                                <Th borderBottom="2px" textAlign="center" whiteSpace="nowrap">Avg Response Time (ms)</Th>
                                <Th borderBottom="2px" textAlign="center" whiteSpace="nowrap">Questions Evaluated</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {rows.map((r, i) => (
                                <Tr key={`${r.model}-${i}`}>
                                  <Td fontWeight="medium" whiteSpace="nowrap">
                                    <HStack spacing={2}>
                                      <Box w={2} h={2} borderRadius="full" bg={PERF_COLORS[i % PERF_COLORS.length]} flexShrink={0} />
                                      <Text>{r.model}</Text>
                                    </HStack>
                                  </Td>
                                  <Td textAlign="center" fontWeight="semibold" color={r.acc >= 70 ? "green.600" : r.acc >= 50 ? "orange.500" : "red.500"}>
                                    {r.acc.toFixed(1)}%
                                  </Td>
                                  <Td textAlign="center">{r.avgTimeMs.toFixed(0)}</Td>
                                  <Td textAlign="center">{r.total}</Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      )}

                      {activeAccVsTimeView === "charts" && (
                        <Box id="acc-vs-time-chart">
                          <Scatter data={scatterData} options={scatterOptions} />
                        </Box>
                      )}

                      {insightText && (
                        <Box bg="cyan.50" borderRadius="md" p={3} borderWidth="1px" borderColor="cyan.100">
                          <Text fontSize="xs" fontWeight="semibold" color="cyan.700" mb={1}>Key Insights</Text>
                          <Text fontSize="xs" color="gray.700">{insightText}</Text>
                        </Box>
                      )}
                    </VStack>
                  </Box>
                );
              })()}

              {/* Performance: Prompt Length vs Response Time */}
              {activeResultTab === "summary" && trialResults.length > 0 && (() => {
                const PERF_COLORS = ['#3182CE','#38A169','#DD6B20','#805AD5','#D53F8C','#319795','#744210','#1A365D','#276749','#702459'];
                const PERF_COLORS_BG = ['rgba(49,130,206,0.75)','rgba(56,161,105,0.75)','rgba(221,107,32,0.75)','rgba(128,90,213,0.75)','rgba(213,63,140,0.75)','rgba(49,151,149,0.75)','rgba(116,66,16,0.75)','rgba(26,54,93,0.75)','rgba(39,103,73,0.75)','rgba(112,36,89,0.75)'];

                type PerfRow = { model: string; avgTokens: number; avgTimeMs: number; count: number };
                const perfRows: PerfRow[] = selectedModels.map(model => {
                  let totalTokens = 0, totalTime = 0, count = 0;
                  trialResults.forEach(qResult => {
                    const mr = qResult.modelResults[model.id];
                    if (!mr?.trial1 || mr.trial1.aborted) return;
                    totalTokens += estimateTokenCount(qResult.question);
                    totalTime += mr.trial1.time;
                    count++;
                  });
                  return { model: model.name, avgTokens: count > 0 ? totalTokens / count : 0, avgTimeMs: count > 0 ? totalTime / count : 0, count };
                }).filter(r => r.count > 0);

                // Overview scatter: one dataset per model, single point (avgTokens, avgTimeMs)
                const overviewData = {
                  datasets: perfRows.map((r, i) => ({
                    label: r.model,
                    data: [{ x: Math.round(r.avgTokens), y: Math.round(r.avgTimeMs) }],
                    backgroundColor: PERF_COLORS_BG[i % PERF_COLORS_BG.length],
                    borderColor: PERF_COLORS[i % PERF_COLORS.length],
                    pointRadius: 10,
                    pointHoverRadius: 13,
                    pointStyle: 'circle' as const,
                    borderWidth: 2,
                  }))
                };
                const overviewOptions: ChartOptions<'scatter'> = {
                  responsive: true,
                  plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle' } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const r = perfRows[ctx.datasetIndex];
                          return ` ${r.model}: ${ctx.parsed.x} tokens, ${ctx.parsed.y} ms`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: { title: { display: true, text: 'Avg Prompt Length (tokens)' }, beginAtZero: false },
                    y: { title: { display: true, text: 'Avg Response Time (ms)' }, beginAtZero: true }
                  }
                };

                // Per-model scatter: one dataset = one model, points = questions
                const perModelCharts = selectedModels.map((model, mi) => {
                  const pts = trialResults
                    .filter(qResult => {
                      const mr = qResult.modelResults[model.id];
                      return mr?.trial1 && !mr.trial1.aborted;
                    })
                    .map(qResult => ({
                      x: estimateTokenCount(qResult.question),
                      y: qResult.modelResults[model.id].trial1.time,
                      id: qResult.questionId,
                    }));
                  const data = {
                    datasets: [{
                      label: model.name,
                      data: pts,
                      backgroundColor: PERF_COLORS_BG[mi % PERF_COLORS_BG.length],
                      borderColor: PERF_COLORS[mi % PERF_COLORS.length],
                      pointRadius: 5,
                      pointHoverRadius: 7,
                      borderWidth: 1.5,
                    }]
                  };
                  const opts: ChartOptions<'scatter'> = {
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const pt = pts[ctx.dataIndex];
                            return ` Q${pt.id}: ${ctx.parsed.x} tokens, ${ctx.parsed.y} ms`;
                          }
                        }
                      }
                    },
                    scales: {
                      x: { title: { display: true, text: 'Prompt Length (tokens)' }, beginAtZero: false },
                      y: { title: { display: true, text: 'Response Time (ms)' }, beginAtZero: true }
                    }
                  };
                  return { model, data, opts, pts };
                }).filter(c => c.pts.length > 0);

                // Key Insights
                const sortedByTime = [...perfRows].sort((a, b) => b.avgTimeMs - a.avgTimeMs);
                const slowest = sortedByTime[0];
                const fastest = sortedByTime[sortedByTime.length - 1];
                const sortedByLen = [...perfRows].sort((a, b) => b.avgTokens - a.avgTokens);
                const longestQ = sortedByLen[0];
                const shortestQ = sortedByLen[sortedByLen.length - 1];
                const insightText = perfRows.length > 1
                  ? `${slowest.model} had the slowest avg response (${slowest.avgTimeMs.toFixed(0)} ms), while ${fastest.model} was fastest (${fastest.avgTimeMs.toFixed(0)} ms). ${longestQ.model} answered the longest prompts on avg (${longestQ.avgTokens.toFixed(0)} tokens) vs ${shortestQ.model} (${shortestQ.avgTokens.toFixed(0)} tokens).`
                  : perfRows.length === 1
                    ? `${perfRows[0].model}: avg prompt ${perfRows[0].avgTokens.toFixed(0)} tokens, avg response time ${perfRows[0].avgTimeMs.toFixed(0)} ms.`
                    : '';

                return (
                  <Box mt={8}>
                    <Text fontSize="lg" fontWeight="bold" mb={2}>Prompt Length &amp; Response Time</Text>
                    <VStack align="stretch" spacing={4}>
                      <Text fontSize="sm" color="gray.600">
                        Compares the average prompt length (in estimated tokens) and average response time (in milliseconds) for each model across all evaluated questions. The per-model scatter plots show individual question lengths vs. response times to reveal any correlation.
                      </Text>

                      {/* View toggle */}
                      <HStack spacing={2} wrap="wrap" justify="space-between">
                        <HStack spacing={2}>
                          <Button size="xs" variant={activePerformanceView === "table" ? "solid" : "outline"} colorScheme="green" onClick={() => setActivePerformanceView("table")}>Table</Button>
                          <Button size="xs" variant={activePerformanceView === "overview" ? "solid" : "outline"} colorScheme="green" onClick={() => setActivePerformanceView("overview")}>Overview Chart</Button>
                          <Button size="xs" variant={activePerformanceView === "per-model" ? "solid" : "outline"} colorScheme="green" onClick={() => setActivePerformanceView("per-model")}>Per-Model Charts</Button>
                        </HStack>
                        {activePerformanceView === "table" && (
                          <Button size="xs" colorScheme="green" variant="outline" onClick={exportPerformanceTable} isDisabled={trialResults.length === 0}>Export Table</Button>
                        )}
                        {activePerformanceView === "overview" && (
                          <Menu>
                            <MenuButton as={Button} size="xs" colorScheme="green" variant="outline" rightIcon={<ChevronDownIcon />}>Export Chart</MenuButton>
                            <MenuList>
                              <MenuItem onClick={() => exportChartById('perf-overview-chart', 'png', 'performance_overview')} fontSize="sm">Export as PNG</MenuItem>
                              <MenuItem onClick={() => exportChartById('perf-overview-chart', 'svg', 'performance_overview')} fontSize="sm">Export as SVG</MenuItem>
                            </MenuList>
                          </Menu>
                        )}
                      </HStack>

                      {/* Table view */}
                      {activePerformanceView === "table" && (
                        <Box overflowX="auto">
                          <Table size="sm" variant="simple" sx={{ '& tbody tr:last-child td': { borderBottom: 'none' } }}>
                            <Thead>
                              <Tr>
                                <Th borderBottom="2px" whiteSpace="nowrap">Model</Th>
                                <Th borderBottom="2px" textAlign="center" whiteSpace="nowrap">Avg Prompt Length (tokens)</Th>
                                <Th borderBottom="2px" textAlign="center" whiteSpace="nowrap">Avg Response Time (ms)</Th>
                                <Th borderBottom="2px" textAlign="center" whiteSpace="nowrap">Questions Evaluated</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {perfRows.map((r, i) => (
                                <Tr key={`${r.model}-${i}`}>
                                  <Td fontWeight="medium" whiteSpace="nowrap">{r.model}</Td>
                                  <Td textAlign="center">{r.avgTokens.toFixed(1)}</Td>
                                  <Td textAlign="center">{r.avgTimeMs.toFixed(0)}</Td>
                                  <Td textAlign="center">{r.count}</Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      )}

                      {/* Overview scatter chart */}
                      {activePerformanceView === "overview" && (
                        <Box id="perf-overview-chart">
                          <Scatter data={overviewData} options={overviewOptions} />
                        </Box>
                      )}

                      {/* Per-model scatter charts */}
                      {activePerformanceView === "per-model" && (
                        <Box>
                          <Box display="grid" gridTemplateColumns="1fr" gap={6}>
                            {perModelCharts.map(({ model, data, opts }) => (
                              <Box key={model.id} id={`perf-model-chart-${model.id}`} p={3} borderWidth="1px" borderRadius="md" borderColor="gray.200">
                                <HStack justify="space-between" mb={2}>
                                  <Text fontSize="sm" fontWeight="semibold">{model.name}</Text>
                                  <Menu>
                                    <MenuButton as={Button} size="xs" colorScheme="green" variant="outline" rightIcon={<ChevronDownIcon />}>Export Chart</MenuButton>
                                    <MenuList>
                                      <MenuItem onClick={() => exportChartById(`perf-model-chart-${model.id}`, 'png', `performance_${model.name.replace(/\s+/g, '_')}`)} fontSize="sm">Export as PNG</MenuItem>
                                      <MenuItem onClick={() => exportChartById(`perf-model-chart-${model.id}`, 'svg', `performance_${model.name.replace(/\s+/g, '_')}`)} fontSize="sm">Export as SVG</MenuItem>
                                    </MenuList>
                                  </Menu>
                                </HStack>
                                <Scatter data={data} options={opts} />
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {/* Key Insights */}
                      {insightText && (
                        <Box bg="green.50" borderRadius="md" p={3} borderWidth="1px" borderColor="green.100">
                          <Text fontSize="xs" fontWeight="semibold" color="green.700" mb={1}>Key Insights</Text>
                          <Text fontSize="xs" color="gray.700">{insightText}</Text>
                        </Box>
                      )}
                    </VStack>
                  </Box>
                );
              })()}

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

    {/* Review Modal — placed outside <Flex> so it renders as a true portal overlay */}
    {/* Review Modal */}
    <Modal isOpen={reviewModalOpen} onClose={() => setReviewModalOpen(false)} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader pb={2}>
          <HStack>
            <Text>Review Required</Text>
            <Badge colorScheme="orange" borderRadius="full">{reviewQueue.length} remaining</Badge>
          </HStack>
          <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={1}>
            Read the model response and select the correct answer letter.
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {(() => {
            const item = reviewQueue[reviewModalIndex];
            if (!item) return <Text color="gray.500">All reviews complete.</Text>;

            // ── Batch review (extended trials) ──────────────────────────────
            if (item.batchQuestions) {
              const currentAnswers = batchAnswers[item.id] || {};
              const pending = item.batchQuestions.filter(bq => bq.needsReview && !currentAnswers[bq.questionIndex]);
              const allAnswered = pending.length === 0;
              return (
                <VStack align="stretch" spacing={4}>
                  <HStack fontSize="xs" color="gray.500" flexWrap="wrap" spacing={2}>
                    <Text fontWeight="semibold" color="gray.700">{item.modelName}</Text>
                    <Text>·</Text><Text>{item.trialKey === 'trial2' ? 'Trial 2' : item.trialKey === 'trial3' ? 'Trial 3' : `Extended Trial ${item.trialNumber}`}</Text>
                    <Text>·</Text><Text>{item.batchQuestions.filter(bq => bq.needsReview).length} of {item.batchQuestions.length} need review</Text>
                  </HStack>

                  <Box>
                    <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={1} textTransform="uppercase" letterSpacing="wide">Model Response</Text>
                    <Box p={3} bg="gray.50" borderRadius="md" fontSize="sm" fontFamily="mono" whiteSpace="pre-wrap" maxH="160px" overflowY="auto" lineHeight="1.5">
                      {item.rawResponse || <Text as="span" color="gray.400">(empty response)</Text>}
                    </Box>
                  </Box>

                  <Divider />

                  <VStack align="stretch" spacing={3}>
                    {item.batchQuestions.map((bq, i) => {
                      // For parsed questions, pre-select their parsed answer unless overridden
                      const selected = currentAnswers[bq.questionIndex] ?? (!bq.needsReview ? bq.parsedAnswer : undefined);
                      const isOverride = !bq.needsReview && currentAnswers[bq.questionIndex] !== undefined;
                      return (
                        <Box key={bq.questionIndex} p={3} borderRadius="md" border="1px" borderColor={bq.needsReview ? "orange.200" : "gray.100"} bg={bq.needsReview ? "orange.50" : "gray.50"}>
                          <HStack mb={2} justify="space-between" flexWrap="wrap">
                            <Text fontSize="xs" fontWeight="semibold" color="gray.600">Q{i + 1} &nbsp;·&nbsp; Correct: <Text as="span" color="green.600" fontWeight="bold">{bq.correctAnswer}</Text></Text>
                            {selected && (
                              <Badge colorScheme={selected === bq.correctAnswer ? "green" : "red"} fontSize="xs">
                                {isOverride ? "Override:" : bq.needsReview ? "Selected:" : "Parsed:"} {selected}
                              </Badge>
                            )}
                          </HStack>
                          <Box p={2} bg="white" borderRadius="sm" fontSize="sm" color="gray.700" lineHeight="1.6" maxH="120px" overflowY="auto" mb={2}>
                            {bq.question}
                          </Box>
                          <HStack spacing={1} flexWrap="wrap">
                            {getAnswerLetters(bq.question).map(letter => (
                              <Button
                                key={letter}
                                size="sm"
                                w="40px"
                                colorScheme={letter === bq.correctAnswer ? "green" : "blue"}
                                variant={selected === letter ? "solid" : "outline"}
                                fontWeight="bold"
                                onClick={() => setBatchAnswers(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), [bq.questionIndex]: letter } }))}
                              >
                                {letter}
                              </Button>
                            ))}
                            <Button
                              size="sm"
                              colorScheme="red"
                              variant={selected === 'Wrong' ? "solid" : "outline"}
                              fontWeight="bold"
                              onClick={() => setBatchAnswers(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), [bq.questionIndex]: 'Wrong' } }))}
                              title="No valid answer in this response"
                            >
                              Wrong
                            </Button>
                          </HStack>
                        </Box>
                      );
                    })}
                  </VStack>

                  <Divider />

                  <HStack spacing={3}>
                    <Button
                      colorScheme="blue"
                      isDisabled={!allAnswered}
                      onClick={() => resolveBatchReview(item, currentAnswers)}
                      flex={1}
                    >
                      {allAnswered ? 'Submit All' : `Submit All (${pending.length} remaining)`}
                    </Button>
                    <Button variant="ghost" colorScheme="gray" onClick={() => skipReview(item)}>Skip</Button>
                  </HStack>
                </VStack>
              );
            }

            // ── Single-question review (trials 1–3) ────────────────────────
            const trialLabel = item.trialKey === 'trial1' ? 'Trial 1' : item.trialKey === 'trial2' ? 'Trial 2' : item.trialKey === 'trial3' ? 'Trial 3' : 'Extra Trial';
            return (
              <VStack align="stretch" spacing={4}>
                <HStack fontSize="xs" color="gray.500" flexWrap="wrap" spacing={2}>
                  <Text fontWeight="semibold" color="gray.700">{item.modelName}</Text>
                  <Text>·</Text><Text>{trialLabel}</Text>
                  <Text>·</Text><Text>Question {item.questionIndex + 1}</Text>
                  <Text>·</Text>
                  <Text>Correct answer: <Text as="span" fontWeight="bold" color="green.600">{item.correctAnswer}</Text></Text>
                </HStack>

                <Box>
                  <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={1} textTransform="uppercase" letterSpacing="wide">Question</Text>
                  <Box p={3} bg="blue.50" borderRadius="md" fontSize="sm" lineHeight="1.6">{item.question}</Box>
                </Box>

                <Box>
                  <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={1} textTransform="uppercase" letterSpacing="wide">Model Response</Text>
                  <Box p={3} bg="gray.50" borderRadius="md" fontSize="sm" fontFamily="mono" whiteSpace="pre-wrap" maxH="240px" overflowY="auto" lineHeight="1.5">
                    {item.rawResponse}
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={2} textTransform="uppercase" letterSpacing="wide">Select Answer</Text>
                  <HStack spacing={2} flexWrap="wrap">
                    {getAnswerLetters(item.question).map(letter => (
                      <Button
                        key={letter}
                        size="md"
                        w="52px"
                        colorScheme={letter === item.correctAnswer.toUpperCase() ? "green" : "blue"}
                        variant="outline"
                        fontWeight="bold"
                        onClick={() => resolveReview(item, letter)}
                        _hover={{ bg: letter === item.correctAnswer.toUpperCase() ? "green.50" : "blue.50" }}
                      >
                        {letter}
                      </Button>
                    ))}
                    {item.correctAnswer.toUpperCase() !== 'WRONG' && (
                      <Button
                        size="md"
                        colorScheme="red"
                        variant="outline"
                        fontWeight="bold"
                        onClick={() => resolveReview(item, 'Wrong')}
                        _hover={{ bg: "red.50" }}
                        title="Mark as wrong — no valid answer in this response"
                      >
                        Wrong
                      </Button>
                    )}
                    <Button size="md" variant="ghost" colorScheme="gray" onClick={() => skipReview(item)} ml={1}>
                      Skip
                    </Button>
                  </HStack>
                </Box>
              </VStack>
            );
          })()}
        </ModalBody>
        <ModalFooter borderTop="1px" borderColor="gray.100" pt={3}>
          <HStack w="full" justify="space-between">
            <HStack spacing={2}>
              <Button size="sm" variant="outline" isDisabled={reviewModalIndex === 0} onClick={() => setReviewModalIndex(i => i - 1)}>← Prev</Button>
              <Text fontSize="sm" color="gray.500">{Math.min(reviewModalIndex + 1, reviewQueue.length)} / {reviewQueue.length}</Text>
              <Button size="sm" variant="outline" isDisabled={reviewModalIndex >= reviewQueue.length - 1} onClick={() => setReviewModalIndex(i => i + 1)}>Next →</Button>
            </HStack>
            <Button size="sm" onClick={() => setReviewModalOpen(false)}>Close</Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
    </>
  );
}