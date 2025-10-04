"use client";

import { useState } from "react";
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
  Tag,
  Flex,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from "@chakra-ui/react";

interface Model {
  id: string;
  name: string;
  provider: "openai" | "deepseek" | "openwebui";
}

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
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

    try {
      const text = await file.text();
      // Process CSV file here
      toast({
        title: "File uploaded successfully",
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error uploading file",
        description: "Please make sure the file is in the correct format",
        status: "error",
        duration: 3000,
      });
    }
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
    <Container maxW="container.xl" py={8}>
      <VStack spacing={6} align="stretch">
        <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
          <HStack spacing={3} mb={6}>
            <Box p={2} bg="purple.100" borderRadius="md">
              <Text color="purple.600">🤖</Text>
            </Box>
            <Heading size="md">AI Models</Heading>
          </HStack>

          <Box>
            <VStack spacing={4} align="stretch">
              <HStack spacing={4} align="flex-end">
                <FormControl flex="1">
                  <FormLabel>API Provider</FormLabel>
                  <Select 
                    value={currentProvider} 
                    onChange={(e) => setCurrentProvider(e.target.value as "openai" | "deepseek" | "openwebui")}
                    bg="gray.50"
                  >
                    <option value="openai">OpenAI API</option>
                    <option value="deepseek">DeepSeek API</option>
                    <option value="openwebui">Open WebUI</option>
                  </Select>
                </FormControl>

                <FormControl flex="2">
                  <FormLabel>API Key</FormLabel>
                  <Input
                    type="password"
                    value={getApiKey()}
                    onChange={(e) => updateApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    bg="gray.50"
                  />
                </FormControl>
              </HStack>

              <HStack spacing={4} align="flex-end">
                <FormControl flex="2">
                  <FormLabel>Base URL (Optional)</FormLabel>
                  <Input
                    value={getBaseUrl()}
                    onChange={(e) => updateBaseUrl(e.target.value)}
                    placeholder={getDefaultBaseUrl()}
                    bg="gray.50"
                  />
                </FormControl>

                <FormControl flex="1">
                  <Button
                    colorScheme="purple"
                    width="full"
                    onClick={verifyApiKey}
                    isLoading={isLoading}
                  >
                    Load Models
                  </Button>
                </FormControl>
              </HStack>

              <FormControl>
                <FormLabel>Add Model</FormLabel>
                <Select
                  placeholder="Select model"
                  onChange={(e) => {
                    const model = availableModels.find(m => m.id === e.target.value);
                    if (model && !selectedModels.find(m => m.id === model.id)) {
                      setSelectedModels(prev => [...prev, model]);
                    }
                  }}
                  bg="gray.50"
                >
                  {availableModels
                    .filter(model => model.provider === currentProvider)
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))
                  }
                </Select>
              </FormControl>

              {selectedModels.length > 0 && (
                <Box mt={4}>
                  <Text fontWeight="medium" mb={2}>Selected Models:</Text>
                  <Flex wrap="wrap" gap={2}>
                    {selectedModels.map((model) => (
                      <Tag
                        key={model.id}
                        size="md"
                        borderRadius="full"
                        variant="solid"
                        colorScheme={
                          model.provider === "openai" ? "green" :
                          model.provider === "deepseek" ? "blue" : "purple"
                        }
                      >
                        <HStack spacing={2}>
                          <Text>{model.name}</Text>
                          <Button
                            size="xs"
                            variant="unstyled"
                            onClick={() => setSelectedModels(prev => prev.filter(m => m.id !== model.id))}
                            ml={1}
                            p={0}
                            _hover={{ opacity: 0.8 }}
                          >
                            ✕
                          </Button>
                        </HStack>
                      </Tag>
                    ))}
                  </Flex>
                </Box>
              )}
            </VStack>
          </Box>
        </Box>

        <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
          <HStack spacing={3} mb={6}>
            <Box p={2} bg="purple.100" borderRadius="md">
              <Text color="purple.600">📝</Text>
            </Box>
            <Heading size="md">MCQ Database</Heading>
          </HStack>

          <VStack spacing={2} align="stretch">
            <Text fontSize="sm" color="gray.600">
              Question Database File
            </Text>
            <Text fontSize="xs" color="gray.500">
              Upload a CSV file with columns: ID, Question, Correct Answer
            </Text>

            <Button
              leftIcon={<Text>⬆️</Text>}
              colorScheme="purple"
              variant="solid"
              onClick={() => document.getElementById('file-upload')?.click()}
              width="full"
            >
              Upload CSV
            </Button>
            <Input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              display="none"
            />
          </VStack>
        </Box>

        <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
          <HStack spacing={3} mb={6}>
            <Box p={2} bg="purple.100" borderRadius="md">
              <Text color="purple.600">⚙️</Text>
            </Box>
            <Heading size="md">Evaluation Configuration</Heading>
          </HStack>

          <VStack spacing={8} align="stretch">
            <FormControl>
              <FormLabel>System Prompt</FormLabel>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter system prompt for the AI model"
                rows={4}
                bg="gray.50"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Temperature: {temperature}</FormLabel>
              <Slider
                value={temperature}
                onChange={setTemperature}
                min={0}
                max={2}
                step={0.1}
                colorScheme="purple"
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

            <Button
              colorScheme="purple"
              width="full"
              isDisabled={selectedModels.length === 0}
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