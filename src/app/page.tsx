"use client";

import { useState } from "react";
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

interface EvaluationResult {
  questionId: string;
  modelResults: Record<string, boolean>;
}

interface ApiConfig {
  key: string;
  baseUrl?: string;
}

export default function Home() {
  const [selectedModels, setSelectedModels] = useState<Model[]>([]);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [temperature, setTemperature] = useState(1.0);
  const [autoClearHistory, setAutoClearHistory] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [systemPrompt, setSystemPrompt] = useState("Answer the following multiple choice question by providing only the letter of the correct answer (e.g A, B, C, or D).");
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [currentProvider, setCurrentProvider] = useState<"openai" | "deepseek" | "openwebui">("openai");
  const [apiConfigs, setApiConfigs] = useState<Record<string, ApiConfig>>({
    openai: { key: "", baseUrl: "https://api.openai.com/v1" },
    deepseek: { key: "", baseUrl: "https://api.deepseek.com/v1" },
    openwebui: { key: "", baseUrl: "http://localhost:3001/v1" },
  });
  const toast = useToast();

  const getApiKey = () => apiConfigs[currentProvider].key;
  const getBaseUrl = () => apiConfigs[currentProvider].baseUrl || "";
  const getDefaultBaseUrl = () => {
    switch (currentProvider) {
      case "openai":
        return "https://api.openai.com/v1";
      case "deepseek":
        return "https://api.deepseek.com/v1";
      case "openwebui":
        return "http://localhost:3001/v1";
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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lineCount = content.split('\n')
        .filter(line => line.trim().length > 0)
        .length - 1; // Subtract header row
      setQuestionCount(lineCount);
    };
    
    reader.readAsText(file);
  };

  const verifyApiKey = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      toast({
        title: "Please enter an API key",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    const baseUrl = getBaseUrl() || getDefaultBaseUrl();
    setIsLoading(true);
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const models = data.data.map((model: any) => ({
        id: model.id,
        name: model.id,
        provider: currentProvider,
      }));

      setAvailableModels(prev => {
        const filteredPrev = prev.filter(m => m.provider !== currentProvider);
        return [...filteredPrev, ...models];
      });

      toast({
        title: `${currentProvider} API key verified`,
        description: `${models.length} models available`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error(`Error verifying ${currentProvider} API key:`, error);
      toast({
        title: `Error verifying ${currentProvider} API key`,
        description: "Please check your API key and try again",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxW="8xl" py={4}>
      <VStack spacing={6} align="stretch">
        <Box p={6} borderRadius="lg" bg="purple.50" textAlign="center">
          <Heading size="lg" color="purple.700" mb={2}>LLM Evaluation Dashboard</Heading>
          <Text fontSize="md" color="purple.600">Accuracy vs Consistency on MCQ</Text>
        </Box>

        <Box p={6} borderRadius="lg" bg="white" boxShadow="lg" border="1px" borderColor="purple.100">
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="purple.100" borderRadius="md">
              <Text fontSize="sm" color="purple.600">🤖</Text>
            </Box>
            <Heading size="sm">1. Add Large Language Models (LLMs)</Heading>
          </HStack>

          <Box>
            <VStack spacing={4} align="stretch">
              <HStack spacing={3} align="flex-end">
                <FormControl flex="1">
                  <FormLabel fontSize="sm">API Provider</FormLabel>
                  <Select 
                    value={currentProvider} 
                    onChange={(e) => setCurrentProvider(e.target.value as "openai" | "deepseek" | "openwebui")}
                    bg="gray.50"
                    size="sm"
                  >
                    <option value="openai">OpenAI API</option>
                    <option value="deepseek">DeepSeek API</option>
                    <option value="openwebui">Open WebUI</option>
                  </Select>
                </FormControl>

                <FormControl flex="2">
                  <FormLabel fontSize="sm">API Key</FormLabel>
                  <Input
                    type="password"
                    value={getApiKey()}
                    onChange={(e) => updateApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    bg="gray.50"
                    size="sm"
                  />
                </FormControl>

                <FormControl flex="2">
                  <FormLabel fontSize="sm">Base URL (Optional)</FormLabel>
                  <Input
                    value={getBaseUrl()}
                    onChange={(e) => updateBaseUrl(e.target.value)}
                    placeholder={getDefaultBaseUrl()}
                    bg="gray.50"
                    size="sm"
                  />
                </FormControl>
              </HStack>

              <FormControl>
                <FormLabel fontSize="sm">Add Model</FormLabel>
                <HStack spacing={3} align="flex-end">
                  <Box position="relative" flex="1">
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
                      <MenuList bg="gray.50" p={0}>
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
                          {availableModels
                            .filter(model => 
                              !selectedModels.some(m => m.id === model.id) &&
                              (model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                               model.id.toLowerCase().includes(modelSearch.toLowerCase()))
                            )
                            .map(model => (
                              <MenuItem
                                key={model.id}
                                onClick={() => {
                                  setSelectedModels(prev => [...prev, model]);
                                  setModelSearch("");
                                }}
                                py={2}
                                bg="gray.50"
                                _hover={{ bg: "gray.100" }}
                              >
                                {model.name}
                              </MenuItem>
                            ))
                          }
                        </Box>
                      </MenuList>
                    </Menu>
                  </Box>
                  <Button
                    colorScheme="purple"
                    onClick={verifyApiKey}
                    isLoading={isLoading}
                    size="sm"
                    leftIcon={<RepeatIcon />}
                  >
                    Load Models
                  </Button>
                </HStack>
              </FormControl>

              {selectedModels.length > 0 && (
                <Box mt={3}>
                  <Text fontWeight="medium" fontSize="sm" mb={1.5}>Selected Models:</Text>
                  <Flex wrap="wrap" gap={2}>
                    {selectedModels.map((model, index) => (
                      <Box
                        key={model.id}
                        bg="purple.50"
                        border="1px"
                        borderColor="purple.200"
                        borderRadius="md"
                        px={3}
                        py={1.5}
                      >
                        <HStack spacing={2} align="center">
                          <Text fontSize="xs" color="purple.700">
                            <Text as="span" color="purple.500" mr={1}>{index + 1}.</Text>
                            <Text as="span" color="purple.500">{model.provider}/</Text>
                            {model.name}
                          </Text>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorScheme="purple"
                            onClick={() => setSelectedModels(prev => prev.filter(m => m.id !== model.id))}
                            p={1}
                            height="auto"
                            minW="auto"
                            _hover={{ opacity: 0.8 }}
                          >
                            ✕
                          </Button>
                        </HStack>
                      </Box>
                    ))}
                  </Flex>
                </Box>
              )}
            </VStack>
          </Box>
        </Box>

        <Box p={6} borderRadius="lg" bg="white" boxShadow="lg" border="1px" borderColor="purple.100">
          <HStack spacing={8} align="flex-start">
            {/* Left Column */}
            <VStack spacing={4} align="stretch" flex="1">
              <HStack spacing={2}>
                <Box p={1.5} bg="purple.100" borderRadius="md">
                  <Text fontSize="sm" color="purple.600">📝</Text>
                </Box>
                <Heading size="sm">2. MCQ Database</Heading>
              </HStack>

              <Box>
                <Text fontSize="md" color="gray.700" fontWeight="medium" mb={1}>
                  Question Database File
                </Text>
                <Text fontSize="sm" color="gray.500">
                  Upload a CSV file with columns: ID, Question, Correct Answer
                </Text>
              </Box>

              <Button
                leftIcon={<AttachmentIcon />}
                colorScheme="purple"
                variant="solid"
                onClick={() => document.getElementById('file-upload')?.click()}
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

        <Box p={6} borderRadius="lg" bg="white" boxShadow="lg" border="1px" borderColor="purple.100">
          <HStack spacing={2} mb={4}>
            <Box p={1.5} bg="purple.100" borderRadius="md">
              <Text fontSize="sm" color="purple.600">⚙️</Text>
            </Box>
            <Heading size="sm">3. LLMs Configuration</Heading>
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

            <Button
              colorScheme="purple"
              width="50%"
              isDisabled={selectedModels.length === 0}
              size="md"
              alignSelf="flex-start"
              leftIcon={<TriangleUpIcon transform="rotate(90deg)" boxSize={3} />}
            >
              Start Evaluation
            </Button>
          </VStack>
        </Box>

        {results.length > 0 && (
          <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
            <HStack spacing={3} mb={6}>
              <Box p={2} bg="purple.100" borderRadius="md">
                <Text color="purple.600">📊</Text>
              </Box>
              <Heading size="md">Results</Heading>
            </HStack>

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
      </VStack>
    </Container>
  );
}