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
  Alert,
  AlertIcon,
  Text,
  HStack,
  Tag,
  Flex,
  useColorModeValue,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from "@chakra-ui/react";
import { verifyOpenAIKey, verifyDeepSeekKey, verifyOpenWebUIKey } from "./api";

interface Model {
  id: string;
  name: string;
  provider: "openai" | "deepseek" | "openwebui";
}

interface EvaluationResult {
  questionId: string;
  modelResults: Record<string, boolean>;
}

export default function Home() {
  const [openaiKey, setOpenaiKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [openwebuiKey, setOpenwebuiKey] = useState("");
  const [selectedModels, setSelectedModels] = useState<Model[]>([]);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

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

  const verifyApiKey = async (provider: string, key: string) => {
    if (!key) {
      toast({
        title: "Please enter an API key",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setIsLoading(true);
    try {
      let models: Model[] = [];
      
      switch (provider) {
        case "openai":
          models = await verifyOpenAIKey(key);
          break;
        case "deepseek":
          models = await verifyDeepSeekKey(key);
          break;
        case "openwebui":
          models = await verifyOpenWebUIKey(key);
          break;
      }

      setAvailableModels(prev => {
        const filteredPrev = prev.filter(m => m.provider !== provider);
        return [...filteredPrev, ...models];
      });

      toast({
        title: `${provider} API key verified`,
        description: `${models.length} models available`,
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: `Invalid ${provider} API key`,
        description: error instanceof Error ? error.message : "Verification failed",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startEvaluation = async () => {
    if (selectedModels.length === 0) {
      toast({
        title: "Please select at least one model",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setIsLoading(true);
    try {
      // Implement evaluation logic here
      setResults([]);
    } catch (error) {
      toast({
        title: "Error during evaluation",
        description: "Please check your inputs and try again",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const bgColor = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Container maxW="container.lg" py={8}>
      <VStack spacing={6} align="stretch">
        <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
          <HStack spacing={3} mb={6}>
            <Box p={2} bg="purple.100" borderRadius="md">
              <Text color="purple.600">⚙️</Text>
            </Box>
            <Heading size="md">Evaluation Configuration</Heading>
          </HStack>

          <VStack spacing={8} align="stretch">
            <Box>
              <FormControl>
                <FormLabel>Temperature</FormLabel>
                <Slider
                  value={temperature}
                  onChange={(value: number) => setTemperature(value)}
                  min={0}
                  max={2}
                  step={0.01}
                  colorScheme="purple"
                >
                  <SliderTrack>
                    <SliderFilledTrack />
                  </SliderTrack>
                  <SliderThumb boxSize={4} />
                </Slider>
                <Text mt={2} fontSize="sm" color="gray.600">
                  Controls randomness. Lower = focused, higher = creative.
                </Text>
                <Text fontSize="sm" color="gray.900" fontWeight="medium">
                  {temperature.toFixed(2)}
                </Text>
              </FormControl>
            </Box>

            <Box>
              <FormControl>
                <FormLabel>System Prompt</FormLabel>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are a helpful assistant. Answer the following multiple choice question by providing only the letter of the correct answer (A, B, C, or D)."
                  size="md"
                  rows={4}
                  borderRadius="md"
                  borderColor="gray.200"
                  _hover={{ borderColor: "purple.400" }}
                  _focus={{ borderColor: "purple.500", boxShadow: "0 0 0 1px var(--chakra-colors-purple-500)" }}
                />
                <Text mt={2} fontSize="sm" color="gray.600">
                  Guides model behavior for each API call.
                </Text>
              </FormControl>
            </Box>

            <Button
              colorScheme="purple"
              size="lg"
              width="full"
              rightIcon={<Text>▶</Text>}
              onClick={startEvaluation}
              isLoading={isLoading}
              loadingText="Running Evaluation"
              borderRadius="md"
              py={7}
            >
              Run Evaluation
            </Button>
          </VStack>
        </Box>

        <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
          <HStack spacing={3} mb={6}>
            <Box p={2} bg="blue.100" borderRadius="md">
              <Text color="blue.600">🔑</Text>
            </Box>
            <Heading size="md">API Configuration</Heading>
          </HStack>

          <VStack spacing={4}>
            <FormControl>
              <FormLabel>OpenAI API Key</FormLabel>
              <HStack>
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="Enter OpenAI API key"
                  borderRadius="md"
                />
                <Button
                  onClick={() => verifyApiKey("openai", openaiKey)}
                  isLoading={isLoading}
                  colorScheme="blue"
                  borderRadius="md"
                >
                  Verify
                </Button>
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel>DeepSeek API Key</FormLabel>
              <HStack>
                <Input
                  type="password"
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  placeholder="Enter DeepSeek API key"
                  borderRadius="md"
                />
                <Button
                  onClick={() => verifyApiKey("deepseek", deepseekKey)}
                  isLoading={isLoading}
                  colorScheme="blue"
                  borderRadius="md"
                >
                  Verify
                </Button>
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel>Open WebUI API Key</FormLabel>
              <HStack>
                <Input
                  type="password"
                  value={openwebuiKey}
                  onChange={(e) => setOpenwebuiKey(e.target.value)}
                  placeholder="Enter Open WebUI API key"
                  borderRadius="md"
                />
                <Button
                  onClick={() => verifyApiKey("openwebui", openwebuiKey)}
                  isLoading={isLoading}
                  colorScheme="blue"
                  borderRadius="md"
                >
                  Verify
                </Button>
              </HStack>
            </FormControl>
          </VStack>
        </Box>

        <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
          <HStack spacing={3} mb={6}>
            <Box p={2} bg="green.100" borderRadius="md">
              <Text color="green.600">🤖</Text>
            </Box>
            <Heading size="md">Model Selection</Heading>
          </HStack>

          <VStack spacing={4}>
            <Select
              placeholder="Select models"
              onChange={(e) => {
                const model = availableModels.find(m => m.id === e.target.value);
                if (model && !selectedModels.find(m => m.id === model.id)) {
                  setSelectedModels(prev => [...prev, model]);
                }
              }}
              borderRadius="md"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </Select>
            <Flex wrap="wrap" gap={2}>
              {selectedModels.map((model) => (
                <Tag
                  key={model.id}
                  size="lg"
                  borderRadius="full"
                  variant="subtle"
                  colorScheme="green"
                >
                  <Text>{model.name}</Text>
                  <Button
                    size="xs"
                    ml={2}
                    variant="ghost"
                    colorScheme="green"
                    onClick={() => setSelectedModels(prev => prev.filter(m => m.id !== model.id))}
                  >
                    ×
                  </Button>
                </Tag>
              ))}
            </Flex>
          </VStack>
        </Box>

        <Box p={6} borderRadius="xl" bg="white" boxShadow="sm">
          <HStack spacing={3} mb={6}>
            <Box p={2} bg="orange.100" borderRadius="md">
              <Text color="orange.600">📝</Text>
            </Box>
            <Heading size="md">Questions Database</Heading>
          </HStack>

          <Input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            pt={1}
            borderRadius="md"
          />
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
                  <Th>Question ID</Th>
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
                        <Text color={result.modelResults[model.id] ? "green.500" : "red.500"}>
                          {result.modelResults[model.id] ? "✓" : "✗"}
                        </Text>
                      </Td>
                    ))}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {results.length > 0 && (
          <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
            <Text fontSize="sm" fontWeight="bold" mb={3}>Results</Text>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>ID</Th>
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
                        {result.modelResults[model.id] ? "✓" : "✗"}
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
